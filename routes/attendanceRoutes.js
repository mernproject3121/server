
const express = require("express");

const mongoose = require("mongoose");

const Attendance = require("../models/Attendance");
const User = require("../models/User");
const Timetable = require("../models/Timetable");
const Course = require("../models/Course");

const authMiddleware = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");

const router = express.Router();


// =====================================================
// HELPER FUNCTIONS
// =====================================================

const normalizeText = (value) => {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
};

const normalizeSemester = (value) => {
  const text = String(value || "").trim();

  const match = text.match(/\d+/);

  return match ? match[0] : text;
};


// =====================================================
// GET STUDENTS FOR ATTENDANCE
// Faculty / HOD / Admin
// =====================================================

router.get(
  "/students",
  authMiddleware,
  roleMiddleware("faculty", "hod", "admin"),
  async (req, res) => {
    try {
      const currentUser = await User.findById(
        req.user.id
      ).select("name department role");

      if (!currentUser) {
        return res.status(404).json({
          message: "User not found.",
        });
      }

      const query = {
        role: "student",
      };

      if (
        currentUser.role === "faculty" ||
        currentUser.role === "hod"
      ) {
        query.department = currentUser.department;
      }

      const students = await User.find(query)
        .select("-password")
        .sort({ name: 1 });

      return res.status(200).json(students);

    } catch (error) {
      console.error("Attendance Students Error:", error);

      return res.status(500).json({
        message: error.message,
      });
    }
  }
);


// =====================================================
// GET ALL ATTENDANCE
//
// Student → Own attendance only
// Faculty → Own marked attendance
// HOD → Own department
// Admin → All attendance
// =====================================================

router.get(
  "/",
  authMiddleware,
  roleMiddleware("student", "faculty", "hod", "admin"),
  async (req, res) => {
    try {
      const currentUser = await User.findById(
        req.user.id
      ).select("name department role");

      if (!currentUser) {
        return res.status(404).json({
          message: "User not found.",
        });
      }

      const query = {};

      // STUDENT: Only own attendance
      if (currentUser.role === "student") {
        query.studentId = currentUser._id;
      }

      // FACULTY: Own marked attendance
      if (currentUser.role === "faculty") {
        query.facultyId = currentUser._id;
      }

      // HOD: Own department
      if (currentUser.role === "hod") {
        query.department = currentUser.department;
      }

      // ADMIN: All records

      const attendance = await Attendance.find(query)
        .populate({
          path: "timetableId",
          populate: {
            path: "course",
            select: "name code department semester",
          },
        })
        .sort({
          date: -1,
          createdAt: -1,
        })
        .lean();

      // Add student-friendly field names
      const formattedAttendance = attendance.map((item) => {
        return {
          ...item,

          studentRoll:
            item.studentRoll ||
            item.rollNo ||
            item.enrollmentNo ||
            "",

          studentName:
            item.studentName || "",

          subject:
            item.course ||
            item.timetableId?.course?.name ||
            item.subject ||
            "Unknown Subject",

          attendanceDate:
            item.date ||
            item.createdAt ||
            null,
        };
      });

      return res.status(200).json({
        success: true,
        count: formattedAttendance.length,
        attendance: formattedAttendance,
      });

    } catch (error) {
      console.error("Get Attendance Error:", error);

      return res.status(500).json({
        message: error.message,
      });
    }
  }
);


// =====================================================
// GET ATTENDANCE BY DATE
// Faculty / HOD / Admin
// =====================================================

router.get(
  "/date/:date",
  authMiddleware,
  roleMiddleware("faculty", "hod", "admin"),
  async (req, res) => {
    try {
      const currentUser = await User.findById(
        req.user.id
      ).select("name department role");

      if (!currentUser) {
        return res.status(404).json({
          message: "User not found.",
        });
      }

      const query = {
        date: req.params.date,
      };

      if (currentUser.role === "faculty") {
        query.facultyId = currentUser._id;
      }

      if (currentUser.role === "hod") {
        query.department = currentUser.department;
      }

      const attendance = await Attendance.find(query)
        .populate({
          path: "timetableId",
          populate: {
            path: "course",
            select: "name code department semester",
          },
        })
        .sort({ studentName: 1 });

      return res.status(200).json(attendance);

    } catch (error) {
      console.error("Get Date Attendance Error:", error);

      return res.status(500).json({
        message: error.message,
      });
    }
  }
);


// =====================================================
// GET ATTENDANCE FOR ONE TIMETABLE LECTURE
// Faculty / HOD / Admin
// =====================================================

router.get(
  "/timetable/:timetableId/date/:date",
  authMiddleware,
  roleMiddleware("faculty", "hod", "admin"),
  async (req, res) => {
    try {
      const { timetableId, date } = req.params;

      if (!mongoose.isValidObjectId(timetableId)) {
        return res.status(400).json({
          message: "Invalid timetable ID.",
        });
      }

      const timetable = await Timetable.findById(
        timetableId
      )
        .populate({
          path: "course",
          select: "name code department semester",
        })
        .populate({
          path: "faculty",
          select: "name email department designation",
        });

      if (!timetable) {
        return res.status(404).json({
          message: "Timetable lecture not found.",
        });
      }

      if (
        req.user.role === "faculty" &&
        String(timetable.faculty?._id) !== String(req.user.id)
      ) {
        return res.status(403).json({
          message: "You are not allowed to access this lecture.",
        });
      }

      if (
        req.user.role === "hod" &&
        normalizeText(
          timetable.course?.department || timetable.department
        ) !== normalizeText(req.user.department)
      ) {
        return res.status(403).json({
          message: "You are not allowed to access this department.",
        });
      }

      const attendance = await Attendance.find({
        timetableId: timetable._id,
        date,
      }).sort({ studentName: 1 });

      return res.status(200).json({
        timetable,
        attendance,
      });

    } catch (error) {
      console.error("Get Timetable Attendance Error:", error);

      return res.status(500).json({
        message: error.message,
      });
    }
  }
);


// =====================================================
// GET SUBJECT-WISE ATTENDANCE SUMMARY
// Faculty only
// =====================================================

router.get(
  "/subject/:courseId/summary",
  authMiddleware,
  roleMiddleware("faculty"),
  async (req, res) => {
    try {
      const { courseId } = req.params;

      const requestedDepartment = req.query.department || "";
      const requestedSemester = req.query.semester || "";
      const requestedDate = req.query.date || "";
      const requestedTimetableId = req.query.timetableId || "";

      // FACULTY

      const faculty = await User.findOne({
        _id: req.user.id,
        role: "faculty",
      }).select("name department role");

      if (!faculty) {
        return res.status(404).json({
          message: "Faculty not found.",
        });
      }

      // COURSE

      if (!mongoose.isValidObjectId(courseId)) {
        return res.status(400).json({
          message: "Invalid course ID.",
        });
      }

      const course = await Course.findById(
        courseId
      ).select("name code department semester faculty");

      if (!course) {
        return res.status(404).json({
          message: "Course not found.",
        });
      }

      // COURSE OWNERSHIP

      if (
        course.faculty &&
        String(course.faculty) !== String(faculty._id)
      ) {
        return res.status(403).json({
          message: "This course is not assigned to you.",
        });
      }

      const courseDepartment = String(
        course.department ||
        requestedDepartment ||
        faculty.department ||
        ""
      ).trim();

      const courseSemester = normalizeSemester(
        course.semester || requestedSemester || ""
      );

      // DEPARTMENT SECURITY

      if (
        faculty.department &&
        normalizeText(faculty.department) !==
        normalizeText(courseDepartment)
      ) {
        return res.status(403).json({
          message: "This subject does not belong to your department.",
        });
      }

      // FACULTY TIMETABLES

      const allTimetables = await Timetable.find({
        faculty: faculty._id,
        course: course._id,
      })
        .populate({
          path: "course",
          select: "name code department semester",
        })
        .sort({
          day: 1,
          startTime: 1,
        });

      const timetables = allTimetables.filter((item) => {
        const timetableDepartment =
          item.course?.department || item.department || "";

        const timetableSemester = normalizeSemester(
          item.course?.semester || item.semester || ""
        );

        return (
          normalizeText(timetableDepartment) ===
            normalizeText(courseDepartment) &&
          timetableSemester === courseSemester
        );
      });

      const timetableIds = timetables.map(
        (item) => item._id
      );

      // TODAY DATE

      const now = new Date();

      const localDate = new Date(
        now.getTime() -
        now.getTimezoneOffset() * 60000
      );

      const localToday = localDate
        .toISOString()
        .split("T")[0];

      const today = requestedDate || localToday;

      // ATTENDANCE

      let attendance = [];

      if (timetableIds.length > 0) {
        attendance = await Attendance.find({
          facultyId: faculty._id,

          timetableId: {
            $in: timetableIds,
          },

          department: courseDepartment,

          $or: [
            { semester: courseSemester },
            { semester: `Semester ${courseSemester}` },
          ],
        }).sort({
          date: 1,
          createdAt: 1,
        });
      }

      // STUDENTS

      const allStudents = await User.find({
        role: "student",
        department: courseDepartment,
      })
        .select(
          "_id name studentId enrollmentNo course semester department"
        )
        .sort({ name: 1 })
        .lean();

      const students = allStudents.filter((student) => {
        return (
          normalizeSemester(student.semester) ===
          courseSemester
        );
      });

      // CONDUCTED LECTURES

      const conductedLectureSet = new Set();

      attendance.forEach((record) => {
        conductedLectureSet.add(
          `${String(record.timetableId)}_${record.date}`
        );
      });

      const conductedLectures = conductedLectureSet.size;

      // TODAY ATTENDANCE

      const todayAttendance = attendance.filter(
        (record) => record.date === today
      );

      const todayLectureSet = new Set();

      todayAttendance.forEach((record) => {
        todayLectureSet.add(String(record.timetableId));
      });

      const todayConductedLectures = todayLectureSet.size;

      // TODAY SCHEDULE

      const todayDateObject = new Date(`${today}T00:00:00`);

      const todayDayName = todayDateObject.toLocaleDateString(
        "en-US",
        { weekday: "long" }
      );

      const todayScheduledLectures = timetables.filter(
        (item) => item.day === todayDayName
      ).length;

      // SELECTED LECTURE STATUS

      let selectedTodayConducted = 0;

      if (requestedTimetableId) {
        const selectedLectureRecords = attendance.filter(
          (record) =>
            record.date === today &&
            String(record.timetableId) ===
              String(requestedTimetableId)
        );

        if (selectedLectureRecords.length > 0) {
          selectedTodayConducted = 1;
        }
      }

      // OVERALL COUNTS

      let totalPresent = 0;
      let totalAbsent = 0;
      let totalLate = 0;

      attendance.forEach((record) => {
        const status = normalizeText(record.status);

        if (status === "present") totalPresent++;
        if (status === "absent") totalAbsent++;
        if (status === "late") totalLate++;
      });

      // STUDENT SUMMARY

      const studentSummary = students.map((student) => {
        const studentAttendance = attendance.filter(
          (record) =>
            String(record.studentId) === String(student._id)
        );

        let present = 0;
        let absent = 0;
        let late = 0;

        studentAttendance.forEach((record) => {
          const status = normalizeText(record.status);

          if (status === "present") present++;
          if (status === "absent") absent++;
          if (status === "late") late++;
        });

        const total = studentAttendance.length;
        const attended = present + late;

        const percentage =
          total > 0
            ? Number(((attended / total) * 100).toFixed(1))
            : 0;

        // TODAY STATUS

        let todayStatus = "Not Marked";

        if (requestedTimetableId) {
          const selectedTodayRecord = studentAttendance.find(
            (record) =>
              record.date === today &&
              String(record.timetableId) ===
                String(requestedTimetableId)
          );

          if (selectedTodayRecord) {
            todayStatus = selectedTodayRecord.status;
          }
        } else {
          const todayRecords = studentAttendance.filter(
            (record) => record.date === today
          );

          if (todayRecords.length > 0) {
            todayStatus =
              todayRecords[todayRecords.length - 1].status;
          }
        }

        return {
          _id: student._id,
          name: student.name,

          studentId:
            student.studentId ||
            student.enrollmentNo ||
            "",

          enrollmentNo:
            student.enrollmentNo ||
            student.studentId ||
            "",

          course: course.name,
          semester: student.semester,
          department: student.department,

          totalLectures: total,
          total,
          present,
          absent,
          late,
          percentage,
          todayStatus,
        };
      });

      return res.status(200).json({
        course: {
          _id: course._id,
          name: course.name,
          code: course.code,
          department: courseDepartment,
          semester: courseSemester,
        },

        scheduledLectures: timetables.length,
        conductedLectures,
        todayLectures: todayScheduledLectures,
        todayConductedLectures,
        selectedTodayConducted,

        totalPresent,
        totalAbsent,
        totalLate,

        totalStudents: students.length,
        students: studentSummary,
      });

    } catch (error) {
      console.error("Subject Attendance Summary Error:", error);

      return res.status(500).json({
        message:
          error.message ||
          "Unable to load subject attendance summary.",
      });
    }
  }
);


// =====================================================
// SAVE / UPDATE ATTENDANCE
// Faculty only
// =====================================================

router.post(
  "/",
  authMiddleware,
  roleMiddleware("faculty"),
  async (req, res) => {
    try {
      const {
        date,
        timetableId,
        students,
      } = req.body;

      // VALIDATION

      if (!date) {
        return res.status(400).json({
          message: "Attendance date is required.",
        });
      }

      if (!timetableId) {
        return res.status(400).json({
          message: "Timetable lecture is required.",
        });
      }

      if (!mongoose.isValidObjectId(timetableId)) {
        return res.status(400).json({
          message: "Invalid timetable ID.",
        });
      }

      if (
        !Array.isArray(students) ||
        students.length === 0
      ) {
        return res.status(400).json({
          message: "Student attendance is required.",
        });
      }

      // FACULTY

      const faculty = await User.findOne({
        _id: req.user.id,
        role: "faculty",
      });

      if (!faculty) {
        return res.status(404).json({
          message: "Faculty not found.",
        });
      }

      // TIMETABLE

      const timetable = await Timetable.findById(
        timetableId
      ).populate({
        path: "course",
        select: "name code department semester",
      });

      if (!timetable) {
        return res.status(404).json({
          message: "Timetable lecture not found.",
        });
      }

      // FACULTY OWNERSHIP

      if (
        String(timetable.faculty) !==
        String(faculty._id)
      ) {
        return res.status(403).json({
          message: "This lecture is not assigned to you.",
        });
      }

      // COURSE DETAILS

      const timetableDepartment =
        timetable.course?.department ||
        timetable.department ||
        "";

      const timetableSemester =
        timetable.course?.semester ||
        timetable.semester ||
        "";

      // FACULTY DEPARTMENT

      if (
        faculty.department &&
        normalizeText(faculty.department) !==
        normalizeText(timetableDepartment)
      ) {
        return res.status(403).json({
          message:
            "This lecture does not belong to your department.",
        });
      }

      // SAVE RECORDS

      const savedRecords = [];

      const allowedStatuses = [
        "Present",
        "Absent",
        "Late",
      ];

      for (const item of students) {
        if (!item.studentId) {
          continue;
        }

        if (!mongoose.isValidObjectId(item.studentId)) {
          continue;
        }

        // STUDENT

        const student = await User.findOne({
          _id: item.studentId,
          role: "student",
        });

        if (!student) {
          continue;
        }

        // DEPARTMENT CHECK

        if (
          normalizeText(student.department) !==
          normalizeText(timetableDepartment)
        ) {
          continue;
        }

        // SEMESTER CHECK

        if (
          normalizeSemester(student.semester) !==
          normalizeSemester(timetableSemester)
        ) {
          continue;
        }

        // STATUS VALIDATION

        const status = allowedStatuses.includes(item.status)
          ? item.status
          : "Present";

        // UPSERT
        // Same student + date + timetable = one record

        const record = await Attendance.findOneAndUpdate(
          {
            studentId: student._id,
            date,
            timetableId: timetable._id,
          },
          {
            $set: {
              studentId: student._id,
              studentName: student.name,

              facultyId: faculty._id,
              facultyName: faculty.name,

              timetableId: timetable._id,

              department: timetableDepartment,

              course: timetable.course?.name || "",

              semester: timetableSemester || "",

              date,
              status,
            },
          },
          {
            new: true,
            upsert: true,
            setDefaultsOnInsert: true,
            runValidators: true,
          }
        );

        savedRecords.push(record);
      }

      return res.status(200).json({
        success: true,
        message: "Attendance saved successfully.",
        count: savedRecords.length,
        timetableId: timetable._id,
        attendance: savedRecords,
      });

    } catch (error) {
      console.error("Save Attendance Error:", error);

      return res.status(500).json({
        message: error.message,
      });
    }
  }
);


// =====================================================
// DELETE ATTENDANCE
// Faculty / Admin
// =====================================================

router.delete(
  "/:id",
  authMiddleware,
  roleMiddleware("faculty", "admin"),
  async (req, res) => {
    try {
      if (!mongoose.isValidObjectId(req.params.id)) {
        return res.status(400).json({
          message: "Invalid attendance ID.",
        });
      }

      const query = {
        _id: req.params.id,
      };

      // FACULTY → Own records only

      if (req.user.role === "faculty") {
        query.facultyId = req.user.id;
      }

      const attendance = await Attendance.findOne(query);

      if (!attendance) {
        return res.status(404).json({
          message: "Attendance record not found.",
        });
      }

      await Attendance.findByIdAndDelete(req.params.id);

      return res.status(200).json({
        success: true,
        message: "Attendance deleted successfully.",
      });

    } catch (error) {
      console.error("Delete Attendance Error:", error);

      return res.status(500).json({
        message: error.message,
      });
    }
  }
);


module.exports = router;
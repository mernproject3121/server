const express = require("express");
const router = express.Router();

const Timetable = require("../models/Timetable");
const Course = require("../models/Course");
const User = require("../models/User");

const authMiddleware = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");

// =====================================================
// HELPERS
// =====================================================

const normalize = (value) => {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
};

// "Semester 7" -> "7"
// "7" -> "7"
const normalizeSemester = (value) => {
  const text = normalize(value);

  const match = text.match(/\d+/);

  return match ? match[0] : text;
};

// =====================================================
// DEPARTMENT MATCH HELPER
// =====================================================
//
// Course.department = Department ObjectId
// Course.departmentCode = String
//
// Selected department from frontend may be:
// - Department _id
// - Department name
// - Department code
// - Course departmentCode
//
// So we support all of them.
// =====================================================

const departmentMatches = (
  selectedDepartment,
  course
) => {
  const selected = normalize(selectedDepartment);

  if (!selected || !course) {
    return false;
  }

  // -----------------------------------------------
  // Course.department can be populated object
  // -----------------------------------------------

  const departmentObject =
    course.department &&
    typeof course.department === "object"
      ? course.department
      : null;

  const departmentId = departmentObject?._id
    ? departmentObject._id.toString()
    : course.department
    ? course.department.toString()
    : "";

  const departmentName =
    departmentObject?.name || "";

  const departmentCode =
    departmentObject?.code || "";

  const courseDepartmentCode =
    course.departmentCode || "";

  // -----------------------------------------------
  // COMPARE ALL POSSIBLE VALUES
  // -----------------------------------------------

  return (
    selected === normalize(departmentId) ||
    selected === normalize(departmentName) ||
    selected === normalize(departmentCode) ||
    selected === normalize(courseDepartmentCode)
  );
};

// =====================================================
// FACULTY DEPARTMENT MATCH
// =====================================================

const facultyDepartmentMatches = (
  selectedDepartment,
  faculty
) => {
  // If faculty has no department assigned,
  // don't block timetable creation.
  if (!faculty?.department) {
    return true;
  }

  const selected = normalize(selectedDepartment);

  const facultyDepartment =
    faculty.department;

  // -----------------------------------------------
  // If department is populated object
  // -----------------------------------------------

  if (
    typeof facultyDepartment === "object" &&
    facultyDepartment !== null
  ) {
    const id =
      facultyDepartment._id?.toString() || "";

    const name =
      facultyDepartment.name || "";

    const code =
      facultyDepartment.code || "";

    return (
      selected === normalize(id) ||
      selected === normalize(name) ||
      selected === normalize(code)
    );
  }

  // -----------------------------------------------
  // If department is string/ObjectId
  // -----------------------------------------------

  return (
    selected === normalize(facultyDepartment)
  );
};

// =====================================================
// COURSE POPULATE
// =====================================================

const coursePopulate = {
  path: "course",
  select:
    "name courseCode subjectCode department departmentCode semester subjectType credits faculty status",
  populate: {
    path: "department",
    select: "name code",
  },
};

// =====================================================
// FACULTY POPULATE
// =====================================================

const facultyPopulate = {
  path: "faculty",
  select:
    "name email facultyId department designation",
};

// =====================================================
// GET ALL TIMETABLE
// ADMIN / HOD / FACULTY
// =====================================================

router.get(
  "/",
  authMiddleware,
  roleMiddleware(
    "admin",
    "hod",
    "faculty"
  ),
  async (req, res) => {
    try {
      const timetable =
        await Timetable.find()
          .populate(coursePopulate)
          .populate(facultyPopulate)
          .populate(
            "replacementFaculty",
            "name email facultyId department designation"
          )
          .sort({
            day: 1,
            startTime: 1,
            createdAt: 1,
          });

      res.json(timetable);
    } catch (error) {
      console.error(
        "Get All Timetable Error:",
        error
      );

      res.status(500).json({
        message: error.message,
      });
    }
  }
);

// =====================================================
// GET FACULTY TIMETABLE
// =====================================================

router.get(
  "/faculty",
  authMiddleware,
  roleMiddleware("faculty"),
  async (req, res) => {
    try {
      const facultyId = req.user.id;

      const faculty =
        await User.findOne({
          _id: facultyId,
          role: "faculty",
        }).select(
          "_id name email facultyId department designation"
        );

      if (!faculty) {
        return res.status(404).json({
          message:
            "Faculty profile not found.",
        });
      }

      const timetable =
        await Timetable.find({
          faculty: faculty._id,
        })
          .populate(coursePopulate)
          .populate(facultyPopulate)
          .populate(
            "replacementFaculty",
            "name email facultyId department designation"
          )
          .sort({
            day: 1,
            startTime: 1,
            createdAt: 1,
          });

      console.log(
        "========================================"
      );

      console.log(
        "FACULTY TIMETABLE REQUEST"
      );

      console.log(
        "Faculty Name:",
        faculty.name
      );

      console.log(
        "Faculty ID:",
        faculty._id.toString()
      );

      console.log(
        "Total Assigned Lectures:",
        timetable.length
      );

      timetable.forEach(
        (item, index) => {
          console.log(
            `Lecture ${index + 1}:`,
            item.course?.name,
            "| Course Code:",
            item.course?.courseCode,
            "| Subject Code:",
            item.course?.subjectCode,
            "| Day:",
            item.day,
            "| Time:",
            item.startTime,
            "-",
            item.endTime,
            "| Room:",
            item.room,
            "| Department:",
            item.department,
            "| Semester:",
            item.semester,
            "| Timetable ID:",
            item._id.toString()
          );
        }
      );

      console.log(
        "========================================"
      );

      res.json(timetable);
    } catch (error) {
      console.error(
        "Faculty Timetable Error:",
        error
      );

      res.status(500).json({
        message: error.message,
      });
    }
  }
);

// =====================================================
// GET STUDENT TIMETABLE
// =====================================================

router.get(
  "/student",
  authMiddleware,
  roleMiddleware("student"),
  async (req, res) => {
    try {
      const studentId = req.user.id;

      const student =
        await User.findOne({
          _id: studentId,
          role: "student",
        }).select(
          "name email department course semester studentId"
        );

      if (!student) {
        return res.status(404).json({
          message:
            "Student profile not found.",
        });
      }

      if (!student.department) {
        return res.status(400).json({
          message:
            "Student department is not assigned.",
        });
      }

      if (!student.semester) {
        return res.status(400).json({
          message:
            "Student semester is not assigned.",
        });
      }

      const studentDepartment =
        normalize(student.department);

      const studentSemester =
        normalizeSemester(student.semester);

      const allTimetable =
        await Timetable.find()
          .populate(coursePopulate)
          .populate(facultyPopulate)
          .populate(
            "replacementFaculty",
            "name email facultyId department designation"
          )
          .sort({
            day: 1,
            startTime: 1,
            createdAt: 1,
          });

      const studentTimetable =
        allTimetable.filter((item) => {
          const course = item.course;

          if (!course) {
            return false;
          }

          // -----------------------------------------
          // COURSE DEPARTMENT
          // -----------------------------------------

          const courseDepartment =
            course.department;

          const courseDepartmentId =
            courseDepartment?._id
              ? courseDepartment._id.toString()
              : courseDepartment
              ? courseDepartment.toString()
              : "";

          const courseDepartmentName =
            courseDepartment?.name || "";

          const courseDepartmentCode =
            courseDepartment?.code || "";

          const courseStoredDepartmentCode =
            course.departmentCode || "";

          const departmentMatch =
            studentDepartment ===
              normalize(courseDepartmentId) ||
            studentDepartment ===
              normalize(courseDepartmentName) ||
            studentDepartment ===
              normalize(courseDepartmentCode) ||
            studentDepartment ===
              normalize(courseStoredDepartmentCode) ||
            studentDepartment ===
              normalize(item.department);

          // -----------------------------------------
          // SEMESTER
          // -----------------------------------------

          const courseSemester =
            normalizeSemester(
              course.semester
            );

          const timetableSemester =
            normalizeSemester(
              item.semester
            );

          const semesterMatch =
            studentSemester ===
              courseSemester ||
            studentSemester ===
              timetableSemester;

          return (
            departmentMatch &&
            semesterMatch
          );
        });

      console.log(
        "========================================"
      );

      console.log(
        "STUDENT TIMETABLE REQUEST"
      );

      console.log(
        "Student Name:",
        student.name
      );

      console.log(
        "Student ID:",
        student.studentId
      );

      console.log(
        "Student Course:",
        student.course
      );

      console.log(
        "Student Department:",
        student.department
      );

      console.log(
        "Student Semester:",
        student.semester
      );

      console.log(
        "Normalized Department:",
        studentDepartment
      );

      console.log(
        "Normalized Semester:",
        studentSemester
      );

      console.log(
        "Total Timetable:",
        allTimetable.length
      );

      console.log(
        "Student Timetable:",
        studentTimetable.length
      );

      console.log(
        "========================================"
      );

      res.json({
        student: {
          id: student._id,
          name: student.name,
          email: student.email,
          studentId: student.studentId,
          department:
            student.department,
          course: student.course,
          semester: student.semester,
        },

        timetable:
          studentTimetable,
      });
    } catch (error) {
      console.error(
        "Student Timetable Error:",
        error
      );

      res.status(500).json({
        message: error.message,
      });
    }
  }
);

// =====================================================
// GET HOD TIMETABLE
// =====================================================

router.get(
  "/hod",
  authMiddleware,
  roleMiddleware("hod"),
  async (req, res) => {
    try {
      const hodId = req.user.id;

      const hod =
        await User.findOne({
          _id: hodId,
          role: "hod",
        }).select(
          "name email department designation"
        );

      if (!hod) {
        return res.status(404).json({
          message:
            "HOD profile not found.",
        });
      }

      if (!hod.department) {
        return res.status(400).json({
          message:
            "HOD department is not assigned.",
        });
      }

      const hodDepartment =
        normalize(hod.department);

      const allTimetable =
        await Timetable.find()
          .populate(coursePopulate)
          .populate(facultyPopulate)
          .populate(
            "replacementFaculty",
            "name email facultyId department designation"
          )
          .sort({
            day: 1,
            startTime: 1,
            createdAt: 1,
          });

      const departmentTimetable =
        allTimetable.filter((item) => {
          const course = item.course;

          if (!course) {
            return false;
          }

          return (
            departmentMatches(
              hodDepartment,
              course
            ) ||
            hodDepartment ===
              normalize(item.department)
          );
        });

      res.json({
        hod: {
          id: hod._id,
          name: hod.name,
          email: hod.email,
          department:
            hod.department,
          designation:
            hod.designation,
        },

        timetable:
          departmentTimetable,
      });
    } catch (error) {
      console.error(
        "HOD Timetable Error:",
        error
      );

      res.status(500).json({
        message: error.message,
      });
    }
  }
);

// =====================================================
// GET SINGLE TIMETABLE
// =====================================================

router.get(
  "/:id",
  authMiddleware,
  roleMiddleware(
    "admin",
    "hod",
    "faculty"
  ),
  async (req, res) => {
    try {
      const timetable =
        await Timetable.findById(
          req.params.id
        )
          .populate(coursePopulate)
          .populate(facultyPopulate)
          .populate(
            "replacementFaculty",
            "name email facultyId department designation"
          );

      if (!timetable) {
        return res.status(404).json({
          message:
            "Timetable not found.",
        });
      }

      res.json(timetable);
    } catch (error) {
      console.error(
        "Get Single Timetable Error:",
        error
      );

      res.status(400).json({
        message: error.message,
      });
    }
  }
);

// =====================================================
// CREATE TIMETABLE
// ADMIN ONLY
// =====================================================

router.post(
  "/",
  authMiddleware,
  roleMiddleware("admin"),
  async (req, res) => {
    try {
      const {
        day,
        startTime,
        endTime,
        course,
        faculty,
        department,
        semester,
        academicYear,
        room,
        type,
        weeklyLectures,
        credits,
        notes,
      } = req.body;

      // -----------------------------------------------
      // REQUIRED FIELDS
      // -----------------------------------------------

      if (
        !day ||
        !startTime ||
        !endTime ||
        !course ||
        !faculty ||
        !department ||
        !semester ||
        !academicYear ||
        !room
      ) {
        return res.status(400).json({
          message:
            "All timetable fields are required.",
        });
      }

      // -----------------------------------------------
      // TIME VALIDATION
      // -----------------------------------------------

      if (startTime >= endTime) {
        return res.status(400).json({
          message:
            "End time must be greater than start time.",
        });
      }

      // -----------------------------------------------
      // GET COURSE
      // -----------------------------------------------

      const courseExists =
        await Course.findById(course).populate(
          "department",
          "name code"
        );

      if (!courseExists) {
        return res.status(404).json({
          message:
            "Selected course not found.",
        });
      }

      // -----------------------------------------------
      // GET FACULTY
      // -----------------------------------------------

      const facultyExists =
        await User.findOne({
          _id: faculty,
          role: "faculty",
        });

      if (!facultyExists) {
        return res.status(404).json({
          message:
            "Selected faculty not found.",
        });
      }

      // -----------------------------------------------
      // CLEAN VALUES
      // -----------------------------------------------

      const cleanDepartment =
        String(department).trim();

      const cleanSemester =
        normalizeSemester(semester);

      const cleanRoom =
        String(room).trim();

      const cleanAcademicYear =
        String(academicYear).trim();

      // -----------------------------------------------
      // COURSE DEPARTMENT CHECK
      // -----------------------------------------------

      const courseBelongsToDepartment =
        departmentMatches(
          cleanDepartment,
          courseExists
        );

      if (!courseBelongsToDepartment) {
        return res.status(400).json({
          message:
            "Selected course does not belong to this department.",

          debug: {
            selectedDepartment:
              cleanDepartment,

            courseDepartmentId:
              courseExists.department?._id?.toString() ||
              "",

            courseDepartmentName:
              courseExists.department?.name ||
              "",

            courseDepartmentCode:
              courseExists.department?.code ||
              "",

            courseDepartmentCodeSaved:
              courseExists.departmentCode ||
              "",
          },
        });
      }

      // -----------------------------------------------
      // COURSE SEMESTER CHECK
      // -----------------------------------------------

      const courseSemester =
        normalizeSemester(
          courseExists.semester
        );

      if (
        courseSemester !==
        cleanSemester
      ) {
        return res.status(400).json({
          message:
            "Selected course does not belong to this semester.",

          debug: {
            courseSemester,
            selectedSemester:
              cleanSemester,
          },
        });
      }

      // -----------------------------------------------
      // FACULTY DEPARTMENT CHECK
      // -----------------------------------------------

      if (
        !facultyDepartmentMatches(
          cleanDepartment,
          facultyExists
        )
      ) {
        return res.status(400).json({
          message:
            "Selected faculty does not belong to this department.",
        });
      }

      // -----------------------------------------------
      // SAME DAY + ACADEMIC YEAR
      // -----------------------------------------------

      const existingEntries =
        await Timetable.find({
          day,
          academicYear:
            cleanAcademicYear,
        });

      // -----------------------------------------------
      // CONFLICT CHECK
      // -----------------------------------------------

      for (
        const existing
        of existingEntries
      ) {
        const timeOverlap =
          startTime <
            existing.endTime &&
          endTime >
            existing.startTime;

        if (!timeOverlap) {
          continue;
        }

        // -------------------------------------------
        // FACULTY CONFLICT
        // -------------------------------------------

        if (
          existing.faculty.toString() ===
          faculty.toString()
        ) {
          return res.status(400).json({
            message:
              "Faculty already has a class at this time.",
          });
        }

        // -------------------------------------------
        // ROOM CONFLICT
        // -------------------------------------------

        if (
          normalize(existing.room) ===
          normalize(cleanRoom)
        ) {
          return res.status(400).json({
            message:
              "This room is already occupied at this time.",
          });
        }

        // -------------------------------------------
        // DEPARTMENT + SEMESTER CONFLICT
        // -------------------------------------------

        if (
          normalize(
            existing.department
          ) ===
            normalize(
              cleanDepartment
            ) &&
          normalizeSemester(
            existing.semester
          ) === cleanSemester
        ) {
          return res.status(400).json({
            message:
              "This department and semester already have a class at this time.",
          });
        }
      }

      // -----------------------------------------------
      // CREATE TIMETABLE
      // -----------------------------------------------

      const timetable =
        await Timetable.create({
          day,
          startTime,
          endTime,

          course,

          faculty,

          department:
            cleanDepartment,

          semester:
            cleanSemester,

          academicYear:
            cleanAcademicYear,

          room:
            cleanRoom,

          type:
            type || "Lecture",

          weeklyLectures:
            Number(weeklyLectures) || 1,

          credits:
            Number(credits) ||
            Number(courseExists.credits) ||
            1,

          notes:
            notes || "",
        });

      // -----------------------------------------------
      // POPULATE RESULT
      // -----------------------------------------------

      const result =
        await Timetable.findById(
          timetable._id
        )
          .populate(coursePopulate)
          .populate(facultyPopulate)
          .populate(
            "replacementFaculty",
            "name email facultyId department designation"
          );

      res.status(201).json({
        message:
          "Timetable created successfully.",

        timetable: result,
      });
    } catch (error) {
      console.error(
        "Create Timetable Error:",
        error
      );

      res.status(400).json({
        message: error.message,
      });
    }
  }
);

// =====================================================
// UPDATE TIMETABLE
// ADMIN ONLY
// =====================================================

router.put(
  "/:id",
  authMiddleware,
  roleMiddleware("admin"),
  async (req, res) => {
    try {
      const {
        day,
        startTime,
        endTime,
        course,
        faculty,
        department,
        semester,
        academicYear,
        room,
        type,
        weeklyLectures,
        credits,
        notes,
        status,
        replacementFaculty,
      } = req.body;

      // -----------------------------------------------
      // FIND TIMETABLE
      // -----------------------------------------------

      const timetable =
        await Timetable.findById(
          req.params.id
        );

      if (!timetable) {
        return res.status(404).json({
          message:
            "Timetable not found.",
        });
      }

      // -----------------------------------------------
      // REQUIRED FIELDS
      // -----------------------------------------------

      if (
        !day ||
        !startTime ||
        !endTime ||
        !course ||
        !faculty ||
        !department ||
        !semester ||
        !academicYear ||
        !room
      ) {
        return res.status(400).json({
          message:
            "All timetable fields are required.",
        });
      }

      // -----------------------------------------------
      // TIME VALIDATION
      // -----------------------------------------------

      if (startTime >= endTime) {
        return res.status(400).json({
          message:
            "End time must be greater than start time.",
        });
      }

      // -----------------------------------------------
      // GET COURSE
      // -----------------------------------------------

      const courseExists =
        await Course.findById(course).populate(
          "department",
          "name code"
        );

      if (!courseExists) {
        return res.status(404).json({
          message:
            "Selected course not found.",
        });
      }

      // -----------------------------------------------
      // GET FACULTY
      // -----------------------------------------------

      const facultyExists =
        await User.findOne({
          _id: faculty,
          role: "faculty",
        });

      if (!facultyExists) {
        return res.status(404).json({
          message:
            "Selected faculty not found.",
        });
      }

      // -----------------------------------------------
      // CLEAN VALUES
      // -----------------------------------------------

      const cleanDepartment =
        String(department).trim();

      const cleanSemester =
        normalizeSemester(semester);

      const cleanRoom =
        String(room).trim();

      const cleanAcademicYear =
        String(academicYear).trim();

      // -----------------------------------------------
      // COURSE DEPARTMENT CHECK
      // -----------------------------------------------

      const courseBelongsToDepartment =
        departmentMatches(
          cleanDepartment,
          courseExists
        );

      if (!courseBelongsToDepartment) {
        return res.status(400).json({
          message:
            "Selected course does not belong to this department.",

          debug: {
            selectedDepartment:
              cleanDepartment,

            courseDepartmentId:
              courseExists.department?._id?.toString() ||
              "",

            courseDepartmentName:
              courseExists.department?.name ||
              "",

            courseDepartmentCode:
              courseExists.department?.code ||
              "",

            courseDepartmentCodeSaved:
              courseExists.departmentCode ||
              "",
          },
        });
      }

      // -----------------------------------------------
      // COURSE SEMESTER CHECK
      // -----------------------------------------------

      const courseSemester =
        normalizeSemester(
          courseExists.semester
        );

      if (
        courseSemester !==
        cleanSemester
      ) {
        return res.status(400).json({
          message:
            "Selected course does not belong to this semester.",

          debug: {
            courseSemester,
            selectedSemester:
              cleanSemester,
          },
        });
      }

      // -----------------------------------------------
      // FACULTY DEPARTMENT CHECK
      // -----------------------------------------------

      if (
        !facultyDepartmentMatches(
          cleanDepartment,
          facultyExists
        )
      ) {
        return res.status(400).json({
          message:
            "Selected faculty does not belong to this department.",
        });
      }

      // -----------------------------------------------
      // GET OTHER ENTRIES
      // -----------------------------------------------

      const existingEntries =
        await Timetable.find({
          _id: {
            $ne: req.params.id,
          },

          day,

          academicYear:
            cleanAcademicYear,
        });

      // -----------------------------------------------
      // CONFLICT CHECK
      // -----------------------------------------------

      for (
        const existing
        of existingEntries
      ) {
        const timeOverlap =
          startTime <
            existing.endTime &&
          endTime >
            existing.startTime;

        if (!timeOverlap) {
          continue;
        }

        // Faculty conflict
        if (
          existing.faculty.toString() ===
          faculty.toString()
        ) {
          return res.status(400).json({
            message:
              "Faculty already has a class at this time.",
          });
        }

        // Room conflict
        if (
          normalize(existing.room) ===
          normalize(cleanRoom)
        ) {
          return res.status(400).json({
            message:
              "This room is already occupied at this time.",
          });
        }

        // Department + semester conflict
        if (
          normalize(
            existing.department
          ) ===
            normalize(
              cleanDepartment
            ) &&
          normalizeSemester(
            existing.semester
          ) === cleanSemester
        ) {
          return res.status(400).json({
            message:
              "This department and semester already have a class at this time.",
          });
        }
      }

      // -----------------------------------------------
      // UPDATE
      // -----------------------------------------------

      timetable.day =
        day;

      timetable.startTime =
        startTime;

      timetable.endTime =
        endTime;

      timetable.course =
        course;

      timetable.faculty =
        faculty;

      timetable.department =
        cleanDepartment;

      timetable.semester =
        cleanSemester;

      timetable.academicYear =
        cleanAcademicYear;

      timetable.room =
        cleanRoom;

      timetable.type =
        type || "Lecture";

      if (
        weeklyLectures !==
        undefined
      ) {
        timetable.weeklyLectures =
          Number(
            weeklyLectures
          );
      }

      if (
        credits !==
        undefined
      ) {
        timetable.credits =
          Number(credits);
      }

      if (
        notes !==
        undefined
      ) {
        timetable.notes =
          notes;
      }

      if (
        status !==
        undefined
      ) {
        timetable.status =
          status;
      }

      if (
        replacementFaculty !==
        undefined
      ) {
        timetable.replacementFaculty =
          replacementFaculty ||
          null;
      }

      await timetable.save();

      // -----------------------------------------------
      // POPULATE RESULT
      // -----------------------------------------------

      const result =
        await Timetable.findById(
          timetable._id
        )
          .populate(coursePopulate)
          .populate(facultyPopulate)
          .populate(
            "replacementFaculty",
            "name email facultyId department designation"
          );

      res.json({
        message:
          "Timetable updated successfully.",

        timetable: result,
      });
    } catch (error) {
      console.error(
        "Update Timetable Error:",
        error
      );

      res.status(400).json({
        message: error.message,
      });
    }
  }
);

// =====================================================
// DELETE TIMETABLE
// ADMIN ONLY
// =====================================================

router.delete(
  "/:id",
  authMiddleware,
  roleMiddleware("admin"),
  async (req, res) => {
    try {
      const timetable =
        await Timetable.findByIdAndDelete(
          req.params.id
        );

      if (!timetable) {
        return res.status(404).json({
          message:
            "Timetable not found.",
        });
      }

      res.json({
        message:
          "Timetable deleted successfully.",
      });
    } catch (error) {
      console.error(
        "Delete Timetable Error:",
        error
      );

      res.status(400).json({
        message: error.message,
      });
    }
  }
);

// =====================================================
// EXPORT
// =====================================================

module.exports = router;
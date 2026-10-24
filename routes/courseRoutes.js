const express = require("express");
const mongoose = require("mongoose");

const router = express.Router();

const Course = require("../models/Course");
const User = require("../models/User");
const Student = require("../models/Student");
const Department = require("../models/Department");

const authMiddleware = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");

// ======================================================
// HELPER - CHECK OBJECT ID
// ======================================================

const isValidObjectId = (id) => {
  return mongoose.Types.ObjectId.isValid(id);
};

// ======================================================
// HELPER - CHECK SEMESTER
// ======================================================

const isValidSemester = (semester) => {
  const value = String(semester).trim();

  return ["1", "2", "3", "4", "5", "6", "7", "8"].includes(
    value
  );
};

// ======================================================
// HELPER - CHECK CREDITS
// ======================================================

const isValidCredits = (credits) => {
  const value = Number(credits);

  return Number.isInteger(value) && value >= 1 && value <= 20;
};

// ======================================================
// HELPER - CHECK SUBJECT TYPE
// ======================================================

const isValidSubjectType = (subjectType) => {
  return ["Theory", "Practical", "Both"].includes(subjectType);
};

// ======================================================
// GET ALL COURSES
// ADMIN + HOD + FACULTY
// ======================================================

router.get(
  "/",
  authMiddleware,
  roleMiddleware("admin", "hod", "faculty"),
  async (req, res) => {
    try {
      const courses = await Course.find()
        .populate(
          "department",
          "name code status"
        )
        .populate(
          "faculty",
          "name email facultyId department designation"
        )
        .sort({ createdAt: -1 });

      const coursesWithStudents = await Promise.all(
        courses.map(async (course) => {
          const courseObject = course.toObject();

          // Count students using Student.course
          const studentCount =
            await Student.countDocuments({
              $or: [
                { course: course.name },
                { course: course.subjectCode },
                { course: course.courseCode },
              ],
            });

          return {
            ...courseObject,
            students: studentCount,
          };
        })
      );

      res.json(coursesWithStudents);
    } catch (error) {
      console.error("GET COURSES ERROR:", error);

      res.status(500).json({
        message: error.message,
      });
    }
  }
);

// ======================================================
// GET SINGLE COURSE
// ADMIN + HOD + FACULTY
// ======================================================

router.get(
  "/:id",
  authMiddleware,
  roleMiddleware("admin", "hod", "faculty"),
  async (req, res) => {
    try {
      if (!isValidObjectId(req.params.id)) {
        return res.status(400).json({
          message: "Invalid course ID.",
        });
      }

      const course = await Course.findById(req.params.id)
        .populate(
          "department",
          "name code status"
        )
        .populate(
          "faculty",
          "name email facultyId department designation"
        );

      if (!course) {
        return res.status(404).json({
          message: "Course not found.",
        });
      }

      const studentCount =
        await Student.countDocuments({
          $or: [
            { course: course.name },
            { course: course.subjectCode },
            { course: course.courseCode },
          ],
        });

      res.json({
        ...course.toObject(),
        students: studentCount,
      });
    } catch (error) {
      console.error(
        "GET SINGLE COURSE ERROR:",
        error
      );

      res.status(400).json({
        message: error.message,
      });
    }
  }
);

// ======================================================
// ADD COURSE
// ADMIN ONLY
// ======================================================

router.post(
  "/",
  authMiddleware,
  roleMiddleware("admin"),
  async (req, res) => {
    try {
      const {
        name,
        courseCode,
        subjectCode,
        department,
        semester,
        subjectType,
        credits,
        faculty,
        status,
      } = req.body;

      // ==================================================
      // REQUIRED FIELDS
      // ==================================================

      if (
        !name ||
        !courseCode ||
        !subjectCode ||
        !department ||
        !semester ||
        credits === undefined ||
        credits === null ||
        credits === ""
      ) {
        return res.status(400).json({
          message:
            "Name, course code, subject code, department, semester and credits are required.",
        });
      }

      // ==================================================
      // CLEAN VALUES
      // ==================================================

      const cleanName = String(name).trim();

      const cleanCourseCode = String(courseCode)
        .trim()
        .toUpperCase();

      const cleanSubjectCode = String(subjectCode)
        .trim()
        .toUpperCase();

      const cleanSemester = String(semester).trim();

      // ==================================================
      // VALIDATE NAME
      // ==================================================

      if (!cleanName) {
        return res.status(400).json({
          message: "Subject name cannot be empty.",
        });
      }

      // ==================================================
      // VALIDATE COURSE CODE
      // ==================================================

      if (!cleanCourseCode) {
        return res.status(400).json({
          message: "Course code cannot be empty.",
        });
      }

      // ==================================================
      // VALIDATE SUBJECT CODE
      // ==================================================

      if (!cleanSubjectCode) {
        return res.status(400).json({
          message: "Subject code cannot be empty.",
        });
      }

      // ==================================================
      // CHECK DUPLICATE SUBJECT CODE
      // ==================================================

      const existingSubject = await Course.findOne({
        subjectCode: cleanSubjectCode,
      });

      if (existingSubject) {
        return res.status(400).json({
          message: "Subject code already exists.",
        });
      }

      // ==================================================
      // VALIDATE DEPARTMENT ID
      // ==================================================

      if (!isValidObjectId(department)) {
        return res.status(400).json({
          message: "Invalid department ID.",
        });
      }

      // ==================================================
      // GET DEPARTMENT
      // ==================================================

      const departmentData =
        await Department.findOne({
          _id: department,
          status: "Active",
        });

      if (!departmentData) {
        return res.status(400).json({
          message:
            "Selected department does not exist or is inactive.",
        });
      }

      // ==================================================
      // CHECK DEPARTMENT CODE
      // ==================================================

      if (
        !departmentData.code ||
        !String(departmentData.code).trim()
      ) {
        return res.status(400).json({
          message:
            "Selected department does not have a valid department code.",
        });
      }

      const cleanDepartmentCode =
        String(departmentData.code)
          .trim()
          .toUpperCase();

      // ==================================================
      // VALIDATE SEMESTER
      // ==================================================

      if (!isValidSemester(cleanSemester)) {
        return res.status(400).json({
          message:
            "Invalid semester. Semester must be between 1 and 8.",
        });
      }

      // ==================================================
      // VALIDATE SUBJECT TYPE
      // ==================================================

      const finalSubjectType =
        subjectType || "Theory";

      if (!isValidSubjectType(finalSubjectType)) {
        return res.status(400).json({
          message:
            "Invalid subject type. Use Theory, Practical or Both.",
        });
      }

      // ==================================================
      // VALIDATE CREDITS
      // ==================================================

      if (!isValidCredits(credits)) {
        return res.status(400).json({
          message:
            "Invalid credits. Credits must be between 1 and 20.",
        });
      }

      // ==================================================
      // VALIDATE STATUS
      // ==================================================

      const finalStatus = status || "Active";

      if (
        !["Active", "Inactive"].includes(
          finalStatus
        )
      ) {
        return res.status(400).json({
          message: "Invalid course status.",
        });
      }

      // ==================================================
      // CHECK FACULTY
      // ==================================================

      let facultyId = null;

      if (faculty) {
        if (!isValidObjectId(faculty)) {
          return res.status(400).json({
            message: "Invalid faculty ID.",
          });
        }

        const facultyUser =
          await User.findOne({
            _id: faculty,
            role: "faculty",
          });

        if (!facultyUser) {
          return res.status(400).json({
            message:
              "Selected faculty does not exist.",
          });
        }

        facultyId = facultyUser._id;
      }

      // ==================================================
      // CREATE COURSE
      // ==================================================

      const course = await Course.create({
        name: cleanName,

        courseCode: cleanCourseCode,

        subjectCode: cleanSubjectCode,

        // Department ObjectId
        department: departmentData._id,

        // Department Code saved directly
        departmentCode: cleanDepartmentCode,

        semester: cleanSemester,

        subjectType: finalSubjectType,

        credits: Number(credits),

        faculty: facultyId,

        status: finalStatus,
      });

      // ==================================================
      // GET CREATED COURSE
      // ==================================================

      const createdCourse =
        await Course.findById(course._id)
          .populate(
            "department",
            "name code status"
          )
          .populate(
            "faculty",
            "name email facultyId department designation"
          );

      // ==================================================
      // RESPONSE
      // ==================================================

      res.status(201).json({
        message:
          "Course added successfully.",

        course: createdCourse,
      });
    } catch (error) {
      console.error(
        "ADD COURSE ERROR:",
        error
      );

      if (error.code === 11000) {
        return res.status(400).json({
          message:
            "Subject code already exists.",
        });
      }

      res.status(400).json({
        message: error.message,
      });
    }
  }
);

// ======================================================
// UPDATE COURSE
// ADMIN ONLY
// ======================================================

router.put(
  "/:id",
  authMiddleware,
  roleMiddleware("admin"),
  async (req, res) => {
    try {
      // ==================================================
      // VALIDATE COURSE ID
      // ==================================================

      if (!isValidObjectId(req.params.id)) {
        return res.status(400).json({
          message: "Invalid course ID.",
        });
      }

      const {
        name,
        courseCode,
        subjectCode,
        department,
        semester,
        subjectType,
        credits,
        faculty,
        status,
      } = req.body;

      // ==================================================
      // FIND COURSE
      // ==================================================

      const course =
        await Course.findById(req.params.id);

      if (!course) {
        return res.status(404).json({
          message: "Course not found.",
        });
      }

      // ==================================================
      // SUBJECT NAME
      // ==================================================

      if (name !== undefined) {
        const cleanName =
          String(name).trim();

        if (!cleanName) {
          return res.status(400).json({
            message:
              "Subject name cannot be empty.",
          });
        }

        course.name = cleanName;
      }

      // ==================================================
      // COURSE CODE
      // ==================================================

      if (courseCode !== undefined) {
        const cleanCourseCode =
          String(courseCode)
            .trim()
            .toUpperCase();

        if (!cleanCourseCode) {
          return res.status(400).json({
            message:
              "Course code cannot be empty.",
          });
        }

        course.courseCode =
          cleanCourseCode;
      }

      // ==================================================
      // SUBJECT CODE
      // ==================================================

      if (subjectCode !== undefined) {
        const cleanSubjectCode =
          String(subjectCode)
            .trim()
            .toUpperCase();

        if (!cleanSubjectCode) {
          return res.status(400).json({
            message:
              "Subject code cannot be empty.",
          });
        }

        const duplicateSubject =
          await Course.findOne({
            subjectCode:
              cleanSubjectCode,

            _id: {
              $ne: req.params.id,
            },
          });

        if (duplicateSubject) {
          return res.status(400).json({
            message:
              "Subject code already exists.",
          });
        }

        course.subjectCode =
          cleanSubjectCode;
      }

      // ==================================================
      // DEPARTMENT
      // ==================================================

      if (department !== undefined) {
        if (!isValidObjectId(department)) {
          return res.status(400).json({
            message:
              "Invalid department ID.",
          });
        }

        const departmentData =
          await Department.findOne({
            _id: department,
            status: "Active",
          });

        if (!departmentData) {
          return res.status(400).json({
            message:
              "Selected department does not exist or is inactive.",
          });
        }

        // Check department code
        if (
          !departmentData.code ||
          !String(departmentData.code).trim()
        ) {
          return res.status(400).json({
            message:
              "Selected department does not have a valid department code.",
          });
        }

        const cleanDepartmentCode =
          String(departmentData.code)
            .trim()
            .toUpperCase();

        // Save department ID
        course.department =
          departmentData._id;

        // Save department code
        course.departmentCode =
          cleanDepartmentCode;
      }

      // ==================================================
      // SEMESTER
      // ==================================================

      if (semester !== undefined) {
        const cleanSemester =
          String(semester).trim();

        if (!isValidSemester(cleanSemester)) {
          return res.status(400).json({
            message:
              "Invalid semester. Semester must be between 1 and 8.",
          });
        }

        course.semester =
          cleanSemester;
      }

      // ==================================================
      // SUBJECT TYPE
      // ==================================================

      if (subjectType !== undefined) {
        if (
          !isValidSubjectType(
            subjectType
          )
        ) {
          return res.status(400).json({
            message:
              "Invalid subject type. Use Theory, Practical or Both.",
          });
        }

        course.subjectType =
          subjectType;
      }

      // ==================================================
      // CREDITS
      // ==================================================

      if (credits !== undefined) {
        if (!isValidCredits(credits)) {
          return res.status(400).json({
            message:
              "Invalid credits. Credits must be between 1 and 20.",
          });
        }

        course.credits =
          Number(credits);
      }

      // ==================================================
      // STATUS
      // ==================================================

      if (status !== undefined) {
        if (
          !["Active", "Inactive"].includes(
            status
          )
        ) {
          return res.status(400).json({
            message:
              "Invalid course status.",
          });
        }

        course.status = status;
      }

      // ==================================================
      // FACULTY
      // ==================================================

      if (faculty !== undefined) {
        // Remove faculty
        if (
          faculty === "" ||
          faculty === null
        ) {
          course.faculty = null;
        } else {
          if (!isValidObjectId(faculty)) {
            return res.status(400).json({
              message:
                "Invalid faculty ID.",
            });
          }

          const facultyUser =
            await User.findOne({
              _id: faculty,
              role: "faculty",
            });

          if (!facultyUser) {
            return res.status(400).json({
              message:
                "Selected faculty does not exist.",
            });
          }

          course.faculty =
            facultyUser._id;
        }
      }

      // ==================================================
      // SAVE
      // ==================================================

      await course.save();

      // ==================================================
      // RETURN UPDATED COURSE
      // ==================================================

      const updatedCourse =
        await Course.findById(course._id)
          .populate(
            "department",
            "name code status"
          )
          .populate(
            "faculty",
            "name email facultyId department designation"
          );

      // ==================================================
      // RESPONSE
      // ==================================================

      res.json({
        message:
          "Course updated successfully.",

        course: updatedCourse,
      });
    } catch (error) {
      console.error(
        "UPDATE COURSE ERROR:",
        error
      );

      if (error.code === 11000) {
        return res.status(400).json({
          message:
            "Subject code already exists.",
        });
      }

      res.status(400).json({
        message: error.message,
      });
    }
  }
);

// ======================================================
// DELETE COURSE
// ADMIN ONLY
// ======================================================

router.delete(
  "/:id",
  authMiddleware,
  roleMiddleware("admin"),
  async (req, res) => {
    try {
      // ==================================================
      // VALIDATE COURSE ID
      // ==================================================

      if (!isValidObjectId(req.params.id)) {
        return res.status(400).json({
          message: "Invalid course ID.",
        });
      }

      // ==================================================
      // DELETE COURSE
      // ==================================================

      const course =
        await Course.findByIdAndDelete(
          req.params.id
        );

      if (!course) {
        return res.status(404).json({
          message:
            "Course not found.",
        });
      }

      // ==================================================
      // RESPONSE
      // ==================================================

      res.json({
        message:
          "Course deleted successfully.",
      });
    } catch (error) {
      console.error(
        "DELETE COURSE ERROR:",
        error
      );

      res.status(400).json({
        message: error.message,
      });
    }
  }
);

// ======================================================
// EXPORT ROUTER
// ======================================================

module.exports = router;

const express = require("express");
const mongoose = require("mongoose");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const Assignment = require("../models/Assignment");
const User = require("../models/User");
const Course = require("../models/Course");

const authMiddleware = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");

const router = express.Router();

// =====================================================
// UPLOAD DIRECTORY
// =====================================================

const uploadDir = path.join(__dirname, "../uploads/assignments");

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// =====================================================
// MULTER
// =====================================================

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueName =
      Date.now() +
      "-" +
      Math.round(Math.random() * 1e9) +
      path.extname(file.originalname);

    cb(null, uniqueName);
  },
});

const fileFilter = (req, file, cb) => {
  const extension = path.extname(file.originalname).toLowerCase();

  if (
    file.mimetype === "application/pdf" &&
    extension === ".pdf"
  ) {
    return cb(null, true);
  }

  cb(new Error("Only PDF files are allowed."), false);
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
});

// =====================================================
// HELPERS
// =====================================================

const isValidObjectId = (id) =>
  mongoose.Types.ObjectId.isValid(id);

const escapeRegex = (value = "") =>
  String(value)
    .trim()
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const deleteUploadedFile = (filePath) => {
  if (filePath && fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
    } catch (error) {
      console.error("File delete error:", error.message);
    }
  }
};

const deleteStoredFile = (storedPath) => {
  if (!storedPath) return;

  const fullPath = path.join(
    __dirname,
    "..",
    storedPath.replace(/^\/+/, "")
  );

  deleteUploadedFile(fullPath);
};

// =====================================================
// GET FACULTY ASSIGNED COURSES
// Faculty sees only their own active courses.
// Keep this route before dynamic ID routes.
// =====================================================

router.get(
  "/faculty-courses",
  authMiddleware,
  roleMiddleware("faculty"),
  async (req, res) => {
    try {
      const courses = await Course.find({
        faculty: req.user.id,
        status: "Active",
      })
        .select("name code department semester credits")
        .sort({ semester: 1, name: 1 })
        .lean();

      const semesters = [
        ...new Set(
          courses
            .map((course) => String(course.semester).trim())
            .filter(Boolean)
        ),
      ].sort((a, b) => {
        const numA = Number(a.replace(/\D/g, ""));
        const numB = Number(b.replace(/\D/g, ""));

        if (numA && numB) return numA - numB;
        return a.localeCompare(b);
      });

      return res.status(200).json({
        success: true,
        courses,
        semesters,
      });
    } catch (error) {
      console.error("Faculty Courses Error:", error);

      return res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }
);

// =====================================================
// GET ALL ASSIGNMENTS
// Faculty: own assignments
// HOD: department assignments
// Admin: all assignments
// =====================================================

router.get(
  "/",
  authMiddleware,
  roleMiddleware("faculty", "hod", "admin"),
  async (req, res) => {
    try {
      const user = await User.findById(req.user.id).select(
        "name department role"
      );

      if (!user) {
        return res.status(404).json({
          message: "User not found.",
        });
      }

      let query = {};

      if (user.role === "faculty") {
        query.facultyId = user._id;
      }

      if (user.role === "hod") {
        query.department = user.department;
      }

      const assignments = await Assignment.find(query)
        .sort({ createdAt: -1 })
        .lean();

      const result = assignments.map((assignment) => {
        const { studentSubmissions, ...safeAssignment } =
          assignment;

        return safeAssignment;
      });

      return res.status(200).json(result);
    } catch (error) {
      console.error("Get Assignments Error:", error);

      return res.status(500).json({
        message: error.message,
      });
    }
  }
);

// =====================================================
// GET STUDENT ASSIGNMENTS
// Student sees matching Department + Semester
// =====================================================

router.get(
  "/student",
  authMiddleware,
  roleMiddleware("student"),
  async (req, res) => {
    try {
      const student = await User.findOne({
        _id: req.user.id,
        role: "student",
      }).select("name department semester");

      if (!student) {
        return res.status(404).json({
          success: false,
          message: "Student not found.",
        });
      }

      if (!student.department || !student.semester) {
        return res.status(400).json({
          success: false,
          message: "Student department or semester is missing.",
        });
      }

      const departmentRegex = new RegExp(
        `^${escapeRegex(student.department)}$`,
        "i"
      );

      const semesterRegex = new RegExp(
        `^${escapeRegex(student.semester)}$`,
        "i"
      );

      const assignments = await Assignment.find({
        department: departmentRegex,
        semester: semesterRegex,
        status: "Active",
      })
        .sort({ dueDate: 1, createdAt: -1 })
        .lean();

      const now = new Date();

      const result = assignments.map((assignment) => {
        const mySubmission =
          assignment.studentSubmissions?.find(
            (submission) =>
              submission.studentId?.toString() ===
              student._id.toString()
          );

        let studentStatus = "Pending";

        if (mySubmission) {
          studentStatus = mySubmission.status;
        } else if (
          assignment.dueDate &&
          now > new Date(assignment.dueDate)
        ) {
          studentStatus = "Overdue";
        }

        return {
          _id: assignment._id,
          title: assignment.title,
          subject: assignment.subject,
          description: assignment.description || "",
          department: assignment.department,
          semester: assignment.semester,
          dueDate: assignment.dueDate,
          status: assignment.status,
          facultyId: assignment.facultyId,
          facultyName: assignment.facultyName,
          assignmentFile: assignment.assignmentFile || {
            fileName: "",
            filePath: "",
            fileType: "application/pdf",
          },
          submissions: assignment.submissions || 0,
          totalStudents: assignment.totalStudents || 0,
          studentStatus,
          submission: mySubmission || null,
        };
      });

      return res.status(200).json({
        success: true,
        assignments: result,
      });
    } catch (error) {
      console.error("Get Student Assignments Error:", error);

      return res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }
);

// =====================================================
// CREATE ASSIGNMENT
// Faculty selects a semester from assigned active courses.
// Department is derived from the assigned course.
// =====================================================

router.post(
  "/",
  authMiddleware,
  roleMiddleware("faculty"),
  upload.single("assignmentFile"),
  async (req, res) => {
    try {
      const { title, subject, description, dueDate, semester } =
        req.body;

      if (!title?.trim() || !subject?.trim() || !dueDate || !semester) {
        deleteUploadedFile(req.file?.path);

        return res.status(400).json({
          success: false,
          message:
            "Title, subject, due date and semester are required.",
        });
      }

      const faculty = await User.findOne({
        _id: req.user.id,
        role: "faculty",
      }).select("name department designation");

      if (!faculty) {
        deleteUploadedFile(req.file?.path);

        return res.status(404).json({
          success: false,
          message: "Faculty not found.",
        });
      }

      // Verify that the selected semester belongs to
      // an active course assigned to this faculty.
      const assignedCourse = await Course.findOne({
        faculty: faculty._id,
        status: "Active",
        semester: String(semester).trim(),
      });

      if (!assignedCourse) {
        deleteUploadedFile(req.file?.path);

        return res.status(403).json({
          success: false,
          message:
            "This semester is not assigned to your faculty account.",
        });
      }

      const department = assignedCourse.department.trim();
      const selectedSemester = String(
        assignedCourse.semester
      ).trim();

      const matchingStudents = await User.find({
        role: "student",
        department: new RegExp(`^${escapeRegex(department)}$`, "i"),
        semester: new RegExp(
          `^${escapeRegex(selectedSemester)}$`,
          "i"
        ),
      })
        .select("_id name email studentId department semester")
        .lean();

      const assignmentData = {
        title: title.trim(),
        subject: subject.trim(),
        description: description?.trim() || "",
        department,
        semester: selectedSemester,
        dueDate,
        status: "Active",
        facultyId: faculty._id,
        facultyName: faculty.name,
        submissions: 0,
        totalStudents: matchingStudents.length,
      };

      if (req.file) {
        assignmentData.assignmentFile = {
          fileName: req.file.originalname,
          filePath: `/uploads/assignments/${req.file.filename}`,
          fileType: req.file.mimetype,
        };
      }

      const assignment = await Assignment.create(assignmentData);

      return res.status(201).json({
        success: true,
        message: "Assignment created successfully.",
        assignment,
        targetClass: {
          department,
          semester: selectedSemester,
        },
        totalStudents: matchingStudents.length,
      });
    } catch (error) {
      console.error("Create Assignment Error:", error);
      deleteUploadedFile(req.file?.path);

      return res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }
);

// =====================================================
// STUDENT SUBMITS PDF
// =====================================================

router.post(
  "/:id/submit",
  authMiddleware,
  roleMiddleware("student"),
  upload.single("submissionFile"),
  async (req, res) => {
    try {
      const assignmentId = req.params.id;

      if (!isValidObjectId(assignmentId)) {
        deleteUploadedFile(req.file?.path);

        return res.status(400).json({
          message: "Invalid assignment ID.",
        });
      }

      if (!req.file) {
        return res.status(400).json({
          message: "Please upload a PDF file.",
        });
      }

      const assignment = await Assignment.findById(assignmentId);

      if (!assignment) {
        deleteUploadedFile(req.file.path);

        return res.status(404).json({
          message: "Assignment not found.",
        });
      }

      const student = await User.findOne({
        _id: req.user.id,
        role: "student",
      });

      if (!student) {
        deleteUploadedFile(req.file.path);

        return res.status(404).json({
          message: "Student not found.",
        });
      }

      const departmentMatch =
        String(assignment.department || "").trim().toLowerCase() ===
        String(student.department || "").trim().toLowerCase();

      const semesterMatch =
        String(assignment.semester || "").trim().toLowerCase() ===
        String(student.semester || "").trim().toLowerCase();

      if (!departmentMatch || !semesterMatch) {
        deleteUploadedFile(req.file.path);

        return res.status(403).json({
          message:
            "You are not allowed to submit this assignment.",
        });
      }

      if (
        assignment.dueDate &&
        new Date() > new Date(assignment.dueDate)
      ) {
        deleteUploadedFile(req.file.path);

        return res.status(400).json({
          message: "Submission deadline has passed.",
        });
      }

      const existingIndex =
        assignment.studentSubmissions.findIndex(
          (submission) =>
            submission.studentId.toString() ===
            student._id.toString()
        );

      let oldFilePath = null;

      const submissionData = {
        studentId: student._id,
        studentName: student.name,
        fileName: req.file.originalname,
        filePath: `/uploads/assignments/${req.file.filename}`,
        fileType: req.file.mimetype,
        submittedAt: new Date(),
        status: "Submitted",
        marks: null,
        feedback: "",
      };

      if (existingIndex !== -1) {
        const oldSubmission =
          assignment.studentSubmissions[existingIndex];

        oldFilePath = oldSubmission.filePath;

        submissionData.marks = oldSubmission.marks ?? null;
        submissionData.feedback = oldSubmission.feedback || "";

        assignment.studentSubmissions[existingIndex] =
          submissionData;
      } else {
        assignment.studentSubmissions.push(submissionData);
      }

      assignment.submissions =
        assignment.studentSubmissions.length;

      await assignment.save();

      if (oldFilePath) {
        deleteStoredFile(oldFilePath);
      }

      const submitted = assignment.studentSubmissions.find(
        (submission) =>
          submission.studentId.toString() ===
          student._id.toString()
      );

      return res.status(200).json({
        success: true,
        message: "Assignment submitted successfully.",
        submission: submitted,
      });
    } catch (error) {
      console.error("Submit Assignment Error:", error);
      deleteUploadedFile(req.file?.path);

      return res.status(500).json({
        message: error.message,
      });
    }
  }
);

// =====================================================
// GET ALL SUBMISSIONS OF ONE ASSIGNMENT
// Faculty: own assignment
// HOD: own department
// Admin: all
// =====================================================

router.get(
  "/:id/submissions",
  authMiddleware,
  roleMiddleware("faculty", "hod", "admin"),
  async (req, res) => {
    try {
      if (!isValidObjectId(req.params.id)) {
        return res.status(400).json({
          message: "Invalid assignment ID.",
        });
      }

      const assignment = await Assignment.findById(
        req.params.id
      ).lean();

      if (!assignment) {
        return res.status(404).json({
          message: "Assignment not found.",
        });
      }

      const user = await User.findById(req.user.id).select(
        "role department"
      );

      if (!user) {
        return res.status(404).json({
          message: "User not found.",
        });
      }

      if (
        user.role === "faculty" &&
        assignment.facultyId.toString() !== user._id.toString()
      ) {
        return res.status(403).json({
          message: "Access denied.",
        });
      }

      if (
        user.role === "hod" &&
        String(assignment.department || "").trim().toLowerCase() !==
          String(user.department || "").trim().toLowerCase()
      ) {
        return res.status(403).json({
          message: "Access denied.",
        });
      }

      return res.status(200).json({
        assignmentId: assignment._id,
        title: assignment.title,
        subject: assignment.subject,
        department: assignment.department,
        semester: assignment.semester,
        dueDate: assignment.dueDate,
        submissions: assignment.studentSubmissions || [],
        submissionCount: assignment.submissions || 0,
        totalStudents: assignment.totalStudents || 0,
      });
    } catch (error) {
      console.error("Get Submissions Error:", error);

      return res.status(500).json({
        message: error.message,
      });
    }
  }
);

// =====================================================
// GET MY SUBMISSION
// =====================================================

router.get(
  "/:id/submission",
  authMiddleware,
  roleMiddleware("student"),
  async (req, res) => {
    try {
      if (!isValidObjectId(req.params.id)) {
        return res.status(400).json({
          message: "Invalid assignment ID.",
        });
      }

      const assignment = await Assignment.findById(
        req.params.id
      ).lean();

      if (!assignment) {
        return res.status(404).json({
          message: "Assignment not found.",
        });
      }

      const student = await User.findOne({
        _id: req.user.id,
        role: "student",
      }).select("department semester");

      if (
        !student ||
        String(student.department || "").trim().toLowerCase() !==
          String(assignment.department || "").trim().toLowerCase() ||
        String(student.semester || "").trim().toLowerCase() !==
          String(assignment.semester || "").trim().toLowerCase()
      ) {
        return res.status(403).json({
          message: "Access denied.",
        });
      }

      const submission =
        assignment.studentSubmissions?.find(
          (item) =>
            item.studentId?.toString() ===
            req.user.id.toString()
        );

      return res.status(200).json({
        submission: submission || null,
      });
    } catch (error) {
      console.error("Get My Submission Error:", error);

      return res.status(500).json({
        message: error.message,
      });
    }
  }
);

// =====================================================
// UPDATE ASSIGNMENT
// Faculty can update only own assignment.
// Semester must belong to an assigned active course.
// =====================================================

router.put(
  "/:id",
  authMiddleware,
  roleMiddleware("faculty"),
  upload.single("assignmentFile"),
  async (req, res) => {
    try {
      if (!isValidObjectId(req.params.id)) {
        deleteUploadedFile(req.file?.path);

        return res.status(400).json({
          message: "Invalid assignment ID.",
        });
      }

      const assignment = await Assignment.findOne({
        _id: req.params.id,
        facultyId: req.user.id,
      });

      if (!assignment) {
        deleteUploadedFile(req.file?.path);

        return res.status(404).json({
          message: "Assignment not found or access denied.",
        });
      }

      const faculty = await User.findOne({
        _id: req.user.id,
        role: "faculty",
      }).select("name");

      if (!faculty) {
        deleteUploadedFile(req.file?.path);

        return res.status(404).json({
          message: "Faculty not found.",
        });
      }

      const {
        title,
        subject,
        description,
        dueDate,
        status,
        semester,
      } = req.body;

      // If semester is supplied, verify it.
      // Otherwise, retain the assignment's existing semester.
      const selectedSemester =
        semester !== undefined
          ? String(semester).trim()
          : assignment.semester;

      const assignedCourse = await Course.findOne({
        faculty: faculty._id,
        status: "Active",
        semester: selectedSemester,
      });

      if (!assignedCourse) {
        deleteUploadedFile(req.file?.path);

        return res.status(403).json({
          message:
            "This semester is not assigned to your faculty account.",
        });
      }

      if (title !== undefined) {
        if (!title.trim()) {
          deleteUploadedFile(req.file?.path);

          return res.status(400).json({
            message: "Title cannot be empty.",
          });
        }

        assignment.title = title.trim();
      }

      if (subject !== undefined) {
        if (!subject.trim()) {
          deleteUploadedFile(req.file?.path);

          return res.status(400).json({
            message: "Subject cannot be empty.",
          });
        }

        assignment.subject = subject.trim();
      }

      if (description !== undefined) {
        assignment.description = description.trim();
      }

      if (dueDate !== undefined) {
        assignment.dueDate = dueDate;
      }

      if (status !== undefined) {
        if (!["Active", "Inactive"].includes(status)) {
          deleteUploadedFile(req.file?.path);

          return res.status(400).json({
            message: "Invalid assignment status.",
          });
        }

        assignment.status = status;
      }

      assignment.department = assignedCourse.department;
      assignment.semester = String(assignedCourse.semester).trim();
      assignment.facultyName = faculty.name;

      if (req.file) {
        deleteStoredFile(assignment.assignmentFile?.filePath);

        assignment.assignmentFile = {
          fileName: req.file.originalname,
          filePath: `/uploads/assignments/${req.file.filename}`,
          fileType: req.file.mimetype,
        };
      }

      assignment.totalStudents = await User.countDocuments({
        role: "student",
        department: new RegExp(
          `^${escapeRegex(assignment.department)}$`,
          "i"
        ),
        semester: new RegExp(
          `^${escapeRegex(assignment.semester)}$`,
          "i"
        ),
      });

      await assignment.save();

      return res.status(200).json({
        success: true,
        message: "Assignment updated successfully.",
        assignment,
      });
    } catch (error) {
      console.error("Update Assignment Error:", error);
      deleteUploadedFile(req.file?.path);

      return res.status(500).json({
        message: error.message,
      });
    }
  }
);

// =====================================================
// DELETE ASSIGNMENT
// Faculty can delete only own assignment.
// =====================================================

router.delete(
  "/:id",
  authMiddleware,
  roleMiddleware("faculty"),
  async (req, res) => {
    try {
      if (!isValidObjectId(req.params.id)) {
        return res.status(400).json({
          message: "Invalid assignment ID.",
        });
      }

      const assignment = await Assignment.findOne({
        _id: req.params.id,
        facultyId: req.user.id,
      });

      if (!assignment) {
        return res.status(404).json({
          message: "Assignment not found or access denied.",
        });
      }

      deleteStoredFile(assignment.assignmentFile?.filePath);

      for (const submission of assignment.studentSubmissions || []) {
        deleteStoredFile(submission.filePath);
      }

      await Assignment.deleteOne({
        _id: assignment._id,
      });

      return res.status(200).json({
        success: true,
        message: "Assignment deleted successfully.",
      });
    } catch (error) {
      console.error("Delete Assignment Error:", error);

      return res.status(500).json({
        message: error.message,
      });
    }
  }
);

// =====================================================
// MULTER ERROR HANDLER
// =====================================================

router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        message: "PDF file size must be 10 MB or less.",
      });
    }

    return res.status(400).json({
      message: error.message,
    });
  }

  if (error) {
    return res.status(400).json({
      message: error.message,
    });
  }

  next();
});

module.exports = router;
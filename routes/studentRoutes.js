const express = require("express");
const router = express.Router();

const bcrypt = require("bcryptjs");
const User = require("../models/User");

const authMiddleware = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");

// =====================================================
// GET ALL STUDENTS
// USERS COLLECTION
// Faculty / HOD / Admin
// =====================================================

router.get(
  "/",
  authMiddleware,
  roleMiddleware("faculty", "hod", "admin"),
  async (req, res) => {
    try {
      const students = await User.find({
        role: "student",
      })
        .select("-password")
        .sort({ createdAt: -1 });

      res.json(students);
    } catch (error) {
      console.error("Get Students Error:", error);

      res.status(500).json({
        message: error.message,
      });
    }
  }
);

// =====================================================
// GET STUDENTS FOR DASHBOARD
// USERS COLLECTION
// Faculty / HOD / Admin
// =====================================================

router.get(
  "/users-list",
  authMiddleware,
  roleMiddleware("faculty", "hod", "admin"),
  async (req, res) => {
    try {
      const students = await User.find({
        role: "student",
      })
        .select("-password")
        .sort({ createdAt: -1 });

      res.json(students);
    } catch (error) {
      console.error("Get Student Users Error:", error);

      res.status(500).json({
        message: error.message,
      });
    }
  }
);

// =====================================================
// ADD STUDENT
// USERS COLLECTION
// HOD / Admin
// =====================================================

router.post(
  "/",
  authMiddleware,
  roleMiddleware("hod", "admin"),
  async (req, res) => {
    try {
      const {
        name,
        email,
        phone,
        password,
        studentId,
        department,
        course,
        semester,
      } = req.body;

      // Required fields
      if (!name || !email || !phone || !password) {
        return res.status(400).json({
          message:
            "Name, email, phone and password are required.",
        });
      }

      const normalizedEmail = email.trim().toLowerCase();

      // Check email
      const existingEmail = await User.findOne({
        email: normalizedEmail,
      });

      if (existingEmail) {
        return res.status(400).json({
          message: "Email already exists.",
        });
      }

      // Check Student ID
      if (studentId) {
        const existingStudentId = await User.findOne({
          studentId: studentId.trim(),
        });

        if (existingStudentId) {
          return res.status(400).json({
            message: "Student ID already exists.",
          });
        }
      }

      const hashedPassword = await bcrypt.hash(
        password,
        10
      );

      const student = await User.create({
        name: name.trim(),
        email: normalizedEmail,
        phone: phone.trim(),
        password: hashedPassword,
        role: "student",
        studentId: studentId?.trim() || undefined,
        department: department?.trim() || "",
        course: course?.trim() || "",
        semester: semester || "",
      });

      const studentResponse = student.toObject();

      delete studentResponse.password;

      res.status(201).json({
        message: "Student added successfully.",
        student: studentResponse,
      });
    } catch (error) {
      console.error("Add Student Error:", error);

      res.status(400).json({
        message: error.message,
      });
    }
  }
);

// =====================================================
// UPDATE STUDENT
// USERS COLLECTION
// HOD / Admin
// =====================================================

router.put(
  "/:id",
  authMiddleware,
  roleMiddleware("hod", "admin"),
  async (req, res) => {
    try {
      const {
        name,
        email,
        phone,
        studentId,
        department,
        course,
        semester,
      } = req.body;

      const student = await User.findOne({
        _id: req.params.id,
        role: "student",
      });

      if (!student) {
        return res.status(404).json({
          message: "Student not found.",
        });
      }

      // Email update
      if (email) {
        const normalizedEmail =
          email.trim().toLowerCase();

        const existingEmail = await User.findOne({
          email: normalizedEmail,
          _id: {
            $ne: req.params.id,
          },
        });

        if (existingEmail) {
          return res.status(400).json({
            message: "Email already exists.",
          });
        }

        student.email = normalizedEmail;
      }

      // Student ID update
      if (studentId) {
        const existingStudentId =
          await User.findOne({
            studentId: studentId.trim(),
            _id: {
              $ne: req.params.id,
            },
          });

        if (existingStudentId) {
          return res.status(400).json({
            message: "Student ID already exists.",
          });
        }

        student.studentId =
          studentId.trim();
      }

      if (name) {
        student.name = name.trim();
      }

      if (phone) {
        student.phone = phone.trim();
      }

      if (department !== undefined) {
        student.department =
          department.trim();
      }

      if (course !== undefined) {
        student.course =
          course.trim();
      }

      if (semester !== undefined) {
        student.semester = semester;
      }

      await student.save();

      const studentResponse =
        student.toObject();

      delete studentResponse.password;

      res.json({
        message: "Student updated successfully.",
        student: studentResponse,
      });
    } catch (error) {
      console.error(
        "Update Student Error:",
        error
      );

      res.status(400).json({
        message: error.message,
      });
    }
  }
);

// =====================================================
// DELETE STUDENT
// USERS COLLECTION
// ADMIN ONLY
// =====================================================

router.delete(
  "/:id",
  authMiddleware,
  roleMiddleware("admin"),
  async (req, res) => {
    try {
      const student =
        await User.findOneAndDelete({
          _id: req.params.id,
          role: "student",
        });

      if (!student) {
        return res.status(404).json({
          message: "Student not found.",
        });
      }

      res.json({
        message:
          "Student deleted successfully.",
      });
    } catch (error) {
      console.error(
        "Delete Student Error:",
        error
      );

      res.status(400).json({
        message: error.message,
      });
    }
  }
);

module.exports = router;
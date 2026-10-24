const express = require("express");
const router = express.Router();

const bcrypt = require("bcryptjs");
const User = require("../models/User");

const authMiddleware = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");

// =========================================================
// GET ALL HODs
// HOD + ADMIN can view
// =========================================================

router.get(
  "/",
  authMiddleware,
  roleMiddleware("hod", "admin"),
  async (req, res) => {
    try {
      const hods = await User.find({
        role: "hod",
      })
        .select("-password")
        .sort({ createdAt: -1 });

      res.status(200).json(hods);
    } catch (error) {
      console.error("Get HODs Error:", error);

      res.status(500).json({
        message: error.message,
      });
    }
  }
);

// =========================================================
// HOD DASHBOARD LIVE DATA
// HOD ONLY
// Students + Faculty from USERS collection
// =========================================================

router.get(
  "/dashboard-data",
  authMiddleware,
  roleMiddleware("hod"),
  async (req, res) => {
    try {
      // =====================================================
      // LOGGED-IN HOD
      // =====================================================

      const currentHod = await User.findOne({
        _id: req.user.id,
        role: "hod",
      }).select("-password");

      if (!currentHod) {
        return res.status(404).json({
          message: "HOD not found.",
        });
      }

      // =====================================================
      // STUDENTS FROM USERS COLLECTION
      // =====================================================

      const students = await User.find({
        role: "student",
      })
        .select("-password")
        .sort({ createdAt: -1 });

      // =====================================================
      // FACULTY FROM USERS COLLECTION
      // =====================================================

      const faculty = await User.find({
        role: "faculty",
      })
        .select("-password")
        .sort({ createdAt: -1 });

      // =====================================================
      // SEND LIVE DATA
      // =====================================================

      res.status(200).json({
        hod: currentHod,

        students: students,

        faculty: faculty,

        studentCount: students.length,

        facultyCount: faculty.length,
      });
    } catch (error) {
      console.error(
        "HOD Dashboard Error:",
        error
      );

      res.status(500).json({
        message: error.message,
      });
    }
  }
);

// =========================================================
// GET SINGLE HOD
// HOD + ADMIN can view
// =========================================================

router.get(
  "/:id",
  authMiddleware,
  roleMiddleware("hod", "admin"),
  async (req, res) => {
    try {
      const hod = await User.findOne({
        _id: req.params.id,
        role: "hod",
      }).select("-password");

      if (!hod) {
        return res.status(404).json({
          message: "HOD not found.",
        });
      }

      res.status(200).json(hod);
    } catch (error) {
      console.error(
        "Get Single HOD Error:",
        error
      );

      res.status(400).json({
        message: error.message,
      });
    }
  }
);

// =========================================================
// ADD HOD
// ADMIN ONLY
// =========================================================

router.post(
  "/",
  authMiddleware,
  roleMiddleware("admin"),
  async (req, res) => {
    try {
      const {
        name,
        email,
        phone,
        password,
        department,
        designation,
      } = req.body;

      // =====================================================
      // REQUIRED FIELDS
      // =====================================================

      if (
        !name ||
        !email ||
        !phone ||
        !password ||
        !department
      ) {
        return res.status(400).json({
          message:
            "Name, email, phone, password and department are required.",
        });
      }

      // =====================================================
      // NORMALIZE DATA
      // =====================================================

      const normalizedEmail =
        email.trim().toLowerCase();

      const normalizedDepartment =
        department.trim();

      // =====================================================
      // CHECK DUPLICATE EMAIL
      // =====================================================

      const existingEmail =
        await User.findOne({
          email: normalizedEmail,
        });

      if (existingEmail) {
        return res.status(400).json({
          message: "Email already exists.",
        });
      }

      // =====================================================
      // SAME DEPARTMENT = ONLY ONE HOD
      // =====================================================

      const existingDepartmentHOD =
        await User.findOne({
          role: "hod",
          department: {
            $regex: `^${normalizedDepartment}$`,
            $options: "i",
          },
        });

      if (existingDepartmentHOD) {
        return res.status(400).json({
          message:
            `A HOD already exists for ${normalizedDepartment} department.`,
        });
      }

      // =====================================================
      // HASH PASSWORD
      // =====================================================

      const hashedPassword =
        await bcrypt.hash(password, 10);

      // =====================================================
      // CREATE HOD
      // =====================================================

      const hod = await User.create({
        name: name.trim(),

        email: normalizedEmail,

        phone: phone.trim(),

        password: hashedPassword,

        role: "hod",

        department: normalizedDepartment,

        designation:
          designation?.trim() ||
          "Head of Department",
      });

      // =====================================================
      // REMOVE PASSWORD
      // =====================================================

      const hodResponse =
        hod.toObject();

      delete hodResponse.password;

      // =====================================================
      // RESPONSE
      // =====================================================

      res.status(201).json({
        message:
          "HOD added successfully.",

        hod: hodResponse,
      });
    } catch (error) {
      console.error(
        "Add HOD Error:",
        error
      );

      res.status(400).json({
        message: error.message,
      });
    }
  }
);

// =========================================================
// UPDATE HOD
//
// ADMIN:
// Can update any HOD
//
// HOD:
// Can update ONLY own profile
//
// HOD CAN UPDATE:
// name
// email
// phone
// designation
//
// DEPARTMENT:
// Only Admin can change
// =========================================================

router.put(
  "/:id",
  authMiddleware,
  roleMiddleware("admin", "hod"),
  async (req, res) => {
    try {
      const {
        name,
        email,
        phone,
        designation,
        department,
      } = req.body;

      // =====================================================
      // FIND HOD
      // =====================================================

      const hod = await User.findOne({
        _id: req.params.id,
        role: "hod",
      });

      if (!hod) {
        return res.status(404).json({
          message: "HOD not found.",
        });
      }

      // =====================================================
      // HOD CAN UPDATE ONLY OWN PROFILE
      // =====================================================

      if (
        req.user.role === "hod" &&
        req.user.id !== req.params.id
      ) {
        return res.status(403).json({
          message:
            "You can update only your own profile.",
        });
      }

      // =====================================================
      // UPDATE NAME
      // =====================================================

      if (name !== undefined) {
        if (!name.trim()) {
          return res.status(400).json({
            message:
              "Name cannot be empty.",
          });
        }

        hod.name = name.trim();
      }

      // =====================================================
      // UPDATE EMAIL
      // =====================================================

      if (email !== undefined) {
        const normalizedEmail =
          email.trim().toLowerCase();

        if (!normalizedEmail) {
          return res.status(400).json({
            message:
              "Email cannot be empty.",
          });
        }

        // Check duplicate email
        const existingEmail =
          await User.findOne({
            email: normalizedEmail,

            _id: {
              $ne: req.params.id,
            },
          });

        if (existingEmail) {
          return res.status(400).json({
            message:
              "Email already exists.",
          });
        }

        hod.email = normalizedEmail;
      }

      // =====================================================
      // UPDATE PHONE
      // =====================================================

      if (phone !== undefined) {
        if (!phone.trim()) {
          return res.status(400).json({
            message:
              "Phone cannot be empty.",
          });
        }

        hod.phone = phone.trim();
      }

      // =====================================================
      // UPDATE DESIGNATION
      // =====================================================

      if (designation !== undefined) {
        hod.designation =
          designation.trim();
      }

      // =====================================================
      // CHANGE DEPARTMENT
      //
      // ONLY ADMIN CAN CHANGE DEPARTMENT
      // =====================================================

      if (
        req.user.role === "admin" &&
        department !== undefined
      ) {
        const normalizedDepartment =
          department.trim();

        if (!normalizedDepartment) {
          return res.status(400).json({
            message:
              "Department cannot be empty.",
          });
        }

        // =================================================
        // CHECK SAME DEPARTMENT HOD
        // =================================================

        const existingDepartmentHOD =
          await User.findOne({
            _id: {
              $ne: req.params.id,
            },

            role: "hod",

            department: {
              $regex:
                `^${normalizedDepartment}$`,

              $options: "i",
            },
          });

        if (existingDepartmentHOD) {
          return res.status(400).json({
            message:
              `A HOD already exists for ${normalizedDepartment} department.`,
          });
        }

        hod.department =
          normalizedDepartment;
      }

      // =====================================================
      // SAVE UPDATED HOD
      // =====================================================

      await hod.save();

      // =====================================================
      // REMOVE PASSWORD
      // =====================================================

      const hodResponse =
        hod.toObject();

      delete hodResponse.password;

      // =====================================================
      // RESPONSE
      // =====================================================

      res.status(200).json({
        message:
          "HOD profile updated successfully.",

        user: hodResponse,

        hod: hodResponse,
      });
    } catch (error) {
      console.error(
        "Update HOD Error:",
        error
      );

      res.status(500).json({
        message: error.message,
      });
    }
  }
);

// =========================================================
// DELETE HOD
// ADMIN ONLY
// =========================================================

router.delete(
  "/:id",
  authMiddleware,
  roleMiddleware("admin"),
  async (req, res) => {
    try {
      const hod =
        await User.findOneAndDelete({
          _id: req.params.id,
          role: "hod",
        });

      if (!hod) {
        return res.status(404).json({
          message: "HOD not found.",
        });
      }

      res.status(200).json({
        message:
          "HOD deleted successfully.",
      });
    } catch (error) {
      console.error(
        "Delete HOD Error:",
        error
      );

      res.status(400).json({
        message: error.message,
      });
    }
  }
);

// =========================================================
// EXPORT ROUTER
// =========================================================

module.exports = router;
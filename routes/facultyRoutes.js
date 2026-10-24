
const express = require("express");
const router = express.Router();

const User = require("../models/User");
const Department = require("../models/Department");
const bcrypt = require("bcryptjs");

const authMiddleware = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");

// =====================================================
// HELPER: FIND ACTIVE DEPARTMENT
// =====================================================

const findActiveDepartment = async (departmentName) => {
  if (!departmentName || !departmentName.trim()) {
    return null;
  }

  const normalizedName = departmentName.trim();

  const escapedName = normalizedName.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );

  return await Department.findOne({
    name: {
      $regex: `^${escapedName}$`,
      $options: "i",
    },
    status: "Active",
  });
};

// =====================================================
// GET ALL FACULTY
// Faculty / HOD / Admin
// =====================================================

router.get(
  "/",
  authMiddleware,
  roleMiddleware("faculty", "hod", "admin"),
  async (req, res) => {
    try {
      const faculty = await User.find(
        { role: "faculty" },
        {
          name: 1,
          email: 1,
          phone: 1,
          facultyId: 1,
          department: 1,
          semester: 1,
          designation: 1,
          role: 1,
          createdAt: 1,
        }
      );

      res.status(200).json(faculty);
    } catch (error) {
      console.error("Get Faculty Error:", error);

      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }
);

// =====================================================
// GET SINGLE FACULTY
// =====================================================

router.get(
  "/:id",
  authMiddleware,
  roleMiddleware("faculty", "hod", "admin"),
  async (req, res) => {
    try {
      const faculty = await User.findOne({
        _id: req.params.id,
        role: "faculty",
      }).select(
        "name email phone facultyId department semester designation role createdAt"
      );

      if (!faculty) {
        return res.status(404).json({
          success: false,
          message: "Faculty not found.",
        });
      }

      res.status(200).json(faculty);
    } catch (error) {
      console.error("Get Single Faculty Error:", error);

      res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  }
);

// =====================================================
// ADD FACULTY
// HOD / ADMIN
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
        facultyId,
        department,
        semester,
        designation,
      } = req.body;

      // REQUIRED FIELD VALIDATION

      if (
        !name ||
        !email ||
        !phone ||
        !password ||
        !department ||
        !semester ||
        !designation
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Name, email, phone, password, department, semester and designation are required.",
        });
      }

      const normalizedEmail = email.trim().toLowerCase();
      const normalizedDepartment = department.trim();
      const normalizedSemester = String(semester).trim();
      const normalizedFacultyId = facultyId
        ? facultyId.trim()
        : "";

      // CHECK EMAIL

      const existingUser = await User.findOne({
        email: normalizedEmail,
      });

      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: "Email already exists.",
        });
      }

      // CHECK FACULTY ID

      if (normalizedFacultyId) {
        const existingFacultyId = await User.findOne({
          facultyId: normalizedFacultyId,
        });

        if (existingFacultyId) {
          return res.status(400).json({
            success: false,
            message: "Faculty ID already exists.",
          });
        }
      }

      // CHECK DEPARTMENT

      const departmentData = await findActiveDepartment(
        normalizedDepartment
      );

      if (!departmentData) {
        return res.status(400).json({
          success: false,
          message:
            "Selected department does not exist or is inactive.",
        });
      }

      // HASH PASSWORD

      const hashedPassword = await bcrypt.hash(password, 10);

      // CREATE FACULTY

      const faculty = await User.create({
        name: name.trim(),
        email: normalizedEmail,
        phone: phone.trim(),
        password: hashedPassword,
        role: "faculty",

        facultyId: normalizedFacultyId || undefined,

        department: departmentData.name,
        semester: normalizedSemester,

        designation: designation.trim(),
      });

      res.status(201).json({
        success: true,
        message: "Faculty added successfully.",

        faculty: {
          _id: faculty._id,
          name: faculty.name,
          email: faculty.email,
          phone: faculty.phone,
          facultyId: faculty.facultyId,
          department: faculty.department,
          semester: faculty.semester,
          designation: faculty.designation,
          role: faculty.role,
          createdAt: faculty.createdAt,
        },
      });
    } catch (error) {
      console.error("Add Faculty Error:", error);

      res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  }
);

// =====================================================
// UPDATE FACULTY PROFILE
//
// Faculty: Own profile
// HOD: Faculty profile
// Admin: Faculty profile
// =====================================================

router.put(
  "/:id",
  authMiddleware,
  roleMiddleware("faculty", "hod", "admin"),
  async (req, res) => {
    try {
      const faculty = await User.findOne({
        _id: req.params.id,
        role: "faculty",
      });

      if (!faculty) {
        return res.status(404).json({
          success: false,
          message: "Faculty not found.",
        });
      }

      // FACULTY CAN UPDATE ONLY OWN PROFILE

      if (
        req.user.role === "faculty" &&
        String(req.user.id) !== String(req.params.id)
      ) {
        return res.status(403).json({
          success: false,
          message: "You can update only your own profile.",
        });
      }

      const {
        name,
        email,
        phone,
        password,
        designation,
        department,
        semester,
        facultyId,
      } = req.body;

      // NAME

      if (name !== undefined) {
        if (!name.trim()) {
          return res.status(400).json({
            success: false,
            message: "Name cannot be empty.",
          });
        }

        faculty.name = name.trim();
      }

      // EMAIL

      if (email !== undefined) {
        const normalizedEmail = email.trim().toLowerCase();

        if (!normalizedEmail) {
          return res.status(400).json({
            success: false,
            message: "Email cannot be empty.",
          });
        }

        const existingEmail = await User.findOne({
          email: normalizedEmail,
          _id: { $ne: req.params.id },
        });

        if (existingEmail) {
          return res.status(400).json({
            success: false,
            message: "Email already exists.",
          });
        }

        faculty.email = normalizedEmail;
      }

      // PHONE

      if (phone !== undefined) {
        if (!phone.trim()) {
          return res.status(400).json({
            success: false,
            message: "Phone cannot be empty.",
          });
        }

        faculty.phone = phone.trim();
      }

      // DESIGNATION

      if (designation !== undefined) {
        if (!designation.trim()) {
          return res.status(400).json({
            success: false,
            message: "Designation cannot be empty.",
          });
        }

        faculty.designation = designation.trim();
      }

      // DEPARTMENT: ONLY HOD / ADMIN

      if (
        ["hod", "admin"].includes(req.user.role) &&
        department !== undefined
      ) {
        if (!department.trim()) {
          return res.status(400).json({
            success: false,
            message: "Department cannot be empty.",
          });
        }

        const departmentData = await findActiveDepartment(
          department.trim()
        );

        if (!departmentData) {
          return res.status(400).json({
            success: false,
            message:
              "Selected department does not exist or is inactive.",
          });
        }

        faculty.department = departmentData.name;
      }

      // SEMESTER: ONLY HOD / ADMIN

      if (
        ["hod", "admin"].includes(req.user.role) &&
        semester !== undefined
      ) {
        const normalizedSemester = String(semester).trim();

        if (!normalizedSemester) {
          return res.status(400).json({
            success: false,
            message: "Semester cannot be empty.",
          });
        }

        faculty.semester = normalizedSemester;
      }

      // FACULTY ID: ONLY HOD / ADMIN

      if (
        ["hod", "admin"].includes(req.user.role) &&
        facultyId !== undefined
      ) {
        const normalizedFacultyId = facultyId.trim();

        if (!normalizedFacultyId) {
          return res.status(400).json({
            success: false,
            message: "Faculty ID cannot be empty.",
          });
        }

        const existingFacultyId = await User.findOne({
          facultyId: normalizedFacultyId,
          _id: { $ne: req.params.id },
        });

        if (existingFacultyId) {
          return res.status(400).json({
            success: false,
            message: "Faculty ID already exists.",
          });
        }

        faculty.facultyId = normalizedFacultyId;
      }

      // PASSWORD

      if (password !== undefined) {
        if (password.length < 6) {
          return res.status(400).json({
            success: false,
            message: "Password must be at least 6 characters.",
          });
        }

        faculty.password = await bcrypt.hash(password, 10);
      }

      // SAVE FACULTY

      await faculty.save();

      // RESPONSE WITHOUT PASSWORD

      const facultyResponse = faculty.toObject();
      delete facultyResponse.password;

      res.status(200).json({
        success: true,
        message: "Faculty profile updated successfully.",
        faculty: facultyResponse,
        user: facultyResponse,
      });
    } catch (error) {
      console.error("Update Faculty Error:", error);

      res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  }
);

// =====================================================
// DELETE FACULTY
// ADMIN ONLY
// =====================================================

router.delete(
  "/:id",
  authMiddleware,
  roleMiddleware("admin"),
  async (req, res) => {
    try {
      const faculty = await User.findOneAndDelete({
        _id: req.params.id,
        role: "faculty",
      });

      if (!faculty) {
        return res.status(404).json({
          success: false,
          message: "Faculty not found.",
        });
      }

      res.status(200).json({
        success: true,
        message: "Faculty deleted successfully.",
      });
    } catch (error) {
      console.error("Delete Faculty Error:", error);

      res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  }
);

// =====================================================
// EXPORT ROUTER
// =====================================================

module.exports = router;


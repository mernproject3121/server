
const express = require("express");
const router = express.Router();

const bcrypt = require("bcryptjs");
const User = require("../models/User");

const authMiddleware = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");

// ==========================================
// CHANGE ADMIN PASSWORD
// IMPORTANT: Keep this route before /:id
// ==========================================

router.put(
  "/change-password",
  authMiddleware,
  roleMiddleware("admin"),
  async (req, res) => {
    try {
      const {
        currentPassword,
        newPassword,
        confirmPassword,
      } = req.body;

      if (!currentPassword || !newPassword || !confirmPassword) {
        return res.status(400).json({
          success: false,
          message: "All password fields are required.",
        });
      }

      if (newPassword.length < 8) {
        return res.status(400).json({
          success: false,
          message: "New password must be at least 8 characters.",
        });
      }

      if (newPassword !== confirmPassword) {
        return res.status(400).json({
          success: false,
          message: "New passwords do not match.",
        });
      }

      if (currentPassword === newPassword) {
        return res.status(400).json({
          success: false,
          message: "New password must be different from the current password.",
        });
      }

      const adminId = req.user?.id || req.user?._id;

      if (!adminId) {
        return res.status(401).json({
          success: false,
          message: "Admin authentication is required.",
        });
      }

      const admin = await User.findOne({
        _id: adminId,
        role: "admin",
      }).select("+password");

      if (!admin) {
        return res.status(404).json({
          success: false,
          message: "Admin account not found.",
        });
      }

      if (!admin.password) {
        return res.status(500).json({
          success: false,
          message: "Stored password could not be verified. Check the User model.",
        });
      }

      const isMatch = await bcrypt.compare(
        currentPassword,
        admin.password
      );

      if (!isMatch) {
        return res.status(400).json({
          success: false,
          message: "Current password is incorrect.",
        });
      }

      admin.password = await bcrypt.hash(newPassword, 10);
      await admin.save();

      return res.status(200).json({
        success: true,
        message: "Password changed successfully.",
      });
    } catch (error) {
      console.error("Change admin password error:", error);

      return res.status(500).json({
        success: false,
        message: "Unable to change password. Please try again.",
      });
    }
  }
);

// ==========================================
// GET ALL ADMINS
// ==========================================

router.get(
  "/",
  authMiddleware,
  roleMiddleware("admin"),
  async (req, res) => {
    try {
      const admins = await User.find({
        role: "admin",
      }).select("-password");

      return res.json(admins);
    } catch (error) {
      console.error("Get admins error:", error);

      return res.status(500).json({
        message: "Unable to fetch admins.",
      });
    }
  }
);

// ==========================================
// ADMIN DASHBOARD STATS
// ==========================================

router.get(
  "/stats",
  authMiddleware,
  roleMiddleware("admin"),
  async (req, res) => {
    try {
      const totalStudents = await User.countDocuments({
        role: "student",
      });

      const totalFaculty = await User.countDocuments({
        role: "faculty",
      });

      const totalHODs = await User.countDocuments({
        role: "hod",
      });

      const totalAdmins = await User.countDocuments({
        role: "admin",
      });

      return res.json({
        totalStudents,
        totalFaculty,
        totalHODs,
        totalAdmins,
      });
    } catch (error) {
      console.error("Admin stats error:", error);

      return res.status(500).json({
        message: "Unable to fetch dashboard statistics.",
      });
    }
  }
);

// ==========================================
// GET STUDENTS
// ==========================================

router.get(
  "/users/students",
  authMiddleware,
  roleMiddleware("admin"),
  async (req, res) => {
    try {
      const students = await User.find({
        role: "student",
      }).select("-password");

      return res.json(students);
    } catch (error) {
      console.error("Get students error:", error);

      return res.status(500).json({
        message: "Unable to fetch students.",
      });
    }
  }
);

// ==========================================
// GET FACULTY
// ==========================================

router.get(
  "/users/faculty",
  authMiddleware,
  roleMiddleware("admin"),
  async (req, res) => {
    try {
      const faculty = await User.find({
        role: "faculty",
      }).select("-password");

      return res.json(faculty);
    } catch (error) {
      console.error("Get faculty error:", error);

      return res.status(500).json({
        message: "Unable to fetch faculty.",
      });
    }
  }
);

// ==========================================
// GET HODS
// ==========================================

router.get(
  "/users/hods",
  authMiddleware,
  roleMiddleware("admin"),
  async (req, res) => {
    try {
      const hods = await User.find({
        role: "hod",
      }).select("-password");

      return res.json(hods);
    } catch (error) {
      console.error("Get HODs error:", error);

      return res.status(500).json({
        message: "Unable to fetch HODs.",
      });
    }
  }
);

// ==========================================
// CREATE FIRST ADMIN
// IMPORTANT: Protect this endpoint in production.
// ==========================================

router.post("/", async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;

    if (
      !name?.trim() ||
      !email?.trim() ||
      !phone?.trim() ||
      !password
    ) {
      return res.status(400).json({
        message: "Name, email, phone and password are required.",
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        message: "Password must be at least 8 characters.",
      });
    }

    const cleanEmail = email.toLowerCase().trim();

    const existingAdmin = await User.findOne({
      role: "admin",
    });

    if (existingAdmin) {
      return res.status(400).json({
        message: "An admin already exists.",
      });
    }

    const existingUser = await User.findOne({
      email: cleanEmail,
    });

    if (existingUser) {
      return res.status(400).json({
        message: "Email already exists.",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const admin = await User.create({
      name: name.trim(),
      email: cleanEmail,
      phone: phone.trim(),
      password: hashedPassword,
      role: "admin",
    });

    const safeAdmin = admin.toObject();
    delete safeAdmin.password;

    return res.status(201).json({
      message: "Admin created successfully.",
      admin: safeAdmin,
    });
  } catch (error) {
    console.error("Create admin error:", error);

    return res.status(500).json({
      message: "Unable to create admin.",
    });
  }
});

// ==========================================
// UPDATE ADMIN
// Keep after /change-password
// ==========================================

router.put(
  "/:id",
  authMiddleware,
  roleMiddleware("admin"),
  async (req, res) => {
    try {
      const { name, email, phone } = req.body;
      const updateData = {};

      if (name !== undefined) {
        if (typeof name !== "string" || !name.trim()) {
          return res.status(400).json({
            message: "Name cannot be empty.",
          });
        }

        updateData.name = name.trim();
      }

      if (email !== undefined) {
        if (typeof email !== "string" || !email.trim()) {
          return res.status(400).json({
            message: "Email cannot be empty.",
          });
        }

        updateData.email = email.toLowerCase().trim();
      }

      if (phone !== undefined) {
        if (typeof phone !== "string") {
          return res.status(400).json({
            message: "Invalid phone number.",
          });
        }

        updateData.phone = phone.trim();
      }

      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({
          message: "No valid fields provided to update.",
        });
      }

      const admin = await User.findOneAndUpdate(
        {
          _id: req.params.id,
          role: "admin",
        },
        updateData,
        {
          new: true,
          runValidators: true,
        }
      ).select("-password");

      if (!admin) {
        return res.status(404).json({
          message: "Admin not found.",
        });
      }

      return res.json({
        message: "Admin updated successfully.",
        admin,
      });
    } catch (error) {
      console.error("Update admin error:", error);

      return res.status(400).json({
        message: error.message || "Unable to update admin.",
      });
    }
  }
);

// ==========================================
// DELETE ADMIN
// ==========================================

router.delete(
  "/:id",
  authMiddleware,
  roleMiddleware("admin"),
  async (req, res) => {
    try {
      const loggedInAdminId = String(
        req.user?.id || req.user?._id || ""
      );

      if (loggedInAdminId === req.params.id) {
        return res.status(400).json({
          message: "You cannot delete the currently logged-in admin.",
        });
      }

      const admin = await User.findOneAndDelete({
        _id: req.params.id,
        role: "admin",
      });

      if (!admin) {
        return res.status(404).json({
          message: "Admin not found.",
        });
      }

      return res.json({
        message: "Admin deleted successfully.",
      });
    } catch (error) {
      console.error("Delete admin error:", error);

      return res.status(400).json({
        message: error.message || "Unable to delete admin.",
      });
    }
  }
);

// ==========================================
// EXPORT ROUTER
// ==========================================

module.exports = router;

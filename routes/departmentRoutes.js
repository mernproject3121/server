const express = require("express");
const router = express.Router();

const Department = require("../models/Department");
const User = require("../models/User");

const authMiddleware = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");

// =====================================================
// PUBLIC DEPARTMENTS FOR SIGNUP
// No login required
// Only ACTIVE departments
// Student + Faculty signup ke liye
// =====================================================

router.get("/signup", async (req, res) => {
  try {
    const departments = await Department.find(
      {
        status: "Active",
      },
      {
        _id: 1,
        name: 1,
        code: 1,
        shortName: 1,
      }
    ).sort({
      name: 1,
    });

    res.status(200).json(departments);
  } catch (error) {
    console.error(
      "Get Signup Departments Error:",
      error
    );

    res.status(500).json({
      message: "Failed to load departments",
    });
  }
});

// =====================================================
// AVAILABLE DEPARTMENTS FOR HOD SIGNUP
// No login required
// Only ACTIVE departments
// Department jiska HOD already hai -> exclude
// =====================================================

router.get("/hod-available", async (req, res) => {
  try {
    // Get all active departments
    const departments = await Department.find(
      {
        status: "Active",
      },
      {
        _id: 1,
        name: 1,
        code: 1,
        shortName: 1,
      }
    ).sort({
      name: 1,
    });

    // Get departments already having HOD
    const existingHods = await User.find(
      {
        role: "hod",
      },
      {
        department: 1,
      }
    );

    // Convert HOD departments to lowercase
    const hodDepartments = existingHods.map(
      (hod) =>
        hod.department?.trim().toLowerCase()
    );

    // Remove departments which already have HOD
    const availableDepartments =
      departments.filter(
        (department) =>
          !hodDepartments.includes(
            department.name
              .trim()
              .toLowerCase()
          )
      );

    res.status(200).json(
      availableDepartments
    );
  } catch (error) {
    console.error(
      "Get Available HOD Departments Error:",
      error
    );

    res.status(500).json({
      message:
        "Failed to load available departments",
    });
  }
});

// =====================================================
// GET ALL DEPARTMENTS
// ADMIN + HOD + FACULTY
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
      const departments =
        await Department.find().sort({
          name: 1,
        });

      res.status(200).json(departments);
    } catch (error) {
      console.error(
        "Get Departments Error:",
        error
      );

      res.status(500).json({
        message: error.message,
      });
    }
  }
);

// =====================================================
// GET SINGLE DEPARTMENT
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
      const department =
        await Department.findById(
          req.params.id
        );

      if (!department) {
        return res.status(404).json({
          message:
            "Department not found",
        });
      }

      res.status(200).json(department);
    } catch (error) {
      console.error(
        "Get Department Error:",
        error
      );

      res.status(500).json({
        message: error.message,
      });
    }
  }
);

// =====================================================
// ADD DEPARTMENT
// ADMIN ONLY
// =====================================================

router.post(
  "/",
  authMiddleware,
  roleMiddleware("admin"),
  async (req, res) => {
    try {
      const {
        code,
        name,
        shortName,
        description,
        icon,
        status,
      } = req.body;

      // =================================================
      // REQUIRED FIELDS
      // =================================================

      if (
        !code ||
        !name ||
        !shortName
      ) {
        return res.status(400).json({
          message:
            "Code, name and short name are required",
        });
      }

      // =================================================
      // CLEAN DATA
      // =================================================

      const cleanCode =
        code.trim().toUpperCase();

      const cleanName =
        name.trim();

      const cleanShortName =
        shortName
          .trim()
          .toUpperCase();

      // =================================================
      // DUPLICATE CODE
      // =================================================

      const existingCode =
        await Department.findOne({
          code: cleanCode,
        });

      if (existingCode) {
        return res.status(400).json({
          message:
            "Department code already exists",
        });
      }

      // =================================================
      // DUPLICATE NAME
      // =================================================

      const existingName =
        await Department.findOne({
          name: cleanName,
        });

      if (existingName) {
        return res.status(400).json({
          message:
            "Department name already exists",
        });
      }

      // =================================================
      // CREATE DEPARTMENT
      // =================================================

      const department =
        await Department.create({
          code: cleanCode,

          name: cleanName,

          shortName:
            cleanShortName,

          description:
            description?.trim() || "",

          icon:
            icon?.trim() || "🏛️",

          status:
            status || "Active",
        });

      res.status(201).json({
        message:
          "Department added successfully",

        department,
      });
    } catch (error) {
      console.error(
        "Add Department Error:",
        error
      );

      res.status(500).json({
        message: error.message,
      });
    }
  }
);

// =====================================================
// UPDATE DEPARTMENT
// ADMIN ONLY
// =====================================================

router.put(
  "/:id",
  authMiddleware,
  roleMiddleware("admin"),
  async (req, res) => {
    try {
      const {
        code,
        name,
        shortName,
        description,
        icon,
        status,
      } = req.body;

      const department =
        await Department.findById(
          req.params.id
        );

      if (!department) {
        return res.status(404).json({
          message:
            "Department not found",
        });
      }

      // =================================================
      // UPDATE CODE
      // =================================================

      if (code) {
        const cleanCode =
          code
            .trim()
            .toUpperCase();

        const duplicateCode =
          await Department.findOne({
            code: cleanCode,

            _id: {
              $ne: req.params.id,
            },
          });

        if (duplicateCode) {
          return res.status(400).json({
            message:
              "Department code already exists",
          });
        }

        department.code =
          cleanCode;
      }

      // =================================================
      // UPDATE NAME
      // =================================================

      if (name) {
        const cleanName =
          name.trim();

        const duplicateName =
          await Department.findOne({
            name: cleanName,

            _id: {
              $ne: req.params.id,
            },
          });

        if (duplicateName) {
          return res.status(400).json({
            message:
              "Department name already exists",
          });
        }

        department.name =
          cleanName;
      }

      // =================================================
      // UPDATE SHORT NAME
      // =================================================

      if (shortName) {
        department.shortName =
          shortName
            .trim()
            .toUpperCase();
      }

      // =================================================
      // UPDATE DESCRIPTION
      // =================================================

      if (
        description !==
        undefined
      ) {
        department.description =
          description.trim();
      }

      // =================================================
      // UPDATE ICON
      // =================================================

      if (icon !== undefined) {
        department.icon =
          icon.trim();
      }

      // =================================================
      // UPDATE STATUS
      // =================================================

      if (status) {
        department.status =
          status;
      }

      await department.save();

      res.status(200).json({
        message:
          "Department updated successfully",

        department,
      });
    } catch (error) {
      console.error(
        "Update Department Error:",
        error
      );

      res.status(500).json({
        message: error.message,
      });
    }
  }
);

// =====================================================
// DELETE DEPARTMENT
// ADMIN ONLY
// =====================================================

router.delete(
  "/:id",
  authMiddleware,
  roleMiddleware("admin"),
  async (req, res) => {
    try {
      const department =
        await Department.findByIdAndDelete(
          req.params.id
        );

      if (!department) {
        return res.status(404).json({
          message:
            "Department not found",
        });
      }

      res.status(200).json({
        message:
          "Department deleted successfully",
      });
    } catch (error) {
      console.error(
        "Delete Department Error:",
        error
      );

      res.status(500).json({
        message: error.message,
      });
    }
  }
);

// =====================================================
// EXPORT ROUTER
// =====================================================

module.exports = router;
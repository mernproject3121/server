const express = require("express");
const router = express.Router();

const FacultyLeave = require("../models/FacultyLeave");
const User = require("../models/User");


// =====================================================
// ADD FACULTY LEAVE
// POST /api/faculty-leaves
// =====================================================

router.post("/", async (req, res) => {
  try {
    const {
      faculty,
      date,
      startTime,
      endTime,
      reason,
      status,
    } = req.body;

    if (!faculty || !date || !startTime || !endTime) {
      return res.status(400).json({
        message: "Faculty, date, start time and end time are required",
      });
    }

    const facultyUser = await User.findById(faculty);

    if (!facultyUser) {
      return res.status(404).json({
        message: "Faculty not found",
      });
    }

    if (facultyUser.role !== "faculty") {
      return res.status(400).json({
        message: "Selected user is not a faculty",
      });
    }

    const existingLeave = await FacultyLeave.findOne({
      faculty,
      date: new Date(date),
      startTime,
      endTime,
    });

    if (existingLeave) {
      return res.status(400).json({
        message: "Leave already exists for this faculty at this time",
      });
    }

    const leave = new FacultyLeave({
      faculty,
      date,
      startTime,
      endTime,
      reason: reason || "",
      status: status || "Pending",
    });

    await leave.save();

    const populatedLeave = await FacultyLeave.findById(leave._id).populate(
      "faculty",
      "name email phone"
    );

    res.status(201).json({
      message: "Faculty leave added successfully",
      leave: populatedLeave,
    });
  } catch (error) {
    console.error("ADD FACULTY LEAVE ERROR:", error);

    res.status(500).json({
      message: "Failed to add faculty leave",
      error: error.message,
    });
  }
});


// =====================================================
// GET ALL FACULTY LEAVES
// GET /api/faculty-leaves
// =====================================================

router.get("/", async (req, res) => {
  try {
    const leaves = await FacultyLeave.find()
      .populate("faculty", "name email phone")
      .sort({ date: 1, startTime: 1 });

    res.status(200).json(leaves);
  } catch (error) {
    console.error("GET FACULTY LEAVES ERROR:", error);

    res.status(500).json({
      message: "Failed to fetch faculty leaves",
      error: error.message,
    });
  }
});


// =====================================================
// GET SINGLE FACULTY LEAVE
// GET /api/faculty-leaves/:id
// =====================================================

router.get("/:id", async (req, res) => {
  try {
    const leave = await FacultyLeave.findById(req.params.id).populate(
      "faculty",
      "name email phone"
    );

    if (!leave) {
      return res.status(404).json({
        message: "Faculty leave not found",
      });
    }

    res.status(200).json(leave);
  } catch (error) {
    console.error("GET SINGLE FACULTY LEAVE ERROR:", error);

    res.status(500).json({
      message: "Failed to fetch faculty leave",
      error: error.message,
    });
  }
});


// =====================================================
// UPDATE FACULTY LEAVE
// PUT /api/faculty-leaves/:id
// =====================================================

router.put("/:id", async (req, res) => {
  try {
    const {
      faculty,
      date,
      startTime,
      endTime,
      reason,
      status,
    } = req.body;

    const leave = await FacultyLeave.findById(req.params.id);

    if (!leave) {
      return res.status(404).json({
        message: "Faculty leave not found",
      });
    }

    if (faculty) {
      const facultyUser = await User.findById(faculty);

      if (!facultyUser) {
        return res.status(404).json({
          message: "Faculty not found",
        });
      }

      if (facultyUser.role !== "faculty") {
        return res.status(400).json({
          message: "Selected user is not a faculty",
        });
      }

      leave.faculty = faculty;
    }

    if (date) {
      leave.date = date;
    }

    if (startTime) {
      leave.startTime = startTime;
    }

    if (endTime) {
      leave.endTime = endTime;
    }

    if (reason !== undefined) {
      leave.reason = reason;
    }

    if (status) {
      leave.status = status;
    }

    const duplicateLeave = await FacultyLeave.findOne({
      _id: { $ne: req.params.id },
      faculty: leave.faculty,
      date: leave.date,
      startTime: leave.startTime,
      endTime: leave.endTime,
    });

    if (duplicateLeave) {
      return res.status(400).json({
        message: "Another leave already exists for this faculty at this time",
      });
    }

    await leave.save();

    const updatedLeave = await FacultyLeave.findById(leave._id).populate(
      "faculty",
      "name email phone"
    );

    res.status(200).json({
      message: "Faculty leave updated successfully",
      leave: updatedLeave,
    });
  } catch (error) {
    console.error("UPDATE FACULTY LEAVE ERROR:", error);

    res.status(500).json({
      message: "Failed to update faculty leave",
      error: error.message,
    });
  }
});


// =====================================================
// DELETE FACULTY LEAVE
// DELETE /api/faculty-leaves/:id
// =====================================================

router.delete("/:id", async (req, res) => {
  try {
    const leave = await FacultyLeave.findById(req.params.id);

    if (!leave) {
      return res.status(404).json({
        message: "Faculty leave not found",
      });
    }

    await FacultyLeave.findByIdAndDelete(req.params.id);

    res.status(200).json({
      message: "Faculty leave deleted successfully",
    });
  } catch (error) {
    console.error("DELETE FACULTY LEAVE ERROR:", error);

    res.status(500).json({
      message: "Failed to delete faculty leave",
      error: error.message,
    });
  }
});


module.exports = router;
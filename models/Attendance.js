const mongoose = require("mongoose");

const attendanceSchema = new mongoose.Schema(
  {
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    studentName: {
      type: String,
      required: true,
      trim: true,
    },

    facultyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    facultyName: {
      type: String,
      required: true,
      trim: true,
    },

    // ==========================================
    // TIMETABLE / LECTURE REFERENCE
    // ==========================================

    timetableId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Timetable",
      required: true,
    },

    department: {
      type: String,
      required: true,
      trim: true,
    },

    course: {
      type: String,
      trim: true,
      default: "",
    },

    semester: {
      type: String,
      trim: true,
      default: "",
    },

    date: {
      type: String,
      required: true,
    },

    status: {
      type: String,
      enum: [
        "Present",
        "Absent",
        "Late",
      ],
      required: true,
    },
  },
  {
    timestamps: true,
  }
);


// =====================================================
// UNIQUE ATTENDANCE
// Same student + same date + same lecture
// =====================================================

attendanceSchema.index(
  {
    studentId: 1,
    date: 1,
    timetableId: 1,
  },
  {
    unique: true,
  }
);


module.exports =
  mongoose.model(
    "Attendance",
    attendanceSchema
  );
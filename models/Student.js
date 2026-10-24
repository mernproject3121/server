const mongoose = require("mongoose");

const studentSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    email: {
      type: String,
      required: true,
      trim: true,
    },

    phone: {
      type: String,
      trim: true,
    },

    course: {
      type: String,
      trim: true,
    },

    semester: {
      type: String,
      trim: true,
    },

    enrollmentNo: {
      type: String,
      trim: true,
    },

    // =========================
    // NEW FIELDS
    // =========================

    department: {
      type: String,
      required: true,
      trim: true,
    },

    attendance: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },

    cgpa: {
      type: Number,
      default: 0,
      min: 0,
      max: 10,
    },

    status: {
      type: String,
      enum: ["Active", "Inactive"],
      default: "Active",
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Student", studentSchema);
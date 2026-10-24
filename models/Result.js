const mongoose = require("mongoose");

const resultSchema = new mongoose.Schema(
  {
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    studentCode: {
      type: String,
      required: true,
      trim: true,
    },

    studentName: {
      type: String,
      required: true,
      trim: true,
    },

    department: {
      type: String,
      required: true,
      trim: true,
    },

    course: {
      type: String,
      required: true,
      trim: true,
    },

    semester: {
      type: String,
      required: true,
      trim: true,
    },

    subject: {
      type: String,
      required: true,
      trim: true,
    },

    // ========================================================
    // EXAM TYPE
    // ========================================================

    examType: {
      type: String,
      enum: [
        "End Semester",
        "Internal Assessment",
        "Practical Exam",
        "Unit Test",
      ],
      default: "End Semester",
    },

    // ========================================================
    // INTERNAL - 50
    // ========================================================

    internalExam: {
      type: Number,
      min: 0,
      max: 30,
      default: null,
    },

    attendance: {
      type: Number,
      min: 0,
      max: 10,
      default: null,
    },

    activity: {
      type: Number,
      min: 0,
      max: 10,
      default: null,
    },

    internalTotal: {
      type: Number,
      min: 0,
      max: 50,
      default: 0,
    },

    // ========================================================
    // EXTERNAL - 50
    // ========================================================

    externalExam: {
      type: Number,
      min: 0,
      max: 50,
      default: null,
    },

    externalTotal: {
      type: Number,
      min: 0,
      max: 50,
      default: 0,
    },

    // ========================================================
    // FINAL - 100
    // ========================================================

    total: {
      type: Number,
      min: 0,
      max: 100,
      default: 0,
    },

    grade: {
      type: String,
      default: "Pending",
      trim: true,
    },

    status: {
      type: String,
      default: "Pending",
      trim: true,
    },

    // ========================================================
    // FACULTY
    // ========================================================

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
  },

  {
    timestamps: true,
  }
);

// ============================================================
// IMPORTANT
//
// ONE RESULT PER:
// Student + Semester + Subject
//
// examType ko unique key me nahi rakha.
//
// Example:
//
// ADA + Semester 7
//        ↓
//   ONE DOCUMENT
//        ↓
// Internal = 25/50
// External = 40/50
// Total    = 65/100
//
// Isse ADA ki 2 rows nahi banengi.
// ============================================================

resultSchema.index(
  {
    studentId: 1,
    semester: 1,
    subject: 1,
  },
  {
    unique: true,
    name: "student_semester_subject_unique",
  }
);

module.exports = mongoose.model(
  "Result",
  resultSchema
);
const mongoose = require("mongoose");

// =====================================================
// STUDENT SUBMISSION SCHEMA
// =====================================================

const submissionSchema = new mongoose.Schema(
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

    fileName: {
      type: String,
      required: true,
      trim: true,
    },

    filePath: {
      type: String,
      required: true,
      trim: true,
    },

    fileType: {
      type: String,
      default: "application/pdf",
      trim: true,
    },

    submittedAt: {
      type: Date,
      default: Date.now,
    },

    status: {
      type: String,
      enum: ["Submitted", "Reviewed"],
      default: "Submitted",
    },

    marks: {
      type: Number,
      min: 0,
      max: 100,
      default: null,
    },

    feedback: {
      type: String,
      trim: true,
      default: "",
    },
  },
  {
    _id: true,
  }
);

// =====================================================
// ASSIGNMENT SCHEMA
// =====================================================

const assignmentSchema = new mongoose.Schema(
  {
    // =================================================
    // BASIC ASSIGNMENT INFORMATION
    // =================================================

    title: {
      type: String,
      required: true,
      trim: true,
    },

    subject: {
      type: String,
      required: true,
      trim: true,
    },

    description: {
      type: String,
      trim: true,
      default: "",
    },

    // =================================================
    // DEPARTMENT / SEMESTER
    // Course is NOT used in assignments
    // Matching = Department + Semester
    // =================================================

    department: {
      type: String,
      required: true,
      trim: true,
    },

    semester: {
      type: String,
      required: true,
      trim: true,
    },

    // =================================================
    // DUE DATE
    // =================================================

    dueDate: {
      type: Date,
      required: true,
    },

    // =================================================
    // ASSIGNMENT STATUS
    // =================================================

    status: {
      type: String,
      enum: ["Active", "Review", "Completed"],
      default: "Active",
    },

    // =================================================
    // FACULTY INFORMATION
    // =================================================

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

    // =================================================
    // FACULTY ASSIGNMENT PDF
    // =================================================

    assignmentFile: {
      fileName: {
        type: String,
        trim: true,
        default: "",
      },

      filePath: {
        type: String,
        trim: true,
        default: "",
      },

      fileType: {
        type: String,
        trim: true,
        default: "application/pdf",
      },
    },

    // =================================================
    // STUDENT SUBMISSIONS
    // =================================================

    studentSubmissions: {
      type: [submissionSchema],
      default: [],
    },

    // =================================================
    // COUNTS
    // =================================================

    submissions: {
      type: Number,
      default: 0,
    },

    totalStudents: {
      type: Number,
      default: 0,
    },
  },

  // ===================================================
  // TIMESTAMPS
  // ===================================================

  {
    timestamps: true,
  }
);

// =====================================================
// INDEX
// One student can have one submission
// for the same assignment
// =====================================================

assignmentSchema.index({
  _id: 1,
  "studentSubmissions.studentId": 1,
});

// =====================================================
// EXPORT MODEL
// =====================================================

module.exports = mongoose.model(
  "Assignment",
  assignmentSchema
);
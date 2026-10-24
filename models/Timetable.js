const mongoose = require("mongoose");

const timetableSchema = new mongoose.Schema(
  {
    // =====================================================
    // DAY
    // =====================================================

    day: {
      type: String,
      enum: [
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
      ],
      required: true,
      trim: true,
    },

    // =====================================================
    // TIME
    // =====================================================

    startTime: {
      type: String,
      required: true,
      trim: true,
    },

    endTime: {
      type: String,
      required: true,
      trim: true,
    },

    // =====================================================
    // COURSE
    // Reference to Course collection
    // =====================================================

    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: true,
    },

    // =====================================================
    // FACULTY
    // Reference to User collection
    // =====================================================

    faculty: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // =====================================================
    // DEPARTMENT
    //
    // Timetable stores department value as String.
    // Course itself stores Department as ObjectId.
    // The route handles the Course -> Department mapping.
    // =====================================================

    department: {
      type: String,
      required: true,
      trim: true,
    },

    // =====================================================
    // SEMESTER
    // =====================================================

    semester: {
      type: String,
      required: true,
      trim: true,
    },

    // =====================================================
    // ACADEMIC YEAR
    // Example: 2026-27
    // =====================================================

    academicYear: {
      type: String,
      required: true,
      trim: true,
    },

    // =====================================================
    // ROOM
    // =====================================================

    room: {
      type: String,
      required: true,
      trim: true,
    },

    // =====================================================
    // CLASS TYPE
    // =====================================================

    type: {
      type: String,
      enum: ["Lecture", "Practical", "Activity"],
      default: "Lecture",
    },

    // =====================================================
    // WEEKLY LECTURES
    // =====================================================

    weeklyLectures: {
      type: Number,
      min: 1,
      max: 20,
      default: 1,
    },

    // =====================================================
    // CREDITS
    // =====================================================

    credits: {
      type: Number,
      min: 1,
      max: 20,
      default: 1,
    },

    // =====================================================
    // STATUS
    // =====================================================

    status: {
      type: String,
      enum: [
        "Scheduled",
        "Cancelled",
        "Rescheduled",
      ],
      default: "Scheduled",
    },

    // =====================================================
    // REPLACEMENT FACULTY
    // =====================================================

    replacementFaculty: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    // =====================================================
    // NOTES
    // =====================================================

    notes: {
      type: String,
      trim: true,
      default: "",
    },
  },

  {
    timestamps: true,
  }
);

// =====================================================
// INDEXES
// =====================================================

// Same faculty cannot normally have
// two classes at the same day and time.

timetableSchema.index({
  faculty: 1,
  day: 1,
  startTime: 1,
  endTime: 1,
});

// Same room cannot normally have
// two classes at the same day and time.

timetableSchema.index({
  room: 1,
  day: 1,
  startTime: 1,
  endTime: 1,
});

// Same department + semester cannot normally have
// two classes at the same day and time.

timetableSchema.index({
  department: 1,
  semester: 1,
  day: 1,
  startTime: 1,
  endTime: 1,
});

// =====================================================
// MODEL
// =====================================================

module.exports = mongoose.model(
  "Timetable",
  timetableSchema
);

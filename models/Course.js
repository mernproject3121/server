const mongoose = require("mongoose");

const courseSchema = new mongoose.Schema(
  {
    // ==========================================
    // SUBJECT NAME
    // Example: ADA, BDA, AI
    // ==========================================
    name: {
      type: String,
      required: true,
      trim: true,
    },

    // ==========================================
    // COURSE CODE
    // Example: IT, MCA
    // Comes from Department
    // ==========================================
    courseCode: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },

    // ==========================================
    // SUBJECT CODE
    // Example: IT-701, IT-702
    // ==========================================
    subjectCode: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },

    // ==========================================
    // DEPARTMENT
    // Save Department MongoDB _id
    // ==========================================
    department: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Department",
      required: true,
    },

    // ==========================================
    // DEPARTMENT CODE
    // Example: IT, MCA
    // Saved directly from Department.code
    // ==========================================
    departmentCode: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },

    // ==========================================
    // SEMESTER
    // ==========================================
    semester: {
      type: String,
      required: true,
      trim: true,
    },

    // ==========================================
    // SUBJECT TYPE
    // Theory / Practical / Both
    // ==========================================
    subjectType: {
      type: String,
      enum: ["Theory", "Practical", "Both"],
      default: "Theory",
      required: true,
    },

    // ==========================================
    // CREDITS
    // ==========================================
    credits: {
      type: Number,
      required: true,
      min: 1,
      max: 20,
    },

    // ==========================================
    // FACULTY
    // Save Faculty MongoDB _id
    // ==========================================
    faculty: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    // ==========================================
    // STATUS
    // ==========================================
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

// ==========================================
// INDEXES
// ==========================================

// Same subject code should not be duplicated
courseSchema.index(
  { subjectCode: 1 },
  { unique: true }
);

// Useful for department + semester searching
courseSchema.index({
  department: 1,
  semester: 1,
});

// Useful for faculty courses
courseSchema.index({
  faculty: 1,
});

// Useful for department code searching
courseSchema.index({
  departmentCode: 1,
});

module.exports = mongoose.model("Course", courseSchema);
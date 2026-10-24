const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    // =========================
    // BASIC DETAILS
    // =========================
    name: {
      type: String,
      required: true,
      trim: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    phone: {
      type: String,
      required: true,
      trim: true,
    },

    password: {
      type: String,
      required: true,
    },

    // =========================
    // ROLE
    // =========================
    role: {
      type: String,
      enum: ["student", "faculty", "hod", "admin"],
      default: "student",
    },

    // =========================
    // STUDENT DETAILS
    // =========================
    studentId: {
      type: String,
      trim: true,
      sparse: true,
    },

    course: {
      type: String,
      trim: true,
    },

    semester: {
      type: String,
      trim: true,
    },

    // =========================
    // FACULTY DETAILS
    // =========================
    facultyId: {
      type: String,
      trim: true,
      sparse: true,
    },

    // =========================
    // COMMON ACADEMIC DETAILS
    // =========================
    department: {
      type: String,
      trim: true,
    },

    designation: {
      type: String,
      trim: true,
    },

    qualification: {
      type: String,
      trim: true,
    },

    specialization: {
      type: String,
      trim: true,
    },

    experience: {
      type: String,
      trim: true,
    },

    joiningDate: {
      type: Date,
    },

    // =========================
    // PERSONAL DETAILS
    // =========================
    gender: {
      type: String,
      enum: ["Male", "Female", "Other"],
    },

    dateOfBirth: {
      type: Date,
    },

    bloodGroup: {
      type: String,
      enum: [
        "A+",
        "A-",
        "B+",
        "B-",
        "AB+",
        "AB-",
        "O+",
        "O-",
      ],
    },

    alternatePhone: {
      type: String,
      trim: true,
    },

    // =========================
    // ADDRESS DETAILS
    // =========================
    address: {
      type: String,
      trim: true,
    },

    city: {
      type: String,
      trim: true,
    },

    state: {
      type: String,
      trim: true,
    },

    pincode: {
      type: String,
      trim: true,
    },

    // =========================
    // OTHER
    // =========================
    bio: {
      type: String,
      trim: true,
    },
  },

  {
    timestamps: true,
  }
);

module.exports = mongoose.model("User", userSchema);
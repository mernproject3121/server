const mongoose = require("mongoose");

const facultyLeaveSchema = new mongoose.Schema(
  {
    faculty: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    date: {
      type: Date,
      required: true,
    },

    startTime: {
      type: String,
      required: true,
    },

    endTime: {
      type: String,
      required: true,
    },

    reason: {
      type: String,
      trim: true,
      default: "",
    },

    status: {
      type: String,
      enum: ["Pending", "Approved", "Rejected"],
      default: "Pending",
    },
  },
  {
    timestamps: true,
  }
);

facultyLeaveSchema.index({
  faculty: 1,
  date: 1,
  startTime: 1,
  endTime: 1,
});

module.exports = mongoose.model(
  "FacultyLeave",
  facultyLeaveSchema
);
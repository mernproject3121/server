
const mongoose = require("mongoose");

const feePaymentSchema = new mongoose.Schema(
  {
    fee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Fee",
      required: true,
      index: true,
    },

    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    amount: {
      type: Number,
      required: true,
      min: 1,
    },

    method: {
      type: String,
      enum: ["cash", "cheque", "online", "demo_online"],
      required: true,
    },

    status: {
      type: String,
      enum: ["pending", "success", "failed"],
      default: "success",
    },

    receiptNo: {
      type: String,
      required: true,
      unique: true,
    },

    recordedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    transactionId: {
      type: String,
      default: "",
      trim: true,
    },

    chequeNumber: {
      type: String,
      default: "",
      trim: true,
    },

    note: {
      type: String,
      default: "",
      trim: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("FeePayment", feePaymentSchema);

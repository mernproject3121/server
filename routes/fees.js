
const express = require("express");
const mongoose = require("mongoose");
const crypto = require("crypto");

const Fee = require("../models/Fee");
const FeePayment = require("../models/FeePayment");
const User = require("../models/User");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

router.use(authMiddleware);

const userId = (req) =>
  req.user?._id || req.user?.id || req.user?.userId;

const isAdmin = (req) =>
  String(req.user?.role || "").toLowerCase() === "admin";

const receiptNo = () =>
  `FEE-${Date.now()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;

const clean = (value) =>
  String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");

const aliases = {
  "computer applications": ["computer applications", "bca"],
  bca: ["computer applications", "bca"],
  "business administration": ["business administration", "bba"],
  bba: ["business administration", "bba"],
  "ai & data science": [
    "ai & data science", "ai and data science", "ai & ds", "ai ds", "ai&ds"
  ],
  "ai and data science": [
    "ai & data science", "ai and data science", "ai & ds", "ai ds", "ai&ds"
  ],
  "computer engineering": ["computer engineering", "ce"],
  ce: ["computer engineering", "ce"],
  "information technology": ["information technology", "it"],
  it: ["information technology", "it"],
  "design & digital media": [
    "design & digital media", "design and digital media", "ddm"
  ],
  "design and digital media": [
    "design & digital media", "design and digital media", "ddm"
  ],
};

function departmentMatches(student, selectedDepartment) {
  const wanted = clean(selectedDepartment);
  const accepted = new Set([wanted, ...(aliases[wanted] || [])].map(clean));

  const fields = [
    student.department,
    student.departmentName,
    student.departmentCode,
    student.course,
    student.courseName,
    student.program,
  ];

  return fields.some((value) => {
    if (value && typeof value === "object") {
      value = value.name || value.departmentName || value.code || "";
    }

    const actual = clean(value);
    if (!actual) return false;

    const actualAliases = [actual, ...(aliases[actual] || [])].map(clean);
    return actualAliases.some((item) => accepted.has(item));
  });
}

function validAdmin(req, res) {
  if (isAdmin(req)) return true;

  res.status(403).json({
    success: false,
    message: "Admin access required.",
  });
  return false;
}

function validSemester(value) {
  const sem = Number(value);
  return Number.isInteger(sem) && sem >= 1 && sem <= 8;
}

// GET /api/fees/students
router.get("/students", async (req, res) => {
  if (!validAdmin(req, res)) return;

  try {
    const students = await User.find({ role: "student" })
      .select(
        "name email phone studentId course courseName program semester currentSemester department departmentName departmentCode"
      )
      .sort({ name: 1 })
      .lean();

    res.json({ success: true, students });
  } catch (err) {
    console.error("GET /fees/students:", err);
    res.status(500).json({ success: false, message: "Could not load students." });
  }
});

// GET /api/fees/my
router.get("/my", async (req, res) => {
  try {
    const id = userId(req);

    if (!id || !mongoose.isValidObjectId(id)) {
      return res.status(401).json({ success: false, message: "Invalid user session." });
    }

    const fees = await Fee.find({ student: id })
      .sort({ academicYear: -1, semester: 1 })
      .lean();

    const payments = await FeePayment.find({
      fee: { $in: fees.map((fee) => fee._id) },
      status: "success",
    }).sort({ createdAt: -1 }).lean();

    res.json({ success: true, fees, payments });
  } catch (err) {
    console.error("GET /fees/my:", err);
    res.status(500).json({ success: false, message: "Could not load fees." });
  }
});

// GET /api/fees/all
router.get("/all", async (req, res) => {
  if (!validAdmin(req, res)) return;

  try {
    const fees = await Fee.find()
      .populate(
        "student",
        "name email phone studentId course courseName program semester currentSemester department departmentName departmentCode"
      )
      .sort({ createdAt: -1 })
      .lean();

    res.json({ success: true, fees });
  } catch (err) {
    console.error("GET /fees/all:", err);
    res.status(500).json({ success: false, message: "Could not load fee records." });
  }
});

// POST /api/fees/bulk
// Set one fixed fee for every student in a department + semester + year.
router.post("/bulk", async (req, res) => {
  if (!validAdmin(req, res)) return;

  try {
    const department = String(req.body.department || "").trim();
    const semester = Number(req.body.semester);
    const academicYear = String(req.body.academicYear || "").trim();
    const totalAmount = Number(req.body.totalAmount);

    if (
      !department ||
      !validSemester(semester) ||
      !academicYear ||
      !Number.isFinite(totalAmount) ||
      totalAmount <= 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Enter department, semester (1-8), academic year and a fee greater than zero.",
      });
    }

    const students = await User.find({ role: "student" })
      .select("_id name department departmentName departmentCode course courseName program")
      .lean();

    const matched = students.filter((student) =>
      departmentMatches(student, department)
    );

    if (!matched.length) {
      return res.status(404).json({
        success: false,
        message: "No students found for this department. Check saved department/course values.",
      });
    }

    // Validate all balances before changing any fee record.
    const existingFees = await Fee.find({
      student: { $in: matched.map((student) => student._id) },
      semester,
      academicYear,
    }).lean();

    const existingByStudent = new Map(
      existingFees.map((fee) => [String(fee.student), fee])
    );

    const conflict = matched.find((student) => {
      const fee = existingByStudent.get(String(student._id));
      return fee && totalAmount < Number(fee.paidAmount || 0);
    });

    if (conflict) {
      return res.status(400).json({
        success: false,
        message: `Fee cannot be lower than the amount already paid by ${conflict.name}.`,
      });
    }

    let created = 0;
    let updated = 0;

    for (const student of matched) {
      const existing = existingByStudent.get(String(student._id));

      await Fee.findOneAndUpdate(
        {
          student: student._id,
          semester,
          academicYear,
        },
        {
          $set: { totalAmount },
          $setOnInsert: { paidAmount: 0 },
        },
        { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
      );

      if (existing) updated++;
      else created++;
    }

    res.json({
      success: true,
      message: `Fixed fee saved for ${matched.length} students.`,
      department,
      semester,
      academicYear,
      totalAmount,
      studentCount: matched.length,
      created,
      updated,
    });
  } catch (err) {
    console.error("POST /fees/bulk:", err);
    res.status(500).json({ success: false, message: "Could not save department semester fees." });
  }
});

// POST /api/fees
// Keep the existing single-student fee API for compatibility.
router.post("/", async (req, res) => {
  if (!validAdmin(req, res)) return;

  try {
    const studentId = req.body.studentId;
    const semester = Number(req.body.semester);
    const academicYear = String(req.body.academicYear || "").trim();
    const totalAmount = Number(req.body.totalAmount);

    if (
      !studentId ||
      !mongoose.isValidObjectId(studentId) ||
      !validSemester(semester) ||
      !academicYear ||
      !Number.isFinite(totalAmount) ||
      totalAmount <= 0
    ) {
      return res.status(400).json({ success: false, message: "Invalid fee details." });
    }

    const student = await User.findOne({ _id: studentId, role: "student" });

    if (!student) {
      return res.status(404).json({ success: false, message: "Student not found." });
    }

    const existing = await Fee.findOne({ student: studentId, semester, academicYear });

    if (existing) {
      if (totalAmount < Number(existing.paidAmount || 0)) {
        return res.status(400).json({
          success: false,
          message: "Total fee cannot be less than the amount already paid.",
        });
      }

      existing.totalAmount = totalAmount;
      await existing.save();
      return res.json({ success: true, fee: existing, message: "Fee updated." });
    }

    const fee = await Fee.create({
      student: studentId,
      semester,
      academicYear,
      totalAmount,
      paidAmount: 0,
    });

    res.status(201).json({ success: true, fee, message: "Fee created." });
  } catch (err) {
    console.error("POST /fees:", err);
    res.status(500).json({ success: false, message: "Could not save fee." });
  }
});

// POST /api/fees/:id/pay
// Cash/Cheque are recorded by admin. Online requires a verified gateway.
router.post("/:id/pay", async (req, res) => {
  if (!validAdmin(req, res)) return;

  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ success: false, message: "Invalid fee ID." });
  }

  try {
    const method = String(req.body.method || "").toLowerCase();
    const amount = Number(req.body.amount);
    const note = String(req.body.note || "").slice(0, 300);
    const chequeNumber = String(req.body.chequeNumber || "").trim();

    if (method === "online") {
      return res.status(501).json({
        success: false,
        message: "Real online payments are not configured. Connect a payment gateway before accepting online payments.",
      });
    }

    if (!["cash", "cheque"].includes(method)) {
      return res.status(400).json({ success: false, message: "Choose Cash or Cheque." });
    }

    if (method === "cheque" && !chequeNumber) {
      return res.status(400).json({ success: false, message: "Enter the cheque number." });
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ success: false, message: "Enter a valid amount." });
    }

    const fee = await Fee.findById(req.params.id);

    if (!fee) {
      return res.status(404).json({ success: false, message: "Fee record not found." });
    }

    const balance = Number(fee.totalAmount || 0) - Number(fee.paidAmount || 0);

    if (balance <= 0 || amount > balance) {
      return res.status(400).json({
        success: false,
        message: balance <= 0 ? "Fee is already fully paid." : "Amount exceeds pending balance.",
      });
    }

    const updated = await Fee.findOneAndUpdate(
      { _id: fee._id, paidAmount: fee.paidAmount },
      { $inc: { paidAmount: amount } },
      { new: true, runValidators: true }
    );

    if (!updated) {
      return res.status(409).json({ success: false, message: "Fee changed. Refresh and retry." });
    }

    try {
      const payment = await FeePayment.create({
        fee: fee._id,
        student: fee.student,
        amount,
        method,
        status: "success",
        receiptNo: receiptNo(),
        recordedBy: userId(req),
        chequeNumber: method === "cheque" ? chequeNumber : "",
        note,
      });

      return res.json({
        success: true,
        message: `${method === "cash" ? "Cash" : "Cheque"} payment recorded.`,
        fee: updated,
        payment,
      });
    } catch (paymentError) {
      await Fee.findOneAndUpdate(
        { _id: fee._id, paidAmount: updated.paidAmount },
        { $inc: { paidAmount: -amount } }
      );
      throw paymentError;
    }
  } catch (err) {
    console.error("POST /fees/:id/pay:", err);
    res.status(500).json({ success: false, message: "Could not record payment." });
  }
});

// Legacy cash endpoint.
router.post("/:id/cash", async (req, res) => {
  req.body.method = "cash";
  req.url = `/${req.params.id}/pay`;
  return router.handle(req, res);
});

// Demo endpoint retained for existing student UI.
// DEMO ONLY: does not transfer real money.
router.post("/:id/demo-pay", async (req, res) => {
  const id = userId(req);

  if (!id || !mongoose.isValidObjectId(id) || !mongoose.isValidObjectId(req.params.id)) {
    return res.status(401).json({ success: false, message: "Invalid user session or fee ID." });
  }

  try {
    const fee = await Fee.findOne({ _id: req.params.id, student: id });

    if (!fee) return res.status(404).json({ success: false, message: "Fee not found." });

    const amount = Number(fee.totalAmount || 0) - Number(fee.paidAmount || 0);

    if (amount <= 0) return res.status(400).json({ success: false, message: "No pending fees." });

    const updated = await Fee.findOneAndUpdate(
      { _id: fee._id, paidAmount: fee.paidAmount },
      { $inc: { paidAmount: amount } },
      { new: true, runValidators: true }
    );

    if (!updated) return res.status(409).json({ success: false, message: "Fee changed. Refresh and retry." });

    try {
      const payment = await FeePayment.create({
        fee: fee._id,
        student: fee.student,
        amount,
        method: "demo_online",
        status: "success",
        receiptNo: receiptNo(),
        recordedBy: null,
        note: "DEMO ONLY — no real money transferred",
      });

      res.json({
        success: true,
        demo: true,
        message: "Demo payment recorded. No real money transferred.",
        fee: updated,
        payment,
      });
    } catch (paymentError) {
      await Fee.findOneAndUpdate(
        { _id: fee._id, paidAmount: updated.paidAmount },
        { $inc: { paidAmount: -amount } }
      );
      throw paymentError;
    }
  } catch (err) {
    console.error("POST /fees/:id/demo-pay:", err);
    res.status(500).json({ success: false, message: "Could not process demo payment." });
  }
});

// GET /api/fees/:id/payments
router.get("/:id/payments", async (req, res) => {
  if (!validAdmin(req, res)) return;

  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ success: false, message: "Invalid fee ID." });
  }

  try {
    const payments = await FeePayment.find({ fee: req.params.id })
      .populate("recordedBy", "name email")
      .sort({ createdAt: -1 })
      .lean();

    res.json({ success: true, payments });
  } catch (err) {
    console.error("GET /fees/:id/payments:", err);
    res.status(500).json({ success: false, message: "Could not load payment history." });
  }
});

module.exports = router;

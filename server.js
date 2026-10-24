
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");

require("dotenv").config();

const app = express();

// =====================================================
// CORS
// =====================================================

app.use(
  cors({
    origin: "http://localhost:3000",
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// =====================================================
// MIDDLEWARE
// =====================================================

app.use(express.json({ limit: "2mb" }));

// =====================================================
// UPLOADS
// =====================================================

app.use(
  "/uploads",
  express.static(path.join(__dirname, "uploads"))
);

// =====================================================
// TEST ROUTE
// =====================================================

app.get("/", (req, res) => {
  res.send("Smart College ERP Backend is Running!");
});

// =====================================================
// ROUTES IMPORT
// =====================================================

const studentRoutes = require("./routes/studentRoutes");
const facultyRoutes = require("./routes/facultyRoutes");
const hodRoutes = require("./routes/hodRoutes");
const adminRoutes = require("./routes/adminRoutes");
const authRoutes = require("./routes/auth");

const courseRoutes = require("./routes/courseRoutes");
const timetableRoutes = require("./routes/timetableRoutes");
const departmentRoutes = require("./routes/departmentRoutes");

const assignmentRoutes = require("./routes/assignmentRoutes");
const attendanceRoutes = require("./routes/attendanceRoutes");
const facultyLeaveRoutes = require("./routes/facultyLeaveRoutes");

const resultRoutes = require("./routes/resultRoutes");
const aiRoutes = require("./routes/aiRoutes");

// OTP routes
const otpRoutes = require("./routes/otp");

// Fees Management routes
const feesRoutes = require("./routes/fees");

// =====================================================
// API ROUTES
// =====================================================

app.use("/api/students", studentRoutes);
app.use("/api/faculty", facultyRoutes);
app.use("/api/hod", hodRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/auth", authRoutes);

app.use("/api/courses", courseRoutes);
app.use("/api/timetable", timetableRoutes);
app.use("/api/departments", departmentRoutes);

app.use("/api/assignments", assignmentRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api/faculty-leaves", facultyLeaveRoutes);

app.use("/api/results", resultRoutes);
app.use("/api/ai", aiRoutes);

// OTP
app.use("/api/otp", otpRoutes);

// Fees Management
app.use("/api/fees", feesRoutes);

// =====================================================
// 404 API ROUTE
// =====================================================

app.use((req, res, next) => {
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({
      success: false,
      message: "API route not found",
      path: req.path,
    });
  }

  next();
});

// =====================================================
// GLOBAL ERROR HANDLER
// =====================================================

app.use((err, req, res, next) => {
  console.error("Server Error:", err);

  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Internal Server Error",
  });
});

// =====================================================
// MONGODB CONNECTION
// =====================================================

if (!process.env.MONGO_URI) {
  console.error("MongoDB Connection Error: MONGO_URI is missing in server/.env");
  process.exit(1);
}

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log("MongoDB Connected Successfully!");
    console.log("Database:", mongoose.connection.name);

    const PORT = process.env.PORT || 5000;

    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
      console.log(
        `Uploads available at http://localhost:${PORT}/uploads`
      );
    });
  })
  .catch((error) => {
    console.error("MongoDB Connection Error:", error.message);
    process.exit(1);
  });

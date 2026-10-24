
const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

const User = require("../models/User");
const Department = require("../models/Department");

const authMiddleware = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");

const {
  sendWelcomeEmail,
  sendPasswordResetOtp,
} = require("../utils/emailService");

const router = express.Router();

// =====================================================
// HELPERS
// =====================================================

const normalizePhone = (value = "") => {
  let phone = String(value).trim().replace(/[\s()-]/g, "");

  if (phone.startsWith("+91")) {
    phone = phone.slice(3);
  } else if (phone.startsWith("91") && phone.length === 12) {
    phone = phone.slice(2);
  }

  return phone;
};

const escapeRegex = (value = "") =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const validEmail = (email) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const validIndianPhone = (phone) =>
  /^[6-9]\d{9}$/.test(phone);

const publicUser = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  phone: user.phone,
  role: user.role,
  studentId: user.studentId,
  facultyId: user.facultyId,
  semester: user.semester,
  department: user.department,
  designation: user.designation,
});

const getBearerToken = (req) => {
  const header = req.headers.authorization || "";

  if (!header.startsWith("Bearer ")) {
    return "";
  }

  return header.slice(7).trim();
};

// =====================================================
// FORGOT PASSWORD HELPERS
// =====================================================

// OTP is stored temporarily in server memory.
const passwordResetOtps = new Map();
const otpCooldowns = new Map();

const hashOtp = (otp) =>
  crypto.createHash("sha256").update(String(otp)).digest("hex");

// =====================================================
// TEST ROUTE
// GET /api/auth/
// =====================================================

router.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Auth API is working",
  });
});

// =====================================================
// REGISTER
// POST /api/auth/register
// =====================================================

router.post("/register", async (req, res) => {
  console.log("REGISTER API HIT");

  try {
    const {
      name,
      email,
      phone,
      password,
      role,
      studentId,
      facultyId,
      department,
      semester,
      designation,
    } = req.body;

    if (!name || !email || !phone || !password || !role) {
      return res.status(400).json({
        message: "Name, email, phone, password and role are required.",
      });
    }

    const cleanName = String(name).trim();
    const normalizedEmail = String(email).trim().toLowerCase();
    const normalizedPhone = normalizePhone(phone);
    const normalizedRole = String(role).trim().toLowerCase();
    const cleanPassword = String(password);

    if (!cleanName) {
      return res.status(400).json({
        message: "Name is required.",
      });
    }

    if (!validEmail(normalizedEmail)) {
      return res.status(400).json({
        message: "Please enter a valid email address.",
      });
    }

    if (!validIndianPhone(normalizedPhone)) {
      return res.status(400).json({
        message: "Enter a valid 10-digit Indian mobile number.",
      });
    }

    if (cleanPassword.length < 6) {
      return res.status(400).json({
        message: "Password must contain at least 6 characters.",
      });
    }

    if (!process.env.JWT_SECRET) {
      console.error("JWT_SECRET is missing.");

      return res.status(500).json({
        message: "Server authentication configuration error.",
      });
    }

    // Phone verification token is required.
    const phoneToken = getBearerToken(req);

    if (!phoneToken) {
      return res.status(401).json({
        message: "Verify your phone number with OTP first.",
      });
    }

    let verification;

    try {
      verification = jwt.verify(
        phoneToken,
        process.env.JWT_SECRET
      );
    } catch {
      return res.status(401).json({
        message:
          "Phone verification token is invalid or expired. Verify again.",
      });
    }

    const verifiedPhone = normalizePhone(verification.phone);

    if (
      verification.purpose !== "phone_verification" ||
      !verifiedPhone ||
      verifiedPhone !== normalizedPhone
    ) {
      return res.status(401).json({
        message:
          "Verified phone number does not match the entered number.",
      });
    }

    const allowedRoles = ["student", "faculty", "hod"];

    if (!allowedRoles.includes(normalizedRole)) {
      return res.status(400).json({
        message: "Invalid registration role.",
      });
    }

    // Check duplicate email and phone.
    const duplicate = await User.findOne({
      $or: [
        { email: normalizedEmail },
        { phone: verifiedPhone },
      ],
    });

    if (duplicate) {
      if (duplicate.email === normalizedEmail) {
        return res.status(409).json({
          message: "Email already registered.",
        });
      }

      return res.status(409).json({
        message: "Phone number already registered.",
      });
    }

    // Department must exist and be active.
    const requestedDepartment = String(
      department || ""
    ).trim();

    if (!requestedDepartment) {
      return res.status(400).json({
        message: "Please select a department.",
      });
    }

    const departmentDoc = await Department.findOne({
      name: {
        $regex: `^${escapeRegex(requestedDepartment)}$`,
        $options: "i",
      },
      status: "Active",
    });

    if (!departmentDoc) {
      return res.status(400).json({
        message:
          "Selected department is unavailable or inactive.",
      });
    }

    const normalizedDepartment = departmentDoc.name;

    const userData = {
      name: cleanName,
      email: normalizedEmail,
      phone: verifiedPhone,
      password: await bcrypt.hash(cleanPassword, 10),
      role: normalizedRole,
      department: normalizedDepartment,
    };

    // Student-specific validation.
    if (normalizedRole === "student") {
      const cleanStudentId = String(studentId || "").trim();
      const cleanSemester = String(semester ?? "").trim();

      if (!cleanStudentId) {
        return res.status(400).json({
          message: "Student ID is required.",
        });
      }

      if (
        !["1", "2", "3", "4", "5", "6", "7", "8"].includes(
          cleanSemester
        )
      ) {
        return res.status(400).json({
          message: "Select a valid semester from 1 to 8.",
        });
      }

      const duplicateStudent = await User.findOne({
        studentId: cleanStudentId,
      });

      if (duplicateStudent) {
        return res.status(409).json({
          message: "Student ID already registered.",
        });
      }

      userData.studentId = cleanStudentId;
      userData.semester = cleanSemester;
    }

    // Faculty-specific validation.
    if (normalizedRole === "faculty") {
      const cleanFacultyId = String(facultyId || "").trim();
      const cleanDesignation = String(
        designation || ""
      ).trim();

      if (!cleanFacultyId || !cleanDesignation) {
        return res.status(400).json({
          message: "Faculty ID and designation are required.",
        });
      }

      const duplicateFaculty = await User.findOne({
        facultyId: cleanFacultyId,
      });

      if (duplicateFaculty) {
        return res.status(409).json({
          message: "Faculty ID already registered.",
        });
      }

      userData.facultyId = cleanFacultyId;
      userData.designation = cleanDesignation;
    }

    // Only one HOD per department.
    if (normalizedRole === "hod") {
      const existingHod = await User.findOne({
        role: "hod",
        department: {
          $regex: `^${escapeRegex(normalizedDepartment)}$`,
          $options: "i",
        },
      });

      if (existingHod) {
        return res.status(409).json({
          message: `A HOD already exists for ${normalizedDepartment} department.`,
        });
      }

      userData.designation = "Head of Department";
    }

    const user = await User.create(userData);

    console.log("USER CREATED:", user._id);

    // Email failure should not undo successful registration.
    try {
      await sendWelcomeEmail(user.email, user.name);
    } catch (emailError) {
      console.error(
        "WELCOME EMAIL ERROR:",
        emailError.message
      );
    }

    return res.status(201).json({
      success: true,
      message: "Registration successful.",
      user: publicUser(user),
    });
  } catch (error) {
    console.error("REGISTER ERROR:", error);

    if (error.code === 11000) {
      return res.status(409).json({
        message: "Email, phone or ID already exists.",
      });
    }

    if (error.name === "ValidationError") {
      return res.status(400).json({
        message: Object.values(error.errors)
          .map((item) => item.message)
          .join(", "),
      });
    }

    return res.status(500).json({
      message: "Server error during registration.",
    });
  }
});

// =====================================================
// LOGIN
// POST /api/auth/login
// =====================================================

router.post("/login", async (req, res) => {
  try {
    const {
      loginId,
      email,
      password,
      role,
      semester,
    } = req.body;

    const rawIdentifier = String(
      loginId || email || ""
    ).trim();

    const identifier = rawIdentifier.toLowerCase();
    const selectedRole = String(role || "")
      .trim()
      .toLowerCase();

    if (!rawIdentifier || !password || !selectedRole) {
      return res.status(400).json({
        message: "Login ID, password and role are required.",
      });
    }

    if (
      !["student", "faculty", "hod", "admin"].includes(
        selectedRole
      )
    ) {
      return res.status(400).json({
        message: "Invalid role selected.",
      });
    }

    if (selectedRole === "student" && !semester) {
      return res.status(400).json({
        message: "Please select your semester.",
      });
    }

    let user;

    if (selectedRole === "student") {
      user = await User.findOne({
        role: "student",
        $or: [
          { studentId: rawIdentifier },
          { studentId: rawIdentifier.toUpperCase() },
          { email: identifier },
        ],
      });
    } else if (selectedRole === "faculty") {
      user = await User.findOne({
        role: "faculty",
        $or: [
          { facultyId: rawIdentifier },
          { facultyId: rawIdentifier.toUpperCase() },
          { email: identifier },
        ],
      });
    } else {
      user = await User.findOne({
        role: selectedRole,
        email: identifier,
      });
    }

    if (!user) {
      return res.status(401).json({
        message: "Invalid login ID or password.",
      });
    }

    if (
      selectedRole === "student" &&
      String(user.semester || "").trim() !==
        String(semester).trim()
    ) {
      return res.status(401).json({
        message:
          "Selected semester does not match your registered semester.",
      });
    }

    const passwordMatch = await bcrypt.compare(
      String(password),
      user.password
    );

    if (!passwordMatch) {
      return res.status(401).json({
        message: "Invalid login ID or password.",
      });
    }

    if (!process.env.JWT_SECRET) {
      return res.status(500).json({
        message: "Server authentication configuration error.",
      });
    }

    const token = jwt.sign(
      {
        id: user._id,
        role: user.role,
        semester: user.semester || null,
      },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    return res.json({
      success: true,
      message: "Login successful.",
      token,
      user: publicUser(user),
    });
  } catch (error) {
    console.error("LOGIN ERROR:", error);

    return res.status(500).json({
      message: "Server error during login.",
    });
  }
});

// =====================================================
// GET PROFILE
// GET /api/auth/profile
// =====================================================

router.get("/profile", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .select("-password");

    if (!user) {
      return res.status(404).json({
        message: "User not found.",
      });
    }

    return res.json({
      message: "Profile fetched successfully.",
      user,
    });
  } catch (error) {
    console.error("PROFILE ERROR:", error);

    return res.status(500).json({
      message: "Server error while fetching profile.",
    });
  }
});

// =====================================================
// UPDATE PROFILE
// PUT /api/auth/profile
// =====================================================

router.put("/profile", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        message: "User not found.",
      });
    }

    if (req.body.name !== undefined) {
      const value = String(req.body.name).trim();

      if (!value) {
        return res.status(400).json({
          message: "Name is required.",
        });
      }

      user.name = value;
    }

    if (req.body.email !== undefined) {
      const value = String(req.body.email)
        .trim()
        .toLowerCase();

      if (!validEmail(value)) {
        return res.status(400).json({
          message: "Enter a valid email.",
        });
      }

      const existing = await User.findOne({
        email: value,
        _id: { $ne: req.user.id },
      });

      if (existing) {
        return res.status(409).json({
          message: "Email already registered.",
        });
      }

      user.email = value;
    }

    // Phone changes require OTP verification.
    if (req.body.phone !== undefined) {
      const value = normalizePhone(req.body.phone);

      if (!validIndianPhone(value)) {
        return res.status(400).json({
          message: "Enter a valid 10-digit Indian mobile number.",
        });
      }

      if (value !== normalizePhone(user.phone)) {
        return res.status(400).json({
          message:
            "Changing your phone requires OTP verification.",
        });
      }
    }

    const allowedFields = [
      "alternatePhone",
      "gender",
      "bloodGroup",
      "qualification",
      "specialization",
      "address",
      "city",
      "state",
      "pincode",
      "bio",
      "designation",
      "experience",
    ];

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        user[field] =
          typeof req.body[field] === "string"
            ? req.body[field].trim()
            : req.body[field];
      }
    }

    if (req.body.dateOfBirth !== undefined) {
      user.dateOfBirth = req.body.dateOfBirth || null;
    }

    const savedUser = await user.save();
    const result = savedUser.toObject();

    delete result.password;

    return res.json({
      message: "Profile updated successfully.",
      user: result,
    });
  } catch (error) {
    console.error("UPDATE PROFILE ERROR:", error);

    if (error.name === "ValidationError") {
      return res.status(400).json({
        message: Object.values(error.errors)
          .map((item) => item.message)
          .join(", "),
      });
    }

    if (error.code === 11000) {
      return res.status(409).json({
        message: "Email or other unique data already exists.",
      });
    }

    return res.status(500).json({
      message: "Failed to update profile.",
    });
  }
});

// =====================================================
// ADMIN TEST
// GET /api/auth/admin-test
// =====================================================

router.get(
  "/admin-test",
  authMiddleware,
  roleMiddleware("admin"),
  (req, res) => {
    res.json({
      message: "Welcome Admin! You can access this route.",
      user: req.user,
    });
  }
);

// =====================================================
// DELETE USER
// DELETE /api/auth/delete-user
// =====================================================

router.delete(
  "/delete-user",
  authMiddleware,
  roleMiddleware("admin"),
  async (req, res) => {
    try {
      const email = String(req.body.email || "")
        .trim()
        .toLowerCase();

      if (!email) {
        return res.status(400).json({
          message: "Email is required.",
        });
      }

      const user = await User.findOneAndDelete({ email });

      if (!user) {
        return res.status(404).json({
          message: "User not found.",
        });
      }

      return res.json({
        message: "User deleted successfully.",
        deletedUser: {
          name: user.name,
          email: user.email,
        },
      });
    } catch (error) {
      console.error("DELETE USER ERROR:", error);

      return res.status(500).json({
        message: "Server error while deleting user.",
      });
    }
  }
);

// =====================================================
// FORGOT PASSWORD
// POST /api/auth/forgot-password
// =====================================================

router.post("/forgot-password", async (req, res) => {
  try {
    const email = String(req.body.email || "")
      .trim()
      .toLowerCase();

    if (!validEmail(email)) {
      return res.status(400).json({
        message: "Please enter a valid email address.",
      });
    }

    const user = await User.findOne({ email });

    // Avoid revealing whether an email is registered.
    if (!user) {
      return res.json({
        success: true,
        message:
          "If this email is registered, an OTP will be sent.",
      });
    }

    const now = Date.now();
    const lastSent = otpCooldowns.get(email) || 0;

    if (now - lastSent < 60 * 1000) {
      return res.status(429).json({
        message:
          "Please wait 60 seconds before requesting another OTP.",
      });
    }

    const randomNumber = crypto.randomBytes(4).readUInt32BE(0);
    const otp = String(100000 + (randomNumber % 900000));

    passwordResetOtps.set(email, {
      otpHash: hashOtp(otp),
      expiresAt: now + 5 * 60 * 1000,
      attempts: 0,
    });

    try {
      await sendPasswordResetOtp(email, user.name, otp);
      otpCooldowns.set(email, now);
    } catch (emailError) {
      passwordResetOtps.delete(email);

      console.error(
        "PASSWORD RESET EMAIL ERROR:",
        emailError.message
      );

      return res.status(500).json({
        message:
          "Could not send OTP email. Please try again later.",
      });
    }

    return res.json({
      success: true,
      message:
        "If this email is registered, an OTP will be sent.",
    });
  } catch (error) {
    console.error("FORGOT PASSWORD ERROR:", error);

    return res.status(500).json({
      message: "Server error while requesting password reset.",
    });
  }
});

// =====================================================
// VERIFY RESET OTP
// POST /api/auth/verify-reset-otp
// =====================================================

router.post("/verify-reset-otp", async (req, res) => {
  try {
    const email = String(req.body.email || "")
      .trim()
      .toLowerCase();

    const otp = String(req.body.otp || "").trim();

    if (!validEmail(email) || !/^\d{6}$/.test(otp)) {
      return res.status(400).json({
        message: "Enter a valid email and six-digit OTP.",
      });
    }

    const record = passwordResetOtps.get(email);

    if (!record || Date.now() > record.expiresAt) {
      passwordResetOtps.delete(email);

      return res.status(400).json({
        message:
          "OTP is invalid or expired. Please request a new OTP.",
      });
    }

    if (record.attempts >= 5) {
      passwordResetOtps.delete(email);

      return res.status(429).json({
        message:
          "Too many attempts. Please request a new OTP.",
      });
    }

    record.attempts += 1;

    const submittedHash = Buffer.from(hashOtp(otp), "hex");
    const storedHash = Buffer.from(record.otpHash, "hex");

    if (!crypto.timingSafeEqual(submittedHash, storedHash)) {
      if (record.attempts >= 5) {
        passwordResetOtps.delete(email);
      }

      return res.status(400).json({
        message: "Incorrect OTP. Please try again.",
      });
    }

    if (!process.env.JWT_SECRET) {
      return res.status(500).json({
        message: "Server authentication configuration error.",
      });
    }

    passwordResetOtps.delete(email);

    const resetToken = jwt.sign(
      {
        purpose: "password_reset",
        email,
      },
      process.env.JWT_SECRET,
      { expiresIn: "10m" }
    );

    return res.json({
      success: true,
      message: "OTP verified successfully.",
      resetToken,
    });
  } catch (error) {
    console.error("VERIFY RESET OTP ERROR:", error);

    return res.status(500).json({
      message: "Server error while verifying OTP.",
    });
  }
});

// =====================================================
// RESET PASSWORD
// POST /api/auth/reset-password
// =====================================================

router.post("/reset-password", async (req, res) => {
  try {
    const email = String(req.body.email || "")
      .trim()
      .toLowerCase();

    const resetToken = String(
      req.body.resetToken || ""
    ).trim();

    const password = String(req.body.password || "");

    if (!validEmail(email) || !resetToken || !password) {
      return res.status(400).json({
        message:
          "Email, reset token and new password are required.",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        message:
          "Password must contain at least 6 characters.",
      });
    }

    if (!process.env.JWT_SECRET) {
      return res.status(500).json({
        message: "Server authentication configuration error.",
      });
    }

    let decoded;

    try {
      decoded = jwt.verify(
        resetToken,
        process.env.JWT_SECRET
      );
    } catch {
      return res.status(401).json({
        message:
          "Reset session expired. Please verify your OTP again.",
      });
    }

    if (
      decoded.purpose !== "password_reset" ||
      decoded.email !== email
    ) {
      return res.status(401).json({
        message: "Invalid password reset session.",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.findOneAndUpdate(
      { email },
      { $set: { password: hashedPassword } },
      {
        new: true,
        runValidators: true,
      }
    );

    if (!user) {
      return res.status(400).json({
        message:
          "Unable to reset password. Please try again.",
      });
    }

    return res.json({
      success: true,
      message:
        "Password reset successfully. Please log in.",
    });
  } catch (error) {
    console.error("RESET PASSWORD ERROR:", error);

    return res.status(500).json({
      message: "Server error while resetting password.",
    });
  }
});

// =====================================================
// EXPORT ROUTER
// =====================================================

module.exports = router;


const express = require("express");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

const router = express.Router();

const WAKIT_URL = "https://wakit.in/api/v1";

// Temporary OTP request records.
// Production deployment with multiple server instances should use Redis/database.
const pendingOtps = new Map();

async function wakitRequest(path, body) {
  return fetch(`${WAKIT_URL}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.WAKIT_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

function normalizePhone(phone) {
  return String(phone || "").replace(/\s+/g, "").trim();
}

// Clean expired OTP records periodically when another request comes in.
function cleanupExpiredOtps() {
  const now = Date.now();

  for (const [id, record] of pendingOtps.entries()) {
    if (record.expiresAt <= now) {
      pendingOtps.delete(id);
    }
  }
}

// SEND WHATSAPP OTP
router.post("/send", async (req, res) => {
  try {
    cleanupExpiredOtps();

    const phone = normalizePhone(req.body.phone);

    if (!/^\+[1-9]\d{7,14}$/.test(phone)) {
      return res.status(400).json({
        success: false,
        message: "Enter phone number with country code, e.g. +919876543210",
      });
    }

    if (!process.env.WAKIT_API_KEY) {
      return res.status(500).json({
        success: false,
        message: "WAKIT_API_KEY is missing in server/.env",
      });
    }

    if (!process.env.JWT_SECRET) {
      return res.status(500).json({
        success: false,
        message: "JWT_SECRET is missing in server/.env",
      });
    }

    const response = await wakitRequest("/otp/send", {
      to: phone,
    });

    const data = await response.json();

    if (!response.ok || !data.success || !data.data?.id) {
      return res.status(502).json({
        success: false,
        message:
          data.message ||
          data.error?.message ||
          "WhatsApp OTP could not be sent.",
      });
    }

    const otpId = String(data.data.id);

    // Bind this OTP request to the exact phone number.
    pendingOtps.set(otpId, {
      phone,
      expiresAt: Date.now() + 5 * 60 * 1000,
      attempts: 0,
    });

    return res.json({
      success: true,
      otpId,
      phone,
      message: "OTP request accepted. Check your WhatsApp.",
    });
  } catch (error) {
    console.error("Wakit send OTP error:", error.message);

    return res.status(502).json({
      success: false,
      message: "OTP service unavailable. Please try again.",
    });
  }
});

// VERIFY WHATSAPP OTP
router.post("/verify", async (req, res) => {
  try {
    cleanupExpiredOtps();

    const otpId = String(req.body.otpId || "").trim();
    const code = String(req.body.code || "").trim();

    if (!otpId || !/^\d{4,8}$/.test(code)) {
      return res.status(400).json({
        success: false,
        message: "Enter the OTP you received.",
      });
    }

    const record = pendingOtps.get(otpId);

    if (!record) {
      return res.status(400).json({
        success: false,
        message: "OTP request expired or not found. Please resend OTP.",
      });
    }

    if (record.attempts >= 5) {
      pendingOtps.delete(otpId);

      return res.status(429).json({
        success: false,
        message: "Too many attempts. Please request a new OTP.",
      });
    }

    record.attempts += 1;

    const response = await wakitRequest("/otp/verify", {
      id: otpId,
      code,
    });

    const data = await response.json();

    if (!response.ok || data.data?.verified !== true) {
      return res.status(400).json({
        success: false,
        message:
          data.message ||
          "OTP is incorrect or expired. Please check and try again.",
      });
    }

    // The verified phone comes from the server-side OTP record,
    // never from a phone number supplied during verification.
    pendingOtps.delete(otpId);

    const verificationId = crypto.randomUUID();

    const phoneVerificationToken = jwt.sign(
      {
        phone: record.phone,
        purpose: "phone_verification",
        verificationId,
      },
      process.env.JWT_SECRET,
      { expiresIn: "10m" }
    );

    return res.json({
      success: true,
      phone: record.phone,
      phoneVerificationToken,
      message: "Phone number verified successfully.",
    });
  } catch (error) {
    console.error("Wakit verify OTP error:", error.message);

    return res.status(502).json({
      success: false,
      message: "OTP verification service unavailable. Please try again.",
    });
  }
});

module.exports = router;

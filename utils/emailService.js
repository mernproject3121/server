
const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Check Gmail connection
transporter.verify((error) => {
  if (error) {
    console.error("Gmail connection failed:", error.message);
  } else {
    console.log("Gmail connection successful!");
  }
});

// Welcome email
const sendWelcomeEmail = async (to, name) => {
  await transporter.sendMail({
    from: `"Smart College ERP" <${process.env.EMAIL_USER}>`,
    to,
    subject: "Welcome to Smart College ERP",
    html: `
      <div style="font-family:Arial,sans-serif;padding:20px;">
        <h2>Welcome to Smart College ERP 🎓</h2>
        <p>Hello <b>${String(name || "User").replace(/[&<>"']/g, "")}</b>,</p>
        <p>Your account has been successfully created.</p>
        <p>You can now log in to Smart College ERP.</p>
        <hr />
        <p>Regards,<br /><b>Smart College ERP Team</b></p>
      </div>
    `,
  });

  console.log("Welcome email sent to:", to);
  return true;
};

// Password reset OTP email
const sendPasswordResetOtp = async (to, name, otp) => {
  const safeName = String(name || "User").replace(/[&<>"']/g, "");

  await transporter.sendMail({
    from: `"Smart College ERP" <${process.env.EMAIL_USER}>`,
    to,
    subject: "Password Reset OTP - Smart College ERP",
    text: `Hello ${name || "User"},

Your password reset OTP is ${otp}.

This OTP is valid for 5 minutes. Do not share it with anyone.

If you did not request this, please ignore this email.

Smart College ERP Team`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:500px;margin:20px auto;padding:24px;border:1px solid #e5e7eb;border-radius:12px;">
        <h2 style="color:#6d28d9;">Smart College ERP</h2>
        <h3>Password Reset Verification</h3>
        <p>Hello <b>${safeName}</b>,</p>
        <p>Use this OTP to reset your password:</p>
        <div style="background:#f5f3ff;padding:18px;text-align:center;border-radius:8px;">
          <h1 style="color:#6d28d9;letter-spacing:8px;margin:0;">${otp}</h1>
        </div>
        <p>This OTP is valid for <b>5 minutes</b>.</p>
        <p>Do not share this code with anyone.</p>
        <hr />
        <p style="color:#6b7280;font-size:13px;">
          If you did not request a password reset, please ignore this email.
        </p>
        <p>Regards,<br /><b>Smart College ERP Team</b></p>
      </div>
    `,
  });

  console.log("Password reset OTP email sent to:", to);
  return true;
};

module.exports = {
  sendWelcomeEmail,
  sendPasswordResetOtp,
};

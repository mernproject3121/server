const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
require("dotenv").config();

const User = require("./models/User");

async function createAccounts() {
  try {
    await mongoose.connect(process.env.MONGO_URI);

    console.log("MongoDB Connected");

    // =========================
    // HOD
    // =========================

    const hodPassword = await bcrypt.hash("hod1234", 10);

    const existingHOD = await User.findOne({
      role: "hod",
    });

    if (!existingHOD) {
      await User.create({
        name: "HOD",
        email: "hod@aarambh.com",
        phone: "9999999999",
        password: hodPassword,
        role: "hod",
        department: "Information Technology",
      });

      console.log("✅ HOD account created");
    } else {
      console.log("⚠️ HOD already exists");
    }

    // =========================
    // ADMIN
    // =========================

    const adminPassword = await bcrypt.hash("admin1234", 10);

    const existingAdmin = await User.findOne({
      role: "admin",
    });

    if (!existingAdmin) {
      await User.create({
        name: "Admin",
        email: "admin@aarambh.com",
        phone: "9999999998",
        password: adminPassword,
        role: "admin",
      });

      console.log("✅ Admin account created");
    } else {
      console.log("⚠️ Admin already exists");
    }

    console.log("\n🎉 Account setup completed");

    process.exit(0);

  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

createAccounts();
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
require("dotenv").config();

const User = require("./models/User");

const createUsers = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);

    console.log("MongoDB Connected");

    // =========================
    // CREATE ADMIN
    // =========================

    const adminExists = await User.findOne({
      role: "admin",
    });

    if (!adminExists) {
      const adminPassword = await bcrypt.hash("Admin@123", 10);

      await User.create({
        name: "Admin",
        email: "admin@aarambh.com",
        phone: "9999999999",
        password: adminPassword,
        role: "admin",
      });

      console.log("✅ Admin created");
    } else {
      console.log("ℹ️ Admin already exists");
    }

    // =========================
    // CREATE HOD
    // =========================

    const hodExists = await User.findOne({
      role: "hod",
    });

    if (!hodExists) {
      const hodPassword = await bcrypt.hash("Hod@123", 10);

      await User.create({
        name: "HOD",
        email: "hod@aarambh.com",
        phone: "8888888888",
        password: hodPassword,
        role: "hod",
        department: "Computer Science",
      });

      console.log("✅ HOD created");
    } else {
      console.log("ℹ️ HOD already exists");
    }

    console.log("\n🎉 Setup completed!");

    console.log("\nAdmin Login:");
    console.log("Email: admin@aarambh.com");
    console.log("Password: Admin@123");

    console.log("\nHOD Login:");
    console.log("Email: hod@aarambh.com");
    console.log("Password: Hod@123");

    await mongoose.connection.close();
    process.exit(0);

  } catch (error) {
    console.log("❌ Error:", error.message);
    process.exit(1);
  }
};

createUsers();
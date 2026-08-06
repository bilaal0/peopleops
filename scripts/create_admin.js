import * as dotenv from "dotenv";
import mongoose from "mongoose";
import { User } from "../app/models/user.server.js";

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error("❌ MONGODB_URI is missing in .env");
  process.exit(1);
}

async function createAdmin() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log("✅ Connected to MongoDB");

    const email = "admin@cogentex.co.uk";
    
    // Check if user exists
    let user = await User.findOne({ email });
    if (user) {
        console.log(`⚠️ User with email ${email} already exists. Updating role to SUPER_ADMIN...`);
        user.roles = ["SUPER_ADMIN"];
        await user.save();
        console.log("✅ User role updated.");
        process.exit(0);
    }

    const newUser = new User({
      firstName: "Legalet",
      lastName: "Admin",
      email: email,
      password: "Lega@/.116!",
      roles: ["SUPER_ADMIN"], // Using the role we established for admins
      status: 1,
      emailVerified: true,
      selfManaging: true,
    });

    await newUser.save();
    console.log(`🎉 User created successfully: ${email}`);
    
    // Log the created user ID for reference
    const created = await User.findOne({ email });
    console.log("ID:", created._id);

  } catch (error) {
    console.error("❌ Error creating user:", error);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

createAdmin();

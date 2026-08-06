/**
 * scripts/seedSuperAdmin.js
 *
 * Creates the AgentShield platform SUPER_ADMIN user.
 * SUPER_ADMIN has NO agencyId — they manage the platform, not any single agency.
 * Safe to run multiple times — uses upsert logic.
 *
 * Usage:
 *   node scripts/seedSuperAdmin.js
 *
 * Credentials are read from .env:
 *   SEED_SUPERADMIN_EMAIL     (default: admin@agentshield.co.uk)
 *   SEED_SUPERADMIN_PASSWORD  (required)
 */

import * as dotenv from "dotenv";
import mongoose from "mongoose";
import { hash } from "bcryptjs";

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) { console.error("❌ MONGODB_URI missing in .env"); process.exit(1); }

const EMAIL    = process.env.SEED_SUPERADMIN_EMAIL    || "admin@agentshield.co.uk";
const PASSWORD = process.env.SEED_SUPERADMIN_PASSWORD;
if (!PASSWORD) { console.error("❌ SEED_SUPERADMIN_PASSWORD missing in .env"); process.exit(1); }

// ── Minimal User schema (avoids circular ESM imports in scripts) ──────────────

const userSchema = new mongoose.Schema(
  {
    firstName:     { type: String },
    lastName:      { type: String },
    email:         { type: String, required: true, unique: true, lowercase: true, trim: true },
    password:      { type: String, select: false },
    roles:         [{ type: String }],
    // SUPER_ADMIN has no agencyId — they are platform-level
    agencyId:      { type: mongoose.Schema.Types.ObjectId, ref: "Agency", default: null },
    status:        { type: Number, default: 1 },
    emailVerified: { type: Boolean, default: true },
    selfManaging:  { type: Boolean, default: false },
    deleted:       { type: Boolean, default: false },
  },
  { strict: false, timestamps: true }
);

const User = mongoose.models.User || mongoose.model("User", userSchema);

// ── Main ─────────────────────────────────────────────────────────────────────

async function run() {
  await mongoose.connect(MONGODB_URI);
  console.log("✅ Connected to MongoDB\n");

  const passwordHash = await hash(PASSWORD, 10);

  let user = await User.findOne({ email: EMAIL }).select("+password");

  if (user) {
    console.log(`ℹ️  User ${EMAIL} already exists — updating role…`);
    user.roles         = ["SUPER_ADMIN"];
    user.agencyId      = null;   // SUPER_ADMIN must not be tied to any agency
    user.status        = 1;
    user.emailVerified = true;
    if (process.env.SEED_SUPERADMIN_PASSWORD) {
      user.password = passwordHash;
    }
    await user.save({ validateBeforeSave: false });
    console.log("✅ Super Admin updated.");
  } else {
    user = await User.create({
      firstName:     "Platform",
      lastName:      "Admin",
      email:         EMAIL,
      password:      passwordHash,
      roles:         ["SUPER_ADMIN"],
      agencyId:      null,    // No agency — platform-level account
      status:        1,
      emailVerified: true,
      selfManaging:  false,
    });
    console.log(`✅ Super Admin created: ${EMAIL}`);
  }

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`  Email    : ${EMAIL}`);
  console.log(`  Password : ${PASSWORD}`);
  console.log(`  Role     : SUPER_ADMIN`);
  console.log(`  AgencyId : null (platform-level — expected)`);
  console.log(`  User ID  : ${user._id}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => {
  console.error("❌", err.message || err);
  process.exit(1);
});

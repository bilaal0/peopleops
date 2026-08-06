/**
 * scripts/backfillAgency.js
 * 
 * One-time script: creates an Agency for any User that has no agencyId,
 * then links the two together. Safe to run multiple times (idempotent).
 * 
 * Usage:
 *   node scripts/backfillAgency.js
 */

import "dotenv/config";
import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) throw new Error("MONGODB_URI missing in .env");

// ── Inline minimal schemas (avoids ESM circular import issues) ────────────────

const agencySchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    plan: { type: String, default: "trial" },
    trialEndsAt: { type: Date },
    deleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const Agency =
  mongoose.models.Agency || mongoose.model("Agency", agencySchema);

const userSchema = new mongoose.Schema(
  {
    firstName: String,
    lastName: String,
    email: String,
    agencyId: { type: mongoose.Schema.Types.ObjectId, ref: "Agency", default: null },
    deleted: { type: Boolean, default: false },
  },
  { strict: false, timestamps: true }
);

const User = mongoose.models.User || mongoose.model("User", userSchema);

// ── Main ──────────────────────────────────────────────────────────────────────

async function run() {
  await mongoose.connect(MONGODB_URI);
  console.log("✅ Connected to MongoDB\n");

  // Find all users without an agencyId
  const users = await User.find({
    agencyId: null,
    deleted: false,
  }).lean();

  if (users.length === 0) {
    console.log("🎉 All users already have an agencyId. Nothing to do.");
    await mongoose.disconnect();
    return;
  }

  console.log(`Found ${users.length} user(s) without an agency:\n`);

  for (const user of users) {
    const name =
      [user.firstName, user.lastName].filter(Boolean).join(" ") ||
      user.email ||
      "Unknown";

    // Check if an agency already exists for this user (by name match, safety net)
    let agency = await Agency.findOne({ name: `${name}'s Agency` });

    if (!agency) {
      agency = await Agency.create({
        name: `${name}'s Agency`,
        plan: "trial",
        trialEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      });
      console.log(`  ✅ Created Agency "${agency.name}" (${agency._id})`);
    } else {
      console.log(`  ℹ️  Agency "${agency.name}" already exists (${agency._id})`);
    }

    await User.updateOne({ _id: user._id }, { $set: { agencyId: agency._id } });
    console.log(`  🔗 Linked user ${user.email} → agencyId ${agency._id}\n`);
  }

  console.log("Done. Log out and log back in for the session to pick up the new agencyId.");
  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

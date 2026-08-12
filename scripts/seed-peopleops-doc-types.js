// scripts/seed-peopleops-doc-types.js
// Run with: node scripts/seed-peopleops-doc-types.js
// Seeds PeopleOps document types into the DocumentType collection using the DocumentType schema.
import "dotenv/config";
import mongoose from "mongoose";

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error("❌  No MONGODB_URI in .env");
  process.exit(1);
}

// ── Inline schema matching DocumentType model ─────────────────────────────────
const documentTypeSchema = new mongoose.Schema(
  {
    key:                  { type: String, required: true, unique: true, trim: true, lowercase: true },
    name:                 { type: String, required: true, trim: true },
    entity:               { type: [String], required: true },
    category:             { type: String, default: "general" },
    hasExpiry:            { type: Boolean, default: false },
    expiryDays:           { type: Number, default: null },
    requiresVerification: { type: Boolean, default: false },
    isActive:             { type: Boolean, default: true },
    createdBy:            { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

const DocumentType =
  mongoose.models.DocumentType || mongoose.model("DocumentType", documentTypeSchema);

const SYSTEM_ID = new mongoose.Types.ObjectId("000000000000000000000001");

export const CATEGORIES = [
  {
    key: "cv",
    name: "CV",
    entity: ["general"],
    category: "general",
    hasExpiry: false,
    expiryDays: null,
    requiresVerification: false,
  },
  {
    key: "job_application",
    name: "Job Application",
    entity: ["general"],
    category: "general",
    hasExpiry: false,
    expiryDays: null,
    requiresVerification: false,
  },
  {
    key: "interview_details",
    name: "Interview Details",
    entity: ["general"],
    category: "general",
    hasExpiry: false,
    expiryDays: null,
    requiresVerification: false,
  },
  {
    key: "passport_copy",
    name: "Passport Copy",
    entity: ["general"],
    category: "identity",
    hasExpiry: true,
    expiryDays: null,
    requiresVerification: true,
  },
  {
    key: "ielts",
    name: "IELTS",
    entity: ["general"],
    category: "certificate",
    hasExpiry: true,
    expiryDays: 730,
    requiresVerification: true,
  },
  {
    key: "local_police_clearance",
    name: "Local Police Clearance",
    entity: ["general"],
    category: "compliance",
    hasExpiry: true,
    expiryDays: null,
    requiresVerification: true,
  },
  {
    key: "tb_test",
    name: "TB Test",
    entity: ["general"],
    category: "compliance",
    hasExpiry: true,
    expiryDays: null,
    requiresVerification: true,
  },
  {
    key: "offer_letter",
    name: "Offer Letter",
    entity: ["general"],
    category: "legal",
    hasExpiry: false,
    expiryDays: null,
    requiresVerification: false,
  },
  {
    key: "signed_agreement",
    name: "Signed Agreement",
    entity: ["general"],
    category: "legal",
    hasExpiry: false,
    expiryDays: null,
    requiresVerification: true,
  },
  {
    key: "dbs",
    name: "DBS",
    entity: ["general"],
    category: "compliance",
    hasExpiry: true,
    expiryDays: 1095,
    requiresVerification: true,
  },
  {
    key: "brp",
    name: "BRP",
    entity: ["general"],
    category: "identity",
    hasExpiry: true,
    expiryDays: null,
    requiresVerification: true,
  },
  {
    key: "ni_number",
    name: "NI Number",
    entity: ["general"],
    category: "identity",
    hasExpiry: false,
    expiryDays: null,
    requiresVerification: false,
  },
  {
    key: "proof_of_address",
    name: "Proof of Address",
    entity: ["general"],
    category: "identity",
    hasExpiry: true,
    expiryDays: 90,
    requiresVerification: true,
  },
  {
    key: "paye_registration",
    name: "PAYE Registration",
    entity: ["general"],
    category: "financial",
    hasExpiry: false,
    expiryDays: null,
    requiresVerification: false,
  },
  {
    key: "leave_applications",
    name: "Leave Applications",
    entity: ["general"],
    category: "general",
    hasExpiry: false,
    expiryDays: null,
    requiresVerification: false,
  },
  {
    key: "salary_slips",
    name: "Salary Slips",
    entity: ["general"],
    category: "financial",
    hasExpiry: false,
    expiryDays: null,
    requiresVerification: false,
  },
  {
    key: "appraisals",
    name: "Appraisals",
    entity: ["general"],
    category: "general",
    hasExpiry: false,
    expiryDays: null,
    requiresVerification: false,
  },
  {
    key: "share_code",
    name: "Share Code",
    entity: ["general"],
    category: "compliance",
    hasExpiry: true,
    expiryDays: null,
    requiresVerification: true,
  },
];

async function seed() {
  await mongoose.connect(MONGO_URI);
  console.log("✅ Connected to MongoDB");

  let created = 0;
  let updated = 0;

  for (const doc of CATEGORIES) {
    const filter = { key: doc.key };
    const update = { ...doc, createdBy: SYSTEM_ID };
    const options = { upsert: true, new: true, setDefaultsOnInsert: true };

    const result = await DocumentType.findOneAndUpdate(filter, update, options);
    if (result) {
      console.log(`   ✅ Processed: ${doc.name} (${doc.key})`);
      created++;
    }
  }

  console.log(`\n🎉 Seed complete: ${created} document types configured.`);
  await mongoose.disconnect();
}

if (process.argv[1]?.endsWith("seed-peopleops-doc-types.js")) {
  seed().catch((err) => {
    console.error("❌ Seed failed:", err);
    process.exit(1);
  });
}

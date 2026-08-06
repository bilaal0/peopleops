// scripts/seed-peopleops-doc-types.js
// Run with: node scripts/seed-peopleops-doc-types.js
// Seeds PeopleOps-relevant document types into the DocumentType collection.
import "dotenv/config";
import mongoose from "mongoose";

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error("❌  No MONGODB_URI in .env");
  process.exit(1);
}

// ── Inline schema (avoids importing server-only modules) ──────────────────────
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

// ── Doc types to seed ─────────────────────────────────────────────────────────
// We need a placeholder createdBy ObjectId
const SYSTEM_ID = new mongoose.Types.ObjectId("000000000000000000000001");

const TYPES = [
  // ── Identity & Right to Work ─────────────────────────────────────────────
  {
    key: "passport",
    name: "Passport",
    entity: ["general"],
    category: "identity",
    hasExpiry: true,
    expiryDays: null,
    requiresVerification: true,
  },
  {
    key: "national_id",
    name: "National ID Card",
    entity: ["general"],
    category: "identity",
    hasExpiry: true,
    expiryDays: null,
    requiresVerification: true,
  },
  {
    key: "right_to_work",
    name: "Right to Work Evidence",
    entity: ["general"],
    category: "compliance",
    hasExpiry: true,
    expiryDays: null,
    requiresVerification: true,
  },
  {
    key: "visa",
    name: "Visa / Work Permit",
    entity: ["general"],
    category: "identity",
    hasExpiry: true,
    expiryDays: null,
    requiresVerification: true,
  },
  {
    key: "biometric_residence_permit",
    name: "Biometric Residence Permit (BRP)",
    entity: ["general"],
    category: "identity",
    hasExpiry: true,
    expiryDays: null,
    requiresVerification: true,
  },

  // ── DBS & Safeguarding ────────────────────────────────────────────────────
  {
    key: "dbs_basic",
    name: "DBS Check — Basic",
    entity: ["general"],
    category: "compliance",
    hasExpiry: true,
    expiryDays: 1095, // 3 years
    requiresVerification: true,
  },
  {
    key: "dbs_standard",
    name: "DBS Check — Standard",
    entity: ["general"],
    category: "compliance",
    hasExpiry: true,
    expiryDays: 1095,
    requiresVerification: true,
  },
  {
    key: "dbs_enhanced",
    name: "DBS Check — Enhanced",
    entity: ["general"],
    category: "compliance",
    hasExpiry: true,
    expiryDays: 1095,
    requiresVerification: true,
  },

  // ── Qualifications & Training ─────────────────────────────────────────────
  {
    key: "driving_licence",
    name: "Driving Licence",
    entity: ["general"],
    category: "licence",
    hasExpiry: true,
    expiryDays: null,
    requiresVerification: false,
  },
  {
    key: "nvq_certificate",
    name: "NVQ / QCF Certificate",
    entity: ["general"],
    category: "certificate",
    hasExpiry: false,
    expiryDays: null,
    requiresVerification: false,
  },
  {
    key: "first_aid_certificate",
    name: "First Aid Certificate",
    entity: ["general"],
    category: "certificate",
    hasExpiry: true,
    expiryDays: 1095, // 3 years
    requiresVerification: false,
  },
  {
    key: "manual_handling_certificate",
    name: "Manual Handling Certificate",
    entity: ["general"],
    category: "certificate",
    hasExpiry: true,
    expiryDays: 365,
    requiresVerification: false,
  },
  {
    key: "medication_training",
    name: "Medication Administration Training",
    entity: ["general"],
    category: "certificate",
    hasExpiry: true,
    expiryDays: 365,
    requiresVerification: false,
  },
  {
    key: "safeguarding_certificate",
    name: "Safeguarding Training Certificate",
    entity: ["general"],
    category: "certificate",
    hasExpiry: true,
    expiryDays: 730, // 2 years
    requiresVerification: false,
  },
  {
    key: "moving_handling_certificate",
    name: "Moving & Handling Certificate",
    entity: ["general"],
    category: "certificate",
    hasExpiry: true,
    expiryDays: 365,
    requiresVerification: false,
  },
  {
    key: "food_hygiene_certificate",
    name: "Food Hygiene Certificate",
    entity: ["general"],
    category: "certificate",
    hasExpiry: true,
    expiryDays: 1095,
    requiresVerification: false,
  },

  // ── Employment & HR ───────────────────────────────────────────────────────
  {
    key: "employment_contract",
    name: "Employment Contract",
    entity: ["general"],
    category: "legal",
    hasExpiry: false,
    expiryDays: null,
    requiresVerification: false,
  },
  {
    key: "job_description",
    name: "Job Description",
    entity: ["general"],
    category: "general",
    hasExpiry: false,
    expiryDays: null,
    requiresVerification: false,
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
    key: "reference_letter",
    name: "Reference Letter",
    entity: ["general"],
    category: "reference",
    hasExpiry: false,
    expiryDays: null,
    requiresVerification: false,
  },
  {
    key: "p45",
    name: "P45",
    entity: ["general"],
    category: "financial",
    hasExpiry: false,
    expiryDays: null,
    requiresVerification: false,
  },
  {
    key: "p60",
    name: "P60",
    entity: ["general"],
    category: "financial",
    hasExpiry: false,
    expiryDays: null,
    requiresVerification: false,
  },
  {
    key: "payslip",
    name: "Payslip",
    entity: ["general"],
    category: "financial",
    hasExpiry: false,
    expiryDays: null,
    requiresVerification: false,
  },
  {
    key: "disciplinary_record",
    name: "Disciplinary Record",
    entity: ["general"],
    category: "legal",
    hasExpiry: false,
    expiryDays: null,
    requiresVerification: false,
  },
  {
    key: "appraisal_form",
    name: "Appraisal / Performance Review",
    entity: ["general"],
    category: "general",
    hasExpiry: false,
    expiryDays: null,
    requiresVerification: false,
  },

  // ── Insurance & Compliance ────────────────────────────────────────────────
  {
    key: "public_liability_insurance",
    name: "Public Liability Insurance",
    entity: ["general"],
    category: "insurance",
    hasExpiry: true,
    expiryDays: 365,
    requiresVerification: false,
  },
  {
    key: "employers_liability_insurance",
    name: "Employers' Liability Insurance",
    entity: ["general"],
    category: "insurance",
    hasExpiry: true,
    expiryDays: 365,
    requiresVerification: false,
  },
  {
    key: "professional_indemnity",
    name: "Professional Indemnity Insurance",
    entity: ["general"],
    category: "insurance",
    hasExpiry: true,
    expiryDays: 365,
    requiresVerification: false,
  },
  {
    key: "care_quality_commission",
    name: "CQC Registration / Certificate",
    entity: ["general"],
    category: "compliance",
    hasExpiry: true,
    expiryDays: null,
    requiresVerification: true,
  },
  {
    key: "health_safety_policy",
    name: "Health & Safety Policy",
    entity: ["general"],
    category: "safety",
    hasExpiry: false,
    expiryDays: null,
    requiresVerification: false,
  },
  {
    key: "risk_assessment",
    name: "Risk Assessment",
    entity: ["general"],
    category: "safety",
    hasExpiry: false,
    expiryDays: null,
    requiresVerification: false,
  },

  // ── General ───────────────────────────────────────────────────────────────
  {
    key: "other",
    name: "Other Document",
    entity: ["general"],
    category: "general",
    hasExpiry: false,
    expiryDays: null,
    requiresVerification: false,
  },
];

// ── Main ──────────────────────────────────────────────────────────────────────
async function seed() {
  await mongoose.connect(MONGO_URI);
  console.log("✅  Connected to MongoDB");

  let created = 0;
  let skipped = 0;

  for (const t of TYPES) {
    const exists = await DocumentType.findOne({ key: t.key });
    if (exists) {
      console.log(`   ⏭  Skipped  (already exists): ${t.name}`);
      skipped++;
      continue;
    }
    await DocumentType.create({ ...t, createdBy: SYSTEM_ID });
    console.log(`   ✅  Created: ${t.name}`);
    created++;
  }

  console.log(`\n🎉  Done — ${created} created, ${skipped} skipped.`);
  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error("❌  Seed failed:", err);
  process.exit(1);
});

// scripts/seedObligationTypes.js
// Run once: node scripts/seedObligationTypes.js
// Seeds the 25 compliance obligation types from the AgentShield plan

import * as dotenv from "dotenv";
dotenv.config();
import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) throw new Error("MONGODB_URI missing from .env");

await mongoose.connect(MONGODB_URI);

// Define inline for standalone script (no module imports)
const obligationTypeSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  legislation: String,
  fineDescription: String,
  fineMaxGbp: Number,
  stage: { type: String, enum: ["pre_tenancy", "during", "possession"] },
  frequencyDays: { type: Number, default: null },
  appliesTo: { type: String, enum: ["all", "hmo"], default: "all" },
  sortOrder: { type: Number, default: 0 },
  active: { type: Boolean, default: true },
});
const ObligationType =
  mongoose.models.ObligationType ||
  mongoose.model("ObligationType", obligationTypeSchema);

const obligations = [
  // ── PRE-TENANCY (13 obligations) ──────────────────────────────────────────
  {
    key: "right_to_rent_check",
    name: "Right to Rent Check",
    legislation: "Immigration Act 2014",
    fineDescription: "Unlimited fine + 5 years imprisonment",
    fineMaxGbp: null,
    stage: "pre_tenancy",
    frequencyDays: null,
    sortOrder: 1,
  },
  {
    key: "aml_source_of_funds",
    name: "AML / Source of Funds Check",
    legislation: "Money Laundering Regulations 2017",
    fineDescription: "Regulatory prosecution",
    fineMaxGbp: null,
    stage: "pre_tenancy",
    frequencyDays: null,
    sortOrder: 2,
  },
  {
    key: "tenancy_agreement_signed_first",
    name: "Tenancy Agreement Signed Before Any Payment",
    legislation: "Renters Rights Act 2026",
    fineDescription: "Up to £7,000 civil penalty",
    fineMaxGbp: 7000,
    stage: "pre_tenancy",
    frequencyDays: null,
    sortOrder: 3,
  },
  {
    key: "rent_in_advance_cap",
    name: "Rent in Advance — Max 1 Month",
    legislation: "Renters Rights Act 2026",
    fineDescription: "Up to £7,000 civil penalty",
    fineMaxGbp: 7000,
    stage: "pre_tenancy",
    frequencyDays: null,
    sortOrder: 4,
  },
  {
    key: "no_fixed_term_clause",
    name: "No Fixed-Term Clause in Agreement",
    legislation: "Renters Rights Act 2026",
    fineDescription: "Up to £7,000 civil penalty",
    fineMaxGbp: 7000,
    stage: "pre_tenancy",
    frequencyDays: null,
    sortOrder: 5,
  },
  {
    key: "how_to_rent_guide",
    name: "How to Rent Guide Served",
    legislation: "Deregulation Act 2015",
    fineDescription: "Section 21 invalid / affects S8 grounds",
    fineMaxGbp: null,
    stage: "pre_tenancy",
    frequencyDays: null,
    sortOrder: 6,
  },
  {
    key: "epc_rating_confirmed",
    name: "EPC Rating Confirmed (Min E)",
    legislation: "MEES Regulations 2018",
    fineDescription: "Up to £5,000 per breach",
    fineMaxGbp: 5000,
    stage: "pre_tenancy",
    frequencyDays: 3650, // 10 years
    sortOrder: 7,
  },
  {
    key: "gas_safety_cert_pre",
    name: "Gas Safety Certificate — Valid at Start",
    legislation: "Gas Safety Regulations 1998",
    fineDescription: "Criminal prosecution",
    fineMaxGbp: null,
    stage: "pre_tenancy",
    frequencyDays: 365, // Annual renewal
    sortOrder: 8,
  },
  {
    key: "eicr_current_pre",
    name: "EICR — Valid at Start",
    legislation: "Electrical Safety Standards 2020",
    fineDescription: "Up to £30,000 civil penalty",
    fineMaxGbp: 30000,
    stage: "pre_tenancy",
    frequencyDays: 1825, // 5 years
    sortOrder: 9,
  },
  {
    key: "deposit_protected",
    name: "Deposit Protected Within 30 Days",
    legislation: "Housing Act 2004",
    fineDescription: "1-3x deposit as compensation",
    fineMaxGbp: null,
    stage: "pre_tenancy",
    frequencyDays: null,
    sortOrder: 10,
  },
  {
    key: "prescribed_information_served",
    name: "Prescribed Information Served",
    legislation: "Housing Act 2004 s.213",
    fineDescription: "Cannot recover deposit",
    fineMaxGbp: null,
    stage: "pre_tenancy",
    frequencyDays: null,
    sortOrder: 11,
  },
  {
    key: "smoke_co_alarms",
    name: "Smoke and CO Alarms Installed",
    legislation: "Smoke and CO Alarm Regulations 2022",
    fineDescription: "Up to £5,000 civil penalty",
    fineMaxGbp: 5000,
    stage: "pre_tenancy",
    frequencyDays: null,
    sortOrder: 12,
  },
  {
    key: "legionella_risk_assessment",
    name: "Legionella Risk Assessment",
    legislation: "Health and Safety at Work Act",
    fineDescription: "Enforcement notice",
    fineMaxGbp: null,
    stage: "pre_tenancy",
    frequencyDays: null,
    sortOrder: 13,
  },

  // ── DURING TENANCY (10 obligations) ──────────────────────────────────────
  {
    key: "gas_safety_cert_annual",
    name: "Gas Safety Certificate — Annual Renewal",
    legislation: "Gas Safety Regulations 1998",
    fineDescription: "Criminal prosecution",
    fineMaxGbp: null,
    stage: "during",
    frequencyDays: 365,
    sortOrder: 14,
  },
  {
    key: "eicr_5yr_renewal",
    name: "EICR — 5-Year Renewal",
    legislation: "Electrical Safety Standards 2020",
    fineDescription: "Up to £30,000 civil penalty",
    fineMaxGbp: 30000,
    stage: "during",
    frequencyDays: 1825,
    sortOrder: 15,
  },
  {
    key: "epc_10yr_renewal",
    name: "EPC — 10-Year Renewal",
    legislation: "MEES Regulations 2018",
    fineDescription: "Up to £5,000 per breach",
    fineMaxGbp: 5000,
    stage: "during",
    frequencyDays: 3650,
    sortOrder: 16,
  },
  {
    key: "right_to_rent_recheck",
    name: "Right to Rent Re-Check",
    legislation: "Immigration Act 2014",
    fineDescription: "Unlimited fine",
    fineMaxGbp: null,
    stage: "during",
    frequencyDays: null, // Due date set from tenant.rightToRentExpiry
    sortOrder: 17,
  },
  {
    key: "awaabs_law_emergency",
    name: "Awaab's Law — Emergency Hazard Response (24hr)",
    legislation: "Renters Rights Act 2026",
    fineDescription: "Tribunal claim + compensation",
    fineMaxGbp: null,
    stage: "during",
    frequencyDays: null,
    sortOrder: 18,
  },
  {
    key: "awaabs_law_urgent",
    name: "Awaab's Law — Urgent Hazard Resolution (10 days)",
    legislation: "Renters Rights Act 2026",
    fineDescription: "Tribunal claim + compensation",
    fineMaxGbp: null,
    stage: "during",
    frequencyDays: null,
    sortOrder: 19,
  },
  {
    key: "rent_increase_s13",
    name: "Rent Increase via Section 13 Form 4A Only",
    legislation: "Renters Rights Act 2026",
    fineDescription: "Rent repayment order",
    fineMaxGbp: null,
    stage: "during",
    frequencyDays: null,
    sortOrder: 20,
  },
  {
    key: "pet_request_28day",
    name: "Pet Request — Written Response Within 28 Days",
    legislation: "Renters Rights Act 2026",
    fineDescription: "Up to £7,000 civil penalty",
    fineMaxGbp: 7000,
    stage: "during",
    frequencyDays: null,
    sortOrder: 21,
  },
  {
    key: "tenant_info_sheet",
    name: "Tenant Information Sheet Served",
    legislation: "Renters Rights Act 2026",
    fineDescription: "Affects S8 ground validity",
    fineMaxGbp: null,
    stage: "during",
    frequencyDays: null,
    sortOrder: 22,
  },
  {
    key: "inspection_records",
    name: "Periodic Inspection Records",
    legislation: "Landlord and Tenant Act 1985",
    fineDescription: "Disrepair claims",
    fineMaxGbp: null,
    stage: "during",
    frequencyDays: 365,
    sortOrder: 23,
  },

  // ── POSSESSION (2 key obligations) ───────────────────────────────────────
  {
    key: "section8_ground_validator",
    name: "Section 8 Ground Validated with Evidence",
    legislation: "Housing Act 1988 + Renters Rights Act 2026",
    fineDescription: "Invalid notice — no possession",
    fineMaxGbp: null,
    stage: "possession",
    frequencyDays: null,
    sortOrder: 24,
  },
  {
    key: "deposit_return_10days",
    name: "Deposit Return Within 10 Days of Checkout",
    legislation: "Housing Act 2004",
    fineDescription: "1-3x deposit as compensation",
    fineMaxGbp: null,
    stage: "possession",
    frequencyDays: null,
    sortOrder: 25,
  },
];

console.log(`Seeding ${obligations.length} obligation types...`);

let inserted = 0;
let skipped = 0;

for (const ob of obligations) {
  try {
    await ObligationType.findOneAndUpdate(
      { key: ob.key },
      ob,
      { upsert: true, new: true }
    );
    inserted++;
  } catch (err) {
    console.error(`Failed to seed: ${ob.key}`, err.message);
    skipped++;
  }
}

console.log(`✅ Done. Inserted/updated: ${inserted}, Failed: ${skipped}`);
mongoose.disconnect();

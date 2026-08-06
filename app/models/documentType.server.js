// models/documentType.server.js
// Stores all possible document types dynamically instead of an enum.
// Only SUPER_ADMIN can create/edit these.
import { mongoose } from "../config/db.server.js";

const { Schema } = mongoose;

const documentTypeSchema = new Schema(
  {
    // ── IDENTITY ──────────────────────────────────────────────────────────────
    key: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      // Machine-readable slug, e.g. "gas_safety_certificate"
      // Used in code for stable lookups — never changes once set
    },
    name: {
      type: String,
      required: true,
      trim: true,
      // Human-readable label, e.g. "Gas Safety Certificate (CP12)"
      // Can be renamed freely in the admin UI
    },

    // ── ENTITY SCOPE ──────────────────────────────────────────────────────────
    // WHO this doc type applies to — drives which upload dropdowns show it
    // Array to support multi-entity types (e.g. Passport → tenant + landlord)
    entity: {
      type: [String],
      enum: ["landlord", "property", "tenant", "tenancy", "maintenance_job", "general"],
      required: true,
      validate: {
        validator: (v) => v.length >= 1,
        message: "At least one entity is required",
      },
    },

    // ── DOCUMENT CLASSIFICATION ───────────────────────────────────────────────
    // WHAT kind of document — drives UI grouping and behaviour
    category: {
      type: String,
      enum: ["certificate", "licence", "safety", "insurance", "inspection", "identity", "compliance", "financial", "reference", "legal", "general"],
      default: "general",
    },

    // ── EXPIRY CONFIGURATION ──────────────────────────────────────────────────
    hasExpiry: {
      type: Boolean,
      default: false,
      // Whether to show/require expiry date during upload
    },
    expiryDays: {
      type: Number,
      default: null,
      // Auto-calculate expiry from issue date
      // Gas = 365, EICR = 1825 (5yr), EPC = 3650 (10yr)
      // null = manual expiry entry required (e.g. Passport)
    },

    // ── VERIFICATION ──────────────────────────────────────────────────────────
    requiresVerification: {
      type: Boolean,
      default: false,
      // Whether uploaded docs of this type need admin approval
    },

    // ── ADMIN ─────────────────────────────────────────────────────────────────
    isActive: {
      type: Boolean,
      default: true,
      // If false, hide from upload dropdowns but keep existing records safe
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

// ── INDEXES ───────────────────────────────────────────────────────────────────
documentTypeSchema.index({ entity: 1, isActive: 1 });
documentTypeSchema.index({ category: 1 });

export const DocumentType =
  mongoose.models.DocumentType || mongoose.model("DocumentType", documentTypeSchema);

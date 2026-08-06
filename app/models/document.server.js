// models/document.server.js
// Generic document model — covers ALL entities: landlord, property, tenant, tenancy.
// One model, reused everywhere. entityType + entityId identifies the owner.
import { mongoose } from "../config/db.server.js";

const { Schema } = mongoose;

const documentSchema = new Schema(
  {
    // ── AGENCY SCOPE ──────────────────────────────────────────────────────────
    agencyId: {
      type: Schema.Types.ObjectId,
      ref: "Agency",
      required: true,
      index: true,
    },

    // ── GENERIC ENTITY LINK ───────────────────────────────────────────────────
    // entityType + entityId replace the old tenancyId / obligationId fields.
    // This single pattern covers all modules without needing separate schemas.
    entityType: {
      type: String,
      enum: ["landlord", "property", "tenant", "tenancy", "expense", "disbursement", "maintenance_job", "general"],
      required: true,
      // expense:         receipt/invoice for an AgencyExpense record
      // disbursement:    attachment for a Disbursement record
      // maintenance_job: photo, quote, invoice for a MaintenanceJob
    },
    entityId: {
      type: Schema.Types.ObjectId,
      required: true,
      index: true,
    },

    // ── SUB-RECORD LINK (for notices, etc) ────────────────────────────────────
    relatedId: {
      type: Schema.Types.ObjectId,
      default: null,
      // optional link to a specific sub-record within the entity
      // null for standard documents (floor plans, gas certs etc)
      // populated for documents belonging to a specific notice:
      //
      // section8 notice document:
      // entityType: 'tenancy'
      // entityId: tenancyId
      // docType: 'section8_notice'
      // relatedId: section8Notice._id ← specific notice
      //
      // section13 notice document:
      // entityType: 'tenancy'
      // entityId: tenancyId
      // docType: 'section13_notice'
      // relatedId: section13Notice._id ← specific notice
      //
      // how to rent evidence:
      // entityType: 'tenancy'
      // entityId: tenancyId
      // docType: 'how_to_rent'
      // relatedId: null (only one per tenancy)
      //
      // standard property document:
      // relatedId: null (not linked to a sub-record)
    },

    // ── DOCUMENT CLASSIFICATION ───────────────────────────────────────────────
    docType: {
      type: Schema.Types.ObjectId,
      ref: "DocumentType",
      required: false,
    },
    documentType: {
      type: String,
      default: null,
    },

    // ── FILE METADATA ─────────────────────────────────────────────────────────
    fileName: { type: String, required: true },   // original name for display
    s3Key:    { type: String, required: true },   // S3 path — never expose directly
    fileSize: { type: Number },                   // bytes
    mimeType: { type: String },

    // ── DOCUMENT DETAILS ──────────────────────────────────────────────────────
    title: {
      type: String,
      default: null,
      trim: true,
      // User-defined title, e.g. "John's Passport" or "2024 Gas Certificate"
    },

    uploadedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },

    // ── VERIFICATION TRACKING ─────────────────────────────────────────────────
    status: {
      type: String,
      enum: ["pending", "verified", "rejected"],
      default: "pending",
    },
    verifiedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    verifiedAt: { type: Date, default: null },
    verificationNotes: { type: String, default: null },

    // ── DATE TRACKING ─────────────────────────────────────────────────────────
    issueDate: { type: Date, default: null },
      // When the document was issued (separate from upload date / createdAt)
      // e.g. the date printed on the Gas Safety Certificate

    // Gas cert: +1yr | EICR: +5yr | EPC: +10yr | Passport: actual expiry
    expiryDate: { type: Date, default: null },

    notes: { type: String, default: null },

    deleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// ── INDEXES ───────────────────────────────────────────────────────────────────
documentSchema.index({ agencyId: 1, entityType: 1, entityId: 1 });
documentSchema.index({ agencyId: 1, docType: 1 });
documentSchema.index({ expiryDate: 1 }); // for expiry alert cron jobs
documentSchema.index({
  agencyId: 1,
  entityType: 1,
  entityId: 1,
  relatedId: 1,
});
// used when fetching documents for a specific notice

export const Document =
  mongoose.models.Document || mongoose.model("Document", documentSchema);

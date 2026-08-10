// models/organizationExpense.server.js
// Records organization operating costs.
// Not linked to tenancy or landlord — organization-wide P&L.
// NEVER hard delete. Soft delete only (deleted: true).

import { mongoose } from "../config/db.server.js";

const { Schema } = mongoose;

const organizationExpenseSchema = new Schema(
  {
    // ── Organization scope ─────────────────────────────────────────
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },

    // ── Category ──────────────────────────────────────────────
    category: {
      type: String,
      enum: [
        "software",          // Proplet, CRM tools
        "insurance",         // PI insurance, cyber
        "marketing",         // Rightmove, Zoopla listings
        "maintenance",       // repairs on managed properties
        "professional_fees", // solicitor, accountant
        "office",            // rent, utilities, stationery
        "travel",            // mileage, transport
        "training",          // ARLA courses, CPD
        "banking",           // bank charges, transfer fees
        "other",
      ],
      required: true,
      index: true,
    },

    // ── Details ───────────────────────────────────────────────
    description: {
      type: String,
      required: true,
      trim: true,
      // e.g. "Rightmove subscription — May 2026"
    },
    // All amounts stored as Number in pounds to exactly 2dp.
    // Always Math.round(amount * 100) / 100 before save.
    amount: {
      type: Number,
      required: true,
    },
    vatAmount: {
      type: Number,
      default: 0,
      // VAT on expense if applicable
    },
    date: {
      type: Date,
      required: true,
      // date expense was incurred
    },

    // ── Optional property link ────────────────────────────────
    propertyId: {
      type: Schema.Types.ObjectId,
      ref: "Property",
      default: null,
      // link to property if expense is property-specific
      // e.g. maintenance cost for a specific property
      // null for general organization expenses
    },

    // ── Receipt ───────────────────────────────────────────────
    receiptDocumentId: {
      type: Schema.Types.ObjectId,
      ref: "Document",
      default: null,
      // uploaded receipt or invoice
      // Document.entityType = 'expense', Document.entityId = this._id
    },

    // ── Payment ───────────────────────────────────────────────
    paymentMethod: {
      type: String,
      enum: [
        "bank_transfer",
        "direct_debit",
        "credit_card",
        "cash",
        "cheque",
        "other",
      ],
      default: "bank_transfer",
    },
    reference: {
      type: String,
      trim: true,
      default: null,
    },

    // ── CSV import flag ───────────────────────────────────────
    importedFromCsv: {
      type: Boolean,
      default: false,
      // true if created via bank statement CSV import
    },
    csvRowReference: {
      type: String,
      default: null,
      // reference to original CSV row for reconciliation
    },

    // ── Audit ─────────────────────────────────────────────────
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    notes: { type: String, trim: true, default: null },

    // ── Soft delete ───────────────────────────────────────────
    // NEVER hard delete financial records — required for audit trail
    deleted:   { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

// ── Indexes ───────────────────────────────────────────────────
organizationExpenseSchema.index({ organizationId: 1, category: 1 });
organizationExpenseSchema.index({ organizationId: 1, date: 1 });
organizationExpenseSchema.index({ organizationId: 1, propertyId: 1 });
organizationExpenseSchema.index({ organizationId: 1, deleted: 1 });
organizationExpenseSchema.index({ organizationId: 1, deleted: 1, date: 1 });

export const OrganizationExpense =
  mongoose.models.OrganizationExpense ||
  mongoose.model("OrganizationExpense", organizationExpenseSchema);

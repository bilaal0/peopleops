// models/rentPayment.server.js
// Separate collection for rent payment records.
// Created automatically when a tenancy is created.
// Never embedded in the Tenancy document.

import { mongoose } from "../config/db.server.js";

const { Schema } = mongoose;

const rentPaymentSchema = new Schema(
  {
    // ── Agency scope ─────────────────────────────────────────
    agencyId: {
      type: Schema.Types.ObjectId,
      ref: "Agency",
      required: true,
      index: true,
    },

    // ── Links ─────────────────────────────────────────────────
    tenancyId: {
      type: Schema.Types.ObjectId,
      ref: "Tenancy",
      required: true,
      index: true,
    },
    propertyId: {
      type: Schema.Types.ObjectId,
      ref: "Property",
      required: true,
      // denormalised for query efficiency
      // allows fetching all payments for a property
      // without joining through tenancy
    },
    landlordId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      // denormalised for landlord statement queries
      // allows fetching all payments for a landlord
      // without joining through tenancy or property
    },

    // ── Period ────────────────────────────────────────────────
    periodStart: {
      type: Date,
      required: true,
      // first day of the rent period
      // e.g. 2026-03-01 for March 2026
    },
    periodEnd: {
      type: Date,
      required: true,
      // last day of the rent period
      // e.g. 2026-03-31 for March 2026
    },
    dueDate: {
      type: Date,
      required: true,
      // exact date payment is due
      // e.g. 2026-03-01 if rent.dueDay = 1
    },

    // ── Amounts ───────────────────────────────────────────────
    amountDue: {
      type: Number,
      required: true,
      // full rent due for this period e.g. 1200
    },
    amountPaid: {
      type: Number,
      default: 0,
      // amount actually received
      // 0 = unpaid
      // less than amountDue = partial payment
      // equal to amountDue = paid in full
    },
    amountOutstanding: {
      type: Number,
      default: null,
      // calculated: amountDue - amountPaid
      // stored for query efficiency
      // updated whenever amountPaid changes
      // set on creation: amountDue (fully outstanding)
      // set on payment: amountDue - amountPaid
    },

    // ── Commission ────────────────────────────────────────────
    // Copied from property.commission at time of record creation
    // Stored here so historical records stay accurate
    // even if commission rate changes later

    commissionType: {
      type: String,
      enum: ["percentage", "fixed", null],
      default: null,
      // copied from property.commission.type
    },
    commissionRate: {
      type: Number,
      default: null,
      // copied from property.commission.rate
      // percentage: e.g. 12.5 means 12.5%
      // fixed: e.g. 150 means £150 flat fee
    },
    commissionAmount: {
      type: Number,
      default: null,
      // auto-calculated when payment is marked as paid
      // percentage: (amountPaid * commissionRate) / 100
      // fixed: commissionRate (flat fee, capped at amountPaid)
      // null until payment is recorded
    },
    vatAmount: {
      type: Number,
      default: 0,
      // VAT on commission if agency is VAT registered
      // commissionAmount * 0.20
      // 0 if agency not VAT registered
    },
    netToLandlord: {
      type: Number,
      default: null,
      // auto-calculated: amountPaid - commissionAmount - vatAmount
      // this is what the landlord receives
      // null until payment is recorded
    },

    // ── Status ────────────────────────────────────────────────
    status: {
      type: String,
      enum: [
        "pending",   // not yet due -- future payment
        "due",       // due date reached, not yet paid
        "paid",      // paid in full
        "partial",   // partially paid
        "overdue",   // past due date, not fully paid
        "waived",    // agency has waived this payment
      ],
      default: "pending",
      index: true,
    },
    // STATUS TRANSITIONS (enforced by cron job and actions):
    // pending  → due      : when dueDate is reached (cron)
    // due      → overdue  : when 1 day past dueDate (cron)
    // due      → paid     : when agent marks as paid (action)
    // due      → partial  : when agent records partial (action)
    // overdue  → paid     : when agent marks as paid (action)
    // overdue  → partial  : when agent records partial (action)
    // any      → waived   : agency_admin only (action)

    // ── Payment details ───────────────────────────────────────
    paymentMethod: {
      type: String,
      enum: [
        "standing_order",
        "bacs_transfer",
        "direct_debit",
        "cash",
        "cheque",
        "other",
        null,
      ],
      default: null,
      // set when agent marks payment as received
    },
    paymentReference: {
      type: String,
      trim: true,
      default: null,
      // bank reference number or cheque number
      // useful for reconciliation
    },
    paidDate: {
      type: Date,
      default: null,
      // actual date payment was received
      // set by agent when marking as paid
      // may differ from dueDate (late payments)
    },
    notes: {
      type: String,
      trim: true,
      default: null,
      // short annotation on this specific payment
      // e.g. 'paid 3 days late'
      // e.g. 'partial payment agreed with tenant'
      // NOT the same as the generic Note model
      // this is a short inline note on the payment record
    },

    // ── Audit ─────────────────────────────────────────────────
    recordedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
      // agency staff member who marked payment as received
    },
    recordedAt: {
      type: Date,
      default: null,
      // when the payment was recorded in the system
    },
    waivedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    waivedAt: {
      type: Date,
      default: null,
    },
    waivedReason: {
      type: String,
      trim: true,
      default: null,
      // required when status set to waived
      // e.g. 'Tenancy ended early'
      // e.g. 'Landlord agreed to waive final month'
    },

    // ── Soft delete ───────────────────────────────────────────
    deleted: {
      type: Boolean,
      default: false,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
    deletedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    // NEVER hard delete rent payment records
    // Financial records must be retained for audit purposes
    // Waived payments kept with status: 'waived' not deleted
  },
  {
    timestamps: true,
    // createdAt: when record was auto-generated
    // updatedAt: when record was last modified
  }
);

// ── Indexes ───────────────────────────────────────────────────

rentPaymentSchema.index({ agencyId: 1, tenancyId: 1 });
// primary query: all payments for a tenancy (rent tab)

rentPaymentSchema.index({ agencyId: 1, status: 1 });
// compliance dashboard: all overdue payments for agency

rentPaymentSchema.index({ agencyId: 1, dueDate: 1 });
// cron job: find payments due today

rentPaymentSchema.index({ agencyId: 1, landlordId: 1 });
// landlord statement: all payments for a landlord

rentPaymentSchema.index({ agencyId: 1, propertyId: 1 });
// property level rent reporting

rentPaymentSchema.index({ tenancyId: 1, periodStart: 1 });
// check if a period already has a payment record
// used by cron job to avoid duplicate generation

rentPaymentSchema.index({ agencyId: 1, deleted: 1, status: 1 });
// filtered queries excluding deleted records

// ── Model export ──────────────────────────────────────────────

export const RentPayment =
  mongoose.models.RentPayment ||
  mongoose.model("RentPayment", rentPaymentSchema);

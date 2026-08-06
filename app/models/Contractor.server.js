// models/Contractor.server.js
// Stores the agency's preferred contractor list with trades and accreditations.
// No contractor marketplace — just the agency's own list.

import { mongoose } from "../config/db.server.js";

const { Schema } = mongoose;

const contractorSchema = new Schema(
  {
    // ── Agency scope ─────────────────────────────────────────
    agencyId: {
      type: Schema.Types.ObjectId,
      ref: "Agency",
      required: true,
      index: true,
    },

    // ── Basic details ─────────────────────────────────────────
    name: {
      type: String,
      required: true,
      trim: true,
      // Company name or individual name
    },
    contactName: {
      type: String,
      trim: true,
      default: null,
      // Contact person if a company
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      default: null,
    },
    phone: {
      type: String,
      trim: true,
      default: null,
    },
    address: {
      line1:    { type: String, trim: true, default: null },
      city:     { type: String, trim: true, default: null },
      postcode: { type: String, trim: true, uppercase: true, default: null },
    },

    // ── Trades ────────────────────────────────────────────────
    trades: {
      type: [String],
      enum: [
        "plumbing",
        "electrical",
        "gas",
        "heating",
        "roofing",
        "structural",
        "damp_treatment",
        "pest_control",
        "glazing",
        "flooring",
        "decorating",
        "general_builder",
        "landscaping",
        "appliances",
        "cleaning",
        "locksmith",
        "other",
      ],
      default: [],
      // Multi-select — a contractor can cover multiple trades
    },

    // ── Accreditation ─────────────────────────────────────────
    gasRegistered: {
      type: Boolean,
      default: false,
      // Gas Safe registered
    },
    gasRegistrationNumber: {
      type: String,
      trim: true,
      default: null,
    },
    electricalRegistered: {
      type: Boolean,
      default: false,
      // NICEIC, NAPIT or other approved body
    },
    electricalRegistrationBody: {
      type: String,
      trim: true,
      default: null,
    },

    // ── Insurance ─────────────────────────────────────────────
    hasInsurance: {
      type: Boolean,
      default: false,
    },
    insuranceExpiryDate: {
      type: Date,
      default: null,
    },
    publicLiabilityAmount: {
      type: Number,
      default: null,
      // Public liability cover amount in pounds
    },

    // ── Preferred status ──────────────────────────────────────
    isPreferred: {
      type: Boolean,
      default: false,
      // Agency's preferred contractor for a trade
      // Shown first in contractor selection dropdowns
    },
    notes: {
      type: String,
      trim: true,
      default: null,
    },

    // ── Status ────────────────────────────────────────────────
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },

    // ── Audit ─────────────────────────────────────────────────
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // ── Soft delete ───────────────────────────────────────────
    deleted:   { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: Schema.Types.ObjectId, default: null },
  },
  { timestamps: true }
);

// ── Indexes ───────────────────────────────────────────────────
contractorSchema.index({ agencyId: 1, trades: 1 });
contractorSchema.index({ agencyId: 1, isPreferred: 1 });
contractorSchema.index({ agencyId: 1, status: 1 });
contractorSchema.index({ agencyId: 1, deleted: 1 });

export const Contractor =
  mongoose.models.Contractor ||
  mongoose.model("Contractor", contractorSchema);

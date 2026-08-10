// models/PlannedMaintenanceSchedule.server.js
// Recurring maintenance schedules for a property.
// Annual gas check, 5-yearly EICR, periodic inspections, etc.
// When nextDueDate is within daysBeforeDue, a MaintenanceJob is auto-generated.

import { mongoose } from "../config/db.server.js";

const { Schema } = mongoose;

const plannedMaintenanceSchema = new Schema(
  {
    // ── Organization scope ─────────────────────────────────────────
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },

    // ── Property link ─────────────────────────────────────────
    propertyId: {
      type: Schema.Types.ObjectId,
      ref: "Property",
      required: true,
      index: true,
    },
    landlordId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      // Denormalised from property for query efficiency
    },

    // ── Schedule details ──────────────────────────────────────
    title: {
      type: String,
      required: true,
      trim: true,
      // e.g. "Annual Gas Safety Check"
    },
    category: {
      type: String,
      enum: [
        "plumbing",
        "electrical",
        "gas",
        "heating",
        "roofing",
        "structural",
        "damp_mould",
        "pest_control",
        "doors_windows",
        "flooring",
        "decorating",
        "garden",
        "appliances",
        "cleaning",
        "inspection",
        "other",
      ],
      required: true,
      // Same enum as MaintenanceJob.category
    },
    description: {
      type: String,
      trim: true,
      default: null,
    },
    preferredContractorId: {
      type: Schema.Types.ObjectId,
      ref: "Contractor",
      default: null,
      // If set, auto-assigned when the job is created
    },

    // ── Recurrence ────────────────────────────────────────────
    frequency: {
      type: String,
      enum: [
        "monthly",
        "quarterly",
        "6_monthly",
        "annual",
        "2_yearly",
        "5_yearly",
        "10_yearly",
        "custom",
      ],
      required: true,
    },
    frequencyDays: {
      type: Number,
      default: null,
      // Used when frequency === 'custom'
      // Number of days between occurrences
    },
    nextDueDate: {
      type: Date,
      required: true,
      index: true,
      // Date the next job should be created
    },
    lastCompletedDate: {
      type: Date,
      default: null,
      // Updated when a linked MaintenanceJob is closed
    },
    estimatedCost: {
      type: Number,
      default: null,
      // Passed through to the auto-generated MaintenanceJob
    },

    // ── Auto-generation settings ──────────────────────────────
    autoGenerate: {
      type: Boolean,
      default: true,
      // If true: cron job creates MaintenanceJob automatically
      // If false: agent creates manually from the schedule view
    },
    daysBeforeDue: {
      type: Number,
      default: 30,
      // How many days before nextDueDate to create the job
    },

    // ── Schedule status ───────────────────────────────────────
    active: {
      type: Boolean,
      default: true,
      // Set to false to pause without deleting
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
plannedMaintenanceSchema.index({ organizationId: 1, propertyId: 1 });
plannedMaintenanceSchema.index({ organizationId: 1, nextDueDate: 1 });
plannedMaintenanceSchema.index({ organizationId: 1, active: 1 });
plannedMaintenanceSchema.index({ organizationId: 1, deleted: 1 });

export const PlannedMaintenanceSchedule =
  mongoose.models.PlannedMaintenanceSchedule ||
  mongoose.model("PlannedMaintenanceSchedule", plannedMaintenanceSchema);

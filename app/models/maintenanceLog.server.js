// models/maintenanceLog.server.js
// Awaab's Law tracker — 24hr emergency and 10-day urgent repair timers
import { mongoose } from "../config/db.server.js";

const { Schema } = mongoose;

const maintenanceLogSchema = new Schema(
  {
    agencyId: {
      type: Schema.Types.ObjectId,
      ref: "Agency",
      required: true,
      index: true,
    },
    tenancyId: {
      type: Schema.Types.ObjectId,
      ref: "Tenancy",
      required: true,
      index: true,
    },

    // Severity — determines Awaab's Law response deadline
    severity: {
      type: String,
      enum: ["emergency", "urgent", "routine"],
      required: true,
    },

    description: { type: String, required: true },

    // Timeline tracking
    reportedAt: { type: Date, required: true, default: Date.now },

    // Auto-calculated on save based on severity
    responseDueAt: {
      type: Date, // emergency = reportedAt + 24hrs, urgent = reportedAt + 10 days
    },

    respondedAt: { type: Date, default: null }, // When agency acknowledged/responded
    resolvedAt: { type: Date, default: null }, // When repair was completed

    // Contractor details
    contractorName: { type: String },
    contractorPhone: { type: String },

    // Evidence — photos stored in S3
    photoS3Keys: [{ type: String }],

    // Notes
    notes: { type: String },

    // Status
    status: {
      type: String,
      enum: ["open", "in_progress", "resolved"],
      default: "open",
    },

    reportedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

// Auto-calculate responseDueAt based on severity before save
maintenanceLogSchema.pre("save", function (next) {
  if (this.isNew || this.isModified("severity") || this.isModified("reportedAt")) {
    const reported = this.reportedAt || new Date();
    if (this.severity === "emergency") {
      // Awaab's Law: 24 hours for emergency hazards
      this.responseDueAt = new Date(reported.getTime() + 24 * 60 * 60 * 1000);
    } else if (this.severity === "urgent") {
      // Awaab's Law: 10 days for urgent hazards
      this.responseDueAt = new Date(reported.getTime() + 10 * 24 * 60 * 60 * 1000);
    } else {
      // Routine — no statutory deadline, set 30 days as target
      this.responseDueAt = new Date(reported.getTime() + 30 * 24 * 60 * 60 * 1000);
    }
  }
  next();
});

// Virtual: is this response overdue?
maintenanceLogSchema.virtual("isOverdue").get(function () {
  if (this.status === "resolved") return false;
  return this.responseDueAt && new Date() > this.responseDueAt;
});

// Virtual: hours remaining until deadline
maintenanceLogSchema.virtual("hoursRemaining").get(function () {
  if (!this.responseDueAt) return null;
  const ms = this.responseDueAt.getTime() - Date.now();
  return Math.round(ms / (1000 * 60 * 60));
});

export const MaintenanceLog =
  mongoose.models.MaintenanceLog ||
  mongoose.model("MaintenanceLog", maintenanceLogSchema);

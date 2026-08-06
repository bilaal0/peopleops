// models/auditLog.server.js
// Immutable evidence trail — backbone of the Evidence Vault PDF
// IMPORTANT: Never update or delete records from this collection
// App-layer enforcement: only insertions allowed
import { mongoose } from "../config/db.server.js";

const { Schema } = mongoose;

const auditLogSchema = new Schema(
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
      default: null,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    // Action type — what happened
    action: {
      type: String,
      required: true,
      enum: [
        "tenancy_created",
        "obligation_logged",
        "document_uploaded",
        "document_viewed",       // NEW — track every secure document view
        "document_verified",     // NEW — admin marked doc as verified
        "document_rejected",     // NEW — admin rejected a doc
        "alert_sent",
        "alert_acknowledged",
        "bundle_generated",
        "user_login",
        "user_logout",
        "csv_import",
        "maintenance_reported",
        "maintenance_resolved",
        "section8_issued",
        "rent_increase_issued",
        "pet_request_responded",
        "tenancy_ended",
      ],
    },

    entityType: { type: String }, // e.g. 'Obligation', 'Document', 'Tenancy'
    entityId: { type: Schema.Types.ObjectId }, // ID of the affected record

    // Full metadata snapshot — stored verbatim for evidence purposes
    metadata: { type: Schema.Types.Mixed, default: {} },

    ipAddress: { type: String },
  },
  {
    // createdAt only — no updatedAt (immutable record)
    timestamps: { createdAt: "createdAt", updatedAt: false },
  }
);

// Hard rule: no updates or deletes at the application layer
auditLogSchema.pre(["updateOne", "updateMany", "findOneAndUpdate"], function () {
  throw new Error("AuditLog records are immutable and cannot be updated.");
});
auditLogSchema.pre(
  ["deleteOne", "deleteMany", "findOneAndDelete"],
  function () {
    throw new Error("AuditLog records are immutable and cannot be deleted.");
  }
);

export const AuditLog =
  mongoose.models.AuditLog || mongoose.model("AuditLog", auditLogSchema);

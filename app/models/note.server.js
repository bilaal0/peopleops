import { mongoose } from "../config/db.server.js";

const { Schema } = mongoose;

export const NOTE_ENTITY_TYPES = [
  "property",
  "landlord",
  "tenant",
  "tenancy",
  "maintenance_job",
  "contractor",
];

export const NOTE_EVENT_TYPES = [
  "landlord_added",
  "landlord_updated",
  "landlord_aml_passed",
  "landlord_aml_referred",
  "landlord_aml_failed",
  "landlord_document_uploaded",
  "landlord_archived",
  "property_added",
  "property_updated",
  "property_status_changed",
  "property_gas_cert_uploaded",
  "property_eicr_uploaded",
  "property_epc_uploaded",
  "property_document_uploaded",
  "property_deleted",
  "tenant_added",
  "tenant_updated",
  "tenant_rtr_checked",
  "tenant_rtr_recheck_due",
  "tenant_rtr_expired",
  "tenant_document_uploaded",
  "tenant_archived",
  "tenancy_created",
  "tenancy_updated",
  "tenancy_deposit_protected",
  "tenancy_deposit_prescribed_info_served",
  "tenancy_how_to_rent_served",
  "tenancy_rra_information_sheet_served",
  "tenancy_section8_notice_created",
  "tenancy_section8_outcome_updated",
  "tenancy_section13_notice_created",
  "tenancy_section13_outcome_updated",
  "tenancy_ended",
  "tenancy_tenant_notice_received",
  "rent_payment_received",
  "rent_payment_partial",
  "rent_payment_waived",
  "rent_payment_overdue",
  "rent_disbursement_created",
  "rent_disbursement_paid",
  "maintenance_job_created",
  "maintenance_job_updated",
  "maintenance_contractor_assigned",
  "maintenance_job_in_progress",
  "maintenance_job_completed",
  "maintenance_job_closed",
  "maintenance_job_cancelled",
  "document_uploaded",
  "document_verified",
  "document_deleted",
  "email_sent",
  "call_logged",
  "letter_logged",
  "evidence_bundle_generated",
];

const noteSchema = new Schema(
  {
    // ── Organization scope ─────────────────────────────────────────
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },

    // ── Entity reference (polymorphic) ───────────────────────
    entityType: {
      type: String,
      enum: NOTE_ENTITY_TYPES,
      required: true,
    },

    entityId: {
      type: Schema.Types.ObjectId,
      required: true,
    },

    // ── Note content ─────────────────────────────────────────
    text: {
      type: String,
      required: true,
      trim: true,
      maxLength: 2000,
    },

    // ── Author ───────────────────────────────────────────────
    addedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    eventType: {
      type: String,
      enum: [null, ...NOTE_EVENT_TYPES],
      default: null,
      index: true,
    },

    isSystem: {
      type: Boolean,
      default: false,
      index: true,
    },

    metadata: {
      type: Schema.Types.Mixed,
      default: null,
    },

    isInternal: {
      type: Boolean,
      default: false,
    },
    // createdAt from timestamps = the note timestamp
    // no separate addedAt field needed
  },
  {
    timestamps: true,
    // createdAt = when note was added
    // updatedAt = not used for notes (no editing allowed)
  }
);

// ── Indexes ──────────────────────────────────────────────────

noteSchema.index({ organizationId: 1, entityType: 1, entityId: 1 });
// primary query index – all notes for a specific entity

noteSchema.index({ organizationId: 1, addedBy: 1 });
// useful for: find all notes added by a specific user

noteSchema.index({ organizationId: 1, isSystem: 1 });
noteSchema.index({ organizationId: 1, eventType: 1 });
noteSchema.index({ organizationId: 1, createdAt: -1 });

export const Note =
  mongoose.models.Note || mongoose.model("Note", noteSchema);

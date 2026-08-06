// models/tenancy.server.js
import { mongoose } from "../config/db.server.js";

const { Schema } = mongoose;

const tenancySchema = new Schema(
  {
    // ── Agency scope ─────────────────────────────────────────
    agencyId: {
      type: Schema.Types.ObjectId,
      ref: "Agency",
      required: true,
      index: true,
    },

    // ── Core links ────────────────────────────────────────────
    propertyId: {
      type: Schema.Types.ObjectId,
      ref: "Property",
      required: true,
      index: true,
    },
    landlordId: {
      type: Schema.Types.ObjectId,
      ref: "User", // User with role: LANDLORD
      required: true,
      index: true,
    },
    tenantIds: {
      type: [Schema.Types.ObjectId],
      ref: "User", // Users with role: TENANT
      required: true,
      validate: {
        validator: (v) => v.length >= 1,
        message: "At least one tenant is required",
      },
    },
    // tenantIds is an array to support joint tenancies
    // minimum 1 tenant, no maximum enforced at schema level
    // practical limit: 6 tenants (HMO)

    // ── Tenancy type ──────────────────────────────────────────
    tenancyType: {
      type: String,
      enum: ["ast", "apt"],
      required: true,
      // ast = Assured Shorthold Tenancy (pre May 2026)
      // apt = Assured Periodic Tenancy (post May 2026)
    },

    // ── Dates ─────────────────────────────────────────────────
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      default: null,
      // required for AST (fixed term)
      // null for APT (no fixed end date)
    },
    actualEndDate: {
      type: Date,
      default: null,
      // set when tenancy actually ends (may differ from endDate)
    },

    // ── Rent ──────────────────────────────────────────────────
    rent: {
      amount: {
        type: Number,
        required: true, // monthly rent in pounds
      },
      dueDay: {
        type: Number,
        default: 1,
        min: 1,
        max: 28, // day of month rent is due
      },
      paymentMethod: {
        type: String,
        enum: [
          "standing_order",
          "bacs_transfer",
          "direct_debit",
          "cash",
          "cheque",
          "other",
        ],
        default: "standing_order",
      },
      reviewDate: {
        type: Date,
        default: null,
        // RRA 2026: minimum 12 months between reviews
        // auto-calculated: startDate + 12 months
      },
      lastIncreasedAt: {
        type: Date,
        default: null,
      },
      lastIncreasedAmount: {
        type: Number,
        default: null, // previous rent before last increase
      },
    },

    // ── Deposit ───────────────────────────────────────────────
    deposit: {
      amount: {
        type: Number,
        default: null,
        // legal max: 5 weeks rent (rent * 12 / 52 * 5)
      },
      scheme: {
        type: String,
        enum: ["dps", "tds", "mydeposits", "none", null],
        default: null,
      },
      reference: {
        type: String,
        trim: true,
        default: null, // scheme reference number
      },
      protectedDate: {
        type: Date,
        default: null,
        // must be within 30 days of tenancy start
      },
      prescribedInfoServedDate: {
        type: Date,
        default: null,
        // must be within 30 days of tenancy start
        // failure = cannot serve Section 21 (now Section 8)
      },
    },

    // ── How to Rent guide ─────────────────────────────────────
    howToRent: {
      served: {
        type: Boolean,
        default: false,
      },
      servedDate: {
        type: Date,
        default: null,
      },
      version: {
        type: String,
        default: null,
        // store version served so you know if re-serve needed
        // e.g. 'March 2024'
      },
      documentId: {
        type: Schema.Types.ObjectId,
        ref: "Document",
        default: null,
        // link to uploaded evidence of service
      },
    },

    // ── RRA Information Sheet (Renters Rights Act 2025) ──────────
    // Required for ALL tenancies that started before 1 May 2026.
    // Penalty for non-service: up to £7,000 per tenancy.
    // Any Section 8 notice is invalid until the sheet is served.
    rrainformationSheet: {
      served: {
        type: Boolean,
        default: false,
        // null = not applicable (tenancy started >= 1 May 2026)
      },
      servedDate: {
        type: Date,
        default: null,
      },
      method: {
        type: String,
        enum: ["email_attachment", "post", "hand_delivered", null],
        default: null,
        // NOTE: 'link' is intentionally NOT in this enum.
        // Sending a link is not valid service under RRA 2025.
      },
      servedToTenantIds: {
        type: [Schema.Types.ObjectId],
        ref: "User",
        default: [],
        // track which named tenants received their copy
        // must match tenancy.tenantIds for full compliance
      },
      proofDocumentId: {
        type: Schema.Types.ObjectId,
        ref: "Document",
        default: null,
        // uploaded evidence of delivery
      },
      notes: {
        type: String,
        trim: true,
        default: null,
      },
    },


    // ── Status ────────────────────────────────────────────────
    status: {
      type: String,
      enum: ["active", "ended", "terminated", "abandoned"],
      default: "active",
      index: true,
    },

    // ── Section 8 notices ─────────────────────────────────────
    section8Notices: {
      type: [
        {
          servedDate:     { type: Date,     required: true },
          grounds:        { type: [String], required: true },
          expiryDate:     { type: Date,     required: true },
          documentId: {
            type: Schema.Types.ObjectId,
            ref: "Document",
            default: null,
          },
          notes:          { type: String,   default: null },
          outcome: {
            type: String,
            enum: ["pending", "withdrawn", "complied", "court_filed", null],
            default: "pending",
          },
          courtFiledDate:   { type: Date, default: null },
          courtHearingDate: { type: Date, default: null },
        },
      ],
      default: [],
    },

    // ── Section 13 rent increase notices ─────────────────────
    section13Notices: {
      type: [
        {
          servedDate:    { type: Date,   required: true },
          currentRent:   { type: Number, required: true },
          proposedRent:  { type: Number, required: true },
          effectiveDate: { type: Date,   required: true },
          // RRA 2026: minimum 2 months notice
          documentId: {
            type: Schema.Types.ObjectId,
            ref: "Document",
            default: null,
          },
          outcome: {
            type: String,
            enum: ["pending", "accepted", "challenged", "withdrawn", null],
            default: "pending",
          },
          tribunalDate: { type: Date, default: null },
        },
      ],
      default: [],
    },

    // ── Tenancy end ───────────────────────────────────────────
    endReason: {
      type: String,
      enum: [
        "tenant_notice",
        "section8",
        "mutual_agreement",
        "fixed_term_end",
        "abandonment",
        "other",
        null,
      ],
      default: null,
    },
    tenantNoticeDate: {
      type: Date,
      default: null,
      // date tenant gave notice to leave (APT)
      // APT: tenant must give 2 months notice
    },
    tenantNoticeEndDate: {
      type: Date,
      default: null,
      // auto-calculated: tenantNoticeDate + 2 months
    },

    // ── Audit ─────────────────────────────────────────────────
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    // ── Soft delete ───────────────────────────────────────────
    deleted:   { type: Boolean,              default: false },
    deletedAt: { type: Date,                 default: null  },
    deletedBy: { type: Schema.Types.ObjectId, default: null },
  },
  {
    timestamps: true,
  }
);

// ── Indexes ───────────────────────────────────────────────────
tenancySchema.index({ agencyId: 1, status: 1 });
tenancySchema.index({ agencyId: 1, propertyId: 1 });
tenancySchema.index({ agencyId: 1, landlordId: 1 });
tenancySchema.index({ agencyId: 1, tenantIds: 1 });
tenancySchema.index({ agencyId: 1, "rent.reviewDate": 1 });
tenancySchema.index({ agencyId: 1, endDate: 1 });
tenancySchema.index({ agencyId: 1, deleted: 1 });

export const Tenancy =
  mongoose.models.Tenancy || mongoose.model("Tenancy", tenancySchema);

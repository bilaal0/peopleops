// models/property.server.js
import { mongoose } from "../config/db.server.js";

const { Schema } = mongoose;

const propertySchema = new Schema(
  {
    // ============================================================
    // AGENCY SCOPE
    // ============================================================

    agencyId: {
      type: Schema.Types.ObjectId,
      ref: "Agency",
      required: true,
      index: true,
    },

    // ============================================================
    // LANDLORD LINK
    // ============================================================

    landlordId: {
      type: Schema.Types.ObjectId,
      ref: "User", // refs User model (LANDLORD role)
      required: true,
      index: true,
    },
    // Every property must belong to a landlord.
    // Cannot create a property without selecting a landlord first.

    // ============================================================
    // ADDRESS
    // ============================================================

    addressLine1: { type: String, required: true, trim: true },
    addressLine2: { type: String, trim: true, default: null },
    city:         { type: String, required: true, trim: true },
    county:       { type: String, trim: true, default: null },
    postcode:     { type: String, required: true, uppercase: true, trim: true },
    country: {
      type: String,
      trim: true,
      default: "England",
      // England / Wales / Scotland / Northern Ireland
      // Important: Wales has different housing legislation in some areas
    },

    uprn: {
      type: String,
      trim: true,
      default: null,
      // Unique Property Reference Number
      // Future: PRS Database integration, portal feeds, CRM matching
    },

    // ============================================================
    // PROPERTY DETAILS
    // ============================================================

    propertyType: {
      type: String,
      enum: [
        "terraced",
        "semi_detached",
        "detached",
        "flat",
        "bungalow",
        "maisonette",
        "hmo",
        "studio",
        "other",
      ],
      required: true,
      default: "flat",
    },
    // Expanded from ["standard","hmo"] to specific types.
    // propertyType === "hmo" triggers HMO compliance obligations.

    hmoLicenceNo: {
      type: String,
      trim: true,
      default: null,
      // Required when propertyType === "hmo"
    },

    hmoLicenceExpiry: {
      type: Date,
      default: null,
      // Required when propertyType === "hmo"
      // Compliance engine alerts 60/30/14 days before expiry
    },

    hmoMaxOccupants: {
      type: Number,
      default: null,
      // Maximum occupants permitted under HMO licence
    },

    bedrooms:  { type: Number, default: null },
    bathrooms: { type: Number, default: null },

    floorAreaSqm: {
      type: Number,
      default: null,
      // Useful for EPC band calculations and MEES compliance
    },

    constructionYear: {
      type: Number,
      default: null,
      // Older properties more likely to have EPC issues
    },

    furnished: {
      type: String,
      enum: ["furnished", "unfurnished", "part_furnished", null],
      default: null,
      // Affects inventory requirements
    },

    // ============================================================
    // EPC (ENERGY PERFORMANCE CERTIFICATE)
    // ============================================================

    epcRating: {
      type: String,
      enum: ["A", "B", "C", "D", "E", "F", "G", null],
      default: null,
    },

    epcExpiryDate: {
      type: Date,
      default: null,
      // EPC valid for 10 years. MEES 2018: cannot let with expired EPC.
      // F or G rated: cannot legally let without a valid exemption.
    },

    epcExemption: {
      type: Boolean,
      default: false,
      // True if MEES exemption registered for F/G property
    },

    epcExemptionReason: {
      type: String,
      default: null,
      // Required if epcExemption = true
      // e.g. "Listed building", "All improvements made", "New landlord"
    },

    // ============================================================
    // SELECTIVE LICENSING
    // ============================================================

    selectiveLicenceRequired: {
      type: Boolean,
      default: false,
      // Some councils require selective licensing for private rented properties
    },

    selectiveLicenceNo: {
      type: String,
      trim: true,
      default: null,
    },

    selectiveLicenceExpiry: {
      type: Date,
      default: null,
    },

    // ============================================================
    // LOCAL AUTHORITY AND COUNCIL
    // ============================================================

    localAuthority: {
      type: String,
      trim: true,
      default: null,
      // Auto-populated from postcode lookup (postcodes.io)
    },

    councilTaxBand: {
      type: String,
      enum: ["A", "B", "C", "D", "E", "F", "G", "H", null],
      default: null,
    },

    // ============================================================
    // COMMISSION
    // ============================================================

    commission: {
      type: {
        type: String,
        enum: ["percentage", "fixed"],
        default: "percentage",
        // percentage: X% of monthly rent
        // fixed: flat fee per month regardless of rent
      },
      rate: {
        type: Number,
        default: null,
      },
    },

    // ============================================================
    // PORTAL AND MARKETING
    // ============================================================

    portalListed: {
      type: Boolean,
      default: false,
      // Currently advertised on Rightmove/Zoopla etc
    },

    advertisedRent: {
      type: Number,
      default: null,
      // Monthly rent as advertised on portals
      // RRA 2026: cannot accept rent above advertised amount
    },

    // ============================================================
    // PROPERTY STATUS
    // ============================================================

    status: {
      type: String,
      enum: [
        "available",    // vacant, ready to let
        "let",          // active tenancy in place
        "under_offer",  // prospective tenant agreed, not yet signed
        "maintenance",  // temporarily unavailable due to works
        "withdrawn",    // taken off market
      ],
      default: "available",
      index: true,
    },
    // STATUS TRANSITIONS:
    // available    → under_offer | let | maintenance | withdrawn
    // under_offer  → available | let | withdrawn
    // let          → BLOCKED (must end tenancy first)
    // maintenance  → available | withdrawn
    // withdrawn    → available

    // ============================================================
    // IMAGES
    // ============================================================

    mainImage: {
      type: String,
      default: null,
      // S3 key for the main property image
    },

    gallery: [
      {
        type: String,
        // Array of S3 keys for additional property images
      },
    ],

    // ============================================================
    // INTERNAL
    // ============================================================
    // (Notes have been moved to the external Note model array)

    // ============================================================
    // AUDIT
    // ============================================================

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

    // ============================================================
    // SOFT DELETE
    // ============================================================

    deleted: {
      type: Boolean,
      default: false,
      index: true,
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
  },
  { timestamps: true }
);

// ============================================================
// INDEXES
// ============================================================

propertySchema.index({ agencyId: 1, status: 1 });
propertySchema.index({ agencyId: 1, deleted: 1 });
propertySchema.index({ landlordId: 1, agencyId: 1 });
propertySchema.index({ agencyId: 1, epcRating: 1 });
propertySchema.index({ postcode: 1 });
propertySchema.index({ hmoLicenceExpiry: 1 });
propertySchema.index({ selectiveLicenceExpiry: 1 });
propertySchema.index({ epcExpiryDate: 1 });

// ============================================================
// VIRTUAL: FULL ADDRESS
// ============================================================

propertySchema.virtual("fullAddress").get(function () {
  return [
    this.addressLine1,
    this.addressLine2,
    this.city,
    this.county,
    this.postcode,
  ]
    .filter(Boolean)
    .join(", ");
});

export const Property =
  mongoose.models.Property || mongoose.model("Property", propertySchema);

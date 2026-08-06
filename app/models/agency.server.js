import { mongoose } from "../config/db.server.js";

const { Schema } = mongoose;

const agencySchema = new Schema(
  {
    name: { type: String, required: true },
    slug: { type: String, unique: true }, // e.g., "blue-ocean-agency"
    image: { type: String, default: "no-image.png" }, // Agency logo
    
    // BRANCH LOGIC
    // If null, this is the Head Office/Root Agency.
    // If set, this is a Branch of another agency.
    parentId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'Agency', 
      default: null 
    },

    // PRIMARY ADMIN
    // Reference to the main user/admin for this agency
    primaryAdmin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },

    // FEATURES & LIMITS
    // This is where we define what the agency can do.
    plan: {
      tier: { type: String, enum: ['free', 'pro', 'enterprise'], default: 'free' },
      propertyLimit: { type: Number, default: 5 }, // Hard limit on properties
      userLimit: { type: Number, default: 2 },     // Hard limit on staff
      canCreateBranches: { type: Boolean, default: false }
    },

    // METADATA
    status: { type: String, enum: ['active', 'suspended'], default: 'active' },
    deleted: { type: Boolean, default: false },

    // AUDIT TRAIL
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { 
    timestamps: true // Automatically manages createdAt and updatedAt
  }
);

// Index for faster lookups

agencySchema.index({ parentId: 1 });

export const Agency = mongoose.models.Agency || mongoose.model("Agency", agencySchema);

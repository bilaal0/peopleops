import { mongoose } from "../config/db.server.js";

const { Schema } = mongoose;

const organizationSchema = new Schema(
  {
    name: { type: String, required: true },
    slug: { type: String, unique: true }, // e.g., "blue-ocean-organization"
    image: { type: String, default: "no-image.png" }, // Organization logo
    
    // BRANCH LOGIC
    // If null, this is the Head Office/Root Organization.
    // If set, this is a Branch of another organization.
    parentId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'Organization', 
      default: null 
    },

    // PRIMARY ADMIN
    // Reference to the main user/admin for this organization
    primaryAdmin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },

    // FEATURES & LIMITS
    // This is where we define what the organization can do.
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

organizationSchema.index({ parentId: 1 });

export const Organization = mongoose.models.Organization || mongoose.model("Organization", organizationSchema);

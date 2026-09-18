// models/user.server.js
import { mongoose } from "../config/db.server.js";
import { hash } from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
import { ALL_ROLES, Roles } from "../utils/permission.js";

export const USER_TITLES = ["Mr", "Mrs", "Miss", "Ms", "Dr", "Prof", "Sir", "Other"];

const { Schema } = mongoose;

const userSchema = new Schema(
  {
    profilePicture: { type: String, default: "no-image.png" },
    title: { type: String, enum: USER_TITLES },
    firstName: { type: String },
    lastName: { type: String },
    jobTitle: { type: String },

    // Store bcrypt hash. select: false prevents accidental exposure.
    password: { type: String, select: false, default: function () { return uuidv4(); } },
    plainPassword: { type: String, select: false }, // Stored for SuperAdmin visibility per user request
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, },

    middleName: { type: String },
    telephoneNo: { type: String },
    positionInCompany: { type: String },
    companyName: { type: String, trim: true },
    services: [{ type: String, trim: true }],

    // Enforce known roles only
    roles: [{ type: String, required: true }],

    image: { type: String, default: "no-image.png" },
    dob: { type: Date },
    joiningDate: { type: Date, default: Date.now },
    gender: { type: String },

    // Staff & Employee Specific Details
    nationalInsuranceNumber: { type: String, trim: true },
    nic: { type: String, trim: true },
    salary: { type: Number, default: null },
    cosNumber: { type: String, trim: true },
    cos: { type: String, trim: true },
    bankDetails: {
      accountName: { type: String, trim: true, default: null },
      accountNumber: { type: String, trim: true, default: null },
      sortCode: { type: String, trim: true, default: null },
      bankName: { type: String, trim: true, default: null },
    },

    emailVerified: { type: Boolean, default: false },
    phone: { type: String, default: "" },
    postcode: { type: String, default: "" },
    addressLine1: { type: String, default: "" },
    addressLine2: { type: String, default: "" },
    addressLine3: { type: String, default: "" },
    postTown: { type: String, default: "" },
    city: { type: String },
    country: { type: mongoose.Schema.Types.ObjectId, ref: "Countries" },
    ethnicity: { type: String },

    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    lastLogin: { type: Date },
    lastSeen: { type: Date },

    deleted: { type: Boolean, default: false },
    status: { type: Number, default: 1 }, // 0 = inactive, 1 = active

    // THE KEY FIELDS
    selfManaging: { type: Boolean, default: true },

    // AgentShield — organization this user belongs to
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', default: null },

    // Invitation Flow
    inviteToken: { type: String, index: true },
    inviteExpires: { type: Date },

    // Password Reset Flow
    resetPasswordToken: { type: String, index: true },
    resetPasswordExpires: { type: Date },

    // LANDLORD DOMAIN DATA (Populated only for role: 'landlord')
    landlordData: {
      isCompany: { type: Boolean, default: false },
      companyName: { type: String, default: null },
      companyNumber: { type: String, default: null },
      isOverseas: { type: Boolean, default: false },
      sourceOfFunds: { type: String, default: null },
      amlResult: { type: String, enum: ['pass', 'refer', 'fail', null], default: null },
      amlCheckedAt: { type: Date, default: null },
      amlCheckedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      amlNotes: { type: String, default: null },
      pepChecked: { type: Boolean, default: false },
      pepResult: { type: String, enum: ['clear', 'flagged', null], default: null },

      // ── Bank details (for BACS disbursements) ──────────────
      bankDetails: {
        accountName: { type: String, trim: true, default: null },
        accountNumber: { type: String, trim: true, default: null },
        // stored as string to preserve leading zeros
        sortCode: { type: String, trim: true, default: null },
        // stored as string e.g. '20-00-00'
        bankName: { type: String, trim: true, default: null },
        // e.g. 'Barclays'
      },
    },

    // TENANT DOMAIN DATA (Populated only for role: 'tenant')
    tenantData: {
      // ── Right to Rent ──────────────────────────────────────
      rightToRentChecked: { type: Boolean, default: false },
      rightToRentCheckDate: { type: Date, default: null },
      rightToRentCheckedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
      rightToRentExpiry: { type: Date, default: null },
      rightToRentShareCode: { type: String, default: null },
      rightToRentNotes: { type: String, default: null },

      // ── Employment and Referencing ─────────────────────────
      employmentStatus: {
        type: String,
        enum: ['employed', 'self_employed', 'retired', 'student', 'unemployed', 'other', null],
        default: null,
      },
      employerName: { type: String, trim: true, default: null },
      employerPhone: { type: String, trim: true, default: null },
      annualIncome: { type: Number, default: null },
      referencingPassed: { type: Boolean, default: null }, // null = not referenced, true = passed, false = failed
      referencingProvider: { type: String, trim: true, default: null },
      referencingDate: { type: Date, default: null },
      referencingNotes: { type: String, default: null },

      // ── Guarantor ──────────────────────────────────────────
      hasGuarantor: { type: Boolean, default: false },
      guarantorName: { type: String, trim: true, default: null },
      guarantorEmail: { type: String, trim: true, lowercase: true, default: null },
      guarantorPhone: { type: String, trim: true, default: null },
      guarantorAddress: {
        line1: { type: String, trim: true, default: null },
        line2: { type: String, trim: true, default: null },
        city: { type: String, trim: true, default: null },
        county: { type: String, trim: true, default: null },
        postcode: { type: String, trim: true, uppercase: true, default: null },
        country: { type: String, trim: true, default: 'England' },
      },
      guarantorRelationship: { type: String, trim: true, default: null },

      // ── Emergency Contact ──────────────────────────────────
      emergencyContactName: { type: String, trim: true, default: null },
      emergencyContactPhone: { type: String, trim: true, default: null },
      emergencyContactRelationship: { type: String, trim: true, default: null },

      // ── Additional Details ─────────────────────────────────
      hasPets: { type: Boolean, default: false },
      petDetails: { type: String, trim: true, default: null },
      isSmoker: { type: Boolean, default: false },
      numberOfOccupants: { type: Number, default: 1 },
    },
  },
  { timestamps: true }
);

// Add indexes for landlordData
userSchema.index({ organizationId: 1, 'landlordData.amlResult': 1 });

// Add indexes for tenantData
userSchema.index({ organizationId: 1, 'tenantData.rightToRentExpiry': 1 });
userSchema.index({ organizationId: 1, 'tenantData.referencingPassed': 1 });


// Hash password before save (fixes the early-return bug)
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await hash(this.password, 10);
  return next();
});

// Also hash when updated via findOneAndUpdate
userSchema.pre("findOneAndUpdate", async function (next) {
  const update = this.getUpdate() || {};
  const set = update.$set || update;
  if (set.password) {
    set.password = await hash(set.password, 10);
    if (update.$set) update.$set = set;
    else this.setUpdate(set);
  }
  next();
});

// Optional: strip password from JSON if selected explicitly somewhere
userSchema.set("toJSON", {
  transform(_doc, ret) {
    delete ret.password;
    return ret;
  },
});

export const User = mongoose.models.User || mongoose.model("User", userSchema);

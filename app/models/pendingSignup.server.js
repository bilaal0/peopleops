// models/pendingSignup.server.js
import { mongoose } from "../config/db.server.js";
import { hash } from "bcryptjs";

const { Schema } = mongoose;

const pendingSignupSchema = new Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    // Store hashed OTP for security
    otp: {
      type: String,
      required: true,
      select: false, // Don't expose in queries by default
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    verified: {
      type: Boolean,
      default: false,
    },
    attempts: {
      type: Number,
      default: 0,
    },
    requestCount: {
      type: Number,
      default: 1,
    },
    lastRequestAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

// TTL index to automatically delete expired records after 1 hour
pendingSignupSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 3600 });


// Hash OTP before saving
pendingSignupSchema.pre("save", async function (next) {
  if (!this.isModified("otp")) return next();
  this.otp = await hash(this.otp, 10);
  return next();
});

// Also hash when updated via findOneAndUpdate
pendingSignupSchema.pre("findOneAndUpdate", async function (next) {
  const update = this.getUpdate() || {};
  const set = update.$set || update;
  if (set.otp) {
    set.otp = await hash(set.otp, 10);
    if (update.$set) update.$set = set;
    else this.setUpdate(set);
  }
  next();
});

export const PendingSignup =
  mongoose.models.PendingSignup ||
  mongoose.model("PendingSignup", pendingSignupSchema);

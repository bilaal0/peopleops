import { mongoose } from "../config/db.server.js";

const { Schema } = mongoose;

const workspaceSchema = new Schema(
  {
    ownerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    name: {
      type: String,
      default: "Personal",
      required: true,
    },
    plan: {
      type: String,
      default: "free", // Assuming 'free' or 'pro' etc.
    },
    dataMode: {
      type: String,
      enum: ["demo", "live"],
      default: "demo",
    },
    status: {
      type: String,
      enum: ["trialing", "active", "past_due", "canceled"],
      default: "trialing",
    },
    trial: {
      startedAt: { type: Date, default: Date.now },
      endsAt: { type: Date }, // Will be calculated on creation
      active: { type: Boolean, default: true },
    },
    subscriptionId: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    settings: {
      hWindow: { type: Number, default: 180 },
      ivWindow: { type: Number, default: 252 },
      bandLow: { type: Number, default: 0.48 },
      bandHigh: { type: Number, default: 0.52 },
      ivCheap: { type: Number, default: 30 },
      ivExpensive: { type: Number, default: 70 },
    },
  },
  { timestamps: true }
);

export const Workspace =
  mongoose.models.Workspace || mongoose.model("Workspace", workspaceSchema);

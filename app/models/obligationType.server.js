// models/obligationType.server.js
// Seeded once via scripts/seedObligationTypes.js
// These are the 25 compliance obligations from the AgentShield plan
import { mongoose } from "../config/db.server.js";

const { Schema } = mongoose;

const obligationTypeSchema = new Schema(
  {
    key: { type: String, required: true, unique: true }, // e.g. 'gas_safety_cert'
    name: { type: String, required: true },
    legislation: { type: String }, // e.g. 'Gas Safety Regs 1998'
    fineDescription: { type: String }, // e.g. 'Criminal prosecution'
    fineMaxGbp: { type: Number }, // Maximum civil penalty in £

    // Which stage of tenancy this applies to
    stage: {
      type: String,
      enum: ["pre_tenancy", "during", "possession"],
      required: true,
    },

    // Recurrence — null means one-time, number = days between recurrences
    frequencyDays: { type: Number, default: null },

    // HMO-only or all properties
    appliesTo: {
      type: String,
      enum: ["all", "hmo"],
      default: "all",
    },

    // Display order in UI
    sortOrder: { type: Number, default: 0 },

    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const ObligationType =
  mongoose.models.ObligationType ||
  mongoose.model("ObligationType", obligationTypeSchema);

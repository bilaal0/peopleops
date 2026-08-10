// models/rota.server.js
import { mongoose } from "../config/db.server.js";

const { Schema } = mongoose;

const rotaSchema = new Schema(
  {
    title: { type: String, default: "" },
    description: { type: String, default: "" },

    // Date/time
    date: { type: Date, required: true },
    startTime: { type: String, required: true }, // e.g. "09:00"
    endTime: { type: String, required: true },   // e.g. "17:00"

    // FullCalendar compatible ISO start/end
    start: { type: Date },
    end: { type: Date },

    // Repeat settings
    repeat: {
      type: String,
      enum: ["none", "daily", "weekly", "fortnightly", "monthly"],
      default: "none",
    },
    repeatCount: { type: Number, default: 0 },

    // Staff member assigned
    employee: { type: Schema.Types.ObjectId, ref: "User", required: true },
    employeeName: { type: String },

    // Client assigned to
    assignedTo: { type: Schema.Types.ObjectId, ref: "User" },
    assignedToName: { type: String },

    // Organization scope
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', default: null },
    addedBy: { type: Schema.Types.ObjectId, ref: "User" },

    // FullCalendar event colour
    color: { type: String, default: "#1e3a5f" },

    deleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Index for efficient queries
rotaSchema.index({ date: 1, organizationId: 1 });
rotaSchema.index({ employee: 1 });
rotaSchema.index({ assignedTo: 1 });

export const Rota = mongoose.models.Rota || mongoose.model("Rota", rotaSchema);

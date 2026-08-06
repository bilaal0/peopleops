// models/obligation.server.js
// Per-tenancy compliance obligation instances, seeded automatically when a tenancy is created
import { mongoose } from "../config/db.server.js";

const { Schema } = mongoose;

const obligationSchema = new Schema(
  {
    agencyId: {
      type: Schema.Types.ObjectId,
      ref: "Agency",
      required: true,
      index: true,
    },
    tenancyId: {
      type: Schema.Types.ObjectId,
      ref: "Tenancy",
      required: true,
      index: true,
    },
    obligationTypeId: {
      type: Schema.Types.ObjectId,
      ref: "ObligationType",
      required: true,
    },

    // Due date calculated from tenancy start date + obligationType.frequencyDays
    dueDate: { type: Date },

    // Status — calculated by obligation engine cron
    status: {
      type: String,
      enum: ["pending", "logged", "overdue"],
      default: "pending",
    },

    // Declaration — filled when agency user logs this obligation
    declaredBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    declaredAt: { type: Date, default: null },
    declarationText: { type: String, default: null }, // Stored verbatim for evidence vault

    // For recurring obligations — next due date after this one is logged
    nextDueDate: { type: Date, default: null },

    // Alert tracking — don't send duplicate alerts
    alertsSent: [
      {
        type: { type: String, enum: ["DUE_30", "DUE_14", "DUE_7", "OVERDUE"] },
        sentAt: { type: Date },
      },
    ],
  },
  { timestamps: true }
);

export const Obligation =
  mongoose.models.Obligation || mongoose.model("Obligation", obligationSchema);

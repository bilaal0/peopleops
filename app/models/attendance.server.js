// models/attendance.server.js
import { mongoose } from "../config/db.server.js";

const { Schema } = mongoose;

const attendanceSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    userName: { type: String, default: "" },
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization", default: null },
    date: { type: Date, required: true }, // Start of local date / day
    clockInTime: { type: Date },
    clockOutTime: { type: Date },
    totalHours: { type: Number, default: 0 }, // Total duration in hours (e.g. 7.5)
    status: {
      type: String,
      enum: ["clocked_in", "clocked_out"],
      default: "clocked_in",
    },
    notes: { type: String, default: "" },
  },
  { timestamps: true }
);

attendanceSchema.index({ user: 1, date: 1 });
attendanceSchema.index({ organizationId: 1, date: 1 });

export const Attendance = mongoose.models.Attendance || mongoose.model("Attendance", attendanceSchema);

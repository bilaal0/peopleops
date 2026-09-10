import { data } from "react-router";
import { getUserFromRequest } from "../../utils/auth.server.js";
import { connect } from "../../config/db.server.js";
import { Attendance } from "../../models/attendance.server.js";

function getTodayRange() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

export async function loader({ request }) {
  const user = await getUserFromRequest(request);
  if (!user) {
    return data({ error: "Unauthorized" }, { status: 401 });
  }

  await connect();
  const { start, end } = getTodayRange();

  const records = await Attendance.find({
    user: user.userId,
    date: { $gte: start, $lte: end },
  }).sort({ createdAt: -1 }).lean();

  const currentRecord = records[0] || null;

  return data({
    records,
    currentRecord,
    isClockedIn: currentRecord?.status === "clocked_in",
  });
}

export async function action({ request }) {
  const user = await getUserFromRequest(request);
  if (!user) {
    return data({ error: "Unauthorized" }, { status: 401 });
  }

  await connect();
  const formData = await request.formData();
  const intent = formData.get("_intent");
  const notes = (formData.get("notes") || "").toString().trim();
  const { start, end } = getTodayRange();

  if (intent === "clock_in") {
    // Check if already clocked in
    const active = await Attendance.findOne({
      user: user.userId,
      status: "clocked_in",
      date: { $gte: start, $lte: end },
    });

    if (active) {
      return data({ error: "You are already clocked in for today." }, { status: 400 });
    }

    const todayLocalMidnight = new Date();
    todayLocalMidnight.setHours(0, 0, 0, 0);

    const userName = `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.name || "Staff";

    const record = await Attendance.create({
      user: user.userId,
      userName,
      organizationId: user.organizationId || null,
      date: todayLocalMidnight,
      clockInTime: new Date(),
      status: "clocked_in",
      notes,
    });

    return data({ success: true, message: "Clocked in successfully.", record });
  }

  if (intent === "clock_out") {
    const active = await Attendance.findOne({
      user: user.userId,
      status: "clocked_in",
      date: { $gte: start, $lte: end },
    }).sort({ createdAt: -1 });

    if (!active) {
      return data({ error: "No active clock-in session found to clock out from." }, { status: 400 });
    }

    const clockOutTime = new Date();
    const durationMs = clockOutTime.getTime() - new Date(active.clockInTime).getTime();
    const totalHours = Math.max(0, parseFloat((durationMs / (1000 * 60 * 60)).toFixed(2)));

    active.clockOutTime = clockOutTime;
    active.totalHours = totalHours;
    active.status = "clocked_out";
    if (notes) {
      active.notes = active.notes ? `${active.notes}\n${notes}` : notes;
    }
    await active.save();

    return data({ success: true, message: "Clocked out successfully.", record: active });
  }

  return data({ error: "Invalid intent" }, { status: 400 });
}

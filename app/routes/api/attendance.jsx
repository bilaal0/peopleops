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

  if (intent === "mark_attendance" || intent === "clock_in") {
    // Check if already marked for today
    const existing = await Attendance.findOne({
      user: user.userId,
      date: { $gte: start, $lte: end },
    });

    if (existing) {
      return data({ error: "Attendance has already been marked for today." }, { status: 400 });
    }

    const todayLocalMidnight = new Date();
    todayLocalMidnight.setHours(0, 0, 0, 0);

    const userName = `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.name || "Staff";
    const now = new Date();

    const record = await Attendance.create({
      user: user.userId,
      userName,
      organizationId: user.organizationId || null,
      date: todayLocalMidnight,
      clockInTime: now,
      markedAt: now,
      status: "marked",
      notes,
    });

    return data({
      success: true,
      message: "Attendance marked successfully.",
      record: {
        _id: record._id.toString(),
        status: record.status,
        markedAt: record.markedAt ? record.markedAt.toISOString() : now.toISOString(),
        clockInTime: record.clockInTime ? record.clockInTime.toISOString() : now.toISOString(),
        notes: record.notes || "",
      },
    });
  }

  if (intent === "clock_out") {
    const active = await Attendance.findOne({
      user: user.userId,
      date: { $gte: start, $lte: end },
    }).sort({ createdAt: -1 });

    if (!active) {
      return data({ error: "No attendance session found for today." }, { status: 400 });
    }

    const clockOutTime = new Date();
    const startTime = active.clockInTime || active.markedAt || active.createdAt;
    const durationMs = clockOutTime.getTime() - new Date(startTime).getTime();
    const totalHours = Math.max(0, parseFloat((durationMs / (1000 * 60 * 60)).toFixed(2)));

    active.clockOutTime = clockOutTime;
    active.totalHours = totalHours;
    active.status = "marked";
    if (notes) {
      active.notes = active.notes ? `${active.notes}\n${notes}` : notes;
    }
    await active.save();

    return data({ success: true, message: "Attendance updated.", record: active });
  }

  return data({ error: "Invalid intent" }, { status: 400 });
}

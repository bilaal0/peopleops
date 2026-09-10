import { redirect, data } from "react-router";
import { getUserFromRequest } from "../../utils/auth.server.js";
import { connect } from "../../config/db.server.js";
import { Rota } from "../../models/rota.server.js";
import { Attendance } from "../../models/attendance.server.js";
import { User } from "../../models/user.server.js";
import AttendancePage from "../../components/attendance/AttendancePage.jsx";

export async function loader({ request }) {
  const user = await getUserFromRequest(request);
  if (!user) return redirect("/login");

  await connect();

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  // Today's attendance record
  let todayAttendance = null;
  try {
    const attendanceRecord = await Attendance.findOne({
      user: user.userId,
      date: { $gte: todayStart, $lte: todayEnd },
    })
      .sort({ createdAt: -1 })
      .lean();

    if (attendanceRecord) {
      todayAttendance = {
        _id: attendanceRecord._id.toString(),
        status: attendanceRecord.status,
        clockInTime: attendanceRecord.clockInTime?.toISOString() || null,
        clockOutTime: attendanceRecord.clockOutTime?.toISOString() || null,
        totalHours: attendanceRecord.totalHours || 0,
        notes: attendanceRecord.notes || "",
      };
    }
  } catch (err) {
    console.error("[attendance loader] attendance query failed:", err.message);
  }

  // Today's rota tasks assigned to this staff member
  let tasks = [];
  try {
    const rotaTasks = await Rota.find({
      employee: user.userId,
      deleted: false,
      date: { $gte: todayStart, $lte: todayEnd },
    })
      .populate("assignedTo", "firstName lastName")
      .sort({ startTime: 1 })
      .lean();

    tasks = rotaTasks.map((t) => ({
      _id: t._id.toString(),
      title: t.title || "Assigned Shift",
      description: t.description || "",
      startTime: t.startTime,
      endTime: t.endTime,
      assignedTo: t.assignedTo
        ? `${t.assignedTo.firstName} ${t.assignedTo.lastName}`
        : t.assignedToName || "",
      taskStatus: t.taskStatus || "pending",
      taskNotes: t.taskNotes || "",
      taskReasonIfNotDone: t.taskReasonIfNotDone || "",
      taskUpdatedAt: t.taskUpdatedAt ? t.taskUpdatedAt.toISOString() : null,
    }));
  } catch (err) {
    console.error("[attendance loader] rota query failed:", err.message);
  }

  return data({ user, todayAttendance, tasks });
}

export async function action({ request }) {
  const user = await getUserFromRequest(request);
  if (!user) return redirect("/login");

  try {
    await connect();
  } catch (err) {
    console.error("[attendance action] DB connect failed:", err.message);
    return data({ error: "Database connection failed. Please try again." }, { status: 500 });
  }

  let formData;
  try {
    formData = await request.formData();
  } catch (err) {
    return data({ error: "Invalid form submission." }, { status: 400 });
  }

  const intent = formData.get("_intent")?.toString();
  console.log("[attendance action] intent:", intent, "userId:", user.userId);

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  // ── Clock In ───────────────────────────────────────────────────────────────
  if (intent === "clock_in") {
    try {
      const alreadyIn = await Attendance.findOne({
        user: user.userId,
        status: "clocked_in",
        date: { $gte: todayStart, $lte: todayEnd },
      });

      if (alreadyIn) {
        return data({ error: "You are already clocked in for today." }, { status: 400 });
      }

      // Get full name from DB for the record
      let userName = "";
      try {
        const dbUser = await User.findById(user.userId).select("firstName lastName").lean();
        userName = [dbUser?.firstName, dbUser?.lastName].filter(Boolean).join(" ") || "Staff";
      } catch { /* non-fatal */ }

      const todayMidnight = new Date();
      todayMidnight.setHours(0, 0, 0, 0);

      const record = await Attendance.create({
        user: user.userId,
        userName,
        organizationId: user.organizationId || null,
        date: todayMidnight,
        clockInTime: new Date(),
        status: "clocked_in",
      });

      console.log("[clock_in] Created attendance record:", record._id.toString());
      return data({ success: true, action: "clock_in" });
    } catch (err) {
      console.error("[clock_in] Error:", err.message, err);
      return data({ error: `Clock in failed: ${err.message}` }, { status: 500 });
    }
  }

  // ── Clock Out ──────────────────────────────────────────────────────────────
  if (intent === "clock_out") {
    try {
      const active = await Attendance.findOne({
        user: user.userId,
        status: "clocked_in",
        date: { $gte: todayStart, $lte: todayEnd },
      }).sort({ createdAt: -1 });

      if (!active) {
        return data({ error: "No active clock-in found for today." }, { status: 400 });
      }

      const clockOutTime = new Date();
      const durationMs = clockOutTime.getTime() - new Date(active.clockInTime).getTime();
      active.clockOutTime = clockOutTime;
      active.totalHours = parseFloat((durationMs / (1000 * 60 * 60)).toFixed(2));
      active.status = "clocked_out";
      await active.save();

      console.log("[clock_out] Updated record:", active._id.toString(), "hours:", active.totalHours);
      return data({ success: true, action: "clock_out" });
    } catch (err) {
      console.error("[clock_out] Error:", err.message, err);
      return data({ error: `Clock out failed: ${err.message}` }, { status: 500 });
    }
  }

  // ── Update Rota Task ───────────────────────────────────────────────────────
  if (intent === "update_task") {
    const rotaId = formData.get("rotaId")?.toString();
    const taskStatus = formData.get("taskStatus")?.toString();
    const taskNotes = (formData.get("taskNotes") || "").toString().trim();
    const taskReasonIfNotDone = (formData.get("taskReasonIfNotDone") || "").toString().trim();

    console.log("[update_task] rotaId:", rotaId, "taskStatus:", taskStatus, "userId:", user.userId);

    if (!rotaId) {
      return data({ error: "Task ID is required." }, { status: 400 });
    }
    if (!taskStatus || !["completed", "not_completed"].includes(taskStatus)) {
      return data({ error: `Invalid task status: "${taskStatus}". Expected completed or not_completed.` }, { status: 400 });
    }
    if (taskStatus === "not_completed" && !taskReasonIfNotDone) {
      return data({ error: "Please provide a reason why the task was not completed." }, { status: 400 });
    }

    try {
      const rota = await Rota.findOne({ _id: rotaId, deleted: false });
      console.log("[update_task] rota found:", !!rota, "employee:", rota?.employee?.toString(), "userId:", user.userId);

      if (!rota) {
        return data({ error: "Task not found." }, { status: 404 });
      }

      // Authorization: assigned employee or admin
      const isAdmin = user.roles?.some((r) =>
        ["SUPER_ADMIN", "ADMIN", "MASTER_ADMIN", "INITIAL_ADMIN", "REGISTERED_MANAGER"].includes(r)
      );
      const isAssigned = rota.employee?.toString() === user.userId?.toString();

      if (!isAdmin && !isAssigned) {
        console.warn("[update_task] Unauthorized. rota.employee:", rota.employee?.toString(), "vs user.userId:", user.userId);
        return data({ error: "You are not authorized to update this task." }, { status: 403 });
      }

      rota.taskStatus = taskStatus;
      rota.taskNotes = taskNotes;
      rota.taskReasonIfNotDone = taskStatus === "not_completed" ? taskReasonIfNotDone : "";
      rota.taskUpdatedAt = new Date();
      rota.taskUpdatedBy = user.userId;
      await rota.save();

      console.log("[update_task] Saved. taskStatus:", rota.taskStatus);
      return data({ success: true, action: "update_task", rotaId });
    } catch (err) {
      console.error("[update_task] Error:", err.message, err);
      return data({ error: `Task update failed: ${err.message}` }, { status: 500 });
    }
  }

  console.warn("[attendance action] Unknown intent:", intent);
  return data({ error: `Unknown action: "${intent}"` }, { status: 400 });
}

export default function AttendanceRoute() {
  return <AttendancePage />;
}

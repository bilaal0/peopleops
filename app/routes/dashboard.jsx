import { redirect, Link } from "react-router";
import { useLoaderData } from "react-router-dom";
import { getUserFromRequest } from "../utils/auth.server.js";
import { connect } from "../config/db.server.js";
import { Organization } from "../models/organization.server.js";
import { User } from "../models/user.server.js";
import { Attendance } from "../models/attendance.server.js";
import { Rota } from "../models/rota.server.js";
import { getOrganizationDashboardData } from "../utils/dashboard.server.js";
import SuperAdminDashboard from "../components/dashboard/SuperAdminDashboard.jsx";
import OrganizationDashboard from "../components/dashboard/OrganizationDashboard.jsx";
import StaffDashboard from "../components/dashboard/StaffDashboard.jsx";

export function headers() {
  return {
    "Cache-Control": "s-maxage=60, stale-while-revalidate=300",
  };
}

export async function loader({ request }) {
  const user = await getUserFromRequest(request);
  if (!user) return redirect("/login");

  const isSuperAdmin = user.roles?.includes("SUPER_ADMIN");
  const canManage = user.roles?.some((r) =>
    ["SUPER_ADMIN", "ADMIN", "MASTER_ADMIN", "INITIAL_ADMIN", "REGISTERED_MANAGER"].includes(r)
  );
  const isEmployeeOnly = !canManage;

  await connect();

  // ── SUPER_ADMIN DASHBOARD (Platform Level) ────────────────────────────────
  if (isSuperAdmin && !user.organizationId) {
    const [totalOrganizations, totalUsers] = await Promise.all([
      Organization.countDocuments({ deleted: false }),
      User.countDocuments({ deleted: false })
    ]);

    return { user, organization: null, isSuperAdmin: true, isEmployeeOnly, stats: { totalOrganizations, totalUsers } };
  }

  // ── TENANT/STAFF WITHOUT ORGANIZATION STATE ──────────────────────────────────────
  if (!user.organizationId) {
    return { user, stats: null, organization: null, isSuperAdmin: false, isEmployeeOnly };
  }

  // ── ORGANIZATION DASHBOARD ───────────────────────────────────────────────────────

  const [organization, dashboardData] = await Promise.all([
    Organization.findById(user.organizationId).lean(),
    getOrganizationDashboardData(user.organizationId)
  ]);

  // Fetch today's attendance for current user
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const latestAttendance = await Attendance.findOne({
    user: user.userId,
    date: { $gte: todayStart, $lte: todayEnd },
  }).sort({ createdAt: -1 }).lean();

  const todayAttendance = latestAttendance ? {
    _id: latestAttendance._id.toString(),
    status: latestAttendance.status,
    markedAt: latestAttendance.markedAt ? latestAttendance.markedAt.toISOString() : (latestAttendance.clockInTime ? latestAttendance.clockInTime.toISOString() : null),
    clockInTime: latestAttendance.clockInTime ? latestAttendance.clockInTime.toISOString() : null,
    clockOutTime: latestAttendance.clockOutTime ? latestAttendance.clockOutTime.toISOString() : null,
    totalHours: latestAttendance.totalHours || 0,
    notes: latestAttendance.notes || "",
  } : null;

  let attendanceHistory = [];
  let previousTasks = [];

  // If it's a staff dashboard, filter todayRota and load past records
  if (isEmployeeOnly && user.userId) {
    dashboardData.todayRota = (dashboardData.todayRota || []).filter(
      r => r.employeeId === user.userId.toString()
    );

    const [pastAttendance, pastRota] = await Promise.all([
      Attendance.find({ user: user.userId })
        .sort({ date: -1, createdAt: -1 })
        .limit(20)
        .lean(),
      Rota.find({
        employee: user.userId,
        deleted: false,
        date: { $lt: todayStart },
      })
        .populate("assignedTo", "firstName lastName companyName landlordData")
        .sort({ date: -1, startTime: -1 })
        .limit(20)
        .lean(),
    ]);

    attendanceHistory = pastAttendance.map((rec) => ({
      _id: rec._id.toString(),
      date: rec.date ? rec.date.toISOString() : rec.createdAt?.toISOString() || null,
      status: rec.status || "marked",
      markedAt: rec.markedAt?.toISOString() || rec.clockInTime?.toISOString() || rec.createdAt?.toISOString() || null,
      notes: rec.notes || "",
    }));

    previousTasks = pastRota.map((t) => ({
      _id: t._id.toString(),
      title: t.title || "Assigned Shift",
      description: t.description || "",
      date: t.date ? t.date.toISOString() : null,
      startTime: t.startTime,
      endTime: t.endTime,
      assignedTo: t.assignedTo
        ? (t.assignedTo.companyName || t.assignedTo.landlordData?.companyName || `${t.assignedTo.firstName} ${t.assignedTo.lastName}`.trim())
        : (t.assignedToName || ""),
      taskStatus: t.taskStatus || "pending",
      taskNotes: t.taskNotes || "",
      taskReasonIfNotDone: t.taskReasonIfNotDone || "",
    }));
  }

  return {
    user,
    organization,
    isSuperAdmin,
    isEmployeeOnly,
    dashboardData,
    todayAttendance,
    attendanceHistory,
    previousTasks,
  };
}

export default function Dashboard() {
  const {
    user,
    organization,
    stats,
    isSuperAdmin,
    isEmployeeOnly,
    dashboardData,
    todayAttendance,
    attendanceHistory,
    previousTasks,
  } = useLoaderData();

  if (isSuperAdmin && !organization) {
    return <SuperAdminDashboard stats={stats} />;
  }

  if (isEmployeeOnly) {
    return (
      <StaffDashboard
        user={user}
        organization={organization}
        dashboardData={dashboardData}
        todayAttendance={todayAttendance}
        attendanceHistory={attendanceHistory}
        previousTasks={previousTasks}
      />
    );
  }

  return <OrganizationDashboard organization={organization} dashboardData={dashboardData} user={user} />;
}

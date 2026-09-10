import { redirect, Link } from "react-router";
import { useLoaderData } from "react-router-dom";
import { getUserFromRequest } from "../utils/auth.server.js";
import { connect } from "../config/db.server.js";
import { Organization } from "../models/organization.server.js";
import { User } from "../models/user.server.js";
import { Attendance } from "../models/attendance.server.js";
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
  const isEmployeeOnly = user.roles?.includes("EMPLOYEE") && !user.roles?.includes("ADMIN") && !user.roles?.includes("SUPER_ADMIN");

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
    clockInTime: latestAttendance.clockInTime ? latestAttendance.clockInTime.toISOString() : null,
    clockOutTime: latestAttendance.clockOutTime ? latestAttendance.clockOutTime.toISOString() : null,
    totalHours: latestAttendance.totalHours || 0,
    notes: latestAttendance.notes || "",
  } : null;

  // If it's a staff dashboard, filter todayRota to only their shifts
  if (isEmployeeOnly && user.userId) {
    dashboardData.todayRota = (dashboardData.todayRota || []).filter(
      r => r.employeeId === user.userId.toString()
    );
  }

  return {
    user,
    organization,
    isSuperAdmin,
    isEmployeeOnly,
    dashboardData,
    todayAttendance,
  };
}

export default function Dashboard() {
  const { user, organization, stats, isSuperAdmin, isEmployeeOnly, dashboardData, todayAttendance } = useLoaderData();

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
      />
    );
  }

  return <OrganizationDashboard organization={organization} dashboardData={dashboardData} user={user} />;
}

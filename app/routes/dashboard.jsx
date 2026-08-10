// routes/dashboard.jsx — AgentShield main dashboard
import { redirect, Link } from "react-router";
import { useLoaderData } from "react-router-dom";
import { getUserFromRequest } from "../utils/auth.server.js";
import { connect } from "../config/db.server.js";
import { Organization } from "../models/organization.server.js";
import { User } from "../models/user.server.js";
import { getOrganizationDashboardData } from "../utils/dashboard.server.js";
import SuperAdminDashboard from "../components/dashboard/SuperAdminDashboard.jsx";
import OrganizationDashboard from "../components/dashboard/OrganizationDashboard.jsx";

export function headers() {
  return {
    "Cache-Control": "s-maxage=60, stale-while-revalidate=300",
  };
}

export async function loader({ request }) {
  const user = await getUserFromRequest(request);
  if (!user) return redirect("/login");

  const isSuperAdmin = user.roles?.includes("SUPER_ADMIN");

  await connect();

  // ── SUPER_ADMIN DASHBOARD (Platform Level) ────────────────────────────────
  if (isSuperAdmin && !user.organizationId) {
    const [totalOrganizations, totalUsers] = await Promise.all([
      Organization.countDocuments({ deleted: false }),
      User.countDocuments({ deleted: false })
    ]);

    return { user, organization: null, isSuperAdmin: true, stats: { totalOrganizations, totalUsers } };
  }

  // ── TENANT/STAFF WITHOUT ORGANIZATION STATE ──────────────────────────────────────
  if (!user.organizationId) {
    return { user, stats: null, organization: null, isSuperAdmin: false };
  }

  // ── ORGANIZATION DASHBOARD ───────────────────────────────────────────────────────
  
  const [organization, dashboardData] = await Promise.all([
    Organization.findById(user.organizationId).lean(),
    getOrganizationDashboardData(user.organizationId)
  ]);

  return {
    user,
    organization,
    isSuperAdmin,
    dashboardData,
  };
}


export default function Dashboard() {
  const { user, organization, stats, isSuperAdmin, dashboardData } = useLoaderData();

  if (isSuperAdmin && !organization) {
    return <SuperAdminDashboard stats={stats} />;
  }

  return <OrganizationDashboard organization={organization} dashboardData={dashboardData} user={user} />;
}

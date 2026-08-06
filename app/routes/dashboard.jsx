// routes/dashboard.jsx — AgentShield main dashboard
import { redirect, Link } from "react-router";
import { useLoaderData } from "react-router-dom";
import { getUserFromRequest } from "../utils/auth.server.js";
import { connect } from "../config/db.server.js";
import { Agency } from "../models/agency.server.js";
import { User } from "../models/user.server.js";
import { getAgencyDashboardData } from "../utils/dashboard.server.js";
import SuperAdminDashboard from "../components/dashboard/SuperAdminDashboard.jsx";
import AgencyDashboard from "../components/dashboard/AgencyDashboard.jsx";

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
  if (isSuperAdmin && !user.agencyId) {
    const [totalAgencies, totalUsers] = await Promise.all([
      Agency.countDocuments({ deleted: false }),
      User.countDocuments({ deleted: false })
    ]);

    return { user, agency: null, isSuperAdmin: true, stats: { totalAgencies, totalUsers } };
  }

  // ── TENANT/STAFF WITHOUT AGENCY STATE ──────────────────────────────────────
  if (!user.agencyId) {
    return { user, stats: null, agency: null, isSuperAdmin: false };
  }

  // ── AGENCY DASHBOARD ───────────────────────────────────────────────────────
  
  const [agency, dashboardData] = await Promise.all([
    Agency.findById(user.agencyId).lean(),
    getAgencyDashboardData(user.agencyId)
  ]);

  return {
    user,
    agency,
    isSuperAdmin,
    dashboardData,
  };
}


export default function Dashboard() {
  const { user, agency, stats, isSuperAdmin, dashboardData } = useLoaderData();

  if (isSuperAdmin && !agency) {
    return <SuperAdminDashboard stats={stats} />;
  }

  return <AgencyDashboard agency={agency} dashboardData={dashboardData} user={user} />;
}

// routes/compliance/dashboard.jsx
// AgentShield Compliance Dashboard — Pure Document & Tenancy Compliance Tracker
import { useLoaderData, Link } from "react-router-dom";
import { getUserFromRequest } from "../../utils/auth.server.js";
import { redirect } from "react-router";
import { getOrganizationDashboardData } from "../../utils/dashboard.server.js";
import { connect } from "../../config/db.server.js";
import { 
  AlertCircle, 
  CheckCircle2, 
  Home, 
  FileWarning, 
  Clock, 
  ShieldAlert,
  ArrowRight
} from "lucide-react";

export async function loader({ request }) {
  const user = await getUserFromRequest(request);
  if (!user) return redirect("/login");
  if (!user.organizationId && !user.roles?.includes("SUPER_ADMIN")) return redirect("/dashboard");

  await connect();
  const dashboardData = await getOrganizationDashboardData(user.organizationId);
  return { dashboardData };
}

export default function ComplianceDashboard() {
  const { dashboardData } = useLoaderData();

  // Filter out arrears/rent
  const complianceUrgent = (dashboardData?.allUrgentAlerts || []).filter(a => !a.type.startsWith("arrears_") && !a.type.startsWith("rent_"));
  const complianceUpcoming = (dashboardData?.allUpcomingAlerts || []).filter(a => !a.type.startsWith("arrears_") && !a.type.startsWith("rent_"));

  // Group by property address
  const propertiesWithIssues = {};

  const processAlert = (alert, category) => {
    const addr = alert.address || "General Portfolio";
    if (!propertiesWithIssues[addr]) {
      propertiesWithIssues[addr] = {
        address: addr,
        urgent: [],
        upcoming: [],
        defaultLink: alert.link
      };
    }
    propertiesWithIssues[addr][category].push(alert);
  };

  complianceUrgent.forEach(a => processAlert(a, "urgent"));
  complianceUpcoming.forEach(a => processAlert(a, "upcoming"));

  const groupedProperties = Object.values(propertiesWithIssues).sort((a, b) => {
    // Sort by most urgent first
    if (b.urgent.length !== a.urgent.length) return b.urgent.length - a.urgent.length;
    return b.upcoming.length - a.upcoming.length;
  });

  const totalProperties = dashboardData?.stats?.propertyCounts?.available + dashboardData?.stats?.propertyCounts?.let + dashboardData?.stats?.propertyCounts?.maintenance || 0;
  const cleanPropertiesCount = Math.max(0, totalProperties - groupedProperties.filter(p => p.address !== "General Portfolio").length);

  return (
    <div className="mx-auto max-w-7xl p-6 space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Portfolio Compliance</h1>
        <p className="mt-2 text-sm text-slate-500">Live tracker for missing documents, expiring certificates, and tenancy requirements.</p>
      </div>

      {/* Top Metric Strip */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-red-100 bg-red-50 p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-red-100 text-red-600 rounded-lg">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-red-600">Urgent Issues</p>
          </div>
          <p className="text-3xl font-semibold text-red-700">{complianceUrgent.length}</p>
          <p className="mt-1 text-xs text-red-600/80">Missing or expired documents</p>
        </div>
        
        <div className="rounded-2xl border border-amber-100 bg-amber-50 p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-amber-100 text-amber-600 rounded-lg">
              <Clock className="w-5 h-5" />
            </div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-600">Expiring Soon</p>
          </div>
          <p className="text-3xl font-semibold text-amber-700">{complianceUpcoming.length}</p>
          <p className="mt-1 text-xs text-amber-600/80">Within the next 7 days</p>
        </div>

        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-emerald-100 text-emerald-600 rounded-lg">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-600">Clean Properties</p>
          </div>
          <p className="text-3xl font-semibold text-emerald-700">{cleanPropertiesCount}</p>
          <p className="mt-1 text-xs text-emerald-600/80">Up to date</p>
        </div>
      </div>

      {/* Properties Grid */}
      <div>
        <h2 className="text-xl font-semibold text-slate-900 mb-4 flex items-center gap-2">
          <FileWarning className="w-5 h-5 text-slate-400" /> 
          Properties Requiring Attention
        </h2>
        
        {groupedProperties.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 py-16 px-6 text-center">
            <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-400 mb-4" />
            <h3 className="text-lg font-semibold text-slate-900">All properties are up to date</h3>
            <p className="mt-2 text-sm text-slate-500 max-w-sm mx-auto">
              There are zero missing documents or expiring certificates across your entire portfolio.
            </p>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {groupedProperties.map((group, idx) => (
              <div key={idx} className="flex flex-col rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden hover:shadow-md transition">
                <div className="border-b border-slate-100 bg-slate-50/50 p-5">
                  <div className="flex items-start gap-3">
                    <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                      <Home className="h-4 w-4" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-slate-900 leading-tight">{group.address}</h3>
                      <p className="mt-1 text-xs text-slate-500">
                        {group.urgent.length + group.upcoming.length} total issues
                      </p>
                    </div>
                  </div>
                </div>
                
                <div className="flex-1 p-5 space-y-3">
                  {group.urgent.map((alert, i) => (
                    <div key={`u-${i}`} className="flex items-start gap-2.5">
                      <span className="mt-0.5 flex h-2 w-2 shrink-0 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]" />
                      <div>
                        <p className="text-sm font-medium text-slate-900">{alert.title}</p>
                        <p className="text-xs text-slate-500 line-clamp-1">{alert.sub.replace(`${group.address} — `, '')}</p>
                      </div>
                    </div>
                  ))}
                  {group.upcoming.map((alert, i) => (
                    <div key={`up-${i}`} className="flex items-start gap-2.5">
                      <span className="mt-0.5 flex h-2 w-2 shrink-0 rounded-full bg-amber-500" />
                      <div>
                        <p className="text-sm font-medium text-slate-900">{alert.title}</p>
                        <p className="text-xs text-slate-500 line-clamp-1">{alert.sub.replace(`${group.address} — `, '')}</p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="p-4 bg-slate-50 border-t border-slate-100">
                  <Link 
                    to={group.defaultLink} 
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
                  >
                    Resolve Issues
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}


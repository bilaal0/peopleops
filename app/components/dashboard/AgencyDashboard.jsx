import { Link } from "react-router";
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  Activity,
  ShieldCheck,
  Wrench,
  PoundSterling,
  FileCheck,
  Home,
  FileText,
  AlertCircle,
  CheckCircle2
} from "lucide-react";

function currency(value) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function formatTime(value) {
  if (!value) return "";
  const date = new Date(value);
  const diff = Date.now() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  
  if (days === 0) {
    return date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  } else if (days === 1) {
    return "Yesterday";
  } else {
    return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  }
}

export default function AgencyDashboard({ agency, dashboardData, user }) {
  if (!agency) {
    return (
      <div className="mx-auto max-w-7xl p-6">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-red-700">Agency Account Link Required</p>
          <p className="mt-2 text-sm text-red-800">
            Your profile is not currently linked to an agency. Please contact support.
          </p>
        </div>
      </div>
    );
  }

  if (!dashboardData?.onboarding && !dashboardData?.stats) {
    return (
      <div className="mx-auto max-w-7xl p-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <p className="text-sm font-semibold text-slate-900">Loading dashboard data</p>
        </div>
      </div>
    );
  }



  const {
    stats,
    urgentAlerts = [],
    upcomingAlerts = [],
    activityFeed = [],
    emergencyJobs = [],
    overdueJobs = [],
  } = dashboardData;

  const totalProperties =
    (stats.propertyCounts?.available || 0) +
    (stats.propertyCounts?.let || 0) +
    (stats.propertyCounts?.maintenance || 0);

  const activeTenancies = stats.activeTenancyCount || 0;
  const propertiesMissingEvidence = stats.propertiesMissingEvidence || 0;
  const tenanciesMissingEvidence = stats.tenanciesMissingEvidence || 0;
  
  const propertiesReady = Math.max(0, totalProperties - propertiesMissingEvidence);
  const tenanciesReady = Math.max(0, activeTenancies - tenanciesMissingEvidence);

  const criticalActions = urgentAlerts.slice(0, 3);
  const upcomingActions = upcomingAlerts.slice(0, 7);

  return (
    <div className="mx-auto max-w-[1400px] space-y-8 px-4 py-8 sm:px-6 lg:px-8 bg-slate-50 min-h-screen">
      
      {/* 1. PORTFOLIO SNAPSHOT */}
      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3 text-slate-600 mb-2">
            <Home className="h-5 w-5 text-blue-600" />
            <span className="text-sm font-semibold uppercase tracking-wider">Properties</span>
          </div>
          <p className="text-3xl font-bold text-slate-900">{totalProperties}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3 text-slate-600 mb-2">
            <FileText className="h-5 w-5 text-slate-600" />
            <span className="text-sm font-semibold uppercase tracking-wider">Active Tenancies</span>
          </div>
          <p className="text-3xl font-bold text-slate-900">{activeTenancies}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3 text-slate-600 mb-2">
            <Wrench className="h-5 w-5 text-amber-600" />
            <span className="text-sm font-semibold uppercase tracking-wider">Open Maintenance</span>
          </div>
          <p className="text-3xl font-bold text-slate-900">{stats.openMaintenanceJobs || 0}</p>
        </div>
        <div className="rounded-2xl border border-red-100 bg-red-50 p-5 shadow-sm flex flex-col justify-center gap-2">
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium text-red-800">Critical Issues</span>
            <span className="text-xl font-bold text-red-700">{urgentAlerts.length}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium text-amber-800">Upcoming Deadlines</span>
            <span className="text-xl font-bold text-amber-700">{upcomingAlerts.length}</span>
          </div>
        </div>
      </div>

      {/* 2. TODAY'S ACTION CENTRE (FULL WIDTH) */}
      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-slate-100 bg-slate-50 px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-slate-900" />
            <h2 className="text-[15px] font-bold text-slate-900">Today's Action Centre</h2>
          </div>
          <Link to="/compliance" className="text-xs font-semibold text-slate-600 hover:text-slate-900">
            View All →
          </Link>
        </div>
        
        <div className="p-0">
          {criticalActions.length === 0 && upcomingActions.length === 0 ? (
            <div className="p-8 text-center">
              <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500 mb-3" />
              <p className="text-sm font-bold text-slate-900">All Clear</p>
              <p className="text-sm text-slate-500 mt-1">No pending actions required today.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {criticalActions.map((alert, idx) => (
                <div key={`crit-${idx}`} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-red-50/30 hover:bg-red-50/50 transition">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 w-2 h-2 rounded-full bg-red-500 shrink-0"></div>
                    <div>
                      <p className="text-sm font-bold text-slate-900">{alert.title}</p>
                      <p className="text-sm text-slate-600 mt-0.5">{alert.sub}</p>
                    </div>
                  </div>
                  <Link to={alert.link || "/dashboard"} className="shrink-0 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-lg transition text-center">
                    Resolve
                  </Link>
                </div>
              ))}
              
              {upcomingActions.map((alert, idx) => (
                <div key={`upc-${idx}`} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50 transition">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 w-2 h-2 rounded-full bg-amber-500 shrink-0"></div>
                    <div>
                      <p className="text-sm font-bold text-slate-900">{alert.title}</p>
                      <p className="text-sm text-slate-600 mt-0.5">{alert.sub}</p>
                    </div>
                  </div>
                  <Link to={alert.link || "/dashboard"} className="shrink-0 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition text-center">
                    Review
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <div className="grid gap-8 lg:grid-cols-12">
        {/* LEFT COLUMN */}
        <div className="lg:col-span-7 space-y-8">
          
          {/* 3. EVIDENCE BUNDLE READINESS */}
          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="border-b border-slate-100 bg-slate-50 px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-indigo-600" />
                <h3 className="text-[15px] font-bold text-slate-900 uppercase tracking-wide">Evidence Bundle Readiness</h3>
              </div>
              <Link to="/compliance" className="text-xs font-semibold text-slate-600 hover:text-slate-900">
                View Audit Trail →
              </Link>
            </div>
            <div className="p-6">
              <div className="space-y-4">
                <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                  <span className="text-sm font-semibold text-slate-700">Properties Ready</span>
                  <span className="text-xl font-bold text-slate-900">{propertiesReady}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm font-semibold text-slate-700">Tenancies Ready</span>
                  <span className="text-xl font-bold text-slate-900">{tenanciesReady}</span>
                </div>
              </div>
              
              <div className="mt-8 pt-6 border-t border-slate-100 flex">
                <Link to="/documents/generate-bundle" className="inline-flex flex-1 items-center justify-center gap-2 px-6 py-3 bg-indigo-600 text-white text-sm font-bold rounded-xl hover:bg-indigo-700 transition shadow-sm">
                  <FileCheck className="h-5 w-5" />
                  Generate Evidence Bundle
                </Link>
              </div>
            </div>
          </section>

          {/* 5. RECENT ACTIVITY */}
          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="border-b border-slate-100 bg-slate-50 px-5 py-4">
              <div className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-slate-700" />
                <h3 className="text-[15px] font-bold text-slate-900">Recent Activity</h3>
              </div>
            </div>
            <div className="p-0">
              {activityFeed.length === 0 ? (
                <div className="p-6 text-center text-sm text-slate-500">No recent activity.</div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {activityFeed.slice(0, 5).map((item) => (
                    <li key={item.id} className="p-4 flex items-start gap-4 hover:bg-slate-50 transition">
                      <div className="w-16 shrink-0 pt-0.5">
                        <span className="text-xs font-semibold text-slate-500">{formatTime(item.createdAt)}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-slate-900">{item.title}</p>
                        <p className="text-xs text-slate-400 mt-0.5 truncate">{item.subtitle}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

        </div>

        {/* RIGHT COLUMN */}
        <div className="lg:col-span-5 space-y-8">

          {/* 4. COMPLIANCE TIMELINE */}
          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="border-b border-slate-100 bg-slate-50 px-5 py-4">
              <div className="flex items-center gap-2">
                <CalendarClock className="h-5 w-5 text-slate-700" />
                <h3 className="text-[15px] font-bold text-slate-900">Compliance Timeline</h3>
              </div>
            </div>
            <div className="p-0">
              {upcomingAlerts.length === 0 ? (
                <div className="p-6 text-center text-sm text-slate-500">No events in the next 30 days.</div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {upcomingAlerts.map((alert, idx) => {
                    const match = alert.sub.match(/(\d+)\s+days/);
                    const days = match ? match[1] : null;
                    return (
                      <li key={`tl-${idx}`} className="p-4 flex items-start gap-4 hover:bg-slate-50 transition">
                        <div className="w-20 shrink-0 pt-0.5">
                          <span className="text-sm font-bold text-slate-900">{days ? `In ${days} days` : 'Soon'}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-900 truncate">{alert.title}</p>
                          <p className="text-xs text-slate-500 mt-0.5 truncate">{alert.address}</p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </section>

          {/* 6. MAINTENANCE SUMMARY */}
          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="border-b border-slate-100 bg-slate-50 px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Wrench className="h-5 w-5 text-slate-700" />
                <h3 className="text-[15px] font-bold text-slate-900">Maintenance</h3>
              </div>
              <Link to="/maintenance" className="text-xs font-semibold text-slate-600 hover:text-slate-900">
                View All →
              </Link>
            </div>
            <div className="p-5 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600">Emergency</span>
                <span className={`text-sm font-bold ${emergencyJobs.length > 0 ? "text-red-600" : "text-slate-900"}`}>{emergencyJobs.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600">Overdue</span>
                <span className={`text-sm font-bold ${overdueJobs.length > 0 ? "text-amber-600" : "text-slate-900"}`}>{overdueJobs.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600">Open Jobs</span>
                <span className="text-sm font-bold text-slate-900">{stats.openMaintenanceJobs || 0}</span>
              </div>
            </div>
          </section>

          {/* 7. FINANCE SNAPSHOT */}
          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="border-b border-slate-100 bg-slate-50 px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <PoundSterling className="h-5 w-5 text-slate-700" />
                <h3 className="text-[15px] font-bold text-slate-900">Finance</h3>
              </div>
              <Link to="/rent" className="text-xs font-semibold text-slate-600 hover:text-slate-900">
                Ledger →
              </Link>
            </div>
            <div className="p-5 grid grid-cols-2 gap-y-6 gap-x-4">
              <div>
                <p className="text-xs font-medium text-slate-500 mb-1">Expected</p>
                <p className="text-lg font-bold text-slate-900">{currency(stats.expectedRentThisMonth)}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500 mb-1">Collected</p>
                <p className="text-lg font-bold text-emerald-600">{currency(stats.collectedRentThisMonth)}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500 mb-1">Outstanding</p>
                <p className={`text-lg font-bold ${stats.outstandingRentThisMonth > 0 ? "text-red-600" : "text-slate-900"}`}>
                  {currency(stats.outstandingRentThisMonth)}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500 mb-1">Commission</p>
                <p className="text-lg font-bold text-slate-900">{currency(stats.expectedCommissionThisMonth)}</p>
              </div>
            </div>
          </section>

        </div>
      </div>
    </div>
  );
}

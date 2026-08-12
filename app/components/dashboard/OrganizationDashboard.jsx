import { Link } from "react-router";
import { Users, FileText, UserCheck, ArrowRight, CalendarClock, Clock } from "lucide-react";
import { fmtDate } from "../../utils/date.js";

export default function OrganizationDashboard({ organization, dashboardData, user }) {
  if (!organization) {
    return (
      <div className="mx-auto max-w-7xl p-6">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-red-700">Organization Account Link Required</p>
          <p className="mt-2 text-sm text-red-800">
            Your profile is not currently linked to an organization. Please contact support.
          </p>
        </div>
      </div>
    );
  }

  const { stats, todayRota } = dashboardData || { stats: {}, todayRota: [] };

  return (
    <div className="mx-auto max-w-[1400px] p-6 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Welcome back, {user.firstName || user.name}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Here is what's happening across {organization.name} today.
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
            <UserCheck className="h-6 w-6" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-500">Total Staff</p>
            <p className="text-2xl font-bold text-slate-900">{stats.staffCount || 0}</p>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
            <Users className="h-6 w-6" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-500">Total Clients</p>
            <p className="text-2xl font-bold text-slate-900">{stats.clientCount || 0}</p>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
            <FileText className="h-6 w-6" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-500">Total Documents</p>
            <p className="text-2xl font-bold text-slate-900">{stats.documentCount || 0}</p>
          </div>
        </div>
      </div>

      {/* Recent Activity / Rota */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900">Today's Rota</h2>
            <Link to="/rota" className="text-sm font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1">
              View Calendar <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            {todayRota?.length > 0 ? (
              <ul className="divide-y divide-slate-100">
                {todayRota.map((shift) => (
                  <li key={shift._id} className="flex items-center justify-between p-4 hover:bg-slate-50 transition">
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                        <CalendarClock className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-slate-900">
                          {shift.title} - {shift.employee}
                        </p>
                        <p className="truncate text-xs text-slate-500">
                          {shift.assignedTo ? `Client: ${shift.assignedTo}` : "General Shift"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 rounded-lg bg-slate-100 px-3 py-1.5 text-slate-700 text-xs font-bold">
                      <Clock className="h-3.5 w-3.5" />
                      {shift.startTime} - {shift.endTime}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="p-8 text-center text-sm text-slate-500">
                No shifts scheduled for today.
              </div>
            )}
          </div>
        </div>

        {/* Quick Links */}
        <div className="space-y-4">
          <h2 className="text-lg font-bold text-slate-900">Quick Actions</h2>
          <div className="flex flex-col gap-3">
            <Link to="/user-accounts/staff" className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:border-indigo-300 hover:shadow-md transition group">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 group-hover:bg-indigo-100 transition">
                  <UserCheck className="h-5 w-5" />
                </div>
                <span className="font-semibold text-slate-700 group-hover:text-slate-900 transition">Manage Staff</span>
              </div>
              <ArrowRight className="h-4 w-4 text-slate-400 group-hover:text-indigo-600 transition" />
            </Link>

            <Link to="/user-accounts/client" className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:border-indigo-300 hover:shadow-md transition group">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 group-hover:bg-emerald-100 transition">
                  <Users className="h-5 w-5" />
                </div>
                <span className="font-semibold text-slate-700 group-hover:text-slate-900 transition">Manage Clients</span>
              </div>
              <ArrowRight className="h-4 w-4 text-slate-400 group-hover:text-emerald-600 transition" />
            </Link>

            <Link to="/documents" className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:border-indigo-300 hover:shadow-md transition group">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50 text-amber-600 group-hover:bg-amber-100 transition">
                  <FileText className="h-5 w-5" />
                </div>
                <span className="font-semibold text-slate-700 group-hover:text-slate-900 transition">Document Vault</span>
              </div>
              <ArrowRight className="h-4 w-4 text-slate-400 group-hover:text-amber-600 transition" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

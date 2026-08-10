// routes/maintenance/index.jsx
// Maintenance Jobs dashboard / listing.
// Enforces organization isolation, features KPI tiles, filters, and dynamic overdue/Awaab's Law banners.

import { Link, useLoaderData, useNavigate, useSearchParams } from "react-router-dom";
import { redirect } from "react-router";
import { getUserFromRequest } from "../../utils/auth.server.js";
import { connect } from "../../config/db.server.js";
import { MaintenanceJob } from "../../models/MaintenanceJob.server.js";
import { Property } from "../../models/property.server.js";
import { getMaintenanceSummaryForOrganization } from "../../utils/maintenance.server.js";
import { fmtDate } from "../../utils/date.js";
import {
  Wrench,
  AlertTriangle,
  Clock,
  CheckCircle,
  Plus,
  Filter,
  Search,
  ArrowRight,
  ShieldCheck,
} from "lucide-react";

export async function loader({ request }) {
  const user = await getUserFromRequest(request);
  if (!user) return redirect("/login");
  if (!user.organizationId) return redirect("/dashboard");

  await connect();

  const url = new URL(request.url);
  const statusFilter = url.searchParams.get("status") || "";
  const priorityFilter = url.searchParams.get("priority") || "";
  const categoryFilter = url.searchParams.get("category") || "";
  const propertyFilter = url.searchParams.get("propertyId") || "";

  // 1. Fetch KPI Summary metrics
  const summary = await getMaintenanceSummaryForOrganization(user.organizationId);

  // 2. Build Query Filters (Respecting Soft Deletes and Organization Scope)
  const query = {
    organizationId: user.organizationId,
    deleted: { $ne: true },
  };

  if (statusFilter)   query.status = statusFilter;
  if (priorityFilter) query.priority = priorityFilter;
  if (categoryFilter) query.category = categoryFilter;
  if (propertyFilter) query.propertyId = propertyFilter;

  // 3. Fetch Jobs with Property populated
  const jobs = await MaintenanceJob.find(query)
    .populate("propertyId", "addressLine1 city postcode")
    .populate("contractorId", "name phone")
    .lean();

  // 4. Custom Sort: Emergency First, then TargetDate Ascending
  const priorityWeight = { emergency: 4, urgent: 3, routine: 2, planned: 1 };
  const sortedJobs = jobs.sort((a, b) => {
    const aWeight = priorityWeight[a.priority] || 0;
    const bWeight = priorityWeight[b.priority] || 0;
    if (aWeight !== bWeight) return bWeight - aWeight; // higher weight (emergency) first

    const aTime = a.targetDate ? new Date(a.targetDate).getTime() : Infinity;
    const bTime = b.targetDate ? new Date(b.targetDate).getTime() : Infinity;
    return aTime - bTime;
  });

  // 5. Fetch Properties for filter dropdown
  const properties = await Property.find({
    organizationId: user.organizationId,
    deleted: { $ne: true },
  })
    .select("addressLine1 postcode")
    .sort({ addressLine1: 1 })
    .lean();

  return {
    jobs: sortedJobs.map(j => ({
      ...j,
      _id: j._id.toString(),
      propertyId: j.propertyId
        ? { ...j.propertyId, _id: j.propertyId._id.toString() }
        : null,
      contractorId: j.contractorId
        ? { ...j.contractorId, _id: j.contractorId._id.toString() }
        : null,
    })),
    summary,
    properties: properties.map(p => ({ ...p, _id: p._id.toString() })),
    filters: {
      status: statusFilter,
      priority: priorityFilter,
      category: categoryFilter,
      propertyId: propertyFilter,
    },
  };
}

const CATEGORY_LABELS = {
  plumbing: "Plumbing", electrical: "Electrical", gas: "Gas", heating: "Heating",
  roofing: "Roofing", structural: "Structural", damp_mould: "Damp & Mould",
  pest_control: "Pest Control", doors_windows: "Doors & Windows", flooring: "Flooring",
  decorating: "Decorating", garden: "Garden", appliances: "Appliances",
  cleaning: "Cleaning", inspection: "Inspection", other: "Other",
};

const STATUS_CONFIG = {
  reported:            { label: "Reported",   cls: "bg-slate-100 text-slate-700 border-slate-200" },
  landlord_approval:   { label: "Landlord Approval", cls: "bg-amber-100 text-amber-800 border-amber-200" },
  approved:            { label: "Approved",   cls: "bg-blue-100 text-blue-700 border-blue-200" },
  contractor_assigned: { label: "Assigned",   cls: "bg-indigo-100 text-indigo-700 border-indigo-200" },
  in_progress:         { label: "In Progress",cls: "bg-sky-100 text-sky-700 border-sky-200" },
  completed:           { label: "Completed",  cls: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  closed:              { label: "Closed",     cls: "bg-green-100 text-green-800 border-green-200" },
  cancelled:           { label: "Cancelled",  cls: "bg-rose-100 text-rose-700 border-rose-200" },
  on_hold:             { label: "On Hold",    cls: "bg-slate-100 text-slate-600 border-slate-200" },
};

const PRIORITY_BADGES = {
  emergency: "bg-red-100 text-red-800 border-red-200",
  urgent:    "bg-amber-100 text-amber-800 border-amber-200",
  routine:   "bg-blue-100 text-blue-800 border-blue-200",
  planned:   "bg-slate-100 text-slate-600 border-slate-200",
};

export default function MaintenanceIndex() {
  const { jobs, summary, properties, filters } = useLoaderData();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const handleFilterChange = (key, value) => {
    const newParams = new URLSearchParams(searchParams);
    if (value) {
      newParams.set(key, value);
    } else {
      newParams.delete(key);
    }
    setSearchParams(newParams);
  };

  const clearFilters = () => {
    setSearchParams(new URLSearchParams());
  };

  // Determine if any job is overdue (not closed/cancelled and targetDate in the past)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const hasOverdueJobs = jobs.some(j =>
    !["closed", "cancelled"].includes(j.status) &&
    j.targetDate &&
    new Date(j.targetDate) < today
  );

  // Active Awaab's Law count
  const activeAwaabs = jobs.filter(j =>
    j.isAwaabsLaw &&
    !["closed", "cancelled"].includes(j.status)
  );

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-4 md:p-6">
      
      {/* Header Row */}
      <div className="border-b border-[#E2E8F0] pb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[#1E293B] flex items-center gap-2">
            <Wrench className="w-5 h-5 text-slate-800" />
            Maintenance Jobs
          </h1>
          <p className="text-xs text-[#94A3B8] mt-1">Track and manage active work orders and compliance repairs</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/maintenance/contractors"
            className="px-4 py-2 border border-[#E2E8F0] hover:bg-slate-50 text-xs font-semibold text-[#475569] rounded-lg transition"
          >
            Manage Contractors
          </Link>
          <Link
            to="/maintenance/planned"
            className="px-4 py-2 border border-[#E2E8F0] hover:bg-slate-50 text-xs font-semibold text-[#475569] rounded-lg transition"
          >
            Planned Schedules
          </Link>
          <Link
            to="/maintenance/new"
            className="flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-black text-white rounded-lg text-xs font-semibold shadow-sm transition"
          >
            <Plus className="w-4 h-4" />
            Log Work Order
          </Link>
        </div>
      </div>

      {/* KPI Section */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-sm">
          <span className="block text-[10px] uppercase font-bold text-[#94A3B8] tracking-wider">Active Jobs</span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-bold text-[#1E293B]">{summary.openJobs}</span>
            <span className="text-[10px] text-[#94A3B8] font-medium">pending resolution</span>
          </div>
        </div>

        <div className={`border rounded-xl p-4 shadow-sm transition ${summary.overdueJobs?.length > 0 ? "bg-red-50/50 border-red-200" : "bg-white border-[#E2E8F0]"}`}>
          <span className="block text-[10px] uppercase font-bold text-[#94A3B8] tracking-wider">Overdue Jobs</span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className={`text-2xl font-bold ${summary.overdueJobs?.length > 0 ? "text-red-600" : "text-[#1E293B]"}`}>
              {summary.overdueJobs?.length || 0}
            </span>
            <span className="text-[10px] text-[#94A3B8] font-medium">past target date</span>
          </div>
        </div>

        <div className={`border rounded-xl p-4 shadow-sm transition ${activeAwaabs.length > 0 ? "bg-orange-50/50 border-orange-200" : "bg-white border-[#E2E8F0]"}`}>
          <span className="block text-[10px] uppercase font-bold text-[#94A3B8] tracking-wider">Awaab's Law Tracker</span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className={`text-2xl font-bold ${activeAwaabs.length > 0 ? "text-orange-600" : "text-[#1E293B]"}`}>
              {activeAwaabs.length}
            </span>
            <span className="text-[10px] text-[#94A3B8] font-medium">damp &amp; mould logs</span>
          </div>
        </div>

        <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-sm">
          <span className="block text-[10px] uppercase font-bold text-[#94A3B8] tracking-wider">Completed (30 Days)</span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-bold text-emerald-600">{summary.completedLast30}</span>
            <span className="text-[10px] text-[#94A3B8] font-medium">jobs resolved</span>
          </div>
        </div>
      </div>

      {/* Critical Banners */}
      {hasOverdueJobs && (
        <div className="bg-red-50 border border-red-200 text-red-800 rounded-xl p-4 flex items-start gap-3 shadow-sm">
          <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5 shrink-0" />
          <div className="text-xs">
            <p className="font-bold">Overdue Work Orders Flagged</p>
            <p className="mt-0.5">One or more maintenance requests are past their suggested target completion date. Check priority levels and contact contractors to coordinate.</p>
          </div>
        </div>
      )}

      {activeAwaabs.length > 0 && (
        <div className="bg-orange-50 border border-orange-200 text-orange-800 rounded-xl p-4 flex items-start gap-3 shadow-sm">
          <AlertTriangle className="w-5 h-5 text-orange-600 mt-0.5 shrink-0" />
          <div className="text-xs space-y-1">
            <p className="font-bold">Active Damp &amp; Mould Investigations ({activeAwaabs.length})</p>
            <p>Awaab's Law regulations dictate statutory response targets for damp and mould hazards. Ensure an inspection report is completed within 14 days of reporting.</p>
          </div>
        </div>
      )}

      {/* Filter Row */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-sm flex flex-wrap gap-4 items-center justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <Filter className="w-4 h-4 text-[#94A3B8]" />
          
          <div className="flex items-center gap-2">
            <label className="text-[10px] font-bold text-[#475569] uppercase tracking-wider">Property</label>
            <select
              value={filters.propertyId}
              onChange={e => handleFilterChange("propertyId", e.target.value)}
              className="text-xs border border-[#E2E8F0] rounded-md px-2 py-1.5 text-[#1E293B] bg-white focus:outline-none focus:ring-1 focus:ring-[#2563EB]"
            >
              <option value="">All Properties</option>
              {properties.map(p => (
                <option key={p._id} value={p._id}>{p.addressLine1} ({p.postcode})</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-[10px] font-bold text-[#475569] uppercase tracking-wider">Status</label>
            <select
              value={filters.status}
              onChange={e => handleFilterChange("status", e.target.value)}
              className="text-xs border border-[#E2E8F0] rounded-md px-2 py-1.5 text-[#1E293B] bg-white focus:outline-none focus:ring-1 focus:ring-[#2563EB]"
            >
              <option value="">All Statuses</option>
              {Object.entries(STATUS_CONFIG).map(([val, cfg]) => (
                <option key={val} value={val}>{cfg.label}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-[10px] font-bold text-[#475569] uppercase tracking-wider">Priority</label>
            <select
              value={filters.priority}
              onChange={e => handleFilterChange("priority", e.target.value)}
              className="text-xs border border-[#E2E8F0] rounded-md px-2 py-1.5 text-[#1E293B] bg-white focus:outline-none focus:ring-1 focus:ring-[#2563EB]"
            >
              <option value="">All Priorities</option>
              <option value="emergency">Emergency</option>
              <option value="urgent">Urgent</option>
              <option value="routine">Routine</option>
              <option value="planned">Planned</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-[10px] font-bold text-[#475569] uppercase tracking-wider">Category</label>
            <select
              value={filters.category}
              onChange={e => handleFilterChange("category", e.target.value)}
              className="text-xs border border-[#E2E8F0] rounded-md px-2 py-1.5 text-[#1E293B] bg-white focus:outline-none focus:ring-1 focus:ring-[#2563EB]"
            >
              <option value="">All Categories</option>
              {Object.entries(CATEGORY_LABELS).map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>
          </div>
        </div>

        {(filters.status || filters.priority || filters.category || filters.propertyId) && (
          <button
            onClick={clearFilters}
            className="text-xs font-semibold text-[#2563EB] hover:text-blue-800"
          >
            Clear Filters
          </button>
        )}
      </div>

      {/* Main Listing Table */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl shadow-sm overflow-hidden">
        {jobs.length === 0 ? (
          <div className="p-16 text-center">
            <Wrench className="w-10 h-10 text-[#CBD5E1] mx-auto mb-3 opacity-50" />
            <h3 className="text-sm font-semibold text-[#475569]">No jobs matches filters</h3>
            <p className="text-xs text-[#94A3B8] mt-1">Try clearing filters or log a new work order to start tracking.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 border-b border-[#E2E8F0]">
                <tr>
                  {["Ref", "Property", "Title", "Category", "Priority", "Status", "Contractor", "Target Date"].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-[10px] font-bold text-[#94A3B8] uppercase tracking-wider whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F5F9]">
                {jobs.map(job => {
                  const badge = STATUS_CONFIG[job.status] || { label: job.status, cls: "bg-slate-100 text-slate-700" };
                  const priorityClass = PRIORITY_BADGES[job.priority] || "bg-slate-100 text-slate-700";
                  
                  const isOverdue = !["closed", "cancelled"].includes(job.status) &&
                    job.targetDate &&
                    new Date(job.targetDate) < today;

                  return (
                    <tr
                      key={job._id}
                      className={`hover:bg-slate-50/80 transition ${
                        job.priority === "emergency" && !["closed", "cancelled"].includes(job.status)
                          ? "bg-red-50/20"
                          : ""
                      }`}
                    >
                      <td className="px-4 py-3.5 font-mono font-bold text-[#1E293B] whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          {job.isAwaabsLaw && (
                            <span className="w-1.5 h-1.5 bg-orange-500 rounded-full" title="Awaab's Law Active" />
                          )}
                          {job.jobRef}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-[#475569] font-medium whitespace-nowrap">
                        {job.propertyId ? (
                          <div>
                            <span className="block">{job.propertyId.addressLine1}</span>
                            <span className="text-[10px] text-[#94A3B8]">{job.propertyId.postcode}</span>
                          </div>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-4 py-3.5 font-semibold text-[#1E293B] max-w-[200px] truncate">
                        {job.title}
                      </td>
                      <td className="px-4 py-3.5 text-[#475569] whitespace-nowrap">
                        {CATEGORY_LABELS[job.category] || job.category}
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold border ${priorityClass}`}>
                          {job.priority}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold border ${badge.cls}`}>
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-[#475569] whitespace-nowrap font-medium">
                        {job.contractorId ? job.contractorId.name : <span className="text-[#94A3B8] italic">Unassigned</span>}
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        {job.targetDate ? (
                          <div className="flex flex-col">
                            <span className={`font-semibold ${isOverdue ? "text-red-600" : "text-[#475569]"}`}>
                              {fmtDate(job.targetDate)}
                            </span>
                            {isOverdue && (
                              <span className="text-[9px] font-bold text-red-600 uppercase tracking-wide">Overdue</span>
                            )}
                          </div>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-right whitespace-nowrap">
                        <Link
                          to={`/maintenance/${job._id}`}
                          className="inline-flex items-center gap-1 text-[#2563EB] hover:text-blue-800 font-semibold"
                        >
                          Details
                          <ArrowRight className="w-3.5 h-3.5" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
}

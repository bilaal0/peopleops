// routes/maintenance/contractors/index.jsx
// Contractor list — card grid layout per spec Screen 5.
// Filters: Trade, Status. Shows Gas Safe badge, insurance expiry, preferred star.

import { useState } from "react";
import { Link, useLoaderData } from "react-router-dom";
import { redirect } from "react-router";
import { getUserFromRequest } from "../../../utils/auth.server.js";
import { connect } from "../../../config/db.server.js";
import { Contractor } from "../../../models/Contractor.server.js";
import { MaintenanceJob } from "../../../models/MaintenanceJob.server.js";
import {
  Star,
  Phone,
  Mail,
  ShieldCheck,
  AlertCircle,
  Clock,
  Plus,
  Wrench,
  Filter,
} from "lucide-react";

export async function loader({ request }) {
  const user = await getUserFromRequest(request);
  if (!user) return redirect("/login");
  if (!user.agencyId) return redirect("/dashboard");

  await connect();

  const contractors = await Contractor.find({
    agencyId: user.agencyId,
    deleted: false,
  })
    .sort({ isPreferred: -1, name: 1 })
    .lean();

  // Get job counts per contractor
  const contractorIds = contractors.map(c => c._id);
  const jobCounts = await MaintenanceJob.aggregate([
    {
      $match: {
        agencyId: user.agencyId,
        contractorId: { $in: contractorIds },
        deleted: false,
      },
    },
    { $group: { _id: "$contractorId", count: { $sum: 1 } } },
  ]);

  const jobCountMap = {};
  jobCounts.forEach(j => { jobCountMap[j._id.toString()] = j.count; });

  return {
    contractors: contractors.map(c => ({
      ...c,
      _id: c._id.toString(),
      jobCount: jobCountMap[c._id.toString()] || 0,
    })),
  };
}

const TRADE_LABELS = {
  plumbing: "Plumbing",
  electrical: "Electrical",
  gas: "Gas",
  heating: "Heating",
  roofing: "Roofing",
  structural: "Structural",
  damp_treatment: "Damp Treatment",
  pest_control: "Pest Control",
  glazing: "Glazing",
  flooring: "Flooring",
  decorating: "Decorating",
  general_builder: "General Builder",
  landscaping: "Landscaping",
  appliances: "Appliances",
  cleaning: "Cleaning",
  locksmith: "Locksmith",
  other: "Other",
};

function InsuranceBadge({ expiryDate }) {
  if (!expiryDate) return null;
  const today = new Date();
  const expiry = new Date(expiryDate);
  const diffDays = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700">
        <AlertCircle className="w-3 h-3" /> Insurance Expired
      </span>
    );
  }
  if (diffDays <= 30) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700">
        <Clock className="w-3 h-3" /> Expires in {diffDays}d
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-100 text-green-700">
      <ShieldCheck className="w-3 h-3" /> Insured
    </span>
  );
}

export default function ContractorsIndex() {
  const { contractors } = useLoaderData();
  const [tradeFilter, setTradeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("active");

  const allTrades = [...new Set(contractors.flatMap(c => c.trades || []))].sort();

  const filtered = contractors.filter(c => {
    const tradeMatch = tradeFilter === "all" || (c.trades || []).includes(tradeFilter);
    const statusMatch = statusFilter === "all" || c.status === statusFilter;
    return tradeMatch && statusMatch;
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-4 md:p-6">
      {/* Header */}
      <div className="border-b border-[#E2E8F0] pb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <nav className="text-xs text-[#94A3B8] font-medium mb-1">
            <Link to="/maintenance" className="hover:text-[#2563EB]">Maintenance</Link>
            <span className="mx-2">›</span>
            <span className="text-[#1E293B]">Contractors</span>
          </nav>
          <h1 className="text-xl font-bold tracking-tight text-[#1E293B]">Contractors</h1>
          <p className="text-xs text-[#94A3B8] mt-1">{filtered.length} contractor{filtered.length !== 1 ? "s" : ""}</p>
        </div>
        <Link
          to="/maintenance/contractors/new"
          className="flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-black text-white rounded-lg text-xs font-semibold shadow-sm transition"
        >
          <Plus className="w-4 h-4" />
          Add Contractor
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Filter className="w-4 h-4 text-[#94A3B8]" />
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-[#475569]">Trade</label>
          <select
            value={tradeFilter}
            onChange={e => setTradeFilter(e.target.value)}
            className="text-xs border border-[#E2E8F0] rounded-md px-2 py-1.5 text-[#1E293B] bg-white focus:outline-none focus:ring-2 focus:ring-[#2563EB]/30"
          >
            <option value="all">All Trades</option>
            {allTrades.map(t => (
              <option key={t} value={t}>{TRADE_LABELS[t] || t}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-[#475569]">Status</label>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="text-xs border border-[#E2E8F0] rounded-md px-2 py-1.5 text-[#1E293B] bg-white focus:outline-none focus:ring-2 focus:ring-[#2563EB]/30"
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="all">All</option>
          </select>
        </div>
      </div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-12 text-center">
          <Wrench className="w-10 h-10 text-[#94A3B8] mx-auto mb-3 opacity-40" />
          <p className="text-sm font-semibold text-[#475569]">No contractors found</p>
          <p className="text-xs text-[#94A3B8] mt-1">
            {tradeFilter !== "all" || statusFilter !== "active"
              ? "Try adjusting your filters."
              : "Add your first contractor to get started."}
          </p>
          <Link
            to="/maintenance/contractors/new"
            className="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-slate-900 text-white rounded-lg text-xs font-semibold hover:bg-black transition"
          >
            <Plus className="w-4 h-4" /> Add Contractor
          </Link>
        </div>
      )}

      {/* Contractor card grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map(contractor => (
          <div
            key={contractor._id}
            className={`bg-white border rounded-xl shadow-sm overflow-hidden flex flex-col transition hover:shadow-md ${
              contractor.status === "inactive" ? "border-[#E2E8F0] opacity-60" : "border-[#E2E8F0]"
            }`}
          >
            {/* Card header */}
            <div className="p-4 border-b border-[#F1F5F9]">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    {contractor.isPreferred && (
                      <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-400 shrink-0" />
                    )}
                    <h3 className="text-sm font-bold text-[#1E293B] truncate">{contractor.name}</h3>
                  </div>
                  {contractor.contactName && (
                    <p className="text-xs text-[#94A3B8] mt-0.5">{contractor.contactName}</p>
                  )}
                </div>
                <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  contractor.status === "active"
                    ? "bg-green-100 text-green-700"
                    : "bg-slate-100 text-slate-500"
                }`}>
                  {contractor.status === "active" ? "Active" : "Inactive"}
                </span>
              </div>

              {/* Trades */}
              {contractor.trades?.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {contractor.trades.slice(0, 4).map(trade => (
                    <span key={trade} className="px-1.5 py-0.5 bg-[#EFF6FF] text-[#2563EB] text-[10px] font-semibold rounded">
                      {TRADE_LABELS[trade] || trade}
                    </span>
                  ))}
                  {contractor.trades.length > 4 && (
                    <span className="px-1.5 py-0.5 bg-slate-100 text-[#94A3B8] text-[10px] font-semibold rounded">
                      +{contractor.trades.length - 4}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Card body */}
            <div className="p-4 flex-1 space-y-2">
              {contractor.phone && (
                <a href={`tel:${contractor.phone}`} className="flex items-center gap-2 text-xs text-[#475569] hover:text-[#2563EB] transition">
                  <Phone className="w-3.5 h-3.5 text-[#94A3B8]" />
                  {contractor.phone}
                </a>
              )}
              {contractor.email && (
                <a href={`mailto:${contractor.email}`} className="flex items-center gap-2 text-xs text-[#475569] hover:text-[#2563EB] transition truncate">
                  <Mail className="w-3.5 h-3.5 text-[#94A3B8]" />
                  <span className="truncate">{contractor.email}</span>
                </a>
              )}

              {/* Badges row */}
              <div className="flex flex-wrap gap-1.5 pt-1">
                {contractor.gasRegistered && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-50 text-orange-700 border border-orange-200">
                    <ShieldCheck className="w-3 h-3" /> Gas Safe
                  </span>
                )}
                {contractor.electricalRegistered && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                    <ShieldCheck className="w-3 h-3" /> {contractor.electricalRegistrationBody || "Electrical Reg."}
                  </span>
                )}
                {contractor.hasInsurance && (
                  <InsuranceBadge expiryDate={contractor.insuranceExpiryDate} />
                )}
              </div>

              <p className="text-[10px] text-[#94A3B8] font-medium pt-1">
                {contractor.jobCount} job{contractor.jobCount !== 1 ? "s" : ""} recorded
              </p>
            </div>

            {/* Card footer */}
            <div className="px-4 py-3 border-t border-[#F1F5F9] flex gap-2">
              <Link
                to={`/maintenance/contractors/${contractor._id}`}
                className="flex-1 text-center px-3 py-1.5 bg-slate-900 hover:bg-black text-white rounded-md text-xs font-semibold transition"
              >
                View
              </Link>
              <Link
                to={`/maintenance/new?contractorId=${contractor._id}`}
                className="flex-1 text-center px-3 py-1.5 border border-[#E2E8F0] hover:bg-slate-50 text-[#475569] rounded-md text-xs font-semibold transition"
              >
                Assign to Job
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

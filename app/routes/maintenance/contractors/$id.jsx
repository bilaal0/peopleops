// routes/maintenance/contractors/$id.jsx
// Contractor detail page. Full details + job history table + edit/mark-inactive actions.

import { useState } from "react";
import { Link, useLoaderData } from "react-router-dom";
import { redirect, useActionData } from "react-router";
import { fmtDate } from "../../../utils/date.js";
import { getUserFromRequest } from "../../../utils/auth.server.js";
import { connect } from "../../../config/db.server.js";
import { Contractor } from "../../../models/Contractor.server.js";
import { MaintenanceJob } from "../../../models/MaintenanceJob.server.js";
import {
  ShieldCheck,
  Phone,
  Mail,
  MapPin,
  Star,
  AlertCircle,
  Clock,
  Wrench,
  ArrowRight,
  CheckCircle,
} from "lucide-react";

export async function loader({ params, request }) {
  const user = await getUserFromRequest(request);
  if (!user) return redirect("/login");
  if (!user.organizationId) return redirect("/dashboard");

  await connect();

  const contractor = await Contractor.findOne({
    _id: params.id,
    organizationId: user.organizationId, // Organization isolation
    deleted: false,
  }).lean();

  if (!contractor) throw new Response("Contractor not found", { status: 404 });

  const jobs = await MaintenanceJob.find({
    contractorId: contractor._id,
    organizationId: user.organizationId,
    deleted: false,
  })
    .populate("propertyId", "addressLine1")
    .select("jobRef title status reportedDate completedDate actualCost estimatedCost priority")
    .sort({ createdAt: -1 })
    .lean();

  return {
    contractor: {
      ...contractor,
      _id: contractor._id.toString(),
    },
    jobs: jobs.map(j => ({
      ...j,
      _id: j._id.toString(),
      propertyId: j.propertyId
        ? { ...j.propertyId, _id: j.propertyId._id.toString() }
        : null,
    })),
  };
}

export async function action({ params, request }) {
  const user = await getUserFromRequest(request);
  if (!user) return redirect("/login");

  await connect();

  const fd = await request.formData();
  const intent = fd.get("intent");

  const contractor = await Contractor.findOne({
    _id: params.id,
    organizationId: user.organizationId,
  });
  if (!contractor) return { error: "Contractor not found." };

  if (intent === "mark-inactive") {
    contractor.status = "inactive";
    await contractor.save();
    return { success: "Contractor marked as inactive." };
  }

  if (intent === "mark-active") {
    contractor.status = "active";
    await contractor.save();
    return { success: "Contractor marked as active." };
  }

  return { error: "Unknown action." };
}

const TRADE_LABELS = {
  plumbing: "Plumbing", electrical: "Electrical", gas: "Gas", heating: "Heating",
  roofing: "Roofing", structural: "Structural", damp_treatment: "Damp Treatment",
  pest_control: "Pest Control", glazing: "Glazing", flooring: "Flooring",
  decorating: "Decorating", general_builder: "General Builder", landscaping: "Landscaping",
  appliances: "Appliances", cleaning: "Cleaning", locksmith: "Locksmith", other: "Other",
};

const STATUS_BADGE = {
  reported:            { label: "Reported",   cls: "bg-slate-100 text-slate-600" },
  landlord_approval:   { label: "Awaiting Approval", cls: "bg-amber-100 text-amber-700" },
  approved:            { label: "Approved",   cls: "bg-blue-100 text-blue-700" },
  contractor_assigned: { label: "Assigned",   cls: "bg-indigo-100 text-indigo-700" },
  in_progress:         { label: "In Progress",cls: "bg-blue-100 text-blue-700" },
  completed:           { label: "Completed",  cls: "bg-green-100 text-green-700" },
  closed:              { label: "Closed",     cls: "bg-green-100 text-green-800" },
  cancelled:           { label: "Cancelled",  cls: "bg-red-100 text-red-700" },
  on_hold:             { label: "On Hold",    cls: "bg-slate-100 text-slate-600" },
};

function InsuranceBadge({ hasInsurance, expiryDate }) {
  if (!hasInsurance) return <span className="text-xs text-[#94A3B8]">Not recorded</span>;
  if (!expiryDate) return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-100 text-green-700">
      <ShieldCheck className="w-3 h-3" /> Insured (no expiry set)
    </span>
  );

  const today = new Date();
  const expiry = new Date(expiryDate);
  const diffDays = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700">
      <AlertCircle className="w-3 h-3" /> Insurance Expired {fmtDate(expiryDate)}
    </span>
  );
  if (diffDays <= 30) return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700">
      <Clock className="w-3 h-3" /> Expires {fmtDate(expiryDate)} ({diffDays}d)
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-100 text-green-700">
      <ShieldCheck className="w-3 h-3" /> Insured until {fmtDate(expiryDate)}
    </span>
  );
}

export default function ContractorDetail() {
  const { contractor, jobs } = useLoaderData();
  const actionData = useActionData();

  const isActive = contractor.status === "active";

  return (
    <div className="space-y-6 max-w-6xl mx-auto p-4 md:p-6">
      {/* Breadcrumb + Header */}
      <div className="border-b border-[#E2E8F0] pb-5 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <nav className="text-xs text-[#94A3B8] font-medium mb-1">
            <Link to="/maintenance" className="hover:text-[#2563EB]">Maintenance</Link>
            <span className="mx-2">›</span>
            <Link to="/maintenance/contractors" className="hover:text-[#2563EB]">Contractors</Link>
            <span className="mx-2">›</span>
            <span className="text-[#1E293B]">{contractor.name}</span>
          </nav>
          <div className="flex items-center gap-2">
            {contractor.isPreferred && (
              <Star className="w-4 h-4 text-amber-500 fill-amber-400" />
            )}
            <h1 className="text-xl font-bold tracking-tight text-[#1E293B]">{contractor.name}</h1>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${isActive ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}`}>
              {isActive ? "Active" : "Inactive"}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to={`/maintenance/new?contractorId=${contractor._id}`}
            className="px-4 py-2 border border-[#E2E8F0] text-xs font-semibold text-[#475569] rounded-lg hover:bg-slate-50 transition"
          >
            Assign to Job
          </Link>
        </div>
      </div>

      {actionData?.success && (
        <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg px-4 py-3 text-xs font-semibold flex items-center gap-2">
          <CheckCircle className="w-4 h-4" /> {actionData.success}
        </div>
      )}
      {actionData?.error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-xs font-semibold">
          {actionData.error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Details */}
        <div className="lg:col-span-1 space-y-4">
          {/* Contact card */}
          <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-sm space-y-3">
            <h2 className="text-xs font-bold text-[#1E293B] uppercase tracking-wider">Contact</h2>
            {contractor.contactName && (
              <p className="text-xs text-[#475569]"><span className="font-semibold">Contact:</span> {contractor.contactName}</p>
            )}
            {contractor.phone && (
              <a href={`tel:${contractor.phone}`} className="flex items-center gap-2 text-xs text-[#475569] hover:text-[#2563EB] transition">
                <Phone className="w-3.5 h-3.5 text-[#94A3B8]" /> {contractor.phone}
              </a>
            )}
            {contractor.email && (
              <a href={`mailto:${contractor.email}`} className="flex items-center gap-2 text-xs text-[#475569] hover:text-[#2563EB] transition truncate">
                <Mail className="w-3.5 h-3.5 text-[#94A3B8]" /> <span className="truncate">{contractor.email}</span>
              </a>
            )}
            {contractor.address?.line1 && (
              <div className="flex items-start gap-2 text-xs text-[#475569]">
                <MapPin className="w-3.5 h-3.5 text-[#94A3B8] mt-0.5 shrink-0" />
                <span>{contractor.address.line1}{contractor.address.city ? `, ${contractor.address.city}` : ""}{contractor.address.postcode ? ` ${contractor.address.postcode}` : ""}</span>
              </div>
            )}
          </div>

          {/* Trades */}
          {contractor.trades?.length > 0 && (
            <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-sm">
              <h2 className="text-xs font-bold text-[#1E293B] uppercase tracking-wider mb-3">Trades</h2>
              <div className="flex flex-wrap gap-1.5">
                {contractor.trades.map(t => (
                  <span key={t} className="px-2 py-0.5 bg-[#EFF6FF] text-[#2563EB] text-[10px] font-semibold rounded">
                    {TRADE_LABELS[t] || t}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Accreditation */}
          <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-sm space-y-3">
            <h2 className="text-xs font-bold text-[#1E293B] uppercase tracking-wider">Accreditation & Insurance</h2>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                {contractor.gasRegistered ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-50 text-orange-700 border border-orange-200">
                    <ShieldCheck className="w-3 h-3" /> Gas Safe Registered
                  </span>
                ) : (
                  <span className="text-xs text-[#94A3B8]">Gas Safe: Not registered</span>
                )}
              </div>
              {contractor.gasRegistered && contractor.gasRegistrationNumber && (
                <p className="text-[11px] text-[#94A3B8] ml-1">Reg: {contractor.gasRegistrationNumber}</p>
              )}

              <div className="flex items-center gap-2 mt-1">
                {contractor.electricalRegistered ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                    <ShieldCheck className="w-3 h-3" /> {contractor.electricalRegistrationBody || "Electrical Reg."}
                  </span>
                ) : (
                  <span className="text-xs text-[#94A3B8]">Electrical: Not registered</span>
                )}
              </div>

              <div className="mt-2">
                <InsuranceBadge
                  hasInsurance={contractor.hasInsurance}
                  expiryDate={contractor.insuranceExpiryDate}
                />
                {contractor.publicLiabilityAmount && (
                  <p className="text-[11px] text-[#94A3B8] mt-1">Cover: £{contractor.publicLiabilityAmount.toLocaleString("en-GB")}</p>
                )}
              </div>
            </div>
          </div>

          {/* Notes */}
          {contractor.notes && (
            <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-sm">
              <h2 className="text-xs font-bold text-[#1E293B] uppercase tracking-wider mb-2">Notes</h2>
              <p className="text-xs text-[#475569] leading-relaxed whitespace-pre-wrap">{contractor.notes}</p>
            </div>
          )}

          {/* Status actions */}
          <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-sm">
            <h2 className="text-xs font-bold text-[#1E293B] uppercase tracking-wider mb-3">Actions</h2>
            <form method="post" className="space-y-2">
              {isActive ? (
                <button
                  type="submit"
                  name="intent"
                  value="mark-inactive"
                  className="w-full text-center px-4 py-2 border border-[#E2E8F0] text-xs font-semibold text-[#DC2626] hover:bg-red-50 rounded-lg transition"
                >
                  Mark as Inactive
                </button>
              ) : (
                <button
                  type="submit"
                  name="intent"
                  value="mark-active"
                  className="w-full text-center px-4 py-2 border border-[#E2E8F0] text-xs font-semibold text-[#16A34A] hover:bg-green-50 rounded-lg transition"
                >
                  Mark as Active
                </button>
              )}
            </form>
          </div>
        </div>

        {/* Right: Job history */}
        <div className="lg:col-span-2">
          <div className="bg-white border border-[#E2E8F0] rounded-xl shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-[#E2E8F0] bg-slate-50 flex items-center justify-between">
              <h2 className="text-xs font-bold text-[#1E293B] uppercase tracking-wider flex items-center gap-2">
                <Wrench className="w-4 h-4 text-[#94A3B8]" /> Job History
              </h2>
              <span className="text-[10px] font-bold text-[#94A3B8]">{jobs.length} job{jobs.length !== 1 ? "s" : ""}</span>
            </div>

            {jobs.length === 0 ? (
              <div className="p-10 text-center text-[#94A3B8]">
                <Wrench className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-xs font-semibold">No jobs recorded for this contractor yet.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 border-b border-[#E2E8F0]">
                    <tr>
                      {["Ref", "Property", "Title", "Status", "Date", "Cost"].map(h => (
                        <th key={h} className="text-left px-4 py-3 text-[10px] font-bold text-[#94A3B8] uppercase tracking-wider whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F1F5F9]">
                    {jobs.map(job => {
                      const badge = STATUS_BADGE[job.status] || { label: job.status, cls: "bg-slate-100 text-slate-600" };
                      const cost = job.actualCost ?? job.estimatedCost;
                      return (
                        <tr key={job._id} className="hover:bg-slate-50 transition">
                          <td className="px-4 py-3 font-mono font-bold text-[#1E293B] whitespace-nowrap">
                            {job.jobRef}
                          </td>
                          <td className="px-4 py-3 text-[#475569] max-w-[160px] truncate">
                            {job.propertyId?.addressLine1 || "—"}
                          </td>
                          <td className="px-4 py-3 text-[#1E293B] max-w-[200px] truncate font-medium">
                            {job.title}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${badge.cls}`}>
                              {badge.label}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-[#94A3B8] whitespace-nowrap">
                            {fmtDate(job.completedDate || job.reportedDate)}
                          </td>
                          <td className="px-4 py-3 text-[#1E293B] font-semibold whitespace-nowrap">
                            {cost != null ? `£${cost.toLocaleString("en-GB")}` : "—"}
                          </td>
                          <td className="px-4 py-3">
                            <Link
                              to={`/maintenance/${job._id}`}
                              className="text-[#2563EB] hover:underline font-semibold flex items-center gap-1"
                            >
                              View <ArrowRight className="w-3 h-3" />
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
      </div>
    </div>
  );
}

// routes/maintenance/$id.edit.jsx
// Edit form for an existing maintenance job.
// Features isolated updates, category warnings, and audit trail note creation.

import { useState } from "react";
import { Link, useActionData, useLoaderData, useNavigation } from "react-router-dom";
import { redirect, data } from "react-router";
import UKDateInput from "../../components/ui/UKDateInput.jsx";
import { getUserFromRequest } from "../../utils/auth.server.js";
import { connect } from "../../config/db.server.js";
import { MaintenanceJob } from "../../models/MaintenanceJob.server.js";
import { applyAwaabsLawFlags, calculateTargetDate } from "../../utils/maintenance.server.js";
import { createSystemEvent } from "../../utils/activityLog.server.js";
import { Wrench, Calendar, Info, Loader2 } from "lucide-react";

export async function loader({ params, request }) {
  const user = await getUserFromRequest(request);
  if (!user) return redirect("/login");
  if (!user.agencyId) return redirect("/dashboard");

  await connect();

  const job = await MaintenanceJob.findOne({
    _id: params.id,
    agencyId: user.agencyId,
    deleted: { $ne: true },
  }).lean();

  if (!job) throw new Response("Job not found", { status: 404 });

  return {
    job: {
      ...job,
      _id: job._id.toString(),
      reportedDate: job.reportedDate ? new Date(job.reportedDate).toISOString().split("T")[0] : "",
      targetDate: job.targetDate ? new Date(job.targetDate).toISOString().split("T")[0] : "",
    },
  };
}

export async function action({ params, request }) {
  const user = await getUserFromRequest(request);
  if (!user) return redirect("/login");
  if (!user.agencyId) return redirect("/dashboard");

  await connect();

  const formData = await request.formData();
  const get = key => formData.get(key)?.toString().trim() || null;
  const getNum = key => {
    const val = parseFloat(formData.get(key));
    return isNaN(val) ? null : val;
  };

  const category = get("category");
  const title = get("title");
  const description = get("description");
  const location = get("location");
  const priority = get("priority") || "routine";
  const reportedDateStr = get("reportedDate");
  const estimatedCost = getNum("estimatedCost");
  const costResponsibility = get("costResponsibility") || "landlord";
  const targetDateStr = get("targetDate");

  // Validate required
  const errors = {};
  if (!category) errors.category = "Category is required.";
  if (!title) errors.title = "Title is required.";

  if (Object.keys(errors).length > 0) {
    return data({ errors, values: Object.fromEntries(formData) }, { status: 400 });
  }

  const job = await MaintenanceJob.findOne({
    _id: params.id,
    agencyId: user.agencyId,
  });

  if (!job) return data({ error: "Job not found" }, { status: 404 });

  const reportedDate = reportedDateStr ? new Date(reportedDateStr) : job.reportedDate;
  const targetDate = targetDateStr ? new Date(targetDateStr) : calculateTargetDate(priority, reportedDate);

  // Update fields
  job.category = category;
  job.title = title;
  job.description = description;
  job.location = location;
  job.priority = priority;
  job.reportedDate = reportedDate;
  job.targetDate = targetDate;
  job.estimatedCost = estimatedCost;
  job.costResponsibility = costResponsibility;

  // Apply Awaab's Law rules
  const updatedJob = applyAwaabsLawFlags(job);
  await updatedJob.save();

  // Audit event
  await createSystemEvent({
    agencyId: user.agencyId,
    entityType: "maintenance_job",
    entityId: job._id,
    eventType: "maintenance_job_updated",
    text: `Job details updated by ${user.title ? user.title + ' ' : ''}${user.firstName} ${user.lastName}.`,
    metadata: {
      category: job.category || null,
      title: job.title || null,
      priority: job.priority || null,
      location: job.location || null,
      updatedBy: `${user.title ? user.title + ' ' : ''}${user.firstName} ${user.lastName}`.trim(),
    },
    triggeredByUserId: user.userId || user._id,
  });

  return redirect(`/maintenance/${job._id}`);
}

const CATEGORIES = [
  { value: "plumbing",       label: "Plumbing" },
  { value: "electrical",     label: "Electrical" },
  { value: "gas",            label: "Gas" },
  { value: "heating",        label: "Heating" },
  { value: "roofing",        label: "Roofing" },
  { value: "structural",     label: "Structural" },
  { value: "damp_mould",     label: "Damp & Mould" },
  { value: "pest_control",   label: "Pest Control" },
  { value: "doors_windows",  label: "Doors & Windows" },
  { value: "flooring",       label: "Flooring" },
  { value: "decorating",     label: "Decorating" },
  { value: "garden",         label: "Garden" },
  { value: "appliances",     label: "Appliances" },
  { value: "cleaning",       label: "Cleaning" },
  { value: "inspection",     label: "Inspection" },
  { value: "other",          label: "Other" },
];

const inputCls = "w-full text-xs border border-[#E2E8F0] rounded-lg px-3 py-2 text-[#1E293B] bg-white focus:outline-none focus:ring-2 focus:ring-[#2563EB]/30 focus:border-[#2563EB] transition placeholder-[#CBD5E1]";

export default function MaintenanceEdit() {
  const { job } = useLoaderData();
  const actionData = useActionData();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const [category, setCategory] = useState(job.category);
  const [priority, setPriority] = useState(job.priority);

  return (
    <div className="space-y-6 max-w-3xl mx-auto p-4 md:p-6">
      
      {/* Header */}
      <div className="border-b border-[#E2E8F0] pb-5">
        <nav className="text-xs text-[#94A3B8] font-medium mb-1">
          <Link to="/maintenance" className="hover:text-[#2563EB]">Maintenance</Link>
          <span className="mx-2">›</span>
          <Link to={`/maintenance/${job._id}`} className="hover:text-[#2563EB]">Job {job.jobRef}</Link>
          <span className="mx-2">›</span>
          <span className="text-[#1E293B]">Edit</span>
        </nav>
        <h1 className="text-xl font-bold tracking-tight text-[#1E293B] flex items-center gap-2">
          <Wrench className="w-5 h-5 text-[#94A3B8]" />
          Edit Work Order Details
        </h1>
      </div>

      {actionData?.error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-xs font-semibold">
          {actionData.error}
        </div>
      )}

      <form method="post" className="space-y-6 bg-white border border-[#E2E8F0] rounded-xl p-6 shadow-sm">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          
          <div>
            <label className="block text-xs font-semibold text-[#475569] mb-1">Category *</label>
            <select
              name="category"
              value={category}
              onChange={e => {
                setCategory(e.target.value);
                if (e.target.value === "damp_mould") {
                  setPriority("urgent");
                }
              }}
              required
              className={inputCls}
            >
              {CATEGORIES.map(cat => (
                <option key={cat.value} value={cat.value}>{cat.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#475569] mb-1">Location / Area</label>
            <input
              name="location"
              type="text"
              defaultValue={job.location || ""}
              className={inputCls}
              placeholder="e.g. Kitchen, Room 2"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-[#475569] mb-1">Title *</label>
            <input
              name="title"
              type="text"
              required
              defaultValue={job.title}
              className={inputCls}
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-[#475569] mb-1">Description</label>
            <textarea
              name="description"
              rows={4}
              defaultValue={job.description || ""}
              className={inputCls}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#475569] mb-1">Priority</label>
            <select
              name="priority"
              value={priority}
              onChange={e => setPriority(e.target.value)}
              className={inputCls}
              disabled={category === "damp_mould"}
            >
              <option value="emergency">Emergency</option>
              <option value="urgent">Urgent</option>
              <option value="routine">Routine</option>
              <option value="planned">Planned</option>
            </select>
            {category === "damp_mould" && (
              <p className="text-[10px] text-amber-600 mt-1 font-semibold">Priority locked to Urgent due to damp/mould compliance.</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#475569] mb-1">Estimated Cost (£)</label>
            <input
              name="estimatedCost"
              type="number"
              min="0"
              step="0.01"
              defaultValue={job.estimatedCost || ""}
              className={inputCls}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#475569] mb-1">Reported Date</label>
            <UKDateInput
              name="reportedDate"
              defaultValue={job.reportedDate}
              className={inputCls}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#475569] mb-1">Target Completion Date</label>
            <UKDateInput
              name="targetDate"
              defaultValue={job.targetDate}
              className={inputCls}
            />
            <p className="text-[10px] text-[#94A3B8] mt-1">Leave blank to auto-calculate.</p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#475569] mb-1">Cost Responsibility</label>
            <select
              name="costResponsibility"
              defaultValue={job.costResponsibility || "landlord"}
              className={inputCls}
            >
              <option value="landlord">Landlord (Deduct from rent)</option>
              <option value="tenant">Tenant Liability</option>
              <option value="agency">Agency Covered</option>
              <option value="insurance">Insurance Claim</option>
              <option value="tbc">To Be Confirmed</option>
            </select>
          </div>

        </div>

        {/* Action controls */}
        <div className="flex items-center gap-2 pt-2 border-t border-[#F1F5F9]">
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-6 py-2 bg-slate-900 hover:bg-black text-white rounded-lg text-xs font-bold transition flex items-center gap-2 disabled:bg-slate-400"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving...
              </>
            ) : (
              "Save Changes"
            )}
          </button>
          <Link
            to={`/maintenance/${job._id}`}
            className="px-4 py-2 text-xs font-semibold border border-[#E2E8F0] hover:bg-slate-50 text-[#475569] rounded-lg transition"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}

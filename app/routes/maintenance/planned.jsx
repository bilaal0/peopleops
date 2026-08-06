// routes/maintenance/planned.jsx
// Managed recurring planned maintenance schedules view.
// Create schedules, toggle active status, soft delete, and trigger manual job generator runs.

import { useState } from "react";
import { Link, useLoaderData, useNavigation, useActionData } from "react-router-dom";
import { redirect, data } from "react-router";
import { fmtDate } from "../../utils/date.js";
import UKDateInput from "../../components/ui/UKDateInput.jsx";
import { getUserFromRequest } from "../../utils/auth.server.js";
import { connect } from "../../config/db.server.js";
import { PlannedMaintenanceSchedule } from "../../models/PlannedMaintenanceSchedule.server.js";
import { Property } from "../../models/property.server.js";
import { Contractor } from "../../models/Contractor.server.js";
import { generatePlannedMaintenanceJobs } from "../../utils/maintenance.server.js";
import {
  Wrench,
  Calendar,
  AlertTriangle,
  Play,
  Plus,
  Trash2,
  Power,
  PowerOff,
  User,
  Info,
  Loader2,
  Clock,
  ArrowRight,
} from "lucide-react";

export async function loader({ request }) {
  const user = await getUserFromRequest(request);
  if (!user) return redirect("/login");
  if (!user.agencyId) return redirect("/dashboard");

  await connect();

  // Fetch active schedules populated
  const schedules = await PlannedMaintenanceSchedule.find({
    agencyId: user.agencyId,
    deleted: { $ne: true },
  })
    .populate("propertyId", "addressLine1 city postcode")
    .populate("preferredContractorId", "name")
    .sort({ nextDueDate: 1 })
    .lean();

  // Fetch properties for addition selector
  const properties = await Property.find({
    agencyId: user.agencyId,
    deleted: { $ne: true },
  })
    .select("addressLine1 city postcode landlordId")
    .sort({ addressLine1: 1 })
    .lean();

  // Fetch contractors for addition selector
  const contractors = await Contractor.find({
    agencyId: user.agencyId,
    status: "active",
    deleted: false,
  })
    .select("name trades")
    .sort({ name: 1 })
    .lean();

  return {
    schedules: schedules.map(s => ({
      ...s,
      _id: s._id.toString(),
      propertyId: s.propertyId ? { ...s.propertyId, _id: s.propertyId._id.toString() } : null,
      preferredContractorId: s.preferredContractorId ? { ...s.preferredContractorId, _id: s.preferredContractorId._id.toString() } : null,
    })),
    properties: properties.map(p => ({ ...p, _id: p._id.toString(), landlordId: p.landlordId.toString() })),
    contractors: contractors.map(c => ({ ...c, _id: c._id.toString() })),
  };
}

export async function action({ request }) {
  const user = await getUserFromRequest(request);
  if (!user) return redirect("/login");
  if (!user.agencyId) return redirect("/dashboard");

  await connect();

  const fd = await request.formData();
  const intent = fd.get("intent");

  // ─────────────────────────────────────────────────────────────────────────────
  // Action 1: Trigger Cron Job Generation
  // ─────────────────────────────────────────────────────────────────────────────
  if (intent === "trigger-cron") {
    const result = await generatePlannedMaintenanceJobs();
    return { cronResult: result };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Action 2: Toggle Active Status
  // ─────────────────────────────────────────────────────────────────────────────
  if (intent === "toggle-active") {
    const scheduleId = fd.get("scheduleId");
    const schedule = await PlannedMaintenanceSchedule.findOne({
      _id: scheduleId,
      agencyId: user.agencyId,
    });
    if (schedule) {
      schedule.active = !schedule.active;
      await schedule.save();
    }
    return { success: "Schedule status updated." };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Action 3: Delete (Soft Delete) Schedule
  // ─────────────────────────────────────────────────────────────────────────────
  if (intent === "delete-schedule") {
    const scheduleId = fd.get("scheduleId");
    await PlannedMaintenanceSchedule.findOneAndUpdate(
      { _id: scheduleId, agencyId: user.agencyId },
      { deleted: true, deletedAt: new Date(), deletedBy: user.userId || user._id }
    );
    return { success: "Schedule successfully removed." };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Action 4: Create Schedule
  // ─────────────────────────────────────────────────────────────────────────────
  if (intent === "create-schedule") {
    const propertyId = fd.get("propertyId")?.toString().trim();
    const title = fd.get("title")?.toString().trim();
    const category = fd.get("category")?.toString().trim();
    const frequency = fd.get("frequency")?.toString().trim();
    const frequencyDaysVal = parseInt(fd.get("frequencyDays"));
    const nextDueDateStr = fd.get("nextDueDate");
    const estimatedCostVal = parseFloat(fd.get("estimatedCost"));
    const preferredContractorId = fd.get("preferredContractorId") || null;
    const autoGenerate = fd.get("autoGenerate") === "true";
    const daysBeforeDueVal = parseInt(fd.get("daysBeforeDue"));

    const errors = {};
    if (!propertyId) errors.propertyId = "Property is required.";
    if (!title) errors.title = "Schedule title is required.";
    if (!category) errors.category = "Category is required.";
    if (!frequency) errors.frequency = "Frequency is required.";
    if (!nextDueDateStr) errors.nextDueDate = "Next due date is required.";

    if (Object.keys(errors).length > 0) {
      return data({ errors, values: Object.fromEntries(fd) }, { status: 400 });
    }

    const property = await Property.findOne({
      _id: propertyId,
      agencyId: user.agencyId,
    }).lean();

    if (!property) {
      return data({ errors: { propertyId: "Property not found." } }, { status: 404 });
    }

    const nextDueDate = new Date(nextDueDateStr);
    const frequencyDays = isNaN(frequencyDaysVal) ? null : frequencyDaysVal;
    const estimatedCost = isNaN(estimatedCostVal) ? null : estimatedCostVal;
    const daysBeforeDue = isNaN(daysBeforeDueVal) ? 30 : daysBeforeDueVal;

    await PlannedMaintenanceSchedule.create({
      agencyId: user.agencyId,
      propertyId,
      landlordId: property.landlordId.toString(),
      title,
      category,
      frequency,
      frequencyDays,
      nextDueDate,
      estimatedCost,
      preferredContractorId,
      autoGenerate,
      daysBeforeDue,
      createdBy: user.userId || user._id,
    });

    return { success: "Planned maintenance schedule added successfully." };
  }

  return data({ error: "Unknown action intent." }, { status: 400 });
}

const FREQUENCY_LABELS = {
  monthly: "Monthly",
  quarterly: "Quarterly",
  "6_monthly": "Bi-Annually",
  annual: "Annually",
  "2_yearly": "Biennially",
  "5_yearly": "5-Yearly",
  "10_yearly": "10-Yearly",
  custom: "Custom Interval",
};

const CATEGORIES = [
  { value: "plumbing",       label: "Plumbing" },
  { value: "electrical",     label: "Electrical" },
  { value: "gas",            label: "Gas Compliance" },
  { value: "heating",        label: "Heating & Safety" },
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
  { value: "inspection",     label: "Property Inspection" },
  { value: "other",          label: "Other" },
];

const inputCls = "w-full text-xs border border-[#E2E8F0] rounded-lg px-3 py-2 text-[#1E293B] bg-white focus:outline-none focus:ring-2 focus:ring-[#2563EB]/30 focus:border-[#2563EB] transition placeholder-[#CBD5E1]";

export default function MaintenancePlanned() {
  const { schedules, properties, contractors } = useLoaderData();
  const actionData = useActionData();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const [frequency, setFrequency] = useState("annual");
  const [showAddForm, setShowAddForm] = useState(false);

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-4 md:p-6">
      
      {/* Header */}
      <div className="border-b border-[#E2E8F0] pb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <nav className="text-xs text-[#94A3B8] font-medium mb-1">
            <Link to="/maintenance" className="hover:text-[#2563EB]">Maintenance</Link>
            <span className="mx-2">›</span>
            <span className="text-[#1E293B]">Planned Schedules</span>
          </nav>
          <h1 className="text-xl font-bold tracking-tight text-[#1E293B] flex items-center gap-2">
            <Calendar className="w-5 h-5 text-slate-800" />
            Planned Maintenance Schedules
          </h1>
          <p className="text-xs text-[#94A3B8] mt-1">Configure and manage recurring statutory safety checks and property inspections</p>
        </div>

        {/* Global actions */}
        <div className="flex items-center gap-2">
          <form method="post">
            <input type="hidden" name="intent" value="trigger-cron" />
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-2 px-4 py-2 border border-[#E2E8F0] hover:bg-slate-50 text-xs font-semibold text-[#475569] rounded-lg transition disabled:opacity-50"
            >
              {isSubmitting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Play className="w-3.5 h-3.5 text-green-600 fill-green-600" />
              )}
              Run Generation Now
            </button>
          </form>

          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-black text-white rounded-lg text-xs font-semibold shadow-sm transition"
          >
            <Plus className="w-4 h-4" />
            Add Schedule
          </button>
        </div>
      </div>

      {/* Action outcomes alerts */}
      {actionData?.cronResult && (
        <div className="bg-green-50 border border-green-200 text-green-800 rounded-xl p-4 flex items-start gap-3 shadow-sm">
          <Info className="w-5 h-5 text-green-600 mt-0.5 shrink-0" />
          <div className="text-xs">
            <p className="font-bold">Planned Maintenance Generation Run Complete</p>
            <p className="mt-0.5">
              Successfully scanned all schedules. Created <strong className="text-green-700">{actionData.cronResult.created}</strong> new jobs.
              Skipped/Ignored <strong className="text-slate-700">{actionData.cronResult.skipped}</strong> schedules (either not due or duplication block).
            </p>
          </div>
        </div>
      )}

      {actionData?.success && (
        <div className="bg-green-50 border border-green-200 text-green-800 rounded-lg px-4 py-3 text-xs font-semibold">
          {actionData.success}
        </div>
      )}

      {/* Add Schedule Panel */}
      {showAddForm && (
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-6 shadow-sm space-y-4">
          <h2 className="text-xs font-bold text-[#1E293B] uppercase tracking-wider border-b border-[#F1F5F9] pb-2">
            Create Recurring Maintenance Schedule
          </h2>

          <form method="post" className="grid grid-cols-1 sm:grid-cols-3 gap-4" onSubmit={() => setShowAddForm(false)}>
            <input type="hidden" name="intent" value="create-schedule" />

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-[#475569] mb-1">Select Property *</label>
              <select name="propertyId" required className={inputCls}>
                <option value="">-- Choose Property --</option>
                {properties.map(p => (
                  <option key={p._id} value={p._id}>
                    {p.addressLine1}, {p.city} ({p.postcode})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#475569] mb-1">Category *</label>
              <select name="category" required className={inputCls}>
                <option value="">-- Choose Category --</option>
                {CATEGORIES.map(cat => (
                  <option key={cat.value} value={cat.value}>{cat.label}</option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-[#475569] mb-1">Schedule Title (e.g. Gas Certificate) *</label>
              <input name="title" type="text" required placeholder="e.g. Annual Gas Safety Inspection" className={inputCls} />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#475569] mb-1">Preferred Contractor</label>
              <select name="preferredContractorId" className={inputCls}>
                <option value="">-- Auto-Assign Off --</option>
                {contractors.map(c => (
                  <option key={c._id} value={c._id}>{c.name}</option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-3">
              <label className="block text-xs font-semibold text-[#475569] mb-1">Instructions / Description</label>
              <textarea name="description" rows={3} placeholder="Provide details or safety guidelines for this recurring check..." className={inputCls} />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#475569] mb-1">Recurrence Frequency *</label>
              <select
                name="frequency"
                value={frequency}
                onChange={e => setFrequency(e.target.value)}
                required
                className={inputCls}
              >
                {Object.entries(FREQUENCY_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </div>

            {frequency === "custom" && (
              <div>
                <label className="block text-xs font-semibold text-[#475569] mb-1">Interval (Days) *</label>
                <input name="frequencyDays" type="number" min="1" required placeholder="e.g. 45" className={inputCls} />
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-[#475569] mb-1">Next Due Date *</label>
              <UKDateInput name="nextDueDate" required className={inputCls} />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#475569] mb-1">Estimated Cost (£)</label>
              <input name="estimatedCost" type="number" min="0" step="0.01" placeholder="0.00" className={inputCls} />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#475569] mb-1">Days Before Due to Generate Job</label>
              <input name="daysBeforeDue" type="number" min="1" defaultValue="30" className={inputCls} />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#475569] mb-2">Job Generation</label>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="radio" name="autoGenerate" value="true" defaultChecked className="text-[#2563EB] focus:ring-[#2563EB]" />
                  <span className="text-xs font-medium text-[#475569]">Automatic (Cron)</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="radio" name="autoGenerate" value="false" className="text-[#2563EB] focus:ring-[#2563EB]" />
                  <span className="text-xs font-medium text-[#475569]">Manual ONLY</span>
                </label>
              </div>
            </div>

            <div className="sm:col-span-3 flex justify-end gap-2 pt-2 border-t border-[#F1F5F9]">
              <button
                type="submit"
                className="px-5 py-2 bg-slate-900 hover:bg-black text-white rounded-lg text-xs font-bold transition"
              >
                Save Schedule
              </button>
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="px-4 py-2 border border-[#E2E8F0] hover:bg-slate-50 text-xs font-semibold text-[#475569] rounded-lg transition"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Schedules List Grid */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl shadow-sm overflow-hidden">
        {schedules.length === 0 ? (
          <div className="p-16 text-center">
            <Calendar className="w-10 h-10 text-[#CBD5E1] mx-auto mb-3 opacity-50" />
            <h3 className="text-sm font-semibold text-[#475569]">No recurring schedules configured</h3>
            <p className="text-xs text-[#94A3B8] mt-1">Configure compliance checks (like Gas Safety, EICR) to auto-generate jobs.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 border-b border-[#E2E8F0]">
                <tr>
                  {["Property", "Title", "Category", "Frequency", "Next Due Date", "Contractor", "Method", "Status"].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-[10px] font-bold text-[#94A3B8] uppercase tracking-wider whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F5F9]">
                {schedules.map(schedule => {
                  const today = new Date();
                  today.setHours(0, 0, 0, 0);
                  const isNearDue = schedule.nextDueDate &&
                    new Date(schedule.nextDueDate).getTime() - today.getTime() <= (schedule.daysBeforeDue || 30) * 24 * 60 * 60 * 1000;

                  return (
                    <tr key={schedule._id} className="hover:bg-slate-50/80 transition">
                      <td className="px-4 py-3.5 text-[#475569] font-medium whitespace-nowrap">
                        {schedule.propertyId ? (
                          <div>
                            <span className="block text-[#1E293B] font-bold">{schedule.propertyId.addressLine1}</span>
                            <span className="text-[10px] text-[#94A3B8]">{schedule.propertyId.postcode}</span>
                          </div>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-4 py-3.5 font-semibold text-[#1E293B]">
                        {schedule.title}
                      </td>
                      <td className="px-4 py-3.5 text-[#475569] whitespace-nowrap capitalize">
                        {schedule.category}
                      </td>
                      <td className="px-4 py-3.5 text-[#475569] whitespace-nowrap">
                        {FREQUENCY_LABELS[schedule.frequency]}
                        {schedule.frequency === "custom" && ` (${schedule.frequencyDays} days)`}
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <span className={`font-semibold ${isNearDue && schedule.active ? "text-amber-600 font-bold" : "text-[#475569]"}`}>
                          {fmtDate(schedule.nextDueDate)}
                        </span>
                        {isNearDue && schedule.active && (
                          <span className="block text-[9px] font-bold text-amber-600 uppercase tracking-wide">Due Soon</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-[#475569] whitespace-nowrap font-medium">
                        {schedule.preferredContractorId ? schedule.preferredContractorId.name : <span className="text-[#94A3B8] italic">Not Auto-Assigned</span>}
                      </td>
                      <td className="px-4 py-3.5 text-[#475569] whitespace-nowrap font-medium">
                        {schedule.autoGenerate ? "Auto-Generate" : "Manual run"}
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                          schedule.active
                            ? "bg-green-50 border-green-200 text-green-700"
                            : "bg-slate-100 border-slate-200 text-slate-500"
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${schedule.active ? "bg-green-500" : "bg-slate-400"}`} />
                          {schedule.active ? "Active" : "Paused"}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-3">
                          {/* Toggle Active status */}
                          <form method="post">
                            <input type="hidden" name="intent" value="toggle-active" />
                            <input type="hidden" name="scheduleId" value={schedule._id} />
                            <button
                              type="submit"
                              title={schedule.active ? "Pause schedule" : "Activate schedule"}
                              className={`p-1.5 border rounded-lg hover:bg-slate-50 transition ${
                                schedule.active ? "text-slate-500" : "text-green-600"
                              }`}
                            >
                              {schedule.active ? <PowerOff className="w-3.5 h-3.5" /> : <Power className="w-3.5 h-3.5" />}
                            </button>
                          </form>

                          {/* Delete schedule */}
                          <form method="post" onSubmit={e => { if(!confirm("Permanently delete this schedule?")) e.preventDefault(); }}>
                            <input type="hidden" name="intent" value="delete-schedule" />
                            <input type="hidden" name="scheduleId" value={schedule._id} />
                            <button
                              type="submit"
                              title="Delete schedule"
                              className="p-1.5 border border-red-200 hover:bg-red-50 text-red-600 rounded-lg transition"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </form>
                        </div>
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

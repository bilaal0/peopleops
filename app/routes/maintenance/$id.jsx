// routes/maintenance/$id.jsx
// Detailed view for a specific maintenance job.
// Features status updates (with actual cost prompt for completion), S3 upload for photos/invoices,
// note submission timeline, Awaab's Law countdown alerts, and sidebar link details.

import { useState } from "react";
import { Link, useLoaderData, useNavigation } from "react-router-dom";
import { redirect, data } from "react-router";
import { getUserFromRequest } from "../../utils/auth.server.js";
import { connect } from "../../config/db.server.js";
import { MaintenanceJob } from "../../models/MaintenanceJob.server.js";
import { fmtDate, fmtDateTime } from "../../utils/date.js";
import { Contractor } from "../../models/Contractor.server.js";
import { Document } from "../../models/document.server.js";
import { Note } from "../../models/note.server.js";
import { Tenancy } from "../../models/tenancy.server.js";
import { User } from "../../models/user.server.js";
import { recordStatusChange } from "../../utils/maintenance.server.js";
import { logContractorAssigned, logDocumentUploaded } from "../../utils/activityLog.server.js";
import Timeline from "../../components/timeline/Timeline.jsx";
import { fileToBuffer, buildS3Key, uploadToS3 } from "../../utils/s3.server.js";
import {
  Wrench,
  AlertTriangle,
  Calendar,
  DollarSign,
  User as UserIcon,
  ShieldCheck,
  FileImage,
  Clock,
  ArrowLeft,
  CheckCircle,
  FileText,
  Plus,
  Send,
  Loader2,
  Trash2,
} from "lucide-react";

export async function loader({ params, request }) {
  const user = await getUserFromRequest(request);
  if (!user) return redirect("/login");
  if (!user.agencyId) return redirect("/dashboard");

  await connect();

  // 1. Fetch Maintenance Job (Scoping to Agency)
  const job = await MaintenanceJob.findOne({
    _id: params.id,
    agencyId: user.agencyId,
    deleted: { $ne: true },
  })
    .populate("propertyId", "addressLine1 city postcode landlordId")
    .populate("contractorId", "name phone email trades")
    .lean();

  if (!job) throw new Response("Maintenance Job not found", { status: 404 });

  // 2. Fetch Landlord User profile
  const landlord = await User.findOne({
    _id: job.landlordId,
    agencyId: user.agencyId,
  })
    .select("title firstName lastName phone email")
    .lean();

  // 3. Fetch active tenancy for property to show tenant contacts
  const tenancy = await Tenancy.findOne({
    propertyId: job.propertyId?._id,
    agencyId: user.agencyId,
    status: "active",
  })
    .populate("tenantIds", "title firstName lastName phone email")
    .lean();

  // 4. Fetch related notes
  const notes = await Note.find({
    entityType: "maintenance_job",
    entityId: job._id,
    agencyId: user.agencyId,
    deleted: { $ne: true },
  })
    .populate("addedBy", "title firstName lastName")
    .sort({ createdAt: 1 })
    .lean();

  // 5. Fetch related documents
  const documents = await Document.find({
    entityType: "maintenance_job",
    entityId: job._id,
    agencyId: user.agencyId,
    deleted: false,
  })
    .populate("uploadedBy", "title firstName lastName")
    .sort({ createdAt: -1 })
    .lean();

  // 6. Fetch available contractors for reassign dropdown
  const contractors = await Contractor.find({
    agencyId: user.agencyId,
    status: "active",
    deleted: false,
  })
    .select("name trades")
    .sort({ name: 1 })
    .lean();

  return {
    job: {
      ...job,
      _id: job._id.toString(),
      propertyId: job.propertyId ? { ...job.propertyId, _id: job.propertyId._id.toString() } : null,
      contractorId: job.contractorId ? { ...job.contractorId, _id: job.contractorId._id.toString() } : null,
    },
    landlord: landlord ? { ...landlord, _id: landlord._id.toString() } : null,
    tenancy: tenancy ? {
      ...tenancy,
      _id: tenancy._id.toString(),
      tenantIds: tenancy.tenantIds.map(t => ({ ...t, _id: t._id.toString() })),
    } : null,
    documents: documents.map(d => ({
      ...d,
      _id: d._id.toString(),
      uploadedBy: d.uploadedBy ? { _id: d.uploadedBy._id.toString(), firstName: d.uploadedBy.firstName, lastName: d.uploadedBy.lastName } : null,
    })),
    notes: notes.map(n => ({
      ...n,
      _id: n._id.toString(),
      addedBy: n.addedBy ? { _id: n.addedBy._id.toString(), firstName: n.addedBy.firstName, lastName: n.addedBy.lastName } : null,
    })),
    contractors: contractors.map(c => ({ ...c, _id: c._id.toString() })),
    currentUser: {
      _id: (user.userId || user._id).toString(),
      name: `${user.title ? user.title + ' ' : ''}${user.firstName} ${user.lastName}`,
    },
    currentUserRole: user.roles?.[0] || "agent",
  };
}

export async function action({ params, request }) {
  const user = await getUserFromRequest(request);
  if (!user) return redirect("/login");
  if (!user.agencyId) return redirect("/dashboard");

  await connect();

  const fd = await request.formData();
  const intent = fd.get("intent");

  const job = await MaintenanceJob.findOne({
    _id: params.id,
    agencyId: user.agencyId,
  });
  if (!job) return data({ error: "Job not found" }, { status: 404 });

  // ─────────────────────────────────────────────────────────────────────────────
  // Action 1: Add Note
  // ─────────────────────────────────────────────────────────────────────────────
  if (intent === "add-note") {
    const text = fd.get("text")?.toString().trim();
    if (!text) return data({ error: "Note text cannot be empty" }, { status: 400 });

    await Note.create({
      agencyId: user.agencyId,
      entityType: "maintenance_job",
      entityId: job._id,
      text,
      addedBy: user.userId || user._id,
    });

    return { success: "Note added successfully." };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Action 2: Upload File / Document
  // ─────────────────────────────────────────────────────────────────────────────
  if (intent === "upload-file") {
    const file = fd.get("file");
    const documentType = fd.get("documentType") || "job_photo_before";

    if (!file || file.size === 0) {
      return data({ error: "No file selected or empty file." }, { status: 400 });
    }

    const buffer = await fileToBuffer(file);
    const s3Key = buildS3Key(user.agencyId, "maintenance_job", job._id.toString(), documentType, file.name);
    await uploadToS3(buffer, s3Key, file.type);

    const document = await Document.create({
      agencyId: user.agencyId,
      entityType: "maintenance_job",
      entityId: job._id,
      documentType,
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type,
      s3Key,
      uploadedBy: user.userId || user._id,
    });
    await logDocumentUploaded(
      { ...document.toObject(), docType: { key: documentType, name: documentType.replace(/_/g, " ") } },
      user
    );

    return { success: "Document uploaded successfully." };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Action 3: Update Status
  // ─────────────────────────────────────────────────────────────────────────────
  if (intent === "update-status") {
    const nextStatus = fd.get("status");
    if (!nextStatus) return data({ error: "Missing status parameter" }, { status: 400 });

    const updates = {};

    // Special logic for completing job: capture actual cost & optional contractor invoice
    if (nextStatus === "completed") {
      const actualCost = parseFloat(fd.get("actualCost"));
      if (isNaN(actualCost) || actualCost < 0) {
        return data({ error: "Valid actual cost is required to complete the job." }, { status: 400 });
      }
      updates.actualCost = actualCost;
      updates.completedDate = new Date();

      // If an invoice is supplied, upload it
      const invoiceFile = fd.get("invoiceFile");
      if (invoiceFile && invoiceFile.size > 0) {
        const buffer = await fileToBuffer(invoiceFile);
        const s3Key = buildS3Key(user.agencyId, "maintenance_job", job._id.toString(), "job_invoice", invoiceFile.name);
        await uploadToS3(buffer, s3Key, invoiceFile.type);

        const document = await Document.create({
          agencyId: user.agencyId,
          entityType: "maintenance_job",
          entityId: job._id,
          documentType: "job_invoice",
          fileName: invoiceFile.name,
          fileSize: invoiceFile.size,
          mimeType: invoiceFile.type,
          s3Key,
          uploadedBy: user.userId || user._id,
        });
        await logDocumentUploaded(
          {
            ...document.toObject(),
            docType: { key: "job_invoice", name: "Job Invoice" },
          },
          user
        );
      }
    }

    if (nextStatus === "closed") {
      updates.closedDate = new Date();
    }

    // Perform updates directly
    job.status = nextStatus;
    if (updates.actualCost !== undefined) job.actualCost = updates.actualCost;
    if (updates.completedDate !== undefined) job.completedDate = updates.completedDate;
    if (updates.closedDate !== undefined) job.closedDate = updates.closedDate;
    await job.save();

    await recordStatusChange(job, nextStatus, user);

    return { success: `Job status updated to ${nextStatus}.` };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Action 4: Assign Contractor
  // ─────────────────────────────────────────────────────────────────────────────
  if (intent === "assign-contractor") {
    const contractorId = fd.get("contractorId");
    if (!contractorId) return data({ error: "Please select a contractor" }, { status: 400 });

    job.contractorId = contractorId;
    job.status = "contractor_assigned";
    await job.save();

    const contractor = await Contractor.findOne({
      _id: contractorId,
      agencyId: user.agencyId,
      deleted: false,
    }).lean();
    await logContractorAssigned(job, contractor, user);

    return { success: "Contractor assigned successfully." };
  }

  return data({ error: "Unknown action intent." }, { status: 400 });
}

const STATUS_STEPS = [
  { value: "reported",            label: "Reported" },
  { value: "landlord_approval",   label: "Awaiting Landlord" },
  { value: "approved",            label: "Approved" },
  { value: "contractor_assigned", label: "Assigned" },
  { value: "in_progress",         label: "In Progress" },
  { value: "completed",           label: "Completed" },
  { value: "closed",              label: "Closed" },
];

const STATUS_BADGES = {
  reported:            "bg-slate-100 text-slate-700 border-slate-200",
  landlord_approval:   "bg-amber-100 text-amber-800 border-amber-200",
  approved:            "bg-blue-100 text-blue-700 border-blue-200",
  contractor_assigned: "bg-indigo-100 text-indigo-700 border-indigo-200",
  in_progress:         "bg-sky-100 text-sky-700 border-sky-200",
  completed:           "bg-emerald-100 text-emerald-700 border-emerald-200",
  closed:              "bg-green-100 text-green-800 border-green-200",
  cancelled:           "bg-rose-100 text-rose-700 border-rose-200",
  on_hold:             "bg-slate-100 text-slate-600 border-slate-200",
};

const CATEGORY_LABELS = {
  plumbing: "Plumbing", electrical: "Electrical", gas: "Gas", heating: "Heating",
  roofing: "Roofing", structural: "Structural", damp_mould: "Damp & Mould",
  pest_control: "Pest Control", doors_windows: "Doors & Windows", flooring: "Flooring",
  decorating: "Decorating", garden: "Garden", appliances: "Appliances",
  cleaning: "Cleaning", inspection: "Inspection", other: "Other",
};

export default function MaintenanceDetail() {
  const { job, landlord, tenancy, notes, documents, contractors, currentUser, currentUserRole } = useLoaderData();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const [noteText, setNoteText] = useState("");
  const [showCompleteForm, setShowCompleteForm] = useState(false);

  // Awaab's Law calculations
  let awaabsDeadlineDate = null;
  let awaabsCountdownDays = null;
  if (job.isAwaabsLaw && job.reportedDate) {
    // 14 days from reported date
    awaabsDeadlineDate = new Date(job.reportedDate);
    awaabsDeadlineDate.setDate(awaabsDeadlineDate.getDate() + 14);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffTime = awaabsDeadlineDate - today;
    awaabsCountdownDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  const isOverdue = !["closed", "cancelled"].includes(job.status) &&
    job.targetDate &&
    new Date(job.targetDate) < new Date();

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-4 md:p-6">
      
      {/* Breadcrumbs & Title */}
      <div className="border-b border-[#E2E8F0] pb-5 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <nav className="text-xs text-[#94A3B8] font-medium mb-1">
            <Link to="/maintenance" className="hover:text-[#2563EB] flex items-center gap-1">
              <ArrowLeft className="w-3.5 h-3.5" /> Back to Maintenance
            </Link>
          </nav>
          <div className="flex flex-wrap items-center gap-2 mt-1">
            <h1 className="text-xl font-bold tracking-tight text-[#1E293B]">
              Job Order {job.jobRef}
            </h1>
            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${STATUS_BADGES[job.status] || "bg-slate-100 text-slate-700"}`}>
              {job.status.replace(/_/g, " ").toUpperCase()}
            </span>
            <span className={`px-2 py-0.5 rounded text-[10px] font-bold border bg-blue-50 text-blue-700 border-blue-200`}>
              {job.priority.toUpperCase()}
            </span>
          </div>
          <p className="text-xs text-[#475569] mt-1.5 font-semibold">{job.title}</p>
        </div>

        {/* Action controls */}
        <div className="flex items-center gap-2">
          <Link
            to={`/maintenance/${job._id}/edit`}
            className="px-3 py-1.5 border border-[#E2E8F0] hover:bg-slate-50 text-xs font-semibold text-[#475569] rounded-lg transition"
          >
            Edit Job
          </Link>

          {!["closed", "cancelled"].includes(job.status) && (
            <form method="post">
              <input type="hidden" name="intent" value="update-status" />
              <button
                type="submit"
                name="status"
                value="on_hold"
                className="px-3 py-1.5 border border-[#E2E8F0] hover:bg-slate-50 text-xs font-semibold text-[#475569] rounded-lg transition"
              >
                Put On Hold
              </button>
            </form>
          )}

          {!["closed", "cancelled"].includes(job.status) && (
            <form method="post">
              <input type="hidden" name="intent" value="update-status" />
              <button
                type="submit"
                name="status"
                value="cancelled"
                className="px-3 py-1.5 border border-[#E2E8F0] hover:bg-red-50 text-xs font-semibold text-red-600 rounded-lg transition"
              >
                Cancel Job
              </button>
            </form>
          )}
        </div>
      </div>

      {/* Overdue Banner */}
      {isOverdue && (
        <div className="bg-red-50 border border-red-200 text-red-800 rounded-xl p-4 flex items-start gap-3 shadow-sm">
          <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5 shrink-0" />
          <div className="text-xs">
            <p className="font-bold">This Job Is Overdue</p>
            <p className="mt-0.5">Target completion date of {fmtDate(job.targetDate)} has passed. Please review urgently and update the job status.</p>
          </div>
        </div>
      )}

      {/* Landlord Approval Banner */}
      {job.status === "landlord_approval" && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
            <div className="text-xs">
              <p className="font-bold">Awaiting Landlord Approval</p>
              <p className="mt-0.5">This job is paused pending landlord confirmation. Once approved, the job can proceed to contractor assignment.</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <form method="post">
              <input type="hidden" name="intent" value="update-status" />
              <input type="hidden" name="status" value="approved" />
              <button type="submit" className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-sm transition">
                Record Approval
              </button>
            </form>
            <form method="post">
              <input type="hidden" name="intent" value="update-status" />
              <input type="hidden" name="status" value="cancelled" />
              <button type="submit" className="px-3.5 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold shadow-sm transition">
                Record Declined
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Awaab's Law Active Count Alert */}
      {job.isAwaabsLaw && !["closed", "cancelled"].includes(job.status) && (
        <div className="bg-orange-50 border border-orange-200 text-orange-800 rounded-xl p-4 flex items-start gap-3 shadow-sm">
          <AlertTriangle className="w-5 h-5 text-orange-600 mt-0.5 shrink-0" />
          <div className="text-xs space-y-1">
            <p className="font-bold">Awaab's Law Active Case</p>
            <p>
              This job involves Damp or Mould. Statutory guidelines require an inspection and action plan completed within 14 days of receipt.
              {" "}
              <span className="font-bold underline">
                Investigation Deadline: {fmtDate(awaabsDeadlineDate)}
                {" "}
                ({awaabsCountdownDays >= 0 ? `${awaabsCountdownDays} days remaining` : `${Math.abs(awaabsCountdownDays)} days overdue`})
              </span>
            </p>
          </div>
        </div>
      )}

      {/* Status Progress Step Indicator */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-sm">
        <h2 className="text-xs font-bold text-[#1E293B] uppercase tracking-wider mb-4">Workflow Progress</h2>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold text-[#475569]">
            {STATUS_STEPS.map((step, idx) => {
              const isActive = job.status === step.value;
              const isPassed = STATUS_STEPS.findIndex(s => s.value === job.status) > idx;

              return (
                <div key={step.value} className="flex items-center gap-1.5">
                  {idx > 0 && <span className="text-[#CBD5E1]">›</span>}
                  <span
                    className={`px-2 py-0.5 rounded ${
                      isActive ? "bg-[#EFF6FF] text-[#2563EB] ring-1 ring-[#2563EB]/25" : isPassed ? "text-emerald-600" : "text-[#94A3B8]"
                    }`}
                  >
                    {step.label}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Quick status transition actions */}
          <div className="flex items-center gap-2">
            {job.status === "reported" && (
              <>
                {job.requiresLandlordApproval && (
                  <form method="post">
                    <input type="hidden" name="intent" value="update-status" />
                    <input type="hidden" name="status" value="landlord_approval" />
                    <button type="submit" className="px-3.5 py-1.5 bg-[#2563EB] hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-sm transition">
                      Request Landlord Approval
                    </button>
                  </form>
                )}
                <form method="post">
                  <input type="hidden" name="intent" value="update-status" />
                  <input type="hidden" name="status" value="approved" />
                  <button type="submit" className="px-3.5 py-1.5 bg-slate-900 hover:bg-black text-white rounded-lg text-xs font-bold shadow-sm transition">
                    Approve Job
                  </button>
                </form>
              </>
            )}

            {job.status === "landlord_approval" && (
              <form method="post">
                <input type="hidden" name="intent" value="update-status" />
                <input type="hidden" name="status" value="approved" />
                <button type="submit" className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-sm transition">
                  Mark Approved (Landlord Confirmed)
                </button>
              </form>
            )}

            {job.status === "approved" && !job.contractorId && (
              <div className="text-xs text-[#94A3B8] italic flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5" /> Assign a contractor below to advance to Assigned.
              </div>
            )}

            {job.status === "approved" && job.contractorId && (
              <form method="post">
                <input type="hidden" name="intent" value="update-status" />
                <input type="hidden" name="status" value="contractor_assigned" />
                <button type="submit" className="px-3.5 py-1.5 bg-slate-900 hover:bg-black text-white rounded-lg text-xs font-bold shadow-sm transition">
                  Confirm Assign Contractor
                </button>
              </form>
            )}

            {job.status === "contractor_assigned" && (
              <form method="post">
                <input type="hidden" name="intent" value="update-status" />
                <input type="hidden" name="status" value="in_progress" />
                <button type="submit" className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-sm transition">
                  Start Work (In Progress)
                </button>
              </form>
            )}

            {job.status === "in_progress" && !showCompleteForm && (
              <button
                onClick={() => setShowCompleteForm(true)}
                className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-sm transition"
              >
                Mark Job Resolved / Completed
              </button>
            )}

            {job.status === "completed" && (
              <form method="post">
                <input type="hidden" name="intent" value="update-status" />
                <input type="hidden" name="status" value="closed" />
                <button type="submit" className="px-3.5 py-1.5 bg-slate-900 hover:bg-black text-white rounded-lg text-xs font-bold shadow-sm transition">
                  Close Case (Archive)
                </button>
              </form>
            )}
          </div>
        </div>

        {/* Complete Form Modal Content inline */}
        {showCompleteForm && (
          <div className="mt-4 p-4 border border-[#EFF6FF] bg-[#EFF6FF]/40 rounded-xl space-y-3">
            <h3 className="text-xs font-bold text-[#1E293B] uppercase tracking-wider flex items-center gap-1.5">
              <CheckCircle className="w-4 h-4 text-emerald-600" /> Complete Work Details
            </h3>
            <form method="post" encType="multipart/form-data" className="space-y-4" onSubmit={() => setShowCompleteForm(false)}>
              <input type="hidden" name="intent" value="update-status" />
              <input type="hidden" name="status" value="completed" />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[#475569] mb-1">Actual Completed Cost (£) *</label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-xs text-[#94A3B8] font-bold">£</span>
                    <input
                      name="actualCost"
                      type="number"
                      min="0"
                      step="0.01"
                      required
                      defaultValue={job.estimatedCost || ""}
                      className="pl-7 w-full text-xs border border-[#E2E8F0] rounded-lg px-3 py-2 text-[#1E293B] bg-white focus:outline-none"
                      placeholder="0.00"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#475569] mb-1">Upload Invoice (PDF, JPG, PNG)</label>
                  <input
                    type="file"
                    name="invoiceFile"
                    accept="application/pdf,image/jpeg,image/png"
                    className="w-full text-xs"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-sm transition"
                >
                  Confirm Resolution
                </button>
                <button
                  type="button"
                  onClick={() => setShowCompleteForm(false)}
                  className="px-3 py-2 text-xs font-semibold text-[#475569] hover:text-[#1E293B]"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}
      </div>

      {/* Main Grid: Details + Sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left 2 Columns */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* A — Job Details Card */}
          <div className="hidden">
            <h2 className="text-xs font-bold text-[#1E293B] uppercase tracking-wider border-b border-[#F1F5F9] pb-2">
              Work Order Details
            </h2>

            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <span className="block text-[10px] uppercase font-bold text-[#94A3B8] tracking-wider">Category</span>
                <span className="font-semibold text-[#1E293B] mt-0.5 block">
                  {CATEGORY_LABELS[job.category] || job.category}
                </span>
              </div>
              <div>
                <span className="block text-[10px] uppercase font-bold text-[#94A3B8] tracking-wider">Location / Area</span>
                <span className="font-semibold text-[#1E293B] mt-0.5 block">{job.location || "—"}</span>
              </div>
              <div>
                <span className="block text-[10px] uppercase font-bold text-[#94A3B8] tracking-wider">Reported Date</span>
                <span className="font-semibold text-[#1E293B] mt-0.5 block">
                  {fmtDate(job.reportedDate)}
                </span>
              </div>
              <div>
                <span className="block text-[10px] uppercase font-bold text-[#94A3B8] tracking-wider">Target Completion Date</span>
                <span className={`font-semibold mt-0.5 block ${isOverdue ? "text-red-600" : "text-[#1E293B]"}`}>
                  {fmtDate(job.targetDate)}
                  {isOverdue && <span className="ml-1 text-[9px] font-bold bg-red-100 text-red-700 px-1 py-0.2 rounded uppercase">Overdue</span>}
                </span>
              </div>
              <div>
                <span className="block text-[10px] uppercase font-bold text-[#94A3B8] tracking-wider">Estimated Cost</span>
                <span className="font-semibold text-[#1E293B] mt-0.5 block">
                  {job.estimatedCost != null ? `£${job.estimatedCost.toLocaleString("en-GB")}` : "Not estimated"}
                </span>
              </div>
              <div>
                <span className="block text-[10px] uppercase font-bold text-[#94A3B8] tracking-wider">Actual Completed Cost</span>
                <span className="font-semibold text-emerald-600 mt-0.5 block">
                  {job.actualCost != null ? `£${job.actualCost.toLocaleString("en-GB")}` : "—"}
                </span>
              </div>
              <div>
                <span className="block text-[10px] uppercase font-bold text-[#94A3B8] tracking-wider">Cost Responsibility</span>
                <span className="font-semibold text-[#1E293B] mt-0.5 block capitalize">{job.costResponsibility}</span>
              </div>
              <div>
                <span className="block text-[10px] uppercase font-bold text-[#94A3B8] tracking-wider">Reported By</span>
                <span className="font-semibold text-[#1E293B] mt-0.5 block capitalize">{job.reportedBy}</span>
              </div>
            </div>

            {job.description && (
              <div className="pt-2 border-t border-[#F1F5F9]">
                <span className="block text-[10px] uppercase font-bold text-[#94A3B8] tracking-wider mb-1">Issue Description</span>
                <p className="text-xs text-[#475569] leading-relaxed bg-slate-50 border border-[#F1F5F9] rounded-lg p-3 whitespace-pre-wrap">
                  {job.description}
                </p>
              </div>
            )}
          </div>

          {/* B — Photo & File Attachments */}
          <Timeline
            entityType="maintenance_job"
            entityId={job._id}
            notes={notes}
            hasMore={false}
            currentUserId={currentUser._id}
            currentUserRole={currentUserRole}
            showComposer={!["closed", "cancelled"].includes(job.status)}
          />

          <div className="hidden">
            <h2 className="text-xs font-bold text-[#1E293B] uppercase tracking-wider border-b border-[#F1F5F9] pb-2 flex items-center justify-between">
              <span>Attachments &amp; Files</span>
              <span className="text-[10px] text-[#94A3B8] font-bold">{documents.length} files</span>
            </h2>

            {documents.length === 0 ? (
              <p className="text-xs text-[#94A3B8] italic">No photos or invoices uploaded yet.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {documents.map(doc => {
                  const isImage = ["image/jpeg", "image/png", "image/webp"].includes(doc.mimeType);
                  return (
                    <div key={doc._id} className="border border-[#E2E8F0] rounded-lg p-3 flex items-start justify-between gap-3 bg-slate-50">
                      <div className="flex items-center gap-2 overflow-hidden">
                        {isImage ? (
                          <div className="w-10 h-10 rounded overflow-hidden border border-[#CBD5E1] shrink-0 bg-white">
                            <img
                              src={`/documents/s3-download?key=${encodeURIComponent(doc.s3Key)}`}
                              alt={doc.fileName}
                              className="w-full h-full object-cover"
                            />
                          </div>
                        ) : (
                          <div className="w-10 h-10 rounded border border-[#CBD5E1] shrink-0 bg-white flex items-center justify-center text-[#94A3B8]">
                            <FileText className="w-5 h-5" />
                          </div>
                        )}
                        <div className="text-xs overflow-hidden">
                          <p className="font-bold text-[#1E293B] truncate" title={doc.fileName}>{doc.fileName}</p>
                          <p className="text-[10px] text-[#94A3B8] mt-0.5 capitalize">
                            {doc.documentType.replace(/_/g, " ")}
                          </p>
                        </div>
                      </div>
                      <a
                        href={`/documents/s3-download?key=${encodeURIComponent(doc.s3Key)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-[#2563EB] hover:underline font-semibold shrink-0"
                      >
                        View
                      </a>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Quick Upload Form */}
            {!["closed", "cancelled"].includes(job.status) && (
              <form method="post" encType="multipart/form-data" className="pt-3 border-t border-[#F1F5F9] flex flex-col sm:flex-row items-center gap-3">
                <input type="hidden" name="intent" value="upload-file" />
                <div className="w-full sm:w-auto">
                  <select name="documentType" className="text-xs border border-[#E2E8F0] rounded-lg px-2.5 py-1.5 bg-white text-[#1E293B]">
                    <option value="job_photo_before">Before Photo</option>
                    <option value="job_photo_after">After Photo</option>
                    <option value="job_invoice">Invoice / Quote</option>
                    <option value="job_safety_cert">Safety Certificate</option>
                  </select>
                </div>
                <div className="w-full flex items-center gap-2">
                  <input type="file" name="file" className="text-xs block w-full" required />
                  <button type="submit" className="px-4 py-1.5 bg-slate-900 text-white rounded-lg text-xs font-semibold hover:bg-black shrink-0 transition">
                    Upload
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* C — Notes Timeline */}
          <div className="hidden">
            <h2 className="text-xs font-bold text-[#1E293B] uppercase tracking-wider border-b border-[#F1F5F9] pb-2">
              Communication &amp; Audit Log
            </h2>

            {/* Notes List */}
            <div className="space-y-4 max-h-[300px] overflow-y-auto pr-1">
              {notes.length === 0 ? (
                <p className="text-xs text-[#94A3B8] italic">No communication logs recorded yet.</p>
              ) : (
                notes.map(note => (
                  <div key={note._id} className="text-xs bg-slate-50 border border-[#F1F5F9] rounded-lg p-3">
                    <div className="flex items-center justify-between gap-2 border-b border-[#F1F5F9] pb-1.5 mb-1.5 text-[10px] text-[#94A3B8] font-bold">
                      <span>{note.addedBy ? `${note.addedBy.title ? note.addedBy.title + ' ' : ''}${note.addedBy.firstName} ${note.addedBy.lastName}` : "System Audit"}</span>
                      <span>{fmtDateTime(note.createdAt)}</span>
                    </div>
                    <p className="text-[#475569] leading-relaxed whitespace-pre-wrap">{note.text}</p>
                  </div>
                ))
              )}
            </div>

            {/* Note Post Form */}
            {!["closed", "cancelled"].includes(job.status) && (
              <form
                method="post"
                onSubmit={() => setNoteText("")}
                className="pt-3 border-t border-[#F1F5F9] flex gap-2"
              >
                <input type="hidden" name="intent" value="add-note" />
                <input
                  type="text"
                  name="text"
                  value={noteText}
                  onChange={e => setNoteText(e.target.value)}
                  className="flex-1 text-xs border border-[#E2E8F0] rounded-lg px-3 py-2 text-[#1E293B] focus:outline-none"
                  placeholder="Post an update or audit entry to this job..."
                  required
                />
                <button type="submit" className="px-4 py-2 bg-slate-900 hover:bg-black text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5 shrink-0">
                  <Send className="w-3.5 h-3.5" /> Post
                </button>
              </form>
            )}
          </div>

        </div>

        {/* Right Sidebar */}
        <div className="space-y-6">
          
          {/* Property info */}
          <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-sm space-y-3.5">
            <h3 className="text-xs font-bold text-[#1E293B] uppercase tracking-wider">Property Details</h3>
            {job.propertyId ? (
              <div className="text-xs space-y-2">
                <p className="font-bold text-[#1E293B]">{job.propertyId.addressLine1}</p>
                <p className="text-[#475569]">{job.propertyId.city}, {job.propertyId.postcode}</p>
                <div className="pt-2">
                  <Link
                    to={`/properties/${job.propertyId._id}`}
                    className="text-[#2563EB] hover:underline font-semibold"
                  >
                    View Property Profile →
                  </Link>
                </div>
              </div>
            ) : (
              <p className="text-xs text-[#94A3B8] italic">No property assigned</p>
            )}
          </div>

          {/* Tenants Info */}
          <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-sm space-y-3.5">
            <h3 className="text-xs font-bold text-[#1E293B] uppercase tracking-wider">Tenants</h3>
            {tenancy && tenancy.tenantIds?.length > 0 ? (
              <div className="space-y-3 text-xs">
                {tenancy.tenantIds.map(t => (
                  <div key={t._id} className="border-b border-[#F1F5F9] pb-2 last:border-0 last:pb-0">
                    <p className="font-bold text-[#1E293B]">{t.title ? t.title + ' ' : ''}{t.firstName} {t.lastName}</p>
                    {t.phone && <p className="text-[#475569] mt-0.5">Ph: {t.phone}</p>}
                    {t.email && <p className="text-[#475569] mt-0.5">Email: {t.email}</p>}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-[#94A3B8] italic">Vacant (no active tenancy)</p>
            )}
          </div>

          {/* Landlord details */}
          <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-sm space-y-3.5">
            <h3 className="text-xs font-bold text-[#1E293B] uppercase tracking-wider">Landlord Details</h3>
            {landlord ? (
              <div className="text-xs space-y-2">
                <p className="font-bold text-[#1E293B]">{landlord.title ? landlord.title + ' ' : ''}{landlord.firstName} {landlord.lastName}</p>
                {landlord.phone && <p className="text-[#475569]">Ph: {landlord.phone}</p>}
                {landlord.email && <p className="text-[#475569] truncate">Email: {landlord.email}</p>}
                <div className="pt-2">
                  <Link
                    to={`/landlords/${landlord._id}`}
                    className="text-[#2563EB] hover:underline font-semibold"
                  >
                    View Landlord Profile →
                  </Link>
                </div>
              </div>
            ) : (
              <p className="text-xs text-[#94A3B8] italic">No landlord profile found</p>
            )}
          </div>

          {/* Contractor details */}
          <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-sm space-y-3.5">
            <h3 className="text-xs font-bold text-[#1E293B] uppercase tracking-wider">Assigned Contractor</h3>
            {job.contractorId ? (
              <div className="text-xs space-y-2">
                <p className="font-bold text-[#1E293B]">{job.contractorId.name}</p>
                {job.contractorId.phone && <p className="text-[#475569]">Ph: {job.contractorId.phone}</p>}
                {job.contractorId.email && <p className="text-[#475569] truncate">Email: {job.contractorId.email}</p>}
                {job.contractorId.trades?.length > 0 && (
                  <p className="text-[#94A3B8] text-[10px] font-semibold uppercase">
                    Trades: {job.contractorId.trades.join(", ")}
                  </p>
                )}
                <div className="pt-2 flex gap-3">
                  <Link
                    to={`/maintenance/contractors/${job.contractorId._id}`}
                    className="text-[#2563EB] hover:underline font-semibold"
                  >
                    Contractor Profile →
                  </Link>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-[#94A3B8] italic">No contractor assigned.</p>
                
                {!["closed", "cancelled"].includes(job.status) && (
                  <form method="post" className="space-y-2 pt-2 border-t border-[#F1F5F9]">
                    <input type="hidden" name="intent" value="assign-contractor" />
                    <select name="contractorId" className="w-full text-[11px] border border-[#E2E8F0] rounded p-1.5 bg-white text-[#1E293B]">
                      <option value="">-- Assign Contractor --</option>
                      {contractors.map(c => (
                        <option key={c._id} value={c._id}>{c.name}</option>
                      ))}
                    </select>
                    <button type="submit" className="w-full text-center px-3 py-1.5 bg-slate-900 hover:bg-black text-white rounded text-[11px] font-bold transition">
                      Assign
                    </button>
                  </form>
                )}
              </div>
            )}
          </div>

        </div>

      </div>

    </div>
  );
}

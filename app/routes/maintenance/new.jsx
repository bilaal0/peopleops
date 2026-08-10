// routes/maintenance/new.jsx
// Create a new maintenance job.
// Features form sections A-F with property selector dynamic fetching,
// damp_mould warnings, auto priority/deadline adjustments, S3 uploads.

import { useState, useEffect } from "react";
import { Link, useLoaderData, useActionData, useNavigation } from "react-router-dom";
import { redirect, data } from "react-router";
import UKDateInput from "../../components/ui/UKDateInput.jsx";
import { getUserFromRequest } from "../../utils/auth.server.js";
import { connect } from "../../config/db.server.js";
import { Property } from "../../models/property.server.js";
import { Contractor } from "../../models/Contractor.server.js";
import { MaintenanceJob } from "../../models/MaintenanceJob.server.js";
import { Document } from "../../models/document.server.js";
import { Tenancy } from "../../models/tenancy.server.js";
import {
  generateJobRef,
  applyAwaabsLawFlags,
  applyLandlordApprovalFlag,
  calculateTargetDate,
} from "../../utils/maintenance.server.js";
import { logContractorAssigned, logDocumentUploaded, logMaintenanceCreated } from "../../utils/activityLog.server.js";
import { fileToBuffer, buildS3Key, uploadToS3 } from "../../utils/s3.server.js";
import {
  Wrench,
  AlertTriangle,
  Calendar,
  DollarSign,
  User,
  ShieldCheck,
  FileImage,
  Info,
  Loader2,
} from "lucide-react";

export async function loader({ request }) {
  const user = await getUserFromRequest(request);
  if (!user) return redirect("/login");
  if (!user.organizationId) return redirect("/dashboard");

  await connect();

  // Query parameter to pre-select property
  const url = new URL(request.url);
  const preselectedPropertyId = url.searchParams.get("propertyId") || "";
  const preselectedContractorId = url.searchParams.get("contractorId") || "";

  // Get all active, non-deleted properties
  const properties = await Property.find({
    organizationId: user.organizationId,
    deleted: { $ne: true },
  })
    .select("addressLine1 city postcode landlordId")
    .sort({ addressLine1: 1 })
    .lean();

  // Get all active, non-deleted contractors
  const contractors = await Contractor.find({
    organizationId: user.organizationId,
    status: "active",
    deleted: false,
  })
    .select("name trades isPreferred")
    .sort({ isPreferred: -1, name: 1 })
    .lean();

  return {
    properties: properties.map(p => ({ ...p, _id: p._id.toString(), landlordId: p.landlordId.toString() })),
    contractors: contractors.map(c => ({ ...c, _id: c._id.toString() })),
    preselectedPropertyId,
    preselectedContractorId,
  };
}

export async function action({ request }) {
  const user = await getUserFromRequest(request);
  if (!user) return redirect("/login");
  if (!user.organizationId) return redirect("/dashboard");

  await connect();

  const formData = await request.formData();
  const get = key => formData.get(key)?.toString().trim() || null;
  const getNum = key => {
    const val = parseFloat(formData.get(key));
    return isNaN(val) ? null : val;
  };

  const propertyId = get("propertyId");
  const category = get("category");
  const title = get("title");
  const description = get("description");
  const location = get("location");
  const priority = get("priority") || "routine";
  const reportedBy = get("reportedBy") || "agent";
  const reportedDateStr = get("reportedDate");
  const contractorId = get("contractorId");
  const estimatedCost = getNum("estimatedCost");
  const costResponsibility = get("costResponsibility") || "landlord";
  const customTargetDateStr = get("targetDate");
  const scheduledDateStr = get("scheduledDate");
  const notes = get("notes");

  // Validate required fields
  const errors = {};
  if (!propertyId) errors.propertyId = "Property is required.";
  if (!category) errors.category = "Category is required.";
  if (!title) errors.title = "Title is required.";

  if (Object.keys(errors).length > 0) {
    return data({ errors, values: Object.fromEntries(formData) }, { status: 400 });
  }

  // Get property to retrieve landlordId
  const property = await Property.findOne({
    _id: propertyId,
    organizationId: user.organizationId,
  }).lean();

  if (!property) {
    return data({ errors: { propertyId: "Property not found." } }, { status: 404 });
  }

  // Get active tenancy to link
  const activeTenancy = await Tenancy.findOne({
    propertyId: property._id,
    organizationId: user.organizationId,
    status: "active",
  }).lean();

  const reportedDate = reportedDateStr ? new Date(reportedDateStr) : new Date();

  // Suggest/apply target date based on priority
  let targetDate = customTargetDateStr ? new Date(customTargetDateStr) : calculateTargetDate(priority, reportedDate);

  // Generate unique Job Ref sequential per organization
  const jobRef = await generateJobRef(user.organizationId);

  // Compile job creation details
  let jobData = {
    organizationId: user.organizationId,
    jobRef,
    propertyId,
    landlordId: property.landlordId.toString(),
    category,
    title,
    description,
    location,
    priority,
    reportedBy,
    reportedDate,
    targetDate,
    status: "reported",
    costResponsibility,
    notes,
    createdBy: user.userId || user._id,
  };

  if (activeTenancy) {
    jobData.tenancyId = activeTenancy._id.toString();
  }

  if (scheduledDateStr) {
    jobData.scheduledDate = new Date(scheduledDateStr);
  }

  // If contractor is assigned, update status and assign
  if (contractorId) {
    jobData.contractorId = contractorId;
    jobData.status = "contractor_assigned";
  }

  // Apply estimated cost
  if (estimatedCost != null) {
    jobData.estimatedCost = estimatedCost;
    // Apply landlord approval check (Rule R5: default threshold is £500)
    jobData = applyLandlordApprovalFlag(jobData, 500);
  }

  // Apply Awaab's Law category logic (Rule R3)
  jobData = applyAwaabsLawFlags(jobData);

  // Create the job record
  const job = await MaintenanceJob.create(jobData);

  await logMaintenanceCreated(job, user);
  await logMaintenanceCreated(job, user, "property", property._id);
  if (activeTenancy) {
    await logMaintenanceCreated(job, user, "tenancy", activeTenancy._id);
  }

  if (contractorId) {
    const contractor = await Contractor.findOne({
      _id: contractorId,
      organizationId: user.organizationId,
      deleted: false,
    }).lean();
    await logContractorAssigned(job, contractor, user);
  }

  // Handle Photo Uploads (Rule R5: document type is job_photo_before)
  const files = formData.getAll("photos");
  for (const file of files) {
    if (file && file.size > 0) {
      const buffer = await fileToBuffer(file);
      const s3Key = buildS3Key(user.organizationId, "maintenance_job", job._id.toString(), "job_photo_before", file.name);
      await uploadToS3(buffer, s3Key, file.type);

      await Document.create({
        organizationId: user.organizationId,
        entityType: "maintenance_job",
        entityId: job._id,
        documentType: "job_photo_before",
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
        s3Key,
        uploadedBy: user.userId || user._id,
      });

      await logDocumentUploaded(
        {
          organizationId: user.organizationId,
          entityType: "maintenance_job",
          entityId: job._id,
          docType: { key: "job_photo_before", name: "Job Photo Before" },
          fileName: file.name,
          s3Key,
          fileSize: file.size,
          mimeType: file.type,
          uploadedBy: user.userId || user._id,
        },
        user
      );
    }
  }

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

export default function MaintenanceNew() {
  const { properties, contractors, preselectedPropertyId, preselectedContractorId } = useLoaderData();
  const actionData = useActionData();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const [selectedPropertyId, setSelectedPropertyId] = useState(preselectedPropertyId);
  const [propertyDetails, setPropertyDetails] = useState(null);
  const [loadingProperty, setLoadingProperty] = useState(false);

  const [category, setCategory] = useState("");
  const [priority, setPriority] = useState("routine");
  const [estimatedCost, setEstimatedCost] = useState("");

  // Fetch active tenancy and landlord info on selection
  useEffect(() => {
    if (!selectedPropertyId) {
      setPropertyDetails(null);
      return;
    }

    setLoadingProperty(true);
    fetch(`/api/maintenance/property-info?propertyId=${selectedPropertyId}`)
      .then(res => res.json())
      .then(data => {
        if (!data.error) {
          setPropertyDetails(data);
        } else {
          setPropertyDetails(null);
        }
      })
      .catch(() => setPropertyDetails(null))
      .finally(() => setLoadingProperty(false));
  }, [selectedPropertyId]);

  // Handle category damp & mould changes to auto-upgrade priority to urgent
  useEffect(() => {
    if (category === "damp_mould") {
      setPriority("urgent");
    }
  }, [category]);

  return (
    <div className="space-y-6 max-w-4xl mx-auto p-4 md:p-6">
      {/* Header */}
      <div className="border-b border-[#E2E8F0] pb-5">
        <nav className="text-xs text-[#94A3B8] font-medium mb-1">
          <Link to="/maintenance" className="hover:text-[#2563EB]">Maintenance</Link>
          <span className="mx-2">›</span>
          <span className="text-[#1E293B]">Log Job</span>
        </nav>
        <h1 className="text-xl font-bold tracking-tight text-[#1E293B] flex items-center gap-2">
          <Wrench className="w-5 h-5 text-[#94A3B8]" />
          Log Maintenance Job
        </h1>
      </div>

      {actionData?.errors?.general && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-xs font-semibold">
          {actionData.errors.general}
        </div>
      )}

      <form method="post" encType="multipart/form-data" className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Form Sections */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* A — Property Details */}
          <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-sm space-y-4">
            <h2 className="text-xs font-bold text-[#1E293B] uppercase tracking-wider border-b border-[#F1F5F9] pb-2 flex items-center gap-2">
              <span className="flex items-center justify-center w-5 h-5 rounded-full bg-slate-100 text-slate-700 text-[10px]">A</span>
              Property &amp; Links
            </h2>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-[#475569] mb-1">Select Property *</label>
                <select
                  name="propertyId"
                  value={selectedPropertyId}
                  onChange={e => setSelectedPropertyId(e.target.value)}
                  required
                  className={inputCls}
                >
                  <option value="">-- Select Property --</option>
                  {properties.map(p => (
                    <option key={p._id} value={p._id}>
                      {p.addressLine1}, {p.city} ({p.postcode})
                    </option>
                  ))}
                </select>
                {actionData?.errors?.propertyId && (
                  <p className="text-red-500 text-[10px] mt-1 font-semibold">{actionData.errors.propertyId}</p>
                )}
              </div>

              {loadingProperty && (
                <div className="flex items-center gap-2 text-xs text-[#94A3B8] pt-1">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Retrieving active tenancy &amp; landlord details...
                </div>
              )}

              {propertyDetails && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 border border-[#F1F5F9] rounded-lg p-3 text-xs">
                  <div>
                    <span className="block text-[10px] uppercase font-bold text-[#94A3B8] tracking-wide">Landlord</span>
                    <span className="font-semibold text-[#1E293B] flex items-center gap-1.5 mt-0.5">
                      <User className="w-3.5 h-3.5 text-[#94A3B8]" /> {propertyDetails.landlordName}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[10px] uppercase font-bold text-[#94A3B8] tracking-wide">Tenancy</span>
                    {propertyDetails.tenancyId ? (
                      <span className="font-semibold text-[#1E293B] flex items-center gap-1.5 mt-0.5">
                        <ShieldCheck className="w-3.5 h-3.5 text-green-600" /> Tenanted ({propertyDetails.tenantNames})
                      </span>
                    ) : (
                      <span className="text-[#94A3B8] font-medium flex items-center gap-1.5 mt-0.5">
                        <Info className="w-3.5 h-3.5 text-[#CBD5E1]" /> No active tenancy (Vacant)
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* B — Job Details */}
          <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-sm space-y-4">
            <h2 className="text-xs font-bold text-[#1E293B] uppercase tracking-wider border-b border-[#F1F5F9] pb-2 flex items-center gap-2">
              <span className="flex items-center justify-center w-5 h-5 rounded-full bg-slate-100 text-slate-700 text-[10px]">B</span>
              Job Details
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-[#475569] mb-1">Category *</label>
                <select
                  name="category"
                  value={category}
                  onChange={e => setCategory(e.target.value)}
                  required
                  className={inputCls}
                >
                  <option value="">-- Select Category --</option>
                  {CATEGORIES.map(cat => (
                    <option key={cat.value} value={cat.value}>{cat.label}</option>
                  ))}
                </select>
                {actionData?.errors?.category && (
                  <p className="text-red-500 text-[10px] mt-1 font-semibold">{actionData.errors.category}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#475569] mb-1">Location / Area</label>
                <input
                  name="location"
                  type="text"
                  className={inputCls}
                  placeholder="e.g. Kitchen, Rear garden"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-[#475569] mb-1">Title *</label>
                <input
                  name="title"
                  type="text"
                  required
                  className={inputCls}
                  placeholder="e.g. Electric shower failing to heat water"
                />
                {actionData?.errors?.title && (
                  <p className="text-red-500 text-[10px] mt-1 font-semibold">{actionData.errors.title}</p>
                )}
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-[#475569] mb-1">Description / Instructions</label>
                <textarea
                  name="description"
                  rows={4}
                  className={inputCls}
                  placeholder="Provide details about the issue and what needs resolving..."
                />
              </div>
            </div>

            {/* damp_mould Warning */}
            {category === "damp_mould" && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3.5 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
                <div className="text-xs text-amber-800 space-y-1">
                  <p className="font-bold">Awaab's Law Regulations Active</p>
                  <p>Selecting damp and mould auto-flags this job under Awaab's Law rules. A statutory investigation must begin within 14 days and the job priority has been set to Urgent.</p>
                </div>
              </div>
            )}
          </div>

          {/* F — Notes & Photos */}
          <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-sm space-y-4">
            <h2 className="text-xs font-bold text-[#1E293B] uppercase tracking-wider border-b border-[#F1F5F9] pb-2 flex items-center gap-2">
              <span className="flex items-center justify-center w-5 h-5 rounded-full bg-slate-100 text-slate-700 text-[10px]">F</span>
              Notes &amp; Photos
            </h2>

            <div>
              <label className="block text-xs font-semibold text-[#475569] mb-1">Job Notes</label>
              <textarea
                name="notes"
                rows={3}
                className={inputCls}
                placeholder="Internal notes or additional details..."
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#475569] mb-1.5">Upload Photos</label>
              <div className="border-2 border-dashed border-[#E2E8F0] hover:border-[#2563EB] rounded-xl p-6 text-center cursor-pointer transition">
                <input
                  type="file"
                  name="photos"
                  multiple
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  id="photo-upload"
                  onChange={e => {
                    const count = e.target.files.length;
                    const el = document.getElementById("upload-label");
                    if (el) el.innerText = count > 0 ? `${count} photo(s) selected` : "Drag or click to choose photos";
                  }}
                />
                <label htmlFor="photo-upload" className="cursor-pointer block">
                  <FileImage className="w-8 h-8 text-[#94A3B8] mx-auto mb-2 opacity-50" />
                  <span id="upload-label" className="text-xs font-bold text-[#475569]">Drag or click to choose photos</span>
                  <span className="block text-[10px] text-[#94A3B8] mt-1">JPG, PNG, WEBP (Max 10MB per file)</span>
                </label>
              </div>
            </div>
          </div>

        </div>

        {/* Right 1 Col: Parameters & Meta */}
        <div className="space-y-6">

          {/* C — Priority & Dates */}
          <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-sm space-y-4">
            <h2 className="text-xs font-bold text-[#1E293B] uppercase tracking-wider border-b border-[#F1F5F9] pb-2 flex items-center gap-2">
              <span className="flex items-center justify-center w-5 h-5 rounded-full bg-slate-100 text-slate-700 text-[10px]">C</span>
              Priority &amp; Dates
            </h2>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-[#475569] mb-2">Priority Level</label>
                <div className="space-y-2">
                  {[
                    { value: "emergency", label: "Emergency", desc: "Gas, flood, heating loss (24h)", badge: "bg-red-100 border-red-300 text-red-700" },
                    { value: "urgent",    label: "Urgent",    desc: "Boiler fail, hot water loss (5d)", badge: "bg-amber-100 border-amber-300 text-amber-700" },
                    { value: "routine",   label: "Routine",   desc: "Leaks, broken locks, etc (28d)", badge: "bg-blue-100 border-blue-300 text-blue-700" },
                    { value: "planned",   label: "Planned",   desc: "Inspections, certificates", badge: "bg-slate-100 border-slate-300 text-slate-700" },
                  ].map(p => (
                    <label
                      key={p.value}
                      className={`flex items-start gap-2.5 p-2 rounded-lg border cursor-pointer transition ${
                        priority === p.value ? "bg-[#EFF6FF] border-[#2563EB]" : "border-[#E2E8F0] hover:bg-slate-50"
                      }`}
                    >
                      <input
                        type="radio"
                        name="priority"
                        value={p.value}
                        checked={priority === p.value}
                        onChange={e => setPriority(e.target.value)}
                        disabled={category === "damp_mould" && p.value === "routine"}
                        className="mt-1 text-[#2563EB] focus:ring-[#2563EB]"
                      />
                      <div>
                        <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold ${p.badge}`}>
                          {p.label}
                        </span>
                        <span className="block text-[10px] text-[#94A3B8] mt-0.5">{p.desc}</span>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#475569] mb-1">Reported By</label>
                <select name="reportedBy" className={inputCls}>
                  <option value="agent">Agent / Staff</option>
                  <option value="tenant">Tenant</option>
                  <option value="landlord">Landlord</option>
                  <option value="inspection">Inspection Finding</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#475569] mb-1">Reported Date</label>
                <UKDateInput
                  name="reportedDate"
                  defaultValue={new Date().toISOString().split("T")[0]}
                  className={inputCls}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#475569] mb-1">Target Completion Date</label>
                <UKDateInput
                  name="targetDate"
                  className={inputCls}
                />
                <p className="text-[10px] text-[#94A3B8] mt-1">Leave blank to auto-calculate from priority.</p>
              </div>
            </div>
          </div>

          {/* D & E — Contractor & Financials */}
          <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-sm space-y-4">
            <h2 className="text-xs font-bold text-[#1E293B] uppercase tracking-wider border-b border-[#F1F5F9] pb-2 flex items-center gap-2">
              <span className="flex items-center justify-center w-5 h-5 rounded-full bg-slate-100 text-slate-700 text-[10px]">D</span>
              Contractor &amp; Cost
            </h2>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-[#475569] mb-1">Assigned Contractor</label>
                <select name="contractorId" defaultValue={preselectedContractorId} className={inputCls}>
                  <option value="">-- No Contractor (Assign Later) --</option>
                  {contractors.map(c => (
                    <option key={c._id} value={c._id}>
                      {c.name} {c.isPreferred ? "★" : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#475569] mb-1">Scheduled Date</label>
                <UKDateInput
                  name="scheduledDate"
                  className={inputCls}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#475569] mb-1">Estimated Cost (£)</label>
                <input
                  name="estimatedCost"
                  type="number"
                  min="0"
                  step="0.01"
                  value={estimatedCost}
                  onChange={e => setEstimatedCost(e.target.value)}
                  className={inputCls}
                  placeholder="e.g. 150.00"
                />
              </div>

              {parseFloat(estimatedCost) > 500 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 flex items-start gap-2 text-[10px] text-amber-800 leading-normal">
                  <Info className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                  <p>Estimated cost exceeds the Landlord Approval Threshold (£500). Works will pause for landlord confirmation.</p>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-[#475569] mb-1.5">Cost Responsibility</label>
                <div className="space-y-1.5">
                  {[
                    { value: "landlord", label: "Landlord (Deduct from rent)" },
                    { value: "tenant",   label: "Tenant Liability" },
                    { value: "organization",   label: "Organization Covered" },
                    { value: "insurance",label: "Insurance Claim" },
                    { value: "tbc",      label: "To Be Confirmed" },
                  ].map(item => (
                    <label key={item.value} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="costResponsibility"
                        value={item.value}
                        defaultChecked={item.value === "landlord"}
                        className="text-[#2563EB] focus:ring-[#2563EB]"
                      />
                      <span className="text-xs font-medium text-[#475569]">{item.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-col gap-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-900 text-white rounded-lg text-xs font-bold hover:bg-black transition shadow-sm disabled:bg-slate-400"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Creating Job...
                </>
              ) : (
                "Log Job"
              )}
            </button>
            <Link
              to="/maintenance"
              className="w-full text-center px-4 py-2 text-xs font-semibold border border-[#E2E8F0] hover:bg-slate-50 text-[#475569] rounded-lg transition"
            >
              Cancel
            </Link>
          </div>

        </div>
      </form>
    </div>
  );
}

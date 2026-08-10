// routes/tenants/detail.jsx — Tenant Profile (tabbed)
import { useState } from "react";
import { useLoaderData, Link, useSearchParams, Form } from "react-router-dom";
import { getUserFromRequest } from "../../utils/auth.server.js";
import { redirect } from "react-router";
import { User } from "../../models/user.server.js";
import { Tenancy } from "../../models/tenancy.server.js";
import { Document } from "../../models/document.server.js";
import { connect } from "../../config/db.server.js";
import { fmtDate } from "../../utils/date.js";
import { getRightToRentStatus } from "../../utils/compliance.js";
import DocumentUploader from "../../components/documents/DocumentUploader.jsx";
import { DocumentType } from "../../models/documentType.server.js";
import { getNotesForEntity } from "../../utils/notes.server.js";
import Timeline from "../../components/timeline/Timeline.jsx";

export async function loader({ request, params }) {
  const user = await getUserFromRequest(request);
  if (!user) return redirect("/login");
  if (!user.organizationId && !user.roles?.includes("SUPER_ADMIN")) return redirect("/dashboard");

  await connect();

  const isSuperAdmin = user.roles?.includes("SUPER_ADMIN");
  const organizationFilter = isSuperAdmin ? {} : { organizationId: user.organizationId };

  // Load tenant from User collection
  const profile = await User.findOne({ _id: params.id, roles: "TENANT", ...organizationFilter })
    .populate("tenantData.rightToRentCheckedBy", "title firstName lastName")
    .lean();

  if (!profile) return redirect("/tenants");

  const tenantUserId = profile._id;
  const fullUser = await User.findById(user.userId).lean();

  const [tenancies, documents, activeDocTypes, notesResult] = await Promise.all([
    Tenancy.find({ tenantIds: tenantUserId, deleted: false, ...organizationFilter })
      .populate("propertyId", "addressLine1 addressLine2 city postcode bgImage")
      .sort({ createdAt: -1 })
      .lean(),
    Document.find({ entityId: tenantUserId, entityType: "tenant", deleted: false, ...organizationFilter })
      .populate("docType", "name")
      .populate("uploadedBy", "title firstName lastName")
      .sort({ createdAt: -1 })
      .lean(),
    DocumentType.find({ isActive: true, entity: "tenant" })
      .sort({ name: 1 })
      .lean(),
    getNotesForEntity("tenant", params.id, user.organizationId, 1)
  ]);

  const isAdmin = !!user.organizationId || user.roles?.includes("SUPER_ADMIN");
  const isSuper = user.roles?.includes("SUPER_ADMIN");

  // Format Right to Rent status
  const rtrStatus = getRightToRentStatus(profile);

  // Flatten the response
  const serializedTenancies = tenancies.map(t => ({
    ...t,
    _id: t._id.toString(),
    propertyId: t.propertyId
      ? { ...t.propertyId, _id: t.propertyId._id?.toString() }
      : null,
  }));

  const serializedDocs = documents.map(d => ({
    ...d,
    _id:        d._id.toString(),
    entityId:   d.entityId?.toString() || null,
    organizationId:   d.organizationId?.toString() || null,
    docType:    d.docType ? { ...d.docType, _id: d.docType._id.toString() } : null,
    uploadedBy: d.uploadedBy
      ? { ...d.uploadedBy, _id: d.uploadedBy._id.toString() }
      : null,
  }));

  const serializedDocTypes = activeDocTypes.map(dt => ({
    _id: dt._id.toString(),
    name: dt.name,
    key: dt.key,
    hasExpiry: dt.hasExpiry || false,
    expiryDays: dt.expiryDays || null,
  }));

  return {
    tenant: {
       ...profile,
       _id: profile._id.toString(),
       tenantData: {
         ...profile.tenantData,
         rightToRentCheckedBy: profile.tenantData?.rightToRentCheckedBy ? {
           _id: profile.tenantData.rightToRentCheckedBy._id.toString(),
           firstName: profile.tenantData.rightToRentCheckedBy.firstName,
           lastName: profile.tenantData.rightToRentCheckedBy.lastName
         } : null
       }
    },
    rtrStatus,
    tenancies: serializedTenancies,
    documents: serializedDocs,
    activeDocTypes: serializedDocTypes,
    isAdmin,
    isSuperAdmin: isSuper,
    notes: notesResult.notes,
    notesTotal: notesResult.total,
    notesHasMore: notesResult.hasMore,
    currentUserId: fullUser._id.toString(),
    currentUserRole: fullUser.roles?.[0] || "agent",
    currentUserName: `${fullUser.firstName || ""} ${fullUser.lastName || ""}`.trim() || "User",
  };
}

function InfoRow({ label, value, children }) {
  if (!value && !children) return null;
  return (
    <div className="flex justify-between py-2.5 border-b border-gray-50 last:border-0 items-center">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm font-medium text-gray-900 text-right max-w-[200px] break-words">
        {children || value}
      </span>
    </div>
  );
}

export default function TenantDetail() {
  const { tenant, rtrStatus, tenancies, documents, activeDocTypes, isAdmin, isSuperAdmin, currentUserId, currentUserRole, currentUserName, notes, notesTotal, notesHasMore } = useLoaderData();
  const [searchParams] = useSearchParams();
  const defaultTab = searchParams.get("tab") || "overview";
  const [tab, setTab] = useState(defaultTab);
  
  const td = tenant.tenantData || {};

  const tabs = [
    { key: "overview",   label: "Overview" },
    { key: "documents",  label: `Documents (${documents.length})` },
    { key: "tenancies",  label: `Tenancies (${tenancies.length})` },
  ];

  // Colors for inline badge
  const rtrCols = {
    green: "bg-green-100 text-green-700 border-green-200",
    amber: "bg-amber-100 text-amber-800 border-amber-200",
    red: "bg-red-100 text-red-800 border-red-200",
    grey: "bg-gray-100 text-gray-600 border-gray-200"
  };

  const getFullAddress = () => {
    return [tenant.addressLine1, tenant.addressLine2, tenant.addressLine3, tenant.postTown, tenant.postcode]
      .filter(Boolean).join(", ");
  };

  const getGuarantorAddress = () => {
    if (!td.guarantorAddress) return "-";
    const ga = td.guarantorAddress;
    return [ga.line1, ga.line2, ga.city, ga.county, ga.postcode].filter(Boolean).join(", ");
  };

  // Referencing Badge
  let refBadge = <span className="text-sm text-gray-500">Not done</span>;
  if (td.referencingPassed === true) refBadge = <span className="px-2 py-1 bg-green-100 text-green-800 rounded-md text-xs font-semibold">Passed</span>;
  if (td.referencingPassed === false) refBadge = <span className="px-2 py-1 bg-red-100 text-red-800 rounded-md text-xs font-semibold">Failed</span>;

  // Calculate recheck text
  const getRecheckDueText = () => {
    if (!td.rightToRentExpiry) return "Not required";
    const exp = new Date(td.rightToRentExpiry);
    const recheck = new Date(exp.getTime() - (28 * 24 * 60 * 60 * 1000));
    return fmtDate(recheck);
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <Link to="/tenants" className="flex items-center justify-center w-9 h-9 rounded-lg border border-gray-300 hover:bg-gray-50 transition">
            <svg className="w-4 h-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </Link>
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-3xl font-bold text-gray-900">{tenant.title ? tenant.title + ' ' : ''}{tenant.firstName} {tenant.lastName}</h1>
              
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium border ${tenant.status === 'active' ? 'bg-green-50 text-green-700 border-green-200' : tenant.status === 'inactive' ? 'bg-gray-100 text-gray-600 border-gray-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                {tenant.status === 'active' ? 'Active' : tenant.status === 'inactive' ? 'Inactive' : 'Archived'}
              </span>

              <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium border ${rtrCols[rtrStatus.colour] || rtrCols.grey}`}>
                Right to Rent: {rtrStatus.label}
              </span>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <Link
            to={`/tenants/${tenant._id}/edit`}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 transition shadow-sm"
          >
            Edit Profile
          </Link>
          {isSuperAdmin && tenant.status !== 'archived' && (
            <Form action={`/tenants/${tenant._id}/delete`} method="post" onSubmit={(e) => {
               if(!confirm("Are you sure you want to archive this tenant? They will no longer appear in active lists.")) e.preventDefault();
            }}>
              <button type="submit" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-red-200 bg-white text-sm font-medium text-red-600 hover:bg-red-50 hover:border-red-300 transition shadow-sm">
                Archive
              </button>
            </Form>
          )}
        </div>
      </div>

      {/* Success Notification */}
      {searchParams.get("success") && (
        <div className="p-4 rounded-xl bg-green-50 border border-green-200 flex items-center gap-3 animate-in fade-in slide-in-from-top-2">
          <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-sm font-medium text-green-800">
            {searchParams.get("success") === "created" ? "Tenant profile created successfully!" : "Tenant profile updated successfully!"}
          </p>
        </div>
      )}

      {/* Right to Rent Compliance Banner */}
      {rtrStatus.status === 'not_checked' && (
        <div className="flex items-start gap-4 p-4 rounded-xl bg-red-50 border border-red-200 text-red-800">
          <span className="text-2xl pt-0.5">🚫</span>
          <div className="flex-1">
            <h3 className="font-semibold text-red-900">Right to Rent check not completed.</h3>
            <p className="text-sm mt-1 mb-3">This tenant cannot be added to a tenancy until the check is done.</p>
            <Link to={`/tenants/${tenant._id}/edit`} className="text-sm font-medium underline hover:text-red-900">
              Complete Right to Rent Check →
            </Link>
          </div>
        </div>
      )}

      {(rtrStatus.status === 'valid' && rtrStatus.daysUntil <= 60 && rtrStatus.daysUntil >= 0) && (
        <div className="flex items-start gap-4 p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-800">
          <span className="text-2xl pt-0.5">⚠️</span>
          <div>
            <h3 className="font-semibold text-amber-900">Right to Rent expires in {rtrStatus.daysUntil} days.</h3>
            <p className="text-sm mt-1">Re-check must be completed before {fmtDate(td.rightToRentExpiry)}.</p>
          </div>
        </div>
      )}

      {rtrStatus.status === 'expired' && (
        <div className="flex items-start gap-4 p-4 rounded-xl bg-red-50 border border-red-200 text-red-800">
          <span className="text-2xl pt-0.5">🚫</span>
          <div>
            <h3 className="font-semibold text-red-900">Right to Rent has expired.</h3>
            <p className="text-sm mt-1">Re-check required immediately. Continuing tenancy without re-check may result in an unlimited fine.</p>
            <Link to={`/tenants/${tenant._id}/edit`} className="text-sm font-medium underline mt-2 inline-block hover:text-red-900">
              Update Right to Rent Details →
            </Link>
          </div>
        </div>
      )}

      {(rtrStatus.status === 'valid' && !td.rightToRentExpiry) && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-green-50 border border-green-200 text-green-800">
          <span className="text-xl">✓</span>
          <span className="text-sm font-medium">Right to Rent verified. No expiry.</span>
        </div>
      )}

      {(rtrStatus.status === 'valid' && td.rightToRentExpiry && rtrStatus.daysUntil > 60) && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-green-50 border border-green-200 text-green-800">
          <span className="text-xl">✓</span>
          <span className="text-sm font-medium">Right to Rent valid until {fmtDate(td.rightToRentExpiry)}.</span>
        </div>
      )}

      {/* Tabs Nav */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-1">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-5 py-3 text-sm font-medium border-b-2 transition -mb-px ${
                tab === t.key
                  ? "border-indigo-600 text-indigo-700"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="py-2">
        {tab === "overview" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              
              {/* LEFT COLUMN: 65% ~ col-span-8 */}
              <div className="lg:col-span-8 space-y-6">
                
                {/* Personal Details */}
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/50">
                    <h2 className="text-base font-semibold text-gray-900">Personal Details</h2>
                  </div>
                  <div className="p-5 flex flex-col gap-1">
                    <InfoRow label="Date of Birth" value={fmtDate(tenant.dob) || "-"} />
                    <InfoRow label="Email">
                       {tenant.email ? <a href={`mailto:${tenant.email}`} className="text-indigo-600 hover:underline">{tenant.email}</a> : "-"}
                    </InfoRow>
                    <InfoRow label="Phone">
                      {tenant.phone ? <a href={`tel:${tenant.phone}`} className="text-indigo-600 hover:underline">{tenant.phone}</a> : "-"}
                    </InfoRow>
                    <InfoRow label="Current Address" value={getFullAddress() || "-"} />
                  </div>
                </div>

                {/* Right To Rent Specifics */}
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                   <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center">
                    <h2 className="text-base font-semibold text-gray-900">Right to Rent Check</h2>
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${rtrCols[rtrStatus.colour] || rtrCols.grey}`}>{rtrStatus.label}</span>
                  </div>
                  <div className="p-5 flex flex-col gap-1">
                    <InfoRow label="Check Date" value={fmtDate(td.rightToRentCheckDate) || "-"} />
                    <InfoRow label="Checked By" value={td.rightToRentCheckedBy ? `${td.rightToRentCheckedBy.title ? td.rightToRentCheckedBy.title + ' ' : ''}${td.rightToRentCheckedBy.firstName} ${td.rightToRentCheckedBy.lastName}` : "System/Unknown"} />
                    <InfoRow label="Expiry Date">
                        {td.rightToRentExpiry ? fmtDate(td.rightToRentExpiry) : <span className="text-gray-400 font-normal">No expiry (UK Citizen or equivalent)</span>}
                    </InfoRow>
                    <InfoRow label="Re-check Due">
                        {td.rightToRentExpiry ? <span className="text-amber-700 font-semibold">{getRecheckDueText()}</span> : <span className="text-gray-400 font-normal">Not required</span>}
                    </InfoRow>
                    {td.rightToRentShareCode && (
                       <InfoRow label="Gov Share Code">
                          <span className="bg-gray-100 text-gray-800 px-2 py-0.5 rounded text-xs font-mono">{td.rightToRentShareCode}</span>
                       </InfoRow>
                    )}
                    {td.rightToRentNotes && (
                      <div className="py-2.5 border-b border-gray-50 items-start flex flex-col gap-1 w-full">
                         <span className="text-sm text-gray-500">Check Notes</span>
                         <div className="text-sm text-gray-800 p-3 bg-gray-50 rounded-lg whitespace-pre-wrap">{td.rightToRentNotes}</div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Employment / Referencing */}
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/50">
                    <h2 className="text-base font-semibold text-gray-900">Employment & Referencing</h2>
                  </div>
                  <div className="p-5 flex flex-col gap-1">
                    <InfoRow label="Employment Status">
                      {td.employmentStatus ? <span className="capitalize">{td.employmentStatus.replace('_', ' ')}</span> : "-"}
                    </InfoRow>
                    <InfoRow label="Employer Name" value={td.employerName || "-"} />
                    <InfoRow label="Employer Phone" value={td.employerPhone || "-"} />
                    <InfoRow label="Annual Income" value={td.annualIncome ? `£${td.annualIncome.toLocaleString()}` : "-"} />
                    <InfoRow label="Referencing" children={refBadge} />
                    {td.referencingDate && (
                      <InfoRow label="Referenced On" value={fmtDate(td.referencingDate)} />
                    )}
                    {td.referencingProvider && (
                      <InfoRow label="Reference Provider" value={td.referencingProvider} />
                    )}
                    {(td.referencingNotes && td.referencingNotes.trim().length > 0) && (
                      <div className="pt-3 pb-1 flex flex-col gap-1 w-full">
                         <span className="text-sm text-gray-500">Referencing Notes</span>
                         <div className="text-sm text-gray-800 p-3 bg-gray-50 rounded-lg whitespace-pre-wrap">{td.referencingNotes}</div>
                      </div>
                    )}
                  </div>
                </div>

              </div>

              {/* RIGHT COLUMN: 35% ~ col-span-4 */}
              <div className="lg:col-span-4 space-y-6">
                
                {/* Guarantor Details */}
                {td.hasGuarantor && (
                  <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm shadow-indigo-100/30">
                    <div className="px-5 py-4 border-b border-indigo-50 bg-indigo-50/40">
                      <h2 className="text-base font-semibold text-indigo-900 flex items-center gap-2">
                         <svg className="w-4 h-4 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                           <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                         </svg>
                         Guarantor
                      </h2>
                    </div>
                    <div className="p-5 flex flex-col gap-1">
                      <div className="mb-2">
                        <div className="text-base font-semibold text-gray-900">{td.guarantorName || "Unnamed"}</div>
                        <div className="text-sm text-gray-500">{td.guarantorRelationship || "Relationship not specified"}</div>
                      </div>
                      <InfoRow label="Email">
                         {td.guarantorEmail ? <a href={`mailto:${td.guarantorEmail}`} className="text-indigo-600 hover:underline break-all">{td.guarantorEmail}</a> : "-"}
                      </InfoRow>
                      <InfoRow label="Phone" value={td.guarantorPhone || "-"} />
                      <div className="py-2 mt-2">
                        <span className="block text-sm text-gray-500 mb-1">Guarantor Address</span>
                        <span className="block text-sm font-medium text-gray-900">{getGuarantorAddress()}</span>
                      </div>
                    </div>
                  </div>
                )}
                
                {/* Emergency Contact */}
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/50 flex gap-2 items-center">
                    <span className="p-1 rounded bg-red-100 text-red-600">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v4m0 4v8m-4-8h8m-4 0v8" />
                      </svg>
                    </span>
                    <h2 className="text-base font-semibold text-gray-900">Emergency Contact</h2>
                  </div>
                  <div className="p-5 flex flex-col gap-1">
                     <div className="mb-2">
                        <div className="text-base font-semibold text-gray-900">{td.emergencyContactName || "Not provided"}</div>
                        <div className="text-sm text-gray-500">{td.emergencyContactRelationship || "Relationship not specified"}</div>
                      </div>
                      <InfoRow label="Phone">
                         {td.emergencyContactPhone ? <a href={`tel:${td.emergencyContactPhone}`} className="text-indigo-600 hover:underline">{td.emergencyContactPhone}</a> : "-"}
                      </InfoRow>
                  </div>
                </div>

                {/* Additional Details */}
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/50">
                    <h2 className="text-base font-semibold text-gray-900">Additional Details</h2>
                  </div>
                  <div className="p-5 flex flex-col gap-1">
                     <InfoRow label="Expected Occupants">
                       <span className="font-semibold text-gray-900 text-base">{td.numberOfOccupants || 1}</span>
                     </InfoRow>
                     <InfoRow label="Pets">
                         {td.hasPets ? <span className="text-gray-900 font-medium">Yes — {td.petDetails || "No details provided"}</span> : "No"}
                     </InfoRow>
                     <InfoRow label="Smoker">
                         {td.isSmoker ? "Yes" : "No"}
                     </InfoRow>
                  </div>
                </div>

              </div>
            </div>

            <Timeline
              entityType="tenant"
              entityId={tenant._id}
              notes={notes}
              hasMore={notesHasMore}
              currentUserId={currentUserId}
              currentUserRole={currentUserRole}
            />

          </div>
        )}

        {tab === "documents" && (
          <div className="space-y-6">
            <DocumentUploader
              entityType="tenant"
              entityId={tenant._id}
              docTypes={activeDocTypes}
              docs={documents}
              isAdmin={isAdmin}
            />
          </div>
        )}

        {tab === "tenancies" && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-6 py-5 border-b border-gray-200 flex justify-between items-center">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Linked Tenancies</h3>
                  <p className="text-sm text-gray-500 mt-1">Properties where this tenant is an occupant or lead tenant.</p>
                </div>
              </div>
              
              {tenancies.length === 0 ? (
                <div className="p-12 text-center text-gray-500">
                   <svg className="w-12 h-12 mx-auto text-gray-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                  </svg>
                  <p>No tenancies yet.</p>
                </div>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {tenancies.map(t => (
                    <li key={t._id} className="p-4 hover:bg-gray-50 transition">
                      <div className="flex items-center justify-between">
                         <div>
                            <span className="block font-medium text-gray-900 mb-1">
                              {t.propertyId?.addressLine1 || "Unknown Property"}
                            </span>
                            <div className="flex gap-2 text-sm text-gray-500 items-center">
                               <span className={`w-2 h-2 rounded-full ${t.status === 'active' ? 'bg-green-500' : 'bg-gray-400'}`}></span>
                               <span className="capitalize">{t.status.replace('_', ' ')}</span>
                               <span>•</span>
                               <span>{fmtDate(t.startDate)} - {fmtDate(t.endDate) || "Periodic"}</span>
                            </div>
                         </div>
                         <Link to={`/tenancies/${t._id}`} className="px-3 py-1.5 text-sm font-medium text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition">
                           View Tenancy
                         </Link>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

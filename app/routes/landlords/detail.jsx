// routes/landlords/detail.jsx — Landlord Profile (tabbed)
import { useState } from "react";
import { useLoaderData, Link, useSearchParams } from "react-router-dom";
import { getUserFromRequest } from "../../utils/auth.server.js";
import { redirect } from "react-router";
import { User } from "../../models/user.server.js";
import { Tenancy } from "../../models/tenancy.server.js";
import { Document } from "../../models/document.server.js";
import { connect } from "../../config/db.server.js";
import { fmtDate } from "../../utils/date.js";
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

  // Load landlord from User collection
  const profile = await User.findOne({ _id: params.id, roles: "LANDLORD", ...organizationFilter })
    .populate("landlordData.amlCheckedBy", "title firstName lastName")
    .lean();

  if (!profile) return redirect("/landlords");

  // The landlord's userId is used for documents and tenancies
  const landlordUserId = profile._id;

  const fullUser = await User.findById(user.userId).lean();

  const [tenancies, documents, activeDocTypes, notesResult] = await Promise.all([
    Tenancy.find({ landlordId: landlordUserId, deleted: false, ...organizationFilter })
      .populate("propertyId", "addressLine1 addressLine2 city postcode")
      .sort({ createdAt: -1 })
      .lean(),
    Document.find({ entityId: landlordUserId, entityType: "landlord", deleted: false, ...organizationFilter })
      .populate("docType", "name")
      .populate("uploadedBy", "title firstName lastName")
      .sort({ createdAt: -1 })
      .lean(),
    DocumentType.find({ isActive: true, entity: "landlord" })
      .sort({ name: 1 })
      .lean(),
    getNotesForEntity("landlord", params.id, user.organizationId, 1)
  ]);

  const isAdmin = !!user.organizationId || user.roles?.includes("SUPER_ADMIN");

  // Merge User identity + Profile domain data into a flat "landlord" object for the UI
  const landlord = {
    _id: profile._id.toString(),
    userId: landlordUserId?.toString() || null,
    organizationId: profile.organizationId?.toString() || null,
    // Identity from User
    firstName: profile.firstName || "",
    lastName: profile.lastName || "",
    email: profile.email || "",
    phone: profile.phone || "",
    addressLine1: profile.addressLine1 || "",
    addressLine2: profile.addressLine2 || "",
    addressLine3: profile.addressLine3 || "",
    postTown: profile.postTown || "",
    postcode: profile.postcode || "",
    // Domain fields from profile
    isCompany: profile.landlordData?.isCompany,
    companyName: profile.landlordData?.companyName,
    companyNumber: profile.landlordData?.companyNumber,
    isOverseas: profile.landlordData?.isOverseas,
    amlResult: profile.landlordData?.amlResult,
    amlCheckedAt: profile.landlordData?.amlCheckedAt,
    amlCheckedBy: profile.landlordData?.amlCheckedBy
      ? { firstName: profile.landlordData.amlCheckedBy.firstName, lastName: profile.landlordData.amlCheckedBy.lastName }
      : null,
    amlNotes: profile.landlordData?.amlNotes,
    sourceOfFunds: profile.landlordData?.sourceOfFunds,
    pepChecked: profile.landlordData?.pepChecked,
    pepResult: profile.landlordData?.pepResult,
    status: profile.landlordData?.status,
    createdBy: profile.addedBy?.toString() || null,
    updatedBy: null,
  };

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
    landlord, 
    tenancies: serializedTenancies, 
    documents: serializedDocs, 
    activeDocTypes: serializedDocTypes, 
    isAdmin, 
    notes: notesResult.notes,
    notesTotal: notesResult.total,
    notesHasMore: notesResult.hasMore,
    currentUserId: fullUser._id.toString(),
    currentUserRole: fullUser.roles?.[0] || "agent",
    currentUserName: `${fullUser.firstName || ""} ${fullUser.lastName || ""}`.trim() || "User",
  };
}

const AML_CONFIG = {
  pass:  { label: "Pass",    cls: "bg-green-100 text-green-800",  icon: "✅" },
  refer: { label: "Refer",   cls: "bg-amber-100 text-amber-800",  icon: "⚠️" },
  fail:  { label: "Fail",    cls: "bg-red-100 text-red-800",      icon: "❌" },
  null:  { label: "Pending", cls: "bg-gray-100 text-gray-600",    icon: "🕐" },
};

function InfoRow({ label, value }) {
  if (!value) return null;
  return (
    <div className="flex justify-between py-2.5 border-b border-gray-50 last:border-0">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm font-medium text-gray-900 text-right max-w-xs">{value}</span>
    </div>
  );
}

export default function LandlordDetail() {
  const { landlord: l, tenancies, documents, activeDocTypes, isAdmin, currentUserId, currentUserRole, currentUserName, notes, notesHasMore } = useLoaderData();
  const [searchParams] = useSearchParams();
  const defaultTab = searchParams.get("tab") || "overview";
  const [tab, setTab] = useState(defaultTab);

  const aml = AML_CONFIG[l.amlResult] || AML_CONFIG.null;

  const tabs = [
    { key: "overview",   label: "Overview" },
    { key: "aml",        label: "AML & Compliance" },
    { key: "documents",  label: `Documents (${documents.length})` },
    { key: "tenancies",  label: `Properties & Tenancies (${tenancies.length})` },
  ];

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link to="/landlords" className="flex items-center justify-center w-9 h-9 rounded-lg border border-gray-300 hover:bg-gray-50 transition">
            <svg className="w-4 h-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </Link>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold text-gray-900">{l.title ? l.title + ' ' : ''}{l.firstName} {l.lastName}</h1>
              {l.isCompany && (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">Company</span>
              )}
              {l.isOverseas && (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700">Overseas</span>
              )}
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${l.status === "active" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                {l.status}
              </span>
            </div>
            {l.companyName && <p className="text-sm text-gray-500 mt-0.5">{l.companyName}</p>}
          </div>
        </div>
        <Link
          to={`/landlords/${l._id}/edit`}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
          </svg>
          Edit
        </Link>
      </div>

      {/* Success Notification */}
      {searchParams.get("success") && (
        <div className="mb-6 p-4 rounded-xl bg-green-50 border border-green-200 flex items-center gap-3 animate-in fade-in slide-in-from-top-2">
          <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-sm font-medium text-green-800">
            {searchParams.get("success") === "created" ? "Landlord created successfully!" : "Landlord updated successfully!"}
          </p>
        </div>
      )}

      {/* AML Summary Banner */}
      <div className={`flex items-center gap-3 p-4 rounded-xl mb-6 ${aml.cls}`}>
        <span className="text-xl">{aml.icon}</span>
        <div>
          <p className="text-sm font-semibold">AML Status: {aml.label}</p>
          {l.amlCheckedAt && (
            <p className="text-xs opacity-80">Checked on {new Date(l.amlCheckedAt).toLocaleDateString("en-GB")}</p>
          )}
        </div>
        {!l.amlResult && (
          <Link to={`/landlords/${l._id}/edit?tab=aml`} className="ml-auto text-xs font-medium underline opacity-70 hover:opacity-100">
            Update AML →
          </Link>
        )}
      </div>

      {/* PEP Flagged Banner */}
      {l.pepResult === "flagged" && (
        <div className="flex items-center gap-3 p-4 rounded-xl mb-6 bg-amber-100 text-amber-800 border border-amber-200 animate-in fade-in slide-in-from-top-2">
          <span className="text-xl">⚠️</span>
          <div>
            <p className="text-sm font-semibold">PEP Flagged</p>
            <p className="text-xs opacity-80">This landlord has been flagged as a Politically Exposed Person.</p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="flex gap-1">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition -mb-px ${
                tab === t.key
                  ? "border-indigo-600 text-indigo-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {/* ── TAB: OVERVIEW ──────────────────────────────────────────────────── */}
      {tab === "overview" && (
        <div className="space-y-6 animate-in fade-in duration-300">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Contact */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Contact</h3>
              <InfoRow label="Email" value={l.email} />
              <InfoRow label="Phone" value={l.phone} />
              
              {(l.addressLine1 || l.postcode) && (
                <InfoRow 
                  label="Address" 
                  value={
                    [l.addressLine1, l.addressLine2, l.addressLine3, l.postTown, l.postcode]
                      .filter(Boolean)
                      .join(", ")
                  } 
                />
              )}
            </div>

            {/* Identity */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Identity</h3>
              <InfoRow label="Type" value={l.isCompany ? "Company" : "Individual"} />
              {l.isCompany && <InfoRow label="Company Name" value={l.companyName} />}
              {l.isCompany && <InfoRow label="Companies House No." value={l.companyNumber} />}
              <InfoRow label="Overseas" value={l.isOverseas ? "Yes" : "No"} />
            </div>
          </div>

          <Timeline
            entityType="landlord"
            entityId={l._id}
            notes={notes}
            hasMore={notesHasMore}
            currentUserId={currentUserId}
            currentUserRole={currentUserRole}
          />
        </div>
      )}

      {/* ── TAB: AML & COMPLIANCE ──────────────────────────────────────────── */}
      {tab === "aml" && (
        <div className="space-y-5">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">AML Check</h3>
            <div className="space-y-0">
              <InfoRow label="AML Result" value={
                <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold ${aml.cls}`}>{aml.label}</span>
              } />
              <InfoRow label="Checked On"    value={l.amlCheckedAt ? fmtDate(l.amlCheckedAt) : "—"} />
              {l.amlCheckedBy && (
                <InfoRow label="Checked By" value={`${l.amlCheckedBy.title ? l.amlCheckedBy.title + ' ' : ''}${l.amlCheckedBy.firstName} ${l.amlCheckedBy.lastName}`} />
              )}
              {/* AML Doc is now managed in general Documents tab */}
              <InfoRow label="Source of Funds" value={l.sourceOfFunds || "—"} />
            </div>
            {l.amlNotes && (
              <div className="mt-3 pt-3 border-t border-gray-50">
                <p className="text-xs text-gray-500 font-medium mb-1">AML Notes</p>
                <p className="text-sm text-gray-600 whitespace-pre-wrap">{l.amlNotes}</p>
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">PEP Check</h3>
            <InfoRow label="PEP Check Done" value={l.pepChecked ? "Yes" : "No"} />
            {l.pepChecked && (
              <InfoRow label="PEP Result" value={
                <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold ${l.pepResult === "clear" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
                  {l.pepResult === "clear" ? "✅ Clear" : "🚩 Flagged"}
                </span>
              } />
            )}
          </div>

          <div className="text-center pt-2">
            <Link to={`/landlords/${l._id}/edit?tab=aml`} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition">
              Update AML & Compliance Details
            </Link>
          </div>
        </div>
      )}

      {/* ── TAB: DOCUMENTS ─────────────────────────────────────────────────── */}
      {tab === "documents" && (
        <DocumentUploader
          entityType="landlord"
          entityId={l.userId}
          docTypes={activeDocTypes}
          docs={documents}
          isAdmin={isAdmin}
          currentUserName={currentUserName}
          layout="grid"
        />
      )}

      {/* ── TAB: TENANCIES ─────────────────────────────────────────────────── */}
      {tab === "tenancies" && (
        <div>
          <div className="flex justify-end mb-4">
            <Link to={`/properties/add?landlordId=${l._id}`} className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Add Property
            </Link>
          </div>
          {tenancies.length === 0 ? (
            <div className="text-center py-16 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50">
              <p className="text-gray-500 font-medium">No properties or tenancies linked to this landlord yet.</p>
              <p className="text-xs text-gray-400 mt-1">Properties are linked when creating a tenancy or a standalone property.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {tenancies.map(t => (
                <Link
                  key={t._id}
                  to={`/tenancies/${t._id}`}
                  className="flex items-center justify-between bg-white rounded-xl border border-gray-200 p-4 hover:border-indigo-300 hover:shadow-sm transition"
                >
                  <div>
                    <p className="font-medium text-gray-900">
                      {t.propertyId?.addressLine1}, {t.propertyId?.postcode}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {t.startDate ? fmtDate(t.startDate) : "—"}
                      {t.endDate ? ` → ${fmtDate(t.endDate)}` : ""}
                    </p>
                  </div>
                  <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${t.status === "active" ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"}`}>
                    {t.status}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

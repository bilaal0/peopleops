// routes/documents/index.jsx — Documents index page
// Shows all documents grouped by entity type in a beautiful vault.
import { useState } from "react";
import { Link, useLoaderData, useFetcher } from "react-router-dom";
import { getUserFromRequest } from "../../utils/auth.server.js";
import { redirect } from "react-router";
import { Document } from "../../models/document.server.js";
import { Property } from "../../models/property.server.js";
import { Tenancy } from "../../models/tenancy.server.js";
import { User } from "../../models/user.server.js";
import { connect } from "../../config/db.server.js";
import { fmtDate } from "../../utils/date.js";
import { 
  FileText, 
  Home, 
  Users, 
  UserSquare2, 
  Building2, 
  FolderOpen,
  Download,
  AlertCircle,
  CheckCircle2,
  Clock,
  ShieldCheck,
  Search
} from "lucide-react";

export async function loader({ request }) {
  const user = await getUserFromRequest(request);
  if (!user) return redirect("/login");
  if (!user.agencyId && !user.roles?.includes("SUPER_ADMIN")) return redirect("/dashboard");

  await connect();
  const docs = await Document.find({ agencyId: user.agencyId, deleted: false })
    .populate("docType", "name")
    .sort({ createdAt: -1 })
    .lean();

  const propertyIds = [];
  const tenancyIds = [];
  const userIds = [];

  docs.forEach(d => {
    if (!d.entityId) return;
    if (d.entityType === "property") propertyIds.push(d.entityId);
    if (d.entityType === "tenancy") tenancyIds.push(d.entityId);
    if (d.entityType === "landlord" || d.entityType === "tenant") userIds.push(d.entityId);
  });

  const [props, tenancies, users] = await Promise.all([
    Property.find({ _id: { $in: propertyIds } }).select("addressLine1").lean(),
    Tenancy.find({ _id: { $in: tenancyIds } }).populate("propertyId", "addressLine1").lean(),
    User.find({ _id: { $in: userIds } }).select("title firstName lastName").lean(),
  ]);

  const entityMap = {};
  props.forEach(p => entityMap[p._id.toString()] = p.addressLine1);
  tenancies.forEach(t => entityMap[t._id.toString()] = `Tenancy at ${t.propertyId?.addressLine1 || "Unknown Property"}`);
  users.forEach(u => entityMap[u._id.toString()] = `${u.title ? u.title + ' ' : ''}${u.firstName} ${u.lastName}`.trim());

  return {
    documents: docs.map(d => ({
      ...d,
      _id:        d._id.toString(),
      entityId:   d.entityId?.toString() || null,
      entityName: d.entityId ? entityMap[d.entityId.toString()] : "General",
      agencyId:   d.agencyId?.toString() || null,
      uploadedBy: d.uploadedBy?.toString() || null,
    })),
  };
}

const ENTITY_LINKS = {
  landlord: (id) => `/landlords/${id}`,
  property: (id) => `/properties/${id}`,
  tenant:   (id) => `/tenants/${id}`,
  tenancy:  (id) => `/tenancies/${id}`,
};

const CATEGORIES = [
  { id: "all", label: "All Documents", icon: FolderOpen },
  { id: "property", label: "Properties", icon: Home },
  { id: "tenancy", label: "Tenancies", icon: FileText },
  { id: "tenant", label: "Tenants", icon: Users },
  { id: "landlord", label: "Landlords", icon: UserSquare2 },
];

function ExpiryBadge({ expiryDate }) {
  if (!expiryDate) return null;
  const days = Math.floor((new Date(expiryDate) - new Date()) / (1000 * 60 * 60 * 24));
  
  if (days < 0) {
    return (
      <div className="flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-red-700">
        <AlertCircle className="w-3 h-3" />
        Expired {Math.abs(days)}d ago
      </div>
    );
  }
  if (days <= 60) {
    return (
      <div className="flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-700">
        <Clock className="w-3 h-3" />
        {days}d left
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-700">
      <CheckCircle2 className="w-3 h-3" />
      Valid until {fmtDate(expiryDate)}
    </div>
  );
}

function VerificationActions({ documentId, currentStatus }) {
  const verifyFetcher = useFetcher();
  const isSubmitting = verifyFetcher.state !== "idle";

  const optimisticStatus = verifyFetcher.formData
    ? verifyFetcher.formData.get("status")
    : currentStatus;

  const isVerified = optimisticStatus === "verified";
  const nextStatus = isVerified ? "pending" : "verified";

  return (
    <verifyFetcher.Form method="post" action="/documents/verify">
      <input type="hidden" name="documentId" value={documentId} />
      <input type="hidden" name="status" value={nextStatus} />
      <button
        type="submit"
        disabled={isSubmitting}
        className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider transition ${
          isVerified 
            ? "border-green-200 bg-green-50 text-green-700 hover:bg-green-100" 
            : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
        } ${isSubmitting ? "opacity-50 cursor-not-allowed" : ""}`}
        title={isVerified ? "Click to mark as unverified" : "Click to mark as verified"}
      >
        <ShieldCheck className={`w-3 h-3 ${isVerified ? "text-green-600" : "text-slate-400"}`} />
        {isVerified ? "Verified" : "Pending"}
      </button>
    </verifyFetcher.Form>
  );
}

function DocumentCard({ doc }) {
  const Icon = CATEGORIES.find(c => c.id === doc.entityType)?.icon || FileText;

  return (
    <div className="group relative flex flex-col justify-between rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md hover:border-slate-300">
      <div>
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#EFF6FF] text-[#2657F7]">
            <Icon className="h-5 w-5" />
          </div>
          <div className="flex flex-col items-end gap-2">
            <VerificationActions documentId={doc._id} currentStatus={doc.status || "pending"} />
            <ExpiryBadge expiryDate={doc.expiryDate} />
          </div>
        </div>

        <h3 className="text-sm font-semibold text-slate-900 line-clamp-1" title={doc.fileName}>
          {doc.fileName}
        </h3>
        
        <div className="mt-1 flex items-center gap-2">
          <span className="inline-block rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
            {doc.docType?.name || "Unknown Type"}
          </span>
          {doc.fileSize && (
            <span className="text-xs text-slate-400">{(doc.fileSize / 1024).toFixed(1)} KB</span>
          )}
        </div>

        <div className="mt-4 pt-4 border-t border-slate-100">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Linked to</p>
          <Link 
            to={ENTITY_LINKS[doc.entityType]?.(doc.entityId) || "#"}
            className="mt-1 block text-xs font-medium text-[#2657F7] hover:underline truncate"
          >
            {doc.entityName || "General Portfolio"}
          </Link>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between">
        <span className="text-xs text-slate-400">
          {fmtDate(doc.createdAt)}
        </span>
        <button
          type="button"
          onClick={() => window.open(`/documents/${doc._id}/download`, "_blank")}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-50 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
          title="Download"
        >
          <Download className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export default function DocumentsIndex() {
  const { documents } = useLoaderData();
  const [activeTab, setActiveTab] = useState("all");
  const [search, setSearch] = useState("");

  const filteredDocs = documents.filter(d => {
    const matchesTab = activeTab === "all" || d.entityType === activeTab;
    const matchesSearch = d.fileName.toLowerCase().includes(search.toLowerCase()) || 
                          (d.entityName && d.entityName.toLowerCase().includes(search.toLowerCase()));
    return matchesTab && matchesSearch;
  });

  return (
    <div className="mx-auto max-w-[1600px] p-6 space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Document Vault</h1>
        <p className="mt-2 text-sm text-slate-500">Secure storage for all your agency's compliance certificates, contracts, and IDs.</p>
      </div>

      {/* Tabs and Search */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2 p-1 bg-slate-100/50 rounded-2xl w-fit border border-slate-200/50">
          {CATEGORIES.map(category => {
            const Icon = category.icon;
            const isActive = activeTab === category.id;
            return (
              <button
                key={category.id}
                onClick={() => setActiveTab(category.id)}
                className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl transition ${
                  isActive 
                    ? "bg-white text-slate-900 shadow-sm border border-slate-200/50" 
                    : "text-slate-500 hover:text-slate-700 hover:bg-slate-100"
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? "text-[#2657F7]" : ""}`} />
                {category.label}
              </button>
            );
          })}
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input 
            type="text" 
            placeholder="Search files or addresses..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full sm:w-72 pl-9 pr-4 py-2.5 bg-white border border-slate-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-[#2657F7]/20 focus:border-[#2657F7] transition shadow-sm"
          />
        </div>
      </div>

      {/* Document Grid */}
      {filteredDocs.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 py-24 text-center">
          <FolderOpen className="mx-auto h-12 w-12 text-slate-300 mb-4" />
          <h3 className="text-lg font-semibold text-slate-900">No documents found</h3>
          <p className="mt-2 text-sm text-slate-500">
            {search 
              ? "Try adjusting your search terms or filters." 
              : `There are no documents uploaded for ${activeTab === 'all' ? 'any entity' : activeTab + 's'} yet.`}
          </p>
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {filteredDocs.map(doc => (
            <DocumentCard key={doc._id} doc={doc} />
          ))}
        </div>
      )}
    </div>
  );
}

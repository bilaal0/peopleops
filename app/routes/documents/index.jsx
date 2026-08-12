import { useState, useRef } from "react";
import { useLoaderData, useFetcher, redirect } from "react-router";
import { getUserFromRequest } from "../../utils/auth.server.js";
import { Document } from "../../models/document.server.js";
import { User } from "../../models/user.server.js";
import { DocumentType } from "../../models/documentType.server.js";
import { connect } from "../../config/db.server.js";
import { fmtDate } from "../../utils/date.js";
import UKDateInput from "../../components/ui/UKDateInput.jsx";
import {
  FileText, Download, AlertCircle, CheckCircle2, Clock,
  ShieldCheck, Search, Upload, X, FolderOpen, Plus, Trash2,
} from "lucide-react";

// ── Loader ────────────────────────────────────────────────────────────────────
export async function loader({ request }) {
  const user = await getUserFromRequest(request);
  if (!user) return redirect("/login");

  await connect();

  const organizationQuery = user.organizationId ? { organizationId: user.organizationId } : {};
  const staffRoles = ["EMPLOYEE", "REGISTERED_MANAGER", "ADMIN", "INITIAL_ADMIN", "MASTER_ADMIN", "SUPER_ADMIN"];

  const [docs, staffList, clientList, docTypes] = await Promise.all([
    Document.find({ ...organizationQuery, deleted: false })
      .populate("docType", "name")
      .sort({ createdAt: -1 })
      .lean()
      .catch(() => []),
    User.find({ ...organizationQuery, deleted: false, roles: { $in: staffRoles } })
      .select("_id firstName lastName jobTitle")
      .sort({ firstName: 1 })
      .lean()
      .catch(() => []),
    User.find({ ...organizationQuery, deleted: false, roles: "CLIENT" })
      .select("_id firstName lastName positionInCompany")
      .sort({ firstName: 1 })
      .lean()
      .catch(() => []),
    DocumentType.find({ isActive: true })
      .sort({ name: 1 })
      .lean()
      .catch(() => []),
  ]);

  return {
    documents: docs.map((d) => ({
      _id: d._id.toString(),
      fileName: d.fileName,
      title: d.title || null,
      docType: d.docType?.name || null,
      fileSize: d.fileSize || null,
      status: d.status || "pending",
      expiryDate: d.expiryDate || null,
      notes: d.notes || null,
      createdAt: d.createdAt,
    })),
    organizationId: user.organizationId?.toString() || null,
    documentTypes: docTypes.map(dt => ({ _id: dt._id.toString(), name: dt.name })),
    people: [
      ...staffList.map((u) => ({
        _id: u._id.toString(),
        name: `${u.firstName || ""} ${u.lastName || ""}`.trim() || "Staff Member",
        label: u.jobTitle || "Staff",
        entityType: "staff",
      })),
      ...clientList.map((u) => ({
        _id: u._id.toString(),
        name: `${u.firstName || ""} ${u.lastName || ""}`.trim() || "Client",
        label: u.positionInCompany || "Client",
        entityType: "client",
      })),
    ].sort((a, b) => a.name.localeCompare(b.name)),
  };
}

// ── Small helper components ───────────────────────────────────────────────────
function ExpiryBadge({ expiryDate }) {
  if (!expiryDate) return null;
  const days = Math.floor((new Date(expiryDate) - new Date()) / 86400000);
  if (days < 0) return (
    <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-700">
      <AlertCircle className="w-3 h-3" />Expired
    </span>
  );
  if (days <= 60) return (
    <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">
      <Clock className="w-3 h-3" />{days}d left
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
      <CheckCircle2 className="w-3 h-3" />Valid
    </span>
  );
}

function VerificationToggle({ documentId, currentStatus }) {
  const fetcher = useFetcher();
  const optimistic = fetcher.formData ? fetcher.formData.get("status") : currentStatus;
  const isVerified = optimistic === "verified";
  return (
    <fetcher.Form method="post" action="/documents/verify">
      <input type="hidden" name="documentId" value={documentId} />
      <input type="hidden" name="status" value={isVerified ? "pending" : "verified"} />
      <button
        type="submit"
        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold transition ${isVerified ? "border-green-200 bg-green-50 text-green-700" : "border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100"
          }`}
      >
        <ShieldCheck className={`w-3 h-3 ${isVerified ? "text-green-600" : "text-slate-400"}`} />
        {isVerified ? "Verified" : "Pending"}
      </button>
    </fetcher.Form>
  );
}

function DeleteButton({ documentId }) {
  const fetcher = useFetcher();
  const isDeleting = fetcher.state !== "idle";
  return (
    <fetcher.Form
      method="post"
      action="/documents/delete"
      onSubmit={(e) => { if (!confirm("Delete this document?")) e.preventDefault(); }}
    >
      <input type="hidden" name="documentId" value={documentId} />
      <button
        type="submit"
        disabled={isDeleting}
        title="Delete"
        className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-red-50 hover:text-red-500 transition disabled:opacity-40"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </fetcher.Form>
  );
}

function DocumentCard({ doc }) {
  const ext = doc.fileName?.split(".").pop()?.toUpperCase() || "FILE";
  return (
    <div className="group flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:shadow-md hover:border-slate-300 transition">
      <div>
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 font-bold text-[11px]">
            {ext.length <= 4 ? ext : <FileText className="h-5 w-5" />}
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <VerificationToggle documentId={doc._id} currentStatus={doc.status} />
            <ExpiryBadge expiryDate={doc.expiryDate} />
          </div>
        </div>
        <h3 className="text-sm font-semibold text-slate-900 line-clamp-2">{doc.title || doc.fileName}</h3>
        {doc.title && <p className="mt-0.5 text-xs text-slate-400 truncate">{doc.fileName}</p>}
        <div className="mt-2 flex flex-wrap gap-2">
          {doc.docType && (
            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">{doc.docType}</span>
          )}
          {doc.fileSize && (
            <span className="text-[10px] text-slate-400">{(doc.fileSize / 1024).toFixed(1)} KB</span>
          )}
        </div>
        {doc.notes && <p className="mt-3 text-xs text-slate-500 line-clamp-2 italic">{doc.notes}</p>}
      </div>
      <div className="mt-5 flex items-center justify-between pt-4 border-t border-slate-100">
        <span className="text-xs text-slate-400">{fmtDate(doc.createdAt)}</span>
        <div className="flex items-center gap-1">
          <DeleteButton documentId={doc._id} />
          <button
            type="button"
            onClick={() => window.open(`/documents/${doc._id}/download`, "_blank")}
            className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-indigo-50 hover:text-indigo-600 transition"
            title="Download"
          >
            <Download className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Upload Modal ──────────────────────────────────────────────────────────────
function UploadModal({ people, organizationId, documentTypes, onClose }) {
  const fetcher = useFetcher();
  const fileRef = useRef(null);
  const [fileName, setFileName] = useState("");
  const [selectedPersonId, setSelectedId] = useState("");

  const isSubmitting = fetcher.state !== "idle";
  const isSuccess = fetcher.data?.success;

  const selectedPerson = people.find((p) => p._id === selectedPersonId);
  const entityType = selectedPerson?.entityType || "staff";

  if (isSuccess) setTimeout(onClose, 700);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg rounded-2xl bg-white shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="text-sm font-bold text-slate-900">Upload Document</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form */}
        <fetcher.Form
          method="post"
          action="/documents/upload"
          encType="multipart/form-data"
          className="p-6 space-y-4 max-h-[80vh] overflow-y-auto"
        >
          <input type="hidden" name="entityType" value={entityType} />
          <input type="hidden" name="entityId" value={selectedPersonId} />
          <input type="hidden" name="organizationId" value={organizationId || ""} />

          {/* Person */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Person <span className="text-red-500">*</span>
            </label>
            <select
              required
              value={selectedPersonId}
              onChange={(e) => setSelectedId(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition"
            >
              <option value="" disabled>— Select staff or client —</option>
              <optgroup label="── Staff">
                {people.filter((p) => p.entityType === "staff").map((p) => (
                  <option key={p._id} value={p._id}>{p.name} ({p.label})</option>
                ))}
              </optgroup>
              <optgroup label="── Clients">
                {people.filter((p) => p.entityType === "client").map((p) => (
                  <option key={p._id} value={p._id}>{p.name} ({p.label})</option>
                ))}
              </optgroup>
            </select>
          </div>

          {/* File */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              File <span className="text-red-500">*</span>
            </label>
            <div
              className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 p-6 text-center cursor-pointer hover:border-indigo-300 hover:bg-indigo-50/30 transition"
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="h-7 w-7 text-slate-400" />
              {fileName
                ? <p className="text-sm font-semibold text-indigo-600 truncate max-w-xs">{fileName}</p>
                : <>
                  <p className="text-sm font-semibold text-slate-700">Click to choose a file</p>
                  <p className="text-xs text-slate-400">PDF, JPG or PNG — up to 10 MB</p>
                </>
              }
            </div>
            <input
              ref={fileRef}
              type="file"
              name="file"
              className="hidden"
              accept=".pdf,.jpg,.jpeg,.png"
              onChange={(e) => setFileName(e.target.files?.[0]?.name || "")}
            />
          </div>

          {/* Title */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Document Name <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            <input
              type="text"
              name="title"
              placeholder="e.g. DBS Certificate"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition"
            />
          </div>

          {/* Group */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">Group</label>
            <select
              name="docType"
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition"
              required
            >
              <option value="">Select a group...</option>
              {documentTypes.map(dt => (
                <option key={dt._id} value={dt._id}>{dt.name}</option>
              ))}
            </select>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Notes <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            <textarea
              name="notes"
              rows={2}
              placeholder="Any additional context..."
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition"
            />
          </div>

          {fetcher.data?.error && (
            <p className="text-sm text-red-600 font-medium">{fetcher.data.error}</p>
          )}
          {isSuccess && (
            <p className="text-sm text-green-600 font-semibold flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4" /> Uploaded successfully!
            </p>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !fileName || !selectedPersonId}
              className="flex-1 rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
            >
              {isSubmitting
                ? <><svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg>Uploading...</>
                : <><Upload className="h-4 w-4" />Upload</>
              }
            </button>
          </div>
        </fetcher.Form>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function DocumentsIndex() {
  const { documents = [], people = [], organizationId, documentTypes = [] } = useLoaderData();
  const [search, setSearch] = useState("");
  const [showUpload, setShowUpload] = useState(false);

  const filtered = documents.filter((d) => {
    const q = search.toLowerCase();
    return (
      d.fileName?.toLowerCase().includes(q) ||
      d.title?.toLowerCase().includes(q) ||
      d.docType?.toLowerCase().includes(q) ||
      d.notes?.toLowerCase().includes(q)
    );
  });

  const counts = {
    total: documents.length,
    verified: documents.filter((d) => d.status === "verified").length,
    pending: documents.filter((d) => d.status === "pending").length,
    expiring: documents.filter((d) => {
      if (!d.expiryDate) return false;
      const days = Math.floor((new Date(d.expiryDate) - new Date()) / 86400000);
      return days >= 0 && days <= 60;
    }).length,
  };

  return (
    <div className="mx-auto max-w-[1400px] p-6 space-y-6">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Document Vault</h1>
          <p className="mt-1 text-sm text-slate-500">Secure storage for staff and client documents.</p>
        </div>
        <button
          type="button"
          onClick={() => setShowUpload(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 transition"
        >
          <Plus className="h-4 w-4" />
          Upload Document
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total", value: counts.total, color: "text-slate-900" },
          { label: "Verified", value: counts.verified, color: "text-green-700" },
          { label: "Pending", value: counts.pending, color: "text-amber-700" },
          { label: "Expiring Soon", value: counts.expiring, color: "text-red-700" },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{s.label}</p>
            <p className={`mt-1 text-2xl font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <input
          type="text"
          placeholder="Search documents..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition shadow-sm"
        />
      </div>

      {/* Document grid */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-24 text-center">
          <FolderOpen className="mx-auto h-12 w-12 text-slate-300 mb-4" />
          <h3 className="text-lg font-semibold text-slate-900">No documents found</h3>
          <p className="mt-2 text-sm text-slate-500">
            {search ? "Try adjusting your search." : "Upload the first document to get started."}
          </p>
          {!search && (
            <button
              type="button"
              onClick={() => setShowUpload(true)}
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 transition"
            >
              <Upload className="h-4 w-4" /> Upload Document
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((doc) => (
            <DocumentCard key={doc._id} doc={doc} />
          ))}
        </div>
      )}

      {/* Upload modal */}
      {showUpload && (
        <UploadModal
          people={people}
          organizationId={organizationId}
          documentTypes={documentTypes}
          onClose={() => setShowUpload(false)}
        />
      )}
    </div>
  );
}

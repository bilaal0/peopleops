// routes/documents/index.jsx — PeopleOps Document Vault
// Generic document record-keeping for the agency — no entity-specific filtering.
import { useState, useRef } from "react";
import { useLoaderData, useFetcher } from "react-router";
import { getUserFromRequest } from "../../utils/auth.server.js";
import { redirect } from "react-router";
import { Document } from "../../models/document.server.js";
import { DocumentType } from "../../models/documentType.server.js";
import { connect } from "../../config/db.server.js";
import { fmtDate } from "../../utils/date.js";
import {
  FileText,
  Download,
  AlertCircle,
  CheckCircle2,
  Clock,
  ShieldCheck,
  Search,
  Upload,
  X,
  FolderOpen,
  Plus,
  Trash2,
} from "lucide-react";

// ── Loader ────────────────────────────────────────────────────────────────────
export async function loader({ request }) {
  const user = await getUserFromRequest(request);
  if (!user) return redirect("/login");
  if (!user.agencyId && !user.roles?.includes("SUPER_ADMIN")) return redirect("/dashboard");

  await connect();

  const docs = await Document.find({ agencyId: user.agencyId, deleted: false })
    .populate("docType", "name category")
    .sort({ createdAt: -1 })
    .lean();

  // Load doc types scoped to "general" for the upload modal
  const docTypes = await DocumentType.find({ isActive: true })
    .select("_id name category")
    .sort({ name: 1 })
    .lean();

  return {
    documents: docs.map((d) => ({
      _id:       d._id.toString(),
      fileName:  d.fileName,
      title:     d.title || null,
      docType:   d.docType ? { _id: d.docType._id.toString(), name: d.docType.name, category: d.docType.category } : null,
      fileSize:  d.fileSize || null,
      mimeType:  d.mimeType || null,
      status:    d.status || "pending",
      expiryDate: d.expiryDate || null,
      issueDate:  d.issueDate || null,
      notes:     d.notes || null,
      createdAt: d.createdAt,
    })),
    docTypes: docTypes.map((dt) => ({
      _id:      dt._id.toString(),
      name:     dt.name,
      category: dt.category,
    })),
    agencyId: user.agencyId?.toString() || null,
  };
}

// ── Helper components ─────────────────────────────────────────────────────────
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

function VerificationToggle({ documentId, currentStatus }) {
  const fetcher = useFetcher();
  const isSubmitting = fetcher.state !== "idle";
  const optimisticStatus = fetcher.formData ? fetcher.formData.get("status") : currentStatus;
  const isVerified = optimisticStatus === "verified";
  const nextStatus = isVerified ? "pending" : "verified";

  return (
    <fetcher.Form method="post" action="/documents/verify">
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
      onSubmit={(e) => {
        if (!confirm("Delete this document? This cannot be undone.")) e.preventDefault();
      }}
    >
      <input type="hidden" name="documentId" value={documentId} />
      <button
        type="submit"
        disabled={isDeleting}
        className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-50 text-slate-400 transition hover:bg-red-50 hover:text-red-500"
        title="Delete document"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </fetcher.Form>
  );
}

function DocumentCard({ doc }) {
  const ext = doc.fileName?.split(".").pop()?.toUpperCase() || "FILE";

  return (
    <div className="group relative flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md hover:border-slate-300">
      <div>
        <div className="flex items-start justify-between gap-3 mb-4">
          {/* File type icon */}
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 font-bold text-[11px]">
            {ext.length <= 4 ? ext : <FileText className="h-5 w-5" />}
          </div>
          <div className="flex flex-col items-end gap-2">
            <VerificationToggle documentId={doc._id} currentStatus={doc.status} />
            <ExpiryBadge expiryDate={doc.expiryDate} />
          </div>
        </div>

        {/* File name & title */}
        <h3 className="text-sm font-semibold text-slate-900 line-clamp-2 leading-snug" title={doc.fileName}>
          {doc.title || doc.fileName}
        </h3>
        {doc.title && (
          <p className="mt-0.5 text-xs text-slate-400 truncate">{doc.fileName}</p>
        )}

        {/* Doc type + size */}
        <div className="mt-2 flex items-center gap-2 flex-wrap">
          {doc.docType && (
            <span className="inline-block rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
              {doc.docType.name}
            </span>
          )}
          {doc.fileSize && (
            <span className="text-xs text-slate-400">{(doc.fileSize / 1024).toFixed(1)} KB</span>
          )}
        </div>

        {doc.notes && (
          <p className="mt-3 text-xs text-slate-500 line-clamp-2 italic">{doc.notes}</p>
        )}
      </div>

      {/* Footer */}
      <div className="mt-5 flex items-center justify-between pt-4 border-t border-slate-100">
        <span className="text-xs text-slate-400">{fmtDate(doc.createdAt)}</span>
        <div className="flex items-center gap-1">
          <DeleteButton documentId={doc._id} />
          <button
            type="button"
            onClick={() => window.open(`/documents/${doc._id}/download`, "_blank")}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-50 text-slate-500 transition hover:bg-indigo-50 hover:text-indigo-600"
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
function UploadModal({ docTypes, agencyId, onClose }) {
  const fetcher = useFetcher();
  const fileRef = useRef(null);
  const [fileName, setFileName] = useState("");
  const isSubmitting = fetcher.state !== "idle";
  const isSuccess = fetcher.data?.success;

  // Auto-close on success
  if (isSuccess) {
    setTimeout(onClose, 800);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="text-base font-bold text-slate-900">Upload Document</h2>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition">
            <X className="h-4 w-4" />
          </button>
        </div>

        <fetcher.Form
          method="post"
          action="/documents/upload"
          encType="multipart/form-data"
          className="p-6 space-y-4"
        >
          <input type="hidden" name="entityType" value="general" />
          <input type="hidden" name="entityId" value={agencyId || ""} />

          {/* File picker */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">File <span className="text-red-500">*</span></label>
            <div
              className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 p-6 text-center cursor-pointer hover:border-indigo-300 hover:bg-indigo-50/30 transition"
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="h-7 w-7 text-slate-400" />
              {fileName ? (
                <p className="text-sm font-semibold text-indigo-600 truncate max-w-xs">{fileName}</p>
              ) : (
                <>
                  <p className="text-sm font-semibold text-slate-700">Click to choose a file</p>
                  <p className="text-xs text-slate-400">PDF, Word, Excel, images — up to 20 MB</p>
                </>
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              name="file"
              className="hidden"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.webp"
              onChange={(e) => setFileName(e.target.files?.[0]?.name || "")}
            />
          </div>

          {/* Title */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">Title <span className="text-slate-400 font-normal">(optional)</span></label>
            <input
              type="text"
              name="title"
              placeholder="e.g. Staff DBS Certificate — John Smith"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition"
            />
          </div>

          {/* Document type */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">Document Type <span className="text-red-500">*</span></label>
            <select
              name="docType"
              required
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition bg-white"
            >
              <option value="">— Select type —</option>
              {docTypes.map((dt) => (
                <option key={dt._id} value={dt._id}>{dt.name}</option>
              ))}
            </select>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Issue Date</label>
              <input
                type="date"
                name="issueDate"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Expiry Date</label>
              <input
                type="date"
                name="expiryDate"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">Notes <span className="text-slate-400 font-normal">(optional)</span></label>
            <textarea
              name="notes"
              rows={2}
              placeholder="Any additional context..."
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition resize-none"
            />
          </div>

          {/* Error */}
          {fetcher.data?.error && (
            <p className="text-sm text-red-600 font-medium">{fetcher.data.error}</p>
          )}
          {isSuccess && (
            <p className="text-sm text-green-600 font-semibold flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" /> Document uploaded successfully!
            </p>
          )}

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
              disabled={isSubmitting || !fileName}
              className="flex-1 rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" />
                  Upload
                </>
              )}
            </button>
          </div>
        </fetcher.Form>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function DocumentsIndex() {
  const { documents, docTypes, agencyId } = useLoaderData();
  const [search, setSearch] = useState("");
  const [showUpload, setShowUpload] = useState(false);

  const filteredDocs = documents.filter((d) => {
    const q = search.toLowerCase();
    return (
      d.fileName?.toLowerCase().includes(q) ||
      d.title?.toLowerCase().includes(q) ||
      d.docType?.name?.toLowerCase().includes(q) ||
      d.notes?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="mx-auto max-w-[1400px] p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Document Vault</h1>
          <p className="mt-1 text-sm text-slate-500">
            Secure storage for all agency documents — certificates, policies, contracts, and more.
          </p>
        </div>
        <button
          onClick={() => setShowUpload(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 transition"
        >
          <Plus className="h-4 w-4" />
          Upload Document
        </button>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total", value: documents.length, color: "text-slate-900" },
          { label: "Verified", value: documents.filter((d) => d.status === "verified").length, color: "text-green-700" },
          { label: "Pending", value: documents.filter((d) => d.status === "pending").length, color: "text-amber-700" },
          { label: "Expiring Soon", value: documents.filter((d) => {
            if (!d.expiryDate) return false;
            const days = Math.floor((new Date(d.expiryDate) - new Date()) / 86400000);
            return days >= 0 && days <= 60;
          }).length, color: "text-red-700" },
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

      {/* Grid */}
      {filteredDocs.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-24 text-center">
          <FolderOpen className="mx-auto h-12 w-12 text-slate-300 mb-4" />
          <h3 className="text-lg font-semibold text-slate-900">No documents found</h3>
          <p className="mt-2 text-sm text-slate-500">
            {search ? "Try adjusting your search." : "Upload your first document to get started."}
          </p>
          {!search && (
            <button
              onClick={() => setShowUpload(true)}
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 transition"
            >
              <Upload className="h-4 w-4" />
              Upload Document
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredDocs.map((doc) => (
            <DocumentCard key={doc._id} doc={doc} />
          ))}
        </div>
      )}

      {/* Upload modal */}
      {showUpload && (
        <UploadModal
          docTypes={docTypes}
          agencyId={agencyId}
          onClose={() => setShowUpload(false)}
        />
      )}
    </div>
  );
}

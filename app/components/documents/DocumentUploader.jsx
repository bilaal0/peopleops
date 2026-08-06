// components/documents/DocumentUploader.jsx
// Reusable upload + document list component for any entity.
// Usage: <DocumentUploader entityType="landlord" entityId={l._id} docTypes={LANDLORD_DOC_TYPES} docs={documents} layout="grid" />
import { useState, useRef, useEffect, useCallback, lazy, Suspense } from "react";
import { useFetcher } from "react-router-dom";
import { fmtDate } from "../../utils/date.js";
import UKDateInput from "../ui/UKDateInput.jsx";

// Lazy import keeps react-pdf out of the SSR bundle (DOMMatrix is browser-only)
const DocumentViewer = lazy(() => import("./DocumentViewer.jsx"));

// ── Expiry badge ──────────────────────────────────────────────────────────────
function ExpiryBadge({ expiryDate }) {
  if (!expiryDate) return null;
  const today  = new Date();
  const expiry = new Date(expiryDate);
  const days   = Math.floor((expiry - today) / (1000 * 60 * 60 * 24));

  let cls, label;
  if (days < 0)   { cls = "bg-red-100 text-red-700 border-red-200";    label = `Expired ${Math.abs(days)}d ago`; }
  else if (days <= 60) { cls = "bg-amber-100 text-amber-700 border-amber-200"; label = `Expires in ${days}d`; }
  else            { cls = "bg-green-100 text-green-700 border-green-200"; label = `Valid until ${fmtDate(expiryDate)}`; }

  return (
    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold border ${cls}`}>{label}</span>
  );
}

// ── Verification badge ────────────────────────────────────────────────────────
function VerificationBadge({ status }) {
  let cls, label, icon;
  switch (status) {
    case "verified":
      cls = "bg-green-100 text-green-700 border-green-200";
      label = "Verified";
      icon = <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />;
      break;
    case "rejected":
      cls = "bg-red-100 text-red-700 border-red-200";
      label = "Rejected";
      icon = <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />;
      break;
    default:
      cls = "bg-amber-50 text-amber-700 border-amber-200";
      label = "Pending Review";
      icon = <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />;
  }

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold border ${cls}`}>
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        {icon}
      </svg>
      {label}
    </span>
  );
}

// ── Status badge for cards ───────────────────────────────────────────────────
function StatusBadge({ latestDoc }) {
  if (!latestDoc) {
    return (
      <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full border bg-gray-50 border-gray-200 text-gray-400">
        Missing
      </span>
    );
  }
  let cls = "";
  let text = "";
  switch (latestDoc.status) {
    case "verified":
      cls = "bg-green-50 border-green-200 text-green-700";
      text = "Verified";
      break;
    case "rejected":
      cls = "bg-red-50 border-red-200 text-red-700";
      text = "Rejected";
      break;
    default:
      cls = "bg-amber-50 border-amber-200 text-amber-700";
      text = "Pending Review";
  }
  return (
    <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${cls}`}>
      {text}
    </span>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function DocumentUploader({ entityType, entityId, docTypes, docs = [], isAdmin = false, currentUserName, layout = "list" }) {
  const fetcher   = useFetcher();
  const fileRef   = useRef(null);
  const [form, setForm] = useState({ docType: docTypes[0]?._id || "", title: "", issueDate: "", expiryDate: "", notes: "", epcRating: "" });
  const [localDocs, setLocalDocs] = useState(docs);
  
  // Modal states for grid layout
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [preselectedDocTypeId, setPreselectedDocTypeId] = useState(null);

  // Get the currently selected doc type object for conditional fields
  const selectedDocType = docTypes.find(dt => dt._id === form.docType);

  // Sync server data (like newly verified status) to local list upon React Router revalidation
  useEffect(() => {
    setLocalDocs(docs);
  }, [docs]);

  const isUploading = fetcher.state !== "idle";
  const uploadError = fetcher.data?.error;

  // Append newly uploaded doc to local list without page reload
  useEffect(() => {
    if (fetcher.data?.success && fetcher.data?.documentId && !localDocs.find(d => d._id === fetcher.data.documentId)) {
      const file = fileRef.current?.files?.[0];
      const matchedDocType = docTypes.find(dt => dt._id === form.docType);
      setLocalDocs(prev => [{
        _id:        fetcher.data.documentId,
        docType:    matchedDocType ? { _id: matchedDocType._id, name: matchedDocType.name } : { _id: form.docType, name: "Other" },
        title:      form.title || null,
        fileName:   file?.name || "Uploaded file",
        fileSize:   file?.size,
        mimeType:   file?.type || "application/octet-stream",
        status:     "pending",
        issueDate:  form.issueDate || null,
        expiryDate: form.expiryDate || null,
        notes:      form.notes || null,
        createdAt:  new Date().toISOString(),
      }, ...prev]);
      // Reset form
      setForm({ docType: docTypes[0]?._id || "", title: "", issueDate: "", expiryDate: "", notes: "", epcRating: "" });
      if (fileRef.current) fileRef.current.value = "";
      setIsUploadModalOpen(false); // Close Modal on success
      setPreselectedDocTypeId(null);
    }
  }, [fetcher.data]);

  // Close upload modal on Escape key
  useEffect(() => {
    if (!isUploadModalOpen) return;
    const handler = (e) => { if (e.key === "Escape") setIsUploadModalOpen(false); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isUploadModalOpen]);

  const handleOpenUploadModal = (docTypeId = null) => {
    setPreselectedDocTypeId(docTypeId);
    setForm({
      docType: docTypeId || docTypes[0]?._id || "",
      title: "",
      issueDate: "",
      expiryDate: "",
      notes: "",
      epcRating: ""
    });
    if (fileRef.current) fileRef.current.value = "";
    setIsUploadModalOpen(true);
  };

  function formatSize(bytes) {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  // ── UPLOAD FORM RENDERER (Reusable for inline and modal) ────────────────────
  const renderUploadForm = () => (
    <fetcher.Form
      method="post"
      action="/documents/upload"
      encType="multipart/form-data"
      className="space-y-4"
    >
      <input type="hidden" name="entityType" value={entityType} />
      <input type="hidden" name="entityId"   value={entityId}   />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Document type */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Document Type</label>
          {preselectedDocTypeId ? (
            <>
              <select
                disabled
                value={form.docType}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-500 cursor-not-allowed"
              >
                {docTypes.map(t => (
                  <option key={t._id} value={t._id}>{t.name}</option>
                ))}
              </select>
              <input type="hidden" name="docType" value={form.docType} />
            </>
          ) : (
            <select
              name="docType"
              value={form.docType}
              onChange={e => setForm(f => ({ ...f, docType: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white"
            >
              {docTypes.map(t => (
                <option key={t._id} value={t._id}>{t.name}</option>
              ))}
            </select>
          )}
        </div>

        {/* Title */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Title <span className="text-gray-400 font-normal">(optional)</span></label>
          <input
            type="text"
            name="title"
            value={form.title}
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            placeholder="e.g. 2026 Passport Verification"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>

        {/* Issue date — shown for doc types with expiry */}
        {selectedDocType?.hasExpiry && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Issue Date
              {selectedDocType?.expiryDays && (
                <span className="text-gray-400 font-normal ml-1">(expiry auto-calculated: +{selectedDocType.expiryDays} days)</span>
              )}
            </label>
            <UKDateInput
              name="issueDate"
              value={form.issueDate}
              onChange={e => setForm(f => ({ ...f, issueDate: e.target.value }))}
            />
          </div>
        )}

        {/* Expiry date — shown for doc types with expiry, but only if no auto-calc */}
        {selectedDocType?.hasExpiry && !selectedDocType?.expiryDays && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Expiry Date</label>
            <UKDateInput
              name="expiryDate"
              value={form.expiryDate}
              onChange={e => setForm(f => ({ ...f, expiryDate: e.target.value }))}
            />
          </div>
        )}
        
        {/* Conditional EPC Rating */}
        {selectedDocType?.key === "epc" && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">EPC Rating</label>
            <select
              name="epcRating"
              value={form.epcRating}
              onChange={e => setForm(f => ({ ...f, epcRating: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              required
            >
              <option value="">Select Rating</option>
              {["A", "B", "C", "D", "E", "F", "G"].map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* File picker */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">File</label>
        <input
          ref={fileRef}
          type="file"
          name="file"
          accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
          required
          className="w-full text-sm text-gray-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-indigo-50 file:text-indigo-700 file:font-medium file:text-sm hover:file:bg-indigo-100 cursor-pointer"
        />
        <p className="text-xs text-gray-400 mt-1">Accepted: PDF, JPG, PNG, DOC, DOCX · Max 10 MB</p>
      </div>

      {/* Notes */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Notes <span className="text-gray-400 font-normal">(optional)</span></label>
        <textarea
          name="notes"
          value={form.notes}
          onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
          rows={2}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          placeholder="Any additional notes…"
        />
      </div>

      {uploadError && (
        <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2 border border-red-150">{uploadError}</p>
      )}

      <div className="flex justify-end gap-3 pt-2">
        {layout === "grid" && (
          <button
            type="button"
            onClick={() => setIsUploadModalOpen(false)}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={isUploading}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition"
        >
          {isUploading ? (
            <>
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4}/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
              </svg>
              Uploading…
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
              Upload Document
            </>
          )}
        </button>
      </div>
    </fetcher.Form>
  );

  // ── RENDER GRID LAYOUT ─────────────────────────────────────────────────────
  if (layout === "grid") {
    return (
      <div className="space-y-6">
        {/* Header Controls */}
        <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-gray-200">
          <div>
            <h3 className="text-base font-bold text-gray-900">Documents</h3>
            <p className="text-xs text-gray-500 mt-0.5">View and manage uploaded files.</p>
          </div>
          <button
            onClick={() => handleOpenUploadModal(null)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 transition shadow-sm"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Upload Document
          </button>
        </div>

        {/* Cards Grid */}
        {localDocs.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
            <svg className="w-12 h-12 text-gray-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
            <h3 className="font-semibold text-gray-700 text-sm">No documents uploaded yet</h3>
            <p className="text-xs text-gray-400 mt-1">Click the button above to upload your first document.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {localDocs.map(doc => {
              return (
                <div key={doc._id} className="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition flex flex-col justify-between h-full min-h-[220px]">
                  {/* Header */}
                  <div className="p-5 border-b border-gray-100 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h4 className="font-bold text-gray-955 text-sm truncate" title={doc.title || doc.docType?.name || "Other Document"}>
                        {doc.title || doc.docType?.name || "Other Document"}
                      </h4>
                      <span className="text-[10px] font-semibold text-indigo-600 bg-indigo-50 border border-indigo-100 rounded px-1.5 py-0.5 mt-1 inline-block uppercase tracking-wider">
                        {doc.docType?.name || "Other"}
                      </span>
                    </div>
                    <StatusBadge latestDoc={doc} />
                  </div>

                  {/* Body */}
                  <div className="p-5 flex-grow flex flex-col justify-between">
                    <div className="space-y-3">
                      <div className="flex items-start gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 flex-shrink-0">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                          </svg>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-gray-800 truncate" title={doc.fileName}>{doc.fileName}</p>
                          <p className="text-[10px] text-gray-400 mt-0.5 font-medium">
                            Uploaded {fmtDate(doc.createdAt)} {doc.fileSize && `· ${formatSize(doc.fileSize)}`}
                          </p>
                        </div>
                      </div>

                      {/* Expiry info */}
                      {doc.expiryDate && (
                        <div className="pt-2 border-t border-gray-50 flex items-center justify-between text-xs">
                          <span className="text-gray-400 font-medium">Expiry:</span>
                          <ExpiryBadge expiryDate={doc.expiryDate} />
                        </div>
                      )}
                      
                      {doc.notes && (
                        <p className="text-[11px] text-gray-500 italic truncate mt-1 bg-gray-50 p-1.5 rounded" title={doc.notes}>
                          Note: {doc.notes}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Footer / Actions */}
                  <div className="p-4 bg-gray-50/50 border-t border-gray-100 flex items-center justify-between gap-2 rounded-b-xl">
                    <div className="flex items-center justify-between w-full">
                      <div className="flex items-center gap-2">
                        <Suspense fallback={null}>
                          <DocumentViewer
                            documentId={doc._id}
                            fileName={doc.fileName}
                            mimeType={doc.mimeType || "application/octet-stream"}
                            uploadedBy={doc.uploadedBy ? `${doc.uploadedBy.title ? doc.uploadedBy.title + ' ' : ''}${doc.uploadedBy.firstName} ${doc.uploadedBy.lastName}` : "Unknown"}
                            uploadedAt={doc.createdAt}
                            status={doc.status || "pending"}
                            docTypeName={doc.docType?.name || "Other"}
                            currentUserName={currentUserName}
                            isAdmin={isAdmin}
                          />
                        </Suspense>
                        {doc.s3Key && (
                          <a
                            href={`/documents/s3-download?key=${encodeURIComponent(doc.s3Key)}&download=1`}
                            className="inline-flex items-center justify-center px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-xs font-semibold text-gray-600 hover:bg-gray-50 hover:text-gray-800 transition"
                            title="Download document"
                          >
                            Download
                          </a>
                        )}
                      </div>
                      <button
                        onClick={() => handleOpenUploadModal(doc.docType?._id || null)}
                        className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold transition"
                      >
                        Replace
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Modal Overlay for Grid Upload */}
        {isUploadModalOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm"
            onClick={(e) => { if (e.target === e.currentTarget) setIsUploadModalOpen(false); }}
          >
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
              {/* Modal Header */}
              <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100 bg-white">
                <div>
                  <h3 className="text-base font-bold text-gray-900">
                    {preselectedDocTypeId 
                      ? `Upload ${docTypes.find(dt => dt._id === preselectedDocTypeId)?.name}` 
                      : "Upload Document"
                    }
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">Please provide files and relevant dates for the document.</p>
                </div>
                <button
                  onClick={() => setIsUploadModalOpen(false)}
                  className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6">
                {renderUploadForm()}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── RENDER STANDARD LIST LAYOUT (Backward Compatibility) ───────────────────
  return (
    <div className="space-y-5">
      {/* Upload form */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">Upload Document</h3>
        {renderUploadForm()}
      </div>

      {/* Document list */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
            Documents <span className="ml-2 text-gray-400 font-normal normal-case">({localDocs.length})</span>
          </h3>
        </div>

        {localDocs.length === 0 ? (
          <div className="text-center py-12">
            <svg className="w-10 h-10 text-gray-200 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
            <p className="text-sm text-gray-400">No documents uploaded yet</p>
          </div>
        ) : (
          <div className="p-4">
            <table id="tbl-docs" className="min-w-full" style={{ width: "100%" }}>
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Document</th>
                  <th className="text-left py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Details</th>
                  <th className="text-left py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {localDocs.map(doc => (
                  <tr key={doc._id} className="group hover:bg-gray-50/80 transition">
                    <td className="py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center group-hover:bg-white transition">
                          <svg className="w-5 h-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                          </svg>
                        </div>
                        <div className="min-w-0 max-w-[200px] sm:max-w-[300px]">
                          <p className="text-sm font-semibold text-gray-900 truncate" title={doc.fileName}>{doc.fileName}</p>
                          <p className="text-xs text-gray-400 mt-0.5" suppressHydrationWarning>{fmtDate(doc.createdAt)}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-4">
                      <div className="flex flex-col gap-1">
                        <span className="text-xs text-gray-600 font-medium">
                          {doc.docType?.name || "Other"}
                        </span>
                        <div className="flex items-center gap-2">
                          {doc.fileSize && <span className="text-[10px] text-gray-300 font-mono">{formatSize(doc.fileSize)}</span>}
                          {doc.expiryDate && <ExpiryBadge expiryDate={doc.expiryDate} />}
                        </div>
                      </div>
                    </td>
                    <td className="py-4">
                      <VerificationBadge status={doc.status || "pending"} />
                    </td>
                    <td className="py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Suspense fallback={null}>
                          <DocumentViewer
                            documentId={doc._id}
                            fileName={doc.fileName}
                            mimeType={doc.mimeType || "application/octet-stream"}
                            uploadedBy={doc.uploadedBy ? `${doc.uploadedBy.title ? doc.uploadedBy.title + ' ' : ''}${doc.uploadedBy.firstName} ${doc.uploadedBy.lastName}` : "Unknown"}
                            uploadedAt={doc.createdAt}
                            status={doc.status || "pending"}
                            docTypeName={doc.docType?.name || "Unknown"}
                            currentUserName={currentUserName}
                            isAdmin={isAdmin}
                          />
                        </Suspense>
                        {doc.s3Key && (
                          <a
                            href={`/documents/s3-download?key=${encodeURIComponent(doc.s3Key)}&download=1`}
                            className="inline-flex items-center justify-center px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-xs font-semibold text-gray-600 hover:bg-gray-50 hover:text-gray-800 transition"
                          >
                            Download
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

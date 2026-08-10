import { useState, useRef } from "react";
import { redirect, useLoaderData, useNavigate, Link, Form, useFetcher } from "react-router";
import { getUserFromRequest } from "../../../utils/auth.server.js";
import { User } from "../../../models/user.server.js";
import { Document } from "../../../models/document.server.js";
import { connect } from "../../../config/db.server.js";
import { fmtDate } from "../../../utils/date.js";
import UKDateInput from "../../../components/ui/UKDateInput.jsx";
import {
  FileText, Download, Upload, ShieldCheck, AlertCircle,
  CheckCircle2, Clock, X, Plus, Trash2,
} from "lucide-react";

export async function loader({ params, request }) {
  const user = await getUserFromRequest(request);
  if (!user) return redirect("/login");

  await connect();

  const clientUser = await User.findOne({ _id: params.id, deleted: false }).lean();
  if (!clientUser) throw new Response("Client User Not Found", { status: 404 });

  const docs = await Document.find({ entityId: params.id, deleted: false })
    .populate("docType", "name")
    .sort({ createdAt: -1 })
    .lean();

  return {
    client: {
      ...clientUser,
      _id: clientUser._id.toString(),
      agencyId: clientUser.agencyId?.toString(),
    },
    documents: docs.map((d) => ({
      _id:        d._id.toString(),
      fileName:   d.fileName,
      title:      d.title || null,
      docType:    d.docType ? { name: d.docType.name } : null,
      fileSize:   d.fileSize || null,
      status:     d.status || "pending",
      expiryDate: d.expiryDate || null,
      notes:      d.notes || null,
      createdAt:  d.createdAt,
    })),
    agencyId: user.agencyId?.toString() || null,
  };
}

// ── Small helpers ─────────────────────────────────────────────────────────────
function ExpiryBadge({ expiryDate }) {
  if (!expiryDate) return null;
  const days = Math.floor((new Date(expiryDate) - new Date()) / 86400000);
  if (days < 0)
    return <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-700"><AlertCircle className="w-3 h-3" />Expired</span>;
  if (days <= 60)
    return <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700"><Clock className="w-3 h-3" />{days}d left</span>;
  return <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700"><CheckCircle2 className="w-3 h-3" />Valid</span>;
}

function VerificationToggle({ documentId, currentStatus }) {
  const fetcher = useFetcher();
  const optimisticStatus = fetcher.formData ? fetcher.formData.get("status") : currentStatus;
  const isVerified = optimisticStatus === "verified";
  return (
    <fetcher.Form method="post" action="/documents/verify">
      <input type="hidden" name="documentId" value={documentId} />
      <input type="hidden" name="status" value={isVerified ? "pending" : "verified"} />
      <button type="submit" className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold transition ${isVerified ? "border-green-200 bg-green-50 text-green-700" : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"}`}>
        <ShieldCheck className={`w-3 h-3 ${isVerified ? "text-green-600" : "text-slate-400"}`} />
        {isVerified ? "Verified" : "Pending"}
      </button>
    </fetcher.Form>
  );
}

function DocDeleteButton({ documentId }) {
  const fetcher = useFetcher();
  return (
    <fetcher.Form method="post" action="/documents/delete" onSubmit={(e) => { if (!confirm("Delete this document?")) e.preventDefault(); }}>
      <input type="hidden" name="documentId" value={documentId} />
      <button type="submit" className="flex h-7 w-7 items-center justify-center rounded-full text-slate-400 hover:bg-red-50 hover:text-red-500 transition" title="Delete">
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </fetcher.Form>
  );
}

// ── Upload modal ──────────────────────────────────────────────────────────────
function UploadModal({ clientId, agencyId, onClose }) {
  const fetcher = useFetcher();
  const fileRef = useRef(null);
  const [fileName, setFileName] = useState("");
  const isSubmitting = fetcher.state !== "idle";
  if (fetcher.data?.success) setTimeout(onClose, 600);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-sm font-bold text-slate-900">Upload Document</h2>
          <button onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 transition"><X className="h-4 w-4" /></button>
        </div>
        <fetcher.Form method="post" action="/documents/upload" encType="multipart/form-data" className="p-5 space-y-4">
          <input type="hidden" name="entityType" value="client" />
          <input type="hidden" name="entityId" value={clientId} />
          <input type="hidden" name="agencyId" value={agencyId || ""} />

          {/* File drop zone */}
          <div
            className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 p-5 text-center cursor-pointer hover:border-emerald-300 hover:bg-emerald-50/30 transition"
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="h-6 w-6 text-slate-400" />
            {fileName
              ? <p className="text-sm font-semibold text-emerald-600 truncate max-w-xs">{fileName}</p>
              : <>
                  <p className="text-sm font-semibold text-slate-700">Click to choose a file</p>
                  <p className="text-xs text-slate-400">PDF, JPG or PNG — up to 10 MB</p>
                </>
            }
          </div>
          <input ref={fileRef} type="file" name="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => setFileName(e.target.files?.[0]?.name || "")} />

          {/* Title */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Title <span className="text-slate-400 font-normal">(optional)</span></label>
            <input type="text" name="title" placeholder="e.g. Care Plan" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 transition" />
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Issue Date</label>
              <UKDateInput name="issueDate" placeholder="DD/MM/YYYY" className="rounded-lg border-slate-200 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Expiry Date</label>
              <UKDateInput name="expiryDate" placeholder="DD/MM/YYYY" className="rounded-lg border-slate-200 text-sm" />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Notes <span className="text-slate-400 font-normal">(optional)</span></label>
            <textarea name="notes" rows={2} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 transition" />
          </div>

          {fetcher.data?.error && <p className="text-sm text-red-600">{fetcher.data.error}</p>}
          {fetcher.data?.success && <p className="text-sm text-green-600 font-semibold flex items-center gap-1"><CheckCircle2 className="h-4 w-4" />Uploaded!</p>}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 rounded-lg border border-slate-200 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition">Cancel</button>
            <button type="submit" disabled={isSubmitting || !fileName} className="flex-1 rounded-lg bg-emerald-600 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 transition flex items-center justify-center gap-2">
              {isSubmitting ? "Uploading..." : <><Upload className="h-3.5 w-3.5" />Upload</>}
            </button>
          </div>
        </fetcher.Form>
      </div>
    </div>
  );
}

// ── Documents tab panel ───────────────────────────────────────────────────────
function DocumentsPanel({ documents, clientId, agencyId }) {
  const [showUpload, setShowUpload] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{documents.length} document{documents.length !== 1 ? "s" : ""}</p>
        <button onClick={() => setShowUpload(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 transition">
          <Plus className="h-3.5 w-3.5" />Upload Document
        </button>
      </div>

      {documents.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 py-14 text-center">
          <FileText className="mx-auto h-10 w-10 text-slate-300 mb-3" />
          <p className="text-sm font-semibold text-slate-700">No documents yet</p>
          <p className="text-xs text-slate-400 mt-1">Upload the first document for this client.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {documents.map((doc) => {
            const ext = doc.fileName?.split(".").pop()?.toUpperCase() || "FILE";
            return (
              <div key={doc._id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 hover:border-slate-300 transition">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 font-bold text-[11px]">
                  {ext.length <= 4 ? ext : <FileText className="h-4 w-4" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900 truncate">{doc.title || doc.fileName}</p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    {doc.docType && <span className="text-[10px] font-medium text-slate-500">{doc.docType.name}</span>}
                    <span className="text-[10px] text-slate-400">{fmtDate(doc.createdAt)}</span>
                    {doc.fileSize && <span className="text-[10px] text-slate-400">{(doc.fileSize / 1024).toFixed(1)} KB</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <ExpiryBadge expiryDate={doc.expiryDate} />
                  <VerificationToggle documentId={doc._id} currentStatus={doc.status} />
                  <button onClick={() => window.open(`/documents/${doc._id}/download`, "_blank")} className="flex h-7 w-7 items-center justify-center rounded-full text-slate-400 hover:bg-emerald-50 hover:text-emerald-600 transition" title="Download">
                    <Download className="h-3.5 w-3.5" />
                  </button>
                  <DocDeleteButton documentId={doc._id} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showUpload && <UploadModal clientId={clientId} agencyId={agencyId} onClose={() => setShowUpload(false)} />}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ClientDetailPage() {
  const { client, documents, agencyId } = useLoaderData();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("profile");

  const fullName = `${client.title ? client.title + " " : ""}${client.firstName || ""} ${client.lastName || ""}`.trim();
  const isCompany = Boolean(client.landlordData?.isCompany);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 mb-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-4">
              <button onClick={() => navigate("/user-accounts/client")} className="flex items-center justify-center h-9 w-9 rounded-lg border border-gray-300 hover:bg-gray-50 transition cursor-pointer">
                <svg className="w-4 h-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
              </button>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">{fullName || "Client Profile"}</h1>
                <p className="mt-1 text-sm text-gray-600">
                  {isCompany ? `Company Client: ${client.landlordData?.companyName || "Corporate Body"}` : "Individual Client Account"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Link to={`/user-accounts/client/${client._id}/edit`} className="px-4 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 text-sm font-semibold hover:bg-gray-50 transition shadow-xs flex items-center gap-1.5">
                <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                Edit Client
              </Link>
              <Form method="post" action={`/user-accounts/client/${client._id}/delete`} onSubmit={(e) => { if (!confirm("Delete this client account?")) e.preventDefault(); }}>
                <button type="submit" className="px-4 py-2 rounded-lg bg-red-50 text-red-700 border border-red-200 text-sm font-semibold hover:bg-red-100 transition flex items-center gap-1.5 cursor-pointer">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  Delete
                </button>
              </Form>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mt-6 border-b border-gray-200">
            {[
              { key: "profile",   label: "Profile" },
              { key: "documents", label: `Documents${documents.length > 0 ? ` (${documents.length})` : ""}` },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={`px-4 py-2 text-sm font-semibold rounded-t-lg border-b-2 transition cursor-pointer ${
                  activeTab === key
                    ? "border-emerald-600 text-emerald-600"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
        {activeTab === "profile" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Main Info Card */}
            <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-6 shadow-xs space-y-6">
              <div className="flex items-center gap-4 pb-6 border-b border-gray-100">
                <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-700 font-bold text-2xl flex items-center justify-center border border-emerald-200">
                  {client.firstName?.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">{fullName}</h2>
                  <p className="text-sm text-gray-500">{client.email}</p>
                  <div className="mt-2 flex items-center gap-2">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${isCompany ? "bg-purple-100 text-purple-800" : "bg-blue-100 text-blue-800"}`}>
                      {isCompany ? "Company Client" : "Individual Client"}
                    </span>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${client.status === 1 ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"}`}>
                      {client.status === 1 ? "Active Account" : "Inactive Account"}
                    </span>
                  </div>
                </div>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-3">Client Overview</h3>
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                  <div><dt className="text-gray-500 text-xs">Position / Role</dt><dd className="font-medium text-gray-900 mt-0.5">{client.positionInCompany || "—"}</dd></div>
                  {isCompany && (
                    <>
                      <div><dt className="text-gray-500 text-xs">Company Name</dt><dd className="font-medium text-gray-900 mt-0.5">{client.landlordData?.companyName || "—"}</dd></div>
                      <div><dt className="text-gray-500 text-xs">Company Number</dt><dd className="font-medium text-gray-900 mt-0.5">{client.landlordData?.companyNumber || "—"}</dd></div>
                    </>
                  )}
                  <div><dt className="text-gray-500 text-xs">Ethnicity</dt><dd className="font-medium text-gray-900 mt-0.5">{client.ethnicity || "—"}</dd></div>
                  <div><dt className="text-gray-500 text-xs">Gender</dt><dd className="font-medium text-gray-900 mt-0.5">{client.gender || "—"}</dd></div>
                </dl>
              </div>
              <div className="pt-6 border-t border-gray-100">
                <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-3">Address Information</h3>
                <p className="text-sm text-gray-700">
                  {client.addressLine1 ? (
                    <>{client.addressLine1}{client.addressLine2 && <><br />{client.addressLine2}</>}{(client.postTown || client.city) && <><br />{client.postTown || client.city}</>}{client.postcode && <><br />{client.postcode}</>}</>
                  ) : <span className="text-gray-400 italic">No address provided.</span>}
                </p>
              </div>
            </div>
            {/* Sidebar */}
            <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-xs space-y-4 h-fit">
              <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider pb-2 border-b border-gray-100">Account Metadata</h3>
              <div className="space-y-3 text-sm">
                <div><span className="text-xs text-gray-500 block">System User ID</span><span className="font-mono text-xs text-gray-700 bg-gray-50 px-2 py-1 rounded border border-gray-200 block mt-1 break-all">{client._id}</span></div>
                <div><span className="text-xs text-gray-500 block">Telephone Number</span><span className="font-medium text-gray-900">{client.phone || client.telephoneNo || "—"}</span></div>
                <div><span className="text-xs text-gray-500 block">Created On</span><span className="font-medium text-gray-900">{client.createdAt ? new Date(client.createdAt).toLocaleDateString("en-GB") : "—"}</span></div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "documents" && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-xs">
            <DocumentsPanel documents={documents} clientId={client._id} agencyId={agencyId} />
          </div>
        )}
      </div>
    </div>
  );
}

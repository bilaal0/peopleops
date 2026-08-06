// components/documents/DocumentViewer.jsx
// Modal viewer for uploaded documents with embedded metadata and verification flow.

import { useState, useEffect, useCallback } from "react";
import { useFetcher } from "react-router-dom";
import { fmtDate } from "../../utils/date.js"; // Optional: we can just format it natively

const IMAGE_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"];

// Extracted format date helper for "Name on YYYY/MM/DD HH:mm"
function formatUploadDate(dateString) {
  if (!dateString) return "";
  const d = new Date(dateString);
  const pad = (n) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Document Renderers
// ─────────────────────────────────────────────────────────────────────────────

function NativePdfViewer({ url }) {
  // Use built-in browser native viewer. 
  const viewerUrl = `${url}#toolbar=1&navpanes=0&view=FitH`;

  return (
    <div className="absolute inset-0 bg-[#f4f4f5]">
      <iframe
        src={viewerUrl}
        className="w-full h-full border-0"
        title="PDF Viewer"
      />
    </div>
  );
}

function ImageViewer({ url, fileName }) {
  return (
    <div className="absolute inset-0 flex justify-center items-center bg-[#f4f4f5] p-8">
      <div className="relative w-full h-full flex justify-center items-center">
        <img
          src={url}
          alt={fileName}
          className="max-w-full max-h-full object-contain drop-shadow-sm rounded-md"
        />
      </div>
    </div>
  );
}

function UnsupportedViewer({ url, fileName }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#f4f4f5] text-center p-8">
      <div className="w-16 h-16 rounded-full bg-indigo-50 flex items-center justify-center mb-4 ring-4 ring-indigo-50/50">
        <svg className="w-8 h-8 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
        </svg>
      </div>
      <p className="text-gray-900 font-semibold text-lg">Preview not available</p>
      <p className="text-sm text-gray-500 mt-2 max-w-xs leading-relaxed">This file type cannot be previewed directly in the browser.</p>
    </div>
  );
}

function Spinner() {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#f4f4f5]">
      <svg className="w-10 h-10 animate-spin text-indigo-600 mb-4" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
      </svg>
      <span className="text-sm text-gray-600 font-medium tracking-wide">Securing connection…</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export default function DocumentViewer({ 
  documentId, 
  fileName, 
  mimeType,
  uploadedBy,
  uploadedAt,
  status,
  docTypeName,
  currentUserName,
  isAdmin
}) {
  const [isOpen, setIsOpen]           = useState(false);
  const [signedUrl, setSignedUrl]     = useState(null);
  const [resolvedMime, setResolvedMime] = useState(mimeType);
  const [checked, setChecked]         = useState(false);
  
  const fetcher       = useFetcher();
  const verifyFetcher = useFetcher();

  const handleOpen = useCallback(() => {
    setIsOpen(true);
    setChecked(false); // Reset check state on modal open
    setSignedUrl(null);
    fetcher.load(`/documents/${documentId}/download`);
  }, [documentId]);

  useEffect(() => {
    if (fetcher.data?.url) {
      setSignedUrl(fetcher.data.url);
      setResolvedMime(fetcher.data.mimeType || mimeType);
    }
  }, [fetcher.data]);

  function handleClose() {
    setIsOpen(false);
    setSignedUrl(null);
  }

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => { if (e.key === "Escape") handleClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen]);

  const handleVerifySubmit = () => {
    if (!checked) return;
    verifyFetcher.submit(
      { documentId, status: "verified" },
      { method: "post", action: "/documents/verify" }
    );
  };

  const isGeneratingLink = fetcher.state !== "idle" || (isOpen && !signedUrl && !fetcher.data?.error);
  const isVerifying      = verifyFetcher.state !== "idle";
  
  // Real or optimistic status
  const currentStatus = verifyFetcher.formData 
    ? verifyFetcher.formData.get("status") 
    : status;

  const isPdf   = resolvedMime === "application/pdf";
  const isImage = IMAGE_TYPES.includes(resolvedMime);

  // Status badge styling
  let statusBadgeLabel, statusBadgeCls;
  if (currentStatus === "verified") {
    statusBadgeLabel = "Verified";
    statusBadgeCls   = "bg-emerald-100 text-emerald-800";
  } else if (currentStatus === "rejected") {
    statusBadgeLabel = "Rejected";
    statusBadgeCls   = "bg-red-100 text-red-800";
  } else {
    // Warm orange pill for pending ("Uploaded")
    statusBadgeLabel = "Uploaded";
    statusBadgeCls   = "bg-orange-100 text-orange-800";
  }

  return (
    <>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={handleOpen}
        className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-50 transition"
        title="View document"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.641 0-8.573-3.007-9.964-7.178z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
        <span className="hidden sm:inline">View</span>
      </button>

      {/* Modal Overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/80 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
        >
          {/* Modal Container */}
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            
            {/* Top Header Bar */}
            <div className="flex flex-shrink-0 items-center justify-between px-6 py-4 border-b border-gray-100 bg-white">
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center">
                  <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                  </svg>
                </div>
                <h2 className="text-lg font-semibold text-gray-900 truncate">{fileName}</h2>
              </div>

              <div className="flex items-center gap-4">
                <button
                  onClick={handleClose}
                  className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center text-gray-500 hover:bg-gray-100 transition"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Main Content Area (Two Columns) */}
            <div className="flex flex-1 min-h-0 bg-white relative">
              
              {/* Left Panel: Viewer */}
              <div className="flex-1 min-w-0 relative bg-[#f4f4f5]">
                {fetcher.data?.error ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">
                    <p className="text-red-500 font-medium mb-2 text-lg">Access Denied</p>
                    <p className="text-sm text-gray-500">{fetcher.data.error}</p>
                  </div>
                ) : isGeneratingLink ? (
                  <Spinner />
                ) : isPdf ? (
                  <NativePdfViewer url={signedUrl} />
                ) : isImage ? (
                  <ImageViewer url={signedUrl} fileName={fileName} />
                ) : (
                  <UnsupportedViewer url={signedUrl} fileName={fileName} />
                )}
              </div>

              {/* Right Panel: Metadata Sidebar */}
              <div className="hidden lg:block w-[340px] flex-shrink-0 border-l border-gray-200 bg-white overflow-y-auto z-10 shadow-[-4px_0_15px_-3px_rgba(0,0,0,0.02)]">
                <div className="flex flex-col divide-y divide-gray-100">
                  
                  {/* Section 1: Upload Info */}
                  <div className="p-6">
                    <div className="flex items-start justify-between">
                      <span className="text-xs font-medium text-gray-500 tracking-wide uppercase">Uploaded by</span>
                      <div className="text-right">
                        <p className="text-sm font-medium text-gray-900">{uploadedBy}</p>
                        <p className="text-xs text-gray-400 mt-0.5" suppressHydrationWarning>{formatUploadDate(uploadedAt)}</p>
                      </div>
                    </div>
                  </div>

                  {/* Section 2: Status */}
                  <div className="p-6">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-gray-500 tracking-wide uppercase">Status</span>
                      <span className={`inline-flex px-3 py-1 rounded-full text-xs font-bold ${statusBadgeCls}`}>
                        {statusBadgeLabel}
                      </span>
                    </div>
                  </div>

                  {/* Section 3: Verification (Only show logic if they are admin and it's not verified already, or always show it but disabled if verified) */}
                  {isAdmin && currentStatus !== "verified" && (
                    <div className="p-6 bg-blue-50/50">
                      <span className="block text-xs font-medium text-gray-500 tracking-wide uppercase mb-3">Verification</span>
                      
                      <label className="flex items-start gap-3 cursor-pointer group">
                        <div className="flex items-center h-5">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => setChecked(e.target.checked)}
                            className="w-4 h-4 text-blue-600 bg-white border-gray-300 rounded focus:ring-blue-600 focus:ring-2 transition"
                          />
                        </div>
                        <div className="text-xs text-gray-600 leading-relaxed font-medium group-hover:text-gray-900 transition">
                          I, {currentUserName}, verify that the client has viewed this document and accepts the terms stated therein.
                        </div>
                      </label>

                      <button
                        onClick={handleVerifySubmit}
                        disabled={!checked || isVerifying}
                        className={`mt-4 w-full py-2.5 rounded-lg text-sm font-semibold transition-all ${
                          checked
                            ? "bg-blue-600 text-white hover:bg-blue-700 shadow-sm"
                            : "bg-gray-100 text-gray-400 cursor-not-allowed"
                        }`}
                      >
                        {isVerifying ? "Verifying..." : "Verify document"}
                      </button>
                    </div>
                  )}

                  {/* Status if already verified */}
                  {currentStatus === "verified" && (
                    <div className="p-6 bg-emerald-50/50">
                      <span className="block text-xs font-medium text-emerald-800 tracking-wide uppercase mb-1">Verification</span>
                      <p className="text-sm text-emerald-600 font-medium">This document has been successfully verified.</p>
                    </div>
                  )}

                  {/* Section 4: Document Type */}
                  <div className="p-6">
                    <span className="block text-xs font-medium text-gray-500 tracking-wide uppercase mb-3">Document type</span>
                    <span className="inline-flex px-3 py-1 bg-pink-50 text-pink-700 border border-pink-100 rounded-full text-xs font-bold">
                      {docTypeName}
                    </span>
                  </div>

                  {/* Section 5: Document Name */}
                  <div className="p-6">
                    <span className="block text-xs font-medium text-gray-500 tracking-wide uppercase mb-3">Document name</span>
                    <div className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700 truncate font-medium">
                      {fileName}
                    </div>
                  </div>

                </div>
              </div>
            </div>
            
          </div>
        </div>
      )}
    </>
  );
}

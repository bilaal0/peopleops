// components/documents/DocumentViewer.jsx
// Modal viewer for uploaded documents with embedded metadata, in-browser preview, and verification flow.

import { useState, useEffect, useCallback } from "react";
import { useFetcher } from "react-router";
import {
  Eye,
  Download,
  ExternalLink,
  X,
  FileText,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Clock,
  Loader2,
  Volume2,
} from "lucide-react";

const IMAGE_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/svg+xml",
];

const AUDIO_TYPES = [
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/wave",
  "audio/x-wav",
  "audio/x-pn-wav",
];

function isPdfFile(mime, name) {
  if (mime === "application/pdf") return true;
  if (name && name.toLowerCase().endsWith(".pdf")) return true;
  return false;
}

function isImageFile(mime, name) {
  if (IMAGE_TYPES.includes(mime)) return true;
  if (name && /\.(jpe?g|png|webp|gif|svg)$/i.test(name)) return true;
  return false;
}

function isAudioFile(mime, name) {
  if (AUDIO_TYPES.includes(mime)) return true;
  if (name && /\.(mp3|wav|wave)$/i.test(name)) return true;
  return false;
}

function formatFileSize(bytes) {
  if (!bytes || isNaN(bytes)) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Document Renderers
// ─────────────────────────────────────────────────────────────────────────────

function NativePdfViewer({ url, title }) {
  const viewerUrl = `${url}#toolbar=1&navpanes=0&view=FitH`;

  return (
    <div className="absolute inset-0 bg-[#f4f4f5]">
      <iframe
        src={viewerUrl}
        className="w-full h-full border-0"
        title={title || "PDF Viewer"}
      />
    </div>
  );
}

function ImageViewer({ url, fileName }) {
  return (
    <div className="absolute inset-0 flex justify-center items-center bg-[#f4f4f5] p-6 overflow-auto">
      <img
        src={url}
        alt={fileName}
        className="max-w-full max-h-full object-contain drop-shadow-md rounded-lg"
      />
    </div>
  );
}

function AudioViewer({ url, fileName }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#f4f4f5] p-6 text-center">
      <div className="w-20 h-20 rounded-3xl bg-indigo-50 border border-indigo-100 flex items-center justify-center mb-5 text-indigo-600 shadow-sm">
        <Volume2 className="w-10 h-10" />
      </div>
      <h3 className="text-base font-bold text-gray-900 max-w-md truncate mb-1">
        {fileName}
      </h3>
      <p className="text-xs text-gray-500 mb-6 font-medium">Audio Recording (MP3 / WAV)</p>
      <div className="w-full max-w-md bg-white p-5 rounded-2xl shadow-sm border border-gray-200">
        <audio controls className="w-full focus:outline-none" src={url} preload="metadata">
          Your browser does not support the audio element.
        </audio>
      </div>
    </div>
  );
}

function UnsupportedViewer({ url, fileName, documentId }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#f4f4f5] text-center p-8">
      <div className="w-16 h-16 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center mb-4 text-indigo-600 shadow-sm">
        <FileText className="w-8 h-8" />
      </div>
      <p className="text-gray-900 font-semibold text-lg">{fileName}</p>
      <p className="text-sm text-gray-500 mt-1 max-w-xs leading-relaxed">
        Preview is not available for this file type directly in the browser.
      </p>
      <div className="mt-5 flex items-center gap-3">
        <a
          href={`/documents/${documentId}/download`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 transition"
        >
          <Download className="w-4 h-4" />
          Download Document
        </a>
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#f4f4f5]">
      <Loader2 className="w-10 h-10 animate-spin text-indigo-600 mb-3" />
      <span className="text-sm text-gray-600 font-medium tracking-wide">
        Loading document preview…
      </span>
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
  fileSize,
  currentUserName,
  isAdmin = false,
  trigger,
  buttonText = "View",
  buttonClassName,
  iconOnly = false,
  title = "View document",
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [signedUrl, setSignedUrl] = useState(null);
  const [resolvedMime, setResolvedMime] = useState(mimeType);
  const [checked, setChecked] = useState(false);

  const fetcher = useFetcher();
  const verifyFetcher = useFetcher();

  const handleOpen = useCallback(() => {
    setIsOpen(true);
    setChecked(false);
    setSignedUrl(null);
    fetcher.load(`/documents/${documentId}/view?format=json`);
  }, [documentId]);

  useEffect(() => {
    if (fetcher.data?.url) {
      setSignedUrl(fetcher.data.url);
      setResolvedMime(fetcher.data.mimeType || mimeType);
    }
  }, [fetcher.data, mimeType]);

  function handleClose() {
    setIsOpen(false);
    setSignedUrl(null);
  }

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => {
      if (e.key === "Escape") handleClose();
    };
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

  const isGeneratingLink =
    fetcher.state !== "idle" || (isOpen && !signedUrl && !fetcher.data?.error);
  const isVerifying = verifyFetcher.state !== "idle";

  // Real or optimistic status
  const currentStatus = verifyFetcher.formData
    ? verifyFetcher.formData.get("status")
    : fetcher.data?.status || status || "pending";

  const effectiveFileName = fetcher.data?.fileName || fileName || "Document";
  const effectiveUploadedBy = fetcher.data?.uploadedBy || uploadedBy || "Staff";
  const effectiveDocTypeName = fetcher.data?.docTypeName || docTypeName || "Document";
  const effectiveFileSize = fetcher.data?.fileSize || fileSize;

  const isPdf = isPdfFile(resolvedMime, effectiveFileName);
  const isImage = isImageFile(resolvedMime, effectiveFileName);
  const isAudio = isAudioFile(resolvedMime, effectiveFileName);

  // Status badge styling
  let statusBadgeLabel, statusBadgeCls;
  if (currentStatus === "verified") {
    statusBadgeLabel = "Verified";
    statusBadgeCls = "bg-emerald-100 text-emerald-800";
  } else if (currentStatus === "rejected") {
    statusBadgeLabel = "Rejected";
    statusBadgeCls = "bg-red-100 text-red-800";
  } else {
    statusBadgeLabel = "Pending";
    statusBadgeCls = "bg-amber-100 text-amber-800";
  }

  // Render trigger button
  let triggerElement;
  if (typeof trigger === "function") {
    triggerElement = trigger({ onClick: handleOpen });
  } else if (iconOnly) {
    triggerElement = (
      <button
        type="button"
        onClick={handleOpen}
        className={
          buttonClassName ||
          "flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-indigo-50 hover:text-indigo-600 transition"
        }
        title={title}
      >
        <Eye className="h-4 w-4" />
      </button>
    );
  } else {
    triggerElement = (
      <button
        type="button"
        onClick={handleOpen}
        className={
          buttonClassName ||
          "flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition"
        }
        title={title}
      >
        <Eye className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">{buttonText}</span>
      </button>
    );
  }

  return (
    <>
      {triggerElement}

      {/* Modal Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-gray-900/80 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) handleClose();
          }}
        >
          {/* Modal Container */}
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Top Header Bar */}
            <div className="flex flex-shrink-0 items-center justify-between px-5 py-3.5 border-b border-gray-100 bg-white gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
                  {isAudio ? (
                    <Volume2 className="w-5 h-5" />
                  ) : (
                    <FileText className="w-5 h-5" />
                  )}
                </div>
                <div className="min-w-0">
                  <h2 className="text-sm sm:text-base font-bold text-gray-900 truncate">
                    {effectiveFileName}
                  </h2>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-gray-500 font-medium truncate">
                      {effectiveDocTypeName}
                    </span>
                    {effectiveFileSize && (
                      <span className="text-[11px] text-gray-400">
                        • {formatFileSize(effectiveFileSize)}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 shrink-0">
                {signedUrl && (
                  <button
                    type="button"
                    onClick={() => window.open(signedUrl, "_blank")}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-xs font-semibold text-gray-700 hover:bg-gray-50 transition shadow-sm"
                    title="Open in new browser tab"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span className="hidden md:inline">Open in Tab</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => window.open(`/documents/${documentId}/download`, "_blank")}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 border border-indigo-200 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 transition shadow-sm"
                  title="Download document"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Download</span>
                </button>

                <button
                  type="button"
                  onClick={handleClose}
                  className="w-9 h-9 rounded-full bg-gray-50 border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition"
                  title="Close modal"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Main Content Area (Two Columns) */}
            <div className="flex flex-1 min-h-0 bg-white relative">
              {/* Left Panel: Viewer */}
              <div className="flex-1 min-w-0 relative bg-[#f4f4f5]">
                {fetcher.data?.error ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">
                    <AlertCircle className="w-10 h-10 text-red-500 mb-2" />
                    <p className="text-red-600 font-semibold text-lg">Unable to Preview</p>
                    <p className="text-sm text-gray-500 mt-1 max-w-sm">
                      {fetcher.data.error}
                    </p>
                    <a
                      href={`/documents/${documentId}/download`}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-4 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 transition"
                    >
                      <Download className="w-4 h-4" /> Try Download
                    </a>
                  </div>
                ) : isGeneratingLink ? (
                  <Spinner />
                ) : isPdf ? (
                  <NativePdfViewer url={signedUrl} title={effectiveFileName} />
                ) : isImage ? (
                  <ImageViewer url={signedUrl} fileName={effectiveFileName} />
                ) : isAudio ? (
                  <AudioViewer url={signedUrl} fileName={effectiveFileName} />
                ) : (
                  <UnsupportedViewer
                    url={signedUrl}
                    fileName={effectiveFileName}
                    documentId={documentId}
                  />
                )}
              </div>

              {/* Right Panel: Metadata Sidebar */}
              <div className="hidden lg:block w-[320px] flex-shrink-0 border-l border-gray-200 bg-white overflow-y-auto z-10">
                <div className="flex flex-col divide-y divide-gray-100">
                  {/* Upload Info */}
                  <div className="p-5">
                    <span className="text-[11px] font-bold text-gray-400 tracking-wider uppercase">
                      Uploaded by
                    </span>
                    <div className="mt-1.5 flex items-center justify-between">
                      <p className="text-sm font-semibold text-gray-900 truncate">
                        {effectiveUploadedBy}
                      </p>
                    </div>
                  </div>

                  {/* Status */}
                  <div className="p-5">
                    <span className="text-[11px] font-bold text-gray-400 tracking-wider uppercase">
                      Verification Status
                    </span>
                    <div className="mt-2 flex items-center justify-between">
                      <span
                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${statusBadgeCls}`}
                      >
                        {currentStatus === "verified" && (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        )}
                        {currentStatus === "rejected" && (
                          <AlertCircle className="w-3.5 h-3.5 text-red-600" />
                        )}
                        {currentStatus === "pending" && (
                          <Clock className="w-3.5 h-3.5 text-amber-600" />
                        )}
                        {statusBadgeLabel}
                      </span>
                    </div>
                  </div>

                  {/* Verification Flow (for admins) */}
                  {isAdmin && currentStatus !== "verified" && (
                    <div className="p-5 bg-blue-50/50">
                      <span className="block text-[11px] font-bold text-blue-900 tracking-wider uppercase mb-2">
                        Admin Verification
                      </span>
                      <label className="flex items-start gap-2.5 cursor-pointer group">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => setChecked(e.target.checked)}
                          className="mt-0.5 w-4 h-4 text-blue-600 bg-white border-gray-300 rounded focus:ring-blue-600 transition"
                        />
                        <span className="text-xs text-gray-600 font-medium group-hover:text-gray-900 transition leading-snug">
                          I, {currentUserName || "Admin"}, confirm this document is verified and valid.
                        </span>
                      </label>

                      <button
                        type="button"
                        onClick={handleVerifySubmit}
                        disabled={!checked || isVerifying}
                        className={`mt-3 w-full py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                          checked
                            ? "bg-blue-600 text-white hover:bg-blue-700 shadow-sm"
                            : "bg-gray-100 text-gray-400 cursor-not-allowed"
                        }`}
                      >
                        {isVerifying ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Verifying...
                          </>
                        ) : (
                          <>
                            <ShieldCheck className="w-3.5 h-3.5" /> Mark Verified
                          </>
                        )}
                      </button>
                    </div>
                  )}

                  {/* If already verified */}
                  {currentStatus === "verified" && (
                    <div className="p-5 bg-emerald-50/50">
                      <div className="flex items-center gap-2 text-emerald-800">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span className="text-xs font-semibold">Document Verified</span>
                      </div>
                      <p className="text-xs text-emerald-700 mt-1">
                        This document has been verified.
                      </p>
                    </div>
                  )}

                  {/* Document Type */}
                  <div className="p-5">
                    <span className="block text-[11px] font-bold text-gray-400 tracking-wider uppercase mb-1.5">
                      Document Type
                    </span>
                    <span className="inline-flex px-2.5 py-1 bg-slate-100 text-slate-700 rounded-md text-xs font-semibold">
                      {effectiveDocTypeName}
                    </span>
                  </div>

                  {/* File Name & Size */}
                  <div className="p-5">
                    <span className="block text-[11px] font-bold text-gray-400 tracking-wider uppercase mb-1.5">
                      File Details
                    </span>
                    <p className="text-xs font-mono text-gray-800 break-all bg-gray-50 p-2 rounded-lg border border-gray-100">
                      {effectiveFileName}
                    </p>
                    {effectiveFileSize && (
                      <p className="text-[11px] text-gray-400 mt-1.5">
                        Size: {formatFileSize(effectiveFileSize)}
                      </p>
                    )}
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

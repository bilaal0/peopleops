// routes/properties/detail.jsx
// Full property detail page with hero image, gallery, compliance strip,
// alert banners, and four tabbed sections.
import { useState, useEffect, useRef } from "react";
import { useLoaderData, Link, useSearchParams } from "react-router-dom";
import { getUserFromRequest } from "../../utils/auth.server.js";
import { redirect } from "react-router";
import { Property } from "../../models/property.server.js";
import { User } from "../../models/user.server.js";
import { Document } from "../../models/document.server.js";
import { DocumentType } from "../../models/documentType.server.js";
import { Tenancy } from "../../models/tenancy.server.js";
import { connect } from "../../config/db.server.js";
import { runPropertyPreFlight } from "../../utils/preflight.server.js";
import { MaintenanceJob } from "../../models/MaintenanceJob.server.js";
import { PlannedMaintenanceSchedule } from "../../models/PlannedMaintenanceSchedule.server.js";
import {
  buildComplianceStrip,
  getCertificateStatus,
  getCertificateLabel,
  getCertificateColour,
  getDaysLabel,
  getEpcRatingColour,
} from "../../utils/compliance.js";
import DocumentUploader from "../../components/documents/DocumentUploader.jsx";
import { getNotesForEntity } from "../../utils/notes.server.js";
import Timeline from "../../components/timeline/Timeline.jsx";

// ═══════════════════════════════════════════════════════════════════
// LOADER
// ═══════════════════════════════════════════════════════════════════
export async function loader({ request, params }) {
  const user = await getUserFromRequest(request);
  if (!user) return redirect("/login");
  if (!user.organizationId && !user.roles?.includes("SUPER_ADMIN")) return redirect("/dashboard");

  await connect();
  const organizationFilter = user.roles?.includes("SUPER_ADMIN") ? {} : { organizationId: user.organizationId };

  const fullUser = await User.findById(user.userId).lean();
  if (!fullUser) return redirect("/login");

  // 1. Fetch Property
  const property = await Property.findOne({ _id: params.id, deleted: false, ...organizationFilter })
    .populate("landlordId", "title firstName lastName email phone landlordData")
    .populate("createdBy", "title firstName lastName")
    .lean();

  if (!property) return redirect("/properties");

  // 2. Pre-flight checks
  const preFlight = runPropertyPreFlight(property);

  // 3. Fetch related data in parallel
  const [documents, tenancies, allDocTypes, notesResult, maintenanceJobs, maintenanceSchedules] = await Promise.all([
    Document.find({ entityType: "property", entityId: property._id, deleted: false })
      .populate("docType", "name key category hasExpiry expiryDays")
      .populate("uploadedBy", "title firstName lastName")
      .populate("verifiedBy", "title firstName lastName")
      .sort({ createdAt: -1 })
      .lean(),
    Tenancy.find({ propertyId: property._id })
      .populate("tenantIds", "title firstName lastName")
      .sort({ startDate: -1 })
      .lean(),
    DocumentType.find({ isActive: true, entity: "property" })
      .sort({ name: 1 })
      .lean(),
    getNotesForEntity("property", property._id, user.organizationId, 1),
    MaintenanceJob.find({
      propertyId: property._id,
      organizationId: user.organizationId,
      deleted: { $ne: true },
      status: { $nin: ["closed", "cancelled"] },
    }).select("jobRef title category priority status targetDate contractorId reportedDate").populate("contractorId", "name").sort({ reportedDate: -1 }).lean(),
    PlannedMaintenanceSchedule.find({
      propertyId: property._id,
      organizationId: user.organizationId,
      deleted: { $ne: true },
    }).select("title category frequency nextDueDate active estimatedCost").sort({ nextDueDate: 1 }).lean(),
  ]);

  // 4. AML check
  let landlordAmlResult = property.landlordId?.landlordData?.amlResult || "pending";
  if (property.landlordId && landlordAmlResult !== "pass") {
    preFlight.canCreateTenancy = false;
    preFlight.blocks.push({
      severity: "block",
      field: "aml",
      message: "Landlord AML check not completed.",
      link: `/landlords/${property.landlordId._id}?tab=aml`,
    });
  }

  // 5. Extract certificates (latest of each type)
  const certs = {
    gas:  documents.find(d => d.docType?.key === "gas_safety_certificate"),
    eicr: documents.find(d => d.docType?.key === "eicr"),
    epc:  documents.find(d => d.docType?.key === "epc"),
  };

  // 6. Build compliance strip using shared helpers
  const complianceStrip = buildComplianceStrip(property, {
    gas:  certs.gas  ? { expiryDate: certs.gas.expiryDate }  : {},
    eicr: certs.eicr ? { expiryDate: certs.eicr.expiryDate } : {},
    epc:  certs.epc  ? { expiryDate: certs.epc.expiryDate }  : {},
  });

  // 7. Separate doc types — use category field from new schema
  const propertyDocTypes = allDocTypes
    .filter(dt => dt.category !== "certificate")
    .map(dt => ({ ...dt, _id: dt._id.toString() }));
  const certificateDocTypes = allDocTypes
    .filter(dt => dt.category === "certificate")
    .map(dt => ({ ...dt, _id: dt._id.toString() }));

  // 8. URL params
  const url = new URL(request.url);
  const successMsg = url.searchParams.get("success");

  // Serialise certificates with full info for the Certificates tab
  const serialiseCert = (c) => c ? ({
    _id: c._id.toString(),
    expiryDate: c.expiryDate,
    issueDate: c.issueDate || c.createdAt,
    fileName: c.fileName,
    s3Key: c.s3Key,
    notes: c.notes,
    uploadedBy: c.uploadedBy ? { firstName: c.uploadedBy.firstName, lastName: c.uploadedBy.lastName } : null,
    verifiedBy: c.verifiedBy ? { firstName: c.verifiedBy.firstName, lastName: c.verifiedBy.lastName } : null,
    verifiedAt: c.verifiedAt,
    createdAt: c.createdAt,
  }) : null;

  return {
    property: {
      ...property,
      _id: property._id.toString(),
      landlordId: property.landlordId ? { ...property.landlordId, _id: property.landlordId._id.toString() } : null,
      createdBy: property.createdBy ? { firstName: property.createdBy.firstName, lastName: property.createdBy.lastName, _id: property.createdBy._id.toString() } : null,
    },
    preFlight,
    landlordAmlResult,
    complianceStrip,
    documents: documents.map(d => ({
      ...d,
      _id: d._id.toString(),
      docType: { ...d.docType, _id: d.docType._id.toString() },
      uploadedBy: d.uploadedBy ? { firstName: d.uploadedBy.firstName, lastName: d.uploadedBy.lastName } : null,
      verifiedBy: d.verifiedBy ? { firstName: d.verifiedBy.firstName, lastName: d.verifiedBy.lastName } : null,
    })),
    propertyDocTypes,
    certificateDocTypes,
    certs: { gas: serialiseCert(certs.gas), eicr: serialiseCert(certs.eicr), epc: serialiseCert(certs.epc) },
    tenancies: tenancies.map(t => ({
      ...t,
      _id: t._id.toString(),
      tenantIds: t.tenantIds?.map(u => ({ ...u, _id: u._id.toString() })) || [],
    })),
    notes: notesResult.notes,
    notesHasMore: notesResult.hasMore,
    maintenanceJobs: maintenanceJobs.map(j => ({
      ...j,
      _id: j._id.toString(),
      contractorId: j.contractorId ? { name: j.contractorId.name, _id: j.contractorId._id.toString() } : null,
    })),
    maintenanceSchedules: maintenanceSchedules.map(s => ({ ...s, _id: s._id.toString() })),
    currentUserId: fullUser._id.toString(),
    currentUserRole: fullUser.roles?.[0] || "agent",
    currentUserName: `${fullUser.firstName || ""} ${fullUser.lastName || ""}`.trim() || "User",
    successMsg,
  };
}

// ═══════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════
const PROPERTY_TYPE_LABELS = {
  flat: "Flat", terraced: "Terraced", semi_detached: "Semi-Detached",
  detached: "Detached", bungalow: "Bungalow", maisonette: "Maisonette",
  studio: "Studio", hmo: "HMO", other: "Other",
};

const STATUS_BADGE = {
  available:   { label: "Available",   bg: "bg-green-500" },
  let:         { label: "Let",         bg: "bg-blue-500" },
  under_offer: { label: "Under Offer", bg: "bg-amber-500" },
  maintenance: { label: "Maintenance", bg: "bg-orange-500" },
  withdrawn:   { label: "Withdrawn",   bg: "bg-gray-500" },
};

const EPC_BG = {
  "dark-green": "bg-emerald-700", green: "bg-green-600", "light-green": "bg-lime-500",
  yellow: "bg-yellow-500", amber: "bg-amber-500", orange: "bg-orange-500",
  red: "bg-red-600", grey: "bg-gray-400",
};

const COLOUR_CLS = {
  green: { badge: "bg-green-100 text-green-700 border-green-200", icon: "text-green-500" },
  amber: { badge: "bg-amber-100 text-amber-700 border-amber-200", icon: "text-amber-500" },
  red:   { badge: "bg-red-100 text-red-700 border-red-200",     icon: "text-red-500" },
  grey:  { badge: "bg-gray-100 text-gray-500 border-gray-200",   icon: "text-gray-400" },
};

// ═══════════════════════════════════════════════════════════════════
// LIGHTBOX COMPONENT
// ═══════════════════════════════════════════════════════════════════
function Lightbox({ images, startIndex, onClose }) {
  const [idx, setIdx] = useState(startIndex);
  const prev = () => setIdx(i => (i - 1 + images.length) % images.length);
  const next = () => setIdx(i => (i + 1) % images.length);

  useEffect(() => {
    const handler = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") prev();
      if (e.key === "ArrowRight") next();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [images.length, onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center" onClick={onClose}>
      <button onClick={(e) => { e.stopPropagation(); onClose(); }} className="absolute top-4 right-4 text-white/80 hover:text-white text-3xl font-light z-10">&times;</button>
      {images.length > 1 && (
        <>
          <button onClick={(e) => { e.stopPropagation(); prev(); }} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white text-4xl z-10">&#8249;</button>
          <button onClick={(e) => { e.stopPropagation(); next(); }} className="absolute right-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white text-4xl z-10">&#8250;</button>
        </>
      )}
      <img
        src={`/documents/s3-download?key=${encodeURIComponent(images[idx])}`}
        alt={`Property image ${idx + 1}`}
        className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg"
        onClick={e => e.stopPropagation()}
      />
      {images.length > 1 && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-white/80 text-sm font-medium bg-black/50 px-3 py-1 rounded-full">
          {idx + 1} / {images.length}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// COMPLIANCE INDICATOR
// ═══════════════════════════════════════════════════════════════════
function ComplianceIndicator({ icon, label, colour, statusLabel, daysLabel, onClick }) {
  const cls = COLOUR_CLS[colour] || COLOUR_CLS.grey;
  return (
    <button onClick={onClick} className="flex flex-col items-center gap-1.5 min-w-[100px] group transition hover:scale-105">
      <span className={`text-xl ${cls.icon}`}>{icon}</span>
      <span className="text-xs font-semibold text-gray-600 group-hover:text-gray-900">{label}</span>
      <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${cls.badge}`}>{statusLabel}</span>
      {daysLabel && <span className={`text-[10px] font-medium ${cls.icon}`}>{daysLabel}</span>}
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════════
// DETAIL ROW HELPER
// ═══════════════════════════════════════════════════════════════════
function DetailRow({ label, value, className = "" }) {
  if (value === null || value === undefined) return null;
  return (
    <div className={`flex justify-between py-2 border-b border-gray-50 last:border-0 ${className}`}>
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm font-medium text-gray-900 text-right">{value}</span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════
export default function PropertyDetail() {
  const { property: p, preFlight, landlordAmlResult, complianceStrip, documents, propertyDocTypes, certificateDocTypes, certs, tenancies, notes, notesHasMore, currentUserId, currentUserRole, currentUserName, successMsg, maintenanceJobs, maintenanceSchedules } = useLoaderData();

  const [searchParams] = useSearchParams();
  const defaultTab = searchParams.get("tab") || "overview";
  const [activeTab, setActiveTab] = useState(defaultTab);
  const [lightbox, setLightbox] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const galleryRef = useRef(null);

  const typeLabel = PROPERTY_TYPE_LABELS[p.propertyType] || p.propertyType;
  const statusBadge = STATUS_BADGE[p.status] || STATUS_BADGE.available;
  const epcBgClass = EPC_BG[getEpcRatingColour(p.epcRating)] || EPC_BG.grey;
  const isAdmin = currentUserRole === "ORGANIZATION_ADMIN" || currentUserRole === "SUPER_ADMIN";
  const hasActiveTenancy = tenancies.some(t => t.status === "active");

  // All images: mainImage first, then gallery
  const allImages = [p.mainImage, ...(p.gallery || [])].filter(Boolean);

  // Determine which banner to show (priority: red > AML amber > expiry amber)
  const blockBanner = preFlight.blocks.length > 0;
  const amlBanner = !blockBanner && landlordAmlResult !== "pass" && p.landlordId;
  const expiryWarning = !blockBanner && !amlBanner && preFlight.warnings.find(w =>
    w.message.includes("expires in")
  );

  // Add Tenancy disabled logic
  const tenancyDisabled = !preFlight.canCreateTenancy || complianceStrip.aml.colour === "red" || complianceStrip.aml.colour === "grey";
  const tenancyTooltip = tenancyDisabled
    ? (preFlight.blocks[0]?.message || "AML check must be passed before creating a tenancy")
    : "Create new tenancy";

  return (
    <div className="max-w-6xl mx-auto pb-12">

      {/* ── SUCCESS TOAST ──────────────────────────────────────────────── */}
      {successMsg && (
        <div className="mx-6 mt-4 p-3 rounded-lg bg-green-50 border border-green-200 text-green-800 text-sm font-medium flex items-center gap-2">
          <svg className="w-5 h-5 text-green-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Property successfully {successMsg === "created" ? "added" : "updated"}.
        </div>
      )}

      {/* ═══ HERO IMAGE ════════════════════════════════════════════════ */}
      <div
        className="relative w-full h-[400px] bg-gray-200 cursor-pointer overflow-hidden"
        onClick={() => allImages.length > 0 && setLightbox(0)}
      >
        {p.mainImage || p.gallery?.[0] ? (
          <img
            src={`/documents/s3-download?key=${encodeURIComponent(p.mainImage || p.gallery[0])}`}
            alt={p.addressLine1}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gray-100">
            <svg className="w-24 h-24 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={0.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
            </svg>
          </div>
        )}

        {/* Gradient overlay at bottom */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

        {/* Bottom-left overlay: address + badges */}
        <div className="absolute bottom-0 left-0 p-6">
          <h1 className="text-2xl md:text-3xl font-extrabold text-white leading-tight drop-shadow-sm">
            {p.addressLine1}
          </h1>
          <p className="text-base text-white/80 font-medium mt-1">
            {[p.city, p.postcode].filter(Boolean).join(", ")}
          </p>
          <div className="flex flex-wrap items-center gap-2 mt-3">
            {/* Property type badge */}
            <span className="px-2.5 py-1 rounded-md text-xs font-bold text-white border border-white/40 bg-white/10 backdrop-blur-sm">
              {typeLabel}
            </span>
            {/* Status badge */}
            <span className={`px-2.5 py-1 rounded-md text-xs font-bold text-white ${statusBadge.bg}`}>
              {statusBadge.label}
            </span>
            {/* EPC badge */}
            <span className={`px-2.5 py-1 rounded-md text-xs font-bold text-white ${epcBgClass}`}>
              EPC: {p.epcRating || "—"}
            </span>
          </div>
        </div>

        {/* Top-right: Edit + Delete */}
        <div className="absolute top-4 right-4 flex items-center gap-2">
          <Link
            to={`/properties/${p._id}/edit`}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white border border-white/50 bg-white/10 backdrop-blur-sm hover:bg-white/20 transition"
          >
            Edit
          </Link>
          {isAdmin && (
            <button
              onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(true); }}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-red-200 border border-red-400/50 bg-red-500/20 backdrop-blur-sm hover:bg-red-500/40 transition"
            >
              Delete
            </button>
          )}
        </div>
      </div>

      {/* Delete confirmation modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center" onClick={() => setShowDeleteConfirm(false)}>
          <div className="bg-white rounded-xl p-6 max-w-sm mx-4 shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-900">Delete Property?</h3>
            {hasActiveTenancy ? (
              <>
                <p className="text-sm text-red-600 mt-2 font-medium">This property has an active tenancy and cannot be deleted.</p>
                <div className="mt-4 flex justify-end">
                  <button onClick={() => setShowDeleteConfirm(false)} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200">Close</button>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-gray-600 mt-2">This action cannot be undone. All property data will be permanently removed.</p>
                <div className="mt-4 flex justify-end gap-3">
                  <button onClick={() => setShowDeleteConfirm(false)} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200">Cancel</button>
                  <Link to={`/properties/${p._id}/edit?delete=true`} className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-semibold hover:bg-red-700">Yes, Delete</Link>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Lightbox */}
      {lightbox !== null && allImages.length > 0 && (
        <Lightbox images={allImages} startIndex={lightbox} onClose={() => setLightbox(null)} />
      )}

      {/* ═══ GALLERY STRIP ═════════════════════════════════════════════ */}
      {allImages.length > 0 && (
        <div className="relative bg-white border-b border-gray-200">
          <div
            ref={galleryRef}
            className="flex gap-2 overflow-x-auto py-2 px-2 scrollbar-hide"
            style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
          >
            {allImages.map((key, i) => (
              <button
                key={key}
                onClick={() => setLightbox(i)}
                className={`flex-shrink-0 w-20 h-20 rounded overflow-hidden border-2 transition hover:scale-105 ${
                  lightbox === i ? "border-white ring-2 ring-indigo-400 scale-105" : "border-transparent"
                }`}
              >
                <img
                  src={`/documents/s3-download?key=${encodeURIComponent(key)}`}
                  alt={`View ${i + 1}`}
                  className="w-full h-full object-cover"
                />
              </button>
            ))}
          </div>
          {/* Fade edges */}
          <div className="absolute top-0 left-0 w-8 h-full bg-gradient-to-r from-white to-transparent pointer-events-none" />
          <div className="absolute top-0 right-0 w-8 h-full bg-gradient-to-l from-white to-transparent pointer-events-none" />
        </div>
      )}

      {/* ═══ COMPLIANCE STATUS STRIP ═══════════════════════════════════ */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-4 md:gap-8">
            <ComplianceIndicator
              icon="🔥" label="Gas Safety"
              colour={complianceStrip.gas.colour}
              statusLabel={complianceStrip.gas.label}
              daysLabel={complianceStrip.gas.daysLabel}
              onClick={() => setActiveTab("certificates")}
            />
            <ComplianceIndicator
              icon="⚡" label="EICR"
              colour={complianceStrip.eicr.colour}
              statusLabel={complianceStrip.eicr.label}
              daysLabel={complianceStrip.eicr.daysLabel}
              onClick={() => setActiveTab("certificates")}
            />
            <ComplianceIndicator
              icon="🍃" label="EPC"
              colour={complianceStrip.epc.colour}
              statusLabel={complianceStrip.epc.label}
              onClick={() => setActiveTab("certificates")}
            />
            <ComplianceIndicator
              icon="🏛️" label="Selective Licence"
              colour={complianceStrip.selectiveLicence.colour}
              statusLabel={complianceStrip.selectiveLicence.label}
              onClick={() => setActiveTab("overview")}
            />
            <ComplianceIndicator
              icon="👤" label="Landlord AML"
              colour={complianceStrip.aml.colour}
              statusLabel={complianceStrip.aml.label}
              onClick={() => p.landlordId && window.location.assign(`/landlords/${p.landlordId._id}?tab=aml`)}
            />
          </div>
          <button
            disabled={tenancyDisabled}
            title={tenancyTooltip}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
              tenancyDisabled
                ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                : "bg-green-600 text-white hover:bg-green-700 shadow-sm"
            }`}
          >
            Add Tenancy
          </button>
        </div>
      </div>

      {/* ═══ COMPLIANCE ALERT BANNERS ══════════════════════════════════ */}
      <div className="px-6 space-y-0">
        {/* Red blocking banner */}
        {blockBanner && (
          <div className="rounded-b-xl border border-t-0 border-red-200 bg-red-50 p-4">
            <p className="text-sm font-bold text-red-800">
              🚫 This property has {preFlight.blocks.length} compliance issue{preFlight.blocks.length > 1 ? "s" : ""} that must be resolved before a tenancy can be created.
            </p>
            <ul className="mt-2 space-y-1.5">
              {preFlight.blocks.map((b, i) => (
                <li key={i} className="flex items-center gap-2 text-sm text-red-700">
                  <span>•</span>
                  <span>{b.message}</span>
                  {b.link ? (
                    <Link to={b.link} className="text-red-600 font-semibold hover:underline">Fix →</Link>
                  ) : (
                    <Link to={`/properties/${p._id}/edit`} className="text-red-600 font-semibold hover:underline">Edit Property →</Link>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Amber AML banner */}
        {amlBanner && (
          <div className="rounded-b-xl border border-t-0 border-amber-200 bg-amber-50 p-4">
            <p className="text-sm text-amber-800">
              ⚠ AML check not completed for <strong>{p.landlordId.title ? p.landlordId.title + ' ' : ''}{p.landlordId.firstName} {p.landlordId.lastName}</strong>. Tenancy cannot be created until AML is passed.
              {" "}
              <Link to={`/landlords/${p.landlordId._id}?tab=aml`} className="font-semibold text-amber-700 hover:underline">
                Complete AML check →
              </Link>
            </p>
          </div>
        )}

        {/* Amber expiry warning */}
        {expiryWarning && (
          <div className="rounded-b-xl border border-t-0 border-amber-200 bg-amber-50 p-4">
            <p className="text-sm text-amber-800">
              ⚠ {expiryWarning.message} Upload a renewed certificate to avoid compliance issues.
            </p>
          </div>
        )}
      </div>

      {/* ═══ TABS ══════════════════════════════════════════════════════ */}
      <div className="px-6 mt-6">
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8">
            {["overview", "tenancies", "documents", "certificates", "maintenance"].map(t => (
              <button
                key={t}
                onClick={() => setActiveTab(t)}
                className={`whitespace-nowrap pb-3 px-1 border-b-2 font-medium text-sm transition-colors ${
                  activeTab === t
                    ? "border-indigo-500 text-indigo-600"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                }`}
              >
                {t.charAt(0).toUpperCase() + t.slice(1)}
                {t === "documents" && documents.length > 0 && ` (${documents.filter(d => d.docType?.category !== "certificate").length})`}
                {t === "tenancies" && tenancies.length > 0 && ` (${tenancies.length})`}
                {t === "maintenance" && maintenanceJobs.length > 0 && ` (${maintenanceJobs.length})`}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* ═══ TAB CONTENT ═══════════════════════════════════════════════ */}
      <div className="px-6 mt-6">

        {/* ── TAB 1: OVERVIEW ─────────────────────────────────────────── */}
        {activeTab === "overview" && (
          <div className="space-y-6 animate-in fade-in duration-300">
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
              {/* LEFT COLUMN (65%) */}
              <div className="lg:col-span-3 space-y-6">

                {/* Property Details */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                  <div className="p-4 border-b border-gray-100 bg-gray-50/50">
                    <h3 className="font-semibold text-gray-800">Property Details</h3>
                  </div>
                  <div className="p-4 space-y-0">
                    <DetailRow label="Property Type" value={typeLabel} />
                    <DetailRow label="Bedrooms" value={p.bedrooms ?? "Not recorded"} />
                    <DetailRow label="Bathrooms" value={p.bathrooms ?? "Not recorded"} />
                    <DetailRow label="Floor Area" value={p.floorAreaSqm ? `${p.floorAreaSqm} sq m` : "Not recorded"} />
                    <DetailRow label="Construction Year" value={p.constructionYear ?? "Not recorded"} />
                    <DetailRow label="Furnished" value={p.furnished ? p.furnished.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()) : "Not recorded"} />
                    <DetailRow label="Council Tax Band" value={p.councilTaxBand ?? "Not recorded"} />
                  </div>
                </div>

                {/* Address */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                  <div className="p-4 border-b border-gray-100 bg-gray-50/50">
                    <h3 className="font-semibold text-gray-800">Address</h3>
                  </div>
                  <div className="p-4 space-y-0">
                    <DetailRow label="Address Line 1" value={p.addressLine1} />
                    <DetailRow label="Address Line 2" value={p.addressLine2 || "—"} />
                    <DetailRow label="City" value={p.city} />
                    <DetailRow label="County" value={p.county || "—"} />
                    <DetailRow label="Postcode" value={p.postcode} />
                    <DetailRow label="Country" value={p.country || "England"} />
                    <DetailRow label="Local Authority" value={p.localAuthority || "—"} />
                    {p.uprn && <DetailRow label="UPRN" value={p.uprn} />}
                  </div>
                </div>

                {/* HMO Details (only if hmo) */}
                {p.propertyType === "hmo" && (
                  <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                    <div className="p-4 border-b border-gray-100 bg-gray-50/50">
                      <h3 className="font-semibold text-gray-800">HMO Details</h3>
                    </div>
                    <div className="p-4 space-y-0">
                      <DetailRow label="Licence Number" value={p.hmoLicenceNo || <span className="text-red-600 font-semibold">Not recorded</span>} />
                      <DetailRow label="Licence Expiry" value={
                        p.hmoLicenceExpiry ? (
                          <span className="flex items-center gap-2">
                            {new Date(p.hmoLicenceExpiry).toLocaleDateString("en-GB")}
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                              getCertificateStatus(p.hmoLicenceExpiry) === "expired" ? "bg-red-100 text-red-700" :
                              getCertificateStatus(p.hmoLicenceExpiry) === "expiring_soon" ? "bg-amber-100 text-amber-700" :
                              "bg-green-100 text-green-700"
                            }`}>{getCertificateLabel(getCertificateStatus(p.hmoLicenceExpiry))}</span>
                          </span>
                        ) : <span className="text-red-600 font-semibold">Not recorded</span>
                      } />
                      <DetailRow label="Max Occupants" value={p.hmoMaxOccupants ?? "Not recorded"} />
                    </div>
                  </div>
                )}

                {/* Selective Licence (only if required) */}
                {p.selectiveLicenceRequired && (
                  <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                    <div className="p-4 border-b border-gray-100 bg-gray-50/50">
                      <h3 className="font-semibold text-gray-800">Selective Licence</h3>
                    </div>
                    <div className="p-4 space-y-0">
                      <DetailRow label="Licence Number" value={p.selectiveLicenceNo || <span className="text-red-600 font-semibold">Not recorded</span>} />
                      <DetailRow label="Licence Expiry" value={
                        p.selectiveLicenceExpiry ? (
                          <span className="flex items-center gap-2">
                            {new Date(p.selectiveLicenceExpiry).toLocaleDateString("en-GB")}
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                              getCertificateStatus(p.selectiveLicenceExpiry) === "expired" ? "bg-red-100 text-red-700" :
                              getCertificateStatus(p.selectiveLicenceExpiry) === "expiring_soon" ? "bg-amber-100 text-amber-700" :
                              "bg-green-100 text-green-700"
                            }`}>{getCertificateLabel(getCertificateStatus(p.selectiveLicenceExpiry))}</span>
                          </span>
                        ) : <span className="text-red-600 font-semibold">Not recorded</span>
                      } />
                    </div>
                  </div>
                )}
              </div>

              {/* RIGHT COLUMN (35%) */}
              <div className="lg:col-span-2 space-y-6">

                {/* Landlord Card */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                  <div className="p-4 border-b border-gray-100 bg-gray-50/50">
                    <h3 className="font-semibold text-gray-800">Landlord</h3>
                  </div>
                  <div className="p-4 space-y-3">
                    {p.landlordId ? (
                      <>
                        <p className="font-bold text-gray-900">
                          <Link to={`/landlords/${p.landlordId._id}`} className="text-indigo-600 hover:text-indigo-800 hover:underline">
                            {p.landlordId.title ? p.landlordId.title + ' ' : ''}{p.landlordId.firstName} {p.landlordId.lastName}
                          </Link>
                        </p>
                        {p.landlordId.email && (
                          <p className="text-sm text-gray-600">
                            <a href={`mailto:${p.landlordId.email}`} className="hover:text-indigo-600">{p.landlordId.email}</a>
                          </p>
                        )}
                        {p.landlordId.phone && (
                          <p className="text-sm text-gray-600">
                            <a href={`tel:${p.landlordId.phone}`} className="hover:text-indigo-600">{p.landlordId.phone}</a>
                          </p>
                        )}
                        <div className="pt-2">
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold border ${COLOUR_CLS[complianceStrip.aml.colour]?.badge}`}>
                            {complianceStrip.aml.label}
                          </span>
                        </div>
                        <Link to={`/landlords/${p.landlordId._id}`} className="inline-block text-sm font-semibold text-indigo-600 hover:underline mt-1">
                          View Landlord Profile →
                        </Link>
                      </>
                    ) : (
                      <p className="text-sm text-gray-400 italic">No landlord assigned</p>
                    )}
                  </div>
                </div>

                {/* EPC Card */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                  <div className="p-4 border-b border-gray-100 bg-gray-50/50">
                    <h3 className="font-semibold text-gray-800">EPC</h3>
                  </div>
                  <div className="p-4 space-y-3">
                    <div className="flex items-center gap-3">
                      <span className={`inline-flex items-center justify-center w-14 h-14 rounded-xl text-white text-xl font-extrabold ${epcBgClass}`}>
                        {p.epcRating || "—"}
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-gray-700">Rating: {p.epcRating || "Not recorded"}</p>
                        {p.epcExpiryDate && (
                          <p className="text-xs text-gray-500">
                            Expiry: {new Date(p.epcExpiryDate).toLocaleDateString("en-GB")}
                            {" "}
                            <span className={`font-bold ${
                              getCertificateStatus(p.epcExpiryDate) === "expired" ? "text-red-600" :
                              getCertificateStatus(p.epcExpiryDate) === "expiring_soon" ? "text-amber-600" :
                              "text-green-600"
                            }`}>[{getCertificateLabel(getCertificateStatus(p.epcExpiryDate))}]</span>
                          </p>
                        )}
                      </div>
                    </div>
                    {(p.epcRating === "F" || p.epcRating === "G") && !p.epcExemption && (
                      <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800 font-medium">
                        Below minimum energy efficiency standard. Cannot be let without a registered MEES exemption.
                      </div>
                    )}
                    {p.epcExemption && (
                      <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-xs text-green-800 font-medium">
                        ✅ MEES Exemption Registered
                        {p.epcExemptionReason && <span className="block mt-1 text-green-700">Reason: {p.epcExemptionReason}</span>}
                      </div>
                    )}
                  </div>
                </div>

                {/* Portal Card (only if listed) */}
                {p.portalListed && (
                  <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                    <div className="p-4 border-b border-gray-100 bg-gray-50/50">
                      <h3 className="font-semibold text-gray-800">Portal Listing</h3>
                    </div>
                    <div className="p-4 space-y-0">
                      <DetailRow label="Listed" value="Yes" />
                      <DetailRow label="Advertised Rent" value={p.advertisedRent ? `£${p.advertisedRent} pcm` : "—"} />
                    </div>
                  </div>
                )}

                {/* Property Meta */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                  <div className="p-4 border-b border-gray-100 bg-gray-50/50">
                    <h3 className="font-semibold text-gray-800 text-xs uppercase tracking-wider">Property Info</h3>
                  </div>
                  <div className="p-4 space-y-0 text-xs">
                    <DetailRow label="Added by" value={p.createdBy ? `${p.createdBy.title ? p.createdBy.title + ' ' : ''}${p.createdBy.firstName} ${p.createdBy.lastName}` : "—"} />
                    <DetailRow label="Added" value={p.createdAt ? new Date(p.createdAt).toLocaleDateString("en-GB") : "—"} />
                    <DetailRow label="Last updated" value={p.updatedAt ? new Date(p.updatedAt).toLocaleDateString("en-GB") : "—"} />
                  </div>
                </div>
              </div>
            </div>

            <Timeline
              entityType="property"
              entityId={p._id}
              notes={notes}
              hasMore={notesHasMore}
              currentUserId={currentUserId}
              currentUserRole={currentUserRole}
            />
          </div>
        )}

        {/* ── TAB 2: TENANCIES ─────────────────────────────────────────── */}
        {activeTab === "tenancies" && (
          <div className="animate-in fade-in duration-300">
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
              <div className="p-5 border-b border-gray-100 flex items-center justify-between">
                <h3 className="font-semibold text-gray-800">Tenancies</h3>
                <button
                  disabled={tenancyDisabled}
                  title={tenancyTooltip}
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${
                    tenancyDisabled
                      ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                      : "bg-green-600 text-white hover:bg-green-700 shadow-sm"
                  }`}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                  Add Tenancy
                </button>
              </div>

              {tenancies.length === 0 ? (
                <div className="text-center py-16 bg-gray-50/50">
                  <svg className="w-16 h-16 text-gray-200 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m3.75 9v6m3-3H9m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                  </svg>
                  <p className="text-sm font-medium text-gray-500">No tenancies have been created for this property yet.</p>
                  <button
                    disabled={tenancyDisabled}
                    className={`mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${
                      tenancyDisabled
                        ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                        : "bg-green-600 text-white hover:bg-green-700"
                    }`}
                  >
                    Add Tenancy
                  </button>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {tenancies.map(t => (
                    <Link
                      key={t._id}
                      to={`/tenancies/${t._id}`}
                      className={`flex items-center justify-between p-4 hover:bg-gray-50 transition ${t.status === "active" ? "bg-indigo-50/30" : ""}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-xs">
                          {t.tenantIds?.[0]?.firstName?.charAt(0)}{t.tenantIds?.[0]?.lastName?.charAt(0)}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            {t.tenantIds?.map(u => `${u.title ? u.title + ' ' : ''}${u.firstName} ${u.lastName}`).join(", ") || "No tenants"}
                          </p>
                          <p className="text-xs text-gray-500">
                            {t.startDate && new Date(t.startDate).toLocaleDateString("en-GB")}
                            {t.endDate && ` → ${new Date(t.endDate).toLocaleDateString("en-GB")}`}
                            {t.rentAmount && ` · £${t.rentAmount} ${t.rentFrequency || ""}`}
                          </p>
                        </div>
                      </div>
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                        t.status === "active" ? "bg-green-100 text-green-800" :
                        t.status === "past" ? "bg-gray-100 text-gray-600" :
                        "bg-amber-100 text-amber-800"
                      }`}>
                        {t.status?.charAt(0).toUpperCase() + t.status?.slice(1)}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── TAB 3: DOCUMENTS ─────────────────────────────────────────── */}
        {activeTab === "documents" && (
          <div className="animate-in fade-in duration-300">
            <DocumentUploader
              entityType="property"
              entityId={p._id}
              docTypes={propertyDocTypes}
              docs={documents.filter(d => d.docType?.category !== "certificate")}
              isAdmin={isAdmin}
              currentUserName={currentUserName}
            />
          </div>
        )}

        {/* ── TAB 4: CERTIFICATES ──────────────────────────────────────── */}
        {activeTab === "certificates" && (
          <div className="space-y-6 animate-in fade-in duration-300">
            {[
              {
                key: "gas", icon: "🔥", title: "Gas Safety Certificate",
                legal: "Gas safety certificates must be renewed annually. Tenants must receive a copy before moving in.",
                legislation: "Gas Safety (Installation and Use) Regulations 1998",
                cert: certs.gas,
                matchKeys: ["gas_safety_certificate"],
              },
              {
                key: "eicr", icon: "⚡", title: "EICR",
                legal: "Electrical Installation Condition Reports are required every 5 years and before each new tenancy.",
                legislation: "Electrical Safety Standards in the Private Rented Sector (England) Regulations 2020",
                cert: certs.eicr,
                matchKeys: ["eicr"],
              },
              {
                key: "epc", icon: "🍃", title: "EPC Certificate",
                legal: "An EPC is required before marketing the property. Properties rated F or G cannot be let without a registered MEES exemption.",
                legislation: "MEES Regulations 2018",
                cert: certs.epc,
                matchKeys: ["epc"],
              },
            ].map(({ key, icon, title, legal, legislation, cert, matchKeys }) => {
              const status = cert ? getCertificateStatus(cert.expiryDate) : "not_uploaded";
              const statusColour = getCertificateColour(status);
              const colCls = COLOUR_CLS[statusColour] || COLOUR_CLS.grey;
              const days = cert ? getDaysLabel(cert.expiryDate) : null;

              return (
                <div key={key} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                  {/* Card Header */}
                  <div className="p-5 border-b border-gray-100 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{icon}</span>
                      <h3 className="font-bold text-gray-900">{title}</h3>
                    </div>
                    <span className={`text-xs font-bold px-3 py-1 rounded-full border ${colCls.badge}`}>
                      {getCertificateLabel(status)}
                    </span>
                  </div>

                  <div className="p-5">
                    {cert ? (
                      <div className="space-y-4">
                        {/* EPC rating badge */}
                        {key === "epc" && p.epcRating && (
                          <div className="flex items-center gap-3 mb-2">
                            <span className={`inline-flex items-center justify-center w-12 h-12 rounded-lg text-white text-lg font-extrabold ${epcBgClass}`}>
                              {p.epcRating}
                            </span>
                            <span className="text-sm font-semibold text-gray-700">Rating: {p.epcRating}</span>
                          </div>
                        )}

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                          {cert.issueDate && (
                            <div>
                              <span className="text-gray-500">Issue Date:</span>
                              <span className="ml-2 font-medium text-gray-900">{new Date(cert.issueDate).toLocaleDateString("en-GB")}</span>
                            </div>
                          )}
                          <div>
                            <span className="text-gray-500">Expiry Date:</span>
                            <span className="ml-2 font-medium text-gray-900">
                              {cert.expiryDate ? new Date(cert.expiryDate).toLocaleDateString("en-GB") : "—"}
                            </span>
                            {days && <span className={`ml-2 text-xs font-bold ${colCls.icon}`}>{days}</span>}
                          </div>
                          <div>
                            <span className="text-gray-500">Uploaded by:</span>
                            <span className="ml-2 font-medium text-gray-900">
                              {cert.uploadedBy ? `${cert.uploadedBy.title ? cert.uploadedBy.title + ' ' : ''}${cert.uploadedBy.firstName} ${cert.uploadedBy.lastName}` : "—"}
                              {cert.createdAt && ` on ${new Date(cert.createdAt).toLocaleDateString("en-GB")}`}
                            </span>
                          </div>
                          {cert.notes && (
                            <div className="sm:col-span-2">
                              <span className="text-gray-500">Notes:</span>
                              <span className="ml-2 text-gray-700">{cert.notes}</span>
                            </div>
                          )}
                        </div>

                        {/* View/Download buttons */}
                        <div className="flex items-center gap-3 pt-2">
                          {cert.s3Key && (
                            <>
                              <a
                                href={`/documents/s3-download?key=${encodeURIComponent(cert.s3Key)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-3 py-1.5 text-xs font-medium text-indigo-700 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition"
                              >
                                View Certificate
                              </a>
                              <a
                                href={`/documents/s3-download?key=${encodeURIComponent(cert.s3Key)}&download=1`}
                                className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition"
                              >
                                Download
                              </a>
                            </>
                          )}
                          {cert.verifiedAt && cert.verifiedBy && (
                            <span className="text-xs text-green-700 font-medium">
                              ✓ Verified by {cert.verifiedBy.title ? cert.verifiedBy.title + ' ' : ''}{cert.verifiedBy.firstName} {cert.verifiedBy.lastName}
                            </span>
                          )}
                        </div>

                        {/* Expiry/expired alert */}
                        {(status === "expired" || status === "expiring_soon") && (
                          <div className={`p-3 rounded-lg border text-xs font-medium ${
                            status === "expired" ? "bg-red-50 border-red-200 text-red-800" : "bg-amber-50 border-amber-200 text-amber-800"
                          }`}>
                            {status === "expired" ? "This certificate has expired. " : "This certificate is expiring soon. "}
                            Upload a renewed certificate.
                          </div>
                        )}

                        {/* F/G EPC warning */}
                        {key === "epc" && (p.epcRating === "F" || p.epcRating === "G") && !p.epcExemption && (
                          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800 font-medium">
                            This property is below the minimum energy efficiency standard (MEES). You cannot legally let this property without registering an exemption on the PRS Exemptions Register.
                            <a href="https://www.gov.uk/government/publications/private-rented-sector-minimum-energy-efficiency-standard-exemptions" target="_blank" rel="noopener noreferrer" className="block mt-1 text-red-700 font-semibold hover:underline">
                              Register Exemption →
                            </a>
                          </div>
                        )}
                      </div>
                    ) : (
                      /* Empty state */
                      <div className="text-center py-8">
                        <span className="text-4xl block mb-3">{icon}</span>
                        <p className="text-sm font-medium text-gray-500 mb-2">No {title.toLowerCase()} uploaded.</p>
                        <p className="text-xs text-gray-400 max-w-md mx-auto mb-1">{legal}</p>
                        <p className="text-xs text-gray-400 italic mb-4">Legislation: {legislation}</p>
                      </div>
                    )}
                  </div>

                  {/* Upload section at bottom of each card */}
                  <div className="px-5 pb-5">
                    <DocumentUploader
                      entityType="property"
                      entityId={p._id}
                      docTypes={certificateDocTypes.filter(dt => matchKeys.includes(dt.key))}
                      docs={[]}
                      compact={true}
                      label={cert ? "Upload New Certificate" : "Upload Certificate"}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── TAB 5: MAINTENANCE ───────────────────────────────────────── */}
        {activeTab === "maintenance" && (
          <div className="space-y-6 animate-in fade-in duration-300">

            {/* Header row */}
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-gray-800">Open Maintenance Jobs</h2>
              <Link
                to={`/maintenance/new?propertyId=${p._id}`}
                className="flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-black text-white rounded-lg text-xs font-semibold shadow-sm transition"
              >
                + Log New Job
              </Link>
            </div>

            {/* Open Jobs */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              {maintenanceJobs.length === 0 ? (
                <div className="p-10 text-center">
                  <p className="text-sm font-medium text-gray-500">No open maintenance jobs for this property.</p>
                  <p className="text-xs text-gray-400 mt-1">Use the button above to log a new work order.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 border-b border-gray-200">
                      <tr>
                        {["Ref", "Title", "Category", "Priority", "Status", "Contractor", "Target Date", ""].map(h => (
                          <th key={h} className="text-left px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {maintenanceJobs.map(job => {
                        const isOverdue = job.targetDate && new Date(job.targetDate) < new Date() && !["closed","cancelled"].includes(job.status);
                        const priorityColour = { emergency: "text-red-700 bg-red-50 border-red-200", urgent: "text-amber-700 bg-amber-50 border-amber-200", routine: "text-blue-700 bg-blue-50 border-blue-200", planned: "text-slate-600 bg-slate-50 border-slate-200" };
                        return (
                          <tr key={job._id} className="hover:bg-slate-50/80 transition">
                            <td className="px-4 py-3 font-mono font-bold text-gray-800 whitespace-nowrap">{job.jobRef}</td>
                            <td className="px-4 py-3 font-semibold text-gray-800 max-w-[160px] truncate">{job.title}</td>
                            <td className="px-4 py-3 text-gray-500 capitalize whitespace-nowrap">{job.category?.replace(/_/g, " ")}</td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold border ${priorityColour[job.priority] || "bg-slate-50 text-slate-600 border-slate-200"}`}>
                                {job.priority}
                              </span>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                                {job.status?.replace(/_/g, " ")}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{job.contractorId ? job.contractorId.name : <span className="italic text-gray-400">Unassigned</span>}</td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <span className={`font-semibold ${isOverdue ? "text-red-600" : "text-gray-600"}`}>
                                {job.targetDate ? new Date(job.targetDate).toLocaleDateString("en-GB") : "—"}
                              </span>
                              {isOverdue && <span className="block text-[9px] font-bold text-red-600 uppercase">Overdue</span>}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <Link to={`/maintenance/${job._id}`} className="text-indigo-600 hover:underline font-semibold whitespace-nowrap">View →</Link>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Planned Schedules */}
            <div>
              <h2 className="text-sm font-bold text-gray-800 mb-3">Planned Maintenance Schedules</h2>
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                {maintenanceSchedules.length === 0 ? (
                  <div className="p-10 text-center">
                    <p className="text-sm font-medium text-gray-500">No planned schedules configured for this property.</p>
                    <Link to="/maintenance/planned" className="text-xs text-indigo-600 hover:underline mt-1 block">Manage Planned Schedules →</Link>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50 border-b border-gray-200">
                        <tr>
                          {["Title", "Category", "Frequency", "Next Due", "Est. Cost", "Status"].map(h => (
                            <th key={h} className="text-left px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {maintenanceSchedules.map(sched => (
                          <tr key={sched._id} className="hover:bg-slate-50/80 transition">
                            <td className="px-4 py-3 font-semibold text-gray-800">{sched.title}</td>
                            <td className="px-4 py-3 text-gray-500 capitalize">{sched.category?.replace(/_/g, " ")}</td>
                            <td className="px-4 py-3 text-gray-500 capitalize">{sched.frequency?.replace(/_/g, " ")}</td>
                            <td className="px-4 py-3 text-gray-600 font-semibold whitespace-nowrap">
                              {sched.nextDueDate ? new Date(sched.nextDueDate).toLocaleDateString("en-GB") : "—"}
                            </td>
                            <td className="px-4 py-3 text-gray-600">
                              {sched.estimatedCost != null ? `£${sched.estimatedCost.toLocaleString("en-GB")}` : "—"}
                            </td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${sched.active ? "bg-green-50 border-green-200 text-green-700" : "bg-slate-100 border-slate-200 text-slate-500"}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${sched.active ? "bg-green-500" : "bg-slate-400"}`} />
                                {sched.active ? "Active" : "Paused"}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}

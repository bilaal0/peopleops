// routes/properties/index.jsx — Properties listing (card-based)
import { useState } from "react";
import { Link, useLoaderData } from "react-router-dom";
import { getUserFromRequest } from "../../utils/auth.server.js";
import { redirect } from "react-router";
import { Property } from "../../models/property.server.js";
import { connect } from "../../config/db.server.js";

const PROPERTY_TYPE_LABELS = {
  flat:           "Flat",
  terraced:       "Terraced",
  semi_detached:  "Semi-Detached",
  detached:       "Detached",
  bungalow:       "Bungalow",
  maisonette:     "Maisonette",
  studio:         "Studio",
  hmo:            "HMO",
  other:          "Other",
};

const STATUS_CONFIG = {
  available:    { label: "Available",    cls: "bg-green-100 text-green-700 border-green-200" },
  let:          { label: "Let",          cls: "bg-indigo-100 text-indigo-700 border-indigo-200" },
  under_offer:  { label: "Under Offer",  cls: "bg-blue-100 text-blue-700 border-blue-200" },
  maintenance:  { label: "Maintenance",  cls: "bg-amber-100 text-amber-700 border-amber-200" },
  withdrawn:    { label: "Withdrawn",    cls: "bg-gray-100 text-gray-500 border-gray-200" },
};

const EPC_COLORS = {
  A: "bg-emerald-500", B: "bg-green-500", C: "bg-lime-500",
  D: "bg-yellow-500", E: "bg-orange-500", F: "bg-red-500", G: "bg-red-700",
};

export async function loader({ request }) {
  const user = await getUserFromRequest(request);
  if (!user) return redirect("/login");
  if (!user.agencyId && !user.roles?.includes("SUPER_ADMIN")) return redirect("/dashboard");

  await connect();
  const agencyFilter = user.roles?.includes("SUPER_ADMIN") ? {} : { agencyId: user.agencyId };

  const properties = await Property.find({ ...agencyFilter, deleted: false })
    .populate("landlordId", "title firstName lastName")
    .sort({ createdAt: -1 })
    .lean();

  const serialized = properties.map(p => ({
    _id: p._id.toString(),
    addressLine1: p.addressLine1,
    addressLine2: p.addressLine2,
    city: p.city,
    postcode: p.postcode,
    propertyType: p.propertyType,
    status: p.status || "available",
    epcRating: p.epcRating,
    bedrooms: p.bedrooms,
    bathrooms: p.bathrooms,
    landlordName: p.landlordId
      ? `${p.landlordId.title ? p.landlordId.title + ' ' : ''}${p.landlordId.firstName} ${p.landlordId.lastName}`
      : null,
    advertisedRent: p.advertisedRent,
    mainImage: p.mainImage || null,
  }));

  return { properties: serialized };
}

// ── Property Card ─────────────────────────────────────────────────────────
function PropertyCard({ property: p }) {
  const status = STATUS_CONFIG[p.status] || STATUS_CONFIG.available;
  const typeLabel = PROPERTY_TYPE_LABELS[p.propertyType] || p.propertyType;
  const epcColor = EPC_COLORS[p.epcRating] || null;

  return (
    <Link
      to={`/properties/${p._id}`}
      className="group bg-white rounded-xl border border-gray-200 overflow-hidden hover:border-indigo-300 hover:shadow-lg transition-all duration-300"
    >
      {/* ── Image / Placeholder ──────────────────────────────────── */}
      <div className="relative h-48 overflow-hidden">
        {p.mainImage ? (
          <img
            src={`/documents/s3-download?key=${encodeURIComponent(p.mainImage)}`}
            alt={p.addressLine1}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-slate-100 via-slate-50 to-indigo-50 flex items-center justify-center">
            <svg className="w-16 h-16 text-slate-200 group-hover:text-indigo-200 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 0h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z" />
            </svg>
          </div>
        )}

        {/* Status badge — top left */}
        <div className="absolute top-3 left-3">
          <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold border backdrop-blur-sm ${status.cls}`}>
            {status.label}
          </span>
        </div>

        {/* EPC badge — top right */}
        {p.epcRating && (
          <div className="absolute top-3 right-3">
            <span className={`inline-flex items-center justify-center w-8 h-8 rounded-lg text-white text-xs font-bold shadow-sm ${epcColor}`}>
              {p.epcRating}
            </span>
          </div>
        )}

        {/* Property type badge — bottom left */}
        <div className="absolute bottom-3 left-3">
          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold bg-black/50 text-white backdrop-blur-sm">
            {typeLabel}
          </span>
        </div>
      </div>

      {/* ── Card Body ────────────────────────────────────────────── */}
      <div className="p-4">
        {/* Address */}
        <h3 className="font-semibold text-gray-900 text-sm leading-tight group-hover:text-indigo-600 transition-colors">
          {p.addressLine1}
        </h3>
        <p className="text-xs text-gray-500 mt-0.5">
          {[p.addressLine2, p.city, p.postcode].filter(Boolean).join(", ")}
        </p>

        {/* Stats row */}
        <div className="flex items-center gap-3 mt-3 text-xs text-gray-500">
          {p.bedrooms != null && (
            <span className="flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
              </svg>
              {p.bedrooms} bed{p.bedrooms !== 1 ? "s" : ""}
            </span>
          )}
          {p.bathrooms != null && (
            <span className="flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {p.bathrooms} bath{p.bathrooms !== 1 ? "s" : ""}
            </span>
          )}
          {p.advertisedRent != null && (
            <span className="flex items-center gap-1 ml-auto font-semibold text-gray-900">
              £{p.advertisedRent.toLocaleString()} pcm
            </span>
          )}
        </div>

        {/* Landlord + arrow */}
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
          {p.landlordName ? (
            <span className="text-xs text-gray-400 truncate max-w-[60%]">
              <span className="text-gray-500 font-medium">Landlord:</span> {p.landlordName}
            </span>
          ) : (
            <span className="text-xs text-gray-300">No landlord assigned</span>
          )}
          <span className="text-indigo-600 group-hover:text-indigo-800 text-xs font-medium transition-colors flex items-center gap-1">
            View
            <svg className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </span>
        </div>
      </div>
    </Link>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────
export default function PropertiesIndex() {
  const { properties } = useLoaderData();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");

  // Filter
  const filtered = properties.filter(p => {
    if (statusFilter !== "all" && p.status !== statusFilter) return false;
    if (typeFilter !== "all" && p.propertyType !== typeFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      const haystack = `${p.addressLine1} ${p.addressLine2 || ""} ${p.city} ${p.postcode} ${p.landlordName || ""}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  // Count by status for filter pills
  const statusCounts = properties.reduce((acc, p) => {
    acc[p.status] = (acc[p.status] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="p-6">
      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Properties</h1>
          <p className="text-sm text-gray-500 mt-0.5">{properties.length} properties in your portfolio</p>
        </div>
        <Link
          to="/properties/add"
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-white text-sm font-medium hover:bg-indigo-700 transition shadow-sm"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Add Property
        </Link>
      </div>

      {/* ── Filters Bar ─────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Search */}
          <div className="relative flex-1">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by address, postcode, or landlord..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          {/* Status filter pills */}
          <div className="flex items-center gap-1 flex-wrap">
            <button
              onClick={() => setStatusFilter("all")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${statusFilter === "all" ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
            >
              All ({properties.length})
            </button>
            {Object.entries(STATUS_CONFIG).map(([key, cfg]) => {
              const count = statusCounts[key] || 0;
              if (count === 0) return null;
              return (
                <button
                  key={key}
                  onClick={() => setStatusFilter(statusFilter === key ? "all" : key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${statusFilter === key ? "bg-indigo-600 text-white" : `${cfg.cls} hover:opacity-80`}`}
                >
                  {cfg.label} ({count})
                </button>
              );
            })}
          </div>

          {/* Type filter */}
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-indigo-500 min-w-[140px]"
          >
            <option value="all">All Types</option>
            {Object.entries(PROPERTY_TYPE_LABELS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Cards Grid ──────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-xl border-2 border-dashed border-gray-200">
          <svg className="w-14 h-14 text-gray-200 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 0h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z" />
          </svg>
          {search || statusFilter !== "all" || typeFilter !== "all" ? (
            <>
              <p className="text-gray-500 font-medium">No properties match your filters</p>
              <button
                onClick={() => { setSearch(""); setStatusFilter("all"); setTypeFilter("all"); }}
                className="mt-2 text-sm text-indigo-600 hover:text-indigo-800 font-medium"
              >
                Clear all filters
              </button>
            </>
          ) : (
            <>
              <p className="text-gray-500 font-medium">No properties yet</p>
              <p className="text-sm text-gray-400 mt-1">Add your first property to get started</p>
              <Link
                to="/properties/add"
                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-white text-sm font-medium hover:bg-indigo-700 transition"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                Add Property
              </Link>
            </>
          )}
        </div>
      ) : (
        <>
          <p className="text-xs text-gray-400 mb-3">Showing {filtered.length} of {properties.length} properties</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {filtered.map(p => (
              <PropertyCard key={p._id} property={p} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

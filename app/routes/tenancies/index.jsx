// routes/tenancies/index.jsx — Tenancy list (Server-side Pagination)
import { useState, useEffect } from "react";
import { Link, useLoaderData, useSubmit, useNavigation, Form } from "react-router-dom";
import { getUserFromRequest } from "../../utils/auth.server.js";
import { redirect } from "react-router";
import { Tenancy } from "../../models/tenancy.server.js";
import { Property } from "../../models/property.server.js";
import { User } from "../../models/user.server.js";
import { connect } from "../../config/db.server.js";
import DataTable from "../../components/ui/DataTable.jsx";

const fmtDate = (d) => {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const fmtRent = (n) =>
  n ? `£${Number(n).toLocaleString("en-GB")}` : "—";

export async function loader({ request }) {
  const user = await getUserFromRequest(request);
  if (!user) return redirect("/login");
  if (!user.organizationId && !user.roles?.includes("SUPER_ADMIN"))
    return redirect("/dashboard");

  await connect();

  const url = new URL(request.url);
  const search = url.searchParams.get("search") || "";
  const statusParam = url.searchParams.get("status") || "active";
  const page = parseInt(url.searchParams.get("page") || "1", 10);
  const limit = 25;

  const isSuperAdmin = user.roles?.includes("SUPER_ADMIN");
  const organizationFilter = isSuperAdmin ? {} : { organizationId: user.organizationId };

  // 1. Build Query
  const query = { ...organizationFilter, deleted: false };
  if (statusParam && statusParam !== "all") {
    query.status = statusParam;
  }

  // 2. Search Logic (Property Address or Tenant Name)
  if (search.trim()) {
    const rx = new RegExp(search.trim(), "i");
    const [props, tenants] = await Promise.all([
      Property.find({ ...organizationFilter, deleted: false, $or: [{ addressLine1: rx }, { postcode: rx }] }, "_id").lean(),
      User.find({ ...organizationFilter, roles: "TENANT", deleted: false, $or: [{ firstName: rx }, { lastName: rx }] }, "_id").lean()
    ]);
    query.$or = [
      { propertyId: { $in: props.map(p => p._id) } },
      { tenantIds: { $in: tenants.map(t => t._id) } }
    ];
  }

  // 3. Fetch Data & Stats
  const [tenancies, totalCount, activeCount, endingSoonCount, endedCount] = await Promise.all([
    Tenancy.find(query)
      .populate("propertyId", "addressLine1 city postcode")
      .populate("landlordId", "title firstName lastName")
      .populate("tenantIds", "title firstName lastName")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Tenancy.countDocuments(query),
    Tenancy.countDocuments({ ...organizationFilter, deleted: false, status: "active" }),
    Tenancy.countDocuments({
      ...organizationFilter,
      deleted: false,
      status: "active",
      endDate: { $gte: new Date(), $lte: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000) },
    }),
    Tenancy.countDocuments({ ...organizationFilter, deleted: false, status: "ended" }),
  ]);

  // Deep serialize Mongoose documents
  const safeTenancies = tenancies.map((t) => ({
    _id:        t._id.toString(),
    property:   t.propertyId
      ? `${t.propertyId.addressLine1}, ${t.propertyId.city || ""} ${t.propertyId.postcode || ""}`.trim().replace(/,\s*$/, "")
      : "Unknown property",
    landlord:   t.landlordId
      ? `${t.landlordId.title ? t.landlordId.title + ' ' : ''}${t.landlordId.firstName} ${t.landlordId.lastName}`
      : "Unknown",
    landlordId: t.landlordId?._id?.toString() || null,
    tenants:    Array.isArray(t.tenantIds)
      ? t.tenantIds.map((u) => `${u.title ? u.title + ' ' : ''}${u.firstName} ${u.lastName}`).join(", ")
      : "—",
    tenancyType: t.tenancyType?.toUpperCase() || "—",
    rent:        t.rent?.amount || null,
    startDate:   t.startDate ? t.startDate.toISOString() : null,
    endDate:     t.endDate   ? t.endDate.toISOString()   : null,
    status:      t.status || "active",
  }));

  return {
    tenancies: safeTenancies,
    totalCount,
    page,
    limit,
    search,
    statusFilter: statusParam,
    summary: { active: activeCount, endingSoon: endingSoonCount, ended: endedCount },
  };
}

const STATUS_BADGE = {
  active:      "bg-green-100 text-green-800",
  ended:       "bg-gray-100 text-gray-600",
  terminated:  "bg-red-100 text-red-700",
  abandoned:   "bg-red-100 text-red-700",
};
const TYPE_BADGE = {
  AST: "bg-indigo-100 text-indigo-700",
  APT: "bg-purple-100 text-purple-700",
};

export default function TenanciesIndex() {
  const { tenancies, totalCount, page, limit, search, statusFilter, summary } = useLoaderData();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isSearching = navigation.state === "loading";

  // Local state for debounced search
  const [searchValue, setSearchValue] = useState(search);

  useEffect(() => {
    setSearchValue(search);
  }, [search]);

  useEffect(() => {
    const handler = setTimeout(() => {
      if (searchValue !== search) {
        // Trigger submit when typing stops
        submit({ search: searchValue, status: statusFilter, page: 1 }, { replace: true });
      }
    }, 400);
    return () => clearTimeout(handler);
  }, [searchValue, search, statusFilter, submit]);

  const handleStatusChange = (e) => {
    submit({ search: searchValue, status: e.target.value, page: 1 });
  };

  const handlePageChange = (newPage) => {
    submit({ search: searchValue, status: statusFilter, page: newPage });
  };

  const totalPages = Math.ceil(totalCount / limit);

  const columns = [
    {
      header: "Property",
      accessorKey: "property",
      cell: ({ row }) => (
        <Link
          to={`/tenancies/${row.original._id}`}
          className="font-medium text-gray-900 hover:text-indigo-600"
        >
          {row.original.property}
        </Link>
      ),
    },
    {
      header: "Landlord",
      accessorKey: "landlord",
      cell: ({ row }) =>
        row.original.landlordId ? (
          <Link
            to={`/landlords/${row.original.landlordId}`}
            className="text-sm text-indigo-600 hover:underline"
          >
            {row.original.landlord}
          </Link>
        ) : (
          <span className="text-sm text-gray-500">{row.original.landlord}</span>
        ),
    },
    {
      header: "Tenant(s)",
      accessorKey: "tenants",
      cell: ({ row }) => (
        <span className="text-sm text-gray-700">{row.original.tenants || "—"}</span>
      ),
    },
    {
      header: "Type",
      accessorKey: "tenancyType",
      cell: ({ row }) => {
        const t = row.original.tenancyType;
        return (
          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${TYPE_BADGE[t] || "bg-gray-100 text-gray-600"}`}>
            {t}
          </span>
        );
      },
    },
    {
      header: "Rent",
      accessorKey: "rent",
      cell: ({ row }) => (
        <span className="text-sm font-medium text-gray-900">
          {fmtRent(row.original.rent)} <span className="text-gray-400 font-normal text-xs">pcm</span>
        </span>
      ),
    },
    {
      header: "Start Date",
      accessorKey: "startDate",
      cell: ({ row }) => (
        <span className="text-sm text-gray-600">{fmtDate(row.original.startDate)}</span>
      ),
    },
    {
      header: "End Date",
      accessorKey: "endDate",
      cell: ({ row }) => (
        <span className="text-sm text-gray-600">
          {row.original.endDate ? fmtDate(row.original.endDate) : (
            <span className="italic text-gray-400">Periodic</span>
          )}
        </span>
      ),
    },
    {
      header: "Status",
      accessorKey: "status",
      cell: ({ row }) => (
        <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize ${STATUS_BADGE[row.original.status] || "bg-gray-100 text-gray-600"}`}>
          {row.original.status}
        </span>
      ),
    },
    {
      header: "",
      id: "actions",
      enableSorting: false,
      cell: ({ row }) => (
        <Link
          to={`/tenancies/${row.original._id}`}
          className="px-3 py-1.5 text-xs font-medium text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
        >
          View
        </Link>
      ),
    },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tenancies</h1>
          <p className="text-sm text-gray-500 mt-0.5">All tenancy agreements</p>
        </div>
        <Link
          to="/tenancies/add"
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 transition shadow-sm whitespace-nowrap"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Add Tenancy
        </Link>
      </div>

      {/* ── Summary Bar ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: "Active",       value: summary.active,     cls: "text-green-700", bg: "bg-green-50" },
          { label: "Ending Soon",  value: summary.endingSoon, cls: "text-amber-700", bg: "bg-amber-50" },
          { label: "Ended",        value: summary.ended,       cls: "text-gray-500", bg: "bg-gray-50" },
        ].map(({ label, value, cls, bg }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-200 p-5 flex items-center shadow-sm">
            <div className={`h-10 w-10 rounded-full flex items-center justify-center mr-4 ${bg} ${cls}`}>
              <div className="font-bold text-lg">{value}</div>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Filters ────────────────────────────────────────────────────────── */}
      <Form className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col sm:flex-row items-center gap-4 shadow-sm">
        <div className="flex-1 w-full relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            name="search"
            placeholder="Search by property or tenant name..."
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 bg-gray-50 focus:bg-white transition"
          />
          {isSearching && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <span className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin inline-block"></span>
            </div>
          )}
        </div>
        <div className="flex-none w-full sm:w-auto flex items-center gap-3">
          <label className="text-sm font-medium text-gray-700 whitespace-nowrap">Status:</label>
          <select
            name="status"
            value={statusFilter}
            onChange={handleStatusChange}
            className="w-full sm:w-48 py-2 pl-3 pr-8 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 bg-gray-50"
          >
            <option value="active">Active Only</option>
            <option value="ended">Ended Only</option>
            <option value="all">All Statuses</option>
          </select>
        </div>
      </Form>

      {/* ── Table ──────────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden p-4 relative">
        {isSearching && (
          <div className="absolute inset-0 bg-white/50 z-10 flex items-center justify-center"></div>
        )}
        
        {tenancies.length === 0 ? (
          <div className="text-center py-20 px-6">
            <svg className="w-12 h-12 mx-auto text-gray-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-gray-900 font-semibold mb-1">No tenancies found</p>
            <p className="text-gray-500 text-sm mb-6">
              {search || statusFilter !== "all" 
                ? "Try adjusting your filters to see more results." 
                : "No tenancies yet. Add your first tenancy."}
            </p>
            {(!search && statusFilter === "all") && (
              <Link
                to="/tenancies/add"
                className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 transition"
              >
                Add Tenancy
              </Link>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <DataTable columns={columns} data={tenancies} />
            
            {/* Server-Side Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-gray-200 pt-4 mt-4">
                <div className="text-sm text-gray-500">
                  Showing <span className="font-medium">{(page - 1) * limit + 1}</span> to <span className="font-medium">{Math.min(page * limit, totalCount)}</span> of <span className="font-medium">{totalCount}</span> results
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handlePageChange(page - 1)}
                    disabled={page <= 1}
                    className="px-3 py-1.5 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => handlePageChange(page + 1)}
                    disabled={page >= totalPages}
                    className="px-3 py-1.5 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

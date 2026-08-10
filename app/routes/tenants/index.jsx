// routes/tenants/index.jsx — Tenants list
import { useState, useMemo } from "react";
import { Link, useLoaderData } from "react-router-dom";
import { getUserFromRequest } from "../../utils/auth.server.js";
import { redirect } from "react-router";
import { User } from "../../models/user.server.js";
import { connect } from "../../config/db.server.js";
import DataTable from "../../components/ui/DataTable.jsx";
import { getRightToRentStatus } from "../../utils/compliance.js";

// Helper for native date formatting
const formatDate = (dateString) => {
  if (!dateString) return "";
  return new Date(dateString).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

export async function loader({ request }) {
  const user = await getUserFromRequest(request);
  if (!user) return redirect("/login");
  if (!user.organizationId && !user.roles?.includes("SUPER_ADMIN")) return redirect("/dashboard");

  await connect();

  // Fetch all tenants, including deleted/archived so we can filter them in the UI
  const query = { roles: "TENANT" };
  if (!user.roles?.includes("SUPER_ADMIN")) {
    query.organizationId = user.organizationId;
  }

  const users = await User.find(query)
    .sort({ createdAt: -1 })
    .lean();

  return {
    tenants: users.map(u => ({
      _id: u._id.toString(),
      organizationId: u.organizationId?.toString(),
      firstName: u.firstName || "",
      lastName: u.lastName || "",
      email: u.email || "",
      phone: u.phone || "",
      status: u.status, // 1 = active, 0 = inactive
      deleted: u.deleted || false,
      added: u.createdAt ? u.createdAt.toISOString() : null,
      
      // Domain fields from tenantData
      referencingPassed: u.tenantData?.referencingPassed,
      rtr: getRightToRentStatus(u),
    })),
  };
}

export default function TenantsIndex() {
  const { tenants } = useLoaderData();

  // Filters State
  const [statusFilter, setStatusFilter] = useState("all"); // 'all', 'active', 'inactive', 'archived'
  const [rtrFilter, setRtrFilter] = useState("all"); // 'all', 'issues'

  // Calculate Summary Stats (ignoring archived for the general stats)
  const activeTenants = tenants.filter(t => !t.deleted);
  const totalCount = activeTenants.length;
  const activeCount = activeTenants.filter(t => t.status === 1).length;
  const rtrIssuesCount = activeTenants.filter(t => t.rtr.status === 'expired' || t.rtr.status === 'not_checked').length;

  // Filter Data
  const filteredTenants = useMemo(() => {
    return tenants.filter(t => {
      // ── Status Filter ──
      if (statusFilter === "active" && (t.status !== 1 || t.deleted)) return false;
      if (statusFilter === "inactive" && (t.status !== 0 || t.deleted)) return false;
      if (statusFilter === "archived" && !t.deleted) return false;
      if (statusFilter === "all" && t.deleted) return false; // Hide archived from "All"

      // ── RTR Filter ──
      if (rtrFilter === "issues") {
        if (t.rtr.status !== 'expired' && t.rtr.status !== 'not_checked') return false;
      }
      return true;
    });
  }, [tenants, statusFilter, rtrFilter]);

  const columns = useMemo(() => [
    {
      accessorKey: "firstName",
      header: "Name",
      cell: ({ row }) => {
        const t = row.original;
        return (
          <Link to={`/tenants/${t._id}`} className="font-medium text-indigo-600 hover:text-indigo-800">
            {t.title ? t.title + ' ' : ''}{t.firstName} {t.lastName}
          </Link>
        );
      },
    },
    {
      accessorKey: "email",
      header: "Contact",
      cell: ({ row }) => {
        const t = row.original;
        return (
          <div>
            <div className="text-sm text-gray-700">{t.email || "—"}</div>
            {t.phone && <div className="text-xs text-gray-500 mt-0.5">{t.phone}</div>}
          </div>
        );
      },
    },
    {
      id: "rightToRent",
      header: "RTR Status",
      accessorFn: row => row.rtr.label,
      cell: ({ row }) => {
        const rtr = row.original.rtr;
        const colorClass = {
          green: "bg-green-100 text-green-800 border-green-200",
          amber: "bg-amber-100 text-amber-800 border-amber-200",
          red: "bg-red-100 text-red-800 border-red-200",
          grey: "bg-gray-100 text-gray-800 border-gray-200",
        }[rtr.colour] || "bg-gray-100 text-gray-800 border-gray-200";

        return (
          <div>
            <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold border ${colorClass}`}>
              {rtr.label}
            </span>
            {rtr.daysUntil !== undefined && (
              <div className="text-xs text-gray-500 mt-1 whitespace-nowrap">
                {rtr.daysUntil < 0 ? `Expired ${Math.abs(rtr.daysUntil)} days ago` : `${rtr.daysUntil} days left`}
              </div>
            )}
          </div>
        );
      },
    },
    {
      id: "referencing",
      header: "Referencing",
      accessorFn: row => row.referencingPassed === true ? "Passed" : row.referencingPassed === false ? "Failed" : "Not done",
      cell: ({ row }) => {
        const status = row.original.referencingPassed;
        if (status === true) return <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-green-50 text-green-700">Passed</span>;
        if (status === false) return <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-red-50 text-red-700">Failed</span>;
        return <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">Not done</span>;
      },
    },
    {
      id: "status",
      header: "Status",
      accessorFn: row => row.deleted ? "Archived" : row.status === 1 ? "Active" : "Inactive",
      cell: ({ row }) => {
        const t = row.original;
        if (t.deleted) return <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">Archived</span>;
        return (
          <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${t.status === 1 ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-600"}`}>
            {t.status === 1 ? "Active" : "Inactive"}
          </span>
        );
      },
    },
    {
      accessorKey: "added",
      header: "Added",
      cell: ({ row }) => (
        <span className="text-sm text-gray-500">{formatDate(row.original.added)}</span>
      )
    },
    {
      id: "actions",
      header: "",
      enableSorting: false,
      cell: ({ row }) => (
        <div className="text-right flex items-center justify-end gap-3">
          <Link to={`/tenants/${row.original._id}`} className="text-sm font-medium text-gray-600 hover:text-indigo-600 transition">
            View
          </Link>
          <Link to={`/tenants/${row.original._id}/edit`} className="text-sm font-medium text-gray-600 hover:text-indigo-600 transition">
            Edit
          </Link>
        </div>
      ),
    },
  ], []);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      
      {/* Header & Add Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tenants</h1>
          <p className="text-sm text-gray-500 mt-1">Manage and track your organization's tenants.</p>
        </div>
        <Link
          to="/tenants/add"
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-white text-sm font-semibold hover:bg-indigo-700 transition shadow-sm whitespace-nowrap"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Add Tenant
        </Link>
      </div>

      {/* Summary Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5 flex items-center shadow-sm">
          <div className="h-10 w-10 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 mr-4">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500">Total Tenants</p>
            <p className="text-2xl font-bold text-gray-900">{totalCount}</p>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5 flex items-center shadow-sm">
          <div className="h-10 w-10 rounded-full bg-green-50 flex items-center justify-center text-green-600 mr-4">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500">Active</p>
            <p className="text-2xl font-bold text-gray-900">{activeCount}</p>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5 flex items-center shadow-sm">
          <div className="h-10 w-10 rounded-full bg-red-50 flex items-center justify-center text-red-600 mr-4">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500">Right to Rent Issues</p>
            <p className="text-2xl font-bold text-gray-900">{rtrIssuesCount}</p>
          </div>
        </div>
      </div>

      {/* Filters Row */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm flex flex-col sm:flex-row gap-4">
        {/* Status Filter */}
        <div className="flex-1 sm:max-w-xs flex items-center gap-3">
          <label className="text-sm font-medium text-gray-700 whitespace-nowrap">Status:</label>
          <select 
            value={statusFilter} 
            onChange={e => setStatusFilter(e.target.value)}
            className="w-full border-gray-300 rounded-lg text-sm focus:ring-indigo-500 focus:border-indigo-500 bg-gray-50 py-2 pl-3"
          >
            <option value="all">All Active & Inactive</option>
            <option value="active">Active Only</option>
            <option value="inactive">Inactive Only</option>
            <option value="archived">Archived</option>
          </select>
        </div>

        {/* RTR Filter */}
        <div className="flex-1 sm:max-w-xs flex items-center gap-3">
          <label className="text-sm font-medium text-gray-700 whitespace-nowrap">RTR:</label>
          <select 
            value={rtrFilter} 
            onChange={e => setRtrFilter(e.target.value)}
            className="w-full border-gray-300 rounded-lg text-sm focus:ring-indigo-500 focus:border-indigo-500 bg-gray-50 py-2 pl-3"
          >
            <option value="all">All Statuses</option>
            <option value="issues">Issues Only</option>
          </select>
        </div>
      </div>

      {/* Data Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden p-4">
        {filteredTenants.length === 0 ? (
          <div className="text-center py-20 px-6">
            <svg className="w-12 h-12 text-gray-300 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <p className="text-gray-900 font-semibold mb-1">No tenants found</p>
            <p className="text-sm text-gray-500 mb-6">You don't have any tenants matching these filters yet.</p>
            {tenants.length === 0 && (
              <Link to="/tenants/add" className="inline-flex items-center gap-2 rounded-lg bg-white border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition shadow-sm">
                Add your first tenant
              </Link>
            )}
          </div>
        ) : (
          <DataTable
            columns={columns}
            data={filteredTenants}
            searchPlaceholder="Search tenants by name or email…"
            emptyMessage="No tenants match your search."
          />
        )}
      </div>
    </div>
  );
}

import { useMemo } from "react";
import { Link, useLoaderData } from "react-router";
import { getUserFromRequest } from "../../../utils/auth.server.js";
import { redirect } from "react-router";
import { User } from "../../../models/user.server.js";
import { connect } from "../../../config/db.server.js";
import DataTable from "../../../components/ui/DataTable.jsx";

export async function loader({ request }) {
  const user = await getUserFromRequest(request);
  if (!user) return redirect("/login");

  await connect();

  const query = {
    roles: "CLIENT",
    deleted: false,
  };

  if (!user.roles?.includes("SUPER_ADMIN") && user.organizationId) {
    query.organizationId = user.organizationId;
  }

  const clientUsers = await User.find(query).sort({ createdAt: -1 }).lean();

  return {
    clientList: clientUsers.map((u) => {
      const fullName = `${u.title ? u.title + " " : ""}${u.firstName || ""} ${u.lastName || ""}`.trim();
      const addressParts = [
        u.addressLine1,
        u.addressLine2,
        u.addressLine3,
        u.postTown || u.city,
        u.postcode,
      ].filter(Boolean);
      const address = addressParts.join(", ") || "";

      return {
        _id: u._id.toString(),
        name: fullName || u.companyName || "Unnamed Client",
        fullName: fullName || "Unnamed Client",
        title: u.title || "",
        firstName: u.firstName || "",
        lastName: u.lastName || "",
        email: u.email || "",
        phone: u.phone || u.telephoneNo || "",
        address,
        addressLine1: u.addressLine1 || "",
        addressLine2: u.addressLine2 || "",
        addressLine3: u.addressLine3 || "",
        city: u.postTown || u.city || "",
        postcode: u.postcode || "",
        positionInCompany: u.positionInCompany || "",
        isCompany: Boolean(u.companyName || u.landlordData?.isCompany || u.landlordData?.companyName),
        companyName: u.companyName || u.landlordData?.companyName || "",
        companyNumber: u.landlordData?.companyNumber || "",
        services: u.services || [],
        status: u.status ?? 1,
        joiningDate: u.joiningDate ? new Date(u.joiningDate).toLocaleDateString("en-GB") : "—",
        createdAt: u.createdAt ? new Date(u.createdAt).toLocaleDateString("en-GB") : "—",
      };
    }),
  };
}

export default function ClientIndexPage() {
  const { clientList } = useLoaderData();

  const columns = useMemo(
    () => [
      {
        accessorKey: "name",
        header: "Name",
        cell: ({ row }) => {
          const c = row.original;
          const active = c.status === 1;
          return (
            <div>
              <div className="flex items-center gap-2">
                <Link
                  to={`/user-accounts/client/${c._id}`}
                  className="font-semibold text-gray-900 hover:text-indigo-600 transition"
                >
                  {c.name}
                </Link>
                {!active && (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-100 text-red-700">
                    Inactive
                  </span>
                )}
              </div>
              {c.companyName && c.companyName !== c.name && (
                <p className="text-xs text-gray-500 font-normal truncate max-w-xs mt-0.5">
                  {c.companyName}
                </p>
              )}
            </div>
          );
        },
      },
      {
        accessorKey: "email",
        header: "Email",
        cell: ({ row }) =>
          row.original.email ? (
            <a
              href={`mailto:${row.original.email}`}
              className="text-gray-700 hover:text-indigo-600 transition"
            >
              {row.original.email}
            </a>
          ) : (
            <span className="text-gray-400">—</span>
          ),
      },
      {
        accessorKey: "address",
        header: "Address",
        cell: ({ row }) =>
          row.original.address ? (
            <span className="text-gray-700 text-sm max-w-md block" title={row.original.address}>
              {row.original.address}
            </span>
          ) : (
            <span className="text-gray-400 italic">No address</span>
          ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => {
          const c = row.original;
          return (
            <div className="flex justify-end">
              <Link
                to={`/user-accounts/client/${c._id}`}
                className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-slate-800 to-slate-700 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:from-slate-900 hover:to-slate-800 transition-all"
              >
                View
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                </svg>
              </Link>
            </div>
          );
        },
      },
    ],
    []
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 mb-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Client Accounts</h1>
              <p className="mt-1 text-sm text-gray-600">
                Manage external clients, company accounts, and business contacts
              </p>
            </div>
            <Link
              to="/user-accounts/client/add"
              className="inline-flex items-center justify-center px-4 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition shadow-xs gap-2"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Client Account
            </Link>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-xs">
          <DataTable
            columns={columns}
            data={clientList}
            searchPlaceholder="Search clients by name, email, or address..."
            emptyMessage="No client accounts found. Click 'Add Client Account' to create one."
          />
        </div>
      </div>
    </div>
  );
}

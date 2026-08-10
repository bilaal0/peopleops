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
    clientList: clientUsers.map((u) => ({
      _id: u._id.toString(),
      title: u.title || "",
      firstName: u.firstName || "",
      lastName: u.lastName || "",
      email: u.email || "",
      phone: u.phone || u.telephoneNo || "",
      positionInCompany: u.positionInCompany || "",
      isCompany: Boolean(u.landlordData?.isCompany),
      companyName: u.landlordData?.companyName || "",
      companyNumber: u.landlordData?.companyNumber || "",
      status: u.status ?? 1,
      createdAt: u.createdAt ? new Date(u.createdAt).toLocaleDateString("en-GB") : "—",
    })),
  };
}

export default function ClientIndexPage() {
  const { clientList } = useLoaderData();

  const columns = useMemo(
    () => [
      {
        accessorKey: "firstName",
        header: "Name",
        cell: ({ row }) => {
          const c = row.original;
          const fullName = `${c.title ? c.title + " " : ""}${c.firstName} ${c.lastName}`.trim();
          return (
            <Link
              to={`/user-accounts/client/${c._id}`}
              className="font-semibold text-gray-900 hover:text-indigo-600 transition"
            >
              {fullName || "Unnamed Client"}
            </Link>
          );
        },
      },
      {
        accessorKey: "phone",
        header: "Phone",
        cell: ({ row }) => row.original.phone || <span className="text-gray-400">—</span>,
      },
      {
        accessorKey: "email",
        header: "Email",
        cell: ({ row }) => row.original.email || <span className="text-gray-400">—</span>,
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => {
          const c = row.original;
          return (
            <Link
              to={`/user-accounts/client/${c._id}`}
              className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-slate-800 to-slate-700 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:from-slate-900 hover:to-slate-800 transition-all"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              Edit
            </Link>
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
            searchPlaceholder="Search clients by name, email, or company..."
            emptyMessage="No client accounts found. Click 'Add Client Account' to create one."
          />
        </div>
      </div>
    </div>
  );
}

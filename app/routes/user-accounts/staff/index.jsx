import { useMemo } from "react";
import { Link, useLoaderData, useNavigate, Form } from "react-router";
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
    roles: { $in: ["EMPLOYEE", "REGISTERED_MANAGER", "ADMIN", "SUPER_ADMIN"] },
    deleted: false,
  };

  if (!user.roles?.includes("SUPER_ADMIN") && user.agencyId) {
    query.agencyId = user.agencyId;
  }

  const staffUsers = await User.find(query).sort({ createdAt: -1 }).lean();

  return {
    staffList: staffUsers.map((u) => ({
      _id: u._id.toString(),
      title: u.title || "",
      firstName: u.firstName || "",
      lastName: u.lastName || "",
      email: u.email || "",
      phone: u.phone || u.telephoneNo || "",
      jobTitle: u.jobTitle || "",
      roles: u.roles || [],
      status: u.status ?? 1,
      joiningDate: u.joiningDate ? new Date(u.joiningDate).toLocaleDateString() : "—",
      createdAt: u.createdAt ? new Date(u.createdAt).toLocaleDateString() : "—",
    })),
  };
}

const ROLE_BADGE = {
  SUPER_ADMIN: { label: "Super Admin", cls: "bg-purple-100 text-purple-800" },
  ADMIN: { label: "Admin", cls: "bg-indigo-100 text-indigo-800" },
  REGISTERED_MANAGER: { label: "Manager", cls: "bg-blue-100 text-blue-800" },
  EMPLOYEE: { label: "Employee", cls: "bg-emerald-100 text-emerald-800" },
};

export default function StaffIndexPage() {
  const { staffList } = useLoaderData();
  const navigate = useNavigate();

  const columns = useMemo(
    () => [
      {
        accessorKey: "firstName",
        header: "Name",
        cell: ({ row }) => {
          const s = row.original;
          const fullName = `${s.title ? s.title + " " : ""}${s.firstName} ${s.lastName}`.trim();
          return (
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-sm shrink-0 border border-indigo-200">
                {s.firstName.charAt(0).toUpperCase()}
              </div>
              <Link
                to={`/user-accounts/staff/${s._id}`}
                className="font-semibold text-gray-900 hover:text-indigo-600 transition"
              >
                {fullName || "Unnamed Staff"}
              </Link>
            </div>
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
        header: "Actions",
        cell: ({ row }) => {
          const s = row.original;
          return (
            <div className="flex items-center gap-2">
              <Link
                to={`/user-accounts/staff/${s._id}`}
                className="p-1.5 text-gray-500 hover:text-indigo-600 hover:bg-gray-100 rounded-md transition"
                title="View Details"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              </Link>
              <Link
                to={`/user-accounts/staff/${s._id}/edit`}
                className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-gray-100 rounded-md transition"
                title="Edit"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </Link>
              <Form method="post" action={`/user-accounts/staff/${s._id}/delete`} onSubmit={(e) => {
                if (!confirm("Are you sure you want to delete this staff account?")) e.preventDefault();
              }}>
                <button
                  type="submit"
                  className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-gray-100 rounded-md transition cursor-pointer"
                  title="Delete"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </Form>
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
              <h1 className="text-3xl font-bold text-gray-900">Staff Accounts</h1>
              <p className="mt-1 text-sm text-gray-600">
                Manage internal team members, job titles, and system roles
              </p>
            </div>
            <Link
              to="/user-accounts/staff/add"
              className="inline-flex items-center justify-center px-4 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition shadow-xs gap-2"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Staff Member
            </Link>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-xs">
          <DataTable
            columns={columns}
            data={staffList}
            searchPlaceholder="Search staff by name, email, or role..."
            emptyMessage="No staff accounts found. Click 'Add Staff Member' to create one."
          />
        </div>
      </div>
    </div>
  );
}

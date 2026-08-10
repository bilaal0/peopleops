// routes/landlords/index.jsx — Landlords list
import { useMemo } from "react";
import { Link, useLoaderData } from "react-router-dom";
import { getUserFromRequest } from "../../utils/auth.server.js";
import { redirect } from "react-router";
import { User } from "../../models/user.server.js";
import { connect } from "../../config/db.server.js";
import DataTable from "../../components/ui/DataTable.jsx";

export async function loader({ request }) {
  const user = await getUserFromRequest(request);
  if (!user) return redirect("/login");
  if (!user.organizationId && !user.roles?.includes("SUPER_ADMIN")) return redirect("/dashboard");

  await connect();

  const query = { roles: "LANDLORD", deleted: false };
  if (!user.roles?.includes("SUPER_ADMIN")) {
    query.organizationId = user.organizationId;
  }

  const users = await User.find(query).sort({ createdAt: -1 }).lean();

  return {
    landlords: users.map(u => ({
      _id: u._id.toString(),
      organizationId: u.organizationId?.toString(),
      // Identity from User
      firstName: u.firstName || "",
      lastName: u.lastName || "",
      email: u.email || "",
      phone: u.phone || "",
      userId: u._id.toString(),
      // Domain fields from landlordData
      isCompany: u.landlordData?.isCompany,
      companyName: u.landlordData?.companyName,
      isOverseas: u.landlordData?.isOverseas,
      amlResult: u.landlordData?.amlResult,
      status: u.landlordData?.status,
      createdBy: u.addedBy?.toString() || null,
      updatedBy: null, // User schema does not have generic updatedBy
    })),
  };
}

const AML_BADGE = {
  pass:  { label: "Pass",    cls: "bg-green-100 text-green-800" },
  refer: { label: "Refer",   cls: "bg-amber-100 text-amber-800" },
  fail:  { label: "Fail",    cls: "bg-red-100 text-red-800"    },
};

export default function LandlordsIndex() {
  const { landlords } = useLoaderData();

  const columns = useMemo(() => [
    {
      accessorKey: "firstName",
      header: "Name",
      cell: ({ row }) => {
        const l = row.original;
        return (
          <div>
            <div className="font-medium text-gray-900">{l.title ? l.title + ' ' : ''}{l.firstName} {l.lastName}</div>
            {l.companyName && <div className="text-xs text-gray-400">{l.companyName}</div>}
          </div>
        );
      },
    },
    {
      accessorKey: "isCompany",
      header: "Type",
      cell: ({ row }) => {
        const l = row.original;
        return (
          <div className="flex items-center gap-1 flex-wrap">
            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${l.isCompany ? "bg-purple-100 text-purple-800" : "bg-blue-100 text-blue-800"}`}>
              {l.isCompany ? "Company" : "Individual"}
            </span>
            {l.isOverseas && (
              <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700">Overseas</span>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: "email",
      header: "Contact",
      cell: ({ row }) => {
        const l = row.original;
        return (
          <div>
            <div className="text-sm text-gray-700">{l.email || "—"}</div>
            <div className="text-xs text-gray-400">{l.phone || ""}</div>
          </div>
        );
      },
    },
    {
      accessorKey: "amlResult",
      header: "AML",
      cell: ({ row }) => {
        const aml = AML_BADGE[row.original.amlResult] || { label: "Pending", cls: "bg-gray-100 text-gray-600" };
        return <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold ${aml.cls}`}>{aml.label}</span>;
      },
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => {
        const l = row.original;
        return (
          <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${l.status === "active" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
            {l.status}
          </span>
        );
      },
    },
    {
      id: "actions",
      header: "",
      enableSorting: false,
      cell: ({ row }) => (
        <div className="text-right">
          <Link to={`/landlords/${row.original._id}`} className="text-sm font-medium text-indigo-600 hover:text-indigo-800">
            View →
          </Link>
        </div>
      ),
    },
  ], []);

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Landlords</h1>
          <p className="text-sm text-gray-500 mt-0.5">{landlords.length} total</p>
        </div>
        <Link
          to="/landlords/add"
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-white text-sm font-medium hover:bg-indigo-700 transition"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Add Landlord
        </Link>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden p-4">
        {landlords.length === 0 ? (
          <div className="text-center py-20">
            <svg className="w-12 h-12 text-gray-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <p className="text-gray-500 font-medium">No landlords yet</p>
            <p className="text-sm text-gray-400 mt-1">Add your first landlord to get started</p>
          </div>
        ) : (
          <DataTable
            columns={columns}
            data={landlords}
            searchPlaceholder="Search landlords…"
            emptyMessage="No landlords match your search"
          />
        )}
      </div>
    </div>
  );
}

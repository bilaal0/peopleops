import { redirect, useLoaderData, useNavigate, Link, Form } from "react-router";
import { getUserFromRequest } from "../../../utils/auth.server.js";
import { User } from "../../../models/user.server.js";
import { connect } from "../../../config/db.server.js";

export async function loader({ params, request }) {
  const user = await getUserFromRequest(request);
  if (!user) return redirect("/login");

  await connect();

  const staffUser = await User.findOne({ _id: params.id, deleted: false }).lean();
  if (!staffUser) {
    throw new Response("Staff User Not Found", { status: 404 });
  }

  return {
    staff: {
      ...staffUser,
      _id: staffUser._id.toString(),
      agencyId: staffUser.agencyId?.toString(),
    },
  };
}

export default function StaffDetailPage() {
  const { staff } = useLoaderData();
  const navigate = useNavigate();

  const fullName = `${staff.title ? staff.title + " " : ""}${staff.firstName || ""} ${staff.lastName || ""}`.trim();
  const mainRole = staff.roles?.[0] || "EMPLOYEE";

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 mb-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate("/user-accounts/staff")}
                className="flex items-center justify-center h-9 w-9 rounded-lg border border-gray-300 hover:bg-gray-50 transition cursor-pointer"
              >
                <svg className="w-4 h-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                </svg>
              </button>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">{fullName || "Staff Profile"}</h1>
                <p className="mt-1 text-sm text-gray-600">{staff.jobTitle || "Internal Staff Member"}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Link
                to={`/user-accounts/staff/${staff._id}/edit`}
                className="px-4 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 text-sm font-semibold hover:bg-gray-50 transition shadow-xs flex items-center gap-1.5"
              >
                <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Edit Staff
              </Link>
              <Form method="post" action={`/user-accounts/staff/${staff._id}/delete`} onSubmit={(e) => {
                if (!confirm("Are you sure you want to delete this staff member?")) e.preventDefault();
              }}>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-red-50 text-red-700 border border-red-200 text-sm font-semibold hover:bg-red-100 transition flex items-center gap-1.5 cursor-pointer"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  Delete
                </button>
              </Form>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12 space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Info Card */}
          <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-6 shadow-xs space-y-6">
            <div className="flex items-center gap-4 pb-6 border-b border-gray-100">
              <div className="w-16 h-16 rounded-full bg-indigo-100 text-indigo-700 font-bold text-2xl flex items-center justify-center border border-indigo-200">
                {staff.firstName?.charAt(0).toUpperCase()}
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">{fullName}</h2>
                <p className="text-sm text-gray-500">{staff.email}</p>
                <div className="mt-2 flex items-center gap-2">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-800">
                    {mainRole}
                  </span>
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                    staff.status === 1 ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"
                  }`}>
                    {staff.status === 1 ? "Active Account" : "Inactive Account"}
                  </span>
                </div>
              </div>
            </div>

            {/* Employment & Personal Grid */}
            <div>
              <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-3">Employment Details</h3>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div>
                  <dt className="text-gray-500 text-xs">Job Title</dt>
                  <dd className="font-medium text-gray-900 mt-0.5">{staff.jobTitle || "—"}</dd>
                </div>
                <div>
                  <dt className="text-gray-500 text-xs">Position</dt>
                  <dd className="font-medium text-gray-900 mt-0.5">{staff.positionInCompany || "—"}</dd>
                </div>
                <div>
                  <dt className="text-gray-500 text-xs">Joining Date</dt>
                  <dd className="font-medium text-gray-900 mt-0.5">
                    {staff.joiningDate ? new Date(staff.joiningDate).toLocaleDateString() : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-500 text-xs">Gender</dt>
                  <dd className="font-medium text-gray-900 mt-0.5">{staff.gender || "—"}</dd>
                </div>
              </dl>
            </div>

            {/* Address */}
            <div className="pt-6 border-t border-gray-100">
              <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-3">Address Information</h3>
              <p className="text-sm text-gray-700">
                {staff.addressLine1 ? (
                  <>
                    {staff.addressLine1}
                    {staff.addressLine2 && <><br />{staff.addressLine2}</>}
                    {(staff.postTown || staff.city) && <><br />{staff.postTown || staff.city}</>}
                    {staff.postcode && <><br />{staff.postcode}</>}
                  </>
                ) : (
                  <span className="text-gray-400 italic">No address provided.</span>
                )}
              </p>
            </div>
          </div>

          {/* Quick Details Sidebar Card */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-xs space-y-4 h-fit">
            <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider pb-2 border-b border-gray-100">
              Account Metadata
            </h3>
            <div className="space-y-3 text-sm">
              <div>
                <span className="text-xs text-gray-500 block">System User ID</span>
                <span className="font-mono text-xs text-gray-700 bg-gray-50 px-2 py-1 rounded border border-gray-200 block mt-1 break-all">
                  {staff._id}
                </span>
              </div>
              <div>
                <span className="text-xs text-gray-500 block">Telephone Number</span>
                <span className="font-medium text-gray-900">{staff.phone || staff.telephoneNo || "—"}</span>
              </div>
              <div>
                <span className="text-xs text-gray-500 block">Created On</span>
                <span className="font-medium text-gray-900">
                  {staff.createdAt ? new Date(staff.createdAt).toLocaleDateString() : "—"}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

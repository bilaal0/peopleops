/**
 * Edit Agency Page
 * SUPER_ADMIN only — edit an existing agency/agency
 */

import { redirect, data, useLoaderData, useActionData, useNavigate } from "react-router";
import AgencyForm from "../../components/agencies/AgencyForm.jsx";
import { Agency } from "../../models/agency.server.js";
import { User } from "../../models/user.server.js";
import { toast } from "react-hot-toast";

import { requireUserRole } from "../../utils/auth.server";
import { Roles } from "../../utils/permission";
import { uploadAgencyLogo } from "../../utils/uploadAgencyLogo.server.js";

export async function loader({ request, params }) {
  await requireUserRole(request, Roles.SUPER_ADMIN);

  const org = await Agency.findById(params.id)
    .populate("primaryAdmin", "email firstName lastName phone addressLine1 emailVerified inviteToken")
    .lean();

  if (!org || org.deleted) {
    throw new Response("Agency not found", { status: 404 });
  }

  // Flatten for form
  const initialData = {
    _id: org._id.toString(),
    name: org.name,
    slug: org.slug,
    image: org.image,
    status: org.status,
    isBranch: !!org.parentId,
    parentId: org.parentId ? org.parentId.toString() : "",
    planTier: org.plan?.tier || "free",
    propertyLimit: org.plan?.propertyLimit ?? 5,
    userLimit: org.plan?.userLimit ?? 2,
    canCreateBranches: org.plan?.canCreateBranches || false,
    // Admin fields
    firstName: org.primaryAdmin?.firstName || "",
    lastName: org.primaryAdmin?.lastName || "",
    email: org.primaryAdmin?.email || "",
    phone: org.primaryAdmin?.phone || "",
    addressLine1: org.primaryAdmin?.addressLine1 || "",
    // Read-only info
    adminVerified: org.primaryAdmin?.emailVerified || false,
    adminId: org.primaryAdmin?._id?.toString() || null,
  };

  return { initialData };
}

export async function action({ request, params }) {
  await requireUserRole(request, Roles.SUPER_ADMIN);

  const formData = await request.formData();
  const values = Object.fromEntries(formData);

  // Handle checkboxes
  values.isBranch = values.isBranch === "true" || values.isBranch === "on";
  values.canCreateBranches = values.canCreateBranches === "true" || values.canCreateBranches === "on";

  // Basic validation
  const errors = {};
  if (!values.name?.trim()) errors.name = "Agency name is required.";
  if (!values.email?.trim()) errors.email = "Admin email is required.";
  if (!values.firstName?.trim()) errors.firstName = "First name is required.";
  if (!values.lastName?.trim()) errors.lastName = "Last name is required.";
  if (values.isBranch && !values.parentId?.trim()) errors.parentId = "Parent Agency ID is required for branches.";

  if (Object.keys(errors).length > 0) {
    return data({ errors }, { status: 400 });
  }

  try {
    const org = await Agency.findById(params.id);
    if (!org || org.deleted) {
      return data({ errors: { submit: "Agency not found." } }, { status: 404 });
    }

    // Update agency fields
    org.name = values.name.trim();
    org.slug = values.slug?.trim() || values.name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    org.status = values.status || "active";
    org.parentId = values.isBranch ? values.parentId : null;
    org.plan = {
      tier: values.planTier || "free",
      propertyLimit: parseInt(values.propertyLimit) || 5,
      userLimit: parseInt(values.userLimit) || 2,
      canCreateBranches: values.canCreateBranches,
    };

    const imageFile = formData.get("image");
    if (imageFile && typeof imageFile === "object" && imageFile.size > 0) {
      const uploadedKey = await uploadAgencyLogo(org._id.toString(), imageFile);
      if (uploadedKey) {
        org.image = uploadedKey;
      }
    }

    await org.save();

    // Update admin user details if they exist
    if (org.primaryAdmin) {
      const admin = await User.findById(org.primaryAdmin);
      if (admin) {
        admin.firstName = values.firstName?.trim() || admin.firstName;
        admin.lastName = values.lastName?.trim() || admin.lastName;
        admin.phone = values.phone?.trim() || admin.phone;
        admin.addressLine1 = values.addressLine1?.trim() || admin.addressLine1;
        // Don't update email — that would break their login
        await admin.save();
      }
    }

    return redirect("/organizations");
  } catch (error) {
    console.error("Error updating agency:", error);
    return data({ errors: { submit: "Failed to update organization. Please try again." } }, { status: 500 });
  }
}

export default function EditAgencyPage() {
  const { initialData } = useLoaderData();
  const actionData = useActionData();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 mb-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate("/organizations")}
              className="flex items-center justify-center h-9 w-9 rounded-lg border border-gray-300 hover:bg-gray-50 transition"
            >
              <svg className="w-4 h-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
            </button>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Edit Organization</h1>
              <p className="mt-1 text-sm text-gray-600">
                Update <span className="font-medium text-gray-900">{initialData.name}</span>
              </p>
            </div>
          </div>

          {/* Admin status badge */}
          {initialData.adminId && (
            <div className="mt-3">
              {initialData.adminVerified ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  Admin verified — {initialData.email}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Invite pending — {initialData.email}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
        <AgencyForm
          initialData={initialData}
          onCancel={() => navigate("/organizations")}
          submitLabel="Update Organization"
          serverErrors={actionData?.errors}
        />
      </div>
    </div>
  );
}

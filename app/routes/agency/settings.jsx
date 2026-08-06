import { useState } from "react";
import { useLoaderData, useActionData, Form, useNavigation } from "react-router";
import { getUserFromRequest } from "../../utils/auth.server.js";
import { Agency } from "../../models/agency.server.js";
import { uploadAgencyLogo } from "../../utils/uploadAgencyLogo.server.js";
import { getAgencyLogoUrl } from "../../utils/agencyLogo.js";
import { toast } from "react-hot-toast";
import { Building2, Upload, Check, Shield, Layers, Users, Home } from "lucide-react";

export async function loader({ request }) {
  const userClaims = await getUserFromRequest(request);
  if (!userClaims || !userClaims.agencyId) {
    throw new Response("Agency not found or not linked to user", { status: 404 });
  }

  const agency = await Agency.findById(userClaims.agencyId).lean();
  if (!agency) {
    throw new Response("Agency record not found", { status: 404 });
  }

  return {
    agency: {
      ...agency,
      _id: agency._id.toString(),
    },
    user: userClaims,
  };
}

export async function action({ request }) {
  const userClaims = await getUserFromRequest(request);
  if (!userClaims || !userClaims.agencyId) {
    return { error: "Unauthorized or missing agency" };
  }

  const formData = await request.formData();
  const name = formData.get("name");
  const slug = formData.get("slug");
  const imageFile = formData.get("image");

  try {
    const agency = await Agency.findById(userClaims.agencyId);
    if (!agency) return { error: "Agency not found" };

    if (name && name.trim()) {
      agency.name = name.trim();
    }
    if (slug && slug.trim()) {
      agency.slug = slug.trim().toLowerCase().replace(/\s+/g, "-");
    }

    if (imageFile && typeof imageFile === "object" && imageFile.size > 0) {
      const logoKey = await uploadAgencyLogo(agency._id.toString(), imageFile);
      if (logoKey) {
        agency.image = logoKey;
      }
    }

    await agency.save();
    return { success: true, message: "Agency details and logo updated successfully!" };
  } catch (error) {
    console.error("Error updating agency settings:", error);
    return { error: "Failed to update agency settings." };
  }
}

export default function AgencySettingsPage() {
  const { agency } = useLoaderData();
  const actionData = useActionData();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const initialLogoUrl = getAgencyLogoUrl(agency.image);
  const [logoPreview, setLogoPreview] = useState(initialLogoUrl);

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setLogoPreview(URL.createObjectURL(file));
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-6">
        
        {/* Header */}
        <div className="flex items-center gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
          <div className="w-14 h-14 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
            {logoPreview ? (
              <img src={logoPreview} alt={agency.name} className="w-full h-full object-cover rounded-2xl" />
            ) : (
              <Building2 className="w-7 h-7" />
            )}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Organization Settings</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Manage your organization profile, custom branding, and operational limits
            </p>
          </div>
        </div>

        {/* Notifications */}
        {actionData?.success && (
          <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-medium flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-600" />
            {actionData.message}
          </div>
        )}
        {actionData?.error && (
          <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm font-medium">
            {actionData.error}
          </div>
        )}

        <Form method="post" encType="multipart/form-data" className="space-y-6">
          {/* Branding & Info */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-6">
            <h2 className="text-lg font-bold text-slate-900 border-b border-slate-100 pb-3 flex items-center gap-2">
              <Building2 className="w-5 h-5 text-indigo-600" />
              Branding & Identity
            </h2>

            {/* Logo Upload Section */}
            <div className="flex flex-col sm:flex-row items-start gap-6 p-4 rounded-xl bg-slate-50 border border-slate-200">
              <div className="w-24 h-24 rounded-xl bg-white border-2 border-dashed border-slate-300 flex items-center justify-center overflow-hidden shrink-0 shadow-xs">
                {logoPreview ? (
                  <img src={logoPreview} alt="Logo Preview" className="w-full h-full object-cover" />
                ) : (
                  <Building2 className="w-8 h-8 text-slate-400" />
                )}
              </div>
              <div className="space-y-2 flex-1">
                <label className="block text-sm font-semibold text-slate-800">Organization Logo</label>
                <p className="text-xs text-slate-500">
                  Upload your official organization logo. This logo will appear across your navigation topbar, sidebar, documents, and reports.
                </p>
                <input
                  type="file"
                  name="image"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="block w-full text-xs text-slate-500 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 transition"
                />
              </div>
            </div>

            {/* Organization Name & Slug */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  Organization Name
                </label>
                <input
                  type="text"
                  name="name"
                  defaultValue={agency.name}
                  required
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm font-medium text-slate-900"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  Agency Slug / Code
                </label>
                <input
                  type="text"
                  name="slug"
                  defaultValue={agency.slug || ""}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm font-medium text-slate-900"
                />
              </div>
            </div>
          </div>

          {/* Subscription & Features Plan */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-6">
            <h2 className="text-lg font-bold text-slate-900 border-b border-slate-100 pb-3 flex items-center gap-2">
              <Layers className="w-5 h-5 text-indigo-600" />
              Subscription & Capacity Limits
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold uppercase tracking-wider mb-1">
                  <Shield className="w-4 h-4 text-indigo-600" />
                  Plan Tier
                </div>
                <p className="text-lg font-bold text-slate-900 capitalize">{agency.plan?.tier || "Free"}</p>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold uppercase tracking-wider mb-1">
                  <Home className="w-4 h-4 text-emerald-600" />
                  Property Capacity
                </div>
                <p className="text-lg font-bold text-slate-900">{agency.plan?.propertyLimit ?? 5} Properties</p>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold uppercase tracking-wider mb-1">
                  <Users className="w-4 h-4 text-blue-600" />
                  Team User Seats
                </div>
                <p className="text-lg font-bold text-slate-900">{agency.plan?.userLimit ?? 2} Staff Members</p>
              </div>
            </div>
          </div>

          {/* Form Submit Button */}
          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-3 bg-indigo-600 text-white font-bold text-sm rounded-xl hover:bg-indigo-700 transition shadow-sm flex items-center gap-2 disabled:opacity-50"
            >
              {isSubmitting ? (
                <span>Saving Changes...</span>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  Save Agency Changes
                </>
              )}
            </button>
          </div>
        </Form>
      </div>
    </div>
  );
}

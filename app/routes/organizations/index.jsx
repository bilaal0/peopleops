/**
 * Organizations List Page
 */

import React from "react";
import { useNavigate, useLoaderData, useSubmit, useActionData } from "react-router";
import Button from "../../components/ui/Button";
import { Organization } from "../../models/organization.server.js";
import { User } from "../../models/user.server.js";
import { sendEmail, emailTemplates } from "../../utils/email.server";
import { toast } from "react-hot-toast";

import { requireUserSession } from "../../utils/auth.server";
import { Roles } from "../../utils/permission";
import { getOrganizationLogoUrl } from "../../utils/organizationLogo.js";

export async function loader({ request }) {
    // Protect route: Only SUPER_ADMIN can view this
    const user = await requireUserSession(request);
    if (!user.roles?.includes(Roles.SUPER_ADMIN)) {
        throw new Response("Unauthorized", { status: 403 });
    }

    // Fetch organizations and populate primaryAdmin for display
    // using .lean() to ensure we get plain JS objects, preventing serialization issues
    const organizations = await Organization.find({ deleted: false })
        .select("_id name slug image status primaryAdmin")
        .populate("primaryAdmin", "email firstName lastName emailVerified inviteToken inviteExpires") // Include invite fields
        .sort({ createdAt: -1 })
        .lean();

    // Transform _id to string manually to avoid "[object Object]" serialization issues on client
    const serializedOrgs = organizations.map(org => ({
        ...org,
        _id: org._id.toString(),
        primaryAdmin: org.primaryAdmin ? {
            ...org.primaryAdmin,
            _id: org.primaryAdmin._id.toString()
        } : null
    }));

    return { organizations: serializedOrgs };
}

export async function action({ request }) {
    const formData = await request.formData();
    const intent = formData.get("intent");

    if (intent === "delete") {
        const id = formData.get("id");
        if (id) {
            await Organization.findByIdAndUpdate(id, { deleted: true });
            return { success: true };
        }
    }

    if (intent === "resendInvite") {
        const userId = formData.get("userId");
        const orgName = formData.get("orgName");

        try {
            const user = await User.findById(userId);

            if (!user) {
                return { error: "User not found" };
            }

            // Check if user already verified
            if (user.emailVerified) {
                return { error: "User has already accepted the invitation" };
            }

            // Generate new token if expired or missing
            const crypto = await import("crypto");
            const token = crypto.randomBytes(32).toString("hex");
            const tokenExpires = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hours

            user.inviteToken = token;
            user.inviteExpires = tokenExpires;
            await user.save();

            // Send invitation email
            const requestUrl = new URL(request.url);
            const baseUrl = `${requestUrl.protocol}//${requestUrl.host}`;
            const inviteLink = `${baseUrl}/auth/accept-invite?token=${token}`;

            await sendEmail({
                to: user.email,
                ...emailTemplates.organizationInvite({
                    email: user.email,
                    inviteLink,
                    orgName: orgName
                })
            });

            return { success: true, message: "Invitation resent successfully" };
        } catch (error) {
            console.error("Failed to resend invite:", error);
            return { error: "Failed to resend invitation" };
        }
    }

    return null;
}

export default function OrganizationsPage() {
    const { organizations } = useLoaderData();
    const navigate = useNavigate();
    const submit = useSubmit();
    const actionData = useActionData();

    // Show toast on action response
    React.useEffect(() => {
        if (actionData?.success && actionData?.message) {
            toast.success(actionData.message);
        }
        if (actionData?.error) {
            toast.error(actionData.error);
        }
    }, [actionData]);

    const handleResendInvite = (org) => {
        if (!org.primaryAdmin) return;

        submit(
            {
                intent: "resendInvite",
                userId: String(org.primaryAdmin._id),
                orgName: org.name
            },
            { method: "post" }
        );
        toast.loading("Sending invitation...", { duration: 2000 });
    };

    const confirmDelete = (org) => {
        toast((t) => (
            <div className="flex flex-col gap-4">
                <div className="font-medium text-gray-900">
                    Delete "{org.name}"?
                </div>
                <div className="text-sm text-gray-500">
                    Are you sure? This action cannot be undone.
                </div>
                <div className="flex gap-2 justify-end">
                    <button
                        onClick={() => toast.dismiss(t.id)}
                        className="px-3 py-1 text-sm text-gray-600 hover:bg-gray-100 rounded"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={() => {
                            toast.dismiss(t.id);
                            submit({ intent: "delete", id: String(org._id) }, { method: "post" });
                            toast.success("Organization deleted");
                        }}
                        className="px-3 py-1 text-sm bg-red-600 text-white hover:bg-red-700 rounded"
                    >
                        Delete
                    </button>
                </div>
            </div>
        ), { duration: 5000 });
    };

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <div className="bg-white border-b border-gray-200 mb-6">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                    <div className="flex justify-between items-center">
                        <div>
                            <h1 className="text-3xl font-bold text-gray-900">Organizations</h1>
                            <p className="mt-1 text-sm text-gray-600">Manage your organizations and branch offices</p>
                        </div>
                        <Button variant="primary" onClick={() => navigate("add")}>
                            <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                            Add Organization
                        </Button>
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Organization Name
                                    </th>
                                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Slug
                                    </th>
                                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Primary Admin
                                    </th>
                                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Status
                                    </th>
                                    <th scope="col" className="relative px-6 py-3">
                                        <span className="sr-only">Actions</span>
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {organizations && organizations.length > 0 ? (
                                    organizations.map((org) => (
                                        <tr key={org._id} className="hover:bg-gray-50 transition-colors">
                                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                                <div className="flex items-center gap-3">
                                                    {getOrganizationLogoUrl(org.image) ? (
                                                        <img
                                                            src={getOrganizationLogoUrl(org.image)}
                                                            alt={org.name}
                                                            className="w-9 h-9 rounded-lg object-cover border border-gray-200 shrink-0 bg-white shadow-xs"
                                                        />
                                                    ) : (
                                                        <div className="w-9 h-9 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-sm shrink-0 border border-indigo-200">
                                                            {org.name.charAt(0).toUpperCase()}
                                                        </div>
                                                    )}
                                                    <div>
                                                        <span className="font-semibold text-gray-900 block">{org.name}</span>
                                                        <span className="text-xs text-gray-400 font-normal">ID: {org._id}</span>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                {org.slug}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                {org.primaryAdmin ? (
                                                    <div>
                                                        <div className="font-medium text-gray-900">
                                                            {org.primaryAdmin.title ? org.primaryAdmin.title + ' ' : ''}{org.primaryAdmin.firstName} {org.primaryAdmin.lastName}
                                                        </div>
                                                        <div className="text-gray-500 text-xs">
                                                            {org.primaryAdmin.email}
                                                        </div>
                                                        {!org.primaryAdmin.emailVerified && (
                                                            <div className="mt-1">
                                                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">
                                                                    Pending Invitation
                                                                </span>
                                                            </div>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <span className="text-gray-400 italic">Not Assigned</span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${org.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                                                    }`}>
                                                    {org.status ? org.status.toUpperCase() : "UNKNOWN"}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                                <div className="flex justify-end gap-3">
                                                    {org.primaryAdmin && !org.primaryAdmin.emailVerified && (
                                                        <button
                                                            onClick={() => handleResendInvite(org)}
                                                            className="p-1 text-gray-400 hover:text-green-600 transition-colors"
                                                            title="Resend Invitation"
                                                        >
                                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                                                <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
                                                            </svg>
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={() => navigate(`/organizations/${org._id}/edit`)}
                                                        className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
                                                        title="Edit"
                                                    >
                                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
                                                        </svg>
                                                    </button>
                                                    <button
                                                        onClick={() => confirmDelete(org)}
                                                        className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                                                        title="Delete"
                                                    >
                                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                                                        </svg>
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))) : (
                                    <tr>
                                        <td colSpan="5" className="px-6 py-12 text-center text-gray-500 text-sm">
                                            No organizations found. Click "Add Organization" to create one.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}

import { redirect, data, useActionData, useNavigate } from "react-router";
import crypto from "crypto";
import AgencyForm from "../../components/agencies/AgencyForm.jsx";
import { User } from "../../models/user.server.js";
import { Agency } from "../../models/agency.server.js";
import { validateAgency } from "../../utils/validator";
import { toast } from "react-hot-toast";
import { sendEmail, emailTemplates } from "../../utils/email.server";

import { requireUserRole } from "../../utils/auth.server";
import { Roles } from "../../utils/permission";
import { uploadAgencyLogo } from "../../utils/uploadAgencyLogo.server.js";

export async function loader({ request }) {
  const user = await requireUserRole(request, Roles.SUPER_ADMIN);
  return { user };
}

export async function action({ request }) {
  const formData = await request.formData();
  const values = Object.fromEntries(formData);

  // Handle checkboxes
  values.isBranch = values.isBranch === "true" || values.isBranch === "on";
  values.canCreateBranches = values.canCreateBranches === "true" || values.canCreateBranches === "on";

  // Validate
  const { valid, errors } = validateAgency(values);
  if (!valid) {
    return data({ errors }, { status: 400 });
  }

  try {
    // 1. Check if agency exists
    const existingOrg = await Agency.findOne({
      name: { $regex: new RegExp(`^${values.name}$`, 'i') }
    });

    if (existingOrg) {
      return data({ errors: { name: "Agency already exists" } }, { status: 400 });
    }

    // 2. Handle Primary Admin (User)
    let adminUser = await User.findOne({ email: values.email.toLowerCase() });

    // Generate invite token (used for both new and existing unverified users)
    const token = crypto.randomBytes(32).toString("hex");
    const tokenExpires = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hours

    if (!adminUser) {
      // Create new user with invite data
      adminUser = await User.create({
        title: values.title?.trim() || undefined,
        firstName: values.firstName,
        lastName: values.lastName,
        email: values.email,
        phone: values.phone,
        addressLine1: values.addressLine1,
        roles: ["MASTER_ADMIN"],
        status: 0, // Inactive until they accept invite
        emailVerified: false,
        inviteToken: token,
        inviteExpires: tokenExpires,
      });
    } else if (!adminUser.emailVerified) {
      // User exists but hasn't accepted yet — refresh the invite token
      adminUser.inviteToken = token;
      adminUser.inviteExpires = tokenExpires;
      adminUser.firstName = values.firstName || adminUser.firstName;
      adminUser.lastName = values.lastName || adminUser.lastName;
      await adminUser.save();
    } else {
      // User already verified — they already have an account
      return data({ errors: { email: "This user already has an active account. They can log in directly." } }, { status: 400 });
    }

    // Send Invitation Email
    const requestUrl = new URL(request.url);
    const baseUrl = `${requestUrl.protocol}//${requestUrl.host}`;
    const inviteLink = `${baseUrl}/auth/accept-invite?token=${token}`;

    try {
      await sendEmail({
        to: values.email,
        ...emailTemplates.agencyInvite({
          email: values.email,
          inviteLink,
          orgName: values.name
        })
      });
      console.log(`✅ Invite email sent to ${values.email}`);
    } catch (emailError) {
      console.error("❌ Failed to send invite email:", emailError);
    }

    // 3. Create Agency
    const newOrg = await Agency.create({
      name: values.name,
      slug: values.slug || values.name.toLowerCase().replace(/\s+/g, '-'),
      image: "no-image.png",
      parentId: values.isBranch ? values.parentId : null,
      plan: {
        tier: values.planTier,
        propertyLimit: parseInt(values.propertyLimit) || 0,
        userLimit: parseInt(values.userLimit) || 0,
        canCreateBranches: values.canCreateBranches,
      },
      status: values.status,
      primaryAdmin: adminUser._id,
      createdBy: adminUser._id,
    });

    const imageFile = formData.get("image");
    if (imageFile && typeof imageFile === "object" && imageFile.size > 0) {
      const uploadedKey = await uploadAgencyLogo(newOrg._id.toString(), imageFile);
      if (uploadedKey) {
        newOrg.image = uploadedKey;
        await newOrg.save();
      }
    }

    // 4. Link User to Agency
    adminUser.agencyId = newOrg._id;
    await adminUser.save();

    return redirect("/organizations");

  } catch (error) {
    console.error("Error creating agency:", error);
    return data({ errors: { submit: "Failed to create agency" } }, { status: 500 });
  }
}

export default function AddAgencyPage() {
  const navigate = useNavigate();
  const actionData = useActionData();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 mb-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <h1 className="text-3xl font-bold text-gray-900">Add New Organization</h1>
          <p className="mt-1 text-sm text-gray-600">Create a new organization or branch office</p>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
        <AgencyForm
          onCancel={() => navigate("/organizations")}
          submitLabel="Create Organization"
          serverErrors={actionData?.errors}
        />
      </div>
    </div>
  );
}

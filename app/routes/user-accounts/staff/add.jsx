import { redirect, data, useActionData, useNavigate } from "react-router";
import { getUserFromRequest } from "../../../utils/auth.server.js";
import { User } from "../../../models/user.server.js";
import { connect } from "../../../config/db.server.js";
import UserAccountForm from "../../../components/user-accounts/UserAccountForm.jsx";

export async function loader({ request }) {
  const user = await getUserFromRequest(request);
  if (!user) return redirect("/login");
  return { user };
}

export async function action({ request }) {
  const currentUser = await getUserFromRequest(request);
  if (!currentUser) return redirect("/login");

  await connect();

  const formData = await request.formData();
  const role = formData.get("role")?.toString().trim();
  const statusRaw = formData.get("status");
  const status = statusRaw !== null && statusRaw !== "" ? Number(statusRaw) : 1;

  const firstName = formData.get("firstName")?.toString().trim();
  const lastName = formData.get("lastName")?.toString().trim();
  const gender = formData.get("gender")?.toString().trim();

  const joiningDateRaw = formData.get("joiningDate")?.toString().trim();
  const joiningDate = joiningDateRaw ? new Date(joiningDateRaw) : new Date();
  const jobTitle = formData.get("jobTitle")?.toString().trim();

  const city = formData.get("city")?.toString().trim() || "UK";
  const postcode = formData.get("postcode")?.toString().trim();
  const ethnicity = formData.get("ethnicity")?.toString().trim();
  const addressLine1 = formData.get("addressLine1")?.toString().trim();
  const addressLine2 = formData.get("addressLine2")?.toString().trim();
  const addressLine3 = formData.get("addressLine3")?.toString().trim();

  const email = formData.get("email")?.toString().trim().toLowerCase();
  const phone = formData.get("phone")?.toString().trim();

  const errors = {};
  if (!role) errors.role = "Role is required.";
  if (statusRaw === null || statusRaw === "") errors.status = "Status is required.";
  if (!firstName) errors.firstName = "First name is required.";
  if (!lastName) errors.lastName = "Surname is required.";
  if (!jobTitle) errors.jobTitle = "Job title is required.";
  if (!city) errors.city = "City is required.";
  if (!postcode) errors.postcode = "Postcode is required.";
  if (!addressLine1) errors.addressLine1 = "Address line 1 is required.";
  if (!phone) errors.phone = "Telephone number is required.";

  if (Object.keys(errors).length > 0) {
    return data({ errors }, { status: 400 });
  }

  // If email provided, check duplicate
  if (email) {
    const existing = await User.findOne({ email });
    if (existing) {
      return data(
        { errors: { email: "A user with this email address already exists." } },
        { status: 400 }
      );
    }
  }

  try {
    await User.create({
      roles: [role],
      status,
      firstName,
      lastName,
      gender,
      joiningDate,
      jobTitle,
      city,
      postTown: city,
      postcode,
      ethnicity: ethnicity !== "--- choose ethnicity ---" ? ethnicity : undefined,
      addressLine1,
      addressLine2,
      addressLine3,
      email: email || `${firstName.toLowerCase()}.${lastName.toLowerCase()}@temp.local`,
      phone,
      telephoneNo: phone,
      organizationId: currentUser.organizationId || null,
      addedBy: currentUser._id,
    });

    return redirect("/user-accounts/staff");
  } catch (error) {
    console.error("Error creating staff user:", error);
    return data(
      { errors: { submit: error.message || "Failed to create staff account." } },
      { status: 500 }
    );
  }
}

export default function AddStaffPage() {
  const navigate = useNavigate();
  const actionData = useActionData();

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 mb-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
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
              <h1 className="text-3xl font-bold text-gray-900">Add Staff Account</h1>
              <p className="mt-1 text-sm text-gray-600">Register a new internal employee or manager</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
        <UserAccountForm
          accountType="staff"
          onCancel={() => navigate("/user-accounts/staff")}
          submitLabel="Create Staff Account"
          serverErrors={actionData?.errors}
        />
      </div>
    </div>
  );
}

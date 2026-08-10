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
  const title = formData.get("title")?.toString().trim();
  const firstName = formData.get("firstName")?.toString().trim();
  const middleName = formData.get("middleName")?.toString().trim();
  const lastName = formData.get("lastName")?.toString().trim();
  const email = formData.get("email")?.toString().trim().toLowerCase();
  const phone = formData.get("phone")?.toString().trim();
  const positionInCompany = formData.get("positionInCompany")?.toString().trim();
  const ethnicity = formData.get("ethnicity")?.toString().trim();

  const isCompany = formData.get("isCompany") === "on";
  const companyName = formData.get("companyName")?.toString().trim() || null;
  const companyNumber = formData.get("companyNumber")?.toString().trim() || null;

  const dob = formData.get("dob") ? new Date(formData.get("dob").toString()) : undefined;
  const gender = formData.get("gender")?.toString().trim();
  const addressLine1 = formData.get("addressLine1")?.toString().trim() || "";
  const addressLine2 = formData.get("addressLine2")?.toString().trim() || "";
  const city = formData.get("city")?.toString().trim() || formData.get("postTown")?.toString().trim() || "UK";
  const postTown = city;
  const postcode = formData.get("postcode")?.toString().trim();
  const status = Number(formData.get("status") ?? 1);

  if (!email || !firstName || !lastName) {
    return data(
      { errors: { submit: "First name, last name, and email are required." } },
      { status: 400 }
    );
  }

  // Check existing email
  const existing = await User.findOne({ email });
  if (existing) {
    return data(
      { errors: { email: "A user with this email address already exists." } },
      { status: 400 }
    );
  }

  try {
    await User.create({
      title,
      firstName,
      middleName,
      lastName,
      email,
      phone,
      telephoneNo: phone,
      roles: ["CLIENT"],
      positionInCompany,
      ethnicity,
      dob,
      gender,
      addressLine1,
      addressLine2,
      postTown,
      city: postTown,
      postcode,
      status,
      organizationId: currentUser.organizationId || null,
      addedBy: currentUser._id,
      landlordData: {
        isCompany,
        companyName: isCompany ? companyName : null,
        companyNumber: isCompany ? companyNumber : null,
      },
    });

    return redirect("/user-accounts/client");
  } catch (error) {
    console.error("Error creating client user:", error);
    return data(
      { errors: { submit: error.message || "Failed to create client account." } },
      { status: 500 }
    );
  }
}

export default function AddClientPage() {
  const navigate = useNavigate();
  const actionData = useActionData();

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 mb-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate("/user-accounts/client")}
              className="flex items-center justify-center h-9 w-9 rounded-lg border border-gray-300 hover:bg-gray-50 transition cursor-pointer"
            >
              <svg className="w-4 h-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
            </button>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Add Client Account</h1>
              <p className="mt-1 text-sm text-gray-600">Register a new client or business contact</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
        <UserAccountForm
          accountType="client"
          onCancel={() => navigate("/user-accounts/client")}
          submitLabel="Create Client Account"
          serverErrors={actionData?.errors}
        />
      </div>
    </div>
  );
}

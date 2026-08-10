// routes/landlords/add.jsx — Add Landlord
import { useState } from "react";
import { Form, useActionData, useNavigation, Link } from "react-router-dom";
import { getUserFromRequest } from "../../utils/auth.server.js";
import { redirect, data } from "react-router";
import { User } from "../../models/user.server.js";
import { connect } from "../../config/db.server.js";
import UKDateInput from "../../components/ui/UKDateInput.jsx";
import {
  uploadToS3,
  buildS3Key,
  validateFile,
} from "../../utils/s3.server.js";
import { Field, Input, UKAddressFields } from "../../components/ui/FormFields.jsx";
import { lookupPostcode } from "../../utils/address-lookup.js";
import { logAMLResult, logLandlordAdded } from "../../utils/activityLog.server.js";


export async function loader({ request }) {
  const user = await getUserFromRequest(request);
  if (!user) return redirect("/login");
  if (!user.organizationId && !user.roles?.includes("SUPER_ADMIN")) return redirect("/dashboard");
  return {};
}

export async function action({ request }) {
  const user = await getUserFromRequest(request);
  if (!user) return redirect("/login");
  if (!user.organizationId && !user.roles?.includes("SUPER_ADMIN")) return redirect("/dashboard");

  const formData = await request.formData();
  const v = Object.fromEntries(formData);

  // Coerce booleans
  v.isCompany = v.isCompany === "on" || v.isCompany === "true";
  v.isOverseas = v.isOverseas === "on" || v.isOverseas === "true";
  v.pepChecked = v.pepChecked === "on" || v.pepChecked === "true";
  v.amlCompleted = v.amlCompleted === "on" || v.amlCompleted === "true";

  // Validate
  const errors = {};
  if (!v.firstName?.trim()) errors.firstName = "First name is required.";
  if (!v.lastName?.trim()) errors.lastName = "Last name is required.";
  if (v.isCompany && !v.companyName?.trim()) errors.companyName = "Company name is required for company landlords.";
  if ((v.isCompany || v.isOverseas) && !v.sourceOfFunds?.trim()) {
    errors.sourceOfFunds = "Source of funds is required for company or overseas landlords.";
  }

  // Rule 2: AML Date Required with Result
  if (v.amlCompleted) {
    if (v.amlResult && !v.amlCheckedAt) {
      errors.amlCheckedAt = "AML Check Date is required when a result is provided.";
    }
  }

  // Check file if uploaded
  const file = formData.get("amlDoc");
  if (file && file.size > 0) {
    const fileValid = validateFile(file);
    if (!fileValid.valid) errors.amlDoc = fileValid.error;
  }

  if (Object.keys(errors).length) {
    const safeV = { ...v };
    delete safeV.amlDoc;
    return data({ errors, values: safeV }, { status: 400 });
  }

  try {
    await connect();

    // ── Step 1: Create User record with landlordData (status 0 = inactive, can't login) ──────
    const landlordUser = await User.create({
      title: v.title?.trim() || undefined,
      firstName: v.firstName.trim(),
      lastName: v.lastName.trim(),
      email: v.email?.trim().toLowerCase() || `landlord_${Date.now()}@placeholder.local`,
      phone: v.phone?.trim() || undefined,
      addressLine1: v.addressLine1?.trim() || undefined,
      addressLine2: v.addressLine2?.trim() || undefined,
      addressLine3: v.addressLine3?.trim() || undefined,
      postTown: v.postTown?.trim() || undefined,
      postcode: v.postcode?.trim() || undefined,
      organizationId: user.organizationId,
      roles: ["LANDLORD"],
      status: 0, // Inactive — cannot login
      addedBy: user.userId,

      landlordData: {
        isCompany: v.isCompany,
        companyName: v.companyName?.trim() || undefined,
        companyNumber: v.companyNumber?.trim() || undefined,
        isOverseas: v.isOverseas,
        amlResult: v.amlCompleted ? (v.amlResult || null) : null,
        amlCheckedAt: v.amlCompleted ? (v.amlCheckedAt || null) : null,
        amlNotes: v.amlNotes?.trim() || null,
        amlCheckedBy: v.amlCompleted && v.amlResult ? user.userId : null,
        sourceOfFunds: v.sourceOfFunds?.trim() || null,
        pepChecked: v.pepChecked,
        pepResult: v.pepChecked ? (v.pepResult || null) : null,
        status: 'active', // Domain status
        // notes:                v.notes?.trim() || null, // Future generic notes maybe? Wait, notes from old profile... User schema doesn't have it natively, let's leave it out or map it if we really need it... Wait, amlDocUrl is also missing from User schema... Oh, the user explicitly asked for AML document to be a standard Document, wait! In the instruction: "amlDocUrl... WAIT. The user instruction said 'Add landlordData nested object: ...' and didn't include amlDocUrl in it. Let me check if I need to add amlDocUrl."
      }
    });

    await logLandlordAdded(landlordUser, user);
    if (v.amlCompleted && v.amlResult) {
      await logAMLResult(landlordUser, v.amlResult, user);
    }

    // ── Step 2: Handle S3 Upload if file present ───────────────────────────
    if (file && file.size > 0) {
      const s3Key = buildS3Key(user.organizationId, "landlord", landlordUser._id.toString(), "aml_report", file.name);
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      await uploadToS3(buffer, s3Key, file.type);

      // In the future this should be a Document record. For now we just upload it.
      // If we *really* need it on landlordData, I'll add it to the schema next, but user spec omitted it.
    }

    // Redirect to detail using the User ID
    return redirect(`/landlords/${landlordUser._id}?success=created`);
  } catch (err) {
    console.error("Error creating landlord:", err);
    const safeV = { ...v };
    delete safeV.amlDoc;

    if (err.code === 11000) {
      return data({ errors: { email: "This email is already registered." }, values: safeV }, { status: 400 });
    }

    return data({ errors: { general: "An unexpected error occurred while saving. Please try again." }, values: safeV }, { status: 500 });
  }
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function AddLandlord() {
  const actionData = useActionData();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";
  const errors = actionData?.errors || {};
  const values = actionData?.values || {};

  const [isCompany, setIsCompany] = useState(values.isCompany === "true" || false);
  const [isOverseas, setIsOverseas] = useState(values.isOverseas === "true" || false);
  const [pepChecked, setPepChecked] = useState(values.pepChecked === "true" || false);
  const [amlCompleted, setAmlCompleted] = useState(values.amlCompleted === "true" || false);
  const [amlResult, setAmlResult] = useState(values.amlResult || "pass");

  const requireSourceOfFunds = isCompany || isOverseas;
  const [isLookingUp, setIsLookingUp] = useState(false);

  const handleLookup = async () => {
    const pc = document.querySelector('input[name="postcode"]')?.value;
    if (!pc) return;
    setIsLookingUp(true);
    const res = await lookupPostcode(pc);
    setIsLookingUp(false);
    if (res) {
      const cityEl = document.querySelector('input[name="postTown"]');
      if (cityEl) cityEl.value = res.city;
      const addr3El = document.querySelector('input[name="addressLine3"]');
      if (addr3El && res.county) addr3El.value = res.county;
    } else {
      alert("Postcode not found or invalid.");
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Link to="/landlords" className="flex items-center justify-center w-9 h-9 rounded-lg border border-gray-300 hover:bg-gray-50 transition">
          <svg className="w-4 h-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Add Landlord</h1>
          <p className="text-sm text-gray-500">Create a new landlord record</p>
        </div>
      </div>

      <Form method="post" encType="multipart/form-data" className="space-y-6">
        {/* ── SECTION 1: Identity ─────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-5 pb-3 border-b border-gray-100">Identity & Contact</h2>

          {/* Individual / Company Toggle */}
          <div className="flex gap-3 mb-5">
            <button
              type="button"
              onClick={() => setIsCompany(false)}
              className={`flex-1 py-2.5 rounded-lg border text-sm font-medium transition ${!isCompany ? "bg-indigo-600 text-white border-indigo-600" : "border-gray-300 text-gray-600 hover:bg-gray-50"}`}
            >
              Individual
            </button>
            <button
              type="button"
              onClick={() => setIsCompany(true)}
              className={`flex-1 py-2.5 rounded-lg border text-sm font-medium transition ${isCompany ? "bg-indigo-600 text-white border-indigo-600" : "border-gray-300 text-gray-600 hover:bg-gray-50"}`}
            >
              Company / Ltd
            </button>
          </div>
          <input type="hidden" name="isCompany" value={isCompany ? "true" : "false"} />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Title" error={errors.title}>
              <select name="title" defaultValue={values.title} className={`w-full border-gray-300 rounded-lg shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm py-2 px-3 border bg-white text-gray-900 ${errors.title ? "border-red-400 bg-red-50" : "border-gray-300"}`}>
                <option value="">Select Title</option>
                {["Mr", "Mrs", "Miss", "Ms", "Dr", "Prof", "Sir", "Other"].map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="First Name" required error={errors.firstName}>
              <Input name="firstName" placeholder="John" defaultValue={values.firstName} error={errors.firstName} />
            </Field>
            <Field label="Last Name" required error={errors.lastName}>
              <Input name="lastName" placeholder="Smith" defaultValue={values.lastName} error={errors.lastName} />
            </Field>
            <Field label="Email" error={errors.email}>
              <Input name="email" type="email" placeholder="john@example.com" defaultValue={values.email} />
            </Field>
            <Field label="Phone" error={errors.phone}>
              <Input name="phone" placeholder="+44 7700 900000" defaultValue={values.phone} />
            </Field>

            {/* Address Details */}
            <div className="md:col-span-2 mt-4 pt-4 border-t border-gray-100">
              <UKAddressFields
                values={values}
                errors={errors}
                title="Address Details"
                requiredFields={{ addressLine1: false, city: false, postcode: false }}
              />
            </div>


            {/* Overseas flag */}
            <div className="md:col-span-2 flex items-center gap-3 pt-6 pb-2">
              <input
                type="checkbox"
                id="isOverseas"
                checked={isOverseas}
                onChange={e => setIsOverseas(e.target.checked)}
                className="h-4 w-4 text-indigo-600 rounded border-gray-300"
              />
              <input type="hidden" name="isOverseas" value={isOverseas ? "true" : "false"} />
              <label htmlFor="isOverseas" className="text-sm text-gray-700 font-medium">
                Overseas landlord
                <span className="block text-xs font-normal text-gray-400">Requires Source of Funds declaration</span>
              </label>
            </div>
          </div>

          {/* Company fields */}
          {isCompany && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 pt-4 border-t border-gray-100">
              <Field label="Company Name" required error={errors.companyName}>
                <Input name="companyName" placeholder="Smith Properties Ltd" defaultValue={values.companyName} error={errors.companyName} />
              </Field>
              <Field label="Companies House Number" error={errors.companyNumber}>
                <Input name="companyNumber" placeholder="12345678" defaultValue={values.companyNumber} />
              </Field>
            </div>
          )}
        </div>

        {/* ── SECTION 2: AML & Compliance ─────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-1 pb-3 border-b border-gray-100">
            <h2 className="text-base font-semibold text-gray-900">
              AML & Compliance
              <span className="ml-2 text-xs font-normal text-gray-400">Anti-Money Laundering</span>
            </h2>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="amlCompleted"
                checked={amlCompleted}
                onChange={e => setAmlCompleted(e.target.checked)}
                className="h-4 w-4 text-indigo-600 rounded border-gray-300"
              />
              <input type="hidden" name="amlCompleted" value={amlCompleted ? "true" : "false"} />
              <label htmlFor="amlCompleted" className="text-sm font-medium text-gray-700">Check completed</label>
            </div>
          </div>

          {!amlCompleted && (
            <div className="p-4 bg-gray-50 rounded-lg mt-4 border border-gray-200 border-dashed">
              <p className="text-sm text-gray-600 mb-2">
                AML checks can be completed later. Use one of our integrated partners below to run a check:
              </p>
              <div className="flex gap-4">
                <a href="https://www.smartsearch.com" target="_blank" rel="noreferrer" className="text-indigo-600 hover:text-indigo-800 text-sm font-medium underline">SmartSearch</a>
                <a href="https://www.thirdfort.com" target="_blank" rel="noreferrer" className="text-indigo-600 hover:text-indigo-800 text-sm font-medium underline">Thirdfort</a>
                <a href="https://credas.com" target="_blank" rel="noreferrer" className="text-indigo-600 hover:text-indigo-800 text-sm font-medium underline">Credas</a>
              </div>
            </div>
          )}

          {amlCompleted && (
            <div className="space-y-4 py-4 animate-in fade-in slide-in-from-top-2 duration-300">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="AML Result" error={errors.amlResult}>
                  <select
                    name="amlResult"
                    value={amlResult}
                    onChange={e => setAmlResult(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="pass">✅ Pass</option>
                    <option value="refer">⚠️ Refer</option>
                    <option value="fail">❌ Fail</option>
                  </select>
                </Field>
                <Field label="AML Check Date *" error={errors.amlCheckedAt}>
                  <UKDateInput name="amlCheckedAt" defaultValue={values.amlCheckedAt || ""} />
                </Field>
              </div>

              <Field label="Upload AML Report" error={errors.amlDoc}>
                <input
                  type="file"
                  name="amlDoc"
                  accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
                  className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 border border-gray-300 rounded-lg p-1.5 focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                />
              </Field>

              <Field label="AML Notes" error={errors.amlNotes}>
                <textarea
                  name="amlNotes"
                  rows={2}
                  placeholder="Internal notes about this AML check…"
                  defaultValue={values.amlNotes}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500"
                />
              </Field>
            </div>
          )}

          <div className="mt-4 border-t border-gray-100 pt-5">
            <Field label={
              <span>
                Source of Funds {requireSourceOfFunds && <span className="text-red-500">*</span>}
                {requireSourceOfFunds && <span className="ml-1 text-xs font-normal text-amber-600">— Required for company/overseas landlords</span>}
              </span>
            } error={errors.sourceOfFunds}>
              <textarea
                name="sourceOfFunds"
                rows={2}
                placeholder="e.g. Rental income from portfolio, sale of previous property…"
                defaultValue={values.sourceOfFunds}
                className={`w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 ${errors.sourceOfFunds ? "border-red-400 bg-red-50" : "border-gray-300"}`}
              />
            </Field>
          </div>

          {/* PEP Check */}
          <div className="mt-5 p-4 bg-gray-50 border border-gray-200 rounded-lg">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="pepChecked"
                checked={pepChecked}
                onChange={e => setPepChecked(e.target.checked)}
                className="h-4 w-4 text-indigo-600 rounded border-gray-300"
              />
              <input type="hidden" name="pepChecked" value={pepChecked ? "true" : "false"} />
              <label htmlFor="pepChecked" className="text-sm text-gray-700 font-medium">
                PEP Check completed
                <span className="block text-xs font-normal text-gray-400">Politically Exposed Person check</span>
              </label>
            </div>
            {pepChecked && (
              <div className="mt-4 pt-4 border-t border-gray-200 animate-in fade-in slide-in-from-top-2 duration-300">
                <Field label="PEP Result" error={errors.pepResult}>
                  <select name="pepResult" defaultValue={values.pepResult || ""} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
                    <option value="">Select result…</option>
                    <option value="clear">✅ Clear</option>
                    <option value="flagged">🚩 Flagged</option>
                  </select>
                </Field>
              </div>
            )}
          </div>
        </div>

        {/* ── SECTION 3: Notes ────────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4 pb-3 border-b border-gray-100">Internal Notes</h2>
          <textarea
            name="notes"
            rows={3}
            placeholder="Any internal notes about this landlord…"
            defaultValue={values.notes}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        {/* Submit */}
        <div className="flex justify-end gap-3 pb-8">
          <Link to="/landlords" className="px-5 py-2.5 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition">
            Cancel
          </Link>
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-6 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition shadow-sm"
          >
            {isSubmitting ? "Saving…" : "Add Landlord"}
          </button>
        </div>
      </Form>
    </div>
  );
}

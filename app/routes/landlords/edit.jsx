// routes/landlords/edit.jsx — Edit Landlord
import { useState } from "react";
import { Form, useLoaderData, useActionData, useNavigation, Link, useSearchParams } from "react-router-dom";
import { getUserFromRequest } from "../../utils/auth.server.js";
import { redirect, data } from "react-router";
import { User } from "../../models/user.server.js";
import { Tenancy } from "../../models/tenancy.server.js";
import { toInputDate } from "../../utils/date.js";
import UKDateInput from "../../components/ui/UKDateInput.jsx";
import { Field, Input, UKAddressFields } from "../../components/ui/FormFields.jsx";
import { lookupPostcode } from "../../utils/address-lookup.js";
import { connect } from "../../config/db.server.js";
import { logAMLResult } from "../../utils/activityLog.server.js";


export async function loader({ request, params }) {
  const user = await getUserFromRequest(request);
  if (!user) return redirect("/login");
  if (!user.organizationId && !user.roles?.includes("SUPER_ADMIN")) return redirect("/dashboard");

  await connect();
  const query = { _id: params.id, roles: "LANDLORD" };
  if (!user.roles?.includes("SUPER_ADMIN")) {
    query.organizationId = user.organizationId;
  }

  const profile = await User.findOne(query).lean();
  if (!profile) return redirect("/landlords");
  
  const isAdmin = !!user.organizationId || user.roles?.includes("SUPER_ADMIN");
  
  // Merge into a flat object for the form
  const landlord = {
    _id: profile._id.toString(),
    userId: profile._id.toString(), // Kept in case UI relies on this for backwards compatibility
    title: profile.title || "",
    firstName: profile.firstName || "",
    lastName: profile.lastName || "",
    email: profile.email || "",
    phone: profile.phone || "",
    addressLine1: profile.addressLine1 || "",
    addressLine2: profile.addressLine2 || "",
    addressLine3: profile.addressLine3 || "",
    postTown: profile.postTown || "",
    postcode: profile.postcode || "",
    isCompany: profile.landlordData?.isCompany,
    companyName: profile.landlordData?.companyName,
    companyNumber: profile.landlordData?.companyNumber,
    isOverseas: profile.landlordData?.isOverseas,
    amlResult: profile.landlordData?.amlResult,
    amlCheckedAt: profile.landlordData?.amlCheckedAt,
    amlCheckedBy: profile.landlordData?.amlCheckedBy?.toString() || null,
    sourceOfFunds: profile.landlordData?.sourceOfFunds,
    pepChecked: profile.landlordData?.pepChecked,
    pepResult: profile.landlordData?.pepResult,
    status: profile.landlordData?.status,
  };

  return { landlord, isAdmin };
}

export async function action({ request, params }) {
  const user = await getUserFromRequest(request);
  if (!user) return redirect("/login");

  const formData = await request.formData();
  const v = Object.fromEntries(formData);

  v.isCompany  = v.isCompany  === "on" || v.isCompany  === "true";
  v.isOverseas = v.isOverseas === "on" || v.isOverseas === "true";
  v.pepChecked = v.pepChecked === "on" || v.pepChecked === "true";
  v.amlCompleted = v.amlCompleted === "on" || v.amlCompleted === "true";

  const errors = {};
  if (!v.firstName?.trim()) errors.firstName = "First name is required.";
  if (!v.lastName?.trim())  errors.lastName  = "Last name is required.";
  if (v.isCompany && !v.companyName?.trim()) errors.companyName = "Company name is required.";
  if ((v.isCompany || v.isOverseas) && !v.sourceOfFunds?.trim()) {
    errors.sourceOfFunds = "Source of funds is required for company or overseas landlords.";
  }

  // Rule 2: AML Date Required with Result
  if (v.amlCompleted && v.amlResult && !v.amlCheckedAt) {
    errors.amlCheckedAt = "AML Check Date is required when a result is provided.";
  }

  if (Object.keys(errors).length) {
    const safeV = { ...v };
    return data({ errors, values: safeV }, { status: 400 });
  }

  try {
    await connect();

    // Security: Ensure the user can only edit within their organization
    const query = { _id: params.id, roles: "LANDLORD" };
    if (!user.roles?.includes("SUPER_ADMIN")) {
      query.organizationId = user.organizationId;
    }

    const profile = await User.findOne(query);
    if (!profile) {
      return data({ errors: { general: "Landlord not found or access denied." } }, { status: 404 });
    }

    // Archive check: Block archiving if active tenancies exist
    if (v.status === "archived") {
      const activeTenancies = await Tenancy.countDocuments({ landlordId: profile._id, status: "active" });
      if (activeTenancies > 0) {
        return data({ errors: { status: "Cannot archive landlord with active tenancies." }, values: v }, { status: 400 });
      }
    }

    // Determine AML checked by
    let amlCheckedBy = profile.landlordData?.amlCheckedBy;
    if (v.amlCompleted && v.amlResult && (v.amlResult !== profile.landlordData?.amlResult || !profile.landlordData?.amlCheckedBy)) {
      amlCheckedBy = user.userId;
    }

    // ── Step 1: Update User (identity/contact fields + domain fields) ─────────────────────
    await User.findOneAndUpdate(query, {
      $set: {
        title:        v.title?.trim() || undefined,
        firstName:    v.firstName.trim(),
        lastName:     v.lastName.trim(),
        email:        v.email?.trim().toLowerCase() || undefined,
        phone:        v.phone?.trim() || "",
        addressLine1: v.addressLine1?.trim() || "",
        addressLine2: v.addressLine2?.trim() || "",
        addressLine3: v.addressLine3?.trim() || "",
        postTown:     v.postTown?.trim() || "",
        postcode:     v.postcode?.trim() || "",
        
        "landlordData.isCompany":            v.isCompany,
        "landlordData.companyName":          v.companyName?.trim() || null,
        "landlordData.companyNumber":        v.companyNumber?.trim() || null,
        "landlordData.isOverseas":           v.isOverseas,
        "landlordData.amlResult":            v.amlCompleted ? (v.amlResult || null) : null,
        "landlordData.amlCheckedAt":         v.amlCompleted ? (v.amlCheckedAt || null) : null,
        "landlordData.amlNotes":             v.amlNotes?.trim() || null,
        "landlordData.amlCheckedBy":         amlCheckedBy,
        "landlordData.sourceOfFunds":        v.sourceOfFunds?.trim() || null,
        "landlordData.pepChecked":           v.pepChecked,
        "landlordData.pepResult":            v.pepChecked ? (v.pepResult || null) : null,
        status:                              v.status === "active" ? 1 : 0,
      }
    });

    const returnTab = v.returnTab || "overview";

    // Log AML result change if AML was completed and result differs from before
    const previousAmlResult = profile.landlordData?.amlResult || null;
    const newAmlResult = v.amlCompleted ? (v.amlResult || null) : null;
    if (v.amlCompleted && newAmlResult && newAmlResult !== previousAmlResult) {
      // Re-fetch the updated profile to pass into the log function
      const updatedProfile = await User.findOne(query).lean();
      if (updatedProfile) {
        await logAMLResult(updatedProfile, user);
      }
    }

    return redirect(`/landlords/${params.id}?success=updated&tab=${returnTab}`);
  } catch (err) {
    console.error("Error updating landlord:", err);
    const safeV = { ...v };
    return data({ errors: { general: "An unexpected error occurred while saving. Please try again." }, values: safeV }, { status: 500 });
  }
}

export default function EditLandlord() {
  const { landlord, isAdmin } = useLoaderData();
  const actionData = useActionData();
  const navigation = useNavigation();
  const [searchParams] = useSearchParams();
  const returnTab = searchParams.get("tab") || "overview";
  const isSubmitting = navigation.state === "submitting";
  const errors = actionData?.errors || {};
  const values = actionData?.values || {};

  const d = (field) => values[field] !== undefined ? values[field] : landlord[field];

  const [isCompany,  setIsCompany]  = useState(d("isCompany") === "true" || !!d("isCompany"));
  const [isOverseas, setIsOverseas] = useState(d("isOverseas") === "true" || !!d("isOverseas"));
  const [pepChecked, setPepChecked] = useState(d("pepChecked") === "true" || !!d("pepChecked"));
  
  // AML states
  const initialAmlCompleted = values.amlCompleted === "true" || !!landlord.amlResult || !!landlord.amlCheckedAt;
  const [amlCompleted, setAmlCompleted] = useState(initialAmlCompleted);
  const [amlResult,  setAmlResult]  = useState(d("amlResult") || "pass");
  
  // Confirm Modal state
  const [showConfirm, setShowConfirm] = useState(false);

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

  // Intercept submit to check for downgrade
  const handleSubmit = (e) => {
    if (landlord.amlResult === "pass" && amlCompleted && (amlResult === "refer" || amlResult === "fail") && !showConfirm) {
      e.preventDefault();
      setShowConfirm(true);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Downgrade Modal */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 animate-in fade-in zoom-in duration-200">
            <div className="flex items-center gap-3 text-amber-600 mb-4">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <h3 className="text-lg font-bold text-gray-900">Downgrading AML Status</h3>
            </div>
            <p className="text-gray-600 text-sm mb-6">
              You are changing the AML result for this landlord from <strong>Pass</strong> to <strong>{amlResult}</strong>. 
              This may affect their eligibility for active tenancies. Are you sure you want to proceed?
            </p>
            <div className="flex gap-3 justify-end">
              <button type="button" onClick={() => setShowConfirm(false)} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors">
                Cancel
              </button>
              <button type="button" onClick={() => { setShowConfirm(false); document.getElementById("editForm").requestSubmit(); }} className="px-4 py-2 text-sm font-medium text-white bg-amber-600 hover:bg-amber-700 rounded-lg transition-colors">
                Confirm Downgrade
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center gap-4 mb-6">
        <Link to={`/landlords/${landlord._id}?tab=${returnTab}`} className="flex items-center justify-center w-9 h-9 rounded-lg border border-gray-300 hover:bg-gray-50 transition">
          <svg className="w-4 h-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Edit Landlord</h1>
          <p className="text-sm text-gray-500">{landlord.title ? landlord.title + ' ' : ''}{landlord.firstName} {landlord.lastName}</p>
        </div>
      </div>

      {errors.general && (
        <div className="mb-6 p-4 rounded-lg bg-red-50 text-red-800 text-sm font-medium border border-red-200">
          {errors.general}
        </div>
      )}

      <Form id="editForm" method="post" encType="multipart/form-data" onSubmit={handleSubmit} className="space-y-6">
        <input type="hidden" name="returnTab" value={returnTab} />
        
        {/* Identity */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-5 pb-3 border-b border-gray-100">Identity & Contact</h2>
          <div className="flex gap-3 mb-5">
            <button type="button" onClick={() => setIsCompany(false)}
              className={`flex-1 py-2.5 rounded-lg border text-sm font-medium transition ${!isCompany ? "bg-indigo-600 text-white border-indigo-600" : "border-gray-300 text-gray-600 hover:bg-gray-50"}`}>
              Individual
            </button>
            <button type="button" onClick={() => setIsCompany(true)}
              className={`flex-1 py-2.5 rounded-lg border text-sm font-medium transition ${isCompany ? "bg-indigo-600 text-white border-indigo-600" : "border-gray-300 text-gray-600 hover:bg-gray-50"}`}>
              Company / Ltd
            </button>
          </div>
          <input type="hidden" name="isCompany" value={isCompany ? "true" : "false"} />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Title" error={errors.title}>
              <select name="title" defaultValue={d("title")} className={`w-full border-gray-300 rounded-lg shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm py-2 px-3 border bg-white text-gray-900 ${errors.title ? "border-red-400 bg-red-50" : "border-gray-300"}`}>
                <option value="">Select Title</option>
                {["Mr", "Mrs", "Miss", "Ms", "Dr", "Prof", "Sir", "Other"].map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="First Name" required error={errors.firstName}><Input name="firstName" defaultValue={d("firstName")} error={errors.firstName} /></Field>
            <Field label="Last Name" required error={errors.lastName}><Input  name="lastName"  defaultValue={d("lastName")}  error={errors.lastName}  /></Field>
            <Field label="Email"   error={errors.email}><Input name="email"   type="email" defaultValue={d("email")}   /></Field>
            <Field label="Phone"   error={errors.phone}><Input name="phone"               defaultValue={d("phone")}   /></Field>
            
            {/* Address Details */}
            <div className="md:col-span-2 mt-4 pt-4 border-t border-gray-100">
              <UKAddressFields
                values={values}
                errors={errors}
                title="Address Details"
                requiredFields={{ addressLine1: false, city: false, postcode: false }}
              />
            </div>


            <div className="md:col-span-2 flex items-center gap-3 pt-6 pb-2">
              <input type="checkbox" id="isOverseas" checked={isOverseas} onChange={e => setIsOverseas(e.target.checked)} className="h-4 w-4 text-indigo-600 rounded border-gray-300" />
              <input type="hidden" name="isOverseas" value={isOverseas ? "true" : "false"} />
              <label htmlFor="isOverseas" className="text-sm text-gray-700 font-medium">Overseas landlord <span className="block text-xs font-normal text-gray-400">Requires Source of Funds declaration</span></label>
            </div>
          </div>
          {isCompany && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 pt-4 border-t border-gray-100">
              <Field label="Company Name" required error={errors.companyName}><Input name="companyName" defaultValue={d("companyName")} error={errors.companyName} /></Field>
              <Field label="Companies House Number"><Input name="companyNumber" defaultValue={d("companyNumber")} /></Field>
            </div>
          )}
        </div>

        {/* AML */}
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
               
              </div>
            </div>
          )}

          {amlCompleted && (
            <div className="space-y-4 py-4 animate-in fade-in slide-in-from-top-2 duration-300">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="AML Result" error={errors.amlResult}>
                  <select name="amlResult" value={amlResult} onChange={e => setAmlResult(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500">
                    <option value="pass">✅ Pass</option>
                    <option value="refer">⚠️ Refer</option>
                    <option value="fail">❌ Fail</option>
                  </select>
                </Field>
                <Field label="AML Check Date *" error={errors.amlCheckedAt}>
                  <UKDateInput name="amlCheckedAt" defaultValue={toInputDate(d("amlCheckedAt"))} />
                </Field>
              </div>

              <Field label="AML Notes" error={errors.amlNotes}><textarea name="amlNotes" rows={2} defaultValue={d("amlNotes")} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500" /></Field>
            </div>
          )}

          <div className="mt-4 border-t border-gray-100 pt-5">
            <Field label={<span>Source of Funds {requireSourceOfFunds && <span className="text-red-500">*</span>}</span>} error={errors.sourceOfFunds}>
              <textarea name="sourceOfFunds" rows={2} defaultValue={d("sourceOfFunds")} className={`w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 ${errors.sourceOfFunds ? "border-red-400 bg-red-50" : "border-gray-300"}`} />
            </Field>
          </div>
          
          <div className="mt-5 p-4 bg-gray-50 border border-gray-200 rounded-lg">
            <div className="flex items-center gap-3">
              <input type="checkbox" id="pepChecked" checked={pepChecked} onChange={e => setPepChecked(e.target.checked)} className="h-4 w-4 text-indigo-600 rounded border-gray-300" />
              <input type="hidden" name="pepChecked" value={pepChecked ? "true" : "false"} />
              <label htmlFor="pepChecked" className="text-sm font-medium text-gray-700">PEP Check completed <span className="block text-xs font-normal text-gray-400">Politically Exposed Person check</span></label>
            </div>
            {pepChecked && (
              <div className="mt-4 pt-4 border-t border-gray-200 animate-in fade-in slide-in-from-top-2 duration-300">
                <Field label="PEP Result" error={errors.pepResult}>
                  <select name="pepResult" defaultValue={d("pepResult") || ""} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
                    <option value="">Select…</option>
                    <option value="clear">✅ Clear</option>
                    <option value="flagged">🚩 Flagged</option>
                  </select>
                </Field>
              </div>
            )}
          </div>
        </div>

        {/* Status */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4 pb-3 border-b border-gray-100">Status</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Status" error={errors.status}>
              <select name="status" defaultValue={landlord.status === 0 ? "inactive" : "active"} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500">
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </Field>
          </div>
        </div>

        <div className="flex justify-end gap-3 pb-8">
          <Link to={`/landlords/${landlord._id}?tab=${returnTab}`} className="px-5 py-2.5 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition">Cancel</Link>
          <button type="submit" disabled={isSubmitting} className="px-6 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition shadow-sm">
            {isSubmitting ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </Form>
    </div>
  );
}

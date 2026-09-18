import { useState } from "react";
import { Form } from "react-router";
import { Eye, EyeOff } from "lucide-react";
import UKAddressFields from "../ui/UKAddressFields.jsx";
import UKDateInput from "../ui/UKDateInput.jsx";

export const CLIENT_SERVICES = [
  "BRANDING",
  "IT & SOFTWARE SERVICES",
  "MARKETING SOLUTIONS",
  "ADMINISTRATION & BUISNESS SUPPORT",
  "SALES & BUISNESS DEVELOPMENT",
  "SOCIAL MEDIA MANAGEMENT",
  "WEB DEVELOPMENT",
  "AUDIO & VIDEO PRODUCTION",
  "BUSINESS CONSULTING",
];

export default function UserAccountForm({
  accountType = "staff", // "staff" | "client"
  initialData = {},
  onCancel,
  submitLabel = "Save Account",
  serverErrors = {},
}) {
  const [isCompany, setIsCompany] = useState(initialData?.landlordData?.isCompany || false);
  const [hasServices, setHasServices] = useState(
    Array.isArray(initialData?.services)
      ? initialData.services.length > 0
      : Boolean(initialData?.services || initialData?.service)
  );
  const [showPassword, setShowPassword] = useState(false);
  const isEditing = Boolean(initialData?._id);

  // Format date string for input[type="date"]
  const formatDate = (dateStr) => {
    if (!dateStr) return "";
    try {
      const d = new Date(dateStr);
      return d.toISOString().split("T")[0];
    } catch {
      return "";
    }
  };

  const inputClass = "w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs sm:text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-white text-slate-900 transition";
  const labelClass = "block text-[11px] font-semibold text-slate-700 uppercase tracking-wider mb-1";

  if (accountType === "staff") {
    return (
      <Form method="post" className="space-y-5 max-w-4xl mx-auto">
        {serverErrors?.submit && (
          <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold">
            {serverErrors.submit}
          </div>
        )}

        {/* Staff Form Container */}
        <div className="bg-white rounded-xl shadow-2xs border border-slate-200/90 p-5 sm:p-6 space-y-5">
          {/* Header */}
          <div className="pb-3 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900">Staff Account Details</h2>
              <p className="text-[11px] text-slate-500 mt-0.5">Fill in the employee details below</p>
            </div>
          </div>

          <input type="hidden" name="status" value={initialData?.status ?? 1} />
          <input type="hidden" name="role" value={initialData?.roles?.[0] || "EMPLOYEE"} />

          {/* 2. Personal Information */}
          <div>
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2.5 flex items-center gap-1">
              Personal Details <span className="text-red-500">*</span>
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              <div>
                <label className={labelClass}>
                  First Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="firstName"
                  required
                  defaultValue={initialData?.firstName || ""}
                  placeholder="First Name"
                  className={inputClass}
                />
                {serverErrors?.firstName && <p className="text-[11px] text-red-500 mt-1">{serverErrors.firstName}</p>}
              </div>

              <div>
                <label className={labelClass}>
                  Surname <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="lastName"
                  required
                  defaultValue={initialData?.lastName || ""}
                  placeholder="Surname"
                  className={inputClass}
                />
                {serverErrors?.lastName && <p className="text-[11px] text-red-500 mt-1">{serverErrors.lastName}</p>}
              </div>

              <div>
                <label className={labelClass}>Select Gender</label>
                <select
                  name="gender"
                  defaultValue={initialData?.gender || ""}
                  className={inputClass}
                >
                  <option value="">Select Gender</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                  <option value="Prefer not to say">Prefer not to say</option>
                </select>
              </div>

              <div>
                <label className={labelClass}>Date of Birth (DOB)</label>
                <UKDateInput
                  name="dob"
                  defaultValue={formatDate(initialData?.dob)}
                  className={inputClass}
                  placeholder="DD/MM/YYYY"
                />
              </div>

              <div>
                <label className={labelClass}>National Insurance (NIC)</label>
                <input
                  type="text"
                  name="nic"
                  defaultValue={initialData?.nic || initialData?.nationalInsuranceNumber || ""}
                  placeholder="e.g. QQ 12 34 56 A"
                  className={`${inputClass} uppercase`}
                />
              </div>
            </div>
          </div>

          <hr className="border-slate-100" />

          {/* 3. Job Title, Salary & Sponsorship */}
          <div>
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2.5">
              Employment & Sponsorship Info
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className={labelClass}>Job Title <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  name="jobTitle"
                  required
                  defaultValue={initialData?.jobTitle || ""}
                  placeholder="e.g. Property Manager"
                  className={inputClass}
                />
                {serverErrors?.jobTitle && <p className="text-[11px] text-red-500 mt-1">{serverErrors.jobTitle}</p>}
              </div>

              <div>
                <label className={labelClass}>Joining Date</label>
                <UKDateInput
                  name="joiningDate"
                  defaultValue={formatDate(initialData?.joiningDate)}
                  className={inputClass}
                  placeholder="DD/MM/YYYY"
                />
              </div>

              <div>
                <label className={labelClass}>Salary (£)</label>
                <input
                  type="number"
                  name="salary"
                  step="any"
                  min="0"
                  defaultValue={initialData?.salary !== undefined && initialData?.salary !== null ? initialData?.salary : ""}
                  placeholder="e.g. 35000"
                  className={inputClass}
                />
              </div>

              <div>
                <label className={labelClass}>Certificate of Sponsorship (COS)</label>
                <input
                  type="text"
                  name="cos"
                  defaultValue={initialData?.cos || initialData?.cosNumber || ""}
                  placeholder="e.g. W123456789"
                  className={inputClass}
                />
              </div>
            </div>
          </div>

          <hr className="border-slate-100" />

          {/* 4. Bank Details */}
          <div>
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2.5">
              Bank Details
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className={labelClass}>Account Name</label>
                <input
                  type="text"
                  name="bankAccountName"
                  defaultValue={initialData?.bankDetails?.accountName || ""}
                  placeholder="e.g. John Doe"
                  className={inputClass}
                />
              </div>

              <div>
                <label className={labelClass}>Bank Name</label>
                <input
                  type="text"
                  name="bankName"
                  defaultValue={initialData?.bankDetails?.bankName || ""}
                  placeholder="e.g. Barclays"
                  className={inputClass}
                />
              </div>

              <div>
                <label className={labelClass}>Account Number</label>
                <input
                  type="text"
                  name="bankAccountNumber"
                  defaultValue={initialData?.bankDetails?.accountNumber || ""}
                  placeholder="e.g. 12345678"
                  className={inputClass}
                />
              </div>

              <div>
                <label className={labelClass}>Sort Code</label>
                <input
                  type="text"
                  name="bankSortCode"
                  defaultValue={initialData?.bankDetails?.sortCode || ""}
                  placeholder="e.g. 20-00-00"
                  className={inputClass}
                />
              </div>
            </div>
          </div>

          <hr className="border-slate-100" />

          {/* 5. Address */}
          <div>
            <UKAddressFields
              values={initialData}
              errors={serverErrors}
              title="Address Information"
              showAddressLine2={false}
              showAddressLine3={false}
              showCounty={false}
              showCountry={false}
              defaultCity="UK"
              requiredFields={{ addressLine1: true, city: true, postcode: true }}
            />
          </div>

          <hr className="border-slate-100" />

          {/* 5. Contact */}
          <div>
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2.5 flex items-center gap-1">
              Contact <span className="text-red-500">*</span>
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className={labelClass}>Email Address</label>
                <input
                  type="email"
                  name="email"
                  readOnly={isEditing}
                  defaultValue={initialData?.email || ""}
                  placeholder="email@example.com"
                  className={`${inputClass} ${isEditing ? "bg-slate-100 text-slate-500 cursor-not-allowed" : ""}`}
                />
                {serverErrors?.email && <p className="text-[11px] text-red-500 mt-1">{serverErrors.email}</p>}
              </div>

              <div>
                <label className={labelClass}>Telephone Number <span className="text-red-500">*</span></label>
                <input
                  type="tel"
                  name="phone"
                  required
                  defaultValue={initialData?.phone || initialData?.telephoneNo || ""}
                  placeholder="+44 7700 900000"
                  className={inputClass}
                />
                {serverErrors?.phone && <p className="text-[11px] text-red-500 mt-1">{serverErrors.phone}</p>}
              </div>

              <div>
                <label className={labelClass}>
                  Password {isEditing ? <span className="text-slate-400 font-normal normal-case">(Leave blank to keep current)</span> : <span className="text-red-500">*</span>}
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    name="password"
                    required={!isEditing}
                    defaultValue={initialData?.plainPassword || ""}
                    placeholder={isEditing && !initialData?.plainPassword ? "Leave blank to keep current" : "Enter a secure password"}
                    className={`${inputClass} pr-10`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600 transition"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {serverErrors?.password && <p className="text-[11px] text-red-500 mt-1">{serverErrors.password}</p>}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-50 transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 transition cursor-pointer shadow-2xs"
            >
              {submitLabel}
            </button>
          </div>
        </div>
      </Form>
    );
  }

  // Client Form
  return (
    <Form method="post" className="space-y-5 max-w-4xl mx-auto">
      {serverErrors?.submit && (
        <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold">
          {serverErrors.submit}
        </div>
      )}

      {/* Single Section Container for Client Account Form */}
      <div className="bg-white rounded-xl shadow-2xs border border-slate-200/90 p-5 sm:p-6 space-y-5">
        {/* Header */}
        <div className="pb-3 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900">Client Account Details</h2>
            <p className="text-[11px] text-slate-500 mt-0.5">Fill in the client information below</p>
          </div>
        </div>

        {/* 1. Personal & Company Details */}
        <div>
          <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2.5 flex items-center gap-1">
            Personal & Company Details <span className="text-red-500">*</span>
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <div>
              <label className={labelClass}>Title</label>
              <select
                name="title"
                defaultValue={initialData?.title || "Mr"}
                className={inputClass}
              >
                <option value="Mr">Mr</option>
                <option value="Mrs">Mrs</option>
                <option value="Miss">Miss</option>
                <option value="Ms">Ms</option>
                <option value="Dr">Dr</option>
                <option value="Prof">Prof</option>
                <option value="Sir">Sir</option>
                <option value="Other">Other</option>
              </select>
            </div>

            <div>
              <label className={labelClass}>First Name <span className="text-red-500">*</span></label>
              <input
                type="text"
                name="firstName"
                required
                defaultValue={initialData?.firstName || ""}
                placeholder="e.g. Sarah"
                className={inputClass}
              />
              {serverErrors?.firstName && <p className="text-[11px] text-red-500 mt-1">{serverErrors.firstName}</p>}
            </div>

            <div>
              <label className={labelClass}>Surname <span className="text-red-500">*</span></label>
              <input
                type="text"
                name="lastName"
                required
                defaultValue={initialData?.lastName || ""}
                placeholder="e.g. Jenkins"
                className={inputClass}
              />
              {serverErrors?.lastName && <p className="text-[11px] text-red-500 mt-1">{serverErrors.lastName}</p>}
            </div>

            <div className="sm:col-span-3">
              <label className={labelClass}>Company Name</label>
              <input
                type="text"
                name="companyName"
                defaultValue={initialData?.companyName || initialData?.landlordData?.companyName || ""}
                placeholder="e.g. Apex Property Investments Ltd"
                className={inputClass}
              />
            </div>
          </div>
        </div>

        <hr className="border-slate-100" />

        {/* 2. Services Provided */}
        <div>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-0.5 flex items-center gap-1">
                Services Provided
              </h3>
              <p className="text-[11px] text-slate-500">Enable if services are provided to this client</p>
            </div>
            <label className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50/70 hover:bg-slate-100/70 cursor-pointer transition select-none has-checked:border-indigo-500 has-checked:bg-indigo-50/50">
              <input
                type="checkbox"
                checked={hasServices}
                onChange={(e) => setHasServices(e.target.checked)}
                className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500/20 border-slate-300"
              />
              <span className="text-xs font-semibold text-slate-700">Services Provided</span>
            </label>
          </div>

          {hasServices && (
            <div className="mt-3.5 pt-3.5 border-t border-slate-100">
              <p className="text-[11px] text-slate-500 mb-2.5">Select the service(s) provided to this client:</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                {CLIENT_SERVICES.map((service) => {
                  const isChecked = Array.isArray(initialData?.services)
                    ? initialData.services.includes(service)
                    : initialData?.service === service || initialData?.services === service;
                  return (
                    <label
                      key={service}
                      className="flex items-center gap-2.5 p-2.5 rounded-lg border border-slate-200 hover:border-indigo-400 hover:bg-indigo-50/20 cursor-pointer transition text-xs font-medium text-slate-700 select-none has-checked:border-indigo-600 has-checked:bg-indigo-50/40 has-checked:text-indigo-900"
                    >
                      <input
                        type="checkbox"
                        name="services"
                        value={service}
                        defaultChecked={isChecked}
                        className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500/20 border-slate-300"
                      />
                      <span>{service}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <hr className="border-slate-100" />

        {/* 3. Address Details */}
        <div>
          <UKAddressFields
            values={initialData}
            errors={serverErrors}
            title="Address Details"
            showAddressLine2={false}
            showAddressLine3={false}
            showCounty={false}
            showCountry={false}
            defaultCity="UK"
            requiredFields={{ addressLine1: false, city: false, postcode: false }}
          />
        </div>

        <hr className="border-slate-100" />

        {/* 4. Contact Details */}
        <div>
          <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2.5 flex items-center gap-1">
            Contact Details <span className="text-red-500">*</span>
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className={labelClass}>Email Address <span className="text-red-500">*</span></label>
              <input
                type="email"
                name="email"
                required
                readOnly={isEditing}
                defaultValue={initialData?.email || ""}
                placeholder="user@example.com"
                className={`${inputClass} ${isEditing ? "bg-slate-100 text-slate-500 cursor-not-allowed" : ""}`}
              />
              {serverErrors?.email && <p className="text-[11px] text-red-500 mt-1">{serverErrors.email}</p>}
            </div>

            <div>
              <label className={labelClass}>Phone / Mobile</label>
              <input
                type="tel"
                name="phone"
                defaultValue={initialData?.phone || initialData?.telephoneNo || ""}
                placeholder="+44 7700 900000"
                className={inputClass}
              />
            </div>
          </div>
        </div>

        {/* Actions */}
        <input type="hidden" name="status" value={initialData?.status ?? 1} />
        <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-50 transition cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-5 py-2 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 transition cursor-pointer shadow-2xs"
          >
            {submitLabel}
          </button>
        </div>
      </div>
    </Form>
  );
}

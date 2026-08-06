// components/tenancy/TenancyForm.jsx
// Comprehensive reusable tenancy form for creating and editing tenancies
// Used by: /routes/tenancies/add.jsx and /routes/tenancies/edit.jsx
// SECTION 4: TENANCY FORM WITH FULL PRE-FLIGHT AND COMPLIANCE CHECKS

import { useState, useMemo } from "react";
import { Link, Form } from "react-router-dom";
import UKDateInput from "../ui/UKDateInput.jsx";
import Badge from "../ui/Badge.jsx";

const PAYMENT_METHODS = [
  { value: "standing_order", label: "Standing Order" },
  { value: "bacs_transfer", label: "BACS Transfer" },
  { value: "direct_debit", label: "Direct Debit" },
  { value: "cash", label: "Cash" },
  { value: "cheque", label: "Cheque" },
  { value: "other", label: "Other" },
];

const DEPOSIT_SCHEMES = [
  { value: "dps", label: "DPS (Deposit Protection Service)" },
  { value: "tds", label: "TDS (Tenancy Deposit Scheme)" },
  { value: "mydeposits", label: "MyDeposits" },
];

export function TenancyForm({
  mode = "create", // "create" or "edit"
  initialData = null,
  properties = [],
  tenants = [],
  isSubmitting = false,
  errors = {},
  actionData = {},
}) {
  // STATE: SECTION A - PROPERTY AND LANDLORD

  const [selectedPropertyId, setSelectedPropertyId] = useState(
    initialData?.propertyId?._id || initialData?.propertyId || ""
  );

  const selectedProperty = useMemo(
    () => properties.find((p) => p._id === selectedPropertyId),
    [selectedPropertyId, properties]
  );

  // STATE: SECTION B - TENANTS

  const [selectedTenantIds, setSelectedTenantIds] = useState(
    initialData?.tenantIds?.map((t) => (typeof t === "string" ? t : t._id)) || []
  );
  const [tenantSearchTerm, setTenantSearchTerm] = useState("");
  const [showTenantDropdown, setShowTenantDropdown] = useState(tenants.length > 0);

  const selectedTenants = useMemo(
    () =>
      selectedTenantIds
        .map((id) => tenants.find((t) => t._id === id))
        .filter(Boolean),
    [selectedTenantIds, tenants]
  );

  const filteredTenants = useMemo(() => {
    return tenants.filter((t) => {
      const fullName = `${t.title ? t.title + ' ' : ''}${t.firstName} ${t.lastName}`.toLowerCase();
      return (
        fullName.includes(tenantSearchTerm.toLowerCase()) &&
        !selectedTenantIds.includes(t._id)
      );
    });
  }, [tenantSearchTerm, tenants, selectedTenantIds]);

  const handleTenantSelect = (tenantId) => {
    setSelectedTenantIds([...selectedTenantIds, tenantId]);
    setTenantSearchTerm("");
    setShowTenantDropdown(false);
  };

  const handleTenantRemove = (tenantId) => {
    setSelectedTenantIds(selectedTenantIds.filter((id) => id !== tenantId));
  };

  // STATE: SECTION C - TENANCY TYPE AND DATES

  const [tenancyType, setTenancyType] = useState(
    initialData?.tenancyType || "ast"
  );
  const [startDate, setStartDate] = useState(
    initialData?.startDate ? new Date(initialData.startDate) : null
  );
  const [endDate, setEndDate] = useState(
    initialData?.endDate ? new Date(initialData.endDate) : null
  );

  const rentReviewDate = useMemo(() => {
    if (!startDate) return null;
    const review = new Date(startDate);
    review.setFullYear(review.getFullYear() + 1);
    return review;
  }, [startDate]);

  // STATE: SECTION D - RENT

  const [rentAmount, setRentAmount] = useState(
    initialData?.rent?.amount || ""
  );
  const [rentDueDay, setRentDueDay] = useState(
    initialData?.rent?.dueDay || "1"
  );
  const [paymentMethod, setPaymentMethod] = useState(
    initialData?.rent?.paymentMethod || "standing_order"
  );

  const rentExceedsAdvertised =
    selectedProperty?.advertisedRent &&
    rentAmount &&
    parseFloat(rentAmount) > selectedProperty.advertisedRent;

  // STATE: SECTION E - DEPOSIT

  const [depositTaken, setDepositTaken] = useState(
    initialData?.deposit?.amount ? true : false
  );
  const [depositAmount, setDepositAmount] = useState(
    initialData?.deposit?.amount || ""
  );
  const [depositScheme, setDepositScheme] = useState(
    initialData?.deposit?.scheme || "dps"
  );

  // Calculate maximum deposit (5 weeks rent)
  const maxDeposit = useMemo(() => {
    if (!rentAmount) return 0;
    return Math.round((rentAmount * 5) / 4.33 * 100) / 100;
  }, [rentAmount]);

  const depositExceedsMaximum =
    depositTaken &&
    depositAmount &&
    parseFloat(depositAmount) > maxDeposit;

  // Calculate deposit protection deadline
  const depositDeadline = useMemo(() => {
    if (!startDate) return null;
    const deadline = new Date(startDate);
    deadline.setDate(deadline.getDate() + 30);
    return deadline;
  }, [startDate]);

  // STATE: SECTION F - HOW TO RENT GUIDE

  const [howToRentServed, setHowToRentServed] = useState(
    initialData?.howToRent?.served || false
  );
  const [howToRentDate, setHowToRentDate] = useState(
    initialData?.howToRent?.servedDate
      ? new Date(initialData.howToRent.servedDate)
      : null
  );
  const [howToRentVersion, setHowToRentVersion] = useState(
    initialData?.howToRent?.version || ""
  );

  // COMPLIANCE CHECKS

  const hasComplianceBlocks =
    actionData?.preFlightBlocks &&
    actionData.preFlightBlocks.length > 0;

  // SUBMIT DISABLE CONDITIONS

  const isSubmitDisabled =
    isSubmitting ||
    !selectedPropertyId ||
    selectedTenantIds.length === 0 ||
    !startDate ||
    (tenancyType === "ast" && !endDate) ||
    !rentAmount ||
    rentExceedsAdvertised ||
    depositExceedsMaximum ||
    hasComplianceBlocks ||
    (depositTaken && !depositScheme) ||
    (howToRentServed && !howToRentDate);

  // RENDER

  return (
    <Form method="post" className="space-y-8" encType="multipart/form-data">
      {/* ────────────────────────────────────────────────────────────────────── */}
      {/* PRE-FLIGHT BLOCK ERRORS (Hard blockers) */}
      {/* ────────────────────────────────────────────────────────────────────── */}
      {hasComplianceBlocks && (
        <div className="p-5 rounded-lg bg-red-50 border border-red-200">
          <div className="flex items-start gap-3 mb-3">
            <div className="flex-shrink-0 w-6 h-6 text-red-600 mt-0.5">
              <svg
                fill="currentColor"
                viewBox="0 0 20 20"
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-bold text-red-900 mb-2">
                Tenancy Cannot Be Created
              </h3>
              <ul className="text-sm text-red-800 space-y-1">
                {actionData.preFlightBlocks.map((block, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span>•</span>
                    <span>{block.message}</span>
                  </li>
                ))}
              </ul>
              <p className="text-sm font-medium text-red-800 mt-3">
                Resolve these before creating a tenancy.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────── */}
      {/* PRE-FLIGHT WARNINGS (Acknowledgment required to proceed) */}
      {/* ────────────────────────────────────────────────────────────────────── */}
      {actionData?.preFlightWarnings?.length > 0 && !hasComplianceBlocks && (
        <div className="p-5 rounded-lg bg-amber-50 border border-amber-300">
          <div className="flex items-start gap-3 mb-4">
            <div className="flex-shrink-0 w-6 h-6 text-amber-600 mt-0.5">
              <svg fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-bold text-amber-900 mb-2">
                Compliance Warnings — Acknowledgment Required
              </h3>
              <ul className="text-sm text-amber-800 space-y-1 mb-4">
                {actionData.preFlightWarnings.map((w, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span>⚠</span>
                    <span>{w.message}</span>
                  </li>
                ))}
              </ul>
              <p className="text-sm text-amber-800 mb-4">
                These are warnings, not hard blocks. You can still create the tenancy,
                but you must acknowledge the risks above before proceeding.
              </p>
              {/* Named submit button — sends warningsAcknowledged=true with the full form */}
              <button
                type="submit"
                name="warningsAcknowledged"
                value="true"
                disabled={isSubmitting}
                className="px-4 py-2 bg-amber-600 text-white text-sm font-semibold rounded-lg hover:bg-amber-700 disabled:opacity-50 cursor-pointer transition"
              >
                {isSubmitting ? "Creating..." : "I understand — Create Tenancy Anyway"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────── */}
      {/* ACTION ERRORS */}
      {/* ────────────────────────────────────────────────────────────────────── */}
      {actionData?.error && (
        <div className="p-4 rounded-lg bg-red-50 border border-red-200">
          <p className="text-sm font-medium text-red-800">{actionData.error}</p>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────── */}
      {/* SECTION A: PROPERTY AND LANDLORD */}
      {/* ────────────────────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-6 pb-3 border-b border-gray-100">
          A — Property & Landlord
        </h2>

        {/* Property dropdown */}
        <div className="mb-6">
          <label
            htmlFor="propertyId"
            className="block text-sm font-medium text-gray-700 mb-2"
          >
            Property *
          </label>
          <select
            id="propertyId"
            name="propertyId"
            required
            value={selectedPropertyId}
            onChange={(e) => setSelectedPropertyId(e.target.value)}
            disabled={mode === "edit"}
            className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white disabled:bg-gray-50 disabled:text-gray-500"
          >
            <option value="">Choose property...</option>
            {properties.map((prop) => (
              <option key={prop._id} value={prop._id}>
                {prop.addressLine1}, {prop.city} {prop.postcode}
              </option>
            ))}
          </select>
          {mode === "edit" && (
            <input type="hidden" name="propertyId" value={selectedPropertyId} />
          )}
          {errors.propertyId && (
            <p className="mt-1 text-sm text-red-600">{errors.propertyId}</p>
          )}
        </div>

        {/* Landlord info (auto-filled from property) */}
        {selectedProperty && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Landlord
            </label>
            <div className="flex items-center gap-3 p-4 rounded-lg bg-gray-50 border border-gray-200">
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900">
                  {selectedProperty.landlordName ||
                    "No landlord assigned"}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Auto-filled from property
                </p>
              </div>
              <div>
                {selectedProperty.landlordAMLPassed ? (
                  <Badge variant="success">AML Passed</Badge>
                ) : (
                  <Badge variant="danger">AML Not Passed</Badge>
                )}
              </div>
            </div>

            {/* AML block warning */}
            {!selectedProperty.landlordAMLPassed && (
              <div className="mt-4 p-4 rounded-lg bg-red-50 border border-red-200">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-5 h-5 text-red-600 mt-0.5">
                    <svg
                      fill="currentColor"
                      viewBox="0 0 20 20"
                      aria-hidden="true"
                    >
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-red-800">
                      AML check not passed
                    </p>
                    <p className="text-sm text-red-700 mt-1">
                      Cannot create tenancy until AML is complete.
                    </p>
                    {selectedProperty.landlordId && (
                      <Link
                        to={`/landlords/${selectedProperty.landlordId}?tab=aml`}
                        className="inline-block mt-2 text-sm font-medium text-red-700 hover:text-red-900 underline"
                      >
                        Complete AML →
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            )}

            <input
              type="hidden"
              name="landlordId"
              value={selectedProperty.landlordId || ""}
            />
          </div>
        )}
      </div>

      {/* ────────────────────────────────────────────────────────────────────── */}
      {/* SECTION B: TENANTS */}
      {/* ────────────────────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-6 pb-3 border-b border-gray-100">
          B — Tenant(s)
        </h2>

        {/* Tenant multi-select search */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-3">
            Tenant(s) *
          </label>

          <div className="relative mb-3">
            <input
              type="text"
              placeholder="Search tenants..."
              value={tenantSearchTerm}
              onChange={(e) => {
                setTenantSearchTerm(e.target.value);
                setShowTenantDropdown(true);
              }}
              onFocus={() => setShowTenantDropdown(true)}
              onBlur={() => setTimeout(() => setShowTenantDropdown(false), 200)}
              className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />

            {/* Dropdown menu */}
            {showTenantDropdown && filteredTenants.length > 0 && (
              <div className="absolute z-10 w-full mt-2 bg-white border border-gray-300 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                {filteredTenants.map((tenant) => (
                  <button
                    key={tenant._id}
                    type="button"
                    onClick={() => handleTenantSelect(tenant._id)}
                    className="w-full text-left px-4 py-2 hover:bg-indigo-50 flex items-center justify-between text-sm border-b last:border-b-0"
                  >
                    <span>
                      {tenant.title ? tenant.title + ' ' : ''}{tenant.firstName} {tenant.lastName}
                    </span>
                    {tenant.rightToRentChecked ? (
                      <Badge variant="success" size="sm">
                        RTR ✓
                      </Badge>
                    ) : (
                      <Badge variant="danger" size="sm">
                        RTR ✗
                      </Badge>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Selected tenants as removable tags */}
          <div className="flex flex-wrap gap-2 mb-3">
            {selectedTenants.map((tenant) => (
              <div
                key={tenant._id}
                className="inline-flex items-center gap-2 px-3 py-1.5 bg-indigo-50 border border-indigo-200 rounded-full text-sm"
              >
                <span className="font-medium">
                  {tenant.title ? tenant.title + ' ' : ''}{tenant.firstName} {tenant.lastName}
                </span>
                <button
                  type="button"
                  onClick={() => handleTenantRemove(tenant._id)}
                  className="ml-1 text-indigo-600 hover:text-red-600 font-bold"
                >
                  ×
                </button>
              </div>
            ))}
          </div>

          {/* Add new tenant link */}
          <Link
            to="/tenants/new"
            target="_blank"
            className="text-sm text-indigo-600 hover:text-indigo-900 font-medium"
          >
            + Add new tenant
          </Link>

          {/* Hidden inputs for selected tenants */}
          {selectedTenantIds.map((tenantId) => (
            <input
              key={tenantId}
              type="hidden"
              name="tenantIds"
              value={tenantId}
            />
          ))}

          {errors.tenantIds && (
            <p className="mt-2 text-sm text-red-600">{errors.tenantIds}</p>
          )}
        </div>

        {/* Tenant RTR warnings */}
        {selectedTenants.map((tenant) =>
          !tenant.rightToRentChecked ? (
            <div
              key={tenant._id}
              className="mb-3 p-4 rounded-lg bg-red-50 border border-red-200"
            >
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-5 h-5 text-red-600 mt-0.5">
                  <svg
                    fill="currentColor"
                    viewBox="0 0 20 20"
                    aria-hidden="true"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-red-800">
                    {tenant.title ? tenant.title + ' ' : ''}{tenant.firstName} {tenant.lastName}: Right to Rent check
                    not valid
                  </p>
                  <Link
                    to={`/tenants/${tenant._id}?tab=rtr`}
                    className="inline-block mt-1 text-sm font-medium text-red-700 hover:text-red-900 underline"
                  >
                    Fix →
                  </Link>
                </div>
              </div>
            </div>
          ) : null
        )}
      </div>

      {/* ────────────────────────────────────────────────────────────────────── */}
      {/* SECTION C: TENANCY TYPE AND DATES */}
      {/* ────────────────────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-6 pb-3 border-b border-gray-100">
          C — Tenancy Type & Dates
        </h2>

        {/* Tenancy type radio buttons */}
        <div className="mb-8">
          <label className="block text-sm font-medium text-gray-700 mb-3">
            Tenancy Type *
          </label>
          <div className="space-y-3">
            <label className="flex items-start p-4 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50">
              <input
                type="radio"
                name="tenancyType"
                value="ast"
                checked={tenancyType === "ast"}
                onChange={(e) => setTenancyType(e.target.value)}
                className="mt-1"
              />
              <div className="ml-3">
                <p className="text-sm font-medium text-gray-900">
                  AST - Fixed Term
                </p>
                <p className="text-sm text-gray-500 mt-0.5">
                  Fixed term tenancy with a set end date. For existing tenancies
                  created before 1 May 2026.
                </p>
              </div>
            </label>

            <label className="flex items-start p-4 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50">
              <input
                type="radio"
                name="tenancyType"
                value="apt"
                checked={tenancyType === "apt"}
                onChange={(e) => setTenancyType(e.target.value)}
                className="mt-1"
              />
              <div className="ml-3">
                <p className="text-sm font-medium text-gray-900">
                  APT - Periodic
                </p>
                <p className="text-sm text-gray-500 mt-0.5">
                  Periodic tenancy with no fixed end date. Required for all new
                  tenancies from 1 May 2026 under the Renters Rights Act.
                </p>
              </div>
            </label>
          </div>
        </div>

        {/* Dates grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Start date */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Start Date *
            </label>
            <UKDateInput
              name="startDate"
              value={startDate ? startDate.toISOString().split('T')[0] : ""}
              onChange={(e) => setStartDate(e.target.value ? new Date(e.target.value) : null)}
              required
            />
            {errors.startDate && (
              <p className="mt-1 text-sm text-red-600">{errors.startDate}</p>
            )}
          </div>

          {/* End date - only for AST */}
          {tenancyType === "ast" && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                End Date *
              </label>
              <UKDateInput
                name="endDate"
                value={endDate ? endDate.toISOString().split('T')[0] : ""}
                onChange={(e) => setEndDate(e.target.value ? new Date(e.target.value) : null)}
                required
              />
              {errors.endDate && (
                <p className="mt-1 text-sm text-red-600">{errors.endDate}</p>
              )}
              {startDate && endDate && (
                <p className="mt-2 text-xs text-gray-500">
                  Duration:{" "}
                  {Math.round(
                    (endDate - startDate) / (1000 * 60 * 60 * 24 * 30.44)
                  )}{" "}
                  months
                </p>
              )}
            </div>
          )}
        </div>

        {/* APT info message */}
        {tenancyType === "apt" && (
          <div className="mt-6 p-4 rounded-lg bg-blue-50 border border-blue-200">
            <p className="text-sm text-blue-800">
              <strong>APT tenancies have no fixed end date.</strong> Tenant gives 2 months
              notice to leave. Landlord uses Section 8 to end tenancy.
            </p>
          </div>
        )}
      </div>

      {/* ────────────────────────────────────────────────────────────────────── */}
      {/* SECTION D: RENT */}
      {/* ────────────────────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-6 pb-3 border-b border-gray-100">
          D — Rent
        </h2>

        <div className="space-y-6">
          {/* Monthly rent */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Monthly Rent *
            </label>
            <div className="relative mb-2">
              <span className="absolute left-4 top-2.5 text-sm text-gray-500">
                £
              </span>
              <input
                type="number"
                name="rentAmount"
                value={rentAmount}
                onChange={(e) => setRentAmount(e.target.value)}
                required
                step="0.01"
                min="0"
                className="w-full pl-8 border border-gray-300 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>

            {/* Advertised rent warning */}
            {selectedProperty?.advertisedRent && (
              <p className="text-xs text-gray-500 mb-2">
                Advertised rent:{" "}
                <strong>
                  £{selectedProperty.advertisedRent.toLocaleString()}
                </strong>
              </p>
            )}

            {rentExceedsAdvertised && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200">
                <p className="text-sm font-medium text-red-800">
                  Rent cannot exceed advertised amount. RRA 2026 prohibits
                  above-asking rent.
                </p>
              </div>
            )}

            {errors.rentAmount && (
              <p className="mt-1 text-sm text-red-600">{errors.rentAmount}</p>
            )}
          </div>

          {/* Rent due day */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Rent Due Day (1-28) *
            </label>
            <input
              type="number"
              name="rentDueDay"
              value={rentDueDay}
              onChange={(e) => setRentDueDay(e.target.value)}
              required
              min="1"
              max="28"
              className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
            {errors.rentDueDay && (
              <p className="mt-1 text-sm text-red-600">{errors.rentDueDay}</p>
            )}
          </div>

          {/* Payment method */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Payment Method *
            </label>
            <select
              name="paymentMethod"
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              required
              className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            >
              {PAYMENT_METHODS.map((method) => (
                <option key={method.value} value={method.value}>
                  {method.label}
                </option>
              ))}
            </select>
            {errors.paymentMethod && (
              <p className="mt-1 text-sm text-red-600">
                {errors.paymentMethod}
              </p>
            )}
          </div>

          {/* Rent review date (read-only) */}
          {startDate && (
            <div className="p-4 rounded-lg bg-gray-50 border border-gray-200">
              <p className="text-sm font-medium text-gray-900 mb-1">
                Earliest Rent Review Date
              </p>
              <p className="text-sm text-gray-700 font-mono">
                {rentReviewDate?.toLocaleDateString("en-GB", {
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </p>
              <p className="text-xs text-gray-500 mt-2">
                RRA 2026: minimum 12 months between rent reviews
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ────────────────────────────────────────────────────────────────────── */}
      {/* SECTION E: DEPOSIT */}
      {/* ────────────────────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-6 pb-3 border-b border-gray-100">
          E — Deposit
        </h2>

        {/* Deposit taken toggle */}
        <div className="mb-6">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={depositTaken}
              onChange={(e) => setDepositTaken(e.target.checked)}
              className="w-4 h-4 border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500"
            />
            <span className="text-sm font-medium text-gray-700">
              Deposit taken?
            </span>
          </label>
          <input
            type="hidden"
            name="depositTaken"
            value={depositTaken ? "true" : "false"}
          />
        </div>

        {depositTaken ? (
          <div className="space-y-6">
            {/* Deposit amount */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Deposit Amount *
              </label>
              <div className="relative mb-2">
                <span className="absolute left-4 top-2.5 text-sm text-gray-500">
                  £
                </span>
                <input
                  type="number"
                  name="depositAmount"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  required={depositTaken}
                  step="0.01"
                  min="0"
                  className="w-full pl-8 border border-gray-300 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>

              {/* Maximum deposit info */}
              {rentAmount && (
                <p className="text-xs text-gray-500 mb-2">
                  Maximum allowed:{" "}
                  <strong>
                    £{maxDeposit.toLocaleString("en-GB", {
                      maximumFractionDigits: 2,
                    })}
                  </strong>{" "}
                  (5 weeks rent)
                </p>
              )}

              {depositExceedsMaximum && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200">
                  <p className="text-sm font-medium text-red-800">
                    Deposit exceeds legal maximum of 5 weeks rent.
                  </p>
                </div>
              )}

              {errors.depositAmount && (
                <p className="mt-1 text-sm text-red-600">
                  {errors.depositAmount}
                </p>
              )}
            </div>

            {/* Deposit scheme */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Protection Scheme *
              </label>
              <select
                name="depositScheme"
                value={depositScheme}
                onChange={(e) => setDepositScheme(e.target.value)}
                required={depositTaken}
                className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              >
                <option value="">Choose scheme...</option>
                {DEPOSIT_SCHEMES.map((scheme) => (
                  <option key={scheme.value} value={scheme.value}>
                    {scheme.label}
                  </option>
                ))}
              </select>
              {errors.depositScheme && (
                <p className="mt-1 text-sm text-red-600">
                  {errors.depositScheme}
                </p>
              )}
            </div>

            {/* Deposit info box */}
            <div className="p-4 rounded-lg bg-amber-50 border border-amber-300">
              <p className="text-sm text-amber-900 font-medium mb-2">
                Deposit Protection Required
              </p>
              <p className="text-sm text-amber-800 mb-2">
                Deposit must be protected within 30 days of tenancy start.
                Prescribed information must be served to tenant within 30 days.
                Failure = cannot serve valid possession notice.
              </p>
              {startDate && depositDeadline && (
                <p className="text-sm font-mono text-amber-900">
                  Protect by:{" "}
                  <strong>
                    {depositDeadline.toLocaleDateString("en-GB", {
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </strong>
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="p-4 rounded-lg bg-gray-50 border border-gray-200">
            <p className="text-sm text-gray-700">
              <strong>No deposit</strong> tenancy
            </p>
          </div>
        )}
      </div>

      {/* ────────────────────────────────────────────────────────────────────── */}
      {/* SECTION F: HOW TO RENT GUIDE */}
      {/* ────────────────────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-6 pb-3 border-b border-gray-100">
          F — How to Rent Guide
        </h2>

        {/* Guide served toggle */}
        <div className="mb-6">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={howToRentServed}
              onChange={(e) => setHowToRentServed(e.target.checked)}
              className="w-4 h-4 border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500"
            />
            <span className="text-sm font-medium text-gray-700">
              How to Rent guide has been served?
            </span>
          </label>
          <input
            type="hidden"
            name="howToRentServed"
            value={howToRentServed ? "true" : "false"}
          />
        </div>

        {howToRentServed ? (
          <div className="space-y-6">
            {/* Date served */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Date Served *
              </label>
              <UKDateInput
                name="howToRentDate"
                value={howToRentDate ? howToRentDate.toISOString().split('T')[0] : ""}
                onChange={(e) => setHowToRentDate(e.target.value ? new Date(e.target.value) : null)}
                required
              />
              {errors.howToRentDate && (
                <p className="mt-1 text-sm text-red-600">
                  {errors.howToRentDate}
                </p>
              )}
            </div>

            {/* Version */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Version
              </label>
              <input
                type="text"
                name="howToRentVersion"
                value={howToRentVersion}
                onChange={(e) => setHowToRentVersion(e.target.value)}
                placeholder="e.g. March 2024"
                className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>

            {/* Info box */}
            <div className="p-4 rounded-lg bg-amber-50 border border-amber-300">
              <p className="text-sm text-amber-900 font-medium mb-2">
                How to Rent Guide Requirements
              </p>
              <p className="text-sm text-amber-800 mb-3">
                How to Rent guide must be served to all tenants before or at
                start of tenancy. Always serve the most current version. A new
                version requires re-serving to existing tenants.
              </p>
              <a
                href="https://www.gov.uk/government/publications/how-to-rent"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block text-sm font-medium text-amber-900 hover:text-amber-1000 underline"
              >
                Download current How to Rent guide ↗
              </a>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="p-4 rounded-lg bg-gray-50 border border-gray-200">
              <p className="text-sm text-gray-700">
                Guide has <strong>not</strong> been served
              </p>
            </div>
            <div className="p-4 rounded-lg bg-amber-50 border border-amber-300">
              <p className="text-sm text-amber-900 font-medium mb-2">
                How to Rent Guide Requirements
              </p>
              <p className="text-sm text-amber-800 mb-3">
                How to Rent guide must be served to all tenants before or at
                start of tenancy. Always serve the most current version.
              </p>
              <a
                href="https://www.gov.uk/government/publications/how-to-rent"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block text-sm font-medium text-amber-900 hover:text-amber-700 underline"
              >
                Download current How to Rent guide ↗
              </a>
            </div>
          </div>
        )}
      </div>

      {/* ────────────────────────────────────────────────────────────────────── */}
      {/* SECTION G: TENANCY AGREEMENT UPLOAD */}
      {/* ────────────────────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-6 pb-3 border-b border-gray-100">
          G — Tenancy Agreement
        </h2>

        <div className="space-y-4">
          <div className="p-4 rounded-lg bg-blue-50 border border-blue-200">
            <p className="text-sm text-blue-800 mb-1">
              Upload tenancy agreement (optional at creation)
            </p>
            <p className="text-xs text-blue-700">
              You can upload this later from the tenancy detail page
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Tenancy Agreement (optional)
            </label>
            <input
              type="file"
              name="tenancyAgreement"
              accept=".pdf,.doc,.docx"
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 cursor-pointer"
            />
            <p className="mt-1 text-xs text-gray-500">PDF, DOC, DOCX accepted</p>
          </div>
        </div>
      </div>

      {/* ────────────────────────────────────────────────────────────────────── */}
      {/* HIDDEN INPUTS FOR FORM SUBMISSION */}
      {/* ────────────────────────────────────────────────────────────────────── */}
      <input type="hidden" name="startDate" value={startDate ? startDate.toISOString().split('T')[0] : ""} />
      {endDate && <input type="hidden" name="endDate" value={endDate.toISOString().split('T')[0]} />}
      {howToRentDate && <input type="hidden" name="howToRentDate" value={howToRentDate.toISOString().split('T')[0]} />}

      {/* ────────────────────────────────────────────────────────────────────── */}
      {/* RRA INFORMATION SHEET NOTICE (pre-May 2026 tenancies only) */}
      {/* ────────────────────────────────────────────────────────────────────── */}
      {startDate && startDate < new Date("2026-05-01") && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
            </svg>
            <div>
              <p className="text-sm font-semibold text-amber-800">RRA Information Sheet required after saving</p>
              <p className="text-sm text-amber-700 mt-1">
                As this tenancy started before 1 May 2026, the official RRA Information Sheet must be served to every
                named tenant as a PDF attachment (sending a link is not valid). You can record this from the tenancy
                detail page once the tenancy is created.
              </p>
              <a
                href="https://www.gov.uk/government/publications/renters-rights-act-information-for-tenants"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block mt-2 text-sm font-medium text-amber-700 hover:text-amber-900 underline"
              >
                Download official RRA Information Sheet from GOV.UK ↗
              </a>
            </div>
          </div>
        </div>
      )}

      {/* SUBMIT BUTTONS */}
      {/* ────────────────────────────────────────────────────────────────────── */}
      <div className="flex gap-3">
        <button
          type="submit"
          disabled={isSubmitDisabled}
          className="px-6 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition"
        >
          {isSubmitting ? "Creating..." : mode === "edit" ? "Save Changes" : "Create Tenancy"}
        </button>
        <button
          type="button"
          onClick={() => window.history.back()}
          className="px-6 py-2.5 bg-gray-200 text-gray-900 text-sm font-medium rounded-lg hover:bg-gray-300 transition"
        >
          Cancel
        </button>
      </div>
    </Form>
  );
}

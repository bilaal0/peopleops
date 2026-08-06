// components/properties/PropertyForm.jsx
// Shared form component for adding and editing properties.
// Usage:
//   <PropertyForm landlords={landlords} errors={errors} values={property} isEdit={false} />

import { useState } from "react";
import { Form, Link } from "react-router-dom";
import { Field, Input, UKAddressFields } from "../ui/FormFields.jsx";
import UKDateInput from "../ui/UKDateInput.jsx";
import DragDropImageUpload from "../ui/DragDropImageUpload.jsx";
import { lookupPostcode } from "../../utils/address-lookup.js";

const PROPERTY_TYPES = [
  { value: "flat",           label: "Flat / Apartment" },
  { value: "terraced",       label: "Terraced House" },
  { value: "semi_detached",  label: "Semi-Detached House" },
  { value: "detached",       label: "Detached House" },
  { value: "bungalow",       label: "Bungalow" },
  { value: "maisonette",     label: "Maisonette" },
  { value: "studio",         label: "Studio" },
  { value: "hmo",            label: "HMO (House in Multiple Occupation)" },
  { value: "other",          label: "Other" },
];

const COUNTRIES = ["England", "Wales", "Scotland", "Northern Ireland"];

const EPC_RATINGS = ["A", "B", "C", "D", "E", "F", "G"];

const COUNCIL_TAX_BANDS = ["A", "B", "C", "D", "E", "F", "G", "H"];

const FURNISHED_OPTIONS = [
  { value: "",                label: "Not specified" },
  { value: "furnished",       label: "Furnished" },
  { value: "unfurnished",     label: "Unfurnished" },
  { value: "part_furnished",  label: "Part Furnished" },
];

const STATUS_OPTIONS = [
  { value: "available",    label: "Available",    cls: "bg-green-100 text-green-700" },
  { value: "under_offer",  label: "Under Offer",  cls: "bg-blue-100 text-blue-700" },
  { value: "let",          label: "Let",           cls: "bg-indigo-100 text-indigo-700" },
  { value: "maintenance",  label: "Maintenance",  cls: "bg-amber-100 text-amber-700" },
  { value: "withdrawn",    label: "Withdrawn",    cls: "bg-gray-100 text-gray-600" },
];

// ── Reusable section wrapper ──────────────────────────────────────────────
function Section({ title, subtitle, icon, children }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200/90 p-5 shadow-2xs">
      <div className="flex items-center gap-2.5 mb-4 pb-2.5 border-b border-slate-100">
        {icon && <span className="text-base">{icon}</span>}
        <div>
          <h2 className="text-sm font-bold text-slate-900">{title}</h2>
          {subtitle && <p className="text-[11px] text-slate-400 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}


// ── Select helper ─────────────────────────────────────────────────────────
function Select({ name, options, defaultValue, error, placeholder, ...rest }) {
  return (
    <select
      name={name}
      defaultValue={defaultValue ?? ""}
      className={`w-full rounded-lg border px-3 py-1.5 text-xs sm:text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-white transition ${error ? "border-red-300 bg-red-50/50 text-red-900" : "border-slate-300 text-slate-900"}`}
      {...rest}
    >
      {placeholder && <option value="">{placeholder}</option>}
      {options.map(o =>
        typeof o === "string"
          ? <option key={o} value={o}>{o}</option>
          : <option key={o.value} value={o.value}>{o.label}</option>
      )}
    </select>
  );
}

// ── Main component ────────────────────────────────────────────────────────
export default function PropertyForm({
  landlords = [],
  errors = {},
  values = {},
  amlWarning = null,
  isEdit = false,
  isSubmitting = false,
  cancelUrl = "/properties",
  preselectedLandlordId = null,
}) {
  const d = (field) => values[field] ?? "";

  const [propertyType, setPropertyType] = useState(d("propertyType") || "flat");
  const [epcRating, setEpcRating] = useState(d("epcRating") || "");
  const [epcExemption, setEpcExemption] = useState(!!d("epcExemption"));
  const [selectiveLicenceRequired, setSelectiveLicenceRequired] = useState(!!d("selectiveLicenceRequired"));
  const [portalListed, setPortalListed] = useState(!!d("portalListed"));

  const isHmo = propertyType === "hmo";
  const isFG = epcRating === "F" || epcRating === "G";

  return (
    <Form method="post" encType="multipart/form-data" className="space-y-4 max-w-4xl mx-auto">

      {/* ── AML Amber Warning ──────────────────────────────────────────── */}
      {amlWarning && (
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-3">
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
            <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-amber-800">AML check not completed for this landlord</p>
            <p className="text-sm text-amber-700 mt-0.5">
              You can add the property but cannot create a tenancy until AML is passed.
            </p>
            {amlWarning.profileId && (
              <Link
                to={`/landlords/${amlWarning.profileId}?tab=aml`}
                className="inline-flex items-center gap-1 mt-2 text-sm font-medium text-amber-700 hover:text-amber-900 underline"
              >
                Go to Landlord AML →
              </Link>
            )}
          </div>
        </div>
      )}

      {/* ── General Error ──────────────────────────────────────────── */}
      {errors.general && (
        <div className="p-4 rounded-lg bg-red-50 text-red-800 text-sm font-medium border border-red-200">
          {errors.general}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
           SECTION 1: LANDLORD
         ══════════════════════════════════════════════════════════════ */}
      <Section title="Landlord" subtitle="Who owns this property?" icon="👤">
        <Field label="Landlord" required error={errors.landlordId}>
          <Select
            name="landlordId"
            defaultValue={d("landlordId") || preselectedLandlordId || ""}
            error={errors.landlordId}
            placeholder="Select landlord..."
            options={landlords.map(l => ({
              value: l._id,
              label: `${l.title ? l.title + ' ' : ''}${l.firstName} ${l.lastName}${l.amlResult === "pass" ? " ✅" : l.amlResult ? ` (AML: ${l.amlResult})` : " ⚠️ No AML"}`,
            }))}
          />
        </Field>
      </Section>

      {/* ══════════════════════════════════════════════════════════════
           SECTION 2: ADDRESS
         ══════════════════════════════════════════════════════════════ */}
      <Section title="Property Address" icon="📍">
        <UKAddressFields
          values={values}
          errors={errors}
          showTitle={false}
          showUprn={true}
          requiredFields={{ addressLine1: true, city: true, postcode: true }}
        />
      </Section>


      {/* ══════════════════════════════════════════════════════════════
           SECTION 3: PROPERTY DETAILS
         ══════════════════════════════════════════════════════════════ */}
      <Section title="Property Details" icon="🏠">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Property Type" required error={errors.propertyType}>
            <select
              name="propertyType"
              value={propertyType}
              onChange={e => setPropertyType(e.target.value)}
              className={`w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 bg-white ${errors.propertyType ? "border-red-400 bg-red-50" : "border-gray-300"}`}
            >
              {PROPERTY_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Furnished">
            <Select name="furnished" defaultValue={d("furnished")} options={FURNISHED_OPTIONS} />
          </Field>
          <Field label="Bedrooms">
            <Input name="bedrooms" type="number" min="0" max="50" defaultValue={d("bedrooms")} placeholder="e.g. 3" />
          </Field>
          <Field label="Bathrooms">
            <Input name="bathrooms" type="number" min="0" max="20" defaultValue={d("bathrooms")} placeholder="e.g. 2" />
          </Field>
          <Field label="Floor Area (sq m)">
            <Input name="floorAreaSqm" type="number" min="0" defaultValue={d("floorAreaSqm")} placeholder="e.g. 85" />
          </Field>
          <Field label="Construction Year">
            <Input name="constructionYear" type="number" min="1600" max="2030" defaultValue={d("constructionYear")} placeholder="e.g. 1995" />
          </Field>
        </div>

        {/* ── HMO Fields ─────────────────────────────────────────────── */}
        {isHmo && (
          <div className="mt-5 pt-5 border-t border-gray-100 animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="flex items-center gap-2 mb-4">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-800">HMO</span>
              <p className="text-sm font-medium text-gray-700">House in Multiple Occupation — Additional Details</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Field label="HMO Licence No." required error={errors.hmoLicenceNo}>
                <Input name="hmoLicenceNo" defaultValue={d("hmoLicenceNo")} placeholder="Licence number" error={errors.hmoLicenceNo} />
              </Field>
              <Field label="Licence Expiry" error={errors.hmoLicenceExpiry}>
                <UKDateInput name="hmoLicenceExpiry" defaultValue={d("hmoLicenceExpiry") ? new Date(d("hmoLicenceExpiry")).toISOString().split("T")[0] : ""} />
              </Field>
              <Field label="Max Occupants">
                <Input name="hmoMaxOccupants" type="number" min="1" max="100" defaultValue={d("hmoMaxOccupants")} placeholder="e.g. 6" />
              </Field>
            </div>
          </div>
        )}
      </Section>

      {/* ══════════════════════════════════════════════════════════════
           SECTION 4: EPC & ENERGY COMPLIANCE
         ══════════════════════════════════════════════════════════════ */}
      <Section title="EPC & Energy Compliance" subtitle="MEES 2018 regulations" icon="⚡">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="EPC Rating" error={errors.epcRating}>
            <select
              name="epcRating"
              value={epcRating}
              onChange={e => setEpcRating(e.target.value)}
              className={`w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 bg-white ${errors.epcRating ? "border-red-400 bg-red-50" : "border-gray-300"}`}
            >
              <option value="">Not recorded</option>
              {EPC_RATINGS.map(r => (
                <option key={r} value={r}>
                  {r}{r === "F" || r === "G" ? " ⚠️ Non-compliant" : ""}
                </option>
              ))}
            </select>
          </Field>
          <Field label="EPC Expiry Date" error={errors.epcExpiryDate}>
            <UKDateInput name="epcExpiryDate" defaultValue={d("epcExpiryDate") ? new Date(d("epcExpiryDate")).toISOString().split("T")[0] : ""} />
          </Field>
        </div>

        {/* F/G Warning */}
        {isFG && !epcExemption && (
          <div className="mt-4 p-4 rounded-xl bg-red-50 border border-red-200 flex items-start gap-3 animate-in fade-in slide-in-from-top-2 duration-300">
            <svg className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
            <div>
              <p className="text-sm font-semibold text-red-800">MEES Non-Compliant</p>
              <p className="text-sm text-red-700 mt-0.5">
                Properties rated F or G cannot be legally let without a registered MEES exemption.
                You can still save this property, but a tenancy cannot be created until an exemption is registered.
              </p>
            </div>
          </div>
        )}

        {/* EPC Exemption */}
        {isFG && (
          <div className="mt-4 pt-4 border-t border-gray-100 animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="flex items-center gap-3 mb-3">
              <input
                type="checkbox"
                id="epcExemption"
                checked={epcExemption}
                onChange={e => setEpcExemption(e.target.checked)}
                className="h-4 w-4 text-indigo-600 rounded border-gray-300"
              />
              <input type="hidden" name="epcExemption" value={epcExemption ? "true" : "false"} />
              <label htmlFor="epcExemption" className="text-sm font-medium text-gray-700">
                MEES Exemption registered
                <span className="block text-xs font-normal text-gray-400">Exemption registered on PRS Exemptions Register</span>
              </label>
            </div>
            {epcExemption && (
              <Field label="Exemption Reason" required error={errors.epcExemptionReason}>
                <textarea
                  name="epcExemptionReason"
                  rows={2}
                  defaultValue={d("epcExemptionReason")}
                  placeholder='e.g. "Listed building", "All improvements made"'
                  className={`w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 ${errors.epcExemptionReason ? "border-red-400 bg-red-50" : "border-gray-300"}`}
                />
              </Field>
            )}
          </div>
        )}
      </Section>

      {/* ══════════════════════════════════════════════════════════════
           SECTION 5: SELECTIVE LICENSING
         ══════════════════════════════════════════════════════════════ */}
      <Section title="Selective Licensing" subtitle="Local council requirements" icon="📋">
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="selectiveLicenceRequired"
            checked={selectiveLicenceRequired}
            onChange={e => setSelectiveLicenceRequired(e.target.checked)}
            className="h-4 w-4 text-indigo-600 rounded border-gray-300"
          />
          <input type="hidden" name="selectiveLicenceRequired" value={selectiveLicenceRequired ? "true" : "false"} />
          <label htmlFor="selectiveLicenceRequired" className="text-sm font-medium text-gray-700">
            Selective licence required for this property
            <span className="block text-xs font-normal text-gray-400">Check with your local council if this area requires selective licensing</span>
          </label>
        </div>
        {selectiveLicenceRequired && (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-2 duration-300">
            <Field label="Licence Number" required error={errors.selectiveLicenceNo}>
              <Input name="selectiveLicenceNo" defaultValue={d("selectiveLicenceNo")} placeholder="Licence number" error={errors.selectiveLicenceNo} />
            </Field>
            <Field label="Licence Expiry" error={errors.selectiveLicenceExpiry}>
              <UKDateInput name="selectiveLicenceExpiry" defaultValue={d("selectiveLicenceExpiry") ? new Date(d("selectiveLicenceExpiry")).toISOString().split("T")[0] : ""} />
            </Field>
          </div>
        )}
      </Section>

      {/* ══════════════════════════════════════════════════════════════
           SECTION 6: LOCAL AUTHORITY & COUNCIL
         ══════════════════════════════════════════════════════════════ */}
      <Section title="Local Authority" icon="🏛️">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Local Authority">
            <Input name="localAuthority" defaultValue={d("localAuthority")} placeholder="e.g. Tower Hamlets" />
          </Field>
          <Field label="Council Tax Band">
            <Select name="councilTaxBand" defaultValue={d("councilTaxBand")} placeholder="Not recorded" options={COUNCIL_TAX_BANDS} />
          </Field>
        </div>
      </Section>

      {/* ══════════════════════════════════════════════════════════════
           SECTION 7: PORTAL & MARKETING
         ══════════════════════════════════════════════════════════════ */}
      <Section title="Portal & Marketing" subtitle="RRA 2026: Rent bidding compliance" icon="📢">
        <div className="flex items-center gap-3 mb-4">
          <input
            type="checkbox"
            id="portalListed"
            checked={portalListed}
            onChange={e => setPortalListed(e.target.checked)}
            className="h-4 w-4 text-indigo-600 rounded border-gray-300"
          />
          <input type="hidden" name="portalListed" value={portalListed ? "true" : "false"} />
          <label htmlFor="portalListed" className="text-sm font-medium text-gray-700">
            Currently listed on portals
            <span className="block text-xs font-normal text-gray-400">Rightmove, Zoopla, OnTheMarket, etc.</span>
          </label>
        </div>
        {portalListed && (
          <div className="animate-in fade-in slide-in-from-top-2 duration-300">
            <Field label="Advertised Rent (£ pcm)" error={errors.advertisedRent}>
              <Input name="advertisedRent" type="number" min="0" step="0.01" defaultValue={d("advertisedRent")} placeholder="e.g. 1200" error={errors.advertisedRent} />
            </Field>
            <p className="mt-1.5 text-xs text-gray-400">
              RRA 2026: It is illegal to accept rent above the advertised amount. This field enables that compliance check.
            </p>
          </div>
        )}
      </Section>

      {/* ══════════════════════════════════════════════════════════════
           SECTION 8: STATUS & NOTES (edit only shows status)
         ══════════════════════════════════════════════════════════════ */}
      <Section title="Status & Notes" icon="📝">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {isEdit && (
            <Field label="Status" error={errors.status}>
              <Select 
                name="status" 
                defaultValue={d("status") || "available"} 
                error={errors.status}
                options={STATUS_OPTIONS}
              />
            </Field>
          )}
          {!isEdit && (
            <div className="md:col-span-2">
              <Field label="Initial Internal Note">
                <textarea
                  name="notes"
                  rows={3}
                  defaultValue={d("notes")}
                  placeholder="Optional note to attach to this property upon creation..."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 bg-white"
                />
              </Field>
            </div>
          )}
        </div>
      </Section>

      {/* ══════════════════════════════════════════════════════════════
           SECTION 9: PROPERTY IMAGES
         ══════════════════════════════════════════════════════════════ */}
      <Section title="Property Images" subtitle="One main image + additional photos" icon="📷">
        <div className="space-y-4">
          <Field label="Main Image" error={errors.mainImage}>
            <DragDropImageUpload
              name="mainImage"
              multiple={false}
              maxSizeMB={5}
              maxFiles={1}
            />
          </Field>
          <Field label="Additional Images" error={errors.additionalImages}>
            <DragDropImageUpload
              name="additionalImages"
              multiple={true}
              maxSizeMB={5}
              maxFiles={10}
            />
          </Field>
        </div>
      </Section>

      {/* ── Actions ────────────────────────────────────────────────── */}
      <div className="flex justify-end gap-3 pb-8">
        <Link
          to={cancelUrl}
          className="px-5 py-2.5 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
        >
          Cancel
        </Link>
        <button
          type="submit"
          disabled={isSubmitting}
          className="px-6 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition shadow-sm"
        >
          {isSubmitting
            ? "Saving…"
            : isEdit
              ? "Save Changes"
              : "Add Property"
          }
        </button>
      </div>
    </Form>
  );
}

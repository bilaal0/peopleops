// routes/maintenance/contractors/new.jsx
// Add contractor form. All fields from spec Screen 5.

import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { redirect, useActionData } from "react-router";
import UKDateInput from "../../../components/ui/UKDateInput.jsx";
import { getUserFromRequest } from "../../../utils/auth.server.js";
import { connect } from "../../../config/db.server.js";
import { Contractor } from "../../../models/Contractor.server.js";
import { ShieldCheck, Wrench } from "lucide-react";
import UKAddressFields from "../../../components/ui/UKAddressFields.jsx";

export async function action({ request }) {
  const user = await getUserFromRequest(request);
  if (!user) return redirect("/login");
  if (!user.organizationId) return redirect("/dashboard");

  await connect();

  const fd = await request.formData();
  const get = key => fd.get(key)?.toString().trim() || null;
  const getBool = key => fd.get(key) === "on" || fd.get(key) === "true";
  const getNum = key => {
    const v = parseFloat(fd.get(key));
    return isNaN(v) ? null : v;
  };

  // Multi-select trades
  const trades = fd.getAll("trades").map(t => t.toString()).filter(Boolean);

  // Validation
  const name = get("name");
  if (!name) {
    return { error: "Contractor name is required." };
  }

  const insuranceExpiry = get("insuranceExpiryDate");

  const contractor = await Contractor.create({
    organizationId:     user.organizationId,
    name,
    contactName:  get("contactName"),
    email:        get("email"),
    phone:        get("phone"),
    address: {
      line1:    get("addressLine1"),
      city:     get("city"),
      postcode: get("postcode"),
    },
    trades,
    gasRegistered:              getBool("gasRegistered"),
    gasRegistrationNumber:      get("gasRegistrationNumber"),
    electricalRegistered:       getBool("electricalRegistered"),
    electricalRegistrationBody: get("electricalRegistrationBody"),
    hasInsurance:               getBool("hasInsurance"),
    insuranceExpiryDate:        insuranceExpiry ? new Date(insuranceExpiry) : null,
    publicLiabilityAmount:      getNum("publicLiabilityAmount"),
    isPreferred:                getBool("isPreferred"),
    notes:                      get("notes"),
    status:                     "active",
    createdBy:                  user.userId || user._id,
  });

  return redirect(`/maintenance/contractors/${contractor._id}`);
}

const TRADES = [
  { value: "plumbing",       label: "Plumbing" },
  { value: "electrical",     label: "Electrical" },
  { value: "gas",            label: "Gas" },
  { value: "heating",        label: "Heating" },
  { value: "roofing",        label: "Roofing" },
  { value: "structural",     label: "Structural" },
  { value: "damp_treatment", label: "Damp Treatment" },
  { value: "pest_control",   label: "Pest Control" },
  { value: "glazing",        label: "Glazing" },
  { value: "flooring",       label: "Flooring" },
  { value: "decorating",     label: "Decorating" },
  { value: "general_builder",label: "General Builder" },
  { value: "landscaping",    label: "Landscaping" },
  { value: "appliances",     label: "Appliances" },
  { value: "cleaning",       label: "Cleaning" },
  { value: "locksmith",      label: "Locksmith" },
  { value: "other",          label: "Other" },
];

function SectionCard({ title, children }) {
  return (
    <div className="bg-white border border-[#E2E8F0] rounded-xl p-6 shadow-sm space-y-4">
      <h2 className="text-xs font-bold text-[#1E293B] uppercase tracking-wider border-b border-[#F1F5F9] pb-3">
        {title}
      </h2>
      {children}
    </div>
  );
}

function Field({ label, required, hint, children }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-[#475569] mb-1.5">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {hint && <p className="text-[10px] text-[#94A3B8] mt-1">{hint}</p>}
    </div>
  );
}

const inputCls = "w-full text-xs border border-[#E2E8F0] rounded-lg px-3 py-2 text-[#1E293B] bg-white focus:outline-none focus:ring-2 focus:ring-[#2563EB]/30 focus:border-[#2563EB] transition placeholder-[#CBD5E1]";

export default function ContractorsNew() {
  const actionData = useActionData();
  const [gasRegistered, setGasRegistered] = useState(false);
  const [electricalRegistered, setElectricalRegistered] = useState(false);
  const [hasInsurance, setHasInsurance] = useState(false);

  return (
    <div className="space-y-6 max-w-3xl mx-auto p-4 md:p-6">
      {/* Header */}
      <div className="border-b border-[#E2E8F0] pb-5">
        <nav className="text-xs text-[#94A3B8] font-medium mb-1">
          <Link to="/maintenance" className="hover:text-[#2563EB]">Maintenance</Link>
          <span className="mx-2">›</span>
          <Link to="/maintenance/contractors" className="hover:text-[#2563EB]">Contractors</Link>
          <span className="mx-2">›</span>
          <span className="text-[#1E293B]">Add Contractor</span>
        </nav>
        <h1 className="text-xl font-bold tracking-tight text-[#1E293B] flex items-center gap-2">
          <Wrench className="w-5 h-5 text-[#94A3B8]" />
          Add Contractor
        </h1>
      </div>

      {actionData?.error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-xs font-semibold">
          {actionData.error}
        </div>
      )}

      <form method="post" className="space-y-5">
        {/* Contact Details */}
        <SectionCard title="Contact Details">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Company / Contractor Name" required>
              <input name="name" type="text" required className={inputCls} placeholder="e.g. Smith Plumbing Ltd" />
            </Field>
            <Field label="Contact Person" hint="Leave blank if individual">
              <input name="contactName" type="text" className={inputCls} placeholder="e.g. John Smith" />
            </Field>
            <Field label="Phone">
              <input name="phone" type="tel" className={inputCls} placeholder="07700 900000" />
            </Field>
            <Field label="Email">
              <input name="email" type="email" className={inputCls} placeholder="john@smithplumbing.co.uk" />
            </Field>
          </div>
          <div className="pt-3 border-t border-[#F1F5F9]">
            <UKAddressFields
              title="Address Details"
              requiredFields={{ addressLine1: false, city: false, postcode: false }}
            />
          </div>
        </SectionCard>


        {/* Trades */}
        <SectionCard title="Trades">
          <p className="text-[11px] text-[#94A3B8]">Select all trades this contractor covers.</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {TRADES.map(t => (
              <label key={t.value} className="flex items-center gap-2 cursor-pointer group">
                <input
                  type="checkbox"
                  name="trades"
                  value={t.value}
                  className="rounded border-[#E2E8F0] text-[#2563EB] focus:ring-[#2563EB]"
                />
                <span className="text-xs font-medium text-[#475569] group-hover:text-[#1E293B]">{t.label}</span>
              </label>
            ))}
          </div>
        </SectionCard>

        {/* Accreditation */}
        <SectionCard title="Accreditation">
          {/* Gas Safe */}
          <div className="space-y-3">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                name="gasRegistered"
                checked={gasRegistered}
                onChange={e => setGasRegistered(e.target.checked)}
                className="rounded border-[#E2E8F0] text-[#2563EB] focus:ring-[#2563EB]"
              />
              <span className="text-xs font-semibold text-[#1E293B] flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-orange-500" /> Gas Safe Registered
              </span>
            </label>
            {gasRegistered && (
              <div className="ml-7">
                <Field label="Gas Safe Registration Number">
                  <input name="gasRegistrationNumber" type="text" className={inputCls} placeholder="e.g. 123456" />
                </Field>
              </div>
            )}

            {/* Electrical */}
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                name="electricalRegistered"
                checked={electricalRegistered}
                onChange={e => setElectricalRegistered(e.target.checked)}
                className="rounded border-[#E2E8F0] text-[#2563EB] focus:ring-[#2563EB]"
              />
              <span className="text-xs font-semibold text-[#1E293B] flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-blue-500" /> Electrical Registration (NICEIC / NAPIT)
              </span>
            </label>
            {electricalRegistered && (
              <div className="ml-7">
                <Field label="Registration Body">
                  <input name="electricalRegistrationBody" type="text" className={inputCls} placeholder="e.g. NICEIC" />
                </Field>
              </div>
            )}
          </div>
        </SectionCard>

        {/* Insurance */}
        <SectionCard title="Insurance">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              name="hasInsurance"
              checked={hasInsurance}
              onChange={e => setHasInsurance(e.target.checked)}
              className="rounded border-[#E2E8F0] text-[#2563EB] focus:ring-[#2563EB]"
            />
            <span className="text-xs font-semibold text-[#1E293B]">Has Public Liability Insurance</span>
          </label>
          {hasInsurance && (
            <div className="ml-7 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Insurance Expiry Date">
                <UKDateInput name="insuranceExpiryDate" className={inputCls} />
              </Field>
              <Field label="Cover Amount (£)">
                <input name="publicLiabilityAmount" type="number" min="0" step="100000" className={inputCls} placeholder="e.g. 1000000" />
              </Field>
            </div>
          )}
        </SectionCard>

        {/* Preferences */}
        <SectionCard title="Preferences">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              name="isPreferred"
              className="rounded border-[#E2E8F0] text-[#2563EB] focus:ring-[#2563EB]"
            />
            <span className="text-xs font-semibold text-[#1E293B]">Mark as preferred contractor</span>
          </label>
          <Field label="Notes" hint="Internal notes about this contractor">
            <textarea
              name="notes"
              rows={3}
              className={inputCls}
              placeholder="e.g. Good for emergency call-outs, 24hr response"
            />
          </Field>
        </SectionCard>

        {/* Actions */}
        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            className="px-6 py-2.5 bg-slate-900 hover:bg-black text-white rounded-lg text-xs font-bold shadow-sm transition"
          >
            Add Contractor
          </button>
          <Link
            to="/maintenance/contractors"
            className="px-4 py-2.5 text-xs font-semibold text-[#475569] hover:text-[#1E293B] transition"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}

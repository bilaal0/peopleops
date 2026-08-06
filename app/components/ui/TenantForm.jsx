import { useState } from "react";
import { Form, Link, useNavigation } from "react-router-dom";
import { Field, Input, UKAddressFields } from "./FormFields.jsx";
import UKDateInput from "./UKDateInput.jsx";
import { lookupPostcode } from "../../utils/address-lookup.js";

export default function TenantForm({ values = {}, errors = {}, cancelLink = "/tenants", isEdit = false }) {
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const [rightToRentChecked, setRightToRentChecked] = useState(values.rightToRentChecked === "true" || false);
  const [rtrDocType, setRtrDocType] = useState(values.rightToRentDocType || "");
  const [hasGuarantor, setHasGuarantor] = useState(values.hasGuarantor === "true" || false);
  const [hasPets, setHasPets] = useState(values.hasPets === "true" || false);
  const [isSmoker, setIsSmoker] = useState(values.isSmoker === "true" || false);

  const [isLookingUp, setIsLookingUp] = useState(false);
  const [isGLookingUp, setIsGLookingUp] = useState(false);

  const handleLookup = async (prefix = "") => {
    const pcName = prefix ? `${prefix}postcode` : "postcode";
    const pc = document.querySelector(`input[name="${pcName}"]`)?.value;
    if (!pc) return;
    
    prefix ? setIsGLookingUp(true) : setIsLookingUp(true);
    const res = await lookupPostcode(pc);
    prefix ? setIsGLookingUp(false) : setIsLookingUp(false);
    
    if (res) {
      const cityEl = document.querySelector(`input[name="${prefix ? prefix + 'city' : 'postTown'}"]`);
      if (cityEl) cityEl.value = res.city;
      
      if (!prefix) {
        const addr3El = document.querySelector('input[name="addressLine3"]');
        if (addr3El && res.county) addr3El.value = res.county;
      }
    } else {
      alert("Postcode not found or invalid.");
    }
  };

  return (
    <Form method="post" className="space-y-4 max-w-4xl mx-auto" encType="multipart/form-data">
        
      {/* Personal Details */}
      <div className="bg-white rounded-xl border border-slate-200/90 p-5 shadow-2xs">
        <h2 className="text-sm font-bold text-slate-900 mb-3.5 pb-2 border-b border-slate-100 flex items-center gap-1.5">
          <span className="text-indigo-600">👤</span> Personal Details
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <Field label="Title" error={errors.title}>
            <select name="title" defaultValue={values.title} className={`w-full rounded-lg border px-3 py-1.5 text-xs sm:text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-white text-slate-900 transition ${errors.title ? "border-red-300 bg-red-50/50" : "border-slate-300"}`}>
              <option value="">Select Title</option>
              {["Mr", "Mrs", "Miss", "Ms", "Dr", "Prof", "Sir", "Other"].map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="First Name" required error={errors.firstName}><Input name="firstName" defaultValue={values.firstName} error={errors.firstName} /></Field>
          <Field label="Last Name" required error={errors.lastName}><Input name="lastName" defaultValue={values.lastName} error={errors.lastName} /></Field>
          <Field label="Date of Birth"><UKDateInput name="dob" defaultValue={values.dob} /></Field>
          <Field label="Email" error={errors.email}><Input type="email" name="email" defaultValue={values.email} /></Field>
          <Field label="Phone Number" error={errors.phone}><Input name="phone" defaultValue={values.phone} /></Field>
        </div>
      </div>

      {/* Current Address */}
      <div className="bg-white rounded-xl border border-slate-200/90 p-5 shadow-2xs">
        <UKAddressFields
          values={values}
          errors={errors}
          title="Current Address"
          requiredFields={{ addressLine1: false, city: false, postcode: false }}
        />
      </div>

      {/* Right to Rent */}
      <div className="bg-white rounded-xl border border-slate-200/90 p-5 shadow-2xs">
        <div className="flex items-center justify-between mb-3.5 pb-2 border-b border-slate-100">
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-1.5"><span className="text-indigo-600">🛡️</span> Right to Rent</h2>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="rightToRentChecked"
              checked={rightToRentChecked}
              onChange={e => setRightToRentChecked(e.target.checked)}
              className="h-4 w-4 text-indigo-600 rounded border-slate-300"
            />
            <input type="hidden" name="rightToRentChecked" value={rightToRentChecked ? "true" : "false"} />
            <label htmlFor="rightToRentChecked" className="text-xs font-semibold text-slate-700">Check completed</label>
          </div>
        </div>

        <div className="p-3 bg-amber-50 rounded-lg mb-3.5 border border-amber-200 text-xs text-amber-800">
          <strong>Right to Rent checks are a legal requirement.</strong> Checks must be completed before the tenancy begins.
        </div>


        {rightToRentChecked && (
          <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Check Date *" error={errors.rightToRentCheckDate}>
                <UKDateInput name="rightToRentCheckDate" defaultValue={values.rightToRentCheckDate} />
              </Field>
              <Field label="RTR Document Type *" error={errors.rightToRentDocType}>
                <select 
                  name="rightToRentDocType" 
                  value={rtrDocType} 
                  onChange={(e) => setRtrDocType(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 bg-white"
                >
                  <option value="">Select document type...</option>
                  <option value="uk_passport">UK Passport</option>
                  <option value="eu_settled">EU Settled Status</option>
                  <option value="eu_pre_settled">EU Pre-Settled Status</option>
                  <option value="biometric_residence_permit">Biometric Residence Permit (BRP)</option>
                  <option value="visa">Visa</option>
                  <option value="certificate_of_naturalisation">Certificate of Naturalisation</option>
                  <option value="other_uk_right">Other UK Right</option>
                </select>
              </Field>
              <Field label={['eu_pre_settled', 'biometric_residence_permit', 'visa'].includes(rtrDocType) ? "Document Expiry Date *" : "Document Expiry Date (if time-limited)"} error={errors.rightToRentExpiry}>
                <UKDateInput 
                  name="rightToRentExpiry" 
                  defaultValue={values.rightToRentExpiry}
                />
              </Field>
              {['eu_settled', 'eu_pre_settled'].includes(rtrDocType) && (
                <div className="space-y-1 md:col-span-2">
                  <Field label="Gov.uk Share Code">
                    <Input name="rightToRentShareCode" defaultValue={values.rightToRentShareCode} placeholder="e.g. ABC1234567" />
                  </Field>
                  <a href="https://www.gov.uk/view-right-to-rent" target="_blank" rel="noreferrer" className="text-sm text-indigo-600 hover:text-indigo-800 font-medium inline-block mt-1">
                    Check at gov.uk/view-right-to-rent ↗
                  </a>
                </div>
              )}
            </div>
            
            <Field label="Upload Right to Rent Document" error={errors.rtrDoc}>
              <input
                type="file"
                name="rtrDoc"
                accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
                className={`block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 border p-1.5 focus:ring-2 focus:ring-indigo-500 cursor-pointer ${errors.rtrDoc ? "border-red-400 bg-red-50" : "border-gray-300 rounded-lg"}`}
              />
            </Field>

            <Field label="Notes">
              <textarea name="rightToRentNotes" rows={2} defaultValue={values.rightToRentNotes} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500" />
            </Field>
          </div>
        )}
      </div>

      {/* Employment & Referencing */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4 pb-3 border-b border-gray-100">Employment & Referencing</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Employment Status">
            <select name="employmentStatus" defaultValue={values.employmentStatus || ""} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 bg-white">
              <option value="">Select…</option>
              <option value="employed">Employed</option>
              <option value="self_employed">Self-Employed</option>
              <option value="retired">Retired</option>
              <option value="student">Student</option>
              <option value="unemployed">Unemployed</option>
              <option value="other">Other</option>
            </select>
          </Field>
          <Field label="Annual Income (£)">
            <div>
              <Input type="number" name="annualIncome" defaultValue={values.annualIncome} placeholder="e.g. 30000" />
              <p className="text-xs text-gray-500 mt-1">Standard requirement: 30x monthly rent</p>
            </div>
          </Field>
          <Field label="Employer Name">
            <Input name="employerName" defaultValue={values.employerName} />
          </Field>
          <Field label="Employer Phone">
            <Input name="employerPhone" defaultValue={values.employerPhone} />
          </Field>
        </div>
        
        <div className="mt-6 pt-6 border-t border-gray-100 grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Referencing Provider">
            <Input name="referencingProvider" defaultValue={values.referencingProvider} placeholder="e.g. Goodlord, Let Alliance" />
          </Field>
          <Field label="Referencing Status">
            <select name="referencingStatus" defaultValue={values.referencingStatus || ""} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 bg-white">
              <option value="">Pending / Not Started</option>
              <option value="passed">✅ Passed</option>
              <option value="failed">❌ Failed</option>
            </select>
          </Field>
          <Field label="Referencing Date">
            <UKDateInput name="referencingDate" defaultValue={values.referencingDate} />
          </Field>
          <div className="md:col-span-2">
            <Field label="Referencing Notes">
              <textarea name="referencingNotes" rows={2} defaultValue={values.referencingNotes} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500" />
            </Field>
          </div>
        </div>
      </div>

      {/* Requirements & Lifestyle */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4 pb-3 border-b border-gray-100">Requirements & Lifestyle</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <label className="flex items-center gap-3">
              <input type="checkbox" checked={hasPets} onChange={e => setHasPets(e.target.checked)} className="h-4 w-4 text-indigo-600 rounded border-gray-300" />
              <input type="hidden" name="hasPets" value={hasPets ? "true" : "false"} />
              <span className="text-sm font-medium text-gray-700">Has Pets</span>
            </label>
            {hasPets && (
              <div className="pl-7 animate-in fade-in duration-300">
                <Input name="petDetails" defaultValue={values.petDetails} placeholder="e.g. 1 cat, 1 dog (labrador)" />
              </div>
            )}
          </div>

          <div className="space-y-4">
            <label className="flex items-center gap-3">
              <input 
                type="checkbox" 
                checked={isSmoker} 
                onChange={(e) => setIsSmoker(e.target.checked)} 
                className="h-4 w-4 text-indigo-600 rounded border-gray-300" 
              />
              <input type="hidden" name="isSmoker" value={isSmoker ? "true" : "false"} />
              <span className="text-sm font-medium text-gray-700">Smoker</span>
            </label>
          </div>

          <Field label="Expected Occupants">
            <div>
              <select name="numberOfOccupants" defaultValue={values.numberOfOccupants || "1"} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 bg-white">
                {[1,2,3,4,5,6,7,8].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
              <p className="text-xs text-gray-500 mt-1">Including this tenant</p>
            </div>
          </Field>
        </div>
      </div>

      {/* Emergency Contact */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4 pb-3 border-b border-gray-100">Emergency Contact</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Contact Name"><Input name="emergencyContactName" defaultValue={values.emergencyContactName} /></Field>
          <Field label="Phone Number"><Input name="emergencyContactPhone" defaultValue={values.emergencyContactPhone} /></Field>
          <Field label="Relationship (e.g. Parent, Sibling)"><Input name="emergencyContactRelationship" defaultValue={values.emergencyContactRelationship} /></Field>
        </div>
      </div>

      {/* Guarantor */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Guarantor</h2>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="hasGuarantor"
              checked={hasGuarantor}
              onChange={e => setHasGuarantor(e.target.checked)}
              className="h-4 w-4 text-indigo-600 rounded border-gray-300"
            />
            <input type="hidden" name="hasGuarantor" value={hasGuarantor ? "true" : "false"} />
            <label htmlFor="hasGuarantor" className="text-sm font-medium text-gray-700">Requires Guarantor</label>
          </div>
        </div>

        {hasGuarantor && (
          <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Guarantor Name"><Input name="guarantorName" defaultValue={values.guarantorName} /></Field>
              <Field label="Guarantor Email"><Input type="email" name="guarantorEmail" defaultValue={values.guarantorEmail} /></Field>
              <Field label="Guarantor Phone"><Input name="guarantorPhone" defaultValue={values.guarantorPhone} /></Field>
              <Field label="Relationship"><Input name="guarantorRelationship" defaultValue={values.guarantorRelationship} /></Field>
              
              {/* Guarantor DB Address */}
              <div className="md:col-span-2 mt-2">
                <UKAddressFields
                  prefix="g_"
                  values={values}
                  errors={errors}
                  title="Guarantor Address"
                  requiredFields={{ addressLine1: false, city: false, postcode: false }}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3 pb-8">
        <Link to={cancelLink} className="px-5 py-2.5 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition">
          Cancel
        </Link>
        <button type="submit" disabled={isSubmitting} className="px-5 py-2.5 rounded-lg bg-indigo-600 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 transition">
          {isSubmitting ? "Saving..." : isEdit ? "Save Tenant" : "Create Tenant"}
        </button>
      </div>

    </Form>
  );
}

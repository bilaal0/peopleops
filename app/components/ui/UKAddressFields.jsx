import { useState, useEffect } from "react";
import { lookupPostcode } from "../../utils/address-lookup.js";

/**
 * UKAddressFields Component
 * Standardized UK Address form section matching database schema structures.
 * Compact, decent, and responsive modern layout.
 */
export default function UKAddressFields({
  prefix = "",
  values = {},
  errors = {},
  title = "Address Details",
  showTitle = true,
  showUprn = false,
  showAddressLine2 = true,
  showAddressLine3 = true,
  showCounty = true,
  showCountry = true,
  showFormatBadge = false,
  defaultCity = "",
  requiredFields = { addressLine1: true, city: true, postcode: true },
  fieldNames = {}, // Custom field name overrides if needed
  className = "",
}) {
  // Map field names (allows custom name overrides per form if required)
  const names = {
    addressLine1: fieldNames.addressLine1 || `${prefix}addressLine1`,
    addressLine2: fieldNames.addressLine2 || `${prefix}addressLine2`,
    addressLine3: fieldNames.addressLine3 || `${prefix}addressLine3`,
    city: fieldNames.city || `${prefix}city`,
    postTown: fieldNames.postTown || `${prefix}postTown`,
    county: fieldNames.county || `${prefix}county`,
    postcode: fieldNames.postcode || `${prefix}postcode`,
    country: fieldNames.country || `${prefix}country`,
    uprn: fieldNames.uprn || `${prefix}uprn`,
  };

  // Helper to extract value from values object checking multiple common keys
  const getValue = (primaryKey, alternateKeys = []) => {
    if (values[names[primaryKey]] !== undefined && values[names[primaryKey]] !== null) {
      return values[names[primaryKey]];
    }
    if (values[primaryKey] !== undefined && values[primaryKey] !== null) {
      return values[primaryKey];
    }
    for (const key of alternateKeys) {
      if (values[key] !== undefined && values[key] !== null) {
        return values[key];
      }
    }
    return "";
  };

  // State for controlled/auto-populated form values
  const [addressLine1, setAddressLine1] = useState(getValue("addressLine1"));
  const [addressLine2, setAddressLine2] = useState(getValue("addressLine2"));
  const [addressLine3, setAddressLine3] = useState(getValue("addressLine3"));
  const [city, setCity] = useState(getValue("city", ["postTown"]) || defaultCity);
  const [county, setCounty] = useState(getValue("county"));
  const [postcode, setPostcode] = useState(getValue("postcode"));
  const [country, setCountry] = useState(getValue("country") || "England");
  const [uprn, setUprn] = useState(getValue("uprn"));

  const [isLookingUp, setIsLookingUp] = useState(false);
  const [lookupError, setLookupError] = useState("");

  // Sync state if values prop actually changes (e.g. async form load)
  useEffect(() => {
    const valPostcode = getValue("postcode");
    const valAddressLine1 = getValue("addressLine1");
    const valAddressLine2 = getValue("addressLine2");
    const valAddressLine3 = getValue("addressLine3");
    const valCity = getValue("city", ["postTown"]) || defaultCity;
    const valCounty = getValue("county");
    const valCountry = getValue("country") || "England";
    const valUprn = getValue("uprn");

    if (valPostcode) setPostcode(valPostcode);
    if (valAddressLine1) setAddressLine1(valAddressLine1);
    if (valAddressLine2) setAddressLine2(valAddressLine2);
    if (valAddressLine3) setAddressLine3(valAddressLine3);
    if (valCity) setCity(valCity);
    if (valCounty) setCounty(valCounty);
    if (valCountry) setCountry(valCountry);
    if (valUprn) setUprn(valUprn);
  }, [
    values[names.postcode],
    values[names.addressLine1],
    values[names.addressLine2],
    values[names.addressLine3],
    values[names.city],
    values[names.postTown],
    values[names.county],
    values[names.country],
    values[names.uprn],
    values.postcode,
    values.addressLine1,
    values.addressLine2,
    values.addressLine3,
    values.city,
    values.postTown,
    values.county,
    values.country,
    values.uprn,
    defaultCity
  ]);

  const handlePostcodeLookup = async () => {
    setLookupError("");
    if (!postcode || postcode.trim().length < 4) {
      setLookupError("Please enter a valid UK postcode.");
      return;
    }

    setIsLookingUp(true);
    try {
      const res = await lookupPostcode(postcode.trim());
      if (res) {
        setPostcode(res.postcode || postcode.trim().toUpperCase());
        if (res.city) setCity(res.city);
        if (res.county) setCounty(res.county);
        if (res.country) setCountry(res.country);
      } else {
        setLookupError("Postcode not found. Please enter details manually.");
      }
    } catch (err) {
      console.error("Postcode lookup failed:", err);
      setLookupError("Unable to lookup postcode. Please enter details manually.");
    } finally {
      setIsLookingUp(false);
    }
  };

  const getFieldError = (key) => errors[names[key]] || errors[key];

  return (
    <div className={`space-y-3.5 ${className}`}>
      {showTitle && title && (
        <div className="pb-2 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
            {title}
          </h3>
          {showFormatBadge && (
            <span className="text-[11px] text-slate-400 font-normal">UK Format</span>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5 items-start">
        {/* Address Line 1 */}
        <div className={showAddressLine2 || showAddressLine3 ? "sm:col-span-2 md:col-span-3" : ""}>
          <label className="block text-[11px] font-semibold text-slate-700 uppercase tracking-wider mb-1">
            {showAddressLine2 ? "Address Line 1" : "Address"} {requiredFields.addressLine1 && <span className="text-red-500">*</span>}
          </label>
          <input
            type="text"
            name={names.addressLine1}
            value={addressLine1}
            onChange={(e) => setAddressLine1(e.target.value)}
            placeholder="Building number & street"
            className={`w-full rounded-lg border px-3 py-1.5 text-xs sm:text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-white transition ${
              getFieldError("addressLine1") ? "border-red-300 bg-red-50/50 text-red-900" : "border-slate-300 text-slate-900"
            }`}
            required={requiredFields.addressLine1}
          />
          {getFieldError("addressLine1") && <p className="text-[11px] text-red-500 mt-1">{getFieldError("addressLine1")}</p>}
        </div>

        {/* Address Line 2 */}
        {showAddressLine2 && (
          <div className="sm:col-span-2 md:col-span-3">
            <label className="block text-[11px] font-semibold text-slate-700 uppercase tracking-wider mb-1">
              Address Line 2 <span className="text-slate-400 font-normal">(Optional)</span>
            </label>
            <input
              type="text"
              name={names.addressLine2}
              value={addressLine2}
              onChange={(e) => setAddressLine2(e.target.value)}
              placeholder="Flat, suite, unit, etc."
              className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs sm:text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-white text-slate-900 transition"
            />
          </div>
        )}

        {/* Address Line 3 */}
        {showAddressLine3 && (
          <div>
            <label className="block text-[11px] font-semibold text-slate-700 uppercase tracking-wider mb-1">
              Address Line 3 <span className="text-slate-400 font-normal">(Optional)</span>
            </label>
            <input
              type="text"
              name={names.addressLine3}
              value={addressLine3}
              onChange={(e) => setAddressLine3(e.target.value)}
              placeholder="Locality"
              className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs sm:text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-white text-slate-900 transition"
            />
          </div>
        )}

        {/* Town / City */}
        <div>
          <label className="block text-[11px] font-semibold text-slate-700 uppercase tracking-wider mb-1">
            Town / City {requiredFields.city && <span className="text-red-500">*</span>}
          </label>
          <input
            type="text"
            name={names.city}
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="e.g. London"
            className={`w-full rounded-lg border px-3 py-1.5 text-xs sm:text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-white transition ${
              getFieldError("city") || getFieldError("postTown") ? "border-red-300 bg-red-50/50 text-red-900" : "border-slate-300 text-slate-900"
            }`}
            required={requiredFields.city}
          />
          {names.postTown !== names.city && (
            <input type="hidden" name={names.postTown} value={city} />
          )}
          {(getFieldError("city") || getFieldError("postTown")) && (
            <p className="text-[11px] text-red-500 mt-1">{getFieldError("city") || getFieldError("postTown")}</p>
          )}
        </div>

        {/* Postcode */}
        <div>
          <label className="block text-[11px] font-semibold text-slate-700 uppercase tracking-wider mb-1">
            Postcode {requiredFields.postcode && <span className="text-red-500">*</span>}
          </label>
          <input
            type="text"
            name={names.postcode}
            value={postcode}
            onChange={(e) => setPostcode(e.target.value.toUpperCase())}
            placeholder="e.g. SW1A 1AA"
            className={`w-full rounded-lg border px-3 py-1.5 text-xs sm:text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-white uppercase font-medium transition ${
              getFieldError("postcode") ? "border-red-300 bg-red-50/50 text-red-900" : "border-slate-300 text-slate-900"
            }`}
            required={requiredFields.postcode}
          />
          {lookupError && <p className="text-[11px] text-amber-600 mt-1">{lookupError}</p>}
          {getFieldError("postcode") && <p className="text-[11px] text-red-500 mt-1">{getFieldError("postcode")}</p>}
        </div>

        {/* County */}
        {showCounty && (
          <div>
            <label className="block text-[11px] font-semibold text-slate-700 uppercase tracking-wider mb-1">
              County <span className="text-slate-400 font-normal">(Optional)</span>
            </label>
            <input
              type="text"
              name={names.county}
              value={county}
              onChange={(e) => setCounty(e.target.value)}
              placeholder="e.g. Greater London"
              className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs sm:text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-white text-slate-900 transition"
            />
          </div>
        )}

        {/* Country */}
        {showCountry && (
          <div>
            <label className="block text-[11px] font-semibold text-slate-700 uppercase tracking-wider mb-1">
              Country
            </label>
            <select
              name={names.country}
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs sm:text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-white text-slate-900 transition"
            >
              <option value="England">England</option>
              <option value="Wales">Wales</option>
              <option value="Scotland">Scotland</option>
              <option value="Northern Ireland">Northern Ireland</option>
              <option value="United Kingdom">United Kingdom</option>
            </select>
          </div>
        )}

        {/* UPRN */}
        {showUprn && (
          <div>
            <label className="block text-[11px] font-semibold text-slate-700 uppercase tracking-wider mb-1">
              UPRN <span className="text-slate-400 font-normal">(Optional)</span>
            </label>
            <input
              type="text"
              name={names.uprn}
              value={uprn}
              onChange={(e) => setUprn(e.target.value)}
              placeholder="e.g. 100023334444"
              className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs sm:text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-white text-slate-900 transition"
            />
          </div>
        )}
      </div>
    </div>
  );
}

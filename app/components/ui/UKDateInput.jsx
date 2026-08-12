// components/ui/UKDateInput.jsx
// A date input that uses Flatpickr in UK format (DD/MM/YYYY).
// Supports both controlled (onChange callback) and uncontrolled (form hidden input) modes.
//
// Uncontrolled (form submission):
//   <UKDateInput name="amlCheckedAt" defaultValue="2026-03-04" />
//   → sends ISO YYYY-MM-DD via hidden input with the given name
//
// Controlled (React state):
//   <UKDateInput name="gasExpiry" value={formData.gasExpiry} onChange={handleChange} />
//   → calls onChange with a synthetic-like event: { target: { name, value: "YYYY-MM-DD" } }
//
import { useEffect, useRef, useState, useCallback } from "react";

export default function UKDateInput({
  name,
  defaultValue = "",
  value,            // controlled mode
  onChange,          // controlled mode callback
  placeholder = "DD/MM/YYYY",
  className = "",
  required = false,
}) {
  const inputRef = useRef(null);
  const fpRef = useRef(null);
  const isControlled = onChange !== undefined;

  // For uncontrolled mode: track ISO value in state for the hidden input
  const [isoValue, setIsoValue] = useState(defaultValue || "");

  // Convert ISO YYYY-MM-DD → DD/MM/YYYY for display
  function isoToUK(iso) {
    if (!iso) return "";
    const cleanIso = String(iso).split("T")[0];
    const [y, m, d] = cleanIso.split("-");
    return d && m && y ? `${d}/${m}/${y}` : "";
  }

  // Convert DD/MM/YYYY → YYYY-MM-DD
  function ukToIso(uk) {
    if (!uk) return "";
    const parts = uk.split("/");
    if (parts.length !== 3) return "";
    const [d, m, y] = parts;
    if (!d || !m || !y || y.length !== 4) return "";
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  // Emit the ISO date value
  const emitValue = useCallback((isoDate) => {
    if (isControlled) {
      // Fire a synthetic onChange event for controlled forms
      onChange({ target: { name, value: isoDate } });
    } else {
      setIsoValue(isoDate);
    }
  }, [isControlled, onChange, name]);

  const handleDateChange = useCallback((selectedDates) => {
    let isoDate = "";
    if (selectedDates?.[0]) {
      const d = selectedDates[0];
      // Use local date parts — toISOString() is UTC and shifts the date back
      // by 1 day for timezones ahead of UTC (e.g. UTC+5).
      const yyyy = d.getFullYear();
      const mm   = String(d.getMonth() + 1).padStart(2, "0");
      const dd   = String(d.getDate()).padStart(2, "0");
      isoDate = `${yyyy}-${mm}-${dd}`;
    }
    emitValue(isoDate);
  }, [emitValue]);

  useEffect(() => {
    if (!inputRef.current) return;

    const initFlatpickr = () => {
      if (!window.flatpickr) return false;

      fpRef.current = window.flatpickr(inputRef.current, {
        dateFormat: "d/m/Y",
        allowInput: true,
        locale: { firstDayOfWeek: 1 },
        onChange: handleDateChange,
        onClose: handleDateChange,
      });

      // Set initial value
      const initial = isControlled ? value : defaultValue;
      if (initial) {
        fpRef.current.setDate(initial, false, "Y-m-d");
      }
      return true;
    };

    if (!initFlatpickr()) {
      const timer = setTimeout(initFlatpickr, 500);
      return () => clearTimeout(timer);
    }

    return () => fpRef.current?.destroy();
  }, []);

  // Sync controlled value changes to Flatpickr
  useEffect(() => {
    if (isControlled && fpRef.current && value !== undefined) {
      const currentFpDate = fpRef.current.selectedDates?.[0];
      const currentIso = currentFpDate ? currentFpDate.toISOString().split("T")[0] : "";
      if (value !== currentIso) {
        fpRef.current.setDate(value || null, false, "Y-m-d");
      }
    }
  }, [value, isControlled]);

  // Fallback: if user types manually without Flatpickr, parse on blur
  const handleBlur = () => {
    if (fpRef.current) return; // Flatpickr handles it
    const raw = inputRef.current?.value || "";
    if (raw.includes("/")) {
      emitValue(ukToIso(raw));
    } else if (raw.includes("-")) {
      emitValue(raw);
    }
  };

  return (
    <>
      {/* Visible input — DD/MM/YYYY */}
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        placeholder={placeholder}
        defaultValue={isControlled ? undefined : isoToUK(defaultValue)}
        required={required}
        onBlur={handleBlur}
        className={`w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 ${className}`}
      />
      {/* Hidden input — sends ISO date to server (uncontrolled mode only) */}
      {!isControlled && (
        <input
          type="hidden"
          name={name}
          value={isoValue}
        />
      )}
      {/* For controlled mode, the parent handles state; we still need a hidden input for form submission */}
      {isControlled && (
        <input
          type="hidden"
          name={name}
          value={value || ""}
        />
      )}
    </>
  );
}

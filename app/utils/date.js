// utils/date.js
// ─────────────────────────────────────────────────────────────────────────────
// Global UK date formatting helpers using date-fns.
// Import these wherever you need to display or handle dates in the app.
// UK format = DD/MM/YYYY  (e.g. 04/03/2026)
// ─────────────────────────────────────────────────────────────────────────────

import { format, parseISO, isValid, formatISO } from "date-fns";

/**
 * Format any date value to UK display format: 04/03/2026
 * Safe to call with null / undefined — returns "—" for missing dates.
 */
export function fmtDate(value) {
  if (!value) return "—";
  const d = typeof value === "string" ? parseISO(value) : new Date(value);
  return isValid(d) ? format(d, "dd/MM/yyyy") : "—";
}

/**
 * Format date with time: 04/03/2026 at 14:35
 */
export function fmtDateTime(value) {
  if (!value) return "—";
  const d = typeof value === "string" ? parseISO(value) : new Date(value);
  return isValid(d) ? format(d, "dd/MM/yyyy 'at' HH:mm") : "—";
}

/**
 * Convert a stored date to the ISO yyyy-MM-dd string that
 * <input type="date"> expects as its `defaultValue`.
 * Usage: <input type="date" defaultValue={toInputDate(landlord.amlCheckedAt)} />
 */
export function toInputDate(value) {
  if (!value) return "";
  const d = typeof value === "string" ? parseISO(value) : new Date(value);
  return isValid(d) ? format(d, "yyyy-MM-dd") : "";
}

/**
 * Convert an ISO yyyy-MM-dd string from a form submission to a JS Date.
 * Returns null if empty.
 */
export function fromInputDate(isoString) {
  if (!isoString) return null;
  const d = parseISO(isoString);
  return isValid(d) ? d : null;
}

// utils/csv-parser.server.js
// Handles normalisation and auto-reconciliation matching of bank statement CSVs.
// Supports Santander, Lloyds, Barclays, and HSBC.
//
// Rules (from Section 10):
// - Strict agency isolation in matching queries
// - Rounding to 2dp
// - Two-step flow

import Papa from "papaparse";
import { mongoose } from "../config/db.server.js";
import { RentPayment } from "../models/rentPayment.server.js";
import { User } from "../models/user.server.js";

const round2 = (n) => Math.round((n || 0) * 100) / 100;

// Auto-detect bank format based on header columns
export function detectBankFormat(headers) {
  const normalized = headers.map(h => h.trim().toLowerCase());
  
  if (normalized.includes("transaction date") && normalized.includes("credit amount")) {
    return "lloyds";
  }
  if (normalized.includes("subcategory") && normalized.includes("memo")) {
    return "barclays";
  }
  if (normalized.includes("date") && normalized.includes("type") && normalized.includes("amount") && normalized.includes("balance")) {
    return "hsbc";
  }
  // Santander normalisation check
  if (normalized.includes("date") && normalized.includes("description") && normalized.includes("amount") && normalized.includes("balance")) {
    return "santander";
  }
  
  return "generic";
}

function parseAmount(val) {
  if (typeof val === "number") return val;
  if (!val) return 0;
  // Remove currency symbols and commas, keep minus sign and decimal
  const clean = String(val).replace(/[^\d.-]/g, "");
  return parseFloat(clean) || 0;
}

// Normalise raw row objects into common interface:
// { date: Date, description: String, amount: Number, type: 'credit'|'debit' }
export function parseAndNormaliseCsv(csvText, bankType) {
  const parsed = Papa.parse(csvText, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: true
  });

  if (parsed.errors.length > 0 && parsed.data.length === 0) {
    throw new Error("Failed to parse CSV file: " + parsed.errors[0].message);
  }

  const headers = parsed.meta.fields || [];
  const detected = bankType || detectBankFormat(headers);
  console.log("CSV Parser - Detected Headers:", headers);
  console.log("CSV Parser - Detected Bank Format:", detected);

  const transactions = [];

  for (const row of parsed.data) {
    let date = null;
    let description = "";
    let amount = 0;

    if (detected === "santander") {
      date = row["Date"] ? parseCsvDate(row["Date"]) : null;
      description = String(row["Description"] || "").trim();
      amount = round2(parseAmount(row["Amount"]));
    } 
    else if (detected === "lloyds") {
      date = row["Transaction Date"] ? parseCsvDate(row["Transaction Date"]) : null;
      description = String(row["Transaction Description"] || "").trim();
      const credit = round2(parseAmount(row["Credit Amount"]));
      const debit = round2(parseAmount(row["Debit Amount"]));
      amount = credit > 0 ? credit : -debit;
    } 
    else if (detected === "barclays") {
      date = row["Date"] ? parseCsvDate(row["Date"]) : null;
      description = String(row["Memo"] || row["Subcategory"] || "").trim();
      amount = round2(parseAmount(row["Amount"]));
    } 
    else if (detected === "hsbc") {
      date = row["Date"] ? parseCsvDate(row["Date"]) : null;
      description = String(row["Description"] || "").trim();
      amount = round2(parseAmount(row["Amount"]));
    } 
    else {
      // Fallback/Generic
      const dateKey = headers.find(h => /date/i.test(h));
      const descKey = headers.find(h => /desc|memo|details|reference/i.test(h));
      const amountKey = headers.find(h => /amount|value/i.test(h));
      const creditKey = headers.find(h => /credit|paid in/i.test(h));
      const debitKey = headers.find(h => /debit|paid out/i.test(h));

      if (dateKey && row[dateKey]) date = parseCsvDate(row[dateKey]);
      if (descKey && row[descKey]) description = String(row[descKey]).trim();
      
      if (amountKey && row[amountKey] != null) {
        amount = round2(parseAmount(row[amountKey]));
      } else if (creditKey || debitKey) {
        const credit = creditKey ? round2(parseAmount(row[creditKey])) : 0;
        const debit = debitKey ? round2(parseAmount(row[debitKey])) : 0;
        amount = credit > 0 ? credit : -debit;
      }
    }

    if (date && amount !== 0) {
      transactions.push({
        date,
        description,
        amount,
        type: amount > 0 ? "credit" : "debit"
      });
    }
  }

  return { bank: detected, transactions };
}

// Helpers for date parsing
function parseCsvDate(val) {
  if (!val) return null;
  if (val instanceof Date) return val;

  const clean = String(val).trim();
  // Try DD/MM/YYYY
  const dmy = clean.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
  if (dmy) {
    return new Date(parseInt(dmy[3]), parseInt(dmy[2]) - 1, parseInt(dmy[1]));
  }
  // Try YYYY-MM-DD
  const ymd = clean.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})$/);
  if (ymd) {
    return new Date(parseInt(ymd[1]), parseInt(ymd[2]) - 1, parseInt(ymd[3]));
  }

  const parsed = new Date(clean);
  return isNaN(parsed.getTime()) ? null : parsed;
}

// Reconcile and suggest matches in DB
// Strictly isolates queries by agencyId
export async function suggestMatchesForTransactions(transactions, agencyId) {
  const suggestions = [];

  // Load active outstanding Rent Payments
  const outstandingRent = await RentPayment.find({
    agencyId,
    status: { $in: ["pending", "overdue", "due", "partial"] },
    deleted: false
  })
    .populate("tenancyId")
    .populate("propertyId", "addressLine1 city")
    .populate("landlordId", "title firstName lastName")
    .lean();

  for (let i = 0; i < transactions.length; i++) {
    const tx = transactions[i];
    const absAmount = Math.abs(tx.amount);
    let matchedId = null;
    let matchType = tx.type === "credit" ? "rent" : "expense";
    let matchScore = 0;
    let details = "";

    if (tx.type === "credit") {
      // 1. Suggest Rent Payment match
      // Exact or close match (+/- 10 pounds)
      const potential = outstandingRent.find(p => Math.abs(p.amountOutstanding - absAmount) <= 10);
      
      if (potential) {
        matchedId = potential._id.toString();
        matchScore = Math.abs(potential.amountOutstanding - absAmount) === 0 ? 90 : 60;
        details = `${potential.propertyId?.addressLine1} - ${potential.landlordId?.title ? potential.landlordId?.title + ' ' : ''}${potential.landlordId?.firstName} ${potential.landlordId?.lastName} (Due: £${potential.amountOutstanding})`;
      }
    } else {
      // 2. Suggest Payout or Expense
      // If description contains "landlord" or a landlord name, suggest payout
      const descLower = tx.description.toLowerCase();
      if (descLower.includes("landlord") || descLower.includes("disb") || descLower.includes("payout")) {
        matchType = "disbursement";
        details = "Disbursement payout to landlord";
        matchScore = 30;
      } else {
        matchType = "expense";
        details = "Agency Operating Expense";
        matchScore = 30;
      }
    }

    suggestions.push({
      index: i,
      date: tx.date.toISOString(),
      description: tx.description,
      amount: tx.amount,
      type: tx.type,
      suggestedMatch: {
        matchedId,
        matchType,
        matchScore,
        details
      }
    });
  }

  return suggestions;
}

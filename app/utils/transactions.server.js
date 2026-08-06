// utils/transactions.server.js
// Core financial calculation functions for the Rent Tracker and Transactions module.
//
// RULES (from Section 10):
// - Agency isolation: every query includes { agencyId }
// - Commission copied at creation time from RentPayment records — never from current property
// - All amounts in pounds to exactly 2dp: Math.round(x * 100) / 100
// - Disbursements are summaries; they never replace the underlying RentPayments
// - No negative disbursements — validated before creation

import { mongoose } from "../config/db.server.js";
import { RentPayment } from "../models/rentPayment.server.js";
import { Disbursement } from "../models/disbursement.server.js";
import { AgencyExpense } from "../models/agencyExpense.server.js";

const round2 = (n) => Math.round((n || 0) * 100) / 100;

// ─────────────────────────────────────────────────────────────────────────────
// calculateDisbursement
// ─────────────────────────────────────────────────────────────────────────────
// Preview how much to disburse to a landlord for a given period.
// Called BEFORE creating a Disbursement — returns a preview object.
//
// Key fix: excludes RentPayments already included in an existing Disbursement
// (pending or paid) so payments are never double-counted.
//
// Returns null if no eligible payments found.
// Returns { error: 'negative' } if netAmount would be <= 0 after deductions.

export async function calculateDisbursement(
  landlordId,
  agencyId,
  periodStart,
  periodEnd,
  manualDeductions = [] // [{ description, amount }]
) {
  // Step 1: Find all RentPayments already covered by an existing Disbursement
  // for this landlord in this agency — regardless of period.
  // This prevents double-counting if someone re-runs the calculation.
  const existingDisbursements = await Disbursement.find({
    agencyId: new mongoose.Types.ObjectId(agencyId),
    landlordId: new mongoose.Types.ObjectId(landlordId),
    deleted: false,
    status: { $in: ["pending", "paid"] },
  })
    .select("rentPaymentIds")
    .lean();

  const alreadyDisbursedIds = existingDisbursements.flatMap((d) =>
    d.rentPaymentIds.map((id) => id.toString())
  );

  // Step 2: Find all paid/partial RentPayments for this landlord in the period
  // that have NOT already been included in a disbursement
  const payments = await RentPayment.find({
    agencyId: new mongoose.Types.ObjectId(agencyId),
    landlordId: new mongoose.Types.ObjectId(landlordId),
    status: { $in: ["paid", "partial"] },
    periodStart: { $gte: new Date(periodStart), $lte: new Date(periodEnd) },
    deleted: false,
  })
    .populate("propertyId", "addressLine1 city")
    .populate("tenancyId", "_id")
    .lean();

  // Filter out payments already included in an existing disbursement
  const eligiblePayments = payments.filter(
    (p) => !alreadyDisbursedIds.includes(p._id.toString())
  );

  if (eligiblePayments.length === 0) return null;

  // Step 3: Sum amounts (commission was copied at payment creation time)
  const grossRent       = round2(eligiblePayments.reduce((s, p) => s + (p.amountPaid || 0), 0));
  const totalCommission = round2(eligiblePayments.reduce((s, p) => s + (p.commissionAmount || 0), 0));
  const totalVat        = round2(eligiblePayments.reduce((s, p) => s + (p.vatAmount || 0), 0));

  // Step 4: Apply manual deductions (e.g. plumber on landlord's behalf)
  const totalDeductions = round2(
    manualDeductions.reduce((s, d) => s + (parseFloat(d.amount) || 0), 0)
  );

  const netAmount = round2(grossRent - totalCommission - totalVat - totalDeductions);

  // Step 5: Validate — never create a negative disbursement
  if (netAmount <= 0) {
    return {
      error: "negative",
      message: `Net amount (£${netAmount}) would be zero or negative after deductions. Review deduction amounts.`,
      grossRent,
      totalCommission,
      totalVat,
      totalDeductions,
      netAmount,
    };
  }

  // Step 6: Build property ID list (unique)
  const propertyIds = [
    ...new Set(
      eligiblePayments
        .map((p) => p.propertyId?._id?.toString())
        .filter(Boolean)
    ),
  ].map((id) => new mongoose.Types.ObjectId(id));

  return {
    landlordId,
    agencyId,
    periodStart: new Date(periodStart),
    periodEnd:   new Date(periodEnd),
    grossRent,
    totalCommission,
    totalVat,
    totalDeductions,
    netAmount,
    deductions:      manualDeductions.map((d) => ({
      description: d.description,
      amount:      round2(parseFloat(d.amount) || 0),
    })),
    rentPaymentIds: eligiblePayments.map((p) => p._id),
    propertyIds,
    paymentCount: eligiblePayments.length,
    payments: eligiblePayments.map((p) => ({
      id:         p._id,
      property:   p.propertyId?.addressLine1 || "Unknown property",
      period:     p.periodStart,
      amountPaid: p.amountPaid,
      commission: p.commissionAmount,
      vat:        p.vatAmount,
      net:        p.netToLandlord,
      status:     p.status,
    })),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// getAgencyFinancialSummary
// ─────────────────────────────────────────────────────────────────────────────
// Agency-wide financial overview for a given month/year.
// Returns rent collected, commission earned, disbursements paid, expenses.
// Used by the /transactions overview screen.

export async function getAgencyFinancialSummary(agencyId, year, month) {
  const periodStart = new Date(year, month - 1, 1);
  const periodEnd   = new Date(year, month, 0, 23, 59, 59, 999);

  const agencyObjId = new mongoose.Types.ObjectId(agencyId);

  const [rentData, disbursementData, expenseData] = await Promise.all([
    // Rent collected this period (payments with periodStart in period)
    RentPayment.aggregate([
      {
        $match: {
          agencyId:    agencyObjId,
          status:      { $in: ["paid", "partial"] },
          deleted:     false,
          periodStart: { $gte: periodStart, $lte: periodEnd },
        },
      },
      {
        $group: {
          _id:             null,
          grossRent:       { $sum: "$amountPaid" },
          totalCommission: { $sum: { $ifNull: ["$commissionAmount", 0] } },
          totalVat:        { $sum: { $ifNull: ["$vatAmount", 0] } },
          netToLandlords:  { $sum: { $ifNull: ["$netToLandlord", 0] } },
          paymentCount:    { $sum: 1 },
        },
      },
    ]),

    // Disbursements marked as paid during this period (by paidDate)
    Disbursement.aggregate([
      {
        $match: {
          agencyId: agencyObjId,
          status:   "paid",
          deleted:  false,
          paidDate: { $gte: periodStart, $lte: periodEnd },
        },
      },
      {
        $group: {
          _id:   null,
          total: { $sum: "$netAmount" },
          count: { $sum: 1 },
        },
      },
    ]),

    // Expenses this period (by date)
    AgencyExpense.aggregate([
      {
        $match: {
          agencyId: agencyObjId,
          deleted:  false,
          date:     { $gte: periodStart, $lte: periodEnd },
        },
      },
      {
        $group: {
          _id:   "$category",
          total: { $sum: "$amount" },
          count: { $sum: 1 },
        },
      },
    ]),
  ]);

  const rent = rentData[0] || {
    grossRent: 0, totalCommission: 0, totalVat: 0,
    netToLandlords: 0, paymentCount: 0,
  };

  const totalExpenses = expenseData.reduce((s, e) => s + e.total, 0);

  return {
    period: { start: periodStart, end: periodEnd, year, month },
    rent: {
      grossRent:       round2(rent.grossRent),
      totalCommission: round2(rent.totalCommission),
      totalVat:        round2(rent.totalVat),
      netToLandlords:  round2(rent.netToLandlords),
      paymentCount:    rent.paymentCount,
    },
    disbursements: {
      totalPaid: round2(disbursementData[0]?.total || 0),
      count:     disbursementData[0]?.count || 0,
    },
    expenses: {
      total:      round2(totalExpenses),
      byCategory: expenseData.map((e) => ({
        category: e._id,
        total:    round2(e.total),
        count:    e.count,
      })),
    },
    // Agency net income = commission earned - expenses incurred
    // (VAT collected is a pass-through — excluded from net income)
    agencyNetIncome: round2(rent.totalCommission - totalExpenses),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// getLast6MonthsSummary
// ─────────────────────────────────────────────────────────────────────────────
// Returns financial summary for the last 6 months (including current).
// Uses a SINGLE aggregation pipeline instead of 6 × 3 = 18 separate queries.
// Used for the bar chart on the /transactions screen.

export async function getLast6MonthsSummary(agencyId) {
  const now = new Date();

  // Build the 6-month window
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
  const endOfThisMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  const agencyObjId = new mongoose.Types.ObjectId(agencyId);

  // Single aggregation: group rent payments by year+month
  const [rentRows, expenseRows] = await Promise.all([
    RentPayment.aggregate([
      {
        $match: {
          agencyId: agencyObjId,
          deleted: false,
          status: { $in: ["paid", "partial"] },
          periodStart: { $gte: sixMonthsAgo, $lte: endOfThisMonth },
        },
      },
      {
        $group: {
          _id: {
            year: { $year: "$periodStart" },
            month: { $month: "$periodStart" },
          },
          totalCommission: { $sum: { $ifNull: ["$commissionAmount", 0] } },
        },
      },
    ]),

    AgencyExpense.aggregate([
      {
        $match: {
          agencyId: agencyObjId,
          deleted: false,
          date: { $gte: sixMonthsAgo, $lte: endOfThisMonth },
        },
      },
      {
        $group: {
          _id: {
            year: { $year: "$date" },
            month: { $month: "$date" },
          },
          totalExpenses: { $sum: "$amount" },
        },
      },
    ]),
  ]);

  // Build a lookup map from the results
  const rentMap = {};
  rentRows.forEach(r => {
    rentMap[`${r._id.year}-${String(r._id.month).padStart(2, "0")}`] = r.totalCommission;
  });

  const expenseMap = {};
  expenseRows.forEach(r => {
    expenseMap[`${r._id.year}-${String(r._id.month).padStart(2, "0")}`] = r.totalExpenses;
  });

  // Build the 6-month output array in order
  const results = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const label = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const commission = round2(rentMap[label] || 0);
    const expenses = round2(expenseMap[label] || 0);
    results.push({
      label,
      commission,
      expenses,
      netIncome: round2(commission - expenses),
    });
  }

  return results;
}


// ─────────────────────────────────────────────────────────────────────────────
// getRentSummaryForMonth
// ─────────────────────────────────────────────────────────────────────────────
// Summary metrics for the /rent main tracker header strip.
// Returns expected, collected, outstanding, and total disbursed for the month.

export async function getRentSummaryForMonth(agencyId, year, month) {
  const periodStart = new Date(year, month - 1, 1);
  const periodEnd   = new Date(year, month, 0, 23, 59, 59, 999);
  const agencyObjId = new mongoose.Types.ObjectId(agencyId);

  const [rentAgg, disbursedAgg, arrearsCount] = await Promise.all([
    RentPayment.aggregate([
      {
        $match: {
          agencyId:    agencyObjId,
          deleted:     false,
          periodStart: { $gte: periodStart, $lte: periodEnd },
        },
      },
      {
        $group: {
          _id:         null,
          expected:    { $sum: "$amountDue" },
          collected:   { $sum: "$amountPaid" },
          outstanding: { $sum: { $ifNull: ["$amountOutstanding", 0] } },
          total:       { $sum: 1 },
        },
      },
    ]),

    Disbursement.aggregate([
      {
        $match: {
          agencyId:    agencyObjId,
          deleted:     false,
          status:      "paid",
          periodStart: { $gte: periodStart, $lte: periodEnd },
        },
      },
      { $group: { _id: null, total: { $sum: "$netAmount" } } },
    ]),

    RentPayment.countDocuments({
      agencyId:    agencyObjId,
      deleted:     false,
      status:      { $in: ["overdue", "partial"] },
      periodStart: { $gte: periodStart, $lte: periodEnd },
    }),
  ]);

  const r = rentAgg[0] || { expected: 0, collected: 0, outstanding: 0, total: 0 };

  return {
    expected:    round2(r.expected),
    collected:   round2(r.collected),
    outstanding: round2(r.outstanding),
    disbursed:   round2(disbursedAgg[0]?.total || 0),
    paymentCount: r.total,
    arrearsCount,
  };
}

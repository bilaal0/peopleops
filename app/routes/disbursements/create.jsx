// routes/disbursements/create.jsx
// POST action route to create a single landlord disbursement.
//
// Rules (from Section 10):
// - Agency isolation: verified on landlord and query
// - Deductions applied correctly
// - Net amount must be > 0 (no negative disbursements)
// - Landlord bank details snapshot copied at creation time

import { redirect } from "react-router";
import { getUserFromRequest } from "../../utils/auth.server.js";
import { connect } from "../../config/db.server.js";
import { User } from "../../models/user.server.js";
import { Disbursement } from "../../models/disbursement.server.js";
import { calculateDisbursement } from "../../utils/transactions.server.js";

export async function loader() {
  return redirect("/rent");
}

export async function action({ request }) {
  const user = await getUserFromRequest(request);
  if (!user) return redirect("/login");

  await connect();
  const agencyId = user.agencyId;
  const formData = await request.formData();

  const landlordId = formData.get("landlordId");
  const periodStartStr = formData.get("periodStart");
  const periodEndStr = formData.get("periodEnd");
  const notes = formData.get("notes") || null;

  if (!landlordId || !periodStartStr || !periodEndStr) {
    return { success: false, error: "Landlord ID, Period Start, and Period End are required." };
  }

  // Parse manual deductions from form fields
  // Support either raw JSON or structured array inputs
  let manualDeductions = [];
  const deductionsJson = formData.get("deductionsJson");
  if (deductionsJson) {
    try {
      manualDeductions = JSON.parse(deductionsJson);
    } catch (e) {
      console.error("Failed to parse deductionsJson", e);
    }
  } else {
    const descriptions = formData.getAll("deduction_description");
    const amounts = formData.getAll("deduction_amount");
    for (let i = 0; i < descriptions.length; i++) {
      if (descriptions[i] && amounts[i]) {
        manualDeductions.push({
          description: descriptions[i],
          amount: parseFloat(amounts[i]) || 0
        });
      }
    }
  }

  // Fetch Landlord and get current bank details snapshot
  const landlord = await User.findOne({ _id: landlordId, agencyId });
  if (!landlord) {
    return { success: false, error: "Landlord not found." };
  }

  // Calculate calculations
  const preview = await calculateDisbursement(
    landlordId,
    agencyId,
    periodStartStr,
    periodEndStr,
    manualDeductions
  );

  if (!preview) {
    return { success: false, error: "No eligible paid rent payments found for this landlord and period." };
  }

  if (preview.error === "negative") {
    return { success: false, error: preview.message };
  }

  // Check for duplicates
  const duplicate = await Disbursement.findOne({
    agencyId,
    landlordId,
    periodStart: new Date(periodStartStr),
    periodEnd: new Date(periodEndStr),
    deleted: false
  });
  if (duplicate) {
    return { success: false, error: "A disbursement already exists for this landlord and period." };
  }

  const bankSnapshot = landlord.landlordData?.bankDetails || {};

  // Create Disbursement
  const disbursement = await Disbursement.create({
    agencyId,
    landlordId,
    propertyIds: preview.propertyIds,
    rentPaymentIds: preview.rentPaymentIds,
    periodStart: new Date(periodStartStr),
    periodEnd: new Date(periodEndStr),
    grossRent: preview.grossRent,
    totalCommission: preview.totalCommission,
    totalVat: preview.totalVat,
    deductions: preview.deductions,
    totalDeductions: preview.totalDeductions,
    netAmount: preview.netAmount,
    landlordBankSnapshot: {
      accountName: bankSnapshot.accountName || null,
      accountNumber: bankSnapshot.accountNumber || null,
      sortCode: bankSnapshot.sortCode || null,
      bankName: bankSnapshot.bankName || null,
    },
    createdBy: user.userId,
    status: "pending",
    notes
  });

  return redirect(`/rent/landlord/${landlordId}`);
}

export default function CreateDisbursementRoute() {
  return null;
}


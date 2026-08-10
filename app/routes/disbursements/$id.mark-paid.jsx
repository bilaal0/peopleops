// routes/disbursements/$id.mark-paid.jsx
// POST action route to mark a pending disbursement as paid.
//
// Rules (from Section 10):
// - Organization isolation: verified on disbursement query
// - Record audit fields: markedPaidBy

import { redirect } from "react-router";
import { getUserFromRequest } from "../../utils/auth.server.js";
import { connect } from "../../config/db.server.js";
import { Disbursement } from "../../models/disbursement.server.js";

export async function loader() {
  return redirect("/rent");
}

export async function action({ request, params }) {
  const user = await getUserFromRequest(request);
  if (!user) return redirect("/login");

  await connect();
  const organizationId = user.organizationId;
  const { id } = params;

  const formData = await request.formData();
  const paidDateStr = formData.get("paidDate");
  const paymentMethod = formData.get("paymentMethod") || "bacs";
  const bankReference = formData.get("bankReference") || "";

  const disbursement = await Disbursement.findOne({ _id: id, organizationId, deleted: false });
  if (!disbursement) {
    return { success: false, error: "Disbursement not found." };
  }

  if (disbursement.status === "paid") {
    return { success: false, error: "Disbursement has already been marked as paid." };
  }

  disbursement.status = "paid";
  disbursement.paidDate = paidDateStr ? new Date(paidDateStr) : new Date();
  disbursement.paymentMethod = paymentMethod;
  disbursement.bankReference = bankReference;
  disbursement.markedPaidBy = user.userId;

  await disbursement.save();

  // Redirect back to landlord ledger or referer if available
  const referer = request.headers.get("Referer");
  if (referer) {
    return redirect(referer);
  }

  return redirect(`/rent/landlord/${disbursement.landlordId}`);
}

export default function MarkPaidRoute() {
  return null;
}


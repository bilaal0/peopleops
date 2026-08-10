// routes/expenses/create.jsx
// Step 8 — Add Expense POST action route.
// Called from the Add Expense modal in /transactions.
// Handles optional receipt file upload to S3 before creating OrganizationExpense.
//
// Rules (from Section 10):
// - Organization isolation enforced
// - Rounding to 2dp
// - Soft delete only
// - Receipt stored via existing S3 + Document pattern
// - Document entityType = 'expense' (added to enum in document.js)

import { redirect } from "react-router";
import { getUserFromRequest } from "../../utils/auth.server.js";
import { connect } from "../../config/db.server.js";
import { OrganizationExpense } from "../../models/organizationExpense.server.js";
import { Document } from "../../models/document.server.js";
import {
  buildS3Key,
  uploadToS3,
  fileToBuffer,
  validateFile,
} from "../../utils/s3.server.js";

const round2 = (n) => Math.round((parseFloat(n) || 0) * 100) / 100;

// GET: redirect back to transactions — this route only handles POST
export async function loader() {
  return redirect("/transactions");
}

export async function action({ request }) {
  const user = await getUserFromRequest(request);
  if (!user) return redirect("/login");

  await connect();
  const organizationId = user.organizationId;

  // Parse multipart/form-data (supports file upload)
  const formData = await request.formData();

  const category    = formData.get("category");
  const description = formData.get("description")?.toString().trim();
  const amount      = round2(formData.get("amount"));
  const vatAmount   = round2(formData.get("vatAmount") || 0);
  const dateStr     = formData.get("date");
  const propertyId  = formData.get("propertyId") || null;
  const paymentMethod = formData.get("paymentMethod") || "bank_transfer";
  const reference   = formData.get("reference")?.toString().trim() || null;
  const notes       = formData.get("notes")?.toString().trim() || null;

  // ── Validation ────────────────────────────────────────────
  const errors = {};
  if (!category)    errors.category    = "Category is required.";
  if (!description) errors.description = "Description is required.";
  if (!amount || amount <= 0) errors.amount = "A positive amount is required.";
  if (!dateStr)     errors.date        = "Date is required.";

  if (Object.keys(errors).length > 0) {
    return { success: false, errors };
  }

  // ── Receipt upload (optional) ─────────────────────────────
  let receiptDocumentId = null;
  const receiptFile = formData.get("receiptFile");

  if (receiptFile && receiptFile instanceof File && receiptFile.size > 0) {
    const validation = validateFile(receiptFile);
    if (!validation.valid) {
      return { success: false, errors: { receiptFile: validation.error } };
    }

    // We need to create the expense first to get its ID for the S3 key.
    // So we create the expense without the receipt, then update.
    // (Standard pattern used in evidence vault: create entity → upload → update link)
    const expense = await OrganizationExpense.create({
      organizationId,
      category,
      description,
      amount,
      vatAmount,
      date:          new Date(dateStr),
      propertyId:    propertyId || null,
      paymentMethod,
      reference,
      notes,
      createdBy:     user.userId,
    });

    // Build S3 key: {organizationId}/expense/{expenseId}/receipt/{uuid}.{ext}
    const s3Key = buildS3Key(
      organizationId,
      "expense",
      expense._id.toString(),
      "receipt",
      receiptFile.name
    );

    const buffer = await fileToBuffer(receiptFile);
    await uploadToS3(buffer, s3Key, receiptFile.type);

    // Create Document record pointing at the expense
    const doc = await Document.create({
      organizationId,
      entityType:   "expense",
      entityId:     expense._id,
      documentType: "receipt",
      fileName:     receiptFile.name,
      fileSize:     receiptFile.size,
      mimeType:     receiptFile.type,
      s3Key,
      uploadedBy:   user.userId,
    });

    // Update expense with the receipt document reference
    expense.receiptDocumentId = doc._id;
    await expense.save();

    return redirect("/transactions");
  }

  // ── No receipt — create expense directly ─────────────────
  await OrganizationExpense.create({
    organizationId,
    category,
    description,
    amount,
    vatAmount,
    date:          new Date(dateStr),
    propertyId:    propertyId || null,
    paymentMethod,
    reference,
    notes,
    createdBy:     user.userId,
  });

  // Redirect to transactions P&L view after save
  return redirect("/transactions");
}

export default function CreateExpenseRoute() {
  return null;
}


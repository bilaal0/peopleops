// routes/transactions/import.jsx
// Bank Statement Import & Auto-reconciliation Page.
// Implements two-step preview flow: Upload/Parse -> Preview/Match -> Save.
// Supports Santander, Lloyds, Barclays, and HSBC.
//
// Rules (from Section 10):
// - Strict organization isolation enforced
// - Rounding to 2dp
// - Soft delete only

import { useState } from "react";
import { Link, useLoaderData, useActionData, useSubmit, useNavigation } from "react-router";
import { redirect } from "react-router";
import { getUserFromRequest } from "../../utils/auth.server.js";
import { connect } from "../../config/db.server.js";
import { Property } from "../../models/property.server.js";
import { RentPayment } from "../../models/rentPayment.server.js";
import { OrganizationExpense } from "../../models/organizationExpense.server.js";
import { parseAndNormaliseCsv, suggestMatchesForTransactions } from "../../utils/csv-parser.server.js";
import { calculateCommission } from "../../utils/rent-payment.js";
import { logRentPartial, logRentReceived } from "../../utils/activityLog.server.js";
import { 
  ArrowLeft, 
  Upload, 
  FileSpreadsheet, 
  Check, 
  AlertTriangle, 
  Search,
  Sparkles,
  Info,
  Layers,
  ArrowRight,
  TrendingDown,
  TrendingUp,
  Tag
} from "lucide-react";

export async function loader({ request }) {
  const user = await getUserFromRequest(request);
  if (!user) return redirect("/login");
  if (!user.organizationId && !user.roles?.includes("SUPER_ADMIN")) return redirect("/dashboard");

  await connect();
  const organizationId = user.organizationId;

  // Load outstanding Rent Payments to populate dropdown lists in Step 2 matchers
  const outstandingRent = await RentPayment.find({
    organizationId,
    status: { $in: ["pending", "overdue", "due", "partial"] },
    deleted: false
  })
    .populate("propertyId", "addressLine1")
    .populate("landlordId", "title firstName lastName")
    .populate("tenancyId")
    .sort({ dueDate: 1 })
    .lean();

  const properties = await Property.find({ organizationId, deleted: false }).select("addressLine1").lean();

  return {
    outstandingRent: outstandingRent.map(p => ({
      _id: p._id.toString(),
      amountDue: p.amountDue,
      amountOutstanding: p.amountOutstanding,
      dueDate: p.dueDate.toISOString(),
      propertyAddress: p.propertyId?.addressLine1 || "Unknown property",
      landlordName: p.landlordId ? `${p.landlordId.title ? p.landlordId.title + ' ' : ''}${p.landlordId.firstName} ${p.landlordId.lastName}` : "Unknown landlord"
    })),
    properties: properties.map(p => ({ ...p, _id: p._id.toString() }))
  };
}

export async function action({ request }) {
  const user = await getUserFromRequest(request);
  if (!user) return redirect("/login");

  await connect();
  const organizationId = user.organizationId;
  const formData = await request.formData();
  const intent = formData.get("intent");

  const round2 = (n) => Math.round(n * 100) / 100;

  if (intent === "parse-csv") {
    const file = formData.get("csvFile");
    const bankType = formData.get("bankType") || ""; // empty means auto-detect

    if (!file || typeof file === "string" || !file.name || file.size === 0) {
      return { success: false, error: "Please upload a valid CSV file." };
    }

    try {
      const csvText = await file.text();
      const { bank, transactions } = parseAndNormaliseCsv(csvText, bankType || null);

      if (transactions.length === 0) {
        return { success: false, error: "No valid transactions found in the CSV statement." };
      }

      // Generate suggested matches strictly isolated by organizationId
      const suggestions = await suggestMatchesForTransactions(transactions, organizationId);

      return {
        success: true,
        intent: "parse-csv",
        bank,
        transactions,
        suggestions
      };
    } catch (error) {
      console.error("CSV Parse Error:", error);
      return { success: false, error: error.message || "Failed to process the CSV file." };
    }
  }

  if (intent === "save-reconciliation") {
    const rowsJson = formData.get("rowsJson");
    if (!rowsJson) {
      return { success: false, error: "No reconciliation data received." };
    }

    let rows = [];
    try {
      rows = JSON.parse(rowsJson);
    } catch (e) {
      return { success: false, error: "Failed to parse reconciliation rows." };
    }

    let rentReconciledCount = 0;
    let expenseCreatedCount = 0;

    for (const r of rows) {
      if (r.action === "match-rent" && r.matchedPaymentId) {
        const payment = await RentPayment.findOne({ _id: r.matchedPaymentId, organizationId, deleted: false });
        if (payment) {
          const amountPaid = round2(Math.abs(r.amount));
          
          // ── Section 10 Rule 3: Use commission rates FROZEN on RentPayment at creation ──
          const storedRates = {
            commission: {
              type: payment.commissionType,
              rate: payment.commissionRate,
              vatRegistered: false, // VAT flag is not stored per-payment; default false
            }
          };
          const calculations = calculateCommission(amountPaid, storedRates);

          payment.amountPaid = amountPaid;
          payment.amountOutstanding = round2(payment.amountDue - amountPaid);
          payment.commissionAmount = calculations.commissionAmount;
          payment.vatAmount = calculations.vatAmount;
          payment.netToLandlord = calculations.netToLandlord;
          payment.status = payment.amountOutstanding <= 0 ? "paid" : "partial";
          payment.paymentMethod = "bacs_transfer";
          payment.paidDate = new Date(r.date);
          payment.paymentReference = r.description;
          payment.recordedBy = user.userId;
          payment.recordedAt = new Date();

          await payment.save();
          if (payment.status === "paid") {
            await logRentReceived(payment, user);
          } else if (payment.status === "partial") {
            await logRentPartial(payment, user);
          }
          rentReconciledCount++;
        }
      } 
      else if (r.action === "create-expense" && r.expenseCategory) {
        await OrganizationExpense.create({
          organizationId,
          category: r.expenseCategory,
          description: r.description,
          amount: round2(Math.abs(r.amount)),
          date: new Date(r.date),
          paymentMethod: "bank_transfer",
          reference: r.description.substring(0, 30),
          importedFromCsv: true,
          csvRowReference: `CSV-ROW-${r.index}`,
          createdBy: user.userId
        });
        expenseCreatedCount++;
      }
    }

    return {
      success: true,
      intent: "save-reconciliation",
      message: `Reconciliation successfully completed: matched ${rentReconciledCount} rent payments and recorded ${expenseCreatedCount} expenses.`
    };
  }

  return { success: false, error: "Invalid action intent." };
}

export default function CsvImport() {
  const { outstandingRent, properties } = useLoaderData();
  const actionData = useActionData();
  const submit = useSubmit();
  const navigation = useNavigation();

  // Selected row mapping states for Step 2
  const [rowActions, setRowActions] = useState({}); // { index: { action: 'match-rent'|'create-expense'|'ignore', matchedPaymentId?: string, expenseCategory?: string } }
  
  // UI State
  const [selectedFile, setSelectedFile] = useState(null);

  const handleCsvSubmit = (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.append("intent", "parse-csv");
    submit(fd, { method: "post", encType: "multipart/form-data" });
  };

  const handleConfirmReconciliation = () => {
    if (!actionData?.suggestions) return;

    const formattedRows = actionData.suggestions.map((s) => {
      const state = rowActions[s.index] || { action: s.suggestedMatch.matchedId ? "match-rent" : "ignore" };
      return {
        index: s.index,
        date: s.date,
        description: s.description,
        amount: s.amount,
        type: s.type,
        action: state.action,
        matchedPaymentId: state.matchedPaymentId || (s.suggestedMatch.matchType === "rent" ? s.suggestedMatch.matchedId : null),
        expenseCategory: state.expenseCategory || "other"
      };
    });

    const fd = new FormData();
    fd.append("intent", "save-reconciliation");
    fd.append("rowsJson", JSON.stringify(formattedRows));
    submit(fd, { method: "post" });
  };

  const formatCurrency = (amt) => {
    return (amt || 0).toLocaleString("en-GB", {
      style: "currency",
      currency: "GBP"
    });
  };

  const isSaving = navigation.state === "submitting" && navigation.formData?.get("intent") === "save-reconciliation";

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-4 md:p-6 text-[#1E293B] bg-[#F8FAFC]">
      {/* ── HEADER ── */}
      <div className="border-b border-[#E2E8F0] pb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <Link 
            to="/rent" 
            className="inline-flex items-center gap-1 text-[11px] font-bold text-[#94A3B8] hover:text-[#2563EB] uppercase tracking-wider mb-2.5 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Rent Tracker
          </Link>
          <h1 className="text-xl font-bold tracking-tight text-[#1E293B]">Bank Statement Reconciliation</h1>
          <p className="text-xs text-[#94A3B8] font-medium mt-1">Upload bank statements to auto-match tenant rent payments and log expenses.</p>
        </div>
      </div>

      {/* ── SUCCESS FEEDBACK REDIRECT ── */}
      {actionData?.success && actionData.intent === "save-reconciliation" && (
        <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-5 text-center space-y-4 max-w-lg mx-auto shadow-sm">
          <div className="w-12 h-12 bg-emerald-500 text-white rounded-full flex items-center justify-center mx-auto shadow-md">
            <Check className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">Import Reconciled Successfully</h3>
            <p className="text-xs text-[#475569] mt-1">{actionData.message}</p>
          </div>
          <Link
            to="/rent"
            className="inline-block px-4 py-2 bg-slate-900 hover:bg-black text-white rounded-lg text-xs font-semibold shadow-sm transition"
          >
            Return to Rent Tracker
          </Link>
        </div>
      )}

      {/* ── STEP 1: UPLOAD FORM ── */}
      {(!actionData?.success || actionData.intent !== "parse-csv") && (!actionData?.success || actionData.intent !== "save-reconciliation") && (
        <div className="bg-white border border-[#E2E8F0] rounded-xl shadow-sm p-6 max-w-xl mx-auto space-y-6">
          <div className="flex gap-3.5 items-start">
            <div className="bg-[#2563EB]/10 p-2.5 rounded-xl border border-[#2563EB]/25 text-[#2563EB]">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Step 1: Select statement file</h3>
              <p className="text-xs text-[#94A3B8] font-medium mt-0.5">Upload a standard CSV file exported from your bank.</p>
            </div>
          </div>

          <form onSubmit={handleCsvSubmit} className="space-y-4">
            <div>
              <label className="text-[10px] font-bold text-[#475569] uppercase tracking-wider block">Bank Format</label>
              <select
                name="bankType"
                className="w-full mt-1.5 border border-[#E2E8F0] rounded-lg text-xs p-2.5 focus:outline-none focus:ring-1 focus:ring-[#2563EB] bg-white"
              >
                <option value="">Auto-Detect Format (Recommended)</option>
                <option value="santander">Santander</option>
                <option value="lloyds">Lloyds Bank</option>
                <option value="barclays">Barclays</option>
                <option value="hsbc">HSBC Bank</option>
              </select>
            </div>

            <div>
              <label className="text-[10px] font-bold text-[#475569] uppercase tracking-wider block">CSV File *</label>
              <div className="mt-1.5 border-2 border-dashed border-[#E2E8F0] hover:border-[#2563EB]/50 rounded-xl p-6 text-center cursor-pointer transition-colors relative">
                <input
                  type="file"
                  name="csvFile"
                  accept=".csv"
                  required
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      setSelectedFile(e.target.files[0]);
                    }
                  }}
                />
                <Upload className="w-8 h-8 text-[#94A3B8] mx-auto mb-2" />
                {selectedFile ? (
                  <p className="text-xs font-bold text-emerald-600">Selected: {selectedFile.name}</p>
                ) : (
                  <p className="text-xs font-bold text-slate-900">Choose file or drag and drop</p>
                )}
                <p className="text-[10px] text-[#94A3B8] font-medium mt-0.5">Only .csv files supported</p>
              </div>
            </div>

            {actionData?.error && (
              <div className="p-3 bg-red-50 border border-red-100 rounded-lg text-xs text-red-600 flex gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{actionData.error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={navigation.state === "submitting"}
              className="w-full py-2.5 bg-slate-900 hover:bg-black text-white text-xs font-bold rounded-lg transition disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              {navigation.state === "submitting" ? "Parsing Statement..." : "Upload & Parse Statement"}
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          <div className="border-t border-[#E2E8F0] pt-4 text-[10px] text-[#94A3B8] font-medium flex gap-2">
            <Info className="w-4 h-4 text-[#94A3B8] shrink-0" />
            <span>
              Proplet will auto-detect Santander, Lloyds, Barclays, and HSBC column layouts. All credit inflows are compared with outstanding tenant rent records.
            </span>
          </div>
        </div>
      )}

      {/* ── STEP 2: PREVIEW & RECONCILE TABLE ── */}
      {actionData?.success && actionData.intent === "parse-csv" && (
        <div className="space-y-5">
          <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="bg-emerald-500/10 p-2.5 rounded-xl border border-emerald-500/25 text-emerald-600">
                <Sparkles className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-widest">Step 2: Confirm Transactions Matching</h3>
                <p className="text-[10px] text-[#94A3B8] mt-0.5">
                  Detected bank schema: <span className="font-bold text-[#1E293B] uppercase">{actionData.bank}</span>. Review auto-suggested matches.
                </p>
              </div>
            </div>

            <div className="flex gap-2">
              <Link
                to="/transactions/import"
                className="px-4 py-2 border border-[#E2E8F0] text-xs font-semibold rounded-lg text-[#475569] hover:bg-slate-50 transition bg-white shadow-sm"
              >
                Cancel / Re-upload
              </Link>
              <button
                onClick={handleConfirmReconciliation}
                disabled={isSaving}
                className="px-4 py-2 bg-[#16A34A] hover:bg-[#15803D] text-white text-xs font-semibold rounded-lg shadow-sm transition disabled:opacity-50"
              >
                {isSaving ? "Saving..." : "Confirm & Save Matches"}
              </button>
            </div>
          </div>

          <div className="bg-white border border-[#E2E8F0] rounded-xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-[#E2E8F0] text-[10px] font-bold text-[#475569] uppercase tracking-wider">
                    <th className="p-4 w-12 text-center">Row</th>
                    <th className="p-4">Date</th>
                    <th className="p-4">Description</th>
                    <th className="p-4 text-right">Inflow (+)</th>
                    <th className="p-4 text-right">Outflow (-)</th>
                    <th className="p-4">Auto-Suggested Match</th>
                    <th className="p-4">Resolution Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0]">
                  {actionData.suggestions.map((s) => {
                    const rowState = rowActions[s.index] || { 
                      action: s.suggestedMatch.matchedId ? "match-rent" : (s.type === "debit" ? "create-expense" : "ignore"),
                      matchedPaymentId: s.suggestedMatch.matchedId || "",
                      expenseCategory: "other"
                    };

                    const handleActionChange = (action) => {
                      setRowActions(prev => ({
                        ...prev,
                        [s.index]: { ...rowState, action }
                      }));
                    };

                    const handlePaymentMatchChange = (matchedPaymentId) => {
                      setRowActions(prev => ({
                        ...prev,
                        [s.index]: { ...rowState, matchedPaymentId }
                      }));
                    };

                    const handleCategoryChange = (expenseCategory) => {
                      setRowActions(prev => ({
                        ...prev,
                        [s.index]: { ...rowState, expenseCategory }
                      }));
                    };

                    return (
                      <tr key={s.index} className="hover:bg-slate-50/50 transition-colors">
                        <td className="p-4 text-center text-[#94A3B8] font-bold">{s.index + 1}</td>
                        <td className="p-4 font-medium text-[#475569]">{new Date(s.date).toLocaleDateString("en-GB")}</td>
                        <td className="p-4 text-slate-900 font-medium truncate max-w-[200px]">{s.description}</td>
                        <td className="p-4 text-right font-bold text-[#16A34A]">
                          {s.amount > 0 ? formatCurrency(s.amount) : "—"}
                        </td>
                        <td className="p-4 text-right font-bold text-red-600">
                          {s.amount < 0 ? formatCurrency(Math.abs(s.amount)) : "—"}
                        </td>
                        <td className="p-4 text-[#475569]">
                          {s.suggestedMatch.matchedId ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-green-50 border border-green-200 text-green-700 px-2 py-0.5 rounded-full">
                              Match: {s.suggestedMatch.details}
                            </span>
                          ) : s.type === "debit" ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-blue-50 border border-blue-200 text-blue-700 px-2 py-0.5 rounded-full">
                              Expense: {s.suggestedMatch.details}
                            </span>
                          ) : (
                            <span className="text-[10px] text-[#94A3B8] font-bold uppercase tracking-wider">No Match suggestion</span>
                          )}
                        </td>
                        <td className="p-4">
                          <div className="flex flex-col gap-2">
                            {/* Action selector */}
                            <select
                              value={rowState.action}
                              onChange={(e) => handleActionChange(e.target.value)}
                              className="border border-[#E2E8F0] rounded px-2 py-1 text-xs bg-white font-medium focus:outline-none"
                            >
                              <option value="ignore">Ignore row</option>
                              {s.type === "credit" && <option value="match-rent">Match Rent Payment</option>}
                              {s.type === "debit" && <option value="create-expense">Mark as Organization Expense</option>}
                            </select>

                            {/* Dropdowns based on action */}
                            {rowState.action === "match-rent" && s.type === "credit" && (
                              <select
                                value={rowState.matchedPaymentId}
                                onChange={(e) => handlePaymentMatchChange(e.target.value)}
                                className="border border-[#E2E8F0] rounded px-2 py-1 text-[10px] bg-white font-semibold text-[#2563EB] focus:outline-none"
                              >
                                <option value="">-- Choose outstanding payment --</option>
                                {outstandingRent.map((op) => (
                                  <option key={op._id} value={op._id}>
                                    {op.propertyAddress} ({op.landlordName}) — Due: £{op.amountOutstanding}
                                  </option>
                                ))}
                              </select>
                            )}

                            {rowState.action === "create-expense" && s.type === "debit" && (
                              <select
                                value={rowState.expenseCategory}
                                onChange={(e) => handleCategoryChange(e.target.value)}
                                className="border border-[#E2E8F0] rounded px-2 py-1 text-[10px] bg-white font-semibold text-red-600 focus:outline-none"
                              >
                                <option value="software">Software</option>
                                <option value="insurance">Insurance</option>
                                <option value="marketing">Marketing</option>
                                <option value="maintenance">Maintenance</option>
                                <option value="professional_fees">Professional Fees</option>
                                <option value="office">Office / Rent</option>
                                <option value="travel">Travel</option>
                                <option value="banking">Banking Charges</option>
                                <option value="other">Other Expense</option>
                              </select>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

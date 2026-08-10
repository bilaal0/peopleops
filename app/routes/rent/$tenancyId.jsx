// routes/rent/$tenancyId.jsx
// Tenancy Rent Ledger Page.
// Shows a complete, premium statement of accounts/ledger for a specific tenancy.
// Includes YTD collected/commission, active arrears alert, full payment ledger table,
// and landlord disbursements history.
//
// Rules (from Section 10):
// - Organization isolation: query checked against user.organizationId
// - Soft delete only
// - 2dp rounding
// - Premium design with interactive features

import React, { useState } from "react";
import { Link, useLoaderData } from "react-router";
import { redirect } from "react-router";
import { getUserFromRequest } from "../../utils/auth.server.js";
import { connect } from "../../config/db.server.js";
import { Tenancy } from "../../models/tenancy.server.js";
import { RentPayment } from "../../models/rentPayment.server.js";
import { Disbursement } from "../../models/disbursement.server.js";
import { 
  ArrowLeft, 
  PoundSterling, 
  TrendingUp, 
  Percent, 
  AlertCircle, 
  CheckCircle2, 
  Clock, 
  Plus, 
  ChevronDown, 
  ChevronUp, 
  FileText,
  User,
  Home
} from "lucide-react";

export async function loader({ request, params }) {
  const user = await getUserFromRequest(request);
  if (!user) return redirect("/login");
  if (!user.organizationId && !user.roles?.includes("SUPER_ADMIN")) return redirect("/dashboard");

  await connect();
  const organizationId = user.organizationId;
  const { tenancyId } = params;

  // 1. Fetch Tenancy with isolation
  const tenancy = await Tenancy.findOne({ _id: tenancyId, organizationId })
    .populate("propertyId", "addressLine1 city commission")
    .populate("landlordId", "title firstName lastName email phone")
    .populate("tenantIds", "title firstName lastName email phone")
    .lean();

  if (!tenancy) {
    return redirect("/rent");
  }

  // 2. Fetch all rent payments for this tenancy (all time, newest first)
  const payments = await RentPayment.find({ tenancyId, organizationId, deleted: false })
    .sort({ dueDate: -1 })
    .lean();

  // 3. Calculate YTD totals (Year-to-date based on current calendar year)
  const currentYear = new Date().getFullYear();
  const ytdPayments = payments.filter(p => new Date(p.periodStart).getFullYear() === currentYear);

  const totalCollectedYTD = ytdPayments.reduce((s, p) => s + (p.amountPaid || 0), 0);
  const totalCommissionYTD = ytdPayments.reduce((s, p) => s + (p.commissionAmount || 0), 0);
  const netToLandlordYTD = ytdPayments.reduce((s, p) => s + (p.netToLandlord || 0), 0);

  // 4. Calculate arrears summary
  const unpaidPayments = payments.filter(p => ["overdue", "partial", "due"].includes(p.status));
  const totalArrears = unpaidPayments.reduce((s, p) => s + (p.amountDue - p.amountPaid), 0);
  const monthsArrears = payments.filter(p => p.status === "overdue").length;

  // 5. Fetch all disbursements that covered this tenancy's payments
  const paymentIds = payments.map(p => p._id);
  const disbursements = await Disbursement.find({
    organizationId,
    rentPaymentIds: { $in: paymentIds },
    deleted: false
  })
    .sort({ periodStart: -1 })
    .lean();

  return {
    tenancy: {
      ...tenancy,
      _id: tenancy._id.toString(),
      propertyId: tenancy.propertyId ? { ...tenancy.propertyId, _id: tenancy.propertyId._id.toString() } : null,
      landlordId: tenancy.landlordId ? { ...tenancy.landlordId, _id: tenancy.landlordId._id.toString() } : null,
      tenantIds: tenancy.tenantIds.map(t => ({ ...t, _id: t._id.toString() }))
    },
    payments: payments.map(p => ({
      ...p,
      _id: p._id.toString(),
      tenancyId: p.tenancyId.toString(),
      propertyId: p.propertyId.toString(),
      landlordId: p.landlordId.toString()
    })),
    disbursements: disbursements.map(d => ({
      ...d,
      _id: d._id.toString(),
      landlordId: d.landlordId.toString(),
      propertyIds: d.propertyIds.map(id => id.toString()),
      rentPaymentIds: d.rentPaymentIds.map(id => id.toString())
    })),
    ytd: {
      totalCollectedYTD: Math.round(totalCollectedYTD * 100) / 100,
      totalCommissionYTD: Math.round(totalCommissionYTD * 100) / 100,
      netToLandlordYTD: Math.round(netToLandlordYTD * 100) / 100,
    },
    arrears: {
      totalArrears: Math.round(totalArrears * 100) / 100,
      monthsArrears,
      hasArrears: totalArrears > 0
    }
  };
}

export default function TenancyLedger() {
  const { tenancy, payments, disbursements, ytd, arrears } = useLoaderData();
  const [expandedPaymentId, setExpandedPaymentId] = useState(null);

  const formatCurrency = (amt) => {
    return (amt || 0).toLocaleString("en-GB", {
      style: "currency",
      currency: "GBP"
    });
  };

  const tenantNames = tenancy.tenantIds.map(t => `${t.title ? t.title + ' ' : ''}${t.firstName} ${t.lastName}`).join(", ");

  const toggleExpandRow = (id) => {
    setExpandedPaymentId(prev => (prev === id ? null : id));
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-4 md:p-6 text-[#1E293B] bg-[#F8FAFC]">
      {/* ── HEADER ── */}
      <div className="border-b border-[#E2E8F0] pb-5">
        <Link 
          to="/rent" 
          className="inline-flex items-center gap-1 text-[11px] font-bold text-[#94A3B8] hover:text-[#2563EB] uppercase tracking-wider mb-2.5 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Rent Tracker
        </Link>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-[#1E293B] flex items-center gap-2">
              <Home className="w-5 h-5 text-[#94A3B8]" />
              {tenancy.propertyId?.addressLine1}, {tenancy.propertyId?.city}
            </h1>
            <p className="text-xs text-[#94A3B8] font-medium mt-1">
              Active Tenancy ledgers for <span className="font-semibold text-[#475569]">{tenantNames}</span>
            </p>
          </div>

          <div className="flex items-center gap-4 bg-white border border-[#E2E8F0] px-4 py-2.5 rounded-xl shadow-sm">
            <div className="text-xs">
              <span className="text-[#94A3B8] font-medium">Monthly Rent:</span>
              <span className="font-bold text-[#1E293B] ml-1.5">{formatCurrency(tenancy.rent?.amount)}</span>
            </div>
            <div className="h-4 border-r border-[#E2E8F0]"></div>
            <div className="text-xs">
              <span className="text-[#94A3B8] font-medium">Commission Rate:</span>
              <span className="font-bold text-[#1E293B] ml-1.5">
                {tenancy.propertyId?.commission?.rate
                  ? tenancy.propertyId.commission.type === "percentage"
                    ? `${tenancy.propertyId.commission.rate}%`
                    : `£${tenancy.propertyId.commission.rate} Flat`
                  : "0%"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── YTD SUMMARY CARDS ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-sm relative overflow-hidden">
          <p className="text-[10px] font-bold text-[#94A3B8] uppercase tracking-wider">Total Collected YTD</p>
          <p className="text-xl font-extrabold text-[#16A34A] mt-1 tracking-tight">{formatCurrency(ytd.totalCollectedYTD)}</p>
          <div className="absolute top-4 right-4 bg-emerald-50 p-1.5 rounded-lg border border-emerald-100">
            <CheckCircle2 className="w-4 h-4 text-[#16A34A]" />
          </div>
        </div>

        <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-sm relative overflow-hidden">
          <p className="text-[10px] font-bold text-[#94A3B8] uppercase tracking-wider">Total Commission YTD</p>
          <p className="text-xl font-extrabold text-[#1E293B] mt-1 tracking-tight">{formatCurrency(ytd.totalCommissionYTD)}</p>
          <div className="absolute top-4 right-4 bg-slate-50 p-1.5 rounded-lg border border-[#E2E8F0]">
            <Percent className="w-4 h-4 text-[#94A3B8]" />
          </div>
        </div>

        <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-sm relative overflow-hidden">
          <p className="text-[10px] font-bold text-[#94A3B8] uppercase tracking-wider">Net Paid to Landlord YTD</p>
          <p className="text-xl font-extrabold text-[#2563EB] mt-1 tracking-tight">{formatCurrency(ytd.netToLandlordYTD)}</p>
          <div className="absolute top-4 right-4 bg-blue-50 p-1.5 rounded-lg border border-blue-100">
            <PoundSterling className="w-4 h-4 text-[#2563EB]" />
          </div>
        </div>
      </div>

      {/* ── ARREARS RED BANNER ── */}
      {arrears.hasArrears && (
        <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200/80 rounded-xl text-xs text-red-800">
          <AlertCircle className="w-5 h-5 text-[#DC2626] shrink-0" />
          <div>
            <p className="font-bold text-[#DC2626]">Rent Arrears Detected</p>
            <p className="text-red-700/90 mt-0.5 font-medium">
              This tenancy currently has <strong>{formatCurrency(arrears.totalArrears)}</strong> in outstanding rent payments across <strong>{arrears.monthsArrears} overdue</strong> billing period(s).
            </p>
          </div>
        </div>
      )}

      {/* ── PAYMENT LEDGER TABLE ── */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-[#E2E8F0]">
          <h3 className="text-xs font-bold text-[#1E293B] uppercase tracking-widest">Rent Payment Ledger</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-[#E2E8F0] text-[10px] font-bold text-[#475569] uppercase tracking-wider">
                <th className="p-4 w-6"></th>
                <th className="p-4">Billing Period</th>
                <th className="p-4">Due Date</th>
                <th className="p-4 text-right">Rent Due</th>
                <th className="p-4 text-right">Amount Paid</th>
                <th className="p-4 text-right">Outstanding</th>
                <th className="p-4 text-right">Commission</th>
                <th className="p-4 text-right">Net to Landlord</th>
                <th className="p-4">Status</th>
                <th className="p-4">Paid Date</th>
                <th className="p-4">Method</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8F0]">
              {payments.map((p) => {
                const isExpanded = expandedPaymentId === p._id;
                const statusColors = {
                  paid: "bg-green-50 text-[#16A34A] border-green-200",
                  partial: "bg-amber-50 text-[#D97706] border-amber-200",
                  overdue: "bg-red-50 text-[#DC2626] border-red-200",
                  due: "bg-amber-50 text-[#D97706] border-amber-200",
                  pending: "bg-slate-50 text-[#475569] border-[#E2E8F0]",
                  waived: "bg-slate-50 text-[#94A3B8] border-[#E2E8F0] line-through"
                };

                return (
                  // React.Fragment with key is required here (not <> shorthand which doesn't accept key)
                  // This renders as nothing in the DOM — only <tr> children are seen by the table
                  <React.Fragment key={p._id}>
                    <tr
                      onClick={() => toggleExpandRow(p._id)}
                      className="text-xs hover:bg-slate-50/50 transition-colors cursor-pointer select-none"
                    >
                      <td className="p-4 text-[#94A3B8]">
                        {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </td>
                      <td className="p-4 font-bold text-[#1E293B]">
                        {new Date(p.periodStart).toLocaleDateString("en-GB", { month: "long", year: "numeric" })}
                      </td>
                      <td className="p-4 text-[#475569] font-medium">{new Date(p.dueDate).toLocaleDateString("en-GB")}</td>
                      <td className="p-4 text-right font-semibold text-[#1E293B]">{formatCurrency(p.amountDue)}</td>
                      <td className="p-4 text-right font-semibold text-[#16A34A]">{p.amountPaid > 0 ? formatCurrency(p.amountPaid) : "—"}</td>
                      <td className="p-4 text-right font-semibold text-red-600">
                        {p.amountOutstanding > 0 ? formatCurrency(p.amountOutstanding) : "—"}
                      </td>
                      <td className="p-4 text-right text-[#94A3B8]">
                        {p.commissionAmount != null ? formatCurrency(p.commissionAmount) : "—"}
                      </td>
                      <td className="p-4 text-right font-semibold text-[#2563EB]">
                        {p.netToLandlord != null ? formatCurrency(p.netToLandlord) : "—"}
                      </td>
                      <td className="p-4">
                        <span className={`inline-flex px-2 py-0.5 rounded-full border text-[10px] font-bold ${statusColors[p.status] || statusColors.pending}`}>
                          {p.status}
                        </span>
                      </td>
                      <td className="p-4 text-[#475569]">{p.paidDate ? new Date(p.paidDate).toLocaleDateString("en-GB") : "—"}</td>
                      <td className="p-4 text-[#475569] truncate uppercase max-w-[80px]">{p.paymentMethod ? p.paymentMethod.replace("_", " ") : "—"}</td>
                    </tr>
                    {isExpanded && (
                      <tr className="bg-slate-50/50">
                        <td colSpan="11" className="p-4 border-t border-b border-[#E2E8F0] text-xs text-[#475569]">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <p className="font-bold text-[#1E293B]">Payment References & Notes</p>
                              <p className="mt-1 font-mono text-[10px] text-[#94A3B8]">
                                Reference: {p.paymentReference || "No bank reference recorded"}
                              </p>
                              <p className="mt-1">
                                Notes: <span className="italic text-[#475569]">{p.notes || "None"}</span>
                              </p>
                            </div>
                            <div>
                              {p.status === "waived" ? (
                                <>
                                  <p className="font-bold text-[#1E293B]">Waived Audit Info</p>
                                  <p className="mt-1 text-[10px] text-[#475569]">
                                    Reason: <span className="font-medium text-red-600">{p.waivedReason}</span>
                                  </p>
                                  <p className="mt-0.5 text-[9px] text-[#94A3B8]">
                                    Waived at: {new Date(p.waivedAt).toLocaleString("en-GB")}
                                  </p>
                                </>
                              ) : (
                                <>
                                  <p className="font-bold text-[#1E293B]">System Audit Trail</p>
                                  <p className="mt-1 text-[10px] text-[#94A3B8]">
                                    Created at: {new Date(p.createdAt).toLocaleString("en-GB")}
                                  </p>
                                  {p.recordedAt && (
                                    <p className="mt-0.5 text-[10px] text-[#94A3B8]">
                                      Recorded at: {new Date(p.recordedAt).toLocaleString("en-GB")}
                                    </p>
                                  )}
                                </>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── LANDLORD DISBURSEMENTS HISTORY ── */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-[#E2E8F0]">
          <h3 className="text-xs font-bold text-[#1E293B] uppercase tracking-widest">Included in Landlord Disbursements</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-[#E2E8F0] text-[10px] font-bold text-[#475569] uppercase tracking-wider">
                <th className="p-4">Disbursement Period</th>
                <th className="p-4 text-right">Gross Rent</th>
                <th className="p-4 text-right">Total Commission</th>
                <th className="p-4 text-right">Deductions</th>
                <th className="p-4 text-right">Net Amount Paid</th>
                <th className="p-4">Status</th>
                <th className="p-4">Payout Date</th>
                <th className="p-4">Reference</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8F0]">
              {disbursements.length === 0 ? (
                <tr>
                  <td colSpan="8" className="p-8 text-center text-xs text-[#94A3B8]">
                    No disbursements generated covering this tenancy yet.
                  </td>
                </tr>
              ) : (
                disbursements.map((d) => {
                  const statusColors = {
                    paid: "bg-green-50 text-[#16A34A] border-green-200",
                    pending: "bg-slate-50 text-[#475569] border-[#E2E8F0]"
                  };

                  return (
                    <tr key={d._id} className="text-xs hover:bg-slate-50/50">
                      <td className="p-4 font-bold text-[#1E293B]">
                        {new Date(d.periodStart).toLocaleDateString("en-GB", { month: "short", year: "numeric" })} - {new Date(d.periodEnd).toLocaleDateString("en-GB", { month: "short", year: "numeric" })}
                      </td>
                      <td className="p-4 text-right font-medium">{formatCurrency(d.grossRent)}</td>
                      <td className="p-4 text-right text-[#94A3B8]">{formatCurrency(d.totalCommission + d.totalVat)}</td>
                      <td className="p-4 text-right text-red-600">{d.totalDeductions > 0 ? `-${formatCurrency(d.totalDeductions)}` : "—"}</td>
                      <td className="p-4 text-right font-semibold text-[#2563EB]">{formatCurrency(d.netAmount)}</td>
                      <td className="p-4">
                        <span className={`inline-flex px-2 py-0.5 rounded-full border text-[10px] font-bold ${statusColors[d.status] || statusColors.pending}`}>
                          {d.status}
                        </span>
                      </td>
                      <td className="p-4 text-[#475569]">{d.paidDate ? new Date(d.paidDate).toLocaleDateString("en-GB") : "—"}</td>
                      <td className="p-4 text-[#475569] font-mono text-[10px]">{d.bankReference || "—"}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

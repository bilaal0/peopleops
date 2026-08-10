// routes/rent/statement/$id.jsx
// Landlord Statement View.
// Printable, beautiful summary of a generated disbursement.
// Includes details on all included property rent payments and manual deductions.
// Supports print-friendly layout.
//
// Rules:
// - Organization isolation checked
// - Soft delete checked
// - 2dp rounding checked

import { Link, useLoaderData } from "react-router";
import { redirect } from "react-router";
import { getUserFromRequest } from "../../../utils/auth.server.js";
import { connect } from "../../../config/db.server.js";
import { Disbursement } from "../../../models/disbursement.server.js";
import { User } from "../../../models/user.server.js";
import { RentPayment } from "../../../models/rentPayment.server.js";
import { Organization } from "../../../models/organization.server.js";
import {
  ArrowLeft,
  Printer,
  Download,
  CheckCircle2,
  Clock,
  Building,
  Phone,
  Mail,
  MapPin,
  FileText
} from "lucide-react";

export async function loader({ request, params }) {
  const user = await getUserFromRequest(request);
  if (!user) return redirect("/login");

  await connect();
  const organizationId = user.organizationId;
  const { id } = params;

  // Explicitly reference User so compiler knows it belongs to server
  User;

  // 1. Fetch Disbursement
  const disbursement = await Disbursement.findOne({ _id: id, organizationId, deleted: false })
    .populate("landlordId")
    .lean();

  if (!disbursement) {
    return redirect("/rent");
  }

  // 2. Fetch Organization info
  const organization = await Organization.findById(organizationId).lean();

  // 3. Fetch detailed RentPayments included in this disbursement
  const payments = await RentPayment.find({
    _id: { $in: disbursement.rentPaymentIds },
    organizationId,
    deleted: false
  })
    .populate("propertyId")
    .lean();

  return {
    disbursement: {
      ...disbursement,
      _id: disbursement._id.toString(),
      landlordId: disbursement.landlordId ? {
        ...disbursement.landlordId,
        _id: disbursement.landlordId._id.toString()
      } : null,
      rentPaymentIds: disbursement.rentPaymentIds.map(id => id.toString()),
      propertyIds: disbursement.propertyIds.map(id => id.toString())
    },
    organization: organization ? {
      ...organization,
      _id: organization._id.toString()
    } : null,
    payments: payments.map(p => ({
      ...p,
      _id: p._id.toString(),
      propertyId: p.propertyId ? {
        ...p.propertyId,
        _id: p.propertyId._id.toString()
      } : null
    }))
  };
}

export default function LandlordStatement() {
  const { disbursement, organization, payments } = useLoaderData();

  const formatCurrency = (amt) => {
    return (amt || 0).toLocaleString("en-GB", {
      style: "currency",
      currency: "GBP"
    });
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto p-4 md:p-8 bg-white min-h-[90vh] text-[#1E293B]">
      {/* ── ACTION BAR (HIDDEN IN PRINT) ── */}
      <div className="flex justify-between items-center border-b border-[#E2E8F0] pb-4 print:hidden">
        <Link
          to={`/rent/landlord/${disbursement.landlordId?._id}`}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#475569] hover:text-[#2563EB] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Landlord Ledger
        </Link>

        <div className="flex items-center gap-2">
          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 text-white text-xs font-semibold rounded-lg hover:bg-black transition shadow-sm"
          >
            <Printer className="w-3.5 h-3.5" />
            Print Statement
          </button>
        </div>
      </div>

      {/* ── STATEMENT BODY ── */}
      <div className="space-y-8 print:p-0">
        {/* Header Block: Logo & Document Title */}
        <div className="flex justify-between items-start">
          <div>
            <div className="flex items-center gap-2">
              <span className="bg-[#2563EB] text-white p-1.5 rounded-lg">
                <Building className="w-5 h-5" />
              </span>
              <span className="font-extrabold text-lg text-slate-900 tracking-tight">
                {organization?.name || "PROPLET ORGANIZATION"}
              </span>
            </div>
            <p className="text-[10px] text-[#94A3B8] font-bold uppercase mt-1 tracking-wider">
              Landlord Remittance Statement
            </p>
          </div>

          <div className="text-right">
            <h2 className="text-sm font-black text-slate-900">REMITTANCE STATEMENT</h2>
            <p className="text-xs text-[#475569] font-medium mt-1">
              Statement ID: <span className="font-mono text-slate-900 font-bold">{disbursement._id}</span>
            </p>
            <p className="text-[10px] text-[#94A3B8] font-semibold mt-0.5">
              Generated: {new Date(disbursement.createdAt).toLocaleDateString("en-GB")}
            </p>
          </div>
        </div>

        {/* Sender & Recipient addresses */}
        <div className="grid grid-cols-2 gap-8 border-t border-b border-[#E2E8F0] py-6">
          <div className="space-y-2">
            <h3 className="text-[10px] font-bold text-[#94A3B8] uppercase tracking-wider">Organization Details</h3>
            <p className="text-xs font-bold text-slate-900">{organization?.name || "Proplet Lettings"}</p>
            <div className="text-xs text-[#475569] space-y-1">
              {organization?.addressLine1 && <p>{organization.addressLine1}</p>}
              {organization?.addressLine2 && <p>{organization.addressLine2}</p>}
              {organization?.city && <p>{organization.city}</p>}
              {organization?.postcode && <p className="font-semibold uppercase">{organization.postcode}</p>}
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="text-[10px] font-bold text-[#94A3B8] uppercase tracking-wider">Landlord Details</h3>
            <p className="text-xs font-bold text-slate-900">
              {disbursement.landlordId ? `${disbursement.landlordId.title ? disbursement.landlordId.title + ' ' : ''}${disbursement.landlordId.firstName} ${disbursement.landlordId.lastName}` : "—"}
            </p>
            <div className="text-xs text-[#475569] space-y-1">
              {disbursement.landlordId?.email && (
                <p className="flex items-center gap-1.5">
                  <Mail className="w-3 h-3 text-[#94A3B8]" />
                  {disbursement.landlordId.email}
                </p>
              )}
              {disbursement.landlordId?.phone && (
                <p className="flex items-center gap-1.5">
                  <Phone className="w-3 h-3 text-[#94A3B8]" />
                  {disbursement.landlordId.phone}
                </p>
              )}
            </div>

            {/* Bank account statement block */}
            <div className="mt-3 p-3 bg-slate-50 border border-[#E2E8F0] rounded-xl text-xs">
              <p className="text-[9px] font-bold text-[#94A3B8] uppercase tracking-wider flex items-center gap-1">
                <Printer className="w-3 h-3" />
                Target Bank Account
              </p>
              {disbursement.landlordBankSnapshot?.accountNumber ? (
                <div className="mt-1 font-mono text-[10px] text-[#475569]">
                  <p className="font-bold text-slate-900">{disbursement.landlordBankSnapshot.accountName}</p>
                  <p>Acc: {disbursement.landlordBankSnapshot.accountNumber} | Sort: {disbursement.landlordBankSnapshot.sortCode}</p>
                  <p className="text-[9px] text-[#94A3B8] uppercase font-bold mt-0.5">{disbursement.landlordBankSnapshot.bankName}</p>
                </div>
              ) : (
                <p className="text-red-500 font-semibold text-[10px] uppercase mt-1">No payout account linked</p>
              )}
            </div>
          </div>
        </div>

        {/* Rent Payments summary */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold text-[#1E293B] uppercase tracking-widest">Rent Payments Summary</h3>
          <div className="border border-[#E2E8F0] rounded-xl overflow-hidden shadow-sm">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-[#E2E8F0] text-[9px] font-bold text-[#475569] uppercase tracking-wider">
                  <th className="p-3">Property</th>
                  <th className="p-3">Rent Period</th>
                  <th className="p-3 text-right">Rent Received</th>
                  <th className="p-3 text-right">Commission</th>
                  <th className="p-3 text-right">VAT</th>
                  <th className="p-3 text-right">Net to Landlord</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]">
                {payments.map((p) => (
                  <tr key={p._id} className="hover:bg-slate-50/50">
                    <td className="p-3 font-semibold text-slate-900">{p.propertyId?.addressLine1 || "—"}</td>
                    <td className="p-3 text-[#475569]">
                      {new Date(p.periodStart).toLocaleDateString("en-GB", { month: "short", year: "numeric" })}
                    </td>
                    <td className="p-3 text-right font-medium">{formatCurrency(p.amountPaid)}</td>
                    <td className="p-3 text-right text-[#94A3B8]">{formatCurrency(p.commissionAmount)}</td>
                    <td className="p-3 text-right text-[#94A3B8]">{formatCurrency(p.vatAmount)}</td>
                    <td className="p-3 text-right font-semibold text-slate-900">{formatCurrency(p.netToLandlord)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Deductions section (if any exist) */}
        {disbursement.deductions?.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-[#1E293B] uppercase tracking-widest">Maintenance & Deductions</h3>
            <div className="border border-[#E2E8F0] rounded-xl overflow-hidden shadow-sm">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-[#E2E8F0] text-[9px] font-bold text-[#475569] uppercase tracking-wider">
                    <th className="p-3">Deduction Description</th>
                    <th className="p-3 text-right">Amount Deducted</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0]">
                  {disbursement.deductions.map((d, index) => (
                    <tr key={index} className="hover:bg-slate-50/50">
                      <td className="p-3 text-slate-900">{d.description}</td>
                      <td className="p-3 text-right font-semibold text-red-600">-{formatCurrency(d.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Final invoice summary block */}
        <div className="flex justify-end pt-4">
          <div className="w-72 border border-[#E2E8F0] rounded-xl p-4 bg-slate-50/50 space-y-2.5 text-xs">
            <p className="text-[9px] font-bold text-[#94A3B8] uppercase tracking-wider">Statement Calculation Totals</p>
            <div className="flex justify-between text-[#475569]">
              <span>Gross Rent Collected:</span>
              <span className="font-semibold text-slate-900">{formatCurrency(disbursement.grossRent)}</span>
            </div>
            <div className="flex justify-between text-[#475569]">
              <span>Organization Commission:</span>
              <span className="font-semibold text-red-600">-{formatCurrency(disbursement.totalCommission)}</span>
            </div>
            {disbursement.totalVat > 0 && (
              <div className="flex justify-between text-[#475569]">
                <span>VAT on Commission:</span>
                <span className="font-semibold text-red-600">-{formatCurrency(disbursement.totalVat)}</span>
              </div>
            )}
            {disbursement.totalDeductions > 0 && (
              <div className="flex justify-between text-[#475569]">
                <span>Deductions:</span>
                <span className="font-semibold text-red-600">-{formatCurrency(disbursement.totalDeductions)}</span>
              </div>
            )}
            <div className="border-t border-[#E2E8F0] pt-2.5 mt-2.5 flex justify-between font-extrabold text-sm text-slate-900">
              <span>Total Remitted:</span>
              <span className="text-[#2563EB]">{formatCurrency(disbursement.netAmount)}</span>
            </div>

            {/* Status indicators */}
            <div className="pt-2 border-t border-[#E2E8F0] flex items-center justify-between">
              <span className="text-[10px] font-bold text-[#94A3B8] uppercase">Payout Status</span>
              {disbursement.status === "paid" ? (
                <span className="inline-flex items-center gap-1 text-green-700 font-bold bg-green-50 border border-green-200 px-2 py-0.5 rounded text-[10px]">
                  <CheckCircle2 className="w-3 h-3" />
                  PAID
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-slate-600 font-bold bg-slate-50 border border-[#E2E8F0] px-2 py-0.5 rounded text-[10px]">
                  <Clock className="w-3 h-3" />
                  PENDING
                </span>
              )}
            </div>

            {disbursement.status === "paid" && (
              <div className="text-[9px] text-[#94A3B8] pt-1 text-right">
                Paid: {new Date(disbursement.paidDate).toLocaleDateString("en-GB")} | Ref: {disbursement.bankReference}
              </div>
            )}
          </div>
        </div>

        {/* Footer Note */}
        <div className="text-center text-[10px] text-[#94A3B8] border-t border-[#E2E8F0] pt-6 mt-12">
          Thank you for choosing {organization?.name || "PROPLET ORGANIZATION"}. If you have any questions regarding this statement, please contact us.
        </div>
      </div>
    </div>
  );
}

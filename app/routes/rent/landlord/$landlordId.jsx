// routes/rent/landlord/$landlordId.jsx
// Landlord Ledger & Statement Page.
// Shows all disbursements, rent payments received across all properties,
// and manages landlord bank details inline.
//
// Rules (from Section 10):
// - Organization isolation: verified on user and queries
// - 2dp rounding
// - Soft delete only
// - Premium design with interactive forms/modals

import { useState, useEffect } from "react";
import { Link, useLoaderData, useActionData, useSubmit, useNavigation, Form } from "react-router";
import { redirect } from "react-router";
import { getUserFromRequest } from "../../../utils/auth.server.js";
import { connect } from "../../../config/db.server.js";
import { User } from "../../../models/user.server.js";
import { Property } from "../../../models/property.server.js";
import { RentPayment } from "../../../models/rentPayment.server.js";
import { Disbursement } from "../../../models/disbursement.server.js";
import { generatePDF } from "../../../utils/evidenceVault.server.js";
import { uploadToS3, getPresignedUrl } from "../../../utils/s3.server.js";
import { 
  ArrowLeft, 
  PoundSterling, 
  CreditCard, 
  Settings, 
  Plus, 
  CheckCircle2, 
  Clock, 
  AlertTriangle, 
  Calendar, 
  Building,
  User as UserIcon,
  X,
  FileText
} from "lucide-react";

export async function loader({ request, params }) {
  const user = await getUserFromRequest(request);
  if (!user) return redirect("/login");
  if (!user.organizationId && !user.roles?.includes("SUPER_ADMIN")) return redirect("/dashboard");

  await connect();
  const organizationId = user.organizationId;
  // 1. Month/Year Navigation from URL
  const url = new URL(request.url);
  const selectedYear = parseInt(url.searchParams.get("year")) || new Date().getFullYear();
  const yearStart = new Date(selectedYear, 0, 1);
  const yearEnd = new Date(selectedYear, 11, 31, 23, 59, 59, 999);

  // 2. Fetch Landlord with isolation
  const landlord = await User.findOne({ _id: landlordId, organizationId, roles: "LANDLORD", deleted: false }).lean();
  if (!landlord) {
    return redirect("/rent");
  }

  // 3. Fetch landlord's properties
  const properties = await Property.find({ landlordId, organizationId, deleted: false }).select("addressLine1 city").lean();

  // 4. Fetch Disbursements (newest first, filtered by year)
  const disbursements = await Disbursement.find({ 
    landlordId, 
    organizationId, 
    deleted: false,
    periodStart: { $gte: yearStart, $lte: yearEnd }
  })
    .sort({ periodStart: -1 })
    .lean();

  // 5. Fetch Rent Payments across all properties of this landlord (filtered by year)
  const payments = await RentPayment.find({ 
    landlordId, 
    organizationId, 
    deleted: false,
    periodStart: { $gte: yearStart, $lte: yearEnd }
  })
    .populate("propertyId", "addressLine1")
    .populate("tenancyId")
    .sort({ periodStart: -1 })
    .lean();

  // Group payments by property
  const paymentsByProperty = {};
  for (const p of payments) {
    const propId = p.propertyId ? p.propertyId._id.toString() : "unlinked";
    if (!paymentsByProperty[propId]) {
      paymentsByProperty[propId] = {
        propertyId: propId,
        propertyAddress: p.propertyId ? p.propertyId.addressLine1 : "Unlinked Property",
        payments: []
      };
    }
    paymentsByProperty[propId].payments.push(p);
  }

  // 5. Calculate summary metrics
  const totalGrossRent = payments.reduce((s, p) => s + (p.amountPaid || 0), 0);
  const totalCommission = payments.reduce((s, p) => s + (p.commissionAmount || 0) + (p.vatAmount || 0), 0);
  const totalPaidDisb = disbursements.filter(d => d.status === "paid").reduce((s, d) => s + d.netAmount, 0);
  const totalPendingDisb = disbursements.filter(d => d.status === "pending").reduce((s, d) => s + d.netAmount, 0);

  return {
    landlord: {
      ...landlord,
      _id: landlord._id.toString(),
      landlordData: landlord.landlordData || {}
    },
    properties: properties.map(p => ({ ...p, _id: p._id.toString() })),
    disbursements: disbursements.map(d => ({
      ...d,
      _id: d._id.toString(),
      landlordId: d.landlordId.toString(),
      propertyIds: d.propertyIds.map(id => id.toString()),
      rentPaymentIds: d.rentPaymentIds.map(id => id.toString())
    })),
    selectedYear,
    summary: {
      totalGrossRent: Math.round(totalGrossRent * 100) / 100,
      totalCommission: Math.round(totalCommission * 100) / 100,
      totalPaidDisb: Math.round(totalPaidDisb * 100) / 100,
      totalPendingDisb: Math.round(totalPendingDisb * 100) / 100,
      readyToDisburse: Math.round(payments.filter(p => p.status === "paid" && p.netToLandlord != null).reduce((s, p) => s + p.netToLandlord, 0) * 100) / 100 // simplified mock logic
    },
    paymentsByProperty: Object.values(paymentsByProperty).map(group => ({
      ...group,
      payments: group.payments.map(p => ({
        ...p,
        _id: p._id.toString(),
        propertyId: p.propertyId ? { ...p.propertyId, _id: p.propertyId._id.toString() } : null,
        tenancyId: p.tenancyId ? {
          ...p.tenancyId,
          _id: p.tenancyId._id.toString(),
          tenants: p.tenancyId.tenants || []
        } : null
      }))
    }))
  };
}

export async function action({ request, params }) {
  const user = await getUserFromRequest(request);
  if (!user) return redirect("/login");

  await connect();
  const organizationId = user.organizationId;
  const { landlordId } = params;

  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "update-bank") {
    const accountName = formData.get("accountName");
    const accountNumber = formData.get("accountNumber");
    const sortCode = formData.get("sortCode");
    const bankName = formData.get("bankName");

    const landlord = await User.findOne({ _id: landlordId, organizationId, roles: "LANDLORD" });
    if (!landlord) {
      return { success: false, error: "Landlord not found." };
    }

    if (!landlord.landlordData) {
      landlord.landlordData = {};
    }

    landlord.landlordData.bankDetails = {
      accountName,
      accountNumber,
      sortCode,
      bankName
    };

    // Mark landlordData path modified since nested sub-fields don't trigger mongoose validation auto-detect sometimes
    landlord.markModified("landlordData");
    await landlord.save();

    return { success: true, message: "Bank account details successfully updated." };
  }

  if (intent === "download-pdf") {
    try {
      const landlord = await User.findOne({ _id: landlordId, organizationId, roles: "LANDLORD" });
      if (!landlord) return { success: false, error: "Landlord not found." };
      
      const html = `
        <html>
          <body style="font-family: Arial, sans-serif; padding: 40px; color: #1E293B;">
            <h1 style="font-size: 24px; font-weight: bold; margin-bottom: 20px;">Landlord Statement</h1>
            <div style="margin-bottom: 30px;">
              <p><strong>Landlord:</strong> ${landlord.title ? landlord.title + ' ' : ''}${landlord.firstName} ${landlord.lastName}</p>
              <p><strong>Email:</strong> ${landlord.email}</p>
              <p><strong>Generated on:</strong> ${new Date().toLocaleDateString("en-GB")}</p>
            </div>
            <p style="color: #64748B;">Detailed transaction breakdowns will be added here.</p>
          </body>
        </html>
      `;

      const pdfBuffer = await generatePDF(html);
      const s3Key = `${organizationId}/statements/${landlordId}/${new Date().getFullYear()}.pdf`;
      await uploadToS3(pdfBuffer, s3Key, "application/pdf");
      const downloadUrl = await getPresignedUrl(s3Key);

      return { success: true, downloadUrl };
    } catch (error) {
      console.error(error);
      return { success: false, error: "Failed to generate PDF statement." };
    }
  }

  return { success: false, error: "Invalid intent action." };
}

export default function LandlordLedger() {
  const { landlord, properties, disbursements, paymentsByProperty, summary, selectedYear } = useLoaderData();
  const actionData = useActionData();
  const submit = useSubmit();
  const navigation = useNavigation();

  const handleYearChange = (e) => {
    const url = new URL(window.location);
    url.searchParams.set("year", e.target.value);
    window.location.href = url.toString();
  };

  // Bank form state
  const [bankEditMode, setBankEditMode] = useState(false);
  const [accountName, setAccountName] = useState(landlord.landlordData?.bankDetails?.accountName || "");
  const [accountNumber, setAccountNumber] = useState(landlord.landlordData?.bankDetails?.accountNumber || "");
  const [sortCode, setSortCode] = useState(landlord.landlordData?.bankDetails?.sortCode || "");
  const [bankName, setBankName] = useState(landlord.landlordData?.bankDetails?.bankName || "");

  // Mark Paid Modal state
  const [activeMarkPaidModal, setActiveMarkPaidModal] = useState(null); // stores disbursement object

  // Close modals on success
  useEffect(() => {
    if (actionData?.success && actionData?.message) {
      setBankEditMode(false);
      setActiveMarkPaidModal(null);
    }
    if (actionData?.success && actionData?.downloadUrl) {
      window.open(actionData.downloadUrl, "_blank");
    }
  }, [actionData]);

  const formatCurrency = (amt) => {
    return (amt || 0).toLocaleString("en-GB", {
      style: "currency",
      currency: "GBP"
    });
  };

  const handleUpdateBank = (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.append("intent", "update-bank");
    submit(fd, { method: "post" });
  };

  const handleMarkPaidSubmit = (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    submit(fd, {
      method: "post",
      action: `/disbursements/${activeMarkPaidModal._id}/mark-paid`
    });
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
              <UserIcon className="w-5 h-5 text-[#94A3B8]" />
              {landlord.title ? landlord.title + ' ' : ''}{landlord.firstName} {landlord.lastName}
            </h1>
            <p className="text-xs text-[#94A3B8] font-medium mt-1">
              Ledger and financial payouts statement. Email: <span className="font-semibold text-[#475569]">{landlord.email}</span>
            </p>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={selectedYear}
              onChange={handleYearChange}
              className="bg-white border border-[#E2E8F0] text-xs font-semibold rounded-lg px-3 py-2 text-[#475569] shadow-sm focus:outline-none focus:ring-1 focus:ring-[#2563EB]"
            >
              {[0, 1, 2, 3].map((offset) => {
                const y = new Date().getFullYear() - offset;
                return <option key={y} value={y}>{y}</option>;
              })}
            </select>
            <Form method="post">
              <input type="hidden" name="intent" value="download-pdf" />
              <button
                type="submit"
                className="flex items-center gap-1.5 px-3 py-2 bg-slate-900 text-white text-xs font-semibold rounded-lg hover:bg-black transition shadow-sm"
              >
                <FileText className="w-3.5 h-3.5" />
                Download PDF
              </button>
            </Form>
            <button
              onClick={() => setBankEditMode(!bankEditMode)}
              className="flex items-center gap-1.5 px-3 py-2 bg-white border border-[#E2E8F0] text-xs font-semibold rounded-lg hover:bg-slate-50 transition shadow-sm text-[#475569]"
            >
              <CreditCard className="w-3.5 h-3.5 text-[#94A3B8]" />
              Manage Bank Account
            </button>
          </div>
        </div>
      </div>

      {/* ── BANK DETAILS ACCORDION/FORM ── */}
      {bankEditMode && (
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-sm space-y-4">
          <div className="flex justify-between items-center pb-2 border-b border-[#E2E8F0]">
            <h3 className="text-xs font-bold text-[#1E293B] uppercase tracking-widest flex items-center gap-2">
              <Settings className="w-4 h-4 text-[#94A3B8]" />
              Update Bank Payout details
            </h3>
            <button onClick={() => setBankEditMode(false)} className="text-[#94A3B8] hover:text-[#1E293B]">
              <X className="w-4 h-4" />
            </button>
          </div>

          <form onSubmit={handleUpdateBank} className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 items-end">
            <div>
              <label className="text-[10px] font-bold text-[#475569] uppercase tracking-wider block">Account Name</label>
              <input
                type="text"
                name="accountName"
                value={accountName}
                onChange={e => setAccountName(e.target.value)}
                placeholder="e.g. MR J THOMPSON"
                required
                className="w-full mt-1.5 border border-[#E2E8F0] rounded-lg text-xs p-2.5 focus:outline-none focus:ring-1 focus:ring-[#2563EB]"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-[#475569] uppercase tracking-wider block">Account Number</label>
              <input
                type="text"
                name="accountNumber"
                value={accountNumber}
                onChange={e => setAccountNumber(e.target.value)}
                placeholder="8 digit account number"
                maxLength="8"
                required
                className="w-full mt-1.5 border border-[#E2E8F0] rounded-lg text-xs p-2.5 focus:outline-none focus:ring-1 focus:ring-[#2563EB]"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-[#475569] uppercase tracking-wider block">Sort Code</label>
              <input
                type="text"
                name="sortCode"
                value={sortCode}
                onChange={e => setSortCode(e.target.value)}
                placeholder="e.g. 20-40-60"
                required
                className="w-full mt-1.5 border border-[#E2E8F0] rounded-lg text-xs p-2.5 focus:outline-none focus:ring-1 focus:ring-[#2563EB]"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-[#475569] uppercase tracking-wider block">Bank Name</label>
              <input
                type="text"
                name="bankName"
                value={bankName}
                onChange={e => setBankName(e.target.value)}
                placeholder="e.g. Barclays"
                required
                className="w-full mt-1.5 border border-[#E2E8F0] rounded-lg text-xs p-2.5 focus:outline-none focus:ring-1 focus:ring-[#2563EB]"
              />
            </div>

            <div className="col-span-full flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setBankEditMode(false)}
                className="px-4 py-2 border border-[#E2E8F0] text-xs font-semibold rounded-lg text-[#475569] hover:bg-slate-50 transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-slate-900 hover:bg-black text-white rounded-lg text-xs font-semibold transition"
              >
                Save Details
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── METRICS CARD BAR ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {summary.readyToDisburse > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 shadow-sm relative overflow-hidden">
            <p className="text-[10px] font-bold text-amber-700 uppercase tracking-wider">Ready to Disburse</p>
            <p className="text-xl font-extrabold text-amber-900 mt-1 tracking-tight">{formatCurrency(summary.readyToDisburse)}</p>
            <div className="mt-2">
              <Link to="/disbursements/create" className="text-[10px] font-bold text-amber-700 hover:underline">
                Create Disbursement &rarr;
              </Link>
            </div>
          </div>
        )}
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-sm relative overflow-hidden">
          <p className="text-[10px] font-bold text-[#94A3B8] uppercase tracking-wider">Gross Rent Collected</p>
          <p className="text-xl font-extrabold text-[#1E293B] mt-1 tracking-tight">{formatCurrency(summary.totalGrossRent)}</p>
          <div className="absolute top-4 right-4 bg-slate-50 p-1.5 rounded-lg border border-[#E2E8F0]">
            <Building className="w-4 h-4 text-[#94A3B8]" />
          </div>
        </div>

        <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-sm relative overflow-hidden">
          <p className="text-[10px] font-bold text-[#94A3B8] uppercase tracking-wider">Commission Deducted</p>
          <p className="text-xl font-extrabold text-red-600 mt-1 tracking-tight">{formatCurrency(summary.totalCommission)}</p>
          <div className="absolute top-4 right-4 bg-red-50 p-1.5 rounded-lg border border-red-100">
            <PoundSterling className="w-4 h-4 text-red-600" />
          </div>
        </div>

        <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-sm relative overflow-hidden">
          <p className="text-[10px] font-bold text-[#94A3B8] uppercase tracking-wider">Total Paid Payouts</p>
          <p className="text-xl font-extrabold text-[#16A34A] mt-1 tracking-tight">{formatCurrency(summary.totalPaidDisb)}</p>
          <div className="absolute top-4 right-4 bg-emerald-50 p-1.5 rounded-lg border border-emerald-100">
            <CheckCircle2 className="w-4 h-4 text-[#16A34A]" />
          </div>
        </div>

        <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-sm relative overflow-hidden">
          <p className="text-[10px] font-bold text-[#94A3B8] uppercase tracking-wider">Pending Payouts</p>
          <p className="text-xl font-extrabold text-[#2563EB] mt-1 tracking-tight">{formatCurrency(summary.totalPendingDisb)}</p>
          <div className="absolute top-4 right-4 bg-blue-50 p-1.5 rounded-lg border border-blue-100">
            <Clock className="w-4 h-4 text-[#2563EB]" />
          </div>
        </div>
      </div>

      {/* ── DISBURSEMENTS TABLE ── */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-[#E2E8F0] flex justify-between items-center">
          <h3 className="text-xs font-bold text-[#1E293B] uppercase tracking-widest">Disbursements / Payout History</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-[#E2E8F0] text-[10px] font-bold text-[#475569] uppercase tracking-wider">
                <th className="p-4">Period Covered</th>
                <th className="p-4 text-right">Gross Rent</th>
                <th className="p-4 text-right">Commission</th>
                <th className="p-4 text-right">VAT</th>
                <th className="p-4 text-right">Deductions</th>
                <th className="p-4 text-right">Net Payout</th>
                <th className="p-4">Bank Details used</th>
                <th className="p-4">Status</th>
                <th className="p-4">Payment Info</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8F0]">
              {disbursements.length === 0 ? (
                <tr>
                  <td colSpan="10" className="p-12 text-center text-xs text-[#94A3B8]">
                    No disbursements generated for this landlord yet.
                  </td>
                </tr>
              ) : (
                disbursements.map((d) => {
                  const statusColors = {
                    paid: "bg-green-50 text-[#16A34A] border-green-200",
                    pending: "bg-slate-50 text-[#475569] border-[#E2E8F0]"
                  };

                  return (
                    <tr key={d._id} className="text-xs hover:bg-slate-50/50 transition-colors">
                      <td className="p-4 font-bold text-[#1E293B]">
                        {new Date(d.periodStart).toLocaleDateString("en-GB", { month: "short", year: "numeric" })} - {new Date(d.periodEnd).toLocaleDateString("en-GB", { month: "short", year: "numeric" })}
                      </td>
                      <td className="p-4 text-right font-medium">{formatCurrency(d.grossRent)}</td>
                      <td className="p-4 text-right text-[#94A3B8]">{formatCurrency(d.totalCommission)}</td>
                      <td className="p-4 text-right text-[#94A3B8]">{formatCurrency(d.totalVat)}</td>
                      <td className="p-4 text-right text-red-600">
                        {d.totalDeductions > 0 ? `-${formatCurrency(d.totalDeductions)}` : "—"}
                      </td>
                      <td className="p-4 text-right font-semibold text-[#2563EB]">{formatCurrency(d.netAmount)}</td>
                      <td className="p-4 text-[#475569] font-mono text-[10px]">
                        {d.landlordBankSnapshot?.accountNumber ? (
                          <span>Acc: {d.landlordBankSnapshot.accountNumber} | Sort: {d.landlordBankSnapshot.sortCode}</span>
                        ) : (
                          <span className="text-red-500 font-bold">None</span>
                        )}
                      </td>
                      <td className="p-4">
                        <span className={`inline-flex px-2 py-0.5 rounded-full border text-[10px] font-bold ${statusColors[d.status] || statusColors.pending}`}>
                          {d.status}
                        </span>
                      </td>
                      <td className="p-4 text-[#475569] text-[10px]">
                        {d.status === "paid" ? (
                          <div>
                            <p className="font-bold text-[#1E293B]">Date: {new Date(d.paidDate).toLocaleDateString("en-GB")}</p>
                            <p className="text-[#94A3B8] mt-0.5">Ref: {d.bankReference}</p>
                          </div>
                        ) : (
                          <span className="italic text-[#94A3B8]">Awaiting payout</span>
                        )}
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {d.status === "pending" && (
                            <button
                              onClick={() => setActiveMarkPaidModal(d)}
                              className="px-2.5 py-1 bg-slate-900 text-white hover:bg-black rounded-md text-[10px] font-semibold transition"
                            >
                              Mark Paid
                            </button>
                          )}
                          <Link
                            to={`/rent/statement/${d._id}`}
                            className="p-1 hover:bg-slate-100 rounded-md text-[#94A3B8] hover:text-[#1E293B]"
                          >
                            <FileText className="w-3.5 h-3.5" />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── PER-PROPERTY TENANT PAYMENTS TABLES ── */}
      {paymentsByProperty.length === 0 ? (
        <div className="bg-white border border-[#E2E8F0] rounded-xl shadow-sm overflow-hidden p-8 text-center text-xs text-[#94A3B8]">
          No payments recorded for this landlord's properties in {selectedYear}.
        </div>
      ) : (
        paymentsByProperty.map((group) => (
          <div key={group.propertyId} className="bg-white border border-[#E2E8F0] rounded-xl shadow-sm overflow-hidden mb-6">
            <div className="px-5 py-4 border-b border-[#E2E8F0] flex items-center gap-2">
              <Building className="w-4 h-4 text-[#94A3B8]" />
              <h3 className="text-xs font-bold text-[#1E293B] uppercase tracking-widest">{group.propertyAddress}</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-[#E2E8F0] text-[10px] font-bold text-[#475569] uppercase tracking-wider">
                    <th className="p-4">Billing Period</th>
                    <th className="p-4 text-right">Amount Due</th>
                    <th className="p-4 text-right">Amount Paid</th>
                    <th className="p-4 text-right">Commission</th>
                    <th className="p-4 text-right">VAT</th>
                    <th className="p-4 text-right">Net to Landlord</th>
                    <th className="p-4">Paid Date</th>
                    <th className="p-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0]">
                  {group.payments.length === 0 ? (
                    <tr>
                      <td colSpan="8" className="p-8 text-center text-xs text-[#94A3B8]">
                        No payments recorded for this property.
                      </td>
                    </tr>
                  ) : (
                    group.payments.map((p) => {
                      const statusColors = {
                        paid: "bg-green-50 text-[#16A34A] border-green-200",
                        partial: "bg-amber-50 text-[#D97706] border-amber-200",
                        overdue: "bg-red-50 text-[#DC2626] border-red-200",
                        due: "bg-amber-50 text-[#D97706] border-amber-200",
                        pending: "bg-slate-50 text-[#475569] border-[#E2E8F0]"
                      };

                      return (
                        <tr key={p._id} className="text-xs hover:bg-slate-50/50">
                          <td className="p-4 font-medium text-[#475569]">
                            {new Date(p.periodStart).toLocaleDateString("en-GB", { month: "short", year: "numeric" })}
                          </td>
                          <td className="p-4 text-right font-semibold text-[#1E293B]">{formatCurrency(p.amountDue)}</td>
                          <td className="p-4 text-right font-semibold text-[#16A34A]">{p.amountPaid > 0 ? formatCurrency(p.amountPaid) : "—"}</td>
                          <td className="p-4 text-right text-[#94A3B8]">{p.commissionAmount != null ? formatCurrency(p.commissionAmount) : "—"}</td>
                          <td className="p-4 text-right text-[#94A3B8]">{p.vatAmount != null ? formatCurrency(p.vatAmount) : "—"}</td>
                          <td className="p-4 text-right font-semibold text-[#2563EB]">{p.netToLandlord != null ? formatCurrency(p.netToLandlord) : "—"}</td>
                          <td className="p-4 text-[#475569]">{p.paidDate ? new Date(p.paidDate).toLocaleDateString("en-GB") : "—"}</td>
                          <td className="p-4">
                            <span className={`inline-flex px-2 py-0.5 rounded-full border text-[10px] font-bold ${statusColors[p.status] || statusColors.pending}`}>
                              {p.status}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                  {/* Property Totals Row */}
                  <tr className="bg-slate-50 border-t-2 border-[#E2E8F0] font-bold text-[#1E293B]">
                    <td className="p-4 text-right" colSpan="2">Totals:</td>
                    <td className="p-4 text-right text-[#16A34A]">{formatCurrency(group.payments.reduce((s, p) => s + (p.amountPaid || 0), 0))}</td>
                    <td className="p-4 text-right">{formatCurrency(group.payments.reduce((s, p) => s + (p.commissionAmount || 0), 0))}</td>
                    <td className="p-4 text-right">{formatCurrency(group.payments.reduce((s, p) => s + (p.vatAmount || 0), 0))}</td>
                    <td className="p-4 text-right text-[#2563EB]">{formatCurrency(group.payments.reduce((s, p) => s + (p.netToLandlord || 0), 0))}</td>
                    <td colSpan="2"></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}

      {/* ── MODAL: MARK DISBURSEMENT PAID ── */}
      {activeMarkPaidModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-[#E2E8F0] rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="flex justify-between items-center bg-slate-50 px-5 py-4 border-b border-[#E2E8F0]">
              <div>
                <h3 className="text-sm font-bold text-[#1E293B]">Confirm Payout to Landlord</h3>
                <p className="text-[10px] text-[#94A3B8] font-medium mt-0.5">
                  Period: {new Date(activeMarkPaidModal.periodStart).toLocaleDateString("en-GB", { month: "short", year: "numeric" })} - {new Date(activeMarkPaidModal.periodEnd).toLocaleDateString("en-GB", { month: "short", year: "numeric" })}
                </p>
              </div>
              <button onClick={() => setActiveMarkPaidModal(null)} className="text-[#94A3B8] hover:text-[#1E293B]">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleMarkPaidSubmit} className="p-5 space-y-4">
              <div className="bg-blue-50 border border-blue-100 p-3 rounded-lg text-xs text-blue-800 flex gap-2">
                <CreditCard className="w-4 h-4 text-[#2563EB] shrink-0" />
                <div>
                  <p className="font-bold">Net Payout Amount: {formatCurrency(activeMarkPaidModal.netAmount)}</p>
                  {activeMarkPaidModal.landlordBankSnapshot?.accountNumber ? (
                    <p className="text-[10px] mt-0.5">
                      Pay to: {activeMarkPaidModal.landlordBankSnapshot.accountName} | Acc: {activeMarkPaidModal.landlordBankSnapshot.accountNumber} | Sort: {activeMarkPaidModal.landlordBankSnapshot.sortCode} ({activeMarkPaidModal.landlordBankSnapshot.bankName})
                    </p>
                  ) : (
                    <p className="text-[10px] text-red-600 font-bold mt-0.5 uppercase tracking-wider">No Bank Account snapshot on this disbursement.</p>
                  )}
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-[#475569] uppercase tracking-wider block">Date Paid *</label>
                <input
                  type="date"
                  name="paidDate"
                  required
                  defaultValue={new Date().toISOString().split("T")[0]}
                  className="w-full mt-1.5 border border-[#E2E8F0] rounded-lg text-xs p-2.5 focus:outline-none focus:ring-1 focus:ring-[#2563EB]"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-[#475569] uppercase tracking-wider block">Payment Method *</label>
                <select
                  name="paymentMethod"
                  required
                  className="w-full mt-1.5 border border-[#E2E8F0] rounded-lg text-xs p-2.5 focus:outline-none focus:ring-1 focus:ring-[#2563EB] bg-white"
                >
                  <option value="bacs">BACS Transfer</option>
                  <option value="faster_payment">Faster Payment</option>
                  <option value="cheque">Cheque</option>
                  <option value="cash">Cash</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] font-bold text-[#475569] uppercase tracking-wider block">Bank Transfer Reference</label>
                <input
                  type="text"
                  name="bankReference"
                  placeholder="e.g. PROPLET DISB JUN26"
                  className="w-full mt-1.5 border border-[#E2E8F0] rounded-lg text-xs p-2.5 focus:outline-none focus:ring-1 focus:ring-[#2563EB]"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setActiveMarkPaidModal(null)}
                  className="px-4 py-2 border border-[#E2E8F0] text-xs font-semibold rounded-lg text-[#475569] hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={navigation.state === "submitting"}
                  className="px-4 py-2 bg-slate-900 text-white rounded-lg text-xs font-semibold hover:bg-black transition disabled:opacity-50 shadow-sm"
                >
                  Confirm Payout
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// routes/rent/index.jsx
// Main Rent Tracker screen for Proplet.
// Feels like a premium financial SaaS product — Linear/Stripe design language.
//
// Rules (from Section 10):
// - Organization isolation: all queries checked against user.organizationId
// - Month navigation state via URL params (?month=5&year=2026)
// - 2dp rounding on all calculations
// - Soft delete only

import { useState, useEffect } from "react";
import { Link, useLoaderData, useActionData, useSubmit, useNavigation, useSearchParams } from "react-router";
import { redirect } from "react-router";
import { getUserFromRequest } from "../../utils/auth.server.js";
import { connect } from "../../config/db.server.js";
import { RentPayment } from "../../models/rentPayment.server.js";
import { User } from "../../models/user.server.js";
import { Property } from "../../models/property.server.js";
import { Disbursement } from "../../models/disbursement.server.js";
import { getRentSummaryForMonth, calculateDisbursement } from "../../utils/transactions.server.js";
import { calculateCommission } from "../../utils/rent-payment.js";
import { logRentPartial, logRentReceived, logRentWaived } from "../../utils/activityLog.server.js";
import { 
  PoundSterling, 
  Calendar, 
  Search, 
  Filter, 
  Upload, 
  Zap, 
  ArrowLeft, 
  ArrowRight, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  Eye, 
  X, 
  TrendingUp, 
  Check, 
  Info,
  DollarSign
} from "lucide-react";

export async function loader({ request }) {
  const user = await getUserFromRequest(request);
  if (!user) return redirect("/login");
  if (!user.organizationId && !user.roles?.includes("SUPER_ADMIN")) return redirect("/dashboard");

  await connect();
  const organizationId = user.organizationId;

  // 1. Month/Year Navigation from URL
  const url = new URL(request.url);
  const now = new Date();
  const year = parseInt(url.searchParams.get("year")) || now.getFullYear();
  const month = parseInt(url.searchParams.get("month")) || (now.getMonth() + 1);

  const periodStart = new Date(year, month - 1, 1);
  const periodEnd = new Date(year, month, 0, 23, 59, 59, 999);

  // 2. Fetch metrics
  const summary = await getRentSummaryForMonth(organizationId, year, month);

  // 3. Filters
  const statusFilter = url.searchParams.get("status") || "all";
  const propertyFilter = url.searchParams.get("property") || "all";
  const landlordFilter = url.searchParams.get("landlord") || "all";
  const searchFilter = url.searchParams.get("search") || "";

  const query = {
    organizationId,
    deleted: false,
    periodStart: { $gte: periodStart, $lte: periodEnd }
  };

  if (statusFilter !== "all") {
    query.status = statusFilter;
  }
  if (propertyFilter !== "all") {
    query.propertyId = propertyFilter;
  }
  if (landlordFilter !== "all") {
    query.landlordId = landlordFilter;
  }

  // 4. Fetch Rent Payments
  const paymentsRaw = await RentPayment.find(query)
    .populate("tenancyId")
    .populate("propertyId", "addressLine1 city commission")
    .populate("landlordId", "title firstName lastName landlordData")
    .sort({ dueDate: 1 })
    .lean();

  // Client search filter (fuzzy address or tenant name)
  let payments = paymentsRaw.map(p => ({
    ...p,
    _id: p._id.toString(),
    tenancyId: p.tenancyId ? {
      ...p.tenancyId,
      _id: p.tenancyId._id.toString(),
      tenants: p.tenancyId.tenants || []
    } : null,
    propertyId: p.propertyId ? {
      ...p.propertyId,
      _id: p.propertyId._id.toString()
    } : null,
    landlordId: p.landlordId ? {
      ...p.landlordId,
      _id: p.landlordId._id.toString()
    } : null
  }));

  if (searchFilter) {
    const q = searchFilter.toLowerCase();
    payments = payments.filter(p => {
      const address = p.propertyId?.addressLine1?.toLowerCase() || "";
      const landlord = `${p.landlordId?.title ? p.landlordId?.title + ' ' : ''}${p.landlordId?.firstName} ${p.landlordId?.lastName}`.toLowerCase();
      const tenants = p.tenancyId?.tenants?.map(t => `${t.title ? t.title + ' ' : ''}${t.firstName} ${t.lastName}`.join(" ").toLowerCase()) || [];
      return address.includes(q) || landlord.includes(q) || tenants.some(t => t.includes(q));
    });
  }

  // 5. Fetch Landlords and Properties for filters & actions
  const landlords = await User.find({ organizationId, roles: "LANDLORD", deleted: false })
    .select("title firstName lastName landlordData")
    .sort({ firstName: 1, lastName: 1 })
    .lean();

  const properties = await Property.find({ organizationId, deleted: false })
    .select("addressLine1 city")
    .sort({ addressLine1: 1 })
    .lean();

  return {
    year,
    month,
    summary,
    payments,
    landlords: landlords.map(l => ({ ...l, _id: l._id.toString() })),
    properties: properties.map(pr => ({ ...pr, _id: pr._id.toString() })),
    filters: { statusFilter, propertyFilter, landlordFilter, searchFilter }
  };
}

export async function action({ request }) {
  const user = await getUserFromRequest(request);
  if (!user) return redirect("/login");

  await connect();
  const organizationId = user.organizationId;
  const formData = await request.formData();
  const intent = formData.get("intent");

  // Round amounts to 2dp helper
  const round2 = (n) => Math.round(n * 100) / 100;

  if (intent === "record-payment") {
    const paymentId = formData.get("paymentId");
    const amountPaid = round2(parseFloat(formData.get("amountPaid")) || 0);
    const paymentDateStr = formData.get("paymentDate");
    const paymentMethod = formData.get("paymentMethod");
    const reference = formData.get("reference") || null;
    const notes = formData.get("notes") || null;
    const isPartial = formData.get("isPartial") === "true";

    const payment = await RentPayment.findOne({ _id: paymentId, organizationId });
    if (!payment) return { success: false, error: "Payment record not found." };

    // ── Section 10 Rule 3: Use commission rates FROZEN on RentPayment at creation ──
    // NEVER re-fetch from the current property — rates may have changed since tenancy start.
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

    // Status mapping
    if (payment.amountOutstanding <= 0) {
      payment.status = "paid";
    } else {
      payment.status = "partial";
    }

    payment.paymentMethod = paymentMethod;
    payment.paymentReference = reference;
    payment.paidDate = paymentDateStr ? new Date(paymentDateStr) : new Date();
    payment.notes = notes;
    payment.recordedBy = user.userId;
    payment.recordedAt = new Date();

    await payment.save();

    if (payment.status === "paid") {
      await logRentReceived(payment, user);
    } else if (payment.status === "partial") {
      await logRentPartial(payment, user);
    }

    return { success: true, message: "Payment successfully recorded." };
  }

  if (intent === "waive-payment") {
    const paymentId = formData.get("paymentId");
    const waivedReason = formData.get("waivedReason");

    const payment = await RentPayment.findOne({ _id: paymentId, organizationId });
    if (!payment) return { success: false, error: "Payment record not found." };

    payment.status = "waived";
    payment.waivedBy = user.userId;
    payment.waivedAt = new Date();
    payment.waivedReason = waivedReason;
    payment.amountOutstanding = 0; // waived means no longer due

    await payment.save();

    await logRentWaived(payment, user, waivedReason);

    return { success: true, message: "Payment successfully waived." };
  }

  if (intent === "preview-disbursements") {
    const periodStartStr = formData.get("periodStart");
    const periodEndStr = formData.get("periodEnd");
    const landlordIds = formData.getAll("landlords"); // Array of selected landlord IDs

    const previews = [];
    const errors = [];

    for (const landlordId of landlordIds) {
      const landlord = await User.findOne({ _id: landlordId, organizationId }).lean();
      if (!landlord) continue;

      const preview = await calculateDisbursement(landlordId, organizationId, periodStartStr, periodEndStr);
      if (preview) {
        if (preview.error === "negative") {
          errors.push({
            landlordName: `${landlord.title ? landlord.title + ' ' : ''}${landlord.firstName} ${landlord.lastName}`,
            message: preview.message
          });
        } else {
          previews.push({
            landlordId,
            landlordName: `${landlord.title ? landlord.title + ' ' : ''}${landlord.firstName} ${landlord.lastName}`,
            bankDetails: landlord.landlordData?.bankDetails || {},
            ...preview
          });
        }
      }
    }

    return {
      success: true,
      intent: "preview-disbursements",
      previews,
      errors,
      periodStart: periodStartStr,
      periodEnd: periodEndStr
    };
  }

  if (intent === "confirm-disbursements") {
    const periodStartStr = formData.get("periodStart");
    const periodEndStr = formData.get("periodEnd");
    const selectedPreviewsJson = formData.get("selectedPreviewsJson");

    if (!selectedPreviewsJson) {
      return { success: false, error: "No disbursements selected." };
    }

    const selectedPreviews = JSON.parse(selectedPreviewsJson);
    let createdCount = 0;

    for (const item of selectedPreviews) {
      // Validate net amount again (redundancy check)
      if (item.netAmount <= 0) continue;

      // Check if already disbursed for this period to avoid duplicates
      const exists = await Disbursement.findOne({
        organizationId,
        landlordId: item.landlordId,
        periodStart: new Date(periodStartStr),
        periodEnd: new Date(periodEndStr),
        deleted: false
      });
      if (exists) continue;

      // Copy bank details snapshot
      const landlord = await User.findById(item.landlordId).select("landlordData").lean();
      const bankSnapshot = landlord?.landlordData?.bankDetails || {};

      await Disbursement.create({
        organizationId,
        landlordId: item.landlordId,
        propertyIds: item.propertyIds,
        rentPaymentIds: item.rentPaymentIds,
        periodStart: new Date(periodStartStr),
        periodEnd: new Date(periodEndStr),
        grossRent: item.grossRent,
        totalCommission: item.totalCommission,
        totalVat: item.totalVat,
        netAmount: item.netAmount,
        landlordBankSnapshot: {
          accountName: bankSnapshot.accountName || null,
          accountNumber: bankSnapshot.accountNumber || null,
          sortCode: bankSnapshot.sortCode || null,
          bankName: bankSnapshot.bankName || null,
        },
        createdBy: user.userId,
        status: "pending"
      });

      createdCount++;
    }

    return { success: true, message: `Successfully generated ${createdCount} landlord disbursement(s).` };
  }

  return { success: false, error: "Invalid intent action." };
}

export default function RentTracker() {
  const { year, month, summary, payments, landlords, properties, filters } = useLoaderData();
  const actionData = useActionData();
  const submit = useSubmit();
  const navigation = useNavigation();
  const [searchParams, setSearchParams] = useSearchParams();

  // Search/Filter state
  const [searchText, setSearchText] = useState(filters.searchFilter);
  const [statusVal, setStatusVal] = useState(filters.statusFilter);
  const [propertyVal, setPropertyVal] = useState(filters.propertyFilter);
  const [landlordVal, setLandlordVal] = useState(filters.landlordFilter);

  // Modals state
  const [activePaymentModal, setActivePaymentModal] = useState(null); // stores payment object
  const [activeWaiveModal, setActiveWaiveModal] = useState(null); // stores payment object
  const [isDisbursementModalOpen, setIsDisbursementModalOpen] = useState(false);
  const [selectedDisbLandlords, setSelectedDisbLandlords] = useState([]);
  const [disbStartMonth, setDisbStartMonth] = useState(`${year}-${String(month).padStart(2, "0")}`);
  const [disbEndMonth, setDisbEndMonth] = useState(`${year}-${String(month).padStart(2, "0")}`);

  // Action feedback
  useEffect(() => {
    if (actionData?.success && actionData?.message) {
      setActivePaymentModal(null);
      setActiveWaiveModal(null);
      // Close disbursement preview after confirm
      if (actionData.intent !== "preview-disbursements") {
        setIsDisbursementModalOpen(false);
      }
    }
  }, [actionData]);

  // Adjust Month
  const adjustMonth = (delta) => {
    let newMonth = month + delta;
    let newYear = year;
    if (newMonth > 12) {
      newMonth = 1;
      newYear += 1;
    } else if (newMonth < 1) {
      newMonth = 12;
      newYear -= 1;
    }
    const params = new URLSearchParams(searchParams);
    params.set("month", newMonth);
    params.set("year", newYear);
    setSearchParams(params);
  };

  // Run filters
  const applyFilters = () => {
    const params = new URLSearchParams(searchParams);
    if (searchText) params.set("search", searchText);
    else params.delete("search");

    if (statusVal !== "all") params.set("status", statusVal);
    else params.delete("status");

    if (propertyVal !== "all") params.set("property", propertyVal);
    else params.delete("property");

    if (landlordVal !== "all") params.set("landlord", landlordVal);
    else params.delete("landlord");

    setSearchParams(params);
  };

  // Render Month string
  const dateObj = new Date(year, month - 1, 1);
  const selectedMonthStr = dateObj.toLocaleString("en-GB", { month: "long", year: "numeric" });

  const formatCurrency = (amt) => {
    return (amt || 0).toLocaleString("en-GB", {
      style: "currency",
      currency: "GBP"
    });
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-4 md:p-6 text-[#1E293B] bg-[#F8FAFC]">
      {/* ── HEADER ROW ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#E2E8F0] pb-5">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[#1E293B]">Rent Tracker</h1>
          <p className="text-xs text-[#94A3B8] font-medium">Manage monthly tenancies rent payments, arrears and landlord payouts.</p>
        </div>

        <div className="flex items-center flex-wrap gap-2.5">
          {/* Month Selector */}
          <div className="flex items-center bg-white border border-[#E2E8F0] rounded-lg p-1 shadow-sm">
            <button 
              onClick={() => adjustMonth(-1)}
              className="p-1.5 hover:bg-slate-100 rounded-md text-[#475569] transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
            </button>
            <span className="px-3 text-xs font-bold text-[#1E293B] min-w-[100px] text-center uppercase tracking-wider select-none">
              {selectedMonthStr}
            </span>
            <button 
              onClick={() => adjustMonth(1)}
              className="p-1.5 hover:bg-slate-100 rounded-md text-[#475569] transition-colors"
            >
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <Link
            to="/transactions/import"
            className="flex items-center gap-1.5 px-3 py-2 bg-white border border-[#E2E8F0] text-xs font-semibold rounded-lg hover:bg-slate-50 transition shadow-sm text-[#475569]"
          >
            <Upload className="w-3.5 h-3.5 text-[#94A3B8]" />
            Import Bank Statement
          </Link>

          <button
            onClick={() => setIsDisbursementModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-[#2563EB] text-white text-xs font-semibold rounded-lg hover:bg-[#1D4ED8] transition shadow-sm"
          >
            <Zap className="w-3.5 h-3.5" />
            Generate Disbursements
          </button>
        </div>
      </div>

      {/* ── METRICS BAR ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-sm relative overflow-hidden">
          <p className="text-[10px] font-bold text-[#94A3B8] uppercase tracking-wider">Expected This Month</p>
          <p className="text-xl font-extrabold text-[#1E293B] mt-1 tracking-tight">{formatCurrency(summary.expected)}</p>
          <div className="absolute top-4 right-4 bg-slate-50 p-1.5 rounded-lg border border-[#E2E8F0]">
            <Calendar className="w-4 h-4 text-[#94A3B8]" />
          </div>
        </div>

        <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-sm relative overflow-hidden">
          <p className="text-[10px] font-bold text-[#94A3B8] uppercase tracking-wider">Collected</p>
          <p className="text-xl font-extrabold text-[#16A34A] mt-1 tracking-tight">{formatCurrency(summary.collected)}</p>
          <div className="absolute top-4 right-4 bg-emerald-50 p-1.5 rounded-lg border border-emerald-100">
            <CheckCircle2 className="w-4 h-4 text-[#16A34A]" />
          </div>
        </div>

        <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-sm relative overflow-hidden">
          <p className="text-[10px] font-bold text-[#94A3B8] uppercase tracking-wider">Outstanding (Arrears)</p>
          <p className="text-xl font-extrabold text-[#DC2626] mt-1 tracking-tight">{formatCurrency(summary.outstanding)}</p>
          <div className="absolute top-4 right-4 bg-red-50 p-1.5 rounded-lg border border-red-100">
            <AlertTriangle className="w-4 h-4 text-[#DC2626]" />
          </div>
        </div>

        <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-sm relative overflow-hidden">
          <p className="text-[10px] font-bold text-[#94A3B8] uppercase tracking-wider">Disbursed to Landlords</p>
          <p className="text-xl font-extrabold text-[#2563EB] mt-1 tracking-tight">{formatCurrency(summary.disbursed)}</p>
          <div className="absolute top-4 right-4 bg-blue-50 p-1.5 rounded-lg border border-blue-100">
            <PoundSterling className="w-4 h-4 text-[#2563EB]" />
          </div>
        </div>
      </div>

      {/* ── ARREARS ALERT BANNER ── */}
      {summary.arrearsCount > 0 && (
        <div className="flex items-center justify-between p-3.5 bg-amber-50/70 border border-amber-200/80 rounded-xl text-xs text-amber-800">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-[#D97706] shrink-0" />
            <span>
              <strong>Arrears Alert:</strong> {summary.arrearsCount} tenancy payments are overdue or only partially paid this month.
            </span>
          </div>
          <button 
            onClick={() => { setStatusVal("overdue"); setTimeout(applyFilters, 50); }}
            className="font-bold text-[#D97706] hover:underline"
          >
            Filter Overdue →
          </button>
        </div>
      )}

      {/* ── FILTERS BAR ── */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-sm flex flex-col lg:flex-row gap-4 items-end lg:items-center">
        <div className="flex-1 w-full grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="text-[10px] font-bold text-[#475569] uppercase tracking-wider">Search</label>
            <div className="relative mt-1">
              <Search className="w-3.5 h-3.5 text-[#94A3B8] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Address or tenant name..."
                value={searchText}
                onChange={e => setSearchText(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 border border-[#E2E8F0] rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-[#2563EB]"
              />
            </div>
          </div>

          <div>
            <label className="text-[10px] font-bold text-[#475569] uppercase tracking-wider">Status</label>
            <select
              value={statusVal}
              onChange={e => setStatusVal(e.target.value)}
              className="w-full mt-1 border border-[#E2E8F0] rounded-lg text-xs px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#2563EB] bg-white"
            >
              <option value="all">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="due">Due</option>
              <option value="partial">Partial</option>
              <option value="paid">Paid</option>
              <option value="overdue">Overdue</option>
              <option value="waived">Waived</option>
            </select>
          </div>

          <div>
            <label className="text-[10px] font-bold text-[#475569] uppercase tracking-wider">Property</label>
            <select
              value={propertyVal}
              onChange={e => setPropertyVal(e.target.value)}
              className="w-full mt-1 border border-[#E2E8F0] rounded-lg text-xs px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#2563EB] bg-white"
            >
              <option value="all">All Properties</option>
              {properties.map(pr => (
                <option key={pr._id} value={pr._id}>{pr.addressLine1}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[10px] font-bold text-[#475569] uppercase tracking-wider">Landlord</label>
            <select
              value={landlordVal}
              onChange={e => setLandlordVal(e.target.value)}
              className="w-full mt-1 border border-[#E2E8F0] rounded-lg text-xs px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#2563EB] bg-white"
            >
              <option value="all">All Landlords</option>
              {landlords.map(l => (
                <option key={l._id} value={l._id}>{l.title ? l.title + ' ' : ''}{l.firstName} {l.lastName}</option>
              ))}
            </select>
          </div>
        </div>

        <button
          onClick={applyFilters}
          className="px-4 py-2 bg-slate-900 text-white rounded-lg text-xs font-semibold hover:bg-black transition shadow-sm w-full lg:w-auto"
        >
          Apply Filters
        </button>
      </div>

      {/* ── TABLE OF PAYMENTS ── */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-[#E2E8F0] text-[10px] font-bold text-[#475569] uppercase tracking-wider">
                <th className="p-4">Property</th>
                <th className="p-4">Tenant(s)</th>
                <th className="p-4">Landlord</th>
                <th className="p-4 text-right">Rent Due</th>
                <th className="p-4 text-right">Paid</th>
                <th className="p-4 text-right">Commission</th>
                <th className="p-4 text-right">Net to Landlord</th>
                <th className="p-4">Due Date</th>
                <th className="p-4">Status</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8F0]">
              {payments.length === 0 ? (
                <tr>
                  <td colSpan="10" className="p-12 text-center text-xs text-[#94A3B8]">
                    No matching rent payments found for this period.
                  </td>
                </tr>
              ) : (
                payments.map(p => {
                  const statusColors = {
                    paid: "bg-green-50 text-[#16A34A] border-green-200",
                    partial: "bg-amber-50 text-[#D97706] border-amber-200",
                    overdue: "bg-red-50 text-[#DC2626] border-red-200",
                    due: "bg-amber-50 text-[#D97706] border-amber-200",
                    pending: "bg-slate-50 text-[#475569] border-[#E2E8F0]",
                    waived: "bg-slate-50 text-[#94A3B8] border-[#E2E8F0] line-through"
                  };

                  const tenantsList = p.tenancyId?.tenants?.map(t => `${t.title ? t.title + ' ' : ''}${t.firstName} ${t.lastName}`).join(", ") || "—";

                  return (
                    <tr key={p._id} className="text-xs hover:bg-slate-50/50 transition-colors">
                      <td className="p-4 font-bold text-[#1E293B]">
                        <Link to={`/rent/${p.tenancyId?._id}`} className="hover:underline hover:text-[#2563EB]">
                          {p.propertyId?.addressLine1 || "—"}
                        </Link>
                      </td>
                      <td className="p-4 text-[#475569] truncate max-w-[150px]">{tenantsList}</td>
                      <td className="p-4 text-[#475569]">
                        <Link to={`/rent/landlord/${p.landlordId?._id}`} className="hover:underline font-medium text-[#475569]">
                          {p.landlordId ? `${p.landlordId.title ? p.landlordId.title + ' ' : ''}${p.landlordId.firstName} ${p.landlordId.lastName}` : "—"}
                        </Link>
                      </td>
                      <td className="p-4 text-right font-semibold text-[#1E293B]">{formatCurrency(p.amountDue)}</td>
                      <td className="p-4 text-right font-medium text-[#16A34A]">{p.amountPaid > 0 ? formatCurrency(p.amountPaid) : "—"}</td>
                      <td className="p-4 text-right text-[#94A3B8]">
                        {p.commissionAmount != null ? formatCurrency(p.commissionAmount) : "—"}
                      </td>
                      <td className="p-4 text-right font-semibold text-[#2563EB]">
                        {p.netToLandlord != null ? formatCurrency(p.netToLandlord) : "—"}
                      </td>
                      <td className="p-4 text-[#475569] font-medium">{new Date(p.dueDate).toLocaleDateString("en-GB")}</td>
                      <td className="p-4">
                        <span className={`inline-flex px-2 py-0.5 rounded-full border text-[10px] font-bold ${statusColors[p.status] || statusColors.pending}`}>
                          {p.status}
                        </span>
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {p.status !== "paid" && p.status !== "waived" && (
                            <>
                              <button
                                onClick={() => setActivePaymentModal(p)}
                                className="px-2.5 py-1 bg-slate-900 text-white hover:bg-black rounded-md text-[10px] font-semibold transition"
                              >
                                Record
                              </button>
                              <button
                                onClick={() => setActiveWaiveModal(p)}
                                className="px-2 py-1 bg-white hover:bg-slate-50 border border-[#E2E8F0] rounded-md text-[10px] font-semibold text-[#475569] transition"
                              >
                                Waive
                              </button>
                            </>
                          )}
                          <Link
                            to={`/rent/${p.tenancyId?._id}`}
                            className="p-1 hover:bg-slate-100 rounded-md text-[#94A3B8] hover:text-[#1E293B]"
                          >
                            <Eye className="w-3.5 h-3.5" />
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

      {/* ── MODAL: RECORD PAYMENT ── */}
      {activePaymentModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-[#E2E8F0] rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="flex justify-between items-center bg-slate-50 px-5 py-4 border-b border-[#E2E8F0]">
              <div>
                <h3 className="text-sm font-bold text-[#1E293B]">Record Rent Payment</h3>
                <p className="text-[10px] text-[#94A3B8] font-medium mt-0.5">{activePaymentModal.propertyId?.addressLine1}</p>
              </div>
              <button onClick={() => setActivePaymentModal(null)} className="text-[#94A3B8] hover:text-[#1E293B]">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5">
              <RecordPaymentForm 
                payment={activePaymentModal} 
                onCancel={() => setActivePaymentModal(null)}
                onSubmit={(fd) => {
                  submit(fd, { method: "post" });
                }} 
              />
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: WAIVE PAYMENT ── */}
      {activeWaiveModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-[#E2E8F0] rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="flex justify-between items-center bg-slate-50 px-5 py-4 border-b border-[#E2E8F0]">
              <div>
                <h3 className="text-sm font-bold text-[#1E293B]">Waive Rent Payment</h3>
                <p className="text-[10px] text-[#94A3B8] font-medium mt-0.5">{activeWaiveModal.propertyId?.addressLine1}</p>
              </div>
              <button onClick={() => setActiveWaiveModal(null)} className="text-[#94A3B8] hover:text-[#1E293B]">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form method="post" className="p-5 space-y-4">
              <input type="hidden" name="intent" value="waive-payment" />
              <input type="hidden" name="paymentId" value={activeWaiveModal._id} />

              <div className="bg-amber-50 border border-amber-100 p-3 rounded-lg text-xs text-amber-800 flex gap-2">
                <Info className="w-4 h-4 text-[#D97706] shrink-0" />
                <span>
                  Waiving this payment means the outstanding amount will be set to zero and no longer marked as due. This action is irreversible.
                </span>
              </div>

              <div>
                <label className="text-[10px] font-bold text-[#475569] uppercase tracking-wider block">Reason for Waiving *</label>
                <textarea
                  name="waivedReason"
                  required
                  placeholder="e.g. Tenancy ended early / Landlord agreed to discount final month..."
                  rows="3"
                  className="w-full mt-1.5 border border-[#E2E8F0] rounded-lg text-xs p-2.5 focus:outline-none focus:ring-1 focus:ring-[#2563EB]"
                ></textarea>
              </div>

              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setActiveWaiveModal(null)}
                  className="px-4 py-2 border border-[#E2E8F0] text-xs font-semibold rounded-lg text-[#475569] hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-red-600 text-white rounded-lg text-xs font-semibold hover:bg-red-700 transition"
                >
                  Waive Payment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: GENERATE DISBURSEMENTS (PREVIEW & CONFIRM) ── */}
      {isDisbursementModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-[#E2E8F0] rounded-xl shadow-xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden">
            <div className="flex justify-between items-center bg-slate-50 px-5 py-4 border-b border-[#E2E8F0] shrink-0">
              <div>
                <h3 className="text-sm font-bold text-[#1E293B]">Generate Landlord Disbursements</h3>
                <p className="text-[10px] text-[#94A3B8] font-medium mt-0.5">Calculate and generate net payout files for landlords.</p>
              </div>
              <button onClick={() => setIsDisbursementModalOpen(false)} className="text-[#94A3B8] hover:text-[#1E293B]">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {/* If no previews loaded yet, show setup */}
              {!actionData?.previews && (
                <form method="post" className="space-y-4">
                  <input type="hidden" name="intent" value="preview-disbursements" />

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] font-bold text-[#475569] uppercase tracking-wider block">Period Start</label>
                      <input
                        type="date"
                        name="periodStart"
                        required
                        defaultValue={`${year}-${String(month).padStart(2, "0")}-01`}
                        className="w-full mt-1.5 border border-[#E2E8F0] rounded-lg text-xs p-2.5 focus:outline-none focus:ring-1 focus:ring-[#2563EB]"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-[#475569] uppercase tracking-wider block">Period End</label>
                      <input
                        type="date"
                        name="periodEnd"
                        required
                        defaultValue={`${year}-${String(month).padStart(2, "0")}-${new Date(year, month, 0).getDate()}`}
                        className="w-full mt-1.5 border border-[#E2E8F0] rounded-lg text-xs p-2.5 focus:outline-none focus:ring-1 focus:ring-[#2563EB]"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-1.5">
                      <label className="text-[10px] font-bold text-[#475569] uppercase tracking-wider block">Select Landlords</label>
                      <button
                        type="button"
                        onClick={() => setSelectedDisbLandlords(landlords.map(l => l._id))}
                        className="text-[10px] font-bold text-[#2563EB] hover:underline"
                      >
                        Select All
                      </button>
                    </div>
                    <div className="border border-[#E2E8F0] rounded-lg p-3 max-h-48 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {landlords.map(l => (
                        <label key={l._id} className="flex items-center gap-2 text-xs text-[#475569] cursor-pointer hover:bg-slate-50 p-1 rounded">
                          <input
                            type="checkbox"
                            name="landlords"
                            value={l._id}
                            checked={selectedDisbLandlords.includes(l._id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedDisbLandlords(prev => [...prev, l._id]);
                              } else {
                                setSelectedDisbLandlords(prev => prev.filter(id => id !== l._id));
                              }
                            }}
                            className="rounded border-[#E2E8F0] text-[#2563EB] focus:ring-0"
                          />
                          <span>{l.title ? l.title + ' ' : ''}{l.firstName} {l.lastName}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="flex justify-end gap-2.5 pt-2">
                    <button
                      type="button"
                      onClick={() => setIsDisbursementModalOpen(false)}
                      className="px-4 py-2 border border-[#E2E8F0] text-xs font-semibold rounded-lg text-[#475569] hover:bg-slate-50 transition"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={selectedDisbLandlords.length === 0 || navigation.state === "submitting"}
                      className="px-4 py-2 bg-[#2563EB] hover:bg-[#1D4ED8] text-white rounded-lg text-xs font-semibold transition disabled:opacity-50"
                    >
                      {navigation.state === "submitting" ? "Calculating..." : "Preview Calculations"}
                    </button>
                  </div>
                </form>
              )}

              {/* Preview loaded, show preview and confirmation form */}
              {actionData?.previews && (
                <DisbursementPreviewSection 
                  actionData={actionData} 
                  onConfirm={(selectedPreviews) => {
                    const fd = new FormData();
                    fd.append("intent", "confirm-disbursements");
                    fd.append("periodStart", actionData.periodStart);
                    fd.append("periodEnd", actionData.periodEnd);
                    fd.append("selectedPreviewsJson", JSON.stringify(selectedPreviews));
                    submit(fd, { method: "post" });
                  }}
                  onCancel={() => {
                    // reset actionData preview view
                    submit(new FormData(), { method: "get" });
                  }}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── SUB-COMPONENT: RECORD PAYMENT FORM ──
function RecordPaymentForm({ payment, onSubmit, onCancel }) {
  const [amountPaid, setAmountPaid] = useState(payment.amountDue);
  const [isPartial, setIsPartial] = useState(false);

  // Compute live commission details based on amountPaid state
  const commType = payment.commissionType;
  const commRate = payment.commissionRate;
  
  let commAmount = 0;
  if (commType === "percentage" && commRate) {
    commAmount = (amountPaid * commRate) / 100;
  } else if (commType === "fixed" && commRate) {
    commAmount = Math.min(commRate, amountPaid);
  }
  commAmount = Math.round(commAmount * 100) / 100;

  // Let's assume VAT if commission details say so (e.g. 20% on commission if registered)
  const isVatRegistered = payment.propertyId?.commission?.vatRegistered || false;
  const vatAmount = isVatRegistered ? Math.round(commAmount * 0.20 * 100) / 100 : 0;
  const netToLandlord = Math.round((amountPaid - commAmount - vatAmount) * 100) / 100;

  const handleSubmit = (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.append("intent", "record-payment");
    fd.append("paymentId", payment._id);
    fd.append("isPartial", String(isPartial));
    onSubmit(fd);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-[10px] font-bold text-[#475569] uppercase tracking-wider">Expected Rent</label>
          <div className="mt-1.5 p-2 bg-slate-50 border border-[#E2E8F0] rounded-lg text-xs font-bold text-[#1E293B]">
            £{payment.amountDue.toLocaleString("en-GB", { minimumFractionDigits: 2 })}
          </div>
        </div>
        <div>
          <label className="text-[10px] font-bold text-[#475569] uppercase tracking-wider">Period</label>
          <div className="mt-1.5 p-2 bg-slate-50 border border-[#E2E8F0] rounded-lg text-xs font-medium text-[#475569]">
            {new Date(payment.periodStart).toLocaleDateString("en-GB", { month: "short", year: "numeric" })}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 py-1">
        <input
          type="checkbox"
          id="isPartialCheckbox"
          checked={isPartial}
          onChange={(e) => {
            setIsPartial(e.target.checked);
            if (!e.target.checked) setAmountPaid(payment.amountDue);
          }}
          className="rounded border-[#E2E8F0] text-[#2563EB] focus:ring-0 cursor-pointer"
        />
        <label htmlFor="isPartialCheckbox" className="text-xs text-[#475569] font-medium cursor-pointer select-none">
          Partial payment agreement
        </label>
      </div>

      <div>
        <label className="text-[10px] font-bold text-[#475569] uppercase tracking-wider block">Amount Received (£) *</label>
        <input
          type="number"
          name="amountPaid"
          step="0.01"
          required
          min="0.01"
          max={isPartial ? payment.amountDue - 0.01 : undefined}
          value={amountPaid}
          onChange={e => setAmountPaid(parseFloat(e.target.value) || 0)}
          readOnly={!isPartial}
          className={`w-full mt-1.5 border border-[#E2E8F0] rounded-lg text-xs p-2.5 focus:outline-none focus:ring-1 focus:ring-[#2563EB] ${!isPartial ? "bg-slate-50 font-semibold" : ""}`}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-[10px] font-bold text-[#475569] uppercase tracking-wider block">Payment Date *</label>
          <input
            type="date"
            name="paymentDate"
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
            <option value="standing_order">Standing Order</option>
            <option value="bacs_transfer">BACS Transfer</option>
            <option value="direct_debit">Direct Debit</option>
            <option value="cash">Cash</option>
            <option value="cheque">Cheque</option>
            <option value="other">Other</option>
          </select>
        </div>
      </div>

      <div>
        <label className="text-[10px] font-bold text-[#475569] uppercase tracking-wider block">Payment Reference</label>
        <input
          type="text"
          name="reference"
          placeholder="e.g. bank transaction ID"
          className="w-full mt-1.5 border border-[#E2E8F0] rounded-lg text-xs p-2.5 focus:outline-none focus:ring-1 focus:ring-[#2563EB]"
        />
      </div>

      <div>
        <label className="text-[10px] font-bold text-[#475569] uppercase tracking-wider block">Notes / Observations</label>
        <textarea
          name="notes"
          rows="2"
          placeholder="e.g. tenant paid late due to bank holiday..."
          className="w-full mt-1.5 border border-[#E2E8F0] rounded-lg text-xs p-2.5 focus:outline-none focus:ring-1 focus:ring-[#2563EB]"
        ></textarea>
      </div>

      {/* Live calculations display box */}
      <div className="border border-[#E2E8F0] rounded-xl bg-slate-50/50 p-4 space-y-2">
        <p className="text-[9px] font-bold text-[#94A3B8] uppercase tracking-wider">Live Commission Summary</p>
        <div className="flex justify-between items-center text-xs text-[#475569]">
          <span>Gross Received:</span>
          <span className="font-semibold text-[#1E293B]">£{amountPaid.toFixed(2)}</span>
        </div>
        <div className="flex justify-between items-center text-xs text-[#475569]">
          <span>Commission ({commType === "percentage" ? `${commRate}%` : "Fixed"}):</span>
          <span className="font-semibold text-red-600">- £{commAmount.toFixed(2)}</span>
        </div>
        {vatAmount > 0 && (
          <div className="flex justify-between items-center text-xs text-[#475569]">
            <span>VAT on Commission (20%):</span>
            <span className="font-semibold text-red-600">- £{vatAmount.toFixed(2)}</span>
          </div>
        )}
        <div className="border-t border-[#E2E8F0] pt-2 mt-2 flex justify-between items-center text-xs font-bold text-[#1E293B]">
          <span>Net Payout to Landlord:</span>
          <span className="text-[#2563EB] text-sm">£{netToLandlord.toFixed(2)}</span>
        </div>
      </div>

      <div className="flex justify-end gap-2.5 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 border border-[#E2E8F0] text-xs font-semibold rounded-lg text-[#475569] hover:bg-slate-50 transition"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="px-4 py-2 bg-slate-900 text-white rounded-lg text-xs font-semibold hover:bg-black transition shadow-sm"
        >
          Record Payment
        </button>
      </div>
    </form>
  );
}

// ── SUB-COMPONENT: DISBURSEMENT PREVIEW SECTION ──
function DisbursementPreviewSection({ actionData, onConfirm, onCancel }) {
  const [selectedLandlords, setSelectedLandlords] = useState(
    actionData.previews.map(p => p.landlordId)
  );

  const formatVal = (v) => v.toLocaleString("en-GB", { style: "currency", currency: "GBP" });

  const activePreviews = actionData.previews.filter(p => selectedLandlords.includes(p.landlordId));
  const totalNetAmt = activePreviews.reduce((s, p) => s + p.netAmount, 0);

  const handleConfirm = () => {
    onConfirm(activePreviews);
  };

  return (
    <div className="space-y-4">
      {/* Validation Errors Header (if any negative net calculations) */}
      {actionData.errors?.length > 0 && (
        <div className="border border-red-200 bg-red-50/50 p-4 rounded-xl space-y-2">
          <p className="text-xs font-bold text-red-700 flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4" />
            Negative Net Payouts Detected (Skipped from generation)
          </p>
          <ul className="list-disc pl-5 text-xs text-red-600 space-y-1">
            {actionData.errors.map((e, idx) => (
              <li key={idx}>
                <strong>{e.landlordName}</strong>: {e.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="bg-slate-50 border border-[#E2E8F0] p-4 rounded-xl flex items-center justify-between">
        <div>
          <p className="text-xs font-bold text-[#1E293B]">Disbursement Period</p>
          <p className="text-[10px] text-[#94A3B8] mt-0.5">
            {new Date(actionData.periodStart).toLocaleDateString("en-GB")} to {new Date(actionData.periodEnd).toLocaleDateString("en-GB")}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-bold text-[#94A3B8] uppercase tracking-wider">Total Net Disbursements</p>
          <p className="text-lg font-black text-[#2563EB]">{formatVal(totalNetAmt)}</p>
        </div>
      </div>

      <div className="border border-[#E2E8F0] rounded-xl overflow-hidden shadow-sm">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-[#E2E8F0] text-[10px] font-bold text-[#475569] uppercase tracking-wider">
              <th className="p-3 w-10">Select</th>
              <th className="p-3">Landlord</th>
              <th className="p-3">Bank Details Snapshot</th>
              <th className="p-3 text-right">Gross Rent</th>
              <th className="p-3 text-right">Commission</th>
              <th className="p-3 text-right">VAT</th>
              <th className="p-3 text-right">Net Payout</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E2E8F0] text-xs">
            {actionData.previews.map((item) => (
              <tr key={item.landlordId} className="hover:bg-slate-50/50">
                <td className="p-3 text-center">
                  <input
                    type="checkbox"
                    checked={selectedLandlords.includes(item.landlordId)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedLandlords(prev => [...prev, item.landlordId]);
                      } else {
                        setSelectedLandlords(prev => prev.filter(id => id !== item.landlordId));
                      }
                    }}
                    className="rounded border-[#E2E8F0] text-[#2563EB] focus:ring-0 cursor-pointer"
                  />
                </td>
                <td className="p-3 font-semibold text-[#1E293B]">{item.landlordName}</td>
                <td className="p-3 text-[#475569]">
                  {item.bankDetails?.accountNumber ? (
                    <div>
                      <p className="font-bold text-[10px] text-[#1E293B]">{item.bankDetails.accountName}</p>
                      <p className="text-[10px] text-[#94A3B8] font-mono mt-0.5">Acc: {item.bankDetails.accountNumber} | Sort: {item.bankDetails.sortCode}</p>
                    </div>
                  ) : (
                    <span className="text-red-500 font-semibold text-[10px] uppercase tracking-wide">Missing Bank Details</span>
                  )}
                </td>
                <td className="p-3 text-right font-medium">{formatVal(item.grossRent)}</td>
                <td className="p-3 text-right text-[#94A3B8] font-medium">{formatVal(item.totalCommission)}</td>
                <td className="p-3 text-right text-[#94A3B8] font-medium">{formatVal(item.totalVat)}</td>
                <td className="p-3 text-right font-semibold text-[#2563EB]">{formatVal(item.netAmount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex justify-between items-center pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 border border-[#E2E8F0] text-xs font-semibold rounded-lg text-[#475569] hover:bg-slate-50 transition"
        >
          ← Recalculate
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={activePreviews.length === 0}
          className="px-4 py-2 bg-[#16A34A] hover:bg-[#15803D] text-white rounded-lg text-xs font-semibold transition disabled:opacity-50"
        >
          Confirm & Generate {activePreviews.length} Disbursement(s)
        </button>
      </div>
    </div>
  );
}

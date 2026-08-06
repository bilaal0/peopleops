// routes/transactions/index.jsx
// Agency Financial Profit & Loss / Transactions Overview Page.
// Shows monthly summaries, 6-month SVG charts, expenses log, disbursements log,
// and inline expense adding.
//
// Rules (from Section 10):
// - Strict agency isolation enforced
// - Rounding to 2dp
// - Soft delete only
// - Custom SVG visual elements to bypass Recharts issues

import { useState, useEffect } from "react";
import { Link, useLoaderData, useActionData, useSubmit, useNavigation, useSearchParams } from "react-router";
import { redirect } from "react-router";
import { getUserFromRequest } from "../../utils/auth.server.js";
import { connect } from "../../config/db.server.js";
import { AgencyExpense } from "../../models/agencyExpense.server.js";
import { Disbursement } from "../../models/disbursement.server.js";
import { Property } from "../../models/property.server.js";
import { RentPayment } from "../../models/rentPayment.server.js";
import { getAgencyFinancialSummary, getLast6MonthsSummary } from "../../utils/transactions.server.js";
import { 
  ArrowLeft, 
  ArrowRight, 
  PoundSterling, 
  TrendingUp, 
  Plus, 
  CheckCircle2, 
  Clock, 
  Tag, 
  Calendar,
  AlertTriangle,
  Upload,
  PieChart,
  DollarSign,
  X
} from "lucide-react";

export async function loader({ request }) {
  const user = await getUserFromRequest(request);
  if (!user) return redirect("/login");
  if (!user.agencyId && !user.roles?.includes("SUPER_ADMIN")) return redirect("/dashboard");

  await connect();
  const agencyId = user.agencyId;

  // Month navigation
  const url = new URL(request.url);
  const now = new Date();
  const year = parseInt(url.searchParams.get("year")) || now.getFullYear();
  const month = parseInt(url.searchParams.get("month")) || (now.getMonth() + 1);

  const periodStart = new Date(year, month - 1, 1);
  const periodEnd = new Date(year, month, 0, 23, 59, 59, 999);

  // 1. Fetch current month's financial metrics
  const summary = await getAgencyFinancialSummary(agencyId, year, month);

  // 2. Fetch last 6 months trend
  const trend = await getLast6MonthsSummary(agencyId);

  // 3. Fetch Disbursements paid/pending in this month
  const disbursements = await Disbursement.find({
    agencyId,
    deleted: false,
    $or: [
      { paidDate: { $gte: periodStart, $lte: periodEnd } },
      { createdAt: { $gte: periodStart, $lte: periodEnd }, status: "pending" }
    ]
  })
    .populate("landlordId", "title firstName lastName")
    .sort({ createdAt: -1 })
    .lean();

  // 4. Fetch Agency Expenses in this month
  const expenses = await AgencyExpense.find({
    agencyId,
    date: { $gte: periodStart, $lte: periodEnd },
    deleted: false
  })
    .populate("propertyId", "addressLine1")
    .sort({ date: -1 })
    .lean();

  // 5. Fetch properties for expense linking dropdown
  const properties = await Property.find({ agencyId, deleted: false }).select("addressLine1").lean();

  // 6. Fetch Rent Payments for commission breakdown
  const payments = await RentPayment.find({
    agencyId,
    deleted: false,
    periodStart: { $gte: periodStart, $lte: periodEnd }
  })
    .populate("propertyId", "addressLine1")
    .populate("landlordId", "title firstName lastName")
    .lean();

  const breakdownMap = {};
  for (const p of payments) {
    if (!p.propertyId) continue;
    const propId = p.propertyId._id.toString();
    if (!breakdownMap[propId]) {
      breakdownMap[propId] = {
        propertyAddress: p.propertyId.addressLine1,
        landlordName: p.landlordId ? `${p.landlordId.title ? p.landlordId.title + ' ' : ''}${p.landlordId.firstName} ${p.landlordId.lastName}` : "—",
        commissionType: p.commissionType,
        commissionRate: p.commissionRate,
        totalRent: 0,
        totalCommission: 0,
      };
    }
    breakdownMap[propId].totalRent += (p.amountPaid || 0);
    breakdownMap[propId].totalCommission += (p.commissionAmount || 0) + (p.vatAmount || 0);
  }

  const commissionBreakdown = Object.values(breakdownMap)
    .sort((a, b) => b.totalCommission - a.totalCommission)
    .map(b => ({
      ...b,
      totalRent: Math.round(b.totalRent * 100) / 100,
      totalCommission: Math.round(b.totalCommission * 100) / 100
    }));

  return {
    year,
    month,
    summary,
    trend,
    disbursements: disbursements.map(d => ({
      ...d,
      _id: d._id.toString(),
      landlordId: d.landlordId ? { ...d.landlordId, _id: d.landlordId._id.toString() } : null
    })),
    expenses: expenses.map(e => ({
      ...e,
      _id: e._id.toString(),
      propertyId: e.propertyId ? { ...e.propertyId, _id: e.propertyId._id.toString() } : null
    })),
    commissionBreakdown,
    properties: properties.map(pr => ({ ...pr, _id: pr._id.toString() }))
  };
}

export async function action({ request }) {
  const user = await getUserFromRequest(request);
  if (!user) return redirect("/login");

  await connect();
  const agencyId = user.agencyId;
  const formData = await request.formData();
  const intent = formData.get("intent");

  const round2 = (n) => Math.round(n * 100) / 100;

  if (intent === "add-expense") {
    const category = formData.get("category");
    const description = formData.get("description");
    const amount = round2(parseFloat(formData.get("amount")) || 0);
    const vatAmount = round2(parseFloat(formData.get("vatAmount")) || 0);
    const dateStr = formData.get("date");
    const propertyId = formData.get("propertyId") || null;
    const paymentMethod = formData.get("paymentMethod");
    const reference = formData.get("reference") || "";
    const notes = formData.get("notes") || "";

    if (!category || !description || amount <= 0 || !dateStr) {
      return { success: false, error: "Category, description, positive amount and date are required." };
    }

    await AgencyExpense.create({
      agencyId,
      category,
      description,
      amount,
      vatAmount,
      date: new Date(dateStr),
      propertyId: propertyId || null,
      paymentMethod,
      reference,
      notes,
      createdBy: user.userId
    });

    return { success: true, message: "Agency expense successfully logged." };
  }

  if (intent === "delete-expense") {
    const expenseId = formData.get("expenseId");
    
    const expense = await AgencyExpense.findOne({ _id: expenseId, agencyId });
    if (!expense) return { success: false, error: "Expense not found." };

    expense.deleted = true;
    expense.deletedAt = new Date();
    expense.deletedBy = user.userId;

    await expense.save();

    return { success: true, message: "Expense successfully deleted." };
  }

  return { success: false, error: "Invalid action intent." };
}

export default function TransactionsOverview() {
  const { year, month, summary, trend, disbursements, expenses, commissionBreakdown, properties } = useLoaderData();
  const actionData = useActionData();
  const submit = useSubmit();
  const navigation = useNavigation();
  const [searchParams, setSearchParams] = useSearchParams();

  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);

  useEffect(() => {
    if (actionData?.success && actionData?.message) {
      setIsExpenseModalOpen(false);
    }
  }, [actionData]);

  // Adjust month navigation
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

  const dateObj = new Date(year, month - 1, 1);
  const selectedMonthStr = dateObj.toLocaleString("en-GB", { month: "long", year: "numeric" });

  const formatCurrency = (amt) => {
    return (amt || 0).toLocaleString("en-GB", {
      style: "currency",
      currency: "GBP"
    });
  };

  // Render Category Labels
  const categoryLabels = {
    software: "Software / Proplet",
    insurance: "Insurance",
    marketing: "Marketing / Zoopla",
    maintenance: "Maintenance",
    professional_fees: "Professional Fees",
    office: "Office / Utilities",
    travel: "Travel",
    training: "Training / Courses",
    banking: "Banking Charges",
    other: "Other Expense"
  };

  // Custom SVG Bar Chart Calculation details
  const maxBarValue = Math.max(...trend.map(t => Math.max(t.commission, t.expenses, 200)));

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-4 md:p-6 text-[#1E293B] bg-[#F8FAFC]">
      {/* ── HEADER ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#E2E8F0] pb-5">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[#1E293B]">Transactions & Profit & Loss</h1>
          <p className="text-xs text-[#94A3B8] font-medium">Analyze agency commission revenue streams, operating costs, and landlord payments.</p>
        </div>

        <div className="flex items-center flex-wrap gap-2.5">
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

          <button
            onClick={() => setIsExpenseModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-900 text-white text-xs font-semibold rounded-lg hover:bg-black transition shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            Log Agency Expense
          </button>
        </div>
      </div>

      {/* ── PL SUMMARY CARDS ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-sm relative overflow-hidden">
          <p className="text-[10px] font-bold text-[#94A3B8] uppercase tracking-wider">Gross Rent Processed</p>
          <p className="text-xl font-extrabold text-[#1E293B] mt-1 tracking-tight">{formatCurrency(summary.rent.grossRent)}</p>
          <div className="absolute top-4 right-4 bg-slate-50 p-1.5 rounded-lg border border-[#E2E8F0]">
            <Calendar className="w-4 h-4 text-[#94A3B8]" />
          </div>
        </div>

        <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-sm relative overflow-hidden">
          <p className="text-[10px] font-bold text-[#94A3B8] uppercase tracking-wider">Agency Commission Earned</p>
          <p className="text-xl font-extrabold text-[#16A34A] mt-1 tracking-tight">{formatCurrency(summary.rent.totalCommission)}</p>
          <div className="absolute top-4 right-4 bg-emerald-50 p-1.5 rounded-lg border border-emerald-100">
            <TrendingUp className="w-4 h-4 text-[#16A34A]" />
          </div>
        </div>

        <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-sm relative overflow-hidden">
          <p className="text-[10px] font-bold text-[#94A3B8] uppercase tracking-wider">Agency Expenses Incurred</p>
          <p className="text-xl font-extrabold text-red-600 mt-1 tracking-tight">{formatCurrency(summary.expenses.total)}</p>
          <div className="absolute top-4 right-4 bg-red-50 p-1.5 rounded-lg border border-red-100">
            <Tag className="w-4 h-4 text-red-600" />
          </div>
        </div>

        <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-sm relative overflow-hidden">
          <p className="text-[10px] font-bold text-[#94A3B8] uppercase tracking-wider">Agency Net Profit</p>
          <p className={`text-xl font-extrabold mt-1 tracking-tight ${summary.agencyNetIncome >= 0 ? "text-[#2563EB]" : "text-red-700"}`}>
            {formatCurrency(summary.agencyNetIncome)}
          </p>
          <div className="absolute top-4 right-4 bg-blue-50 p-1.5 rounded-lg border border-blue-100">
            <PoundSterling className="w-4 h-4 text-[#2563EB]" />
          </div>
        </div>
      </div>

      {/* ── TWO-COLUMN PLOT & CATEGORIES ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Trend chart */}
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-sm lg:col-span-2 space-y-4">
          <div>
            <h3 className="text-xs font-bold text-[#1E293B] uppercase tracking-wider">6 Months Revenue vs Expense Trend</h3>
            <p className="text-[10px] text-[#94A3B8] font-medium">Visualizing monthly commissions and operating costs.</p>
          </div>

          {/* SVG Custom Chart */}
          <div className="h-60 w-full relative pt-4">
            <svg className="w-full h-full" viewBox="0 0 600 200" preserveAspectRatio="none">
              {/* Grid Lines */}
              <line x1="40" y1="20" x2="580" y2="20" stroke="#F1F5F9" strokeWidth="1" />
              <line x1="40" y1="80" x2="580" y2="80" stroke="#F1F5F9" strokeWidth="1" />
              <line x1="40" y1="140" x2="580" y2="140" stroke="#F1F5F9" strokeWidth="1" />
              <line x1="40" y1="170" x2="580" y2="170" stroke="#E2E8F0" strokeWidth="1.5" />

              {/* Draw bars */}
              {trend.map((t, idx) => {
                const xBase = 60 + idx * 85;
                const commHeight = (t.commission / maxBarValue) * 140;
                const expHeight = (t.expenses / maxBarValue) * 140;

                return (
                  <g key={t.label}>
                    {/* Commission Bar (Green) */}
                    <rect
                      x={xBase}
                      y={170 - commHeight}
                      width="20"
                      height={commHeight}
                      fill="#10B981"
                      rx="3"
                      className="transition-all duration-500 hover:opacity-85 cursor-pointer"
                    />
                    {/* Expense Bar (Red) */}
                    <rect
                      x={xBase + 24}
                      y={170 - expHeight}
                      width="20"
                      height={expHeight}
                      fill="#EF4444"
                      rx="3"
                      className="transition-all duration-500 hover:opacity-85 cursor-pointer"
                    />

                    {/* Month Label */}
                    <text
                      x={xBase + 22}
                      y="190"
                      textAnchor="middle"
                      fill="#94A3B8"
                      className="text-[9px] font-bold"
                    >
                      {t.label}
                    </text>
                  </g>
                );
              })}
            </svg>

            {/* Chart Legend */}
            <div className="absolute top-2 right-2 flex gap-4 text-[10px] font-bold text-[#475569]">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 bg-emerald-500 rounded"></span> Commission
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 bg-red-500 rounded"></span> Expenses
              </span>
            </div>
          </div>
        </div>

        {/* Expenses category breakdown */}
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-sm space-y-4">
          <div>
            <h3 className="text-xs font-bold text-[#1E293B] uppercase tracking-wider">Expense Categories Breakdown</h3>
            <p className="text-[10px] text-[#94A3B8] font-medium">Top agency operating cost distributions.</p>
          </div>

          <div className="space-y-3.5 max-h-56 overflow-y-auto">
            {summary.expenses.byCategory.length === 0 ? (
              <p className="text-xs text-[#94A3B8] italic text-center py-6">No expenses logged this month.</p>
            ) : (
              summary.expenses.byCategory.map((ec) => {
                const percentage = Math.round((ec.total / summary.expenses.total) * 100);
                return (
                  <div key={ec.category} className="space-y-1">
                    <div className="flex justify-between text-xs font-semibold text-[#1E293B]">
                      <span>{categoryLabels[ec.category] || ec.category}</span>
                      <span>{formatCurrency(ec.total)} ({percentage}%)</span>
                    </div>
                    <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                      <div 
                        className="bg-red-500 h-full rounded-full" 
                        style={{ width: `${percentage}%` }}
                      ></div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* ── COMMISSION BREAKDOWN TABLE ── */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl shadow-sm overflow-hidden mt-6">
        <div className="px-5 py-4 border-b border-[#E2E8F0] flex justify-between items-center">
          <h3 className="text-xs font-bold text-[#1E293B] uppercase tracking-widest">Commission Breakdown by Property</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-[#E2E8F0] text-[10px] font-bold text-[#475569] uppercase tracking-wider">
                <th className="p-4">Property</th>
                <th className="p-4">Landlord</th>
                <th className="p-4 text-right">Rent Collected</th>
                <th className="p-4 text-right">Commission Rate</th>
                <th className="p-4 text-right">Total Commission</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8F0]">
              {commissionBreakdown.length === 0 ? (
                <tr>
                  <td colSpan="5" className="p-8 text-center text-xs text-[#94A3B8]">
                    No commission recorded for this month.
                  </td>
                </tr>
              ) : (
                commissionBreakdown.map((b, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/50">
                    <td className="p-4 font-bold text-[#1E293B]">{b.propertyAddress}</td>
                    <td className="p-4 text-[#475569]">{b.landlordName}</td>
                    <td className="p-4 text-right font-medium text-[#475569]">{formatCurrency(b.totalRent)}</td>
                    <td className="p-4 text-right text-[#475569]">
                      {b.commissionType === "percentage" ? `${b.commissionRate}%` : formatCurrency(b.commissionRate)}
                    </td>
                    <td className="p-4 text-right font-semibold text-[#16A34A]">{formatCurrency(b.totalCommission)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── AGENCY EXPENSES TABLE ── */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-[#E2E8F0] flex justify-between items-center">
          <h3 className="text-xs font-bold text-[#1E293B] uppercase tracking-widest">Agency Operating Expenses Log</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-[#E2E8F0] text-[10px] font-bold text-[#475569] uppercase tracking-wider">
                <th className="p-4">Date</th>
                <th className="p-4">Category</th>
                <th className="p-4">Description</th>
                <th className="p-4">Linked Property</th>
                <th className="p-4 text-right">VAT</th>
                <th className="p-4 text-right">Total Cost</th>
                <th className="p-4">Payment Method</th>
                <th className="p-4">Ref</th>
                <th className="p-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8F0]">
              {expenses.length === 0 ? (
                <tr>
                  <td colSpan="9" className="p-8 text-center text-xs text-[#94A3B8]">
                    No agency expenses recorded for this month.
                  </td>
                </tr>
              ) : (
                expenses.map((e) => (
                  <tr key={e._id} className="hover:bg-slate-50/50">
                    <td className="p-4 font-medium text-[#475569]">{new Date(e.date).toLocaleDateString("en-GB")}</td>
                    <td className="p-4">
                      <span className="inline-flex px-2 py-0.5 rounded-md bg-slate-100 text-[#475569] font-bold text-[10px] uppercase">
                        {categoryLabels[e.category] || e.category}
                      </span>
                    </td>
                    <td className="p-4 text-slate-900 font-bold">{e.description}</td>
                    <td className="p-4 text-[#475569]">{e.propertyId?.addressLine1 || "—"}</td>
                    <td className="p-4 text-right text-[#94A3B8]">{formatCurrency(e.vatAmount)}</td>
                    <td className="p-4 text-right font-semibold text-red-600">{formatCurrency(e.amount)}</td>
                    <td className="p-4 text-[#475569] uppercase text-[10px] font-semibold">{e.paymentMethod?.replace("_", " ")}</td>
                    <td className="p-4 text-[#475569] font-mono text-[10px]">{e.reference || "—"}</td>
                    <td className="p-4 text-right">
                      <form method="post">
                        <input type="hidden" name="intent" value="delete-expense" />
                        <input type="hidden" name="expenseId" value={e._id} />
                        <button
                          type="submit"
                          onClick={(evt) => {
                            if (!confirm("Are you sure you want to delete this expense record?")) {
                              evt.preventDefault();
                            }
                          }}
                          className="text-red-500 hover:text-red-700 font-bold hover:underline"
                        >
                          Delete
                        </button>
                      </form>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── LANDLORD DISBURSEMENTS LOG ── */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-[#E2E8F0]">
          <h3 className="text-xs font-bold text-[#1E293B] uppercase tracking-widest">Monthly Landlord Payouts (Disbursements)</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-[#E2E8F0] text-[10px] font-bold text-[#475569] uppercase tracking-wider">
                <th className="p-4">Period</th>
                <th className="p-4">Landlord</th>
                <th className="p-4 text-right">Gross Rent</th>
                <th className="p-4 text-right">Total Commission</th>
                <th className="p-4 text-right">Deductions</th>
                <th className="p-4 text-right">Net Payout</th>
                <th className="p-4">Status</th>
                <th className="p-4">Payout Date</th>
                <th className="p-4">Reference</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8F0]">
              {disbursements.length === 0 ? (
                <tr>
                  <td colSpan="9" className="p-8 text-center text-xs text-[#94A3B8]">
                    No disbursements generated or paid during this month.
                  </td>
                </tr>
              ) : (
                disbursements.map((d) => {
                  const statusColors = {
                    paid: "bg-green-50 text-[#16A34A] border-green-200",
                    pending: "bg-slate-50 text-[#475569] border-[#E2E8F0]"
                  };

                  return (
                    <tr key={d._id} className="hover:bg-slate-50/50">
                      <td className="p-4 font-bold text-[#1E293B]">
                        {new Date(d.periodStart).toLocaleDateString("en-GB", { month: "short" })} - {new Date(d.periodEnd).toLocaleDateString("en-GB", { month: "short", year: "numeric" })}
                      </td>
                      <td className="p-4 font-semibold text-slate-900">
                        {d.landlordId ? `${d.landlordId.title ? d.landlordId.title + ' ' : ''}${d.landlordId.firstName} ${d.landlordId.lastName}` : "—"}
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

      {/* ── MODAL: LOG AGENCY EXPENSE ── */}
      {isExpenseModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-[#E2E8F0] rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="flex justify-between items-center bg-slate-50 px-5 py-4 border-b border-[#E2E8F0]">
              <div>
                <h3 className="text-sm font-bold text-[#1E293B]">Log Agency Operating Expense</h3>
                <p className="text-[10px] text-[#94A3B8] font-medium mt-0.5">Log custom cost for P&L reporting.</p>
              </div>
              <button onClick={() => setIsExpenseModalOpen(false)} className="text-[#94A3B8] hover:text-[#1E293B]">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form method="post" className="p-5 space-y-4">
              <input type="hidden" name="intent" value="add-expense" />

              <div>
                <label className="text-[10px] font-bold text-[#475569] uppercase tracking-wider block">Expense Category *</label>
                <select
                  name="category"
                  required
                  className="w-full mt-1.5 border border-[#E2E8F0] rounded-lg text-xs p-2.5 focus:outline-none focus:ring-1 focus:ring-[#2563EB] bg-white"
                >
                  <option value="software">Software / Subscriptions</option>
                  <option value="insurance">Insurance</option>
                  <option value="marketing">Marketing & Zoopla Ads</option>
                  <option value="maintenance">Maintenance</option>
                  <option value="professional_fees">Professional Fees</option>
                  <option value="office">Office & Rent</option>
                  <option value="travel">Travel & Transport</option>
                  <option value="training">Training</option>
                  <option value="banking">Banking Charges</option>
                  <option value="other">Other Expense</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] font-bold text-[#475569] uppercase tracking-wider block">Description / Concept *</label>
                <input
                  type="text"
                  name="description"
                  required
                  placeholder="e.g. Zoopla Monthly Listing Invoice June"
                  className="w-full mt-1.5 border border-[#E2E8F0] rounded-lg text-xs p-2.5 focus:outline-none focus:ring-1 focus:ring-[#2563EB]"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-bold text-[#475569] uppercase tracking-wider block">Expense Amount (£) *</label>
                  <input
                    type="number"
                    name="amount"
                    step="0.01"
                    required
                    min="0.01"
                    placeholder="0.00"
                    className="w-full mt-1.5 border border-[#E2E8F0] rounded-lg text-xs p-2.5 focus:outline-none focus:ring-1 focus:ring-[#2563EB]"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-[#475569] uppercase tracking-wider block">VAT included (£)</label>
                  <input
                    type="number"
                    name="vatAmount"
                    step="0.01"
                    defaultValue="0.00"
                    placeholder="0.00"
                    className="w-full mt-1.5 border border-[#E2E8F0] rounded-lg text-xs p-2.5 focus:outline-none focus:ring-1 focus:ring-[#2563EB]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-bold text-[#475569] uppercase tracking-wider block">Expense Date *</label>
                  <input
                    type="date"
                    name="date"
                    required
                    defaultValue={new Date().toISOString().split("T")[0]}
                    className="w-full mt-1.5 border border-[#E2E8F0] rounded-lg text-xs p-2.5 focus:outline-none focus:ring-1 focus:ring-[#2563EB]"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-[#475569] uppercase tracking-wider block">Linked Property (Optional)</label>
                  <select
                    name="propertyId"
                    className="w-full mt-1.5 border border-[#E2E8F0] rounded-lg text-xs p-2.5 focus:outline-none focus:ring-1 focus:ring-[#2563EB] bg-white"
                  >
                    <option value="">-- General / No property --</option>
                    {properties.map((p) => (
                      <option key={p._id} value={p._id}>{p.addressLine1}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-bold text-[#475569] uppercase tracking-wider block">Payment Method *</label>
                  <select
                    name="paymentMethod"
                    required
                    className="w-full mt-1.5 border border-[#E2E8F0] rounded-lg text-xs p-2.5 focus:outline-none focus:ring-1 focus:ring-[#2563EB] bg-white"
                  >
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="direct_debit">Direct Debit</option>
                    <option value="credit_card">Credit Card</option>
                    <option value="cash">Cash</option>
                    <option value="cheque">Cheque</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-[#475569] uppercase tracking-wider block">Payment Reference</label>
                  <input
                    type="text"
                    name="reference"
                    placeholder="e.g. DD-ZOOPLA-99"
                    className="w-full mt-1.5 border border-[#E2E8F0] rounded-lg text-xs p-2.5 focus:outline-none focus:ring-1 focus:ring-[#2563EB]"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-[#475569] uppercase tracking-wider block">Audits & Notes</label>
                <textarea
                  name="notes"
                  rows="2"
                  placeholder="e.g. paid automatically under DD authorization..."
                  className="w-full mt-1.5 border border-[#E2E8F0] rounded-lg text-xs p-2.5 focus:outline-none focus:ring-1 focus:ring-[#2563EB]"
                ></textarea>
              </div>

              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setIsExpenseModalOpen(false)}
                  className="px-4 py-2 border border-[#E2E8F0] text-xs font-semibold rounded-lg text-[#475569] hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={navigation.state === "submitting"}
                  className="px-4 py-2 bg-slate-900 hover:bg-black text-white rounded-lg text-xs font-semibold transition shadow-sm"
                >
                  Save Expense
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// routes/tenancies/detail.jsx -- SECTION 5: Tenancy Detail Page with Tabs
import { useState, useEffect, useRef } from "react";
import { useLoaderData, Link, useSearchParams, Form, useFetcher } from "react-router-dom";
import { CheckCircle, AlertTriangle, XCircle, Info, PoundSterling, X } from "lucide-react";
import { getUserFromRequest } from "../../utils/auth.server.js";
import { redirect, data } from "react-router";
import { fmtDate } from "../../utils/date.js";
import UKDateInput from "../../components/ui/UKDateInput.jsx";
import { Tenancy } from "../../models/tenancy.server.js";
import { Document } from "../../models/document.server.js";
import { RentPayment } from "../../models/rentPayment.server.js";
import { getNotesForEntity } from "../../utils/notes.server.js";
import { calculateArrearsStatus, calculateCommission, generatePaymentPeriods } from "../../utils/rent-payment.js";
import { connect } from "../../config/db.server.js";
import Badge from "../../components/ui/Badge.jsx";
import Timeline from "../../components/timeline/Timeline.jsx";
import { DocumentType } from "../../models/documentType.server.js";
import DocumentUploader from "../../components/documents/DocumentUploader.jsx";
import { EvidenceVaultButton } from "../../components/evidence-vault/EvidenceVaultButton.jsx";
import { getRightToRentStatus } from "../../utils/compliance.js";
import { logSection8Created, logSection13Created, logTenancyEnded, logHowToRentServed, logDepositProtected, logPrescribedInfoServed, logPropertyStatusChanged, logRentReceived, logRentPartial, logRentWaived } from "../../utils/activityLog.server.js";

export async function loader({ request, params }) {
  const user = await getUserFromRequest(request);
  if (!user) return redirect("/login");
  if (!user.agencyId && !user.roles?.includes("SUPER_ADMIN")) return redirect("/dashboard");

  await connect();

  const agencyFilter = user.roles?.includes("SUPER_ADMIN")
    ? {}
    : { agencyId: user.agencyId };

  // 1. Fetch tenancy with full population
  const tenancy = await Tenancy.findOne({
    _id: params.id,
    ...agencyFilter,
    deleted: false,
  })
    .populate('propertyId',
      'addressLine1 addressLine2 city postcode propertyType landlordId commission')
    .populate('landlordId',
      'title firstName lastName email phone landlordData')
    .populate('tenantIds',
      'title firstName lastName email phone tenantData address')
    .populate('createdBy', 'title firstName lastName')
    .lean();

  if (!tenancy) throw new Response("Not Found", { status: 404 });

  // 2. Fetch documents and active doc types for tenancy
  const [documents, activeDocTypes] = await Promise.all([
    Document.find({
      entityType: 'tenancy',
      entityId: params.id,
      agencyId: user.agencyId,
    })
      .populate('docType', 'name')
      .populate('uploadedBy', 'title firstName lastName')
      .sort({ createdAt: -1 })
      .lean(),
    DocumentType.find({ isActive: true, entity: "tenancy" })
      .sort({ name: 1 })
      .lean()
  ]);

  // 3. Get active tab from URL (do this before conditional queries)
  const url = new URL(request.url);
  const activeTab = url.searchParams.get('tab') || 'overview';

  // 4. Always fetch a minimal set of rent payments for the compliance strip
  const rentPaymentsForStrip = await RentPayment.find({
    tenancyId: params.id,
    agencyId: user.agencyId,
    deleted: false,
  })
    .sort({ periodStart: -1 })
    .limit(12)
    .lean();

  const arrearsStatus = calculateArrearsStatus(rentPaymentsForStrip);

  // 5. Full rent tab data — only when on the rent tab
  let rentData = null;
  if (activeTab === 'rent') {
    rentData = await loadRentTabData(params.id, user.agencyId, tenancy);
  }

  // 6. Fetch notes only when the timeline tab is open
  const notesResult = activeTab === "timeline"
    ? await getNotesForEntity('tenancy', params.id, user.agencyId, 1)
    : { notes: [], hasMore: false, total: 0, page: 1 };

  const isAdmin = !!user.agencyId || user.roles?.includes("SUPER_ADMIN");

  return {
    tenancyId: params.id,
    tenancy: {
      ...tenancy,
      _id: tenancy._id?.toString(),
      propertyId: tenancy.propertyId ? { ...tenancy.propertyId, _id: tenancy.propertyId._id?.toString() || tenancy.propertyId.toString() } : null,
      landlordId: tenancy.landlordId ? { ...tenancy.landlordId, _id: tenancy.landlordId._id?.toString() || tenancy.landlordId.toString() } : null,
      tenantIds: tenancy.tenantIds?.map(t => ({
        ...t,
        _id: t._id?.toString() || t.toString()
      })) || [],
    },
    documents: documents.map(d => ({
      ...d,
      _id: d._id.toString(),
      docType: d.docType ? { ...d.docType, _id: d.docType._id.toString() } : null,
      uploadedBy: d.uploadedBy ? { firstName: d.uploadedBy.firstName, lastName: d.uploadedBy.lastName } : null,
    })),
    activeDocTypes: activeDocTypes.map(dt => ({
      ...dt,
      _id: dt._id.toString()
    })),
    rentPayments: rentPaymentsForStrip,
    arrearsStatus,
    rentData,
    notes: notesResult.notes,
    notesHasMore: notesResult.hasMore,
    activeTab,
    isAdmin,
    currentUserId: user.userId || user._id || null,
    currentUserRole: user.roles?.[0] || "agent",
    currentUserName: `${user.firstName || ""} ${user.lastName || ""}`.trim() || "User",
  };
}

// ── Rent tab data loader (only runs when tab=rent) ────────────────────────────
async function loadRentTabData(tenancyId, agencyId, tenancy) {
  const today = new Date();
  const currentYear = today.getFullYear();
  const { Types } = await import("mongoose");

  const [rentPayments, ytdAgg] = await Promise.all([
    RentPayment.find({ tenancyId, agencyId, deleted: false })
      .populate('recordedBy', 'title firstName lastName')
      .sort({ periodStart: -1 })
      .limit(24)
      .lean(),

    RentPayment.aggregate([
      {
        $match: {
          tenancyId: new Types.ObjectId(tenancyId),
          agencyId: new Types.ObjectId(agencyId),
          deleted: false,
          status: { $in: ['paid', 'partial'] },
          periodStart: { $gte: new Date(currentYear, 0, 1), $lte: new Date(currentYear, 11, 31) },
        },
      },
      {
        $group: {
          _id: null,
          totalRent: { $sum: '$amountPaid' },
          totalCommission: { $sum: { $ifNull: ['$commissionAmount', 0] } },
          totalVat: { $sum: { $ifNull: ['$vatAmount', 0] } },
          totalNet: { $sum: { $ifNull: ['$netToLandlord', 0] } },
          paymentsCount: { $sum: 1 },
        },
      },
    ]),
  ]);

  const arrearsStatus = calculateArrearsStatus(rentPayments);

  const currentMonthPayment = rentPayments.find(p => {
    const ps = new Date(p.periodStart);
    return ps.getFullYear() === today.getFullYear() && ps.getMonth() === today.getMonth();
  }) || null;

  const commission = tenancy.propertyId?.commission || null;
  const commissionDisplay = commission?.rate
    ? commission.type === 'percentage' ? `${commission.rate}%` : `£${commission.rate} fixed`
    : null;

  const ytdTotals = ytdAgg[0] || { totalRent: 0, totalCommission: 0, totalVat: 0, totalNet: 0, paymentsCount: 0 };

  return {
    rentPayments: rentPayments.map(p => ({
      ...p,
      _id: p._id.toString(),
      recordedBy: p.recordedBy ? { firstName: p.recordedBy.firstName, lastName: p.recordedBy.lastName } : null,
    })),
    ytdTotals,
    arrearsStatus,
    currentMonthPayment: currentMonthPayment ? { ...currentMonthPayment, _id: currentMonthPayment._id.toString() } : null,
    commissionDisplay,
    currentYear,
  };
}

export async function action({ request, params }) {
  const user = await getUserFromRequest(request);
  if (!user) return redirect("/login");
  if (!user.agencyId && !user.roles?.includes("SUPER_ADMIN")) return redirect("/dashboard");

  await connect();

  const agencyFilter = user.roles?.includes("SUPER_ADMIN")
    ? {}
    : { agencyId: user.agencyId };

  const formData = await request.formData();
  const intent = formData.get("intent");

  const tenancy = await Tenancy.findOne({
    _id: params.id,
    ...agencyFilter,
    deleted: false,
  });

  if (!tenancy) {
    return data({ error: "Tenancy not found." }, { status: 404 });
  }

  if (intent === "mark-how-to-rent-served") {
    const servedDate = formData.get("servedDate")
      ? new Date(formData.get("servedDate"))
      : new Date();
    const version = formData.get("version")?.toString().trim() || tenancy.howToRent?.version || null;

    tenancy.howToRent = {
      ...tenancy.howToRent,
      served: true,
      servedDate,
      version,
    };
    tenancy.updatedBy = user.userId || user._id;
    await tenancy.save();
    await logHowToRentServed(tenancy, user);

    return redirect(`/tenancies/${tenancy._id}?tab=overview&success=how-to-rent-served`);
  }

  if (intent === "record-section8") {
    const rentPayments = await RentPayment.find({
      tenancyId: params.id,
      agencyId: user.agencyId,
      deleted: false,
    })
      .sort({ periodStart: -1 })
      .limit(12)
      .lean();

    const arrearsStatus = calculateArrearsStatus(rentPayments);
    const servedDate = formData.get("servedDate")
      ? new Date(formData.get("servedDate"))
      : new Date();
    const expiryDate = new Date(servedDate);
    expiryDate.setDate(expiryDate.getDate() + 14);
    const grounds = arrearsStatus.monthsArrears >= 2 ? ["8", "10"] : ["10"];
    const notice = {
      servedDate,
      grounds,
      expiryDate,
      notes: formData.get("notes")?.toString().trim() || null,
      outcome: "pending",
    };

    tenancy.section8Notices = [...(tenancy.section8Notices || []), notice];
    tenancy.updatedBy = user.userId || user._id;
    await tenancy.save();
    await logSection8Created(tenancy, notice, user);

    return redirect(`/tenancies/${tenancy._id}?tab=notices&success=section8-recorded`);
  }

  if (intent === "record-section13") {
    const currentRent = Number(formData.get("currentRent"));
    const proposedRent = Number(formData.get("proposedRent"));
    const effectiveDateValue = formData.get("effectiveDate");

    if (!currentRent || !proposedRent || !effectiveDateValue) {
      return data({ error: "Current rent, proposed rent and effective date are required." }, { status: 400 });
    }

    const servedDate = formData.get("servedDate")
      ? new Date(formData.get("servedDate"))
      : new Date();
    const effectiveDate = new Date(effectiveDateValue);
    const notice = {
      servedDate,
      currentRent,
      proposedRent,
      effectiveDate,
      outcome: "pending",
    };

    tenancy.section13Notices = [...(tenancy.section13Notices || []), notice];
    tenancy.updatedBy = user.userId || user._id;
    await tenancy.save();
    await logSection13Created(tenancy, notice, user);

    return redirect(`/tenancies/${tenancy._id}?tab=notices&success=section13-recorded`);
  }

  if (intent === "end-tenancy") {
    const endReason = formData.get("endReason")?.toString() || "other";
    const actualEndDate = formData.get("actualEndDate")
      ? new Date(formData.get("actualEndDate"))
      : new Date();

    tenancy.status = "ended";
    tenancy.endReason = endReason;
    tenancy.actualEndDate = actualEndDate;
    tenancy.updatedBy = user.userId || user._id;
    await tenancy.save();
    await logTenancyEnded(tenancy, user);

    // Also log the property status change back to available
    if (tenancy.propertyId) {
      const { Property } = await import("../../models/property.server.js");
      const prop = await Property.findById(tenancy.propertyId);
      if (prop) {
        prop.status = "available";
        await prop.save();
        await logPropertyStatusChanged(prop, "available", user);
      }
    }

    return redirect(`/tenancies/${tenancy._id}?tab=overview&success=tenancy-ended`);
  }

  if (intent === "mark-deposit-protected") {
    const protectedDate = formData.get("protectedDate")
      ? new Date(formData.get("protectedDate"))
      : new Date();
    const scheme = formData.get("scheme")?.toString().trim() || tenancy.deposit?.scheme || null;
    const reference = formData.get("reference")?.toString().trim() || tenancy.deposit?.reference || null;

    if (!tenancy.deposit || !tenancy.deposit.amount) {
      return data({ error: "No deposit recorded for this tenancy." }, { status: 400 });
    }

    tenancy.deposit = {
      ...tenancy.deposit.toObject?.() ?? tenancy.deposit,
      protectedDate,
      scheme: scheme || tenancy.deposit.scheme,
      reference: reference || tenancy.deposit.reference,
    };
    tenancy.updatedBy = user.userId || user._id;
    await tenancy.save();
    await logDepositProtected(tenancy, user);

    return redirect(`/tenancies/${tenancy._id}?tab=deposit&success=deposit-protected`);
  }

  if (intent === "mark-prescribed-info-served") {
    const servedDate = formData.get("servedDate")
      ? new Date(formData.get("servedDate"))
      : new Date();

    if (!tenancy.deposit || !tenancy.deposit.amount) {
      return data({ error: "No deposit recorded for this tenancy." }, { status: 400 });
    }

    tenancy.deposit = {
      ...tenancy.deposit.toObject?.() ?? tenancy.deposit,
      prescribedInfoServedDate: servedDate,
    };
    tenancy.updatedBy = user.userId || user._id;
    await tenancy.save();
    await logPrescribedInfoServed(tenancy, user);

    return redirect(`/tenancies/${tenancy._id}?tab=deposit&success=prescribed-info-served`);
  }

  // ── RENT TAB ACTIONS ──────────────────────────────────────────────────────────

  if (intent === "record-rent-payment") {
    const paymentId = formData.get("paymentId");
    const amountPaid = Math.round(parseFloat(formData.get("amountPaid") || "0") * 100) / 100;
    const paymentMethod = formData.get("paymentMethod");
    const paymentDateStr = formData.get("paymentDate");
    const reference = formData.get("reference") || null;
    const notes = formData.get("notes") || null;

    if (!paymentId) return data({ error: "Missing payment ID." }, { status: 400 });
    if (!amountPaid || amountPaid <= 0) return data({ error: "Amount must be greater than 0." }, { status: 400 });

    const payment = await RentPayment.findOne({ _id: paymentId, agencyId: user.agencyId });
    if (!payment) return data({ error: "Payment record not found." }, { status: 404 });
    if (['paid', 'waived'].includes(payment.status)) return data({ error: "Payment is already recorded." }, { status: 400 });
    if (amountPaid > payment.amountDue) return data({ error: `Amount cannot exceed rent due of £${payment.amountDue}.` }, { status: 400 });

    // Commission calculated server-side using frozen rates on the payment record
    const storedRates = { commission: { type: payment.commissionType, rate: payment.commissionRate } };
    const { commissionAmount, vatAmount, netToLandlord } = calculateCommission(amountPaid, storedRates);

    payment.amountPaid = amountPaid;
    payment.amountOutstanding = Math.round((payment.amountDue - amountPaid) * 100) / 100;
    payment.commissionAmount = commissionAmount;
    payment.vatAmount = vatAmount;
    payment.netToLandlord = netToLandlord;
    payment.status = payment.amountOutstanding <= 0 ? 'paid' : 'partial';
    payment.paymentMethod = paymentMethod;
    payment.paymentReference = reference;
    payment.paidDate = paymentDateStr ? new Date(paymentDateStr) : new Date();
    payment.notes = notes;
    payment.recordedBy = user.userId || user._id;
    payment.recordedAt = new Date();
    await payment.save();

    if (payment.status === 'paid') await logRentReceived(payment, user);
    else await logRentPartial(payment, user);

    return data({ success: true, message: `Payment recorded for this period.` });
  }

  if (intent === "waive-rent-payment") {
    // Admin only
    if (!user.roles?.includes("SUPER_ADMIN") && user.roles?.[0] !== "agency_admin") {
      return data({ error: "Only admins can waive payments." }, { status: 403 });
    }
    const paymentId = formData.get("paymentId");
    const waivedReason = formData.get("waivedReason")?.toString().trim();
    if (!paymentId || !waivedReason) return data({ error: "Payment ID and reason are required." }, { status: 400 });

    const payment = await RentPayment.findOne({ _id: paymentId, agencyId: user.agencyId });
    if (!payment) return data({ error: "Payment not found." }, { status: 404 });
    if (['paid', 'waived'].includes(payment.status)) return data({ error: "Payment cannot be waived." }, { status: 400 });

    payment.status = 'waived';
    payment.amountOutstanding = 0;
    payment.waivedBy = user.userId || user._id;
    payment.waivedAt = new Date();
    payment.waivedReason = waivedReason;
    await payment.save();
    await logRentWaived(payment, user, waivedReason);

    return data({ success: true, message: 'Payment waived.' });
  }

  if (intent === "generate-rent-payments") {
    const count = await RentPayment.countDocuments({ tenancyId: tenancy._id, agencyId: user.agencyId });
    if (count > 0) return data({ error: "Payment records already exist for this tenancy." }, { status: 400 });

    const { Property } = await import("../../models/property.server.js");
    const property = await Property.findById(tenancy.propertyId).lean();
    if (!property) return data({ error: "Property not found." }, { status: 404 });

    const periods = generatePaymentPeriods(tenancy, property, 3);
    await RentPayment.insertMany(periods);

    return data({ success: true, message: `${periods.length} payment records generated.` });
  }

  return data({ error: "Unknown action intent." }, { status: 400 });
}

export default function TenancyDetail() {
  const { tenancyId, tenancy, documents, activeDocTypes, rentPayments, arrearsStatus, rentData, notes, notesHasMore, activeTab, isAdmin, currentUserId, currentUserRole, currentUserName } = useLoaderData();
  const [searchParams, setSearchParams] = useSearchParams();

  // RRA Information Sheet modal state
  const [rraModalOpen, setRraModalOpen] = useState(false);
  const [rraMethod, setRraMethod] = useState("email_attachment");
  const [rraCheckedTenants, setRraCheckedTenants] = useState(
    () => (tenancy.tenantIds || []).map((t) => t._id.toString())
  );
  const rraFetcher = useFetcher();
  const RRA_CUTOFF = new Date("2026-05-01");
  const isRraApplicable = new Date(tenancy.startDate) < RRA_CUTOFF;

  // Close modal only once per successful submission.
  // A ref tracks the last response we've already acted on,
  // so re-opening the modal later doesn't instantly close it.
  const lastHandledRraData = useRef(null);
  useEffect(() => {
    if (
      rraFetcher.state === "idle" &&
      rraFetcher.data?.success &&
      rraFetcher.data !== lastHandledRraData.current
    ) {
      lastHandledRraData.current = rraFetcher.data;
      setRraModalOpen(false);
    }
  }, [rraFetcher.state, rraFetcher.data]);

  const setActiveTab = (tab) => {
    const newParams = new URLSearchParams(searchParams);
    newParams.set('tab', tab);
    setSearchParams(newParams);
  };

  // Helper functions
  const formatDate = (date) => {
    if (!date) return "";
    return fmtDate(date);
  };

  const formatCurrency = (amount) => {
    return amount ? `£${Number(amount).toLocaleString("en-GB")}` : "—";
  };

  const getStatusBadge = (status) => {
    const colors = {
      active: "bg-green-100 text-green-800",
      ended: "bg-gray-100 text-gray-600",
      terminated: "bg-red-100 text-red-700",
      abandoned: "bg-red-100 text-red-700",
    };
    return colors[status] || "bg-gray-100 text-gray-600";
  };

  const getComplianceStatus = () => {
    const depositStatus = getDepositStatus();
    const howToRentStatus = getHowToRentStatus();
    const rtrStatus = getRTRStatus();
    const rentStatus = getRentStatus();
    const rraStatus = getRRAStatus();
    return { depositStatus, howToRentStatus, rtrStatus, rentStatus, rraStatus };
  };

  const getDepositStatus = () => {
    const hasDeposit = tenancy.deposit?.amount > 0;
    if (!hasDeposit) return "grey";
    const isProtected = !!tenancy.deposit?.protectedDate;
    const prescribedServed = !!tenancy.deposit?.prescribedInfoServedDate;
    if (isProtected && prescribedServed) return "green";
    if (isProtected && !prescribedServed) return "amber";
    return "red";
  };

  const getHowToRentStatus = () => {
    if (!tenancy.howToRent?.served) return "red";
    return "green";
  };

  const getRRAStatus = () => {
    if (!isRraApplicable) return "not_applicable";
    if (tenancy.rrainformationSheet?.served) return "green";
    return "amber";
  };

  const getRTRStatus = () => {
    const statuses = tenancy.tenantIds?.map(t => getRightToRentStatus(t).status) || [];
    if (statuses.includes("expired") || statuses.includes("not_checked")) return "red";
    if (statuses.includes("expiring_soon")) return "amber";
    if (statuses.every(s => s === "valid")) return "green";
    return "grey";
  };

  const getRentStatus = () => {
    if (!rentPayments.length) return "grey";
    if (arrearsStatus.monthsArrears >= 2) return "red";
    if (arrearsStatus.monthsArrears >= 1) return "amber";
    return "green";
  };

  const compliance = getComplianceStatus();

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* PAGE HEADER */}
      {searchParams.get("success") && (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-800">
          {searchParams.get("success") === "how-to-rent-served" && "How to Rent guide marked as served."}
          {searchParams.get("success") === "section8-recorded" && "Section 8 notice recorded."}
          {searchParams.get("success") === "section13-recorded" && "Section 13 notice recorded."}
          {searchParams.get("success") === "tenancy-ended" && "Tenancy ended successfully."}
          {searchParams.get("success") === "updated" && "Tenancy updated successfully."}
          {searchParams.get("success") === "deposit-protected" && "Deposit protection recorded in the timeline."}
          {searchParams.get("success") === "rra-sheet-served" && "RRA Information Sheet recorded as served."}
          {searchParams.get("success") === "prescribed-info-served" && "Prescribed information served — recorded in the timeline."}
        </div>
      )}
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          {/* Property Address */}
          <h1 className="text-3xl font-bold text-gray-900">
            <Link
              to={`/properties/${tenancy.propertyId?._id}`}
              className="hover:text-indigo-600"
            >
              {tenancy.propertyId?.addressLine1}
              {tenancy.propertyId?.addressLine2 && `, ${tenancy.propertyId.addressLine2}`}
              {tenancy.propertyId?.city && `, ${tenancy.propertyId.city}`}
              {tenancy.propertyId?.postcode && ` ${tenancy.propertyId.postcode}`}
            </Link>
          </h1>

          {/* Landlord */}
          <p className="text-lg text-gray-600">
            Landlord:{" "}
            <Link
              to={`/landlords/${tenancy.landlordId?._id}`}
              className="text-indigo-600 hover:underline"
            >
              {tenancy.landlordId?.title ? tenancy.landlordId?.title + ' ' : ''}{tenancy.landlordId?.firstName} {tenancy.landlordId?.lastName}
            </Link>
          </p>

          {/* Tenants */}
          <p className="text-lg text-gray-600">
            Tenant{tenancy.tenantIds?.length > 1 ? "s" : ""}:{" "}
            {tenancy.tenantIds?.map((tenant, index) => (
              <span key={tenant._id}>
                {index > 0 && ", "}
                <Link
                  to={`/tenants/${tenant._id}`}
                  className="text-indigo-600 hover:underline"
                >
                  {tenant.title ? tenant.title + ' ' : ''}{tenant.firstName} {tenant.lastName}
                </Link>
              </span>
            ))}
          </p>

          {/* Badges and Date Range */}
          <div className="flex items-center gap-3 mt-3">
            <Badge variant="info">
              {tenancy.tenancyType?.toUpperCase()}
            </Badge>
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusBadge(tenancy.status)}`}>
              {tenancy.status?.charAt(0).toUpperCase() + tenancy.status?.slice(1)}
            </span>
            <span className="text-sm text-gray-500">
              {formatDate(tenancy.startDate)} – {tenancy.tenancyType === "apt" ? "Periodic" : formatDate(tenancy.endDate)}
            </span>
            <span className="text-sm text-gray-500">
              {formatCurrency(tenancy.rent?.amount)} pcm
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3">
          <EvidenceVaultButton tenancyId={tenancyId} />
          <Link
            id="btn-edit-tenancy"
            to={`/tenancies/${tenancyId}/edit`}
            className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition"
          >
            Edit Tenancy
          </Link>
          <button
            type="button"
            onClick={() => setActiveTab("notices")}
            className="px-4 py-2 border border-red-300 text-red-700 text-sm font-medium rounded-lg hover:bg-red-50 transition"
          >
            End Tenancy
          </button>
        </div>
      </div>

      {/* ── COMPLIANCE SUMMARY STRIP ────────────────────────────────────────────────── */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {/* Deposit */}
          <div className="text-center">
            <div className="text-sm font-medium text-gray-700 mb-1">Deposit</div>
            <div className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${compliance.depositStatus === "green" ? "bg-green-100 text-green-800" :
                compliance.depositStatus === "amber" ? "bg-amber-100 text-amber-800" :
                  compliance.depositStatus === "red" ? "bg-red-100 text-red-800" :
                    "bg-gray-100 text-gray-600"
              }`}>
              {compliance.depositStatus === "green" ? <><CheckCircle className="w-3.5 h-3.5 mr-1 inline" /> Protected</> :
                compliance.depositStatus === "amber" ? <><Info className="w-3.5 h-3.5 mr-1 inline" /> Info Pending</> :
                  compliance.depositStatus === "red" ? <><XCircle className="w-3.5 h-3.5 mr-1 inline" /> Not Protected</> :
                    "No Deposit"}
            </div>
          </div>

          {/* How to Rent */}
          <div className="text-center">
            <div className="text-sm font-medium text-gray-700 mb-1">How to Rent</div>
            <div className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${compliance.howToRentStatus === "green" ? "bg-green-100 text-green-800" :
                compliance.howToRentStatus === "amber" ? "bg-amber-100 text-amber-800" :
                  compliance.howToRentStatus === "red" ? "bg-red-100 text-red-800" :
                    "bg-gray-100 text-gray-600"
              }`}>
              {compliance.howToRentStatus === "green" ? <><CheckCircle className="w-3.5 h-3.5 mr-1 inline" /> Served</> :
                compliance.howToRentStatus === "amber" ? <><Info className="w-3.5 h-3.5 mr-1 inline" /> Update Available</> :
                  compliance.howToRentStatus === "red" ? <><XCircle className="w-3.5 h-3.5 mr-1 inline" /> Not Served</> :
                    "N/A"}
            </div>
          </div>

          {/* RRA Information Sheet */}
          <div className="text-center">
            <div className="text-sm font-medium text-gray-700 mb-1">RRA Sheet</div>
            <div className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
              compliance.rraStatus === "green" ? "bg-green-100 text-green-800" :
                compliance.rraStatus === "amber" ? "bg-amber-100 text-amber-800" :
                  "bg-gray-100 text-gray-500"
            }`}>
              {compliance.rraStatus === "green" ? <><CheckCircle className="w-3.5 h-3.5 mr-1 inline" /> Served</> :
                compliance.rraStatus === "amber" ? <><AlertTriangle className="w-3.5 h-3.5 mr-1 inline" /> Not Recorded</> :
                  "N/A"}
            </div>
          </div>

          {/* RTR */}
          <div className="text-center">
            <div className="text-sm font-medium text-gray-700 mb-1">Right to Rent</div>
            <div className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${compliance.rtrStatus === "green" ? "bg-green-100 text-green-800" :
                compliance.rtrStatus === "amber" ? "bg-amber-100 text-amber-800" :
                  compliance.rtrStatus === "red" ? "bg-red-100 text-red-800" :
                    "bg-gray-100 text-gray-600"
              }`}>
              {compliance.rtrStatus === "green" ? <><CheckCircle className="w-3.5 h-3.5 mr-1 inline" /> All Valid</> :
                compliance.rtrStatus === "amber" ? <><AlertTriangle className="w-3.5 h-3.5 mr-1 inline" /> Expiring Soon</> :
                  compliance.rtrStatus === "red" ? <><XCircle className="w-3.5 h-3.5 mr-1 inline" /> Issues</> :
                    "No Data"}
            </div>
          </div>

          {/* Rent */}
          <div className="text-center">
            <div className="text-sm font-medium text-gray-700 mb-1">Rent Payments</div>
            <div className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${compliance.rentStatus === "green" ? "bg-green-100 text-green-800" :
                compliance.rentStatus === "amber" ? "bg-amber-100 text-amber-800" :
                  compliance.rentStatus === "red" ? "bg-red-100 text-red-800" :
                    "bg-gray-100 text-gray-600"
              }`}>
              {compliance.rentStatus === "green" ? <><CheckCircle className="w-3.5 h-3.5 mr-1 inline" /> Up to Date</> :
                compliance.rentStatus === "amber" ? <><AlertTriangle className="w-3.5 h-3.5 mr-1 inline" /> 1 Month Late</> :
                  compliance.rentStatus === "red" ? <><XCircle className="w-3.5 h-3.5 mr-1 inline" /> 2+ Months Late</> :
                    "No Payments"}
            </div>
          </div>
        </div>

        {/* Arrears Warning Banner */}
        {arrearsStatus.monthsArrears >= 2 && (
          <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-5 h-5 text-red-600 mt-0.5">⚠️</div>
              <div className="flex-1">
                <p className="text-sm font-medium text-red-800">
                  {arrearsStatus.monthsArrears} months rent arrears. Ground 8 Section 8 may be available.
                </p>
                <p className="text-xs text-red-700 mt-1">
                  Always seek legal advice before serving notice.
                </p>
                <button className="mt-2 px-3 py-1 bg-red-600 text-white text-xs font-medium rounded hover:bg-red-700 transition">
                  Record Section 8 Notice
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* TABS */}
      <div className="bg-white rounded-lg border border-gray-200">
        {/* Tab Navigation */}
        <div className="border-b border-gray-200">
          <nav className="flex">
            {[
              { id: "overview", label: "Overview" },
              { id: "rent", label: "Rent" },
              { id: "documents", label: `Documents (${documents.length})` },
              { id: "notices", label: "Notices" },
              { id: "timeline", label: "Timeline" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-6 py-3 text-sm font-medium border-b-2 transition ${activeTab === tab.id
                    ? "border-indigo-500 text-indigo-600"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                  }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab Content */}
        <div className="p-6">
          {activeTab === "overview" && <OverviewTab 
            tenancy={tenancy} 
            rraModalOpen={rraModalOpen}
            setRraModalOpen={setRraModalOpen}
            rraFetcher={rraFetcher}
            rraMethod={rraMethod}
            setRraMethod={setRraMethod}
            rraCheckedTenants={rraCheckedTenants}
            setRraCheckedTenants={setRraCheckedTenants}
          />}
          {activeTab === "rent" && <RentTab tenancy={tenancy} tenancyId={tenancyId} rentData={rentData} isAdmin={isAdmin} currentUserRole={currentUserRole} />}
          {activeTab === "documents" && (
            <div className="space-y-6">
              <DocumentUploader
                entityType="tenancy"
                entityId={tenancyId}
                docTypes={activeDocTypes}
                docs={documents}
                isAdmin={isAdmin}
                currentUserName={currentUserName}
                layout="grid"
              />
            </div>
          )}
          {activeTab === "notices" && (
            <div className="space-y-6">
              <div className="grid gap-6 lg:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-base font-semibold text-slate-900">Section 8 Notices</h3>
                      <p className="mt-1 text-sm text-slate-500">Record possession notices and keep the history here.</p>
                    </div>
                    <Form method="post">
                      <input type="hidden" name="intent" value="record-section8" />
                      <input type="hidden" name="servedDate" value={new Date().toISOString().split("T")[0]} />
                      <button
                        type="submit"
                        className="rounded-lg bg-[#2657F7] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#1f49d1]"
                      >
                        Record Section 8
                      </button>
                    </Form>
                  </div>

                  <div className="mt-5 space-y-3">
                    {(tenancy.section8Notices || []).length === 0 ? (
                      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                        No Section 8 notices recorded yet.
                      </div>
                    ) : (
                      (tenancy.section8Notices || []).map((notice, index) => (
                        <div key={`${notice.servedDate}-${index}`} className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="font-semibold text-slate-900">Notice #{index + 1}</p>
                            <span className="rounded-full bg-orange-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-orange-700">
                              Pending
                            </span>
                          </div>
                          <p className="mt-2 text-slate-600">Served: {formatDate(notice.servedDate)}</p>
                          <p className="text-slate-600">Expiry: {formatDate(notice.expiryDate)}</p>
                          <p className="text-slate-600">Grounds: {(notice.grounds || []).join(", ") || "Not recorded"}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div>
                    <h3 className="text-base font-semibold text-slate-900">Section 13 Rent Increase</h3>
                    <p className="mt-1 text-sm text-slate-500">Record a rent increase notice and keep the proposed rent on file.</p>
                  </div>

                  <Form method="post" className="mt-5 space-y-4">
                    <input type="hidden" name="intent" value="record-section13" />
                    <input type="hidden" name="servedDate" value={new Date().toISOString().split("T")[0]} />
                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="space-y-1 text-sm">
                        <span className="font-medium text-slate-700">Current Rent</span>
                        <input
                          name="currentRent"
                          type="number"
                          min="0"
                          step="0.01"
                          defaultValue={tenancy.rent?.amount || ""}
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#2657F7]"
                          required
                        />
                      </label>
                      <label className="space-y-1 text-sm">
                        <span className="font-medium text-slate-700">Proposed Rent</span>
                        <input
                          name="proposedRent"
                          type="number"
                          min="0"
                          step="0.01"
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#2657F7]"
                          required
                        />
                      </label>
                    </div>
                    <label className="space-y-1 text-sm block">
                      <span className="font-medium text-slate-700">Effective Date</span>
                      <input
                        name="effectiveDate"
                        type="date"
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#2657F7]"
                        required
                      />
                    </label>
                    <button
                      type="submit"
                      className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-black"
                    >
                      Save Notice
                    </button>
                  </Form>

                  <div className="mt-5 space-y-3">
                    {(tenancy.section13Notices || []).length === 0 ? (
                      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                        No Section 13 notices recorded yet.
                      </div>
                    ) : (
                      (tenancy.section13Notices || []).map((notice, index) => (
                        <div key={`${notice.servedDate}-${index}`} className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="font-semibold text-slate-900">Notice #{index + 1}</p>
                            <span className="rounded-full bg-violet-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-violet-700">
                              Pending
                            </span>
                          </div>
                          <p className="mt-2 text-slate-600">Served: {formatDate(notice.servedDate)}</p>
                          <p className="text-slate-600">Proposed rent: £{Number(notice.proposedRent).toLocaleString("en-GB")}</p>
                          <p className="text-slate-600">Effective: {formatDate(notice.effectiveDate)}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-red-200 bg-red-50 p-5 shadow-sm">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                  <div>
                    <h3 className="text-base font-semibold text-red-900">End Tenancy</h3>
                    <p className="mt-1 text-sm text-red-700">Record the end of the tenancy once notice has been processed.</p>
                  </div>

                  <Form method="post" className="grid gap-3 sm:grid-cols-3">
                    <input type="hidden" name="intent" value="end-tenancy" />
                    <label className="space-y-1 text-sm">
                      <span className="font-medium text-red-900">Reason</span>
                      <select
                        name="endReason"
                        defaultValue="other"
                        className="w-full rounded-lg border border-red-200 px-3 py-2 text-sm outline-none focus:border-red-400 bg-white"
                      >
                        <option value="tenant_notice">Tenant Notice</option>
                        <option value="section8">Section 8</option>
                        <option value="mutual_agreement">Mutual Agreement</option>
                        <option value="fixed_term_end">Fixed Term End</option>
                        <option value="abandonment">Abandonment</option>
                        <option value="other">Other</option>
                      </select>
                    </label>
                    <label className="space-y-1 text-sm">
                      <span className="font-medium text-red-900">End Date</span>
                      <input
                        name="actualEndDate"
                        type="date"
                        defaultValue={new Date().toISOString().split("T")[0]}
                        className="w-full rounded-lg border border-red-200 px-3 py-2 text-sm outline-none focus:border-red-400 bg-white"
                        required
                      />
                    </label>
                    <div className="flex items-end">
                      <button
                        type="submit"
                        className="w-full rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700"
                      >
                        End Tenancy
                      </button>
                    </div>
                  </Form>
                </div>
              </div>
            </div>
          )}
          {activeTab === "timeline" && (
            <Timeline
              entityType="tenancy"
              entityId={tenancyId}
              notes={notes}
              hasMore={notesHasMore}
              currentUserId={currentUserId}
              currentUserRole={currentUserRole}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ── TAB COMPONENTS ─────────────────────────────────────────────────────────────
function OverviewTab({ 
  tenancy, 
  rraModalOpen, 
  setRraModalOpen, 
  rraFetcher, 
  rraMethod, 
  setRraMethod, 
  rraCheckedTenants, 
  setRraCheckedTenants 
}) {
  const RRA_CUTOFF = new Date("2026-05-01");
  const isRraApplicable = new Date(tenancy.startDate) < RRA_CUTOFF;

  const formatDate = (date) => {
    if (!date) return "";
    return fmtDate(date);
  };

  const formatCurrency = (amount) => {
    return amount ? `£${Number(amount).toLocaleString("en-GB")}` : "—";
  };

  const getDuration = () => {
    if (tenancy.tenancyType === "apt") return "Ongoing";
    if (tenancy.startDate && tenancy.endDate) {
      const start = new Date(tenancy.startDate);
      const end = new Date(tenancy.endDate);
      const months = Math.round((end - start) / (1000 * 60 * 60 * 24 * 30.44));
      return `${months} months`;
    }
    return "—";
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* LEFT COLUMN (2/3 width) */}
      <div className="lg:col-span-2 space-y-6">
        {/* TENANCY DETAILS */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Tenancy Details</h3>
          <dl className="grid grid-cols-2 gap-4">
            <div>
              <dt className="text-sm font-medium text-gray-500">Type</dt>
              <dd className="text-sm text-gray-900 mt-1">
                <Badge variant="info">{tenancy.tenancyType?.toUpperCase()}</Badge>
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Status</dt>
              <dd className="text-sm text-gray-900 mt-1">
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${tenancy.status === "active" ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"
                  }`}>
                  {tenancy.status?.charAt(0).toUpperCase() + tenancy.status?.slice(1)}
                </span>
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Start Date</dt>
              <dd className="text-sm text-gray-900 mt-1">{formatDate(tenancy.startDate)}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">End Date</dt>
              <dd className="text-sm text-gray-900 mt-1">
                {tenancy.tenancyType === "apt" ? "Periodic" : formatDate(tenancy.endDate)}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Duration</dt>
              <dd className="text-sm text-gray-900 mt-1">{getDuration()}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Created By</dt>
              <dd className="text-sm text-gray-900 mt-1">
                {tenancy.createdBy?.title ? tenancy.createdBy?.title + ' ' : ''}{tenancy.createdBy?.firstName} {tenancy.createdBy?.lastName} on {formatDate(tenancy.createdAt)}
              </dd>
            </div>
          </dl>
        </div>

        {/* RENT */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Rent</h3>
          <dl className="grid grid-cols-2 gap-4">
            <div>
              <dt className="text-sm font-medium text-gray-500">Monthly Rent</dt>
              <dd className="text-sm text-gray-900 mt-1">{formatCurrency(tenancy.rent?.amount)}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Due Day</dt>
              <dd className="text-sm text-gray-900 mt-1">{tenancy.rent?.dueDay ? `${tenancy.rent.dueDay}st of month` : "—"}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Payment Method</dt>
              <dd className="text-sm text-gray-900 mt-1">{tenancy.rent?.paymentMethod || "—"}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Next Review</dt>
              <dd className="text-sm text-gray-900 mt-1">{formatDate(tenancy.rent?.reviewDate)}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-sm font-medium text-gray-500">Last Increased</dt>
              <dd className="text-sm text-gray-900 mt-1">Never</dd>
            </div>
          </dl>
        </div>

        {/* DEPOSIT */}
        {(tenancy.deposit?.amount > 0) && (
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Deposit</h3>
            <dl className="grid grid-cols-2 gap-4">
              <div>
                <dt className="text-sm font-medium text-gray-500">Amount</dt>
                <dd className="text-sm text-gray-900 mt-1">{formatCurrency(tenancy.deposit?.amount)}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Scheme</dt>
                <dd className="text-sm text-gray-900 mt-1">{tenancy.deposit?.scheme || "—"}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Reference</dt>
                <dd className="text-sm text-gray-900 mt-1">{tenancy.deposit?.reference || "—"}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Protected</dt>
                <dd className="text-sm text-gray-900 mt-1 flex items-center gap-1">
                  {tenancy.deposit?.protectedDate ? <><CheckCircle className="w-3.5 h-3.5 text-green-600" /> {formatDate(tenancy.deposit.protectedDate)}</> : <><XCircle className="w-3.5 h-3.5 text-red-600" /> Not protected</>}
                </dd>
              </div>
              <div className="col-span-2">
                <dt className="text-sm font-medium text-gray-500">Prescribed Info</dt>
                <dd className="text-sm text-gray-900 mt-1 flex items-center gap-1">
                  {tenancy.deposit?.prescribedInfoServedDate ? <><CheckCircle className="w-3.5 h-3.5 text-green-600" /> {formatDate(tenancy.deposit.prescribedInfoServedDate)}</> : <><XCircle className="w-3.5 h-3.5 text-red-600" /> Not served</>}
                </dd>
              </div>
            </dl>

            {!tenancy.deposit?.protectedDate && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-800 font-medium">Deposit not protected</p>
                <p className="text-xs text-red-700 mt-1">Must be protected within 30 days of tenancy start.</p>
                <Form method="post" className="mt-3 flex flex-wrap gap-2 items-end">
                  <input type="hidden" name="intent" value="mark-deposit-protected" />
                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-red-900">Date Protected</span>
                    <UKDateInput
                      name="protectedDate"
                      defaultValue={new Date().toISOString().split("T")[0]}
                      className="rounded border border-red-300 px-2 py-1 text-xs bg-white"
                      required
                    />
                  </label>
                  <button
                    type="submit"
                    className="px-3 py-1.5 bg-red-600 text-white text-xs font-medium rounded hover:bg-red-700 transition"
                  >
                    Mark as Protected
                  </button>
                </Form>
              </div>
            )}

            {tenancy.deposit?.protectedDate && !tenancy.deposit?.prescribedInfoServedDate && (
              <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <p className="text-sm text-amber-800 font-medium">Prescribed information not yet served</p>
                <p className="text-xs text-amber-700 mt-1">Must be served within 30 days of tenancy start.</p>
                <Form method="post" className="mt-3 flex flex-wrap gap-2 items-end">
                  <input type="hidden" name="intent" value="mark-prescribed-info-served" />
                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-amber-900">Date Served</span>
                    <UKDateInput
                      name="servedDate"
                      defaultValue={new Date().toISOString().split("T")[0]}
                      className="rounded border border-amber-300 px-2 py-1 text-xs bg-white"
                      required
                    />
                  </label>
                  <button
                    type="submit"
                    className="px-3 py-1.5 bg-amber-600 text-white text-xs font-medium rounded hover:bg-amber-700 transition"
                  >
                    Mark as Served
                  </button>
                </Form>
              </div>
            )}
          </div>
        )}

        {/* HOW TO RENT */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">How to Rent</h3>
          <dl className="space-y-3">
            <div>
              <dt className="text-sm font-medium text-gray-500">Served</dt>
              <dd className="text-sm text-gray-900 mt-1 flex items-center gap-1">
                {tenancy.howToRent?.served ? <><CheckCircle className="w-3.5 h-3.5 text-green-600" /> {formatDate(tenancy.howToRent?.servedDate)}</> : <><XCircle className="w-3.5 h-3.5 text-red-600" /> Not served</>}
              </dd>
            </div>
            {tenancy.howToRent?.served && (
              <div>
                <dt className="text-sm font-medium text-gray-500">Version</dt>
                <dd className="text-sm text-gray-900 mt-1">{tenancy.howToRent?.version || "—"}</dd>
              </div>
            )}
          </dl>

          {!tenancy.howToRent?.served && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-800">How to Rent guide not served. Must be served before tenancy start.</p>
              <Form method="post" className="mt-2">
                <input type="hidden" name="intent" value="mark-how-to-rent-served" />
                <input type="hidden" name="servedDate" value={new Date().toISOString().split("T")[0]} />
                <input type="hidden" name="version" value="current" />
                <button
                  type="submit"
                  className="mt-2 px-3 py-1 bg-red-600 text-white text-xs font-medium rounded hover:bg-red-700 transition"
                >
                  Mark as Served
                </button>
              </Form>
            </div>
          )}
        </div>
      </div>

      {/* RIGHT COLUMN (1/3 width) */}
      <div className="space-y-6">
        {/* PROPERTY */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Property</h3>
          <div className="space-y-3">
            <p className="text-sm text-gray-900">
              {tenancy.propertyId?.addressLine1}
              {tenancy.propertyId?.city && `, ${tenancy.propertyId.city}`}
              {tenancy.propertyId?.postcode && ` ${tenancy.propertyId.postcode}`}
            </p>
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{tenancy.propertyId?.propertyType}</Badge>
            </div>
            <Link
              to={`/properties/${tenancy.propertyId?._id}`}
              className="inline-flex items-center text-sm text-indigo-600 hover:underline"
            >
              View Property
            </Link>
          </div>
        </div>

        {/* LANDLORD */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Landlord</h3>
          <div className="space-y-3">
            <p className="text-sm font-medium text-gray-900">
              <Link to={`/landlords/${tenancy.landlordId?._id}`} className="text-indigo-600 hover:underline">
                {tenancy.landlordId?.title ? tenancy.landlordId?.title + ' ' : ''}{tenancy.landlordId?.firstName} {tenancy.landlordId?.lastName}
              </Link>
            </p>
            <p className="text-sm text-gray-600">{tenancy.landlordId?.email}</p>
            <p className="text-sm text-gray-600">{tenancy.landlordId?.phone}</p>
            <Badge variant={tenancy.landlordId?.landlordData?.amlResult === "pass" ? "success" : "danger"}>
              AML: {tenancy.landlordId?.landlordData?.amlResult || "Unknown"}
            </Badge>
            <Link to={`/landlords/${tenancy.landlordId?._id}`} className="inline-flex items-center text-sm text-indigo-600 hover:underline">
              View Landlord
            </Link>
          </div>
        </div>

        {/* TENANTS */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Tenant{tenancy.tenantIds?.length > 1 ? "s" : ""}</h3>
          <div className="space-y-4">
            {tenancy.tenantIds?.map((tenant, index) => (
              <div key={tenant._id} className={index > 0 ? "border-t border-gray-200 pt-4" : ""}>
                <p className="text-sm font-medium text-gray-900">
                  <Link to={`/tenants/${tenant._id}`} className="text-indigo-600 hover:underline">
                    {tenant.title ? tenant.title + ' ' : ''}{tenant.firstName} {tenant.lastName}
                  </Link>
                </p>
                <p className="text-sm text-gray-600">{tenant.email}</p>
                <p className="text-sm text-gray-600">{tenant.phone}</p>
                {(() => {
                  const rtr = getRightToRentStatus(tenant);
                  const variantMap = {
                    valid: "success",
                    expiring_soon: "warning",
                    expired: "danger",
                    not_checked: "warning"
                  };
                  return (
                    <Badge variant={variantMap[rtr.status] || "warning"}>
                      RTR: {rtr.label}
                    </Badge>
                  );
                })()}
              </div>
            ))}
          </div>
        </div>

        {/* ── RRA INFORMATION SHEET CARD ─────────────────────────────────── */}
        {(() => {
          const rra = tenancy.rrainformationSheet || {};
          const methodLabels = {
            email_attachment: "Email attachment (PDF)",
            post: "Post (printed copy)",
            hand_delivered: "Hand delivered (printed copy)",
          };
          const proofHelperText = {
            email_attachment: "Upload a screenshot of the sent email showing the PDF attachment",
            post: "Upload Royal Mail tracking confirmation or certificate of posting",
            hand_delivered: "Upload a signed receipt or dated photo",
          };

          if (!isRraApplicable) {
            return (
              <div className="bg-white rounded-lg border border-gray-200 p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">RRA Information Sheet</h3>
                <p className="text-sm text-gray-500">Not required — this tenancy was created after 1 May 2026. A Written Statement is required instead.</p>
              </div>
            );
          }

          if (rra.served) {
            const servedNames = (rra.servedToTenantIds || []).length > 0
              ? tenancy.tenantIds
                  ?.filter(t => (rra.servedToTenantIds || []).map(String).includes(t._id.toString()))
                  .map(t => `${t.title ? t.title + ' ' : ''}${t.firstName} ${t.lastName}`)
                  .join(", ")
              : "—";
            return (
              <div className="bg-white rounded-lg border border-green-300 p-6">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-lg font-semibold text-gray-900">RRA Information Sheet</h3>
                  <CheckCircle className="w-5 h-5 text-green-600" />
                </div>
                <dl className="space-y-2 text-sm">
                  <div><dt className="text-gray-500 font-medium">Served</dt><dd className="text-gray-900">{formatDate(rra.servedDate)}</dd></div>
                  <div><dt className="text-gray-500 font-medium">Method</dt><dd className="text-gray-900">{methodLabels[rra.method] || rra.method || "—"}</dd></div>
                  <div><dt className="text-gray-500 font-medium">Sent to</dt><dd className="text-gray-900">{servedNames}</dd></div>
                  {rra.notes && <div><dt className="text-gray-500 font-medium">Notes</dt><dd className="text-gray-900">{rra.notes}</dd></div>}
                  <div><dt className="text-gray-500 font-medium">Proof</dt><dd className="text-gray-900">{rra.proofDocumentId ? <span className="text-green-700 font-medium">✓ Document uploaded</span> : <span className="text-gray-400">Not uploaded</span>}</dd></div>
                </dl>
                <button onClick={() => setRraModalOpen(true)} className="mt-4 text-xs text-indigo-600 hover:underline">Edit record</button>
              </div>
            );
          }

          return (
            <div className="bg-white rounded-lg border border-amber-300 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">RRA Information Sheet</h3>
              <div className="flex items-start gap-2 mb-3">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-sm text-amber-800">Not yet recorded. The official RRA Information Sheet must be served to every named tenant as a PDF attachment. Sending a link is not valid.</p>
              </div>
              <button
                onClick={() => setRraModalOpen(true)}
                className="px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 transition"
              >
                Mark as Served
              </button>
            </div>
          );
        })()}

        {/* ── RRA MARK AS SERVED MODAL ───────────────────────────────────── */}
        {rraModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between p-6 border-b border-gray-100">
                <h2 className="text-lg font-semibold text-gray-900">Record RRA Information Sheet Service</h2>
                <button onClick={() => setRraModalOpen(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
              </div>

              <rraFetcher.Form
                method="post"
                action={`/api/tenancies/${tenancy._id}/rra-information-sheet`}
                encType="multipart/form-data"
                className="p-6 space-y-5"
              >
                {/* Error message */}
                {rraFetcher.data?.error && (
                  <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{rraFetcher.data.error}</div>
                )}

                {/* Date Served */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date Served <span className="text-red-500">*</span></label>
                  <UKDateInput
                    name="servedDate"
                    defaultValue={new Date().toISOString().split("T")[0]}
                    max={new Date().toISOString().split("T")[0]}
                    required
                  />
                </div>

                {/* Method */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Delivery Method <span className="text-red-500">*</span></label>
                  <div className="space-y-2">
                    {[
                      { value: "email_attachment", label: "Email attachment", desc: "PDF sent as an email attachment (not a link)" },
                      { value: "post", label: "Post", desc: "Printed copy sent by post" },
                      { value: "hand_delivered", label: "Hand delivered", desc: "Printed copy given in person" },
                    ].map((opt) => (
                      <label key={opt.value} className="flex items-start gap-3 cursor-pointer">
                        <input
                          type="radio"
                          name="method"
                          value={opt.value}
                          checked={rraMethod === opt.value}
                          onChange={() => setRraMethod(opt.value)}
                          className="mt-0.5"
                          required
                        />
                        <div>
                          <p className="text-sm font-medium text-gray-900">{opt.label}</p>
                          <p className="text-xs text-gray-500">{opt.desc}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-amber-700 font-medium">⚠ Sending a link to the PDF is not valid service.</p>
                </div>

                {/* Served to */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Served to <span className="text-red-500">*</span></label>
                  <div className="space-y-2">
                    {(tenancy.tenantIds || []).map((tenant) => {
                      const tid = tenant._id.toString();
                      return (
                        <label key={tid} className="flex items-center gap-3 cursor-pointer">
                          <input
                            type="checkbox"
                            name="servedToTenantIds"
                            value={tid}
                            checked={rraCheckedTenants.includes(tid)}
                            onChange={(e) => {
                              if (e.target.checked) setRraCheckedTenants((p) => [...p, tid]);
                              else setRraCheckedTenants((p) => p.filter((id) => id !== tid));
                            }}
                          />
                          <span className="text-sm text-gray-900">{tenant.title ? tenant.title + ' ' : ''}{tenant.firstName} {tenant.lastName}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* Proof upload */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Upload proof of delivery <span className="text-gray-400">(optional but recommended)</span></label>
                  <input type="file" name="proofFile" accept=".pdf,.jpg,.jpeg,.png" className="block w-full text-sm text-gray-700" />
                  <p className="mt-1 text-xs text-gray-500">{{
                    email_attachment: "Upload a screenshot of the sent email showing the PDF attachment",
                    post: "Upload Royal Mail tracking confirmation or certificate of posting",
                    hand_delivered: "Upload a signed receipt or dated photo",
                  }[rraMethod]}</p>
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Notes <span className="text-gray-400">(optional)</span></label>
                  <textarea
                    name="notes"
                    rows={2}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="e.g. Sent via Gmail at 14:32. Both tenants confirmed receipt."
                  />
                </div>

                {/* Actions */}
                <div className="flex gap-3 pt-2">
                  <button
                    type="submit"
                    disabled={rraFetcher.state !== "idle"}
                    className="flex-1 px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-60 transition"
                  >
                    {rraFetcher.state !== "idle" ? "Saving…" : "Save Record"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setRraModalOpen(false)}
                    className="px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 transition"
                  >
                    Cancel
                  </button>
                </div>
              </rraFetcher.Form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── STATUS BADGE helper ───────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const map = {
    paid: "bg-green-100 text-green-800",
    partial: "bg-amber-100 text-amber-800",
    overdue: "bg-red-100 text-red-800",
    due: "bg-amber-100 text-amber-700 ring-1 ring-amber-300",
    pending: "bg-gray-100 text-gray-600",
    waived: "bg-gray-100 text-gray-500 line-through",
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${map[status] || "bg-gray-100 text-gray-600"}`}>
      {status}
    </span>
  );
}

// ── ARREARS BANNER ────────────────────────────────────────────────────────────
function ArrearsBanner({ arrearsStatus, currentMonthPayment, onRecordClick }) {
  const fmt = (n) => `£${Number(n || 0).toLocaleString("en-GB", { minimumFractionDigits: 2 })}`;
  if (arrearsStatus.monthsArrears >= 2) {
    return (
      <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl">
        <XCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-bold text-red-800">Rent Arrears — {arrearsStatus.monthsArrears} months overdue</p>
          <p className="text-xs text-red-700 mt-0.5">Total outstanding: {fmt(arrearsStatus.totalArrears)}. This tenancy has significant arrears recorded.</p>
        </div>
      </div>
    );
  }
  if (arrearsStatus.monthsArrears === 1) {
    return (
      <div className="flex items-center justify-between gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-amber-800">1 month rent overdue</p>
            <p className="text-xs text-amber-700 mt-0.5">{fmt(arrearsStatus.totalArrears)} outstanding</p>
          </div>
        </div>
        {onRecordClick && <button onClick={onRecordClick} className="px-3 py-1.5 bg-amber-600 text-white text-xs font-semibold rounded-lg hover:bg-amber-700 transition shrink-0">Record Payment</button>}
      </div>
    );
  }
  if (arrearsStatus.totalArrears > 0) {
    return (
      <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
        <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-bold text-amber-800">Partial payment — {fmt(arrearsStatus.totalArrears)} outstanding</p>
          <p className="text-xs text-amber-700 mt-0.5">from previous payment(s)</p>
        </div>
      </div>
    );
  }
  if (currentMonthPayment?.status === 'paid') {
    return (
      <div className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-xl">
        <CheckCircle className="w-4 h-4 text-green-600" />
        <p className="text-sm text-green-800 font-medium">This month's rent has been received</p>
      </div>
    );
  }
  return null;
}

// ── RENT SUMMARY CARD ─────────────────────────────────────────────────────────
function RentSummaryCard({ tenancy, rentData }) {
  const { ytdTotals, commissionDisplay, currentYear } = rentData;
  const fmt = (n) => `£${Number(n || 0).toLocaleString("en-GB", { minimumFractionDigits: 2 })}`;
  const monthlyRent = tenancy.rent?.amount || 0;
  const commission = tenancy.propertyId?.commission;
  let monthlyComm = 0;
  if (commission?.rate) {
    monthlyComm = commission.type === 'percentage' ? (monthlyRent * commission.rate) / 100 : Math.min(commission.rate, monthlyRent);
  }
  const monthlyNet = monthlyRent - monthlyComm;

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm space-y-4">
      {/* Monthly figures */}
      <div>
        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Monthly Rent</p>
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
            <p className="text-[10px] text-gray-500 font-medium">Rent</p>
            <p className="text-lg font-extrabold text-gray-900 mt-0.5">{fmt(monthlyRent)}</p>
          </div>
          <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
            <p className="text-[10px] text-gray-500 font-medium">Commission {commissionDisplay ? `(${commissionDisplay})` : ''}</p>
            {commissionDisplay
              ? <p className="text-lg font-extrabold text-gray-700 mt-0.5">{fmt(monthlyComm)}</p>
              : <p className="text-xs text-amber-600 font-semibold mt-1">Not set</p>}
          </div>
          <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
            <p className="text-[10px] text-gray-500 font-medium">Net to Landlord</p>
            <p className="text-lg font-extrabold text-indigo-700 mt-0.5">{fmt(monthlyNet)}</p>
          </div>
        </div>
      </div>

      <div className="border-t border-gray-100 pt-4">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Year to Date ({currentYear})</p>
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-green-50 p-3 rounded-lg border border-green-100">
            <p className="text-[10px] text-gray-500 font-medium">Rent Collected</p>
            <p className="text-lg font-extrabold text-green-700 mt-0.5">{fmt(ytdTotals.totalRent)}</p>
          </div>
          <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
            <p className="text-[10px] text-gray-500 font-medium">Commission Earned</p>
            <p className="text-lg font-extrabold text-gray-700 mt-0.5">{fmt(ytdTotals.totalCommission)}</p>
          </div>
          <div className="bg-blue-50 p-3 rounded-lg border border-blue-100">
            <p className="text-[10px] text-gray-500 font-medium">Net to Landlord</p>
            <p className="text-lg font-extrabold text-blue-700 mt-0.5">{fmt(ytdTotals.totalNet)}</p>
          </div>
        </div>
        <p className="text-xs text-gray-400 mt-2">Payments recorded: {ytdTotals.paymentsCount}</p>
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-gray-100">
        <Link
          to={`/rent/landlord/${tenancy.landlordId?._id?.toString() || tenancy.landlordId?.toString() || ""}`}
          className="text-xs text-indigo-600 hover:underline font-semibold"
        >
          View Landlord Statement →
        </Link>
        {!commissionDisplay && (
          <Link to={`/properties/${tenancy.propertyId?._id?.toString() || ""}`} className="text-xs text-amber-600 hover:underline">
            Set commission on property →
          </Link>
        )}
      </div>
    </div>
  );
}

// ── RECORD PAYMENT MODAL ──────────────────────────────────────────────────────
function RecordPaymentModal({ payment, commission, onClose }) {
  const fetcher = useFetcher();
  const [amountPaid, setAmountPaid] = useState(payment.amountDue);
  const [isPartial, setIsPartial] = useState(false);
  const isSubmitting = fetcher.state === 'submitting';

  const fmt = (n) => `£${Number(n || 0).toLocaleString("en-GB", { minimumFractionDigits: 2 })}`;

  // Live commission preview
  let commAmount = 0;
  if (commission?.rate) {
    commAmount = commission.type === 'percentage'
      ? (amountPaid * commission.rate) / 100
      : Math.min(commission.rate, amountPaid);
    commAmount = Math.round(commAmount * 100) / 100;
  }
  const netToLandlord = Math.round((amountPaid - commAmount) * 100) / 100;

  // Close on success
  if (fetcher.data?.success) {
    onClose();
  }

  const periodLabel = new Date(payment.periodStart).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-xl shadow-xl w-full max-w-md overflow-hidden">
        <div className="flex justify-between items-center bg-slate-50 px-5 py-4 border-b border-slate-200">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Record Rent Payment</h3>
            <p className="text-xs text-slate-400 mt-0.5">{periodLabel}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X className="w-4 h-4" /></button>
        </div>

        <fetcher.Form method="post" className="p-5 space-y-4">
          <input type="hidden" name="intent" value="record-rent-payment" />
          <input type="hidden" name="paymentId" value={payment._id} />

          {fetcher.data?.error && (
            <div className="text-xs text-red-700 bg-red-50 border border-red-200 p-2.5 rounded-lg">{fetcher.data.error}</div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Period</p>
              <p className="mt-1 text-xs font-semibold text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2">{periodLabel}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Amount Due</p>
              <p className="mt-1 text-xs font-semibold text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2">£{Number(payment.amountDue).toLocaleString('en-GB', { minimumFractionDigits: 2 })}</p>
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Amount Received *</label>
              <button type="button" onClick={() => setAmountPaid(payment.amountDue)} className="text-[10px] text-indigo-600 hover:underline font-semibold">Full Amount</button>
            </div>
            <input
              type="number" name="amountPaid" step="0.01" required min="0.01"
              max={isPartial ? payment.amountDue - 0.01 : payment.amountDue}
              value={amountPaid}
              onChange={e => setAmountPaid(parseFloat(e.target.value) || 0)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <label className="flex items-center gap-2 mt-1.5 text-xs text-slate-600 cursor-pointer">
              <input type="checkbox" checked={isPartial} onChange={e => { setIsPartial(e.target.checked); if (!e.target.checked) setAmountPaid(payment.amountDue); }} className="rounded" />
              Partial payment (amount less than rent due)
            </label>
            {isPartial && (
              <p className="mt-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">
                Outstanding: £{Math.max(0, payment.amountDue - amountPaid).toLocaleString('en-GB', { minimumFractionDigits: 2 })}. Status will be set to 'Partial'.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Payment Date *</label>
              <input type="date" name="paymentDate" required defaultValue={new Date().toISOString().split('T')[0]} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500" />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Payment Method *</label>
              <select name="paymentMethod" required className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500">
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
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Bank Reference</label>
            <input type="text" name="reference" placeholder="e.g. SO-1234" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500" />
          </div>

          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Notes</label>
            <textarea name="notes" rows="2" placeholder="e.g. Tenant confirmed payment sent" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500" />
          </div>

          {/* Live commission preview */}
          <div className="border border-slate-200 bg-slate-50/50 rounded-xl p-3 space-y-1.5">
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Commission Preview</p>
            {commission?.rate ? (
              <>
                <div className="flex justify-between text-xs text-slate-600">
                  <span>Gross received</span>
                  <span className="font-semibold">{fmt(amountPaid)}</span>
                </div>
                <div className="flex justify-between text-xs text-slate-600">
                  <span>Commission ({commission.type === 'percentage' ? `${commission.rate}%` : 'Fixed'})</span>
                  <span className="text-red-600 font-semibold">- {fmt(commAmount)}</span>
                </div>
                <div className="flex justify-between text-xs font-bold text-slate-800 border-t border-slate-200 pt-1.5 mt-1.5">
                  <span>Net to Landlord</span>
                  <span className="text-indigo-700">{fmt(netToLandlord)}</span>
                </div>
              </>
            ) : (
              <p className="text-xs text-amber-600">Commission not configured for this property. Net amount cannot be calculated.</p>
            )}
          </div>

          <div className="flex justify-end gap-2.5">
            <button type="button" onClick={onClose} className="px-4 py-2 border border-slate-200 text-xs font-semibold rounded-lg text-slate-600 hover:bg-slate-50">Cancel</button>
            <button type="submit" disabled={isSubmitting} className="px-4 py-2 bg-slate-900 text-white text-xs font-semibold rounded-lg hover:bg-black disabled:opacity-50 transition">
              {isSubmitting ? 'Recording...' : 'Record Payment'}
            </button>
          </div>
        </fetcher.Form>
      </div>
    </div>
  );
}

// ── WAIVE MODAL ───────────────────────────────────────────────────────────────
function WaiveModal({ payment, onClose }) {
  const fetcher = useFetcher();
  if (fetcher.data?.success) onClose();
  const periodLabel = new Date(payment.periodStart).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-xl shadow-xl w-full max-w-sm overflow-hidden">
        <div className="flex justify-between items-center bg-slate-50 px-5 py-4 border-b border-slate-200">
          <h3 className="text-sm font-bold text-slate-900">Waive Payment</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X className="w-4 h-4" /></button>
        </div>
        <fetcher.Form method="post" className="p-5 space-y-4">
          <input type="hidden" name="intent" value="waive-rent-payment" />
          <input type="hidden" name="paymentId" value={payment._id} />
          <p className="text-xs text-slate-600">
            Are you sure you want to waive the <strong>{periodLabel}</strong> payment of <strong>£{Number(payment.amountDue).toLocaleString('en-GB')}</strong>? This will remove it from arrears.
          </p>
          {fetcher.data?.error && <p className="text-xs text-red-700 bg-red-50 border border-red-200 p-2 rounded-lg">{fetcher.data.error}</p>}
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Reason for Waiving *</label>
            <textarea name="waivedReason" required rows="3" placeholder="e.g. Agreed with landlord — final month discount" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-red-400" />
          </div>
          <div className="flex justify-end gap-2.5">
            <button type="button" onClick={onClose} className="px-4 py-2 border border-slate-200 text-xs font-semibold rounded-lg text-slate-600 hover:bg-slate-50">Cancel</button>
            <button type="submit" disabled={fetcher.state === 'submitting'} className="px-4 py-2 bg-red-600 text-white text-xs font-semibold rounded-lg hover:bg-red-700 disabled:opacity-50 transition">Waive Payment</button>
          </div>
        </fetcher.Form>
      </div>
    </div>
  );
}

// ── MAIN RENT TAB ─────────────────────────────────────────────────────────────
function RentTab({ tenancy, tenancyId, rentData, isAdmin, currentUserRole }) {
  const [activeModal, setActiveModal] = useState(null); // { type: 'record'|'waive', payment }
  const [expandedId, setExpandedId] = useState(null);
  const generateFetcher = useFetcher();

  if (!rentData) {
    return <div className="py-12 text-center text-gray-400 text-sm">Loading rent data…</div>;
  }

  const { rentPayments, arrearsStatus, currentMonthPayment, commissionDisplay } = rentData;
  const commission = tenancy.propertyId?.commission || null;
  const fmt = (n) => `£${Number(n || 0).toLocaleString("en-GB", { minimumFractionDigits: 2 })}`;

  const canWaive = isAdmin || currentUserRole === 'agency_admin';

  return (
    <div className="space-y-5">
      {/* Arrears Banner */}
      <ArrearsBanner
        arrearsStatus={arrearsStatus}
        currentMonthPayment={currentMonthPayment}
        onRecordClick={rentPayments.find(p => ['due', 'overdue', 'partial'].includes(p.status))
          ? () => setActiveModal({ type: 'record', payment: rentPayments.find(p => ['due', 'overdue', 'partial'].includes(p.status)) })
          : null
        }
      />

      {/* Rent Summary Card */}
      <RentSummaryCard tenancy={tenancy} rentData={rentData} />

      {/* Payment History Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
        <div className="px-5 py-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
          <h3 className="text-sm font-bold text-gray-800 uppercase tracking-widest">Payment History</h3>
          <button
            onClick={() => {
              const first = rentPayments.find(p => ['pending', 'due', 'overdue', 'partial'].includes(p.status));
              if (first) setActiveModal({ type: 'record', payment: first });
            }}
            className="px-3.5 py-2 bg-indigo-600 text-white text-xs font-semibold rounded-lg hover:bg-indigo-700 transition"
          >
            + Record Payment
          </button>
        </div>

        {rentPayments.length === 0 ? (
          <div className="py-12 text-center text-gray-400 text-sm space-y-3">
            <p>No payment records yet.</p>
            <p className="text-xs text-gray-400">Payment records are created automatically when a tenancy is set up.</p>
            <generateFetcher.Form method="post">
              <input type="hidden" name="intent" value="generate-rent-payments" />
              <button type="submit" disabled={generateFetcher.state === 'submitting'} className="px-4 py-2 bg-indigo-600 text-white text-xs font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition">
                {generateFetcher.state === 'submitting' ? 'Generating…' : 'Generate Payment Records'}
              </button>
            </generateFetcher.Form>
            {generateFetcher.data?.error && <p className="text-xs text-red-600">{generateFetcher.data.error}</p>}
            {generateFetcher.data?.message && <p className="text-xs text-green-600">{generateFetcher.data.message}</p>}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-gray-200 text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                  <th className="p-4">Period</th>
                  <th className="p-4">Due Date</th>
                  <th className="p-4 text-right">Rent Due</th>
                  <th className="p-4 text-right">Paid</th>
                  <th className="p-4 text-right">Outstanding</th>
                  <th className="p-4 text-right">Commission</th>
                  <th className="p-4 text-right">Net</th>
                  <th className="p-4">Status</th>
                  <th className="p-4">Paid Date</th>
                  <th className="p-4">Method</th>
                  <th className="p-4">Recorded By</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {rentPayments.map(p => {
                  const isExpanded = expandedId === p._id;
                  const rowBg = p.status === 'overdue' ? 'bg-red-50/40' : p.status === 'due' ? 'bg-amber-50/30' : '';
                  const actionable = ['pending', 'due', 'overdue', 'partial'].includes(p.status);
                  return (
                    <>
                      <tr key={p._id} className={`text-xs hover:bg-slate-50/50 transition-colors ${rowBg}`}>
                        <td className="p-4 font-semibold text-slate-800">
                          {new Date(p.periodStart).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
                        </td>
                        <td className="p-4 text-slate-600">{fmtDate(p.dueDate)}</td>
                        <td className="p-4 text-right font-semibold">{fmt(p.amountDue)}</td>
                        <td className="p-4 text-right text-green-700 font-semibold">{p.amountPaid > 0 ? fmt(p.amountPaid) : '—'}</td>
                        <td className={`p-4 text-right font-semibold ${p.amountOutstanding > 0 ? 'text-red-600' : 'text-slate-400'}`}>
                          {p.amountOutstanding > 0 ? fmt(p.amountOutstanding) : '—'}
                        </td>
                        <td className="p-4 text-right text-slate-400">{p.commissionAmount != null ? fmt(p.commissionAmount) : '—'}</td>
                        <td className="p-4 text-right text-indigo-700 font-semibold">{p.netToLandlord != null ? fmt(p.netToLandlord) : '—'}</td>
                        <td className="p-4"><StatusBadge status={p.status} /></td>
                        <td className="p-4 text-slate-500">{p.paidDate ? fmtDate(p.paidDate) : '—'}</td>
                        <td className="p-4 text-slate-500 capitalize">{p.paymentMethod ? p.paymentMethod.replace('_', ' ') : '—'}</td>
                        <td className="p-4 text-slate-400">
                          {p.recordedBy ? `${p.recordedBy.firstName} ${p.recordedBy.lastName[0]}.` : '—'}
                        </td>
                        <td className="p-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {actionable && (
                              <button
                                onClick={() => setActiveModal({ type: 'record', payment: p })}
                                className="px-2.5 py-1 bg-slate-900 text-white hover:bg-black rounded-md text-[10px] font-semibold transition"
                              >
                                Mark Paid
                              </button>
                            )}
                            {actionable && canWaive && (
                              <button
                                onClick={() => setActiveModal({ type: 'waive', payment: p })}
                                className="px-2 py-1 bg-white hover:bg-slate-50 border border-slate-200 rounded-md text-[10px] font-semibold text-slate-500 transition"
                              >
                                Waive
                              </button>
                            )}
                            {(p.status === 'paid' || p.status === 'partial' || p.status === 'waived') && (
                              <button
                                onClick={() => setExpandedId(isExpanded ? null : p._id)}
                                className="px-2 py-1 bg-white hover:bg-slate-50 border border-slate-200 rounded-md text-[10px] font-semibold text-slate-500 transition"
                              >
                                {isExpanded ? 'Hide' : 'View'}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr key={`${p._id}-expand`} className="bg-slate-50/70">
                          <td colSpan="12" className="px-6 py-4 text-xs text-slate-600 border-t border-slate-100">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                              <div>
                                <p className="font-bold text-slate-700 mb-1">Reference</p>
                                <p className="font-mono text-[10px] text-slate-400">{p.paymentReference || 'None recorded'}</p>
                              </div>
                              <div>
                                <p className="font-bold text-slate-700 mb-1">Notes</p>
                                <p className="italic text-slate-500">{p.notes || 'None'}</p>
                              </div>
                              <div>
                                <p className="font-bold text-slate-700 mb-1">Recorded</p>
                                {p.recordedBy
                                  ? <p>{p.recordedBy.title ? p.recordedBy.title + ' ' : ''}{p.recordedBy.firstName} {p.recordedBy.lastName} — {fmtDate(p.recordedAt)}</p>
                                  : <p className="text-slate-400">—</p>}
                                {p.status === 'waived' && (
                                  <p className="mt-1 text-red-600">Waived reason: {p.waivedReason}</p>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modals */}
      {activeModal?.type === 'record' && (
        <RecordPaymentModal
          payment={activeModal.payment}
          commission={commission}
          onClose={() => setActiveModal(null)}
        />
      )}
      {activeModal?.type === 'waive' && (
        <WaiveModal
          payment={activeModal.payment}
          onClose={() => setActiveModal(null)}
        />
      )}
    </div>
  );
}

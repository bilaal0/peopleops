// utils/dashboard.server.js
// Fetch and format all data for the Organization Dashboard.
// Enforces organization isolation, uses parallel execution, and uses lean queries.

import { connect } from "../config/db.server.js";
import { Property } from "../models/property.server.js";
import { Tenancy } from "../models/tenancy.server.js";
import { Document } from "../models/document.server.js";
import { DocumentType } from "../models/documentType.server.js";
import { RentPayment } from "../models/rentPayment.server.js";
import { User } from "../models/user.server.js";
import { Note } from "../models/note.server.js";
import { MaintenanceJob } from "../models/MaintenanceJob.server.js";

export async function getOrganizationDashboardData(organizationId) {
  await connect();

  const today = new Date();
  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const in7Days = new Date(startOfDay.getTime() + 7 * 24 * 60 * 60 * 1000);
  const in30Days = new Date(startOfDay.getTime() + 30 * 24 * 60 * 60 * 1000);

  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999);

  // 1. Fetch compliance certificate types
  const certDocTypes = await DocumentType.find({
    key: { $in: ["gas_safety_certificate", "eicr", "epc"] }
  }).lean();

  const certTypeIds = certDocTypes.map(dt => dt._id);
  const certTypesMap = {};
  certDocTypes.forEach(dt => {
    certTypesMap[dt._id.toString()] = dt;
  });

  // 2. Fetch basic totals and properties
  const [
    properties,
    activeTenancies,
    recentNotes,
    recentDocs,
    paymentsThisMonth,
    allUnresolvedPayments,
    activeJobs,
    ] = await Promise.all([
    // All non-deleted properties for status grouping
    Property.find({ organizationId, deleted: false })
      .select("status addressLine1 epcRating epcExpiryDate")
      .lean(),
    
    // Active tenancies for building scopes (tenants, properties)
    Tenancy.find({ organizationId, status: "active", deleted: false })
      .select("startDate endDate tenancyType deposit howToRent tenantIds propertyId landlordId")
      .populate("tenantIds", "title firstName lastName tenantData.rightToRentExpiry")
      .populate("propertyId", "addressLine1 epcRating epcExpiryDate")
      .lean(),

    // Recent activities (system events only)
    Note.find({ organizationId, isSystem: true, deleted: false })
      .select("text eventType entityType createdAt addedBy")
      .populate("addedBy", "title firstName lastName email")
      .sort({ createdAt: -1 })
      .limit(15)
      .lean(),

    // Recent uploaded documents
    Document.find({ organizationId, deleted: false })
      .populate("uploadedBy", "title firstName lastName")
      .populate("docType", "name key")
      .sort({ createdAt: -1 })
      .limit(10)
      .lean(),

    // Rent due/paid in the current month
    RentPayment.find({
      organizationId,
      dueDate: { $gte: startOfMonth, $lte: endOfMonth },
      deleted: false
    }).lean(),

    // Unresolved payments for arrears and warning flags
    RentPayment.find({
      organizationId,
      status: { $in: ["overdue", "partial", "due"] },
      deleted: false
    })
      .populate("propertyId", "addressLine1")
      .lean(),

    // Active maintenance jobs
    MaintenanceJob.find({
      organizationId,
      deleted: { $ne: true },
      status: { $nin: ["closed", "cancelled"] }
    })
      .populate("propertyId", "addressLine1")
      .lean(),
  ]);

  // If no properties, trigger Onboarding Setup state
  const totalProperties = properties.length;
  if (totalProperties === 0) {
    return {
      onboarding: true,
      setupProgress: 0,
      checklist: {
        addLandlord: false,
        addProperty: false,
        addTenant: false,
        createTenancy: false,
        uploadCertificate: false
      }
    };
  }

  // --- KPI 1: Properties count & sub-breakdown ---
  const propertyCounts = { available: 0, let: 0, maintenance: 0, under_offer: 0, withdrawn: 0 };
  properties.forEach(p => {
    if (p.status in propertyCounts) {
      propertyCounts[p.status]++;
    }
  });

  // --- KPI 2: Active Tenancies ---
  const activeTenancyCount = activeTenancies.length;
  let astCount = 0;
  let aptCount = 0;
  let tenanciesEndingSoonCount = 0;
  
  activeTenancies.forEach(t => {
    if (t.tenancyType === "ast") {
      astCount++;
      if (t.endDate && new Date(t.endDate) <= in30Days && new Date(t.endDate) >= startOfDay) {
        tenanciesEndingSoonCount++;
      }
    } else {
      aptCount++;
    }
  });

  // --- KPI 4: Rent This Month ---
  let expectedRentThisMonth = 0;
  let collectedRentThisMonth = 0;
  let outstandingRentThisMonth = 0;
  let expectedCommissionThisMonth = 0;

  paymentsThisMonth.forEach(p => {
    expectedRentThisMonth += p.amountDue || 0;
    collectedRentThisMonth += p.amountPaid || 0;
    outstandingRentThisMonth += p.amountOutstanding || 0;
    expectedCommissionThisMonth += p.commissionAmount || 0;
  });

  // --- Fetch Property Documents to analyze compliance (Gas safety, EICR, EPC) ---
  const allPropertyIds = properties.map(p => p._id.toString());
  const propertyCertDocs = allPropertyIds.length
    ? await Document.find({
        organizationId,
        entityType: "property",
        entityId: { $in: allPropertyIds },
        docType: { $in: certTypeIds },
        deleted: false
      }).populate("docType", "name key").lean()
    : [];

  // Group latest certificates by propertyId and certificate type
  const propertyCerts = {}; // { propertyId: { gas: doc, eicr: doc, epc: doc } }
  propertyCertDocs.forEach(doc => {
    const propId = doc.entityId.toString();
    const typeKey = doc.docType?.key;
    if (!typeKey) return;

    let certType = "";
    if (typeKey === "gas_safety_certificate") certType = "gas";
    else if (typeKey === "eicr") certType = "eicr";
    else if (typeKey === "epc") certType = "epc";

    if (!certType) return;

    if (!propertyCerts[propId]) propertyCerts[propId] = { gas: null, eicr: null, epc: null };
    const current = propertyCerts[propId][certType];
    // Keep the one with the latest issueDate/createdAt
    const currentVal = current ? new Date(current.issueDate || current.createdAt).getTime() : 0;
    const newVal = new Date(doc.issueDate || doc.createdAt).getTime();
    if (!current || newVal > currentVal) {
      propertyCerts[propId][certType] = doc;
    }
  });

  // --- ANALYZE ALERTS (URGENT vs UPCOMING) ---
  const urgentAlerts = [];
  const upcomingAlerts = [];

  // 1. Check property certificates for ALL properties
  properties.forEach(prop => {
    const propIdStr = prop._id.toString();
    const certs = propertyCerts[propIdStr] || { gas: null, eicr: null, epc: null };

    // Gas safety certificate CP12
    if (!certs.gas) {
      urgentAlerts.push({
        type: "gas_missing",
        severity: "red",
        title: "Gas Certificate Missing",
        sub: `${prop.addressLine1} — No Gas Certificate is uploaded.`,
        address: prop.addressLine1,
        link: `/properties/${propIdStr}?tab=documents`
      });
    } else if (certs.gas.expiryDate && new Date(certs.gas.expiryDate) < startOfDay) {
      urgentAlerts.push({
        type: "gas_expired",
        severity: "red",
        title: "Gas Certificate Expired",
        sub: `${prop.addressLine1} — expired on ${new Date(certs.gas.expiryDate).toLocaleDateString("en-GB")}`,
        address: prop.addressLine1,
        link: `/properties/${propIdStr}?tab=documents`
      });
    } else if (certs.gas.expiryDate && new Date(certs.gas.expiryDate) <= in7Days) {
      upcomingAlerts.push({
        type: "gas_expiring",
        severity: "amber",
        title: "Gas Certificate Expiring",
        sub: `${prop.addressLine1} — expires in ${Math.ceil((new Date(certs.gas.expiryDate) - startOfDay) / 86400000)} days`,
        address: prop.addressLine1,
        link: `/properties/${propIdStr}?tab=documents`
      });
    }

    // EICR certificate
    if (!certs.eicr) {
      urgentAlerts.push({
        type: "eicr_missing",
        severity: "red",
        title: "EICR Missing",
        sub: `${prop.addressLine1} — No EICR is uploaded.`,
        address: prop.addressLine1,
        link: `/properties/${propIdStr}?tab=documents`
      });
    } else if (certs.eicr.expiryDate && new Date(certs.eicr.expiryDate) < startOfDay) {
      urgentAlerts.push({
        type: "eicr_expired",
        severity: "red",
        title: "EICR Expired",
        sub: `${prop.addressLine1} — expired on ${new Date(certs.eicr.expiryDate).toLocaleDateString("en-GB")}`,
        address: prop.addressLine1,
        link: `/properties/${propIdStr}?tab=documents`
      });
    } else if (certs.eicr.expiryDate && new Date(certs.eicr.expiryDate) <= in7Days) {
      upcomingAlerts.push({
        type: "eicr_expiring",
        severity: "amber",
        title: "EICR Expiring Soon",
        sub: `${prop.addressLine1} — expires in ${Math.ceil((new Date(certs.eicr.expiryDate) - startOfDay) / 86400000)} days`,
        address: prop.addressLine1,
        link: `/properties/${propIdStr}?tab=documents`
      });
    }

    // EPC rating and expiry check
    if (!prop.epcRating) {
      urgentAlerts.push({
        type: "epc_missing",
        severity: "red",
        title: "EPC Rating Missing",
        sub: `${prop.addressLine1} — No EPC rating is set.`,
        address: prop.addressLine1,
        link: `/properties/${propIdStr}?tab=edit`
      });
    } else if (prop.epcExpiryDate && new Date(prop.epcExpiryDate) < startOfDay) {
      urgentAlerts.push({
        type: "epc_expired",
        severity: "red",
        title: "EPC Expired",
        sub: `${prop.addressLine1} — expired on ${new Date(prop.epcExpiryDate).toLocaleDateString("en-GB")}`,
        address: prop.addressLine1,
        link: `/properties/${propIdStr}?tab=edit`
      });
    } else if (prop.epcExpiryDate && new Date(prop.epcExpiryDate) <= in7Days) {
      upcomingAlerts.push({
        type: "epc_expiring",
        severity: "amber",
        title: "EPC Expiring Soon",
        sub: `${prop.addressLine1} — expires in ${Math.ceil((new Date(prop.epcExpiryDate) - startOfDay) / 86400000)} days`,
        address: prop.addressLine1,
        link: `/properties/${propIdStr}?tab=edit`
      });
    }
  });

  // 2. Tenancy-specific checks
  activeTenancies.forEach(t => {
    const prop = t.propertyId;
    if (!prop) return;
    const propIdStr = prop._id.toString();

    // 2. Deposit Protection check (30-day deadline)
    if (t.deposit?.amount > 0) {
      const start = new Date(t.startDate);
      const deadline = new Date(start.getTime() + 30 * 24 * 60 * 60 * 1000);
      const daysSinceStart = Math.floor((startOfDay - start) / 86400000);

      if (!t.deposit.protectedDate) {
        if (daysSinceStart > 30) {
          urgentAlerts.push({
            type: "deposit_unprotected",
            severity: "red",
            title: "Deposit Unprotected (Overdue)",
            sub: `${prop.addressLine1} — tenancy started ${daysSinceStart} days ago, deadline was ${deadline.toLocaleDateString("en-GB")}`,
            address: prop.addressLine1,
            link: `/tenancies/${t._id}?tab=deposit`
          });
        } else if (daysSinceStart >= 23) {
          upcomingAlerts.push({
            type: "deposit_warning",
            severity: "amber",
            title: "Deposit Protection Deadline",
            sub: `${prop.addressLine1} — must protect deposit within ${30 - daysSinceStart} days`,
            address: prop.addressLine1,
            link: `/tenancies/${t._id}?tab=deposit`
          });
        }
      }

      // Prescribed Info checks
      if (!t.deposit.prescribedInfoServedDate) {
        if (daysSinceStart > 30) {
          urgentAlerts.push({
            type: "prescribed_info_unserved",
            severity: "red",
            title: "Prescribed Info Not Served",
            sub: `${prop.addressLine1} — overdue for tenancy started ${daysSinceStart} days ago`,
            address: prop.addressLine1,
            link: `/tenancies/${t._id}?tab=deposit`
          });
        }
      }
    }

    // 3. How to Rent checklist serve check
    if (!t.howToRent?.served) {
      urgentAlerts.push({
        type: "how_to_rent_unserved",
        severity: "red",
        title: "How to Rent Guide Not Served",
        sub: `${prop.addressLine1} — guide must be served at tenancy start.`,
        address: prop.addressLine1,
        link: `/tenancies/${t._id}?tab=compliance`
      });
    }

    // 4. Right to Rent check for tenants
    t.tenantIds.forEach(tenant => {
      const rtrExpiry = tenant.tenantData?.rightToRentExpiry;
      if (rtrExpiry) {
        const expiryDate = new Date(rtrExpiry);
        if (expiryDate < startOfDay) {
          urgentAlerts.push({
            type: "rtr_expired",
            severity: "red",
            title: "Right to Rent Expired",
            sub: `Tenant ${tenant.title ? tenant.title + ' ' : ''}${tenant.firstName} ${tenant.lastName} at ${prop.addressLine1}`,
            address: prop.addressLine1,
            link: `/tenants/${tenant._id}`
          });
        } else if (expiryDate <= in7Days) {
          upcomingAlerts.push({
            type: "rtr_expiring",
            severity: "amber",
            title: "Right to Rent Expiring",
            sub: `Tenant ${tenant.title ? tenant.title + ' ' : ''}${tenant.firstName} ${tenant.lastName} — expires in ${Math.ceil((expiryDate - startOfDay) / 86400000)} days`,
            address: prop.addressLine1,
            link: `/tenants/${tenant._id}`
          });
        }
      }
    });

    // 5. Landlord AML checks
    const landlord = t.landlordId;
    if (landlord && landlord.landlordData?.amlResult === "fail") {
      urgentAlerts.push({
        type: "aml_failed",
        severity: "red",
        title: "Landlord AML Check Failed",
        sub: `${prop.addressLine1} — Landlord has active tenancy but AML checks failed.`,
        address: prop.addressLine1,
        link: `/landlords/${landlord._id || landlord}`
      });
    }
  });

  // --- Rent Overdue / Due Checks ---
  const arrearsMap = {}; // { tenancyId: { outstanding: X, count: Y, tenant: T, address: A } }
  
  allUnresolvedPayments.forEach(p => {
    const isOverdue = p.status === "overdue" || (p.status === "partial" && new Date(p.dueDate) < startOfDay);
    const isDueSoon = p.status === "due" || (p.status === "pending" && new Date(p.dueDate) <= in7Days && new Date(p.dueDate) >= startOfDay);

    if (isOverdue) {
      const tenId = p.tenancyId.toString();
      if (!arrearsMap[tenId]) {
        // Find tenancy in activeTenancies
        const tenancyObj = activeTenancies.find(t => t._id.toString() === tenId);
        const tenantNames = tenancyObj?.tenantIds.map(u => `${u.title ? u.title + ' ' : ''}${u.firstName} ${u.lastName}`).join(", ") || "Tenant";
        arrearsMap[tenId] = {
          tenancyId: tenId,
          outstanding: 0,
          count: 0,
          tenantNames,
          address: p.propertyId?.addressLine1 || "Property"
        };
      }
      arrearsMap[tenId].outstanding += p.amountOutstanding;
      arrearsMap[tenId].count++;
    }

    if (isDueSoon) {
      upcomingAlerts.push({
        type: "rent_due_soon",
        severity: "amber",
        title: "Rent Payment Due",
        sub: `${p.propertyId?.addressLine1} — £${p.amountOutstanding} due on ${new Date(p.dueDate).toLocaleDateString("en-GB")}`,
        link: "/rent"
      });
    }
  });

  const arrearsList = Object.values(arrearsMap).sort((a, b) => b.outstanding - a.outstanding);

  // Group critical arrears as urgent alerts
  arrearsList.forEach(arr => {
    if (arr.count >= 2) {
      urgentAlerts.push({
        type: "arrears_critical",
        severity: "red",
        title: "Critical Arrears (2+ Months)",
        sub: `${arr.address} — ${arr.tenantNames} is ${arr.count} months behind (£${arr.outstanding.toLocaleString("en-GB")})`,
        link: `/tenancies/${arr.tenancyId}?tab=rent`
      });
    } else {
      // 1 month overdue - add as upcoming action item
      upcomingAlerts.push({
        type: "arrears_warning",
        severity: "amber",
        title: "Rent Overdue (1 Month)",
        sub: `${arr.address} — £${arr.outstanding.toLocaleString("en-GB")} overdue from ${arr.tenantNames}`,
        link: `/tenancies/${arr.tenancyId}?tab=rent`
      });
    }
  });

  // Expiring (30 days) documents counter (KPI 5)
  const docsExpiring30DaysCount = propertyCertDocs.filter(doc => {
    return doc.expiryDate && new Date(doc.expiryDate) <= in30Days && new Date(doc.expiryDate) >= startOfDay;
  }).length;

  // Track missing evidence counts
  let propertiesMissingEvidence = 0;
  let tenanciesMissingEvidence = 0;

  activeTenancies.forEach(t => {
    let hasPropertyIssue = false;
    let hasTenancyIssue = false;

    const propIdStr = t.propertyId?._id?.toString();
    const certs = propertyCerts[propIdStr] || { gas: null, eicr: null, epc: null };

    // Gas safety check
    if (!certs.gas || (certs.gas.expiryDate && new Date(certs.gas.expiryDate) < startOfDay)) {
      hasPropertyIssue = true;
    }
    // EICR check
    if (!certs.eicr || (certs.eicr.expiryDate && new Date(certs.eicr.expiryDate) < startOfDay)) {
      hasPropertyIssue = true;
    }
    // EPC check
    if (!t.propertyId?.epcRating || (t.propertyId?.epcExpiryDate && new Date(t.propertyId.epcExpiryDate) < startOfDay)) {
      hasPropertyIssue = true;
    }
    // Right to rent check
    let hasRtrIssue = false;
    t.tenantIds.forEach(tenant => {
      const rtrExpiry = tenant.tenantData?.rightToRentExpiry;
      if (rtrExpiry && new Date(rtrExpiry) < startOfDay) {
        hasRtrIssue = true;
      }
    });
    if (hasRtrIssue) {
      hasTenancyIssue = true;
    }
    // Deposit check
    if (t.deposit?.amount > 0 && !t.deposit.protectedDate) {
      hasTenancyIssue = true;
    }
    // How to rent check
    if (!t.howToRent?.served) {
      hasTenancyIssue = true;
    }

    if (hasPropertyIssue) propertiesMissingEvidence++;
    if (hasTenancyIssue) tenanciesMissingEvidence++;
  });

  // Sort upcoming alerts by date proximity (closest first)
  // We can approximate by sorting based on urgency, but they are already ordered logically.
  // Actually, let's sort `upcomingAlerts` by days until expiry/due.
  upcomingAlerts.sort((a, b) => {
    // Extract days from sub string if possible, or just leave as is.
    const getDays = (str) => {
      const match = str.match(/(\d+)\s+days/);
      return match ? parseInt(match[1]) : 999;
    };
    return getDays(a.sub) - getDays(b.sub);
  });

  const criticalCount = urgentAlerts.length;
  const upcomingCount = upcomingAlerts.length;



  const openMaintenanceJobs = activeJobs.length;
  const emergencyJobs = activeJobs.filter(j => j.priority === "emergency");
  const overdueJobs = activeJobs.filter(j => j.targetDate && new Date(j.targetDate) < startOfDay);
  const awaabsJobs = activeJobs.filter(j => j.isAwaabsLaw);

  const maintenanceStatusBreakdown = activeJobs.reduce((acc, job) => {
    const key = job.priority || "routine";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, { emergency: 0, urgent: 0, routine: 0, planned: 0 });

  const notesFeed = recentNotes.map((item) => ({
    id: String(item._id),
    type: item.eventType || "system",
    title: item.text || "System event",
    subtitle: item.entityType ? item.entityType.replace(/_/g, " ") : "general",
    createdAt: item.createdAt,
    meta: item.eventType || item.entityType || "system",
    entityType: item.entityType || "system",
    eventType: item.eventType || null,
    isSystem: true,
  }));

  const docsFeed = recentDocs.map((doc) => ({
    id: String(doc._id),
    type: "document",
    title: `${doc.docType?.name || "Document"} uploaded`,
    subtitle: doc.uploadedBy ? `By ${doc.uploadedBy.firstName} ${doc.uploadedBy.lastName}` : "System",
    createdAt: doc.createdAt,
    meta: "document",
    isSystem: true,
  }));

  const activityFeed = [...notesFeed, ...docsFeed]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 8);

  const serializeJob = j => ({
    ...j,
    _id: j._id.toString(),
    propertyId: j.propertyId ? { ...j.propertyId, _id: j.propertyId._id.toString() } : null,
    contractorId: j.contractorId ? j.contractorId.toString() : null,
  });

  return {
    onboarding: false,
    stats: {
      propertyCounts,
      activeTenancyCount,
      astCount,
      aptCount,
      tenanciesEndingSoonCount,
      urgentAlertsCount: urgentAlerts.length,
      docsExpiring30DaysCount,
      expectedRentThisMonth,
      collectedRentThisMonth,
      outstandingRentThisMonth,
      expectedCommissionThisMonth,
      openMaintenanceJobs,
      propertiesMissingEvidence,
      tenanciesMissingEvidence
    },
    urgentAlerts: urgentAlerts.slice(0, 10), // cap at 10
    totalUrgentAlertsCount: urgentAlerts.length,
    allUrgentAlerts: urgentAlerts,
    upcomingAlerts: upcomingAlerts.slice(0, 8), // cap at 8
    totalUpcomingAlertsCount: upcomingAlerts.length,
    allUpcomingAlerts: upcomingAlerts,
    arrearsList,
    recentNotes,
    recentDocs,
    activityFeed,
    emergencyJobs: emergencyJobs.map(serializeJob),
    overdueJobs: overdueJobs.map(serializeJob),
  };
}

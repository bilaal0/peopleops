import { Note, NOTE_EVENT_TYPES, NOTE_ENTITY_TYPES } from "../models/note.server.js";

const CERTIFICATE_EVENT_BY_DOC_TYPE = {
  gas_certificate: "property_gas_cert_uploaded",
  gas_safety_certificate: "property_gas_cert_uploaded",
  eicr_report: "property_eicr_uploaded",
  eicr: "property_eicr_uploaded",
  epc_certificate: "property_epc_uploaded",
  epc: "property_epc_uploaded",
};

function getUserId(user) {
  return user?.userId || user?._id || user?.id || null;
}

async function getFullUserName(user) {
  if (user?.firstName || user?.lastName || user?.email) {
    const firstName = user.firstName || '';
    const lastName = user.lastName || '';
    const fullName = (firstName + ' ' + lastName).trim();
    return fullName || user.email || 'Unknown user';
  }
  
  const userId = user?.userId || user?._id || user?.id;
  if (!userId) return 'Unknown user';
  
  try {
    const { User } = await import('../models/user.server.js');
    const dbUser = await User.findById(userId).select('title firstName lastName email').lean();
    if (!dbUser) return 'Unknown user';
    
    const firstName = dbUser.firstName || '';
    const lastName = dbUser.lastName || '';
    const fullName = (firstName + ' ' + lastName).trim();
    return fullName || dbUser.email || 'Unknown user';
  } catch (err) {
    return 'Unknown user';
  }
}

function getUserName(user) {
  const firstName = user?.firstName || "";
  const lastName = user?.lastName || "";
  const fullName = `${firstName} ${lastName}`.trim();
  return fullName || user?.email || "Unknown user";
}

function formatDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatMoney(value) {
  if (value === null || value === undefined || value === "") return null;
  const amount = Number(value);
  if (Number.isNaN(amount)) return String(value);
  return `GBP ${amount.toLocaleString("en-GB", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

function label(value) {
  if (!value) return "Unknown";
  return String(value)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function documentLabel(document) {
  return document?.docType?.name || document?.docTypeLabel || document?.docType || document?.type || "Document";
}

function documentTypeValue(document) {
  return document?.docType?.key || document?.docType?.slug || document?.docType || document?.type || null;
}

function fileNameValue(document) {
  return document?.originalName || document?.fileName || document?.name || document?.s3Key || null;
}

export async function createSystemEvent({
  agencyId,
  entityType,
  entityId,
  eventType,
  text,
  metadata = null,
  isInternal = false,
  triggeredByUserId,
}) {
  try {
    if (!agencyId || !entityType || !entityId || !eventType || !text || !triggeredByUserId) {
      console.error("Activity log skipped: missing required fields", {
        agencyId,
        entityType,
        entityId,
        eventType,
        hasText: Boolean(text),
        triggeredByUserId,
      });
      return null;
    }

    if (!NOTE_ENTITY_TYPES.includes(entityType)) {
      console.error("Activity log skipped: invalid entityType", { entityType, eventType });
      return null;
    }

    if (!NOTE_EVENT_TYPES.includes(eventType)) {
      console.error("Activity log skipped: invalid eventType", { entityType, eventType });
      return null;
    }

    return await Note.create({
      agencyId,
      entityType,
      entityId,
      eventType,
      text,
      metadata,
      isInternal,
      isSystem: true,
      addedBy: triggeredByUserId,
    });
  } catch (error) {
    console.error("Activity log failed:", error);
    return null;
  }
}

export async function logLandlordAdded(landlord, user) {
  const userName = await getFullUserName(user);
  return createSystemEvent({
    agencyId: landlord.agencyId || user.agencyId,
    entityType: "landlord",
    entityId: landlord._id,
    eventType: "landlord_added",
    text: `Landlord record created by ${userName}`,
    metadata: { createdBy: userName },
    triggeredByUserId: getUserId(user),
  });
}

export async function logAMLResult(landlord, result, user) {
  const resultEventMap = {
    pass: "landlord_aml_passed",
    passed: "landlord_aml_passed",
    refer: "landlord_aml_referred",
    referred: "landlord_aml_referred",
    fail: "landlord_aml_failed",
    failed: "landlord_aml_failed",
  };
  const eventType = resultEventMap[String(result || "").toLowerCase()];
  if (!eventType) return null;

  const userName = await getFullUserName(user);
  return createSystemEvent({
    agencyId: landlord.agencyId || user.agencyId,
    entityType: "landlord",
    entityId: landlord._id,
    eventType,
    text: `AML check ${label(result).toLowerCase()}. Checked by ${userName}`,
    metadata: { checkedBy: userName, result },
    triggeredByUserId: getUserId(user),
  });
}

export async function logPropertyAdded(property, user) {
  const userName = await getFullUserName(user);
  const address = [property.addressLine1, property.city, property.postcode].filter(Boolean).join(", ");
  return createSystemEvent({
    agencyId: property.agencyId || user.agencyId,
    entityType: "property",
    entityId: property._id,
    eventType: "property_added",
    text: `Property record created by ${userName}`,
    metadata: { address, createdBy: userName },
    triggeredByUserId: getUserId(user),
  });
}

export async function logPropertyStatusChanged(property, oldStatus, newStatus, user, options = {}) {
  const userName = await getFullUserName(user);
  return createSystemEvent({
    agencyId: property.agencyId || options.agencyId || user.agencyId,
    entityType: "property",
    entityId: property._id || property,
    eventType: "property_status_changed",
    text: `Property status changed from ${label(oldStatus)} to ${label(newStatus)}`,
    metadata: { oldStatus, newStatus, changedBy: userName, ...options.metadata },
    triggeredByUserId: getUserId(user),
  });
}

export async function logTenantAdded(tenant, user) {
  const userName = await getFullUserName(user);
  return createSystemEvent({
    agencyId: tenant.agencyId || user.agencyId,
    entityType: "tenant",
    entityId: tenant._id,
    eventType: "tenant_added",
    text: `Tenant record created by ${userName}`,
    metadata: { createdBy: userName },
    triggeredByUserId: getUserId(user),
  });
}

export async function logRTRChecked(tenant, user, options = {}) {
  const userName = await getFullUserName(user);
  const docType = options.docType || tenant.tenantData?.rightToRentDocType || "Right to Rent document";
  return createSystemEvent({
    agencyId: tenant.agencyId || user.agencyId,
    entityType: "tenant",
    entityId: tenant._id,
    eventType: "tenant_rtr_checked",
    text: `Right to Rent checked by ${userName}. Document: ${label(docType)}`,
    metadata: {
      docType: label(docType),
      hasExpiry: Boolean(options.expiryDate || tenant.tenantData?.rightToRentExpiryDate),
      expiryDate: options.expiryDate || tenant.tenantData?.rightToRentExpiryDate || null,
      checkedBy: userName,
    },
    triggeredByUserId: getUserId(user),
  });
}

export async function logTenancyCreated(tenancy, user) {
  const userName = await getFullUserName(user);
  const startDate = formatDate(tenancy.startDate);
  return createSystemEvent({
    agencyId: tenancy.agencyId || user.agencyId,
    entityType: "tenancy",
    entityId: tenancy._id,
    eventType: "tenancy_created",
    text: `Tenancy created by ${userName}. ${String(tenancy.tenancyType || "").toUpperCase()} starting ${startDate || "unknown date"}`,
    metadata: {
      tenancyType: String(tenancy.tenancyType || "").toUpperCase(),
      startDate: tenancy.startDate || null,
      endDate: tenancy.endDate || "Periodic",
      rentAmount: tenancy.rent?.amount ?? null,
      createdBy: userName,
    },
    triggeredByUserId: getUserId(user),
  });
}

export async function logDepositProtected(tenancy, user) {
  const userName = await getFullUserName(user);
  const scheme = label(tenancy.deposit?.scheme);
  return createSystemEvent({
    agencyId: tenancy.agencyId || user.agencyId,
    entityType: "tenancy",
    entityId: tenancy._id,
    eventType: "tenancy_deposit_protected",
    text: `Deposit protected with ${scheme}. Reference: ${tenancy.deposit?.reference || "Not recorded"}. Recorded by ${userName}`,
    metadata: {
      scheme: tenancy.deposit?.scheme || null,
      reference: tenancy.deposit?.reference || null,
      amount: tenancy.deposit?.amount || null,
      protectedDate: tenancy.deposit?.protectedDate || null,
      recordedBy: userName,
    },
    triggeredByUserId: getUserId(user),
  });
}

export async function logPrescribedInfoServed(tenancy, user) {
  const userName = await getFullUserName(user);
  return createSystemEvent({
    agencyId: tenancy.agencyId || user.agencyId,
    entityType: "tenancy",
    entityId: tenancy._id,
    eventType: "tenancy_deposit_prescribed_info_served",
    text: `Prescribed information served to tenant. Recorded by ${userName}`,
    metadata: {
      servedDate: tenancy.deposit?.prescribedInfoServedDate || null,
      recordedBy: userName,
    },
    triggeredByUserId: getUserId(user),
  });
}

export async function logHowToRentServed(tenancy, user) {
  const userName = await getFullUserName(user);
  return createSystemEvent({
    agencyId: tenancy.agencyId || user.agencyId,
    entityType: "tenancy",
    entityId: tenancy._id,
    eventType: "tenancy_how_to_rent_served",
    text: `How to Rent guide served. Version: ${tenancy.howToRent?.version || "Not recorded"}. Recorded by ${userName}`,
    metadata: {
      servedDate: tenancy.howToRent?.servedDate || null,
      version: tenancy.howToRent?.version || null,
      recordedBy: userName,
    },
    triggeredByUserId: getUserId(user),
  });
}

export async function logRRAInformationSheetServed(tenancy, servedToNames, method, user) {
  const userName = await getFullUserName(user);
  const methodLabels = {
    email_attachment: "email attachment",
    post:             "post",
    hand_delivered:   "hand delivery",
  };
  return createSystemEvent({
    agencyId:          tenancy.agencyId || user.agencyId,
    entityType:        "tenancy",
    entityId:          tenancy._id,
    eventType:         "tenancy_rra_information_sheet_served",
    text:              `RRA Information Sheet served to ${servedToNames} via ${methodLabels[method] || method}. Recorded by ${userName}`,
    metadata: {
      method,
      servedTo:   servedToNames,
      recordedBy: userName,
    },
    triggeredByUserId: getUserId(user),
  });
}


export async function logSection8Created(tenancy, notice, user) {
  const userName = await getFullUserName(user);
  const grounds = Array.isArray(notice.grounds) ? notice.grounds.join(", ") : notice.grounds;
  return createSystemEvent({
    agencyId: tenancy.agencyId || user.agencyId,
    entityType: "tenancy",
    entityId: tenancy._id,
    eventType: "tenancy_section8_notice_created",
    text: `Section 8 notice recorded. Grounds: ${grounds || "Not recorded"}. Served: ${formatDate(notice.servedDate) || "Not recorded"}`,
    metadata: {
      grounds: notice.grounds || [],
      servedDate: notice.servedDate || null,
      expiryDate: notice.expiryDate || null,
      recordedBy: userName,
    },
    triggeredByUserId: getUserId(user),
  });
}

export async function logSection13Created(tenancy, notice, user) {
  const userName = await getFullUserName(user);
  return createSystemEvent({
    agencyId: tenancy.agencyId || user.agencyId,
    entityType: "tenancy",
    entityId: tenancy._id,
    eventType: "tenancy_section13_notice_created",
    text: `Section 13 rent increase notice recorded. New rent: ${formatMoney(notice.proposedRent) || "Not recorded"} from ${formatDate(notice.effectiveDate) || "Not recorded"}`,
    metadata: {
      currentRent: notice.currentRent || null,
      proposedRent: notice.proposedRent || null,
      servedDate: notice.servedDate || null,
      effectiveDate: notice.effectiveDate || null,
      recordedBy: userName,
    },
    triggeredByUserId: getUserId(user),
  });
}

export async function logTenancyEnded(tenancy, user) {
  const userName = await getFullUserName(user);
  return createSystemEvent({
    agencyId: tenancy.agencyId || user.agencyId,
    entityType: "tenancy",
    entityId: tenancy._id,
    eventType: "tenancy_ended",
    text: `Tenancy ended by ${userName}. Reason: ${label(tenancy.endReason)}. End date: ${formatDate(tenancy.actualEndDate) || "Not recorded"}`,
    metadata: {
      endReason: tenancy.endReason || null,
      actualEndDate: tenancy.actualEndDate || null,
      endedBy: userName,
    },
    triggeredByUserId: getUserId(user),
  });
}

export async function logRentReceived(payment, user) {
  const userName = await getFullUserName(user);
  return createSystemEvent({
    agencyId: payment.agencyId || user.agencyId,
    entityType: "tenancy",
    entityId: payment.tenancyId,
    eventType: "rent_payment_received",
    text: `Rent received for ${payment.period || "period"}. ${formatMoney(payment.amountPaid) || "Payment"} via ${label(payment.method)}. Recorded by ${userName}`,
    metadata: {
      period: payment.period || null,
      amountPaid: payment.amountPaid || null,
      method: payment.method || null,
      reference: payment.reference || null,
      commission: payment.commission || null,
      netToLandlord: payment.netToLandlord || null,
      recordedBy: userName,
    },
    triggeredByUserId: getUserId(user),
  });
}

export async function logRentPartial(payment, user) {
  const userName = await getFullUserName(user);
  const outstanding = payment.outstanding ?? Math.max(Number(payment.amountDue || 0) - Number(payment.amountPaid || 0), 0);
  return createSystemEvent({
    agencyId: payment.agencyId || user.agencyId,
    entityType: "tenancy",
    entityId: payment.tenancyId,
    eventType: "rent_payment_partial",
    text: `Partial rent payment for ${payment.period || "period"}. ${formatMoney(payment.amountPaid) || "Payment"} of ${formatMoney(payment.amountDue) || "amount due"} received. ${formatMoney(outstanding) || "Balance"} outstanding`,
    metadata: {
      period: payment.period || null,
      amountPaid: payment.amountPaid || null,
      amountDue: payment.amountDue || null,
      outstanding,
      method: payment.method || null,
      recordedBy: userName,
    },
    triggeredByUserId: getUserId(user),
  });
}

export async function logRentWaived(payment, user, reason = null) {
  const userName = await getFullUserName(user);
  return createSystemEvent({
    agencyId: payment.agencyId || user.agencyId,
    entityType: "tenancy",
    entityId: payment.tenancyId,
    eventType: "rent_payment_waived",
    text: `Rent payment waived for ${payment.period || "period"} by ${userName}. Reason: ${reason || payment.waiverReason || "Not recorded"}`,
    metadata: {
      period: payment.period || null,
      amount: payment.amountDue || payment.amount || null,
      reason: reason || payment.waiverReason || null,
      waivedBy: userName,
    },
    triggeredByUserId: getUserId(user),
  });
}

export async function logMaintenanceCreated(job, user, entityType = "maintenance_job", entityId = null) {
  const userName = await getFullUserName(user);
  return createSystemEvent({
    agencyId: job.agencyId || user.agencyId,
    entityType,
    entityId: entityId || job._id,
    eventType: "maintenance_job_created",
    text: `Maintenance job ${job.jobRef || ""} created. ${label(job.category)}: ${job.title || "Untitled job"}`,
    metadata: {
      jobRef: job.jobRef || null,
      category: job.category || null,
      title: job.title || null,
      priority: job.priority || null,
      reportedBy: job.reportedBy || null,
      createdBy: userName,
    },
    triggeredByUserId: getUserId(user),
  });
}

export async function logContractorAssigned(job, contractor, user) {
  const userName = await getFullUserName(user);
  return createSystemEvent({
    agencyId: job.agencyId || user.agencyId,
    entityType: "maintenance_job",
    entityId: job._id,
    eventType: "maintenance_contractor_assigned",
    text: `Contractor assigned: ${contractor?.name || "Contractor"}. Scheduled: ${formatDate(job.scheduledDate) || "Not scheduled"}`,
    metadata: {
      contractorName: contractor?.name || null,
      scheduledDate: job.scheduledDate || null,
      assignedBy: userName,
    },
    triggeredByUserId: getUserId(user),
  });
}

export async function logMaintenanceStatusChanged(job, status, user, options = {}) {
  const statusEventMap = {
    in_progress: "maintenance_job_in_progress",
    completed: "maintenance_job_completed",
    closed: "maintenance_job_closed",
    cancelled: "maintenance_job_cancelled",
  };
  const eventType = statusEventMap[status] || "maintenance_job_updated";
  const userName = await getFullUserName(user);
  return createSystemEvent({
    agencyId: job.agencyId || user.agencyId,
    entityType: "maintenance_job",
    entityId: job._id,
    eventType,
    text: `Maintenance job ${job.jobRef || ""} updated to ${label(status)} by ${userName}`,
    metadata: {
      jobRef: job.jobRef || null,
      title: job.title || null,
      status,
      actualCost: job.actualCost || null,
      invoiceRef: job.invoiceReference || null,
      updatedBy: userName,
      ...options.metadata,
    },
    triggeredByUserId: getUserId(user),
  });
}

export async function logDocumentUploaded(document, user, options = {}) {
  const userName = await getFullUserName(user);
  const docType = documentTypeValue(document);
  const eventType =
    options.eventType ||
    (document.entityType === "property" && CERTIFICATE_EVENT_BY_DOC_TYPE[docType]) ||
    `${document.entityType}_document_uploaded`;

  const safeEventType = NOTE_EVENT_TYPES.includes(eventType) ? eventType : "document_uploaded";
  const expiryText = document.expiryDate ? `. Expires ${formatDate(document.expiryDate)}` : "";
  return createSystemEvent({
    agencyId: document.agencyId || user.agencyId,
    entityType: document.entityType,
    entityId: document.entityId,
    eventType: safeEventType,
    text: `${documentLabel(document)} uploaded by ${userName}${expiryText}`,
    metadata: {
      docType,
      fileName: fileNameValue(document),
      expiryDate: document.expiryDate || null,
      rating: document.rating || null,
      uploadedBy: userName,
    },
    triggeredByUserId: getUserId(user),
  });
}

export async function logDocumentVerified(document, user) {
  const userName = await getFullUserName(user);
  return createSystemEvent({
    agencyId: document.agencyId || user.agencyId,
    entityType: document.entityType,
    entityId: document.entityId,
    eventType: "document_verified",
    text: `${documentLabel(document)} verified by ${userName}`,
    metadata: {
      docType: documentTypeValue(document),
      fileName: fileNameValue(document),
      verifiedBy: userName,
    },
    triggeredByUserId: getUserId(user),
  });
}

export async function logEvidenceBundleGenerated(tenancy, user) {
  const userName = await getFullUserName(user);
  return createSystemEvent({
    agencyId: tenancy.agencyId || user.agencyId,
    entityType: "tenancy",
    entityId: tenancy._id,
    eventType: "evidence_bundle_generated",
    text: `Evidence bundle generated by ${userName}`,
    metadata: { generatedBy: userName, generatedAt: new Date() },
    triggeredByUserId: getUserId(user),
  });
}

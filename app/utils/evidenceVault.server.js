// utils/evidenceVault.server.js
// Evidence Vault: server-side PDF bundle generation for a tenancy.
// Exports: fetchBundleData, generatePDF, uploadBundleToS3

import { connect } from "../config/db.server.js";
import { Tenancy } from "../models/tenancy.server.js";
import { Document } from "../models/document.server.js";
import { DocumentType } from "../models/documentType.server.js";
import { RentPayment } from "../models/rentPayment.server.js";
import { Organization } from "../models/organization.server.js";
import { MaintenanceJob } from "../models/MaintenanceJob.server.js";
import { Note } from "../models/note.server.js";
import { calculateArrearsStatus } from "./rent-payment.js";
import { uploadToS3, getPresignedUrl } from "./s3.server.js";

// ── 1. Fetch all data needed for the bundle ───────────────────────────────────
export async function fetchBundleData(tenancyId, organizationId) {
  await connect();

  // 1a. Full tenancy with all populated fields
  const tenancy = await Tenancy.findOne({
    _id: tenancyId,
    organizationId,
    deleted: false,
  })
    .populate(
      "propertyId",
      "addressLine1 addressLine2 city postcode propertyType localAuthority epcRating epcExpiryDate hmoLicenceNo commission mainImage"
    )
    .populate("landlordId", "title firstName lastName email phone landlordData")
    .populate("tenantIds", "title firstName lastName email phone tenantData address")
    .populate("createdBy", "title firstName lastName")
    .lean();

  if (!tenancy) throw new Error("Tenancy not found or access denied");

  let propertyImageUrl = null;
  if (tenancy.propertyId?.mainImage) {
    try {
      propertyImageUrl = await getPresignedUrl(tenancy.propertyId.mainImage, 3600);
    } catch (e) {
      console.warn("Failed to get presigned URL for property mainImage:", e);
    }
  }

  // 1b. All documents uploaded for this tenancy
  const documents = await Document.find({
    entityType: "tenancy",
    entityId: tenancyId,
    organizationId,
    deleted: false,
  })
    .populate("docType", "name key")
    .populate("uploadedBy", "title firstName lastName")
    .populate("verifiedBy", "title firstName lastName")
    .sort({ createdAt: -1 })
    .lean();

  // 1c. Property compliance certificates (Gas, EICR, EPC)
  // DocumentType.docType is an ObjectId ref — must look up by key first
  const certDocTypes = await DocumentType.find({
    key: { $in: ["gas_safety_certificate", "eicr", "epc"] },
  }).lean();

  // Build a key → ObjectId map
  const certTypeIdByKey = {};
  certDocTypes.forEach((dt) => {
    certTypeIdByKey[dt.key] = dt._id.toString();
  });

  const propertyDocs = certDocTypes.length
    ? await Document.find({
        entityType: "property",
        entityId: tenancy.propertyId._id,
        organizationId,
        docType: { $in: certDocTypes.map((dt) => dt._id) },
        deleted: false,
      })
        .populate("docType", "name key")
        .populate("uploadedBy", "title firstName lastName")
        .sort({ createdAt: -1 })
        .lean()
    : [];

  // Most recent certificate of each type
  const certificates = {
    gas: propertyDocs.find(
      (d) => d.docType?.key === "gas_safety_certificate"
    ) || null,
    eicr: propertyDocs.find(
      (d) => d.docType?.key === "eicr"
    ) || null,
    epc: propertyDocs.find(
      (d) => d.docType?.key === "epc"
    ) || null,
  };

  // 1d. Rent payments (last 24 months, newest first)
  const rentPayments = await RentPayment.find({
    tenancyId,
    organizationId,
    deleted: false,
  })
    .populate("recordedBy", "title firstName lastName")
    .sort({ periodStart: -1 })
    .limit(24)
    .lean();

  // 1e. Arrears calculation (reuses existing utility)
  const arrearsStatus = calculateArrearsStatus(rentPayments);

  // 1f. Organization details
  const organization = await Organization.findById(organizationId).lean();

  // 1g. Activity log — system events for this tenancy, oldest-first (narrative order for PDF)
  // Rule: isSystem: true only — manual notes are private agent context, never appear in PDF
  const activityLog = await Note.find({
    organizationId,
    entityType: "tenancy",
    entityId:   tenancyId,
    isSystem:   true,
    deleted:    false,
  })
    .populate("addedBy", "title firstName lastName")
    .sort({ createdAt: 1 }) // oldest first — reads as a narrative story in PDF
    .lean();

  // 1h. Closed maintenance jobs for this property during this tenancy period
  // Filter by propertyId (not tenancyId) — captures all jobs on the property
  // regardless of whether the job was linked to this specific tenancy record.
  // Only include jobs created on or after tenancy start — exclude pre-tenancy work.
  const closedJobs = await MaintenanceJob.find({
    organizationId,
    propertyId: tenancy.propertyId._id,
    status:     "closed",
    deleted:    { $ne: true },
    createdAt:  { $gte: tenancy.startDate },
  })
    .populate("contractorId", "name")
    .sort({ completedDate: -1 })
    .lean();

  return {
    tenancy,
    documents,
    certificates,
    rentPayments,
    arrearsStatus,
    organization,
    propertyImageUrl,
    activityLog,
    closedJobs,
    generatedAt: new Date(),
    generatedBy: null, // set by caller (action)
  };
}

// ── 2. Generate PDF via Puppeteer ─────────────────────────────────────────────
export async function generatePDF(html) {
  const isWin = process.platform === "win32";
  let browser;

  if (isWin) {
    // Local Windows development: use system Chrome
    const puppeteer = (await import("puppeteer-core")).default;
    browser = await puppeteer.launch({
      executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
  } else {
    // Production/Serverless: use @sparticuz/chromium
    const chromium = (await import("@sparticuz/chromium")).default;
    const puppeteer = (await import("puppeteer-core")).default;
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });
  }

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });

    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: {
        top: "22mm",
        right: "15mm",
        bottom: "22mm",
        left: "15mm",
      },
      displayHeaderFooter: true,
      headerTemplate: `
        <div style="font-size:8px; width:100%; padding:0 15mm;
          display:flex; justify-content:space-between;
          color:#64748B; font-family:Arial, sans-serif;">
          <span>PROPLET — EVIDENCE BUNDLE</span>
          <span>CONFIDENTIAL</span>
        </div>`,
      footerTemplate: `
        <div style="font-size:8px; width:100%; padding:0 15mm;
          display:flex; justify-content:space-between;
          color:#64748B; font-family:Arial, sans-serif;">
          <span>This document was generated automatically by Proplet</span>
          <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
        </div>`,
    });

    return pdfBuffer;
  } finally {
    // Always close browser — even if PDF generation throws
    await browser.close();
  }
}

// ── 3. Upload bundle to S3 and return presigned URL ───────────────────────────
export async function uploadBundleToS3(pdfBuffer, tenancyId, organizationId) {
  // Key overwrites previous bundle — always freshest data, no versioning needed.
  // Matches existing S3 key convention: {organizationId}/...
  const s3Key = `${organizationId}/evidence-bundles/${tenancyId}/bundle.pdf`;

  await uploadToS3(pdfBuffer, s3Key, "application/pdf");

  // Presigned URL expires in 1 hour
  const downloadUrl = await getPresignedUrl(s3Key, 3600);

  return { s3Key, downloadUrl };
}

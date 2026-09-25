// routes/documents/upload.jsx
// Single unified upload route used by ALL modules.
// POST /documents/upload
// Accepts: entityType, entityId (optional), docType, expiryDate (optional), notes (optional), file
import { getUserFromRequest } from "../../utils/auth.server.js";
import { data } from "react-router";
import { connect } from "../../config/db.server.js";
import { Document } from "../../models/document.server.js";
import {
  uploadToS3,
  buildS3Key,
  validateFile,
  fileToBuffer,
} from "../../utils/s3.server.js";
import { DocumentType } from "../../models/documentType.server.js";
import { User } from "../../models/user.server.js";
import { Organization } from "../../models/organization.server.js";
import { sendEmail, emailTemplates } from "../../utils/email.server.js";
import { logDocumentUploaded } from "../../utils/activityLog.server.js";

export async function action({ request }) {
  const user = await getUserFromRequest(request);
  if (!user) return data({ error: "Unauthorised" }, { status: 401 });
  if (!user.organizationId && !user.roles?.includes("SUPER_ADMIN")) {
    return data({ error: "No organization access" }, { status: 403 });
  }

  const formData   = await request.formData();
  const entityType = formData.get("entityType") || "general";

  // entityId: form value → organizationId → userId → "general" (last resort string)
  const rawEntityId = (formData.get("entityId") || "").trim();
  const entityId    = rawEntityId || user.organizationId?.toString() || user.userId || "general";

  // organizationId for the Document record
  const rawOrganizationId      = (formData.get("organizationId") || "").trim();
  const resolvedOrganizationId = rawOrganizationId || user.organizationId?.toString() || null;

  const expiryDate = formData.get("expiryDate") || null;
  const issueDate  = formData.get("issueDate")  || null;
  const title      = formData.get("title")      || null;
  const notes      = formData.get("notes")      || null;
  const file       = formData.get("file");

  // docType: only pass to Mongoose when it is a non-empty string
  const rawDocType = (formData.get("docType") || "").trim();
  const docType    = rawDocType || null;


  if (!file || typeof file === "string" || file.size === 0) {
    return data({ error: "No file uploaded." }, { status: 400 });
  }

  // ── Validate file type + size ─────────────────────────────────────────────
  const validation = validateFile(file);
  if (!validation.valid) {
    return data({ error: validation.error || validation.errors?.[0] || "Invalid file" }, { status: 400 });
  }

  // ── Upload to S3 ──────────────────────────────────────────────────────────
  let s3Key;
  try {
    const fileBuffer     = await fileToBuffer(file);
    const destinationKey = buildS3Key(
      resolvedOrganizationId || entityId,
      entityType,
      entityId,
      docType || "none",
      file.name
    );
    s3Key = await uploadToS3(fileBuffer, destinationKey, file.type);
  } catch (err) {
    console.error("S3 upload failed:", err);
    return data({ error: "File upload failed. Please try again." }, { status: 500 });
  }

  // ── Save Document record ──────────────────────────────────────────────────
  await connect();

  const docTypeDoc = docType ? await DocumentType.findById(docType).lean() : null;

  // Auto-calculate expiry from issueDate + expiryDays if available
  let finalExpiryDate = expiryDate || null;
  if (!finalExpiryDate && issueDate && docTypeDoc?.expiryDays) {
    const issue = new Date(issueDate);
    issue.setDate(issue.getDate() + docTypeDoc.expiryDays);
    finalExpiryDate = issue.toISOString();
  }

  const doc = await Document.create({
    organizationId:   resolvedOrganizationId || undefined,  // undefined → Mongoose skips the field (not required now)
    entityType,
    entityId,
    docType:    docType || undefined,           // undefined → not stored when empty
    title,
    fileName:   file.name,
    s3Key,
    fileSize:   file.size,
    mimeType:   file.type,
    uploadedBy: user.userId,
    issueDate:  issueDate || null,
    expiryDate: finalExpiryDate,
    notes,
  });

  await logDocumentUploaded(
    {
      ...doc.toObject(),
      docType: docTypeDoc ? { key: docTypeDoc.key, name: docTypeDoc.name } : doc.docType,
    },
    user
  );

  // ── Send Email Notification if uploaded for an Employee/Staff/Client member ────────
  try {
    const isEntityUser = entityId && entityId !== "general" && /^[0-9a-fA-F]{24}$/.test(entityId);
    const targetUser = isEntityUser
      ? await User.findOne({ _id: entityId, deleted: false }).populate("organizationId", "name primaryAdmin").lean()
      : null;

    if (targetUser && targetUser.email) {
      let organizationName = targetUser.organizationId?.name || null;
      let contactEmail = null;

      if (!organizationName && (resolvedOrganizationId || user.organizationId)) {
        const orgIdToLookup = resolvedOrganizationId || user.organizationId;
        const orgDoc = await Organization.findById(orgIdToLookup).select("name primaryAdmin").populate("primaryAdmin", "email").lean();
        organizationName = orgDoc?.name || null;
        contactEmail = orgDoc?.primaryAdmin?.email || null;
      }

      if (!contactEmail && targetUser.organizationId?.primaryAdmin) {
        if (typeof targetUser.organizationId.primaryAdmin === "object" && targetUser.organizationId.primaryAdmin.email) {
          contactEmail = targetUser.organizationId.primaryAdmin.email;
        } else {
          const adminUser = await User.findById(targetUser.organizationId.primaryAdmin).select("email").lean();
          contactEmail = adminUser?.email || null;
        }
      }

      if (!organizationName && targetUser.companyName) {
        organizationName = targetUser.companyName;
      }

      // Fallback contact email to the admin/manager who uploaded the document
      if (!contactEmail && user?.email) {
        contactEmail = user.email;
      }

      const origin = new URL(request.url).origin;
      const loginLink = `${origin}/login`;
      const docTypeName = docTypeDoc?.name || title || rawDocType || "Document";
      const recipientName = `${targetUser.firstName || ""} ${targetUser.lastName || ""}`.trim() || targetUser.email;
      const formattedExpiry = finalExpiryDate ? new Date(finalExpiryDate).toLocaleDateString("en-GB") : null;

      const template = emailTemplates.documentUploaded({
        recipientName,
        docTypeName,
        fileName: file.name,
        loginLink,
        notes,
        expiryDate: formattedExpiry,
        organizationName,
        contactEmail,
      });

      const smtpSender = process.env.SMTP_USER || (process.env.SMTP_FROM ? process.env.SMTP_FROM.replace(/.*<([^>]+)>.*/, "$1") : "noreply@peopleops.co.uk");
      const fromHeader = organizationName
        ? `"${organizationName}" <${smtpSender}>`
        : undefined;

      await sendEmail({
        to: targetUser.email,
        subject: template.subject,
        html: template.html,
        text: template.text,
        from: fromHeader,
        replyTo: contactEmail || undefined,
      });
    }
  } catch (emailErr) {
    console.error("[documents/upload] Failed to send email notification to employee:", emailErr.message);
  }

  return data({
    success:    true,
    documentId: doc._id.toString(),
  });
}

// No default export — this is an action-only route
export default function DocumentUpload() {
  return null;
}

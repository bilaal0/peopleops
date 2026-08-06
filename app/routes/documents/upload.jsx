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
import { logDocumentUploaded } from "../../utils/activityLog.server.js";

export async function action({ request }) {
  const user = await getUserFromRequest(request);
  if (!user) return data({ error: "Unauthorised" }, { status: 401 });
  if (!user.agencyId && !user.roles?.includes("SUPER_ADMIN")) {
    return data({ error: "No agency access" }, { status: 403 });
  }

  const formData   = await request.formData();
  const entityType = formData.get("entityType") || "general";
  // For general docs, entityId defaults to the agency ID as a grouping key
  const entityId   = formData.get("entityId") || user.agencyId?.toString();
  const docType    = formData.get("docType");
  const expiryDate = formData.get("expiryDate") || null;
  const issueDate  = formData.get("issueDate") || null;
  const title      = formData.get("title") || null;
  const notes      = formData.get("notes") || null;
  const file       = formData.get("file");

  if (!entityId) {
    return data({ error: "Could not resolve entity ID." }, { status: 400 });
  }

  if (!docType) {
    return data({ error: "docType is required." }, { status: 400 });
  }

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
    const fileBuffer = await fileToBuffer(file);
    const destinationKey = buildS3Key(user.agencyId, entityType, entityId, docType, file.name);
    s3Key = await uploadToS3(fileBuffer, destinationKey, file.type);
  } catch (err) {
    console.error("S3 upload failed:", err);
    return data({ error: "File upload failed. Please try again." }, { status: 500 });
  }

  // ── Save Document record ──────────────────────────────────────────────────
  await connect();

  const docTypeDoc = await DocumentType.findById(docType).lean();
  const documentAgencyId = user.agencyId;

  // Auto-calculate expiry from issueDate + expiryDays if available
  let finalExpiryDate = expiryDate || null;
  if (!finalExpiryDate && issueDate && docTypeDoc?.expiryDays) {
    const issue = new Date(issueDate);
    issue.setDate(issue.getDate() + docTypeDoc.expiryDays);
    finalExpiryDate = issue.toISOString();
  }

  const doc = await Document.create({
    agencyId:   documentAgencyId,
    entityType,
    entityId,
    docType,
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

  return data({
    success:    true,
    documentId: doc._id.toString(),
  });
}

// No default export — this is an action-only route
export default function DocumentUpload() {
  return null;
}

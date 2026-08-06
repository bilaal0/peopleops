// routes/documents/download.jsx
// GET /documents/:id/download
// Returns { url: <15-min presigned URL> } as JSON via React Router loader.
// Called via useFetcher().load() from the UI — only mechanism that correctly
// invokes the server loader in React Router v7.
//
// Security layers:
//   1. S3 bucket is completely private — no direct URL ever works
//   2. User must be authenticated (session cookie)
//   3. Document must belong to user's agency (agency isolation)
//   4. Presigned URL expires in 15 minutes
//   5. Every view logged in AuditLog (GDPR compliance)
import { getUserFromRequest } from "../../utils/auth.server.js";
import { redirect } from "react-router";
import { connect } from "../../config/db.server.js";
import { Document } from "../../models/document.server.js";
import { AuditLog } from "../../models/auditLog.server.js";
import { getPresignedUrl } from "../../utils/s3.server.js";

const EXPIRY_SECONDS = 15 * 60; // 15 minutes

function getClientIP(request) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

export async function loader({ request, params }) {
  const user = await getUserFromRequest(request);
  if (!user) return redirect("/login");

  await connect();

  const query = { _id: params.id, deleted: false };
  if (user.agencyId) query.agencyId = user.agencyId;

  const doc = await Document.findOne(query).populate("docType", "name").lean();

  if (!doc) {
    return { error: "Document not found" };
  }

  // Generate 15-minute presigned URL
  const url = await getPresignedUrl(doc.s3Key, EXPIRY_SECONDS);

  // GDPR audit log — fire and forget
  AuditLog.create({
    agencyId:   user.agencyId || doc.agencyId,
    userId:     user.userId,
    action:     "document_viewed",
    entityType: "document",
    entityId:   doc._id,
    metadata: {
      fileName: doc.fileName,
      s3Key:    doc.s3Key,
      docType:  doc.docType?.name || null,
    },
    ipAddress: getClientIP(request),
  }).catch(err => console.warn("AuditLog write failed:", err.message));

  return { url, fileName: doc.fileName, mimeType: doc.mimeType || "application/octet-stream" };
}

export default function DocumentDownload() {
  return null;
}

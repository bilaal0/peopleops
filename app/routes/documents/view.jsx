// routes/documents/view.jsx
// GET /documents/:id/view
// View document inline in the browser or retrieve viewing metadata via JSON.
//
// Security:
//   1. User must be authenticated
//   2. Presigned URL expires in 15 minutes
//   3. S3 bucket is completely private
import { getUserFromRequest } from "../../utils/auth.server.js";
import { redirect } from "react-router";
import { connect } from "../../config/db.server.js";
import { Document } from "../../models/document.server.js";
import { getPresignedUrl } from "../../utils/s3.server.js";

const EXPIRY_SECONDS = 15 * 60; // 15 minutes

export async function loader({ request, params }) {
  const user = await getUserFromRequest(request);
  if (!user) return redirect("/login");

  await connect();

  // Find by _id only — organizationId is not enforced here because documents
  // uploaded from staff/client pages may have null organizationId.
  const doc = await Document.findOne({ _id: params.id, deleted: false })
    .populate("uploadedBy", "firstName lastName title email")
    .populate("docType", "name category")
    .lean();

  if (!doc) {
    return new Response("Document not found", { status: 404 });
  }

  const urlObj = new URL(request.url);
  const wantsJson =
    urlObj.searchParams.get("format") === "json" ||
    urlObj.searchParams.get("json") === "1" ||
    request.headers.get("Accept")?.includes("application/json");

  // Generate 15-min presigned URL with inline disposition
  const url = await getPresignedUrl(doc.s3Key, EXPIRY_SECONDS, {
    inline: true,
    fileName: doc.fileName,
    contentType: doc.mimeType,
  });

  if (wantsJson) {
    return {
      success: true,
      url,
      fileName: doc.fileName,
      mimeType: doc.mimeType || "application/octet-stream",
      fileSize: doc.fileSize || null,
      status: doc.status || "pending",
      docTypeName: doc.docType?.name || doc.documentType || "Other",
      uploadedBy: doc.uploadedBy
        ? `${doc.uploadedBy.title ? doc.uploadedBy.title + " " : ""}${doc.uploadedBy.firstName || ""} ${doc.uploadedBy.lastName || ""}`.trim() || doc.uploadedBy.email
        : "Unknown",
      uploadedAt: doc.createdAt,
    };
  }

  return redirect(url);
}

export default function DocumentView() {
  return null;
}

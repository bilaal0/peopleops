// routes/documents/download.jsx
// GET /documents/:id/download
// Redirects the browser directly to a 15-minute S3 presigned URL.
// Called via window.open() from the UI — the redirect causes the browser to
// download the file without exposing the raw S3 URL in the page.
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

  // Find by _id only — agencyId is not enforced here because documents
  // uploaded from staff/client pages may have null agencyId.
  const doc = await Document.findOne({ _id: params.id, deleted: false }).lean();

  if (!doc) {
    return new Response("Document not found", { status: 404 });
  }

  // Generate 15-min presigned URL and redirect the browser to it
  const url = await getPresignedUrl(doc.s3Key, EXPIRY_SECONDS);
  return redirect(url);
}

export default function DocumentDownload() {
  return null;
}

// routes/documents/s3-download.jsx
// GET /documents/s3-download?key=...
// Directly streams an S3 object based on its key, bypassing the Document model.
// This is used for entities that store S3 keys directly on their schema (e.g. Property.mainImage).
// Security: Ensures the S3 key starts with the user's agencyId (unless SUPER_ADMIN).

import { getUserFromRequest } from "../../utils/auth.server.js";
import { getPresignedUrl } from "../../utils/s3.server.js";
import { redirect } from "react-router";

const EXPIRY_SECONDS = 60 * 60; // 1 hour

export async function loader({ request }) {
  const user = await getUserFromRequest(request);
  if (!user) return redirect("/login");

  const url = new URL(request.url);
  const s3Key = url.searchParams.get("key");

  if (!s3Key) {
    return new Response("Missing S3 key", { status: 400 });
  }

  // Security: agency isolation checks
  // Allow if SUPER_ADMIN, or if key belongs to user's agency, or if it's an agency logo key
  const isAgencyLogo = s3Key.includes("/agency/") || s3Key.includes("/logo/");
  if (!user.roles?.includes("SUPER_ADMIN") && !isAgencyLogo) {
    if (!s3Key.startsWith(user.agencyId + "/")) {
      return new Response("Unauthorized access to this file.", { status: 403 });
    }
  }

  // Generate a presigned URL and redirect the browser to it
  try {
    const presignedUrl = await getPresignedUrl(s3Key, EXPIRY_SECONDS);
    return redirect(presignedUrl);
  } catch (error) {
    console.error("Error generating presigned URL for direct S3 key:", error);
    return new Response("Error generating download link", { status: 500 });
  }
}

export default function S3Download() {
  return null;
}

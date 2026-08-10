// routes/tenancies/evidence-bundle.jsx
// POST /tenancies/:id/evidence-bundle
// Action-only route — no UI component. Registered outside the layout shell.

import { redirect } from "react-router";
import { connect } from "../../config/db.server.js";
import { getUserFromSession } from "../../utils/auth.server.js";
import { Tenancy } from "../../models/tenancy.server.js";
import {
  fetchBundleData,
  generatePDF,
  uploadBundleToS3,
} from "../../utils/evidenceVault.server.js";
import { renderBundleHTML } from "../../utils/bundleTemplate.server.js";
import { logEvidenceBundleGenerated } from "../../utils/activityLog.server.js";

// Loader: handle accidental GET navigation — redirect back to the tenancy detail page
export async function loader({ params }) {
  return redirect(`/tenancies/${params.id}`);
}

export async function action({ request, params }) {
  const user = await getUserFromSession(request);
  if (!user) return redirect("/login");

  // params.id — consistent with all other tenancy routes
  const tenancyId = params.id;
  const organizationId = user.organizationId;

  await connect();

  // 1. Organization isolation — verify this tenancy belongs to this organization
  const tenancy = await Tenancy.findOne({
    _id: tenancyId,
    organizationId,
    deleted: false,
  }).lean();

  if (!tenancy) {
    // IMPORTANT: return error in fetcher data — never throw a Response here.
    // throw new Response() would bubble out of the fetcher and trigger the
    // error boundary, showing the full-page 404. return keeps it in the fetcher.
    console.error(`[EvidenceVault] Tenancy not found: ${tenancyId} for organization: ${organizationId}`);
    return { error: "Tenancy not found or access denied." };
  }

  // 2. Fetch all data needed for the bundle
  let bundleData;
  try {
    bundleData = await fetchBundleData(tenancyId, organizationId);
  } catch (err) {
    console.error("[EvidenceVault] Data fetch failed:", err);
    return { error: "Failed to load tenancy data. Please try again." };
  }

  bundleData.generatedBy = `${user.title ? user.title + ' ' : ''}${user.firstName} ${user.lastName}`;

  // 3. Render HTML from template
  const html = renderBundleHTML(bundleData);

  // 4. Generate PDF via Puppeteer (can be slow — 3–8 seconds)
  let pdfBuffer;
  try {
    pdfBuffer = await generatePDF(html);
  } catch (err) {
    console.error("[EvidenceVault] PDF generation failed:", err);
    return { error: "Failed to generate PDF. Please try again." };
  }

  // 5. Upload to S3, receive a 1-hour presigned download URL
  let downloadUrl;
  try {
    ({ downloadUrl } = await uploadBundleToS3(pdfBuffer, tenancyId, organizationId));
  } catch (err) {
    console.error("[EvidenceVault] S3 upload failed:", err);
    return { error: "Failed to save bundle. Please try again." };
  }

  // 6. Log the generation event (non-blocking — never throws)
  await logEvidenceBundleGenerated(tenancy, user);

  return { success: true, downloadUrl };
}

// No UI — action-only route
export default function EvidenceBundleRoute() {
  return null;
}

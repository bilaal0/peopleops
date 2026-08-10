// routes/api/tenancies/$id.rra-information-sheet.jsx
// Fetcher-only action route — no UI rendered.
// POST /api/tenancies/:id/rra-information-sheet
// Records that the RRA Information Sheet was served to named tenants.
import { data } from "react-router";
import { getUserFromRequest } from "../../../utils/auth.server.js";
import { connect } from "../../../config/db.server.js";
import { Tenancy } from "../../../models/tenancy.server.js";
import { Document } from "../../../models/document.server.js";
import { buildS3Key, uploadToS3, validateFile, fileToBuffer } from "../../../utils/s3.server.js";
import { logRRAInformationSheetServed } from "../../../utils/activityLog.server.js";

const VALID_METHODS = ["email_attachment", "post", "hand_delivered"];
const RRA_CUTOFF = new Date("2026-05-01");

export async function action({ request, params }) {
  const user = await getUserFromRequest(request);
  if (!user) return data({ error: "Unauthorised" }, { status: 401 });
  if (!user.organizationId && !user.roles?.includes("SUPER_ADMIN")) {
    return data({ error: "No organization access" }, { status: 403 });
  }

  await connect();

  // 1. Verify tenancy belongs to this organization
  const tenancy = await Tenancy.findOne({
    _id: params.id,
    organizationId: user.organizationId,
    deleted: false,
  }).populate("tenantIds", "title firstName lastName");

  if (!tenancy) {
    return data({ error: "Tenancy not found" }, { status: 404 });
  }

  // 2. Not applicable for tenancies starting on or after 1 May 2026
  if (new Date(tenancy.startDate) >= RRA_CUTOFF) {
    return data({ error: "RRA Information Sheet is not required for tenancies starting on or after 1 May 2026." }, { status: 400 });
  }

  // 3. Parse form data
  const formData        = await request.formData();
  const servedDateRaw   = formData.get("servedDate");
  const method          = formData.get("method");
  const tenantIds       = formData.getAll("servedToTenantIds");
  const notes           = formData.get("notes")?.toString().trim() || null;
  const proofFile       = formData.get("proofFile");

  // 4. Validate required fields
  if (!servedDateRaw) {
    return data({ error: "Served date is required." }, { status: 400 });
  }
  const servedDate = new Date(servedDateRaw);
  if (isNaN(servedDate.getTime())) {
    return data({ error: "Served date is invalid." }, { status: 400 });
  }
  if (servedDate > new Date()) {
    return data({ error: "Served date cannot be in the future." }, { status: 400 });
  }
  if (!method || !VALID_METHODS.includes(method)) {
    return data({ error: "A valid delivery method is required." }, { status: 400 });
  }
  if (!tenantIds || tenantIds.length === 0) {
    return data({ error: "At least one tenant must be selected." }, { status: 400 });
  }

  // 5. Handle optional proof file upload
  let proofDocumentId = tenancy.rrainformationSheet?.proofDocumentId || null;

  if (proofFile && typeof proofFile !== "string" && proofFile.size > 0) {
    // Validate file
    const validation = validateFile(proofFile);
    if (!validation.valid) {
      return data({ error: validation.error || validation.errors?.[0] || "Invalid file." }, { status: 400 });
    }

    try {
      const fileBuffer = await fileToBuffer(proofFile);
      const s3Key = buildS3Key(
        user.organizationId,
        "tenancy",
        params.id,
        "rra_information_sheet_proof",
        proofFile.name
      );
      await uploadToS3(fileBuffer, s3Key, proofFile.type);

      const doc = await Document.create({
        organizationId:     user.organizationId,
        entityType:   "tenancy",
        entityId:     params.id,
        documentType: "rra_information_sheet_proof",
        fileName:     proofFile.name,
        s3Key,
        fileSize:     proofFile.size,
        mimeType:     proofFile.type,
        uploadedBy:   user.userId || user._id,
        title:        "RRA Information Sheet — Proof of Delivery",
      });

      proofDocumentId = doc._id;
    } catch (err) {
      console.error("RRA proof upload failed:", err);
      return data({ error: "Proof file upload failed. Please try again." }, { status: 500 });
    }
  }

  // 6. Update tenancy
  tenancy.rrainformationSheet = {
    served:             true,
    servedDate,
    method,
    servedToTenantIds:  tenantIds,
    proofDocumentId,
    notes,
  };
  tenancy.updatedBy = user.userId || user._id;
  await tenancy.save();

  // 7. Build served-to names for the activity log
  const servedToNames = tenancy.tenantIds
    .filter((t) => tenantIds.includes(t._id.toString()))
    .map((t) => `${t.title ? t.title + ' ' : ''}${t.firstName} ${t.lastName}`)
    .join(", ") || "selected tenants";

  await logRRAInformationSheetServed(tenancy, servedToNames, method, user);

  // 8. Return success
  return data({ success: true });
}

// No default export — action-only route
export default function RRAInformationSheetAction() {
  return null;
}

// routes/tenants/add.jsx — Add Tenant form
import { useActionData } from "react-router-dom";
import { getUserFromRequest } from "../../utils/auth.server.js";
import { redirect, data } from "react-router";
import { User } from "../../models/user.server.js";
import { connect } from "../../config/db.server.js";
import { Document } from "../../models/document.server.js";
import { DocumentType } from "../../models/documentType.server.js";
import {
  uploadToS3,
  buildS3Key,
  validateFile,
} from "../../utils/s3.server.js";
import TenantForm from "../../components/ui/TenantForm.jsx";
import { logDocumentUploaded, logRTRChecked, logTenantAdded } from "../../utils/activityLog.server.js";

// Helper for dates
function parseDate(val) {
  if (!val) return null;
  const d = new Date(val);
  return isNaN(d) ? null : d;
}

export async function loader({ request }) {
  const user = await getUserFromRequest(request);
  if (!user) return redirect("/login");
  if (!user.agencyId && !user.roles?.includes("SUPER_ADMIN")) return redirect("/dashboard");
  return {};
}

export async function action({ request }) {
  const user = await getUserFromRequest(request);
  if (!user) return redirect("/login");
  if (!user.agencyId && !user.roles?.includes("SUPER_ADMIN")) return redirect("/dashboard");

  const formData = await request.formData();
  const v = Object.fromEntries(formData);

  // Coerce booleans
  v.rightToRentChecked = v.rightToRentChecked === "on" || v.rightToRentChecked === "true";
  v.hasGuarantor = v.hasGuarantor === "on" || v.hasGuarantor === "true";
  v.hasPets = v.hasPets === "on" || v.hasPets === "true";
  v.isSmoker = v.isSmoker === "on" || v.isSmoker === "true";

  // Validate
  const errors = {};
  if (!v.firstName?.trim()) errors.firstName = "First name is required.";
  if (!v.lastName?.trim()) errors.lastName = "Last name is required.";

  if (v.rightToRentChecked && !v.rightToRentCheckDate) {
    errors.rightToRentCheckDate = "Check Date is required if Right to Rent is checked.";
  }

  // Validate document type selected when RTR checked
  if (v.rightToRentChecked && !v.rightToRentDocType?.trim()) {
    errors.rightToRentDocType = "Document type is required when Right to Rent is checked.";
  }

  // Validate time-limited docs require expiry date
  const timeLimitedDocs = ['eu_pre_settled', 'biometric_residence_permit', 'visa'];
  if (v.rightToRentChecked && timeLimitedDocs.includes(v.rightToRentDocType) && !v.rightToRentExpiry) {
    errors.rightToRentExpiry = `Expiry date is required for ${v.rightToRentDocType.replace(/_/g, ' ')} documents.`;
  }

  // Check file if uploaded
  const file = formData.get("rtrDoc");
  if (file && file.size > 0) {
    const fileValid = validateFile(file);
    if (!fileValid.valid) errors.rtrDoc = fileValid.error;
  }

  if (Object.keys(errors).length) {
    const safeV = { ...v };
    delete safeV.rtrDoc;
    return data({ errors, values: safeV }, { status: 400 });
  }

  try {
    await connect();

    // Map referencing state
    let refPassed = null;
    if (v.referencingStatus === "passed") refPassed = true;
    if (v.referencingStatus === "failed") refPassed = false;

    // Map guarantor address
    const guarantorAddress = v.hasGuarantor ? {
      line1: v.g_addressLine1?.trim() || null,
      line2: v.g_addressLine2?.trim() || null,
      city: v.g_city?.trim() || null,
      county: v.g_county?.trim() || null,
      postcode: v.g_postcode?.trim().toUpperCase() || null,
      country: "England",
    } : null;

    // Create User record with tenantData
    const tenantUser = await User.create({
      title: v.title?.trim() || undefined,
      firstName: v.firstName.trim(),
      lastName: v.lastName.trim(),
      email: v.email?.trim().toLowerCase() || `tenant_${Date.now()}@placeholder.local`,
      phone: v.phone?.trim() || undefined,
      addressLine1: v.addressLine1?.trim() || undefined,
      addressLine2: v.addressLine2?.trim() || undefined,
      addressLine3: v.addressLine3?.trim() || undefined,
      postTown: v.postTown?.trim() || undefined,
      postcode: v.postcode?.trim().toUpperCase() || undefined,
      agencyId: user.agencyId,
      roles: ["TENANT"],
      status: 1, // Active
      addedBy: user.userId,
      dob: v.dob ? parseDate(v.dob) : undefined,

      tenantData: {
        // Right to Rent
        rightToRentChecked: v.rightToRentChecked,
        rightToRentCheckDate: v.rightToRentChecked && v.rightToRentCheckDate ? parseDate(v.rightToRentCheckDate) : null,
        rightToRentCheckedBy: v.rightToRentChecked ? user.userId : null,
        rightToRentDocType: v.rightToRentDocType?.trim() || null,
        rightToRentExpiry: v.rightToRentExpiry ? parseDate(v.rightToRentExpiry) : null,
        rightToRentShareCode: v.rightToRentShareCode?.trim() || null,
        rightToRentNotes: v.rightToRentNotes?.trim() || null,

        // Employment & Referencing
        employmentStatus: v.employmentStatus || null,
        employerName: v.employerName?.trim() || null,
        employerPhone: v.employerPhone?.trim() || null,
        annualIncome: v.annualIncome ? Number(v.annualIncome) : null,
        referencingPassed: refPassed,
        referencingProvider: v.referencingProvider?.trim() || null,
        referencingDate: v.referencingDate ? parseDate(v.referencingDate) : null,
        referencingNotes: v.referencingNotes?.trim() || null,

        // Guarantor
        hasGuarantor: v.hasGuarantor,
        guarantorName: v.hasGuarantor ? v.guarantorName?.trim() : null,
        guarantorEmail: v.hasGuarantor ? v.guarantorEmail?.trim().toLowerCase() : null,
        guarantorPhone: v.hasGuarantor ? v.guarantorPhone?.trim() : null,
        guarantorRelationship: v.hasGuarantor ? v.guarantorRelationship?.trim() : null,
        guarantorAddress: guarantorAddress,

        // Emergency Contact
        emergencyContactName: v.emergencyContactName?.trim() || null,
        emergencyContactPhone: v.emergencyContactPhone?.trim() || null,
        emergencyContactRelationship: v.emergencyContactRelationship?.trim() || null,

        // Additional Details
        hasPets: v.hasPets,
        petDetails: v.hasPets ? v.petDetails?.trim() : null,
        isSmoker: v.isSmoker,
        numberOfOccupants: v.numberOfOccupants ? Number(v.numberOfOccupants) : 1,
      }
    });

    await logTenantAdded(tenantUser, user);
    if (v.rightToRentChecked) {
      await logRTRChecked(tenantUser, user, {
        docType: v.rightToRentDocType,
        expiryDate: parseDate(v.rightToRentExpiry),
      });
    }

    // ── Step 2: Handle S3 Upload if file present ───────────────────────────
    if (file && file.size > 0) {
      const s3Key = buildS3Key(user.agencyId, "tenant", tenantUser._id.toString(), "right_to_rent", file.name);
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      await uploadToS3(buffer, s3Key, file.type);

      const docTypeDoc = await DocumentType.findOne({ key: "right_to_rent" }).lean();
      if (docTypeDoc) {
        const document = await Document.create({
          agencyId: user.agencyId,
          entityType: "tenant",
          entityId: tenantUser._id,
          docType: docTypeDoc._id,
          fileName: file.name,
          s3Key: s3Key,
          fileSize: file.size,
          mimeType: file.type,
          uploadedBy: user.userId,
          expiryDate: parseDate(v.rightToRentExpiry) || null,
          notes: v.rightToRentNotes?.trim() || null,
        });
        await logDocumentUploaded(
          { ...document.toObject(), docType: { key: "right_to_rent", name: docTypeDoc.name || "Right to Rent" } },
          user
        );
      }
    }

    return redirect(`/tenants/${tenantUser._id}?success=created`);
  } catch (err) {
    console.error("Error creating tenant:", err);
    const safeV = { ...v };
    delete safeV.rtrDoc;

    if (err.code === 11000) {
      return data({ errors: { email: "This email is already registered." }, values: safeV }, { status: 400 });
    }

    return data({ errors: { general: "An unexpected error occurred while saving. Please try again." }, values: safeV }, { status: 500 });
  }
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function AddTenant() {
  const actionData = useActionData();
  const errors = actionData?.errors || {};
  const values = actionData?.values || {};

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Add Tenant</h1>
          <p className="text-sm text-gray-500 mt-1">Create a new tenant profile</p>
        </div>
      </div>

      {errors.general && (
        <div className="mb-6 p-4 rounded-lg bg-red-50 border border-red-200">
          <p className="text-sm font-medium text-red-800">{errors.general}</p>
        </div>
      )}

      <TenantForm values={values} errors={errors} cancelLink="/tenants" isEdit={false} />
    </div>
  );
}

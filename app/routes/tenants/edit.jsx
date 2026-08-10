// routes/tenants/edit.jsx — Edit Tenant form
import { useActionData, useLoaderData } from "react-router-dom";
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
import { toInputDate } from "../../utils/date.js";
import TenantForm from "../../components/ui/TenantForm.jsx";
import { logRTRChecked } from "../../utils/activityLog.server.js";

// Helper for dates
function parseDate(val) {
  if (!val) return null;
  const d = new Date(val);
  return isNaN(d) ? null : d;
}

export async function loader({ request, params }) {
  const user = await getUserFromRequest(request);
  if (!user) return redirect("/login");
  if (!user.organizationId && !user.roles?.includes("SUPER_ADMIN")) return redirect("/dashboard");

  await connect();
  const query = { _id: params.id, roles: "TENANT" };
  if (!user.roles?.includes("SUPER_ADMIN")) {
    query.organizationId = user.organizationId;
  }

  const profile = await User.findOne(query).lean();
  if (!profile) return redirect("/tenants");

  // Flatten the profile for the UI matching \`add.jsx\` names:
  const values = {
    title: profile.title || "",
    firstName: profile.firstName || "",
    lastName: profile.lastName || "",
    dob: profile.dob ? toInputDate(profile.dob) : "",
    email: profile.email || "",
    phone: profile.phone || "",
    addressLine1: profile.addressLine1 || "",
    addressLine2: profile.addressLine2 || "",
    addressLine3: profile.addressLine3 || "",
    postTown: profile.postTown || "",
    postcode: profile.postcode || "",
    
    // tenantData
    rightToRentChecked: profile.tenantData?.rightToRentChecked ? "true" : "false",
    rightToRentCheckDate: profile.tenantData?.rightToRentCheckDate ? toInputDate(profile.tenantData.rightToRentCheckDate) : "",
    rightToRentDocType: profile.tenantData?.rightToRentDocType || "",
    rightToRentExpiry: profile.tenantData?.rightToRentExpiry ? toInputDate(profile.tenantData.rightToRentExpiry) : "",
    rightToRentShareCode: profile.tenantData?.rightToRentShareCode || "",
    rightToRentNotes: profile.tenantData?.rightToRentNotes || "",
    
    employmentStatus: profile.tenantData?.employmentStatus || "",
    employerName: profile.tenantData?.employerName || "",
    employerPhone: profile.tenantData?.employerPhone || "",
    annualIncome: profile.tenantData?.annualIncome?.toString() || "",
    
    referencingStatus: profile.tenantData?.referencingPassed === true ? "passed" : profile.tenantData?.referencingPassed === false ? "failed" : "pending",
    referencingProvider: profile.tenantData?.referencingProvider || "",
    referencingDate: profile.tenantData?.referencingDate ? toInputDate(profile.tenantData.referencingDate) : "",
    referencingNotes: profile.tenantData?.referencingNotes || "",
    
    hasGuarantor: profile.tenantData?.hasGuarantor ? "true" : "false",
    guarantorName: profile.tenantData?.guarantorName || "",
    guarantorEmail: profile.tenantData?.guarantorEmail || "",
    guarantorPhone: profile.tenantData?.guarantorPhone || "",
    guarantorRelationship: profile.tenantData?.guarantorRelationship || "",
    g_addressLine1: profile.tenantData?.guarantorAddress?.line1 || "",
    g_addressLine2: profile.tenantData?.guarantorAddress?.line2 || "",
    g_city: profile.tenantData?.guarantorAddress?.city || "",
    g_county: profile.tenantData?.guarantorAddress?.county || "",
    g_postcode: profile.tenantData?.guarantorAddress?.postcode || "",

    emergencyContactName: profile.tenantData?.emergencyContactName || "",
    emergencyContactPhone: profile.tenantData?.emergencyContactPhone || "",
    emergencyContactRelationship: profile.tenantData?.emergencyContactRelationship || "",

    hasPets: profile.tenantData?.hasPets ? "true" : "false",
    petDetails: profile.tenantData?.petDetails || "",
    isSmoker: profile.tenantData?.isSmoker ? "true" : "false",
    numberOfOccupants: profile.tenantData?.numberOfOccupants?.toString() || "1",
    
    status: profile.status,
  };

  return { tenant: profile, initialValues: values };
}

export async function action({ request, params }) {
  const user = await getUserFromRequest(request);
  if (!user) return redirect("/login");
  if (!user.organizationId && !user.roles?.includes("SUPER_ADMIN")) return redirect("/dashboard");

  const formData = await request.formData();
  const v = Object.fromEntries(formData);

  // Coerce booleans
  v.rightToRentChecked = v.rightToRentChecked === "on" || v.rightToRentChecked === "true";
  v.hasGuarantor       = v.hasGuarantor       === "on" || v.hasGuarantor       === "true";
  v.hasPets            = v.hasPets            === "on" || v.hasPets            === "true";
  v.isSmoker           = v.isSmoker           === "on" || v.isSmoker           === "true";

  // Validate
  const errors = {};
  if (!v.firstName?.trim()) errors.firstName = "First name is required.";
  if (!v.lastName?.trim())  errors.lastName  = "Last name is required.";

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
      line1:    v.g_addressLine1?.trim() || null,
      line2:    v.g_addressLine2?.trim() || null,
      city:     v.g_city?.trim() || null,
      county:   v.g_county?.trim() || null,
      postcode: v.g_postcode?.trim().toUpperCase() || null,
      country:  "England",
    } : null;

    // Find existing to preserve unchanged deep fields or rightToRentCheckedBy
    const existing = await User.findOne({ _id: params.id, roles: "TENANT", ...(user.roles?.includes("SUPER_ADMIN") ? {} : { organizationId: user.organizationId }) }).lean();
    if (!existing) throw new Error("Tenant not found");

    // Update User record with tenantData
    const tenantUser = await User.findOneAndUpdate(
      { _id: existing._id },
      {
        title:        v.title?.trim() || undefined,
        firstName:    v.firstName.trim(),
        lastName:     v.lastName.trim(),
        email:        v.email?.trim().toLowerCase() || existing.email,
        phone:        v.phone?.trim() || undefined,
        dob:          v.dob ? parseDate(v.dob) : undefined,
        addressLine1: v.addressLine1?.trim() || undefined,
        addressLine2: v.addressLine2?.trim() || undefined,
        addressLine3: v.addressLine3?.trim() || undefined,
        postTown:     v.postTown?.trim() || undefined,
        postcode:     v.postcode?.trim().toUpperCase() || undefined,
        
        tenantData: {
          ...existing.tenantData,
          // Right to Rent
          rightToRentChecked:   v.rightToRentChecked,
          rightToRentCheckDate: v.rightToRentChecked && v.rightToRentCheckDate ? parseDate(v.rightToRentCheckDate) : null,
          rightToRentCheckedBy: v.rightToRentChecked ? (existing.tenantData?.rightToRentCheckedBy || user.userId) : null,
          rightToRentDocType:   v.rightToRentDocType?.trim() || null,
          rightToRentExpiry:    v.rightToRentExpiry ? parseDate(v.rightToRentExpiry) : null,
          rightToRentShareCode: v.rightToRentShareCode?.trim() || null,
          rightToRentNotes:     v.rightToRentNotes?.trim() || null,

          // Employment & Referencing
          employmentStatus:    v.employmentStatus || null,
          employerName:        v.employerName?.trim() || null,
          employerPhone:       v.employerPhone?.trim() || null,
          annualIncome:        v.annualIncome ? Number(v.annualIncome) : null,
          referencingPassed:   refPassed,
          referencingProvider: v.referencingProvider?.trim() || null,
          referencingDate:     v.referencingDate ? parseDate(v.referencingDate) : null,
          referencingNotes:    v.referencingNotes?.trim() || null,

          // Guarantor
          hasGuarantor:          v.hasGuarantor,
          guarantorName:         v.hasGuarantor ? v.guarantorName?.trim() : null,
          guarantorEmail:        v.hasGuarantor ? v.guarantorEmail?.trim().toLowerCase() : null,
          guarantorPhone:        v.hasGuarantor ? v.guarantorPhone?.trim() : null,
          guarantorRelationship: v.hasGuarantor ? v.guarantorRelationship?.trim() : null,
          guarantorAddress:      guarantorAddress,

          // Emergency Contact
          emergencyContactName:         v.emergencyContactName?.trim() || null,
          emergencyContactPhone:        v.emergencyContactPhone?.trim() || null,
          emergencyContactRelationship: v.emergencyContactRelationship?.trim() || null,

          // Additional Details
          hasPets:           v.hasPets,
          petDetails:        v.hasPets ? v.petDetails?.trim() : null,
          isSmoker:          v.isSmoker,
          numberOfOccupants: v.numberOfOccupants ? Number(v.numberOfOccupants) : 1,
        }
      },
      { new: true }
    );

    // ── Step 2: Handle S3 Upload if file present ───────────────────────────
    if (file && file.size > 0) {
      const s3Key = buildS3Key(user.organizationId, "tenant", tenantUser._id.toString(), "right_to_rent", file.name);
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      await uploadToS3(buffer, s3Key, file.type);

      const docTypeDoc = await DocumentType.findOne({ key: "right_to_rent" }).lean();
      if (docTypeDoc) {
        await Document.create({
          organizationId:   user.organizationId,
          entityType: "tenant",
          entityId:   tenantUser._id,
          docType:    docTypeDoc._id,
          fileName:   file.name,
          s3Key:      s3Key,
          fileSize:   file.size,
          mimeType:   file.type,
          uploadedBy: user.userId,
          expiryDate: parseDate(v.rightToRentExpiry) || null,
          notes:      v.rightToRentNotes?.trim() || null,
        });
      }
    }

    // Log RTR check if it's newly checked or the check date changed
    if (v.rightToRentChecked) {
      const wasCheckedBefore = existing.tenantData?.rightToRentChecked;
      const prevCheckDate = existing.tenantData?.rightToRentCheckDate?.toISOString?.() || null;
      const newCheckDate = v.rightToRentCheckDate ? new Date(v.rightToRentCheckDate).toISOString() : null;
      if (!wasCheckedBefore || prevCheckDate !== newCheckDate) {
        await logRTRChecked(tenantUser, user);
      }
    }

    return redirect(`/tenants/${tenantUser._id}?success=updated`);
  } catch (err) {
    console.error("Error updating tenant:", err);
    const safeV = { ...v };
    delete safeV.rtrDoc;
    return data({ errors: { general: "An unexpected error occurred while saving. Please try again." }, values: safeV }, { status: 500 });
  }
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function EditTenant() {
  const { tenant, initialValues } = useLoaderData();
  const actionData = useActionData();
  const errors = actionData?.errors || {};
  const values = actionData?.values || initialValues;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Edit Tenant</h1>
          <p className="text-sm text-gray-500 mt-1">Update profile for {tenant.title ? tenant.title + ' ' : ''}{tenant.firstName} {tenant.lastName}</p>
        </div>
      </div>

      {errors.general && (
        <div className="mb-6 p-4 rounded-lg bg-red-50 border border-red-200">
          <p className="text-sm font-medium text-red-800">{errors.general}</p>
        </div>
      )}

      <TenantForm values={values} errors={errors} cancelLink={`/tenants/${tenant._id}`} isEdit={true} />
    </div>
  );
}

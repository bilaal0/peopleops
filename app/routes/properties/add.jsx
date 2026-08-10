// routes/properties/add.jsx — Add Property
// Landlord selector with AML amber warning. Pre-selects landlord from query param.
import { useLoaderData, useActionData, useNavigation, Link } from "react-router-dom";
import { getUserFromRequest } from "../../utils/auth.server.js";
import { redirect, data } from "react-router";
import { Property } from "../../models/property.server.js";
import { User } from "../../models/user.server.js";
import { connect } from "../../config/db.server.js";
import { fileToBuffer, buildS3Key, uploadToS3 } from "../../utils/s3.server.js";
import { Note } from "../../models/note.server.js";
import PropertyForm from "../../components/properties/PropertyForm.jsx";
import { logPropertyAdded } from "../../utils/activityLog.server.js";

export async function loader({ request }) {
  const user = await getUserFromRequest(request);
  if (!user) return redirect("/login");
  if (!user.organizationId && !user.roles?.includes("SUPER_ADMIN")) return redirect("/dashboard");

  await connect();
  const organizationFilter = user.roles?.includes("SUPER_ADMIN") ? {} : { organizationId: user.organizationId };

  // Pre-select landlord from query param (?landlordId=xxx)
  const url = new URL(request.url);
  const preselectedLandlordId = url.searchParams.get("landlordId") || null;

  // Fetch landlords with AML status
  const users = await User.find({ ...organizationFilter, roles: "LANDLORD", deleted: false })
    .select("title firstName lastName landlordData.amlResult")
    .sort({ createdAt: -1 })
    .lean();

  const landlords = users.map(p => ({
    _id: p._id.toString(),
    profileId: p._id.toString(),
    firstName: p.firstName || "",
    lastName: p.lastName || "",
    amlResult: p.landlordData?.amlResult || null,
  }));

  return { landlords, preselectedLandlordId };
}

export async function action({ request }) {
  const user = await getUserFromRequest(request);
  if (!user) return redirect("/login");
  if (!user.organizationId && !user.roles?.includes("SUPER_ADMIN")) return redirect("/dashboard");

  const formData = await request.formData();
  const v = Object.fromEntries(formData);

  // Parse booleans
  v.epcExemption              = v.epcExemption === "true";
  v.selectiveLicenceRequired  = v.selectiveLicenceRequired === "true";
  v.portalListed              = v.portalListed === "true";

  // ── Validations ─────────────────────────────────────────────────────────
  const errors = {};
  if (!v.landlordId?.trim())    errors.landlordId    = "Landlord is required.";
  if (!v.addressLine1?.trim())  errors.addressLine1  = "Address line 1 is required.";
  if (!v.city?.trim())          errors.city           = "City / Town is required.";
  if (!v.postcode?.trim())      errors.postcode       = "Postcode is required.";
  if (!v.propertyType)          errors.propertyType   = "Property type is required.";

  if (v.propertyType === "hmo" && !v.hmoLicenceNo?.trim()) {
    errors.hmoLicenceNo = "HMO licence number is required for HMO properties.";
  }
  if (v.selectiveLicenceRequired && !v.selectiveLicenceNo?.trim()) {
    errors.selectiveLicenceNo = "Selective licence number is required.";
  }
  if (v.epcExemption && !v.epcExemptionReason?.trim()) {
    errors.epcExemptionReason = "Exemption reason is required.";
  }

  if (Object.keys(errors).length) {
    return data({ errors, values: v }, { status: 400 });
  }

  try {
    await connect();

    // ── Verify landlord belongs to this organization ────────────────────────────
    const landlordUser = await User.findOne({
      _id: v.landlordId,
      ...(user.roles?.includes("SUPER_ADMIN") ? {} : { organizationId: user.organizationId }),
      roles: "LANDLORD",
    }).lean();

    if (!landlordUser) {
      return data({ errors: { landlordId: "Landlord not found or does not belong to your organization." }, values: v }, { status: 400 });
    }

    // ── Check landlord AML (warn only, don't block) ──────────────────────
    let amlWarning = null;
    if (landlordUser.landlordData?.amlResult !== "pass") {
      amlWarning = {
        message: "AML check not completed for this landlord. You can add the property but cannot create a tenancy until AML is passed.",
        profileId: landlordUser._id.toString(),
      };
    }

    // ── F/G EPC warning (warn only, don't block at creation) ─────────────
    let epcWarning = null;
    if ((v.epcRating === "F" || v.epcRating === "G") && !v.epcExemption) {
      epcWarning = "Property rated F or G. A MEES exemption must be registered before a tenancy can be created.";
    }

    // ── Create property ───────────────────────────────────────────────────
    const property = await Property.create({
      organizationId: user.organizationId,
      landlordId: v.landlordId,
      addressLine1: v.addressLine1.trim(),
      addressLine2: v.addressLine2?.trim() || undefined,
      city: v.city.trim(),
      county: v.county?.trim() || undefined,
      postcode: v.postcode.trim().toUpperCase(),
      country: v.country || "England",
      uprn: v.uprn?.trim() || undefined,
      propertyType: v.propertyType,
      furnished: v.furnished || undefined,
      bedrooms: v.bedrooms ? Number(v.bedrooms) : undefined,
      bathrooms: v.bathrooms ? Number(v.bathrooms) : undefined,
      floorAreaSqm: v.floorAreaSqm ? Number(v.floorAreaSqm) : undefined,
      constructionYear: v.constructionYear ? Number(v.constructionYear) : undefined,
      hmoLicenceNo: v.propertyType === "hmo" ? v.hmoLicenceNo?.trim() : undefined,
      hmoLicenceExpiry: v.propertyType === "hmo" && v.hmoLicenceExpiry ? new Date(v.hmoLicenceExpiry) : undefined,
      hmoMaxOccupants: v.propertyType === "hmo" && v.hmoMaxOccupants ? Number(v.hmoMaxOccupants) : undefined,
      epcRating: v.epcRating || undefined,
      epcExpiryDate: v.epcExpiryDate ? new Date(v.epcExpiryDate) : undefined,
      epcExemption: v.epcExemption,
      epcExemptionReason: v.epcExemption ? v.epcExemptionReason?.trim() : undefined,
      selectiveLicenceRequired: v.selectiveLicenceRequired,
      selectiveLicenceNo: v.selectiveLicenceRequired ? v.selectiveLicenceNo?.trim() : undefined,
      selectiveLicenceExpiry: v.selectiveLicenceRequired && v.selectiveLicenceExpiry ? new Date(v.selectiveLicenceExpiry) : undefined,
      localAuthority: v.localAuthority?.trim() || undefined,
      councilTaxBand: v.councilTaxBand || undefined,
      portalListed: v.portalListed,
      advertisedRent: v.portalListed && v.advertisedRent ? Number(v.advertisedRent) : undefined,
      status: "available",
      createdBy: user.userId,
    });

    await logPropertyAdded(property, user);

    if (v.notes?.trim()) {
      await Note.create({
        organizationId: user.organizationId,
        entityType: 'property',
        entityId: property._id,
        text: v.notes.trim(),
        addedBy: user.userId,
      });
    }

    // ── Upload Images ──────────────────────────────────────────────────────
    let hasUploads = false;
    let mainImageKey = null;
    const galleryKeys = [];
    const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

    // Main Image
    const mainImageFile = formData.get("mainImage");
    if (mainImageFile && mainImageFile.size > 0) {
      if (mainImageFile.size > MAX_FILE_SIZE) {
        return data({ errors: { mainImage: "Main image exceeds 5MB limit." }, values: v }, { status: 400 });
      }
      const buffer = await fileToBuffer(mainImageFile);
      const s3Key = buildS3Key(user.organizationId, "property", property._id.toString(), "main_image", mainImageFile.name);
      mainImageKey = await uploadToS3(buffer, s3Key, mainImageFile.type);
      hasUploads = true;
    }

    // Additional Images (Gallery)
    const additionalFiles = formData.getAll("additionalImages").filter(f => f && f.size > 0);
    if (additionalFiles.length > 10) {
      return data({ errors: { additionalImages: "You can only upload up to 10 gallery images at once." }, values: v }, { status: 400 });
    }

    for (const file of additionalFiles) {
      if (file.size > MAX_FILE_SIZE) {
        return data({ errors: { additionalImages: `File ${file.name} exceeds 5MB limit.` }, values: v }, { status: 400 });
      }
      const buffer = await fileToBuffer(file);
      const s3Key = buildS3Key(user.organizationId, "property", property._id.toString(), "gallery", file.name);
      galleryKeys.push(await uploadToS3(buffer, s3Key, file.type));
      hasUploads = true;
    }

    if (hasUploads) {
      property.mainImage = mainImageKey || property.mainImage;
      property.gallery = galleryKeys;
      await property.save();
    }

    // Build redirect with optional warnings
    const params = new URLSearchParams({ success: "created" });
    if (amlWarning) params.set("amlWarning", "1");
    if (epcWarning) params.set("epcWarning", "1");

    return redirect(`/properties/${property._id}?${params.toString()}`);
  } catch (err) {
    console.error("Error creating property:", err);
    return data({ errors: { general: "An unexpected error occurred. Please try again." }, values: v }, { status: 500 });
  }
}

export default function AddProperty() {
  const { landlords, preselectedLandlordId } = useLoaderData();
  const actionData = useActionData();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <Link
          to="/properties"
          className="flex items-center justify-center w-9 h-9 rounded-lg border border-gray-300 hover:bg-gray-50 transition"
        >
          <svg className="w-4 h-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Add Property</h1>
          <p className="text-sm text-gray-500 mt-0.5">Register a new property for your portfolio</p>
        </div>
      </div>

      <PropertyForm
        landlords={landlords}
        preselectedLandlordId={preselectedLandlordId}
        errors={actionData?.errors || {}}
        values={actionData?.values || {}}
        amlWarning={actionData?.amlWarning}
        isEdit={false}
        isSubmitting={isSubmitting}
        cancelUrl="/properties"
      />
    </div>
  );
}

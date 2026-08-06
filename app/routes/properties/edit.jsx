// routes/properties/edit.jsx — Edit Property
// Reuses shared PropertyForm component — same UX as add.
import { useLoaderData, useActionData, useNavigation, Link } from "react-router-dom";
import { getUserFromRequest } from "../../utils/auth.server.js";
import { redirect, data } from "react-router";
import { Property } from "../../models/property.server.js";
import { User } from "../../models/user.server.js";
import { Tenancy } from "../../models/tenancy.server.js";
import { connect } from "../../config/db.server.js";
import { fileToBuffer, buildS3Key, uploadToS3 } from "../../utils/s3.server.js";
import PropertyForm from "../../components/properties/PropertyForm.jsx";

export async function loader({ request, params }) {
  const user = await getUserFromRequest(request);
  if (!user) return redirect("/login");
  if (!user.agencyId && !user.roles?.includes("SUPER_ADMIN")) return redirect("/dashboard");

  await connect();
  const agencyFilter = user.roles?.includes("SUPER_ADMIN") ? {} : { agencyId: user.agencyId };

  const property = await Property.findOne({ _id: params.id, deleted: false, ...agencyFilter }).lean();
  if (!property) return redirect("/properties");

  // Fetch landlords with AML status for dropdown
  const users = await User.find({ ...agencyFilter, roles: "LANDLORD", deleted: false })
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

  // Serialize property for client
  const serialized = {
    ...property,
    _id: property._id.toString(),
    agencyId: property.agencyId?.toString(),
    landlordId: property.landlordId?.toString(),
    createdBy: property.createdBy?.toString(),
    updatedBy: property.updatedBy?.toString(),
  };

  return { property: serialized, landlords };
}

export async function action({ request, params }) {
  const user = await getUserFromRequest(request);
  if (!user) return redirect("/login");
  if (!user.agencyId && !user.roles?.includes("SUPER_ADMIN")) return redirect("/dashboard");

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

  // ── Status transition: "let" cannot change status directly ─────────────
  if (v.currentStatus === "let" && v.status !== "let") {
    errors.status = "Cannot change status while property is let. End the tenancy first.";
  }

  if (Object.keys(errors).length) {
    return data({ errors, values: v }, { status: 400 });
  }

  try {
    await connect();
    const agencyFilter = user.roles?.includes("SUPER_ADMIN") ? {} : { agencyId: user.agencyId };

    const property = await Property.findOne({ _id: params.id, deleted: false, ...agencyFilter });
    if (!property) {
      return data({ errors: { general: "Property not found or access denied." } }, { status: 404 });
    }

    // ── Verify landlord belongs to this agency ────────────────────────────
    const landlordUser = await User.findOne({
      _id: v.landlordId,
      ...agencyFilter,
      roles: "LANDLORD",
    }).lean();

    if (!landlordUser) {
      return data({ errors: { landlordId: "Landlord not found or does not belong to your agency." }, values: v }, { status: 400 });
    }

    // ── Block status change away from "let" if active tenancies exist ─────
    if (property.status === "let" && v.status !== "let") {
      const activeTenancies = await Tenancy.countDocuments({
        propertyId: property._id,
        status: "active",
      });
      if (activeTenancies > 0) {
        return data({
          errors: { status: "Cannot change status while active tenancies exist. End the tenancy first." },
          values: v,
        }, { status: 400 });
      }
    }

    // ── Update property ─────────────────────────────────────────────────
    await Property.findByIdAndUpdate(params.id, {
      landlordId: v.landlordId,
      addressLine1: v.addressLine1.trim(),
      addressLine2: v.addressLine2?.trim() || null,
      city: v.city.trim(),
      county: v.county?.trim() || null,
      postcode: v.postcode.trim().toUpperCase(),
      country: v.country || "England",
      uprn: v.uprn?.trim() || null,
      propertyType: v.propertyType,
      furnished: v.furnished || null,
      bedrooms: v.bedrooms ? Number(v.bedrooms) : null,
      bathrooms: v.bathrooms ? Number(v.bathrooms) : null,
      floorAreaSqm: v.floorAreaSqm ? Number(v.floorAreaSqm) : null,
      constructionYear: v.constructionYear ? Number(v.constructionYear) : null,
      hmoLicenceNo: v.propertyType === "hmo" ? v.hmoLicenceNo?.trim() : null,
      hmoLicenceExpiry: v.propertyType === "hmo" && v.hmoLicenceExpiry ? new Date(v.hmoLicenceExpiry) : null,
      hmoMaxOccupants: v.propertyType === "hmo" && v.hmoMaxOccupants ? Number(v.hmoMaxOccupants) : null,
      epcRating: v.epcRating || null,
      epcExpiryDate: v.epcExpiryDate ? new Date(v.epcExpiryDate) : null,
      epcExemption: v.epcExemption,
      epcExemptionReason: v.epcExemption ? v.epcExemptionReason?.trim() : null,
      selectiveLicenceRequired: v.selectiveLicenceRequired,
      selectiveLicenceNo: v.selectiveLicenceRequired ? v.selectiveLicenceNo?.trim() : null,
      selectiveLicenceExpiry: v.selectiveLicenceRequired && v.selectiveLicenceExpiry ? new Date(v.selectiveLicenceExpiry) : null,
      localAuthority: v.localAuthority?.trim() || null,
      councilTaxBand: v.councilTaxBand || null,
      portalListed: v.portalListed,
      advertisedRent: v.portalListed && v.advertisedRent ? Number(v.advertisedRent) : null,
      status: v.status || property.status,
      updatedBy: user.userId,
    });

    // ── Upload Images ──────────────────────────────────────────────────────
    let mainImageKey = null;
    let galleryKeys = [];
    let hasUploads = false;
    const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

    // Main Image
    const mainImageFile = formData.get("mainImage");
    if (mainImageFile && mainImageFile.size > 0) {
      if (mainImageFile.size > MAX_FILE_SIZE) {
        return data({ errors: { mainImage: "Main image exceeds 5MB limit." }, values: v }, { status: 400 });
      }
      const buffer = await fileToBuffer(mainImageFile);
      const s3Key = buildS3Key(user.agencyId, "property", property._id.toString(), "main_image", mainImageFile.name);
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
      const s3Key = buildS3Key(user.agencyId, "property", property._id.toString(), "gallery", file.name);
      galleryKeys.push(await uploadToS3(buffer, s3Key, file.type));
      hasUploads = true;
    }

    if (hasUploads) {
      await Property.findByIdAndUpdate(params.id, {
        ...(mainImageKey && { mainImage: mainImageKey }),
        ...(galleryKeys.length > 0 && { $push: { gallery: { $each: galleryKeys } } }),
      });
    }

    return redirect(`/properties/${params.id}?success=updated`);
  } catch (err) {
    console.error("Error updating property:", err);
    return data({ errors: { general: "An unexpected error occurred. Please try again." }, values: v }, { status: 500 });
  }
}

export default function EditProperty() {
  const { property, landlords } = useLoaderData();
  const actionData = useActionData();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  // Merge action errors/values on top of loaded data
  const values = actionData?.values || property;
  const errors = actionData?.errors || {};

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <Link
          to={`/properties/${property._id}`}
          className="flex items-center justify-center w-9 h-9 rounded-lg border border-gray-300 hover:bg-gray-50 transition"
        >
          <svg className="w-4 h-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Edit Property</h1>
          <p className="text-sm text-gray-500 mt-0.5">{property.addressLine1}, {property.postcode}</p>
        </div>
      </div>

      {/* Hidden field to track current status for transition validation */}
      <input type="hidden" name="currentStatus" value={property.status} form="editForm" />

      <PropertyForm
        landlords={landlords}
        errors={errors}
        values={values}
        isEdit={true}
        isSubmitting={isSubmitting}
        cancelUrl={`/properties/${property._id}`}
      />
    </div>
  );
}

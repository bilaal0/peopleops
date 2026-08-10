// routes/tenancies/edit.jsx
// Comprehensive route for editing tenancies with compliance checks

import { useLoaderData, useActionData, useNavigation } from "react-router";
import { redirect, data } from "react-router";
import { getUserFromRequest } from "../../utils/auth.server.js";
import { connect } from "../../config/db.server.js";
import { Tenancy } from "../../models/tenancy.server.js";
import { Property } from "../../models/property.server.js";
import { User } from "../../models/user.server.js";
import { runTenancyPreFlight } from "../../utils/preflight.server.js";
import { validateTenancy } from "../../utils/validator.js";
import { logHowToRentServed, logDepositProtected, logPrescribedInfoServed } from "../../utils/activityLog.server.js";
import { TenancyForm } from "../../components/tenancy/TenancyForm.jsx";

// ════════════════════════════════════════════════════════════════════════════════
// LOADER
// ════════════════════════════════════════════════════════════════════════════════

export async function loader({ request, params }) {
  const user = await getUserFromRequest(request);
  if (!user) return redirect("/login");
  if (!user.organizationId && !user.roles?.includes("SUPER_ADMIN")) {
    return redirect("/dashboard");
  }

  await connect();

  const organizationFilter = user.roles?.includes("SUPER_ADMIN")
    ? {}
    : { organizationId: user.organizationId };

  const tenancy = await Tenancy.findOne({
    ...organizationFilter,
    _id: params.id,
  }).lean();

  if (!tenancy) {
    throw new Response("Not Found", { status: 404 });
  }

  // Properties available for letting, plus the tenancy's currently selected property
  const properties = await Property.find({
    ...organizationFilter,
    deleted: false,
    $or: [
      { status: { $in: ["available", "under_offer"] } },
      { _id: tenancy.propertyId }
    ]
  })
    .populate("landlordId", "title firstName lastName landlordData")
    .select("addressLine1 city postcode propertyType landlordId commission advertisedRent")
    .sort({ addressLine1: 1 })
    .lean();

  // Active tenants
  const tenants = await User.find({
    ...organizationFilter,
    roles: "TENANT",
    status: 1,
    deleted: false,
  })
    .select("title firstName lastName email tenantData.rightToRentChecked tenantData.rightToRentExpiry")
    .sort({ lastName: 1 })
    .lean();

  return {
    tenancy: {
      ...tenancy,
      _id: tenancy._id.toString(),
      propertyId: tenancy.propertyId.toString(),
      landlordId: tenancy.landlordId.toString(),
      tenantIds: tenancy.tenantIds.map(t => t.toString()),
      startDate: tenancy.startDate ? tenancy.startDate.toISOString() : null,
      endDate: tenancy.endDate ? tenancy.endDate.toISOString() : null,
      rent: {
        ...tenancy.rent,
        reviewDate: tenancy.rent?.reviewDate ? tenancy.rent.reviewDate.toISOString() : null
      },
      deposit: tenancy.deposit || { amount: 0, scheme: null },
      howToRent: tenancy.howToRent ? {
        ...tenancy.howToRent,
        servedDate: tenancy.howToRent.servedDate ? tenancy.howToRent.servedDate.toISOString() : null
      } : { served: false }
    },
    properties: properties.map((p) => ({
      _id: p._id.toString(),
      addressLine1: p.addressLine1,
      city: p.city,
      postcode: p.postcode,
      propertyType: p.propertyType,
      landlordId: p.landlordId?._id?.toString() || null,
      landlordName: p.landlordId
        ? `${p.landlordId.title ? p.landlordId.title + ' ' : ''}${p.landlordId.firstName} ${p.landlordId.lastName}`
        : null,
      landlordAMLPassed: p.landlordId?.landlordData?.amlResult === "pass",
      commission: p.commission,
      advertisedRent: p.advertisedRent,
    })),
    tenants: tenants.map((t) => ({
      _id: t._id.toString(),
      firstName: t.firstName,
      lastName: t.lastName,
      email: t.email,
      rightToRentChecked: t.tenantData?.rightToRentChecked || false,
      rightToRentExpiry: t.tenantData?.rightToRentExpiry || null,
    })),
  };
}

// ════════════════════════════════════════════════════════════════════════════════
// ACTION
// ════════════════════════════════════════════════════════════════════════════════

export async function action({ request, params }) {
  const user = await getUserFromRequest(request);
  if (!user) return redirect("/login");
  if (!user.organizationId && !user.roles?.includes("SUPER_ADMIN")) {
    return redirect("/dashboard");
  }

  const formData = await request.formData();
  const v = Object.fromEntries(formData);

  const tenantIds = formData.getAll("tenantIds").filter(Boolean);
  v.tenantIds = tenantIds;

  // ── STEP 1: Basic Validation ──────────────────────────────────────────────
  const { valid, errors } = validateTenancy(v);
  if (!valid) {
    return data({ errors }, { status: 400 });
  }

  await connect();

  const organizationFilter = user.roles?.includes("SUPER_ADMIN")
    ? {}
    : { organizationId: user.organizationId };

  try {
    const tenancy = await Tenancy.findOne({ ...organizationFilter, _id: params.id });
    if (!tenancy) {
      return data({ error: "Tenancy not found or access denied." }, { status: 404 });
    }
    const previousDeposit = tenancy.deposit ? { ...tenancy.deposit } : null;
    const previousHowToRent = tenancy.howToRent ? { ...tenancy.howToRent } : null;

    // ── STEP 2: Fetch Property & Tenants ─────────────────────────────────────
    const [property, tenantRecords] = await Promise.all([
      Property.findOne({ ...organizationFilter, _id: v.propertyId, deleted: false }).lean(),
      User.find({ ...organizationFilter, _id: { $in: tenantIds }, roles: "TENANT" }).lean(),
    ]);

    if (!property) {
      return data({ error: "Property not found or access denied." }, { status: 400 });
    }
    if (tenantRecords.length !== tenantIds.length) {
      return data({ error: "One or more selected tenants could not be found." }, { status: 400 });
    }

    const landlordId = v.landlordId;
    if (!landlordId) {
      return data({ error: "Landlord not resolved. Please check the property details." }, { status: 400 });
    }

    // ── STEP 3: RRA 2026 Rent Cap ─────────────────────────────────────────────
    const rentAmount = parseFloat(v.rentAmount);
    const rentDueDay = parseInt(v.rentDueDay, 10);

    if (property.advertisedRent && rentAmount > property.advertisedRent) {
      return data(
        { error: `Rent (£${rentAmount}) cannot exceed advertised rent (£${property.advertisedRent}). RRA 2026 prohibits rent above asking price.` },
        { status: 400 }
      );
    }

    // ── STEP 4: Compliance Pre-Flight ─────────────────────────────────────────
    const preFlight = await runTenancyPreFlight(
      property._id,
      landlordId,
      tenantIds,
      user.organizationId
    );

    // Since this is an edit, filter out propertyStatus 'let' block
    preFlight.blocks = preFlight.blocks.filter(b => b.field !== "propertyStatus");
    preFlight.canCreate = preFlight.blocks.length === 0;

    if (!preFlight.canCreate) {
      return data(
        {
          error: "Cannot update tenancy — compliance issues must be resolved first.",
          preFlightBlocks: preFlight.blocks,
          preFlightWarnings: preFlight.warnings,
        },
        { status: 400 }
      );
    }

    // Warnings — ask for acknowledgment before proceeding
    if (preFlight.warnings?.length > 0 && v.warningsAcknowledged !== "true") {
      return data(
        { preFlightWarnings: preFlight.warnings, preFlightBlocks: [] },
        { status: 200 }
      );
    }

    // ── STEP 5: Update Tenancy ────────────────────────────────────────────────
    const startDate = new Date(v.startDate);
    const reviewDate = new Date(startDate);
    reviewDate.setFullYear(reviewDate.getFullYear() + 1);

    tenancy.tenantIds = tenantIds;
    tenancy.tenancyType = v.tenancyType;
    tenancy.startDate = startDate;
    tenancy.endDate = v.tenancyType === "ast" && v.endDate ? new Date(v.endDate) : null;
    tenancy.rent = {
      amount: rentAmount,
      dueDay: rentDueDay,
      paymentMethod: v.paymentMethod || "standing_order",
      reviewDate: reviewDate,
    };
    tenancy.deposit = v.depositTaken === "true"
      ? {
          ...previousDeposit,
          amount: parseFloat(v.depositAmount),
          scheme: v.depositScheme,
        }
      : { amount: 0, scheme: null, reference: null, protectedDate: null, prescribedInfoServedDate: null };
    tenancy.howToRent = v.howToRentServed === "true"
      ? {
          ...previousHowToRent,
          served: true,
          servedDate: new Date(v.howToRentDate),
          version: v.howToRentVersion || null,
        }
      : { served: false, servedDate: null, version: null, documentId: null };

    tenancy.updatedBy = user.userId || user._id;

    await tenancy.save();

    const previousServedDate = previousHowToRent?.servedDate ? new Date(previousHowToRent.servedDate).toISOString() : null;
    const nextServedDate = tenancy.howToRent?.servedDate ? new Date(tenancy.howToRent.servedDate).toISOString() : null;
    if (
      tenancy.howToRent?.served &&
      (
        !previousHowToRent?.served ||
        previousServedDate !== nextServedDate ||
        (previousHowToRent?.version || null) !== (tenancy.howToRent?.version || null)
      )
    ) {
      await logHowToRentServed(tenancy, user);
    }

    // Log deposit protection if protectedDate is newly set via edit
    // (The TenancyForm supports deposit fields; if deposit.protectedDate is submitted)
    const newProtectedDate = v.depositProtectedDate ? new Date(v.depositProtectedDate) : null;
    if (newProtectedDate && !previousDeposit?.protectedDate) {
      tenancy.deposit = { ...tenancy.deposit.toObject?.() ?? tenancy.deposit, protectedDate: newProtectedDate };
      await tenancy.save();
      await logDepositProtected(tenancy, user);
    }

    // Log prescribed info served if prescribedInfoServedDate is newly set via edit
    const newPrescribedDate = v.depositPrescribedInfoServedDate ? new Date(v.depositPrescribedInfoServedDate) : null;
    if (newPrescribedDate && !previousDeposit?.prescribedInfoServedDate) {
      tenancy.deposit = { ...tenancy.deposit.toObject?.() ?? tenancy.deposit, prescribedInfoServedDate: newPrescribedDate };
      await tenancy.save();
      await logPrescribedInfoServed(tenancy, user);
    }

    return redirect(`/tenancies/${tenancy._id}?success=updated`);

  } catch (err) {
    console.error("[tenancy/edit] action error:", err);
    return data(
      { error: `Failed to update tenancy: ${err.message}` },
      { status: 500 }
    );
  }
}

// ════════════════════════════════════════════════════════════════════════════════
// PAGE COMPONENT
// ════════════════════════════════════════════════════════════════════════════════

export default function EditTenancyPage() {
  const { tenancy, properties, tenants } = useLoaderData();
  const actionData = useActionData();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Edit Tenancy</h1>
        <p className="text-base text-gray-500">
          Update tenancy details. Compliance pre-flight checks will run automatically to keep the contract compliant.
        </p>
      </div>

      <TenancyForm
        mode="edit"
        properties={properties}
        tenants={tenants}
        actionData={actionData}
        errors={actionData?.errors || {}}
        isSubmitting={isSubmitting}
        initialData={tenancy}
      />
    </div>
  );
}

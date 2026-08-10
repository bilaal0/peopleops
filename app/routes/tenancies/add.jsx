// routes/tenancies/add.jsx
// SECTION 4: CREATE NEW TENANCY

import { useLoaderData, useActionData, useNavigation } from "react-router";
import { redirect, data } from "react-router";
import { getUserFromRequest } from "../../utils/auth.server.js";
import { connect } from "../../config/db.server.js";
import { Tenancy } from "../../models/tenancy.server.js";
import { Property } from "../../models/property.server.js";
import { User } from "../../models/user.server.js";
import { RentPayment } from "../../models/rentPayment.server.js";
import { generatePaymentPeriods } from "../../utils/rent-payment.js";
import { runTenancyPreFlight } from "../../utils/preflight.server.js";
import { validateTenancy } from "../../utils/validator.js";
import { TenancyForm } from "../../components/tenancy/TenancyForm.jsx";
import {
  logHowToRentServed,
  logPropertyStatusChanged,
  logTenancyCreated,
} from "../../utils/activityLog.server.js";

// ════════════════════════════════════════════════════════════════════════════════
// LOADER
// ════════════════════════════════════════════════════════════════════════════════

export async function loader({ request }) {
  const user = await getUserFromRequest(request);
  if (!user) return redirect("/login");
  if (!user.organizationId && !user.roles?.includes("SUPER_ADMIN")) {
    return redirect("/dashboard");
  }

  // Pre-select property if coming from property detail page:
  // /tenancies/add?propertyId=xxx
  const url = new URL(request.url);
  const preselectedPropertyId = url.searchParams.get("propertyId") || null;

  await connect();

  const organizationFilter = user.roles?.includes("SUPER_ADMIN")
    ? {}
    : { organizationId: user.organizationId };

  // Properties available for letting
  const properties = await Property.find({
    ...organizationFilter,
    deleted: false,
    status: { $in: ["available", "under_offer"] },
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
    preselectedPropertyId,
  };
}

// ════════════════════════════════════════════════════════════════════════════════
// ACTION
// ════════════════════════════════════════════════════════════════════════════════

export async function action({ request }) {
  const user = await getUserFromRequest(request);
  if (!user) return redirect("/login");
  if (!user.organizationId && !user.roles?.includes("SUPER_ADMIN")) {
    return redirect("/dashboard");
  }

  const formData = await request.formData();
  const v = Object.fromEntries(formData);

  // tenantIds can be multiple hidden inputs — use getAll
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
      return data({ error: "Landlord not resolved. Please re-select the property." }, { status: 400 });
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

    if (!preFlight.canCreate) {
      return data(
        {
          error: "Cannot create tenancy — compliance issues must be resolved first.",
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

    // ── STEP 5: Create Tenancy ────────────────────────────────────────────────

    const startDate = new Date(v.startDate);
    const reviewDate = new Date(startDate);
    reviewDate.setFullYear(reviewDate.getFullYear() + 1);

    const tenancy = await Tenancy.create({
      organizationId: user.organizationId,
      propertyId: property._id,
      landlordId: landlordId,
      tenantIds: tenantIds,
      tenancyType: v.tenancyType,
      startDate: startDate,
      endDate: v.tenancyType === "ast" && v.endDate ? new Date(v.endDate) : null,
      rent: {
        amount: rentAmount,
        dueDay: rentDueDay,
        paymentMethod: v.paymentMethod || "standing_order",
        reviewDate: reviewDate,
      },
      deposit: v.depositTaken === "true"
        ? { amount: parseFloat(v.depositAmount), scheme: v.depositScheme }
        : { amount: 0, scheme: null },
      howToRent: v.howToRentServed === "true"
        ? { served: true, servedDate: new Date(v.howToRentDate), version: v.howToRentVersion || null }
        : { served: false },
      status: "active",
      createdBy: user._id,
    });

    // ── STEP 6: Auto-generate Rent Payment Records (first 3 months) ───────────
    // generatePaymentPeriods is a pure sync function — returns array of docs.
    // insertMany writes them all in a single DB operation.
    // Non-fatal: if this fails, tenancy still stands — cron can backfill.

    await logTenancyCreated(tenancy, user);
    if (tenancy.howToRent?.served) {
      await logHowToRentServed(tenancy, user);
    }

    try {
      const payments = generatePaymentPeriods(tenancy, property, 3);
      await RentPayment.insertMany(payments);
    } catch (payErr) {
      console.error("[tenancy/add] Rent payment generation failed:", payErr.message);
    }

    // ── STEP 7: Update property status to 'let' ───────────────────────────────

    await Property.findByIdAndUpdate(property._id, {
      status: "let",
      updatedBy: user._id,
    });

    // ── STEP 8: Redirect ──────────────────────────────────────────────────────

    await logPropertyStatusChanged(
      { ...property, _id: property._id, organizationId: property.organizationId },
      property.status || "available",
      "let",
      user,
      { metadata: { tenancyId: tenancy._id } }
    );

    return redirect(`/tenancies/${tenancy._id}?success=created`);

  } catch (err) {
    console.error("[tenancy/add] action error:", err);
    return data(
      { error: `Failed to create tenancy: ${err.message}` },
      { status: 500 }
    );
  }
}

// ════════════════════════════════════════════════════════════════════════════════
// PAGE COMPONENT
// ════════════════════════════════════════════════════════════════════════════════

export default function AddTenancyPage() {
  const { properties, tenants, preselectedPropertyId } = useLoaderData();
  const actionData = useActionData();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">New Tenancy</h1>
        <p className="text-base text-gray-500">
          Create a new tenancy. Compliance checks and rent payment records will be
          automatically generated.
        </p>
      </div>

      <TenancyForm
        mode="create"
        properties={properties}
        tenants={tenants}
        actionData={actionData}
        errors={actionData?.errors || {}}
        isSubmitting={isSubmitting}
        initialData={preselectedPropertyId ? { propertyId: preselectedPropertyId } : null}
      />
    </div>
  );
}

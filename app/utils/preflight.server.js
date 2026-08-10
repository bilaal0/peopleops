// utils/preflight.server.js
// Compliance pre-flight checks for property and tenancy creation.
// runPropertyPreFlight is pure (no DB calls).
// runTenancyPreFlight is async and requires DB access — server-only.
import { User } from "../models/user.server.js";
import { Property } from "../models/property.server.js";
import { getRightToRentStatus } from "./compliance.js";
// Pure business logic — no DB calls, easy to test and update.
//
// Usage in loader:
//   const preFlight = runPropertyPreFlight(property);
//   return { property, preFlight };
//
// Usage in tenancy creation:
//   if (!preFlight.canCreateTenancy) return { error: preFlight.blocks[0].message };

export function runPropertyPreFlight(property) {
  const issues = [];

  // ── BLOCKS (prevent tenancy creation) ───────────────────────────────────

  // F or G rated without exemption
  if (
    (property.epcRating === "F" || property.epcRating === "G") &&
    !property.epcExemption
  ) {
    issues.push({
      severity: "block",
      field: "epcRating",
      message:
        "Property rated F or G cannot be legally let without a registered MEES exemption.",
    });
  }

  // EPC expired
  if (
    property.epcExpiryDate &&
    new Date(property.epcExpiryDate) < new Date()
  ) {
    issues.push({
      severity: "block",
      field: "epcExpiryDate",
      message: "EPC certificate has expired. Renewal required before letting.",
    });
  }

  // HMO without licence number
  if (property.propertyType === "hmo" && !property.hmoLicenceNo) {
    issues.push({
      severity: "block",
      field: "hmoLicenceNo",
      message: "HMO licence number required before tenancy can be created.",
    });
  }

  // HMO licence expired
  if (
    property.propertyType === "hmo" &&
    property.hmoLicenceExpiry &&
    new Date(property.hmoLicenceExpiry) < new Date()
  ) {
    issues.push({
      severity: "block",
      field: "hmoLicenceExpiry",
      message: "HMO licence has expired.",
    });
  }

  // Selective licence required but not provided
  if (property.selectiveLicenceRequired && !property.selectiveLicenceNo) {
    issues.push({
      severity: "block",
      field: "selectiveLicenceNo",
      message: "Selective licence required for this property.",
    });
  }

  // ── WARNINGS (informational, don't block) ──────────────────────────────

  // No EPC rating recorded
  if (!property.epcRating) {
    issues.push({
      severity: "warn",
      field: "epcRating",
      message:
        "No EPC rating recorded. Confirm rating before creating tenancy.",
    });
  }

  // EPC expiring within 30 days
  if (property.epcExpiryDate) {
    const daysUntilExpiry = Math.floor(
      (new Date(property.epcExpiryDate) - new Date()) / (1000 * 60 * 60 * 24)
    );
    if (daysUntilExpiry > 0 && daysUntilExpiry <= 30) {
      issues.push({
        severity: "warn",
        field: "epcExpiryDate",
        message: `EPC certificate expires in ${daysUntilExpiry} days.`,
      });
    }
  }

  // HMO licence expiring within 60 days
  if (property.propertyType === "hmo" && property.hmoLicenceExpiry) {
    const daysUntilExpiry = Math.floor(
      (new Date(property.hmoLicenceExpiry) - new Date()) /
        (1000 * 60 * 60 * 24)
    );
    if (daysUntilExpiry > 0 && daysUntilExpiry <= 60) {
      issues.push({
        severity: "warn",
        field: "hmoLicenceExpiry",
        message: `HMO licence expires in ${daysUntilExpiry} days.`,
      });
    }
  }

  // Selective licence expiring within 60 days
  if (
    property.selectiveLicenceRequired &&
    property.selectiveLicenceExpiry
  ) {
    const daysUntilExpiry = Math.floor(
      (new Date(property.selectiveLicenceExpiry) - new Date()) /
        (1000 * 60 * 60 * 24)
    );
    if (daysUntilExpiry > 0 && daysUntilExpiry <= 60) {
      issues.push({
        severity: "warn",
        field: "selectiveLicenceExpiry",
        message: `Selective licence expires in ${daysUntilExpiry} days.`,
      });
    }
  }

  return {
    canCreateTenancy:
      issues.filter((i) => i.severity === "block").length === 0,
    blocks: issues.filter((i) => i.severity === "block"),
    warnings: issues.filter((i) => i.severity === "warn"),
  };
}

// ── Full tenancy creation pre-flight ─────────────────────────────────────────
// Async: fetches landlord, property, and all tenants from DB.
// Returns canCreate: true/false plus blocks and warnings arrays.
//
// Usage in action:
//   const { canCreate, blocks, warnings } = await runTenancyPreFlight(
//     propertyId, landlordId, tenantIds, organizationId
//   );
//   if (!canCreate) return data({ errors: { preflight: blocks } }, { status: 400 });

export async function runTenancyPreFlight(propertyId, landlordId, tenantIds, organizationId) {
  const blocks   = [];
  const warnings = [];

  // ── 1. Fetch landlord ──────────────────────────────────────────────────────
  const landlord = await User.findOne({
    _id: landlordId,
    organizationId,
    roles: "LANDLORD",
  }).lean();

  if (!landlord) {
    blocks.push({ field: "landlordId", message: "Landlord not found." });
  } else {
    // AML must be passed
    if (landlord.landlordData?.amlResult !== "pass") {
      blocks.push({
        field:   "landlordAml",
        message: `AML check not passed for ${landlord.title ? landlord.title + ' ' : ''}${landlord.firstName} ${landlord.lastName}. Complete AML before creating a tenancy.`,
        fixLink: `/landlords/${landlordId}?tab=aml`,
      });
    }
    // PEP flagged — warning only
    if (landlord.landlordData?.pepResult === "flagged") {
      warnings.push({
        field:   "landlordPep",
        message: `${landlord.title ? landlord.title + ' ' : ''}${landlord.firstName} ${landlord.lastName} is flagged as a Politically Exposed Person.`,
      });
    }
  }

  // ── 2. Fetch property ──────────────────────────────────────────────────────
  const property = await Property.findOne({
    _id: propertyId,
    organizationId,
    deleted: false,
  }).lean();

  if (!property) {
    blocks.push({ field: "propertyId", message: "Property not found." });
  } else {
    // Reuse existing property pre-flight (EPC, HMO, licences etc.)
    const propResult = runPropertyPreFlight(property);
    blocks.push(...propResult.blocks);
    warnings.push(...propResult.warnings);

    // Property must be available or under_offer
    if (!["available", "under_offer"].includes(property.status)) {
      blocks.push({
        field:   "propertyStatus",
        message: `Property status is '${property.status}'. Only available or under offer properties can have a new tenancy created.`,
      });
    }
  }

  // ── 3. Check each tenant ───────────────────────────────────────────────────
  for (const tenantId of tenantIds) {
    const tenant = await User.findOne({
      _id: tenantId,
      organizationId,
      roles: "TENANT",
    }).lean();

    if (!tenant) {
      blocks.push({ field: "tenantIds", message: `Tenant not found: ${tenantId}` });
      continue;
    }

    // Right to Rent gate (hard block)
    const rtrStatus = getRightToRentStatus(tenant);
    if (!rtrStatus.canRent) {
      blocks.push({
        field:   "rightToRent",
        message: `Right to Rent not valid for ${tenant.title ? tenant.title + ' ' : ''}${tenant.firstName} ${tenant.lastName}. ${rtrStatus.message}`,
        fixLink: `/tenants/${tenantId}`,
      });
    }

    // Referencing failure — warning only (guarantor may cover it)
    if (tenant.tenantData?.referencingPassed === false) {
      warnings.push({
        field:   "referencing",
        message: `${tenant.title ? tenant.title + ' ' : ''}${tenant.firstName} ${tenant.lastName} failed referencing. Ensure a guarantor is in place if proceeding.`,
      });
    }
    if (tenant.tenantData?.referencingPassed === null) {
      warnings.push({
        field:   "referencing",
        message: `Referencing not completed for ${tenant.title ? tenant.title + ' ' : ''}${tenant.firstName} ${tenant.lastName}.`,
      });
    }
  }

  // ── 4. HMO occupancy check ─────────────────────────────────────────────────
  if (property?.propertyType === "hmo" && property.hmoMaxOccupants) {
    const totalOccupants = await getTotalOccupants(tenantIds);
    if (totalOccupants > property.hmoMaxOccupants) {
      blocks.push({
        field:   "hmoOccupancy",
        message: `Total occupants (${totalOccupants}) exceeds HMO licence limit of ${property.hmoMaxOccupants}.`,
      });
    }
  }

  return {
    canCreate: blocks.length === 0,
    blocks,
    warnings,
  };
}

// ── Helper: sum expected occupants across all selected tenants ────────────────
async function getTotalOccupants(tenantIds) {
  const tenants = await User.find({ _id: { $in: tenantIds } })
    .select("tenantData.numberOfOccupants")
    .lean();
  return tenants.reduce((sum, t) => sum + (t.tenantData?.numberOfOccupants || 1), 0);
}

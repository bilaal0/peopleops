// services/obligationEngine.server.js
// Core compliance engine — seeds obligations when a tenancy is created
// and recalculates overdue statuses for the cron job

import { connect } from "../config/db.server.js";
import { ObligationType } from "../models/obligationType.server.js";
import { Obligation } from "../models/obligation.server.js";
import { User } from "../models/user.server.js";
import { AuditLog } from "../models/auditLog.server.js";

/**
 * Seed all compliance obligations for a newly created tenancy.
 * Called immediately after a Tenancy document is saved.
 *
 * @param {Object} tenancy - The saved Tenancy document
 * @param {string} userId  - ID of the user who created the tenancy
 * @param {string} ipAddress - Request IP for audit log
 */
export async function seedObligationsForTenancy(tenancy, userId, ipAddress) {
  await connect();

  const startDate = new Date(tenancy.startDate);

  // Fetch all active obligation types (pre-tenancy + during stages)
  const types = await ObligationType.find({
    active: true,
    stage: { $in: ["pre_tenancy", "during"] },
    $or: [{ appliesTo: "all" }, { appliesTo: tenancy.propertyType || "standard" }],
  }).lean();

  const tenantUser = await User.findById(tenancy.tenantIds?.[0]).lean();

  const obligations = types.map((type) => {
    let dueDate = null;

    if (type.key === "right_to_rent_recheck") {
      if (tenantUser?.tenantData?.rightToRentExpiry) {
        dueDate = new Date(tenantUser.tenantData.rightToRentExpiry);
        dueDate.setDate(dueDate.getDate() - 28);
      } else {
        // No expiry means unlimited right to rent - no recheck needed
        return null;
      }
    } else if (type.frequencyDays) {
      dueDate = new Date(startDate);
      dueDate.setDate(dueDate.getDate() + type.frequencyDays);
    } else {
      // One-time obligations at tenancy start (e.g. deposit protection = start + 30 days)
      dueDate = getDueDateForOneTimeObligation(type.key, startDate);
    }

    return {
      organizationId: tenancy.organizationId,
      tenancyId: tenancy._id,
      obligationTypeId: type._id,
      dueDate,
      status: "pending",
    };
  }).filter(Boolean);

  if (obligations.length === 0) return;

  await Obligation.insertMany(obligations);

  // Write to immutable audit log
  await AuditLog.create({
    organizationId: tenancy.organizationId,
    tenancyId: tenancy._id,
    userId,
    action: "tenancy_created",
    entityType: "Tenancy",
    entityId: tenancy._id,
    metadata: {
      obligationCount: obligations.length,
      startDate: tenancy.startDate,
      rentPcm: tenancy.rentPcm,
    },
    ipAddress,
  });

  return obligations.length;
}

/**
 * Due date rules for one-time obligations (no frequencyDays set).
 * Based on the AgentShield obligation map.
 */
function getDueDateForOneTimeObligation(key, startDate) {
  const start = new Date(startDate);
  switch (key) {
    case "deposit_protected":
      // Must be protected within 30 days of tenancy start
      return addDays(start, 30);
    case "prescribed_information_served":
      // Must be served alongside deposit protection
      return addDays(start, 30);
    case "right_to_rent_check":
    case "aml_source_of_funds":
    case "tenancy_agreement_signed_first":
    case "rent_in_advance_cap":
    case "no_fixed_term_clause":
    case "how_to_rent_guide":
    case "smoke_co_alarms":
    case "legionella_risk_assessment":
      // All pre-tenancy checks — due at or before start
      return start;
    case "tenant_info_sheet":
      // All existing tenants — government deadline 31 May 2026
      const deadline = new Date("2026-05-31");
      return start > deadline ? start : deadline;
    default:
      return start;
  }
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Recalculate obligation statuses — called by cron job (hourly).
 * Marks obligations as 'overdue' when past their due date.
 * Returns counts for monitoring.
 */
export async function recalculateOverdueObligations() {
  await connect();
  const now = new Date();

  const result = await Obligation.updateMany(
    {
      status: "pending",
      dueDate: { $lt: now },
    },
    {
      $set: { status: "overdue", updatedAt: now },
    }
  );

  return {
    markedOverdue: result.modifiedCount,
    timestamp: now.toISOString(),
  };
}

/**
 * Log an obligation declaration — called from the obligation log action.
 * Updates obligation status and writes to audit log.
 */
export async function logObligation({
  obligationId,
  userId,
  organizationId,
  tenancyId,
  declarationText,
  ipAddress,
}) {
  await connect();

  const obligation = await Obligation.findOneAndUpdate(
    { _id: obligationId, organizationId }, // Organization scope — cannot log another organization's obligation
    {
      $set: {
        status: "logged",
        declaredBy: userId,
        declaredAt: new Date(),
        declarationText,
      },
    },
    { new: true }
  );

  if (!obligation) {
    throw new Error("Obligation not found or access denied.");
  }

  // If this is a recurring obligation, seed the next occurrence
  const obligationType = await ObligationType.findById(obligation.obligationTypeId).lean();
  if (obligationType?.frequencyDays && obligation.dueDate) {
    const nextDueDate = addDays(obligation.dueDate, obligationType.frequencyDays);
    await obligation.updateOne({ $set: { nextDueDate } });

    // Create the next obligation instance
    await Obligation.create({
      organizationId,
      tenancyId,
      obligationTypeId: obligation.obligationTypeId,
      dueDate: nextDueDate,
      status: "pending",
    });
  }

  // Write to audit log (immutable)
  await AuditLog.create({
    organizationId,
    tenancyId,
    userId,
    action: "obligation_logged",
    entityType: "Obligation",
    entityId: obligation._id,
    metadata: {
      obligationTypeId: obligation.obligationTypeId,
      declarationText,
      dueDate: obligation.dueDate,
    },
    ipAddress,
  });

  return obligation;
}

/**
 * Get portfolio risk summary for an organization.
 * Used on the compliance dashboard.
 */
export async function getPortfolioRiskSummary(organizationId) {
  await connect();

  const [pending, overdue, logged] = await Promise.all([
    Obligation.countDocuments({ organizationId, status: "pending" }),
    Obligation.countDocuments({ organizationId, status: "overdue" }),
    Obligation.countDocuments({ organizationId, status: "logged" }),
  ]);

  // Calculate estimated fine exposure from overdue obligations
  const overdueWithTypes = await Obligation.find({ organizationId, status: "overdue" })
    .populate("obligationTypeId", "fineMaxGbp")
    .lean();

  const estimatedFineExposure = overdueWithTypes.reduce((sum, ob) => {
    return sum + (ob.obligationTypeId?.fineMaxGbp || 0);
  }, 0);

  return {
    pending,
    overdue,
    logged,
    total: pending + overdue + logged,
    estimatedFineExposure,
    complianceScore:
      pending + overdue + logged > 0
        ? Math.round((logged / (pending + overdue + logged)) * 100)
        : 100,
  };
}

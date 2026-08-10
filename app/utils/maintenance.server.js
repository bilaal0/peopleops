// utils/maintenance.server.js
// Helper functions for the Maintenance module.
// All business logic lives here — routes stay thin.
//
// Rules enforced here (from spec Section 12):
//   R2: jobRef is always auto-generated — never set manually
//   R3: Awaab's Law is auto-detected — set here, never in UI
//   R8: No compliance language — "job", "works order", "record"

import { connect } from "../config/db.server.js";
import { MaintenanceJob } from "../models/MaintenanceJob.server.js";
import { PlannedMaintenanceSchedule } from "../models/PlannedMaintenanceSchedule.server.js";
import { logMaintenanceStatusChanged } from "./activityLog.server.js";

// ─────────────────────────────────────────────────────────────
// JOB REFERENCE AUTO-GENERATION
// Format: MJ-YYYY-NNNN  (e.g. MJ-2026-0001)
// Sequential per organization. Pads to 4 digits.
// ─────────────────────────────────────────────────────────────
export async function generateJobRef(organizationId) {
  const currentYear = new Date().getFullYear();

  const last = await MaintenanceJob.findOne(
    { organizationId, jobRef: { $regex: `^MJ-${currentYear}-` } },
    { jobRef: 1 },
    { sort: { createdAt: -1 } }
  ).lean();

  if (!last) {
    return `MJ-${currentYear}-0001`;
  }

  const parts = last.jobRef.split("-");
  const lastNum = parseInt(parts[2], 10);
  const nextNum = String(lastNum + 1).padStart(4, "0");
  return `MJ-${currentYear}-${nextNum}`;
}

// ─────────────────────────────────────────────────────────────
// TARGET DATE AUTO-SUGGESTION
// Called in the create action. Agent can override after.
// emergency: +1 day
// urgent:    +5 days
// routine:   +28 days
// planned:   pass scheduledDate explicitly
// ─────────────────────────────────────────────────────────────
export function calculateTargetDate(priority, reportedDate) {
  const base = reportedDate ? new Date(reportedDate) : new Date();
  base.setHours(0, 0, 0, 0);

  switch (priority) {
    case "emergency":
      return new Date(base.getTime() + 1 * 24 * 60 * 60 * 1000);
    case "urgent":
      return new Date(base.getTime() + 5 * 24 * 60 * 60 * 1000);
    case "routine":
      return new Date(base.getTime() + 28 * 24 * 60 * 60 * 1000);
    case "planned":
    default:
      return null; // planned jobs use scheduledDate from the schedule
  }
}

// ─────────────────────────────────────────────────────────────
// AWAAB'S LAW AUTO-FLAG
// Called in the create action — never toggleable from the UI.
// When category === 'damp_mould':
//   - isAwaabsLaw = true
//   - awaabsLawInvestigationDeadline = reportedDate + 14 days
//   - priority upgraded to minimum 'urgent'
// Once set, isAwaabsLaw is never set back to false.
// ─────────────────────────────────────────────────────────────
export function applyAwaabsLawFlags(jobData) {
  if (jobData.category !== "damp_mould") {
    return jobData;
  }

  const base = jobData.reportedDate ? new Date(jobData.reportedDate) : new Date();
  base.setHours(0, 0, 0, 0);

  const priorityRank = { emergency: 3, urgent: 2, routine: 1, planned: 0 };
  const currentRank = priorityRank[jobData.priority] ?? 1;
  const urgentRank  = priorityRank["urgent"];

  return {
    ...jobData,
    isAwaabsLaw: true,
    awaabsLawInvestigationDeadline: new Date(base.getTime() + 14 * 24 * 60 * 60 * 1000),
    // Upgrade priority to at least 'urgent'; never downgrade emergency
    priority: currentRank >= urgentRank ? jobData.priority : "urgent",
  };
}

// ─────────────────────────────────────────────────────────────
// LANDLORD APPROVAL AUTO-FLAG
// If estimatedCost exceeds the organization threshold (default £500),
// the job requires landlord approval before works begin.
// ─────────────────────────────────────────────────────────────
export function applyLandlordApprovalFlag(jobData, organizationThreshold = 500) {
  const cost = parseFloat(jobData.estimatedCost);
  if (!isNaN(cost) && cost > organizationThreshold) {
    return {
      ...jobData,
      requiresLandlordApproval: true,
      landlordApprovalStatus: "pending",
      status: "landlord_approval",
    };
  }
  return jobData;
}

// ─────────────────────────────────────────────────────────────
// NEXT DUE DATE CALCULATION FOR PLANNED SCHEDULES
// Used by the cron route to update nextDueDate after job creation.
// ─────────────────────────────────────────────────────────────
export function calculateNextDueDate(currentDate, frequency, customDays) {
  const date = new Date(currentDate);

  switch (frequency) {
    case "monthly":   date.setMonth(date.getMonth() + 1);         break;
    case "quarterly": date.setMonth(date.getMonth() + 3);         break;
    case "6_monthly": date.setMonth(date.getMonth() + 6);         break;
    case "annual":    date.setFullYear(date.getFullYear() + 1);   break;
    case "2_yearly":  date.setFullYear(date.getFullYear() + 2);   break;
    case "5_yearly":  date.setFullYear(date.getFullYear() + 5);   break;
    case "10_yearly": date.setFullYear(date.getFullYear() + 10);  break;
    case "custom":
      date.setDate(date.getDate() + (customDays || 30));
      break;
    default:
      date.setFullYear(date.getFullYear() + 1); // fallback: annual
  }

  return date;
}

// ─────────────────────────────────────────────────────────────
// STATUS CHANGE — creates an audit Note automatically
// Rule R4: every status change must create a Note record.
// ─────────────────────────────────────────────────────────────
export async function recordStatusChange(job, newStatus, user, extraNote = null) {
  const statusLabels = {
    reported:            "Reported",
    landlord_approval:   "Awaiting Landlord Approval",
    approved:            "Approved",
    contractor_assigned: "Contractor Assigned",
    in_progress:         "In Progress",
    completed:           "Completed",
    closed:              "Closed",
    cancelled:           "Cancelled",
    on_hold:             "On Hold",
  };

  const label = statusLabels[newStatus] || newStatus;
  const noteText = extraNote
    ? `Status updated to "${label}" by ${user.title ? user.title + ' ' : ''}${user.firstName} ${user.lastName}. ${extraNote}`
    : `Status updated to "${label}" by ${user.title ? user.title + ' ' : ''}${user.firstName} ${user.lastName}.`;

  await logMaintenanceStatusChanged(job, newStatus, user, {
    metadata: { note: extraNote || null, label },
  });
}

// ─────────────────────────────────────────────────────────────
// DASHBOARD SUMMARY QUERY
// Used by dashboard.server.js to populate the Maintenance card.
// Returns: open count, emergency jobs, overdue jobs, awaabs jobs.
// ─────────────────────────────────────────────────────────────
export async function getMaintenanceSummaryForOrganization(organizationId) {
  await connect();

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [
    openJobs,
    emergencyJobs,
    overdueJobs,
    awaabsJobs,
    completedLast30,
  ] = await Promise.all([
    // Open: any status that is not closed or cancelled
    MaintenanceJob.countDocuments({
      organizationId,
      status: { $nin: ["closed", "cancelled"] },
      deleted: false,
    }),

    // Emergency: priority=emergency and not closed
    MaintenanceJob.find({
      organizationId,
      priority: "emergency",
      status: { $nin: ["closed", "cancelled"] },
      deleted: false,
    })
      .populate("propertyId", "addressLine1")
      .select("jobRef title propertyId status targetDate")
      .sort({ targetDate: 1 })
      .limit(5)
      .lean(),

    // Overdue: past targetDate, not closed or cancelled
    MaintenanceJob.find({
      organizationId,
      targetDate: { $lt: today },
      status: { $nin: ["closed", "cancelled"] },
      deleted: false,
    })
      .populate("propertyId", "addressLine1")
      .select("jobRef title propertyId status targetDate priority")
      .sort({ targetDate: 1 })
      .limit(5)
      .lean(),

    // Awaab's Law: active damp/mould jobs not closed
    MaintenanceJob.find({
      organizationId,
      isAwaabsLaw: true,
      status: { $nin: ["closed", "cancelled"] },
      deleted: false,
    })
      .populate("propertyId", "addressLine1")
      .select("jobRef title propertyId status awaabsLawInvestigationDeadline")
      .sort({ awaabsLawInvestigationDeadline: 1 })
      .lean(),

    // Completed in last 30 days
    MaintenanceJob.countDocuments({
      organizationId,
      status: { $in: ["completed", "closed"] },
      completedDate: { $gte: thirtyDaysAgo },
      deleted: false,
    }),
  ]);

  return {
    openJobs,
    emergencyJobs,
    overdueJobs,
    awaabsJobs,
    completedLast30,
  };
}

// ─────────────────────────────────────────────────────────────
// PLANNED MAINTENANCE AUTO-GENERATION
// Called by /api/maintenance/run-cron route (Step 9).
// Finds schedules due within daysBeforeDue, creates jobs.
// Checks for duplicates — never creates a job if one already
// exists for this schedule in the current month.
// ─────────────────────────────────────────────────────────────
export async function generatePlannedMaintenanceJobs() {
  await connect();

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

  // Fetch all active auto-generate schedules
  const schedules = await PlannedMaintenanceSchedule.find({
    active: true,
    autoGenerate: true,
    deleted: false,
  }).lean();

  let created = 0;
  let skipped = 0;

  for (const schedule of schedules) {
    // Check if nextDueDate is within the schedule's daysBeforeDue window
    const windowDate = new Date(
      today.getTime() + (schedule.daysBeforeDue || 30) * 24 * 60 * 60 * 1000
    );
    if (new Date(schedule.nextDueDate) > windowDate) {
      skipped++;
      continue;
    }

    // Check for existing job in current month for this schedule (duplicate guard)
    const existingJob = await MaintenanceJob.findOne({
      plannedScheduleId: schedule._id,
      reportedDate: { $gte: startOfMonth },
      deleted: false,
    }).lean();

    if (existingJob) {
      skipped++;
      continue;
    }

    // Auto-generate the job
    const jobRef = await generateJobRef(schedule.organizationId);

    const jobData = applyAwaabsLawFlags({
      organizationId:            schedule.organizationId,
      jobRef,
      propertyId:          schedule.propertyId,
      landlordId:          schedule.landlordId,
      contractorId:        schedule.preferredContractorId || null,
      category:            schedule.category,
      title:               schedule.title,
      description:         schedule.description,
      priority:            "planned",
      reportedBy:          "system",
      reportedDate:        today,
      status:              "reported",
      targetDate:          schedule.nextDueDate,
      estimatedCost:       schedule.estimatedCost,
      isPlannedMaintenance: true,
      plannedScheduleId:   schedule._id,
      createdBy:           schedule.createdBy,
    });

    await MaintenanceJob.create(jobData);

    // Update nextDueDate on the schedule
    const nextDate = calculateNextDueDate(
      schedule.nextDueDate,
      schedule.frequency,
      schedule.frequencyDays
    );

    await PlannedMaintenanceSchedule.findByIdAndUpdate(
      schedule._id,
      { nextDueDate: nextDate }
    );

    created++;
  }

  return { created, skipped };
}

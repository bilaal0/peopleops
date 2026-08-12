// utils/dashboard.server.js
// Fetch and format all data for the Organization Dashboard (PeopleOps).

import { connect } from "../config/db.server.js";
import { User } from "../models/user.server.js";
import { Document } from "../models/document.server.js";
import { Rota } from "../models/rota.server.js";

export async function getOrganizationDashboardData(organizationId) {
  await connect();

  const staffRoles = ["EMPLOYEE", "REGISTERED_MANAGER", "ADMIN", "INITIAL_ADMIN", "MASTER_ADMIN", "SUPER_ADMIN"];

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const [
    staffCount,
    clientCount,
    documentCount,
    todayRota
  ] = await Promise.all([
    User.countDocuments({ organizationId, deleted: false, roles: { $in: staffRoles } }),
    User.countDocuments({ organizationId, deleted: false, roles: "CLIENT" }),
    Document.countDocuments({ organizationId, deleted: false }),
    Rota.find({ 
      organizationId, 
      deleted: false,
      date: { $gte: todayStart, $lte: todayEnd }
    })
      .populate("employee", "firstName lastName")
      .populate("assignedTo", "firstName lastName")
      .sort({ startTime: 1 })
      .lean()
  ]);

  return {
    onboarding: false,
    stats: {
      staffCount,
      clientCount,
      documentCount,
    },
    todayRota: todayRota.map(shift => ({
      _id: shift._id.toString(),
      title: shift.title || "Shift",
      startTime: shift.startTime,
      endTime: shift.endTime,
      employee: shift.employee ? `${shift.employee.firstName} ${shift.employee.lastName}` : shift.employeeName,
      assignedTo: shift.assignedTo ? `${shift.assignedTo.firstName} ${shift.assignedTo.lastName}` : shift.assignedToName,
    })),
  };
}

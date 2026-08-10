// utils/notes.server.js
import { Property } from "../models/property.server.js";
import { User } from "../models/user.server.js";
import { Tenancy } from "../models/tenancy.server.js";
import { MaintenanceJob } from "../models/MaintenanceJob.server.js";
import { Contractor } from "../models/Contractor.server.js";
import { Note } from "../models/note.server.js";

export async function verifyEntityOrganization(entityType, entityId, organizationId) {
  switch (entityType) {
    case "property": {
      const property = await Property.findOne({
        _id: entityId,
        organizationId,
        deleted: false,
      }).lean();
      return !!property;
    }

    case "landlord": {
      // entityId is the User._id of the landlord
      const landlord = await User.findOne({
        _id: entityId,
        organizationId,
        roles: "LANDLORD",
      }).lean();
      return !!landlord;
    }

    case "tenant": {
      // Complete when tenant module is built
      const tenant = await User.findOne({
        _id: entityId,
        organizationId,
        roles: "TENANT",
      }).lean();
      return !!tenant;
    }

    case "tenancy": {
      const tenancy = await Tenancy.findOne({
        _id: entityId,
        organizationId,
        deleted: false,
      }).lean();
      return !!tenancy;
    }

    case "maintenance_job": {
      const job = await MaintenanceJob.findOne({
        _id: entityId,
        organizationId,
        deleted: false,
      }).lean();
      return !!job;
    }

    case "contractor": {
      const contractor = await Contractor.findOne({
        _id: entityId,
        organizationId,
        deleted: false,
      }).lean();
      return !!contractor;
    }

    default:
      return false;
  }
}

export async function getNotesForEntity(entityType, entityId, organizationId, page = 1) {
  const limit = 10;

  const [notes, total] = await Promise.all([
    Note.find({ organizationId, entityType, entityId })
      .populate("addedBy", "title firstName lastName email")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),

    Note.countDocuments({ organizationId, entityType, entityId }),
  ]);

  return {
    notes: notes.map((n) => ({
      ...n,
      _id: n._id.toString(),
      eventType: n.eventType || null,
      isSystem: Boolean(n.isSystem),
      metadata: n.metadata || null,
      isInternal: Boolean(n.isInternal),
      addedBy: n.addedBy
        ? {
            firstName: n.addedBy.firstName,
            lastName: n.addedBy.lastName,
            email: n.addedBy.email,
            _id: n.addedBy._id.toString(),
          }
        : null,
      organizationId: n.organizationId?.toString(),
      entityId: n.entityId?.toString(),
    })),
    total,
    hasMore: total > page * limit,
    page,
  };
}

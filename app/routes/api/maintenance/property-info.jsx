// routes/api/maintenance/property-info.jsx
// Helper API endpoint to query active tenancy & landlord details for a property.
// Triggered on property selection in the "New Job" form to auto-populate links.

import { getUserFromRequest } from "../../../utils/auth.server.js";
import { connect } from "../../../config/db.server.js";
import { Property } from "../../../models/property.server.js";
import { Tenancy } from "../../../models/tenancy.server.js";
import { User } from "../../../models/user.server.js";

const jsonResponse = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export async function loader({ request }) {
  const user = await getUserFromRequest(request);
  if (!user) return jsonResponse({ error: "Unauthorized" }, 401);
  if (!user.organizationId) return jsonResponse({ error: "Organization scoping required" }, 403);

  const url = new URL(request.url);
  const propertyId = url.searchParams.get("propertyId")?.trim();

  if (!propertyId || propertyId.length !== 24) {
    return jsonResponse({ error: "Invalid or missing propertyId" }, 400);
  }

  try {
    await connect();

    // Scoped property query
    const property = await Property.findOne({
      _id: propertyId,
      organizationId: user.organizationId,
      deleted: { $ne: true },
    }).lean();

    if (!property) {
      return jsonResponse({ error: "Property not found" }, 404);
    }

    // Get landlord details
    const landlord = await User.findOne({
      _id: property.landlordId,
      organizationId: user.organizationId,
      deleted: { $ne: true },
    }).select("title firstName lastName").lean();

    // Get active tenancy
    const activeTenancy = await Tenancy.findOne({
      propertyId: property._id,
      organizationId: user.organizationId,
      status: "active",
    })
      .populate("tenantIds", "title firstName lastName")
      .lean();

    const responseData = {
      landlordId: property.landlordId.toString(),
      landlordName: landlord ? `${landlord.title ? landlord.title + ' ' : ''}${landlord.firstName} ${landlord.lastName}` : "Unknown Landlord",
      tenancyId: activeTenancy ? activeTenancy._id.toString() : null,
      tenantNames: activeTenancy && activeTenancy.tenantIds?.length > 0
        ? activeTenancy.tenantIds.map(t => `${t.title ? t.title + ' ' : ''}${t.firstName} ${t.lastName}`).join(", ")
        : null,
    };

    return jsonResponse(responseData);
  } catch (err) {
    console.error("Error retrieving property info:", err);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
}

// routes/tenants/delete.jsx — Archive Tenant
import { getUserFromRequest } from "../../utils/auth.server.js";
import { redirect, data } from "react-router";
import { User } from "../../models/user.server.js";
import { Tenancy } from "../../models/tenancy.server.js";
import { connect } from "../../config/db.server.js";

export async function action({ request, params }) {
  if (request.method !== "POST") {
    return redirect(`/tenants/${params.id}`);
  }

  const user = await getUserFromRequest(request);
  if (!user) return redirect("/login");
  
  // Must be SUPER_ADMIN
  if (!user.roles?.includes("SUPER_ADMIN")) {
    return redirect(`/tenants/${params.id}`);
  }

  await connect();

  // Check if tenant has any active tenancies
  const activeTenancy = await Tenancy.findOne({ 
    tenantIds: params.id, 
    status: "active",
    deleted: false 
  }).lean();

  if (activeTenancy) {
    // Ideally we'd flash an error here, but standard redirect with error param works too
    return redirect(`/tenants/${params.id}?error=active_tenancy`);
  }

  // Soft delete (archive)
  await User.findOneAndUpdate(
    { _id: params.id, roles: "TENANT" },
    { 
      status: "archived", 
      updatedBy: user.userId 
    }
  );

  return redirect("/tenants?success=archived");
}

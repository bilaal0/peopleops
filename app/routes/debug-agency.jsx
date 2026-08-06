import { getUserFromRequest } from "../utils/auth.server.js";
import { connect } from "../config/db.server.js";
import { User } from "../models/user.server.js";
import { Agency } from "../models/agency.server.js";

export async function loader({ request }) {
  const sessionUser = await getUserFromRequest(request);
  if (!sessionUser) return new Response("Not logged in");

  await connect();
  const dbUser = await User.findById(sessionUser.userId).lean();
  let org = null;
  if (dbUser.agencyId) {
    org = await Agency.findById(dbUser.agencyId).lean();
  }

  return new Response(JSON.stringify({
    session_agencyId: sessionUser.agencyId,
    db_agencyId: dbUser.agencyId,
    db_org_found: !!org,
    org_name: org?.name
  }, null, 2), {
    headers: { "Content-Type": "application/json" }
  });
}

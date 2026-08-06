import { redirect } from "react-router";
import { getUserFromRequest } from "../../../utils/auth.server.js";
import { User } from "../../../models/user.server.js";
import { connect } from "../../../config/db.server.js";

export async function action({ params, request }) {
  const user = await getUserFromRequest(request);
  if (!user) return redirect("/login");

  await connect();

  await User.findByIdAndUpdate(params.id, { deleted: true });

  return redirect("/user-accounts/client");
}

export async function loader() {
  return redirect("/user-accounts/client");
}

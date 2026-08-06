import { redirect } from "react-router";

// GET -> just bounce (avoid logging out via GET to prevent CSRF)
export function loader() {
  return redirect("/");
}

// POST -> destroy session and redirect to login
export async function action({ request }) {
  const { destroyUserSessionRedirect } = await import("../../utils/auth.server.js");
  return await destroyUserSessionRedirect(request, "/login");
}

export default null;

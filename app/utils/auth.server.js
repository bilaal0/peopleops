// utils/auth.server.js
// utils/auth.server.js
// Auth + session utilities for React Router server (@react-router/node)
// - Uses bcryptjs.compare to verify passwords
// - Stores only minimal claims (userId, roles) in the cookie
//   Security: don’t put email/name/etc. in the cookie
//   Size: keep cookie small (cookies ~4KB limit)

import { createCookieSessionStorage, redirect } from "react-router";
import { compare } from "bcryptjs";
import { User } from "../models/user.server.js";
import { connect } from "../config/db.server.js";
import * as dotenv from "dotenv";
dotenv.config();

const SESSION_SECRET = process.env.SESSION_SECRET || (process.env.NODE_ENV !== "production" ? "proplet-default-dev-session-secret-key-12345" : undefined);
if (!SESSION_SECRET) throw new Error("SESSION_SECRET is missing. Please define SESSION_SECRET in your .env file.");

// Cookie session storage (id-only)
export const sessionStorage = createCookieSessionStorage({
  cookie: {
    name: "__session",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    secrets: [SESSION_SECRET],
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  },
});
export const { getSession, commitSession, destroySession } = sessionStorage;

// Helper to read the cookie header from either Web Request or Express req
function getCookieHeader(reqOrRequest) {
  if (typeof Request !== "undefined" && reqOrRequest instanceof Request) {
    return reqOrRequest.headers.get("cookie");
  }
  return reqOrRequest?.headers?.cookie;
}

/* =========================
   Session: minimal claims
   ========================= */

export async function getUserFromRequest(reqOrRequest) {
  const session = await getSession(getCookieHeader(reqOrRequest));
  const userId = session.get("userId");
  const roles = session.get("roles") || [];
  let agencyId = session.get("agencyId") || null;

  if (!userId) return null;

  // If agencyId is missing from the session (e.g. existing account pre-dating
  // the Agency flow), look it up from the DB and return it.
  // The session cookie itself is NOT rewritten here — that happens on next login.
  if (!agencyId) {
    try {
      await connect();
      const user = await User.findById(userId).select("agencyId").lean();
      if (user?.agencyId) agencyId = String(user.agencyId);
    } catch {
      // Non-fatal — proceed without agencyId
    }
  }

  return { userId: String(userId), roles, agencyId };
}


export async function getUserFromRequestOrRedirect(reqOrRequest, redirectTo = "/login") {
  const claims = await getUserFromRequest(reqOrRequest);
  if (!claims) throw redirect(redirectTo);
  return claims;
}

/* =========================
   Full user (DB load)
   ========================= */

export async function getUserFromSession(reqOrRequest) {
  const claims = await getUserFromRequest(reqOrRequest);
  if (!claims) return null;

  await connect(); // Ensure DB is connected
  const user = await User.findOne({ _id: claims.userId, deleted: { $ne: true } }).lean();
  if (!user) return null;

  // Derived fields
  const firstName = user.firstName || "";
  const lastName = user.lastName || "";
  user.fullName = `${firstName} ${lastName}`.trim();
  user.initials = `${firstName[0] || ""}${lastName[0] || ""}`.toUpperCase();

  // Optional: enrich with organisation details
  user.org = {};

  // Never expose password
  delete user.password;
  return user;
}

export async function requireUserSession(reqOrRequest, redirectTo = "/login") {
  const user = await getUserFromSession(reqOrRequest);
  if (!user) throw redirect(redirectTo);
  return user;
}

export async function requireUserRole(reqOrRequest, role, redirectTo = "/login") {
  const user = await requireUserSession(reqOrRequest, redirectTo);
  const roles = Array.isArray(user.roles) ? user.roles : [];
  if (!roles.includes(role)) throw redirect(redirectTo);
  return user;
}

/* =========================
   Create / Destroy session
   ========================= */

export async function createUserSessionHeaders({ userId, roles = [], agencyId = null, remember = true }) {
  const session = await getSession();
  session.set("userId", String(userId));
  session.set("roles", roles);
  if (agencyId) session.set("agencyId", String(agencyId));

  const cookie = await commitSession(session, {
    maxAge: remember ? 60 * 60 * 24 * 30 : undefined,
  });

  return { "Set-Cookie": cookie };
}

export async function createUserSessionRedirect({
  userId,
  roles = [],
  agencyId = null,
  remember = true,
  redirectTo = "/dashboard",
}) {
  const headers = await createUserSessionHeaders({ userId, roles, agencyId, remember });
  return redirect(redirectTo, { headers });
}

export async function destroyUserSessionHeaders(reqOrRequest) {
  const session = await getSession(getCookieHeader(reqOrRequest));
  return { "Set-Cookie": await destroySession(session) };
}

export async function destroyUserSessionRedirect(reqOrRequest, redirectTo = "/login") {
  const headers = await destroyUserSessionHeaders(reqOrRequest);
  return redirect(redirectTo, { headers });
}

/* =========================
   Login helpers
   ========================= */

// Pure login: validates credentials and returns sanitized user
export async function login({ email, password }) {
  await connect(); // Ensure DB is connected
  const normalizedEmail = (email || "").trim().toLowerCase();

  // If password is select: false in your schema, +password ensures we get it
  const user = await User.findOne({
    email: normalizedEmail,
    deleted: { $ne: true },
  })
    .select("+password")
    .lean();

  if (!user) {
    return { status: 401, message: "Wrong email or password. Please try again." };
  }

  if (user.status !== 1) {
    return {
      status: 401,
      message: "User account inactive. Please contact your administrator.",
    };
  }

  // Verify password
  const isPasswordMatched = await compare(password || "", user.password || "");
  if (!isPasswordMatched) {
    return { status: 401, message: "Wrong email or password. Please try again." };
  }

  // Derive fields before returning
  const firstName = user.firstName || "";
  const lastName = user.lastName || "";
  const fullName = `${firstName} ${lastName}`.trim();
  const initials = `${firstName[0] || ""}${lastName[0] || ""}`.toUpperCase();

  let org = {};

  delete user.password;

  // Load agencyId from user record
  const agencyId = user.agencyId ? String(user.agencyId) : null;

  return {
    status: 200,
    message: "Login success",
    user: { ...user, fullName, initials, org, agencyId },
  };
}

// Login + set cookie + redirect
export async function loginAndCreateSessionRedirect({
  email,
  password,
  remember = true,
  redirectTo = "/dashboard",
}) {
  const result = await login({ email, password });

  if (result.status !== 200) {
    throw redirect(`/login?error=${encodeURIComponent(result.message)}`);
  }

  const user = result.user;
  return await createUserSessionRedirect({
    userId: String(user._id),
    roles: user.roles || [],
    agencyId: user.agencyId || null,
    remember,
    redirectTo,
  });
}

/* =========================
   Organisation helper
   ========================= */

export async function getOrgDetails(user) {
  return {};
}

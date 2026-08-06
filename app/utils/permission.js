// utils/permission.js

// Role constants
export const Roles = Object.freeze({
  MASTER_ADMIN: "MASTER_ADMIN",
  SUPER_ADMIN: "SUPER_ADMIN",
  ADMIN: "ADMIN",
  INITIAL_ADMIN: "INITIAL_ADMIN",
  REGISTERED_MANAGER: "REGISTERED_MANAGER",
  EMPLOYEE: "EMPLOYEE",
  CLIENT: "CLIENT",
  // External firms/orgs that only refer clients
  REFERRAL_PARTNER: "REFERRAL_PARTNER",
  // Property management roles (status 0 by default — cannot login until activated)
  LANDLORD: "LANDLORD",
  TENANT: "TENANT",
});

export const ALL_ROLES = Object.freeze(Object.values(Roles));

// Normalize roles on read:
// - Accept string or array
// - Trim, UPPERCASE, dedupe
// - Filter unknown roles
function getRoles(user) {
  const raw = user?.roles;
  const arr = Array.isArray(raw) ? raw : (typeof raw === "string" && raw ? [raw] : []);
  const normalized = arr
    .map((r) => String(r).trim().toUpperCase())
    .filter(Boolean);
  const unique = [...new Set(normalized)];
  return unique.filter((r) => ALL_ROLES.includes(r));
}

// Generic role checks
export function hasRole(user, role) {
  return getRoles(user).includes(role);
}
export function hasAnyRole(user, roles = []) {
  const set = new Set(getRoles(user));
  return roles.some((r) => set.has(r));
}
export function hasEveryRole(user, roles = []) {
  const set = new Set(getRoles(user));
  return roles.every((r) => set.has(r));
}

// Specific role checks
export const isAdmin = (user) => hasRole(user, Roles.ADMIN);
export const isSuperAdmin = (user) => hasRole(user, Roles.SUPER_ADMIN);
export const isMasterAdmin = (user) => hasRole(user, Roles.MASTER_ADMIN);
export const isInitialAdmin = (user) => hasRole(user, Roles.INITIAL_ADMIN);
export const isRegisteredManager = (user) => hasRole(user, Roles.REGISTERED_MANAGER);
export const isEmployee = (user) => hasRole(user, Roles.EMPLOYEE);
export const isClient = (user) => hasRole(user, Roles.CLIENT);
export const isReferralPartner = (user) => hasRole(user, Roles.REFERRAL_PARTNER);
export const isLandlord = (user) => hasRole(user, Roles.LANDLORD);
export const isTenant = (user) => hasRole(user, Roles.TENANT);

// Optional: simple capability map to avoid sprinkling role lists everywhere
export const Capabilities = Object.freeze({
  // Referral partners can submit referrals; internal roles can too
  SUBMIT_REFERRAL: [
    Roles.REFERRAL_PARTNER,
    Roles.EMPLOYEE,
    Roles.ADMIN,
    Roles.SUPER_ADMIN,
    Roles.MASTER_ADMIN,
  ],
  // Add more as needed:
  // MANAGE_USERS: [Roles.ADMIN, Roles.SUPER_ADMIN, Roles.MASTER_ADMIN],
  // VIEW_REPORTS: [Roles.ADMIN, Roles.SUPER_ADMIN, Roles.MASTER_ADMIN, Roles.REGISTERED_MANAGER],
});

// Generic permission checker
export function can(user, capability) {
  const allowed = Capabilities[capability] || [];
  return hasAnyRole(user, allowed);
}

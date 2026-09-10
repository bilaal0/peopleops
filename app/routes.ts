import {
  type RouteConfig,
  route,
  index,
  layout,
} from "@react-router/dev/routes";

export default [
  index("routes/home.jsx"),
  route("login", "routes/auth/login.jsx"),
  route("signup", "routes/auth/signup.jsx"),
  route("auth/request-otp", "routes/auth/request-otp.jsx"),
  route("auth/verify-otp", "routes/auth/verify-otp.jsx"),
  route("auth/verify-login", "routes/auth/verify-login.jsx"),
  route("auth/complete-signup", "routes/auth/complete-signup.jsx"),
  route("auth/forgot-password", "routes/auth/forgot-password.jsx"),
  route("auth/reset-password", "routes/auth/reset-password.jsx"),
  route("logout", "routes/auth/logout.js"),
  route("auth/accept-invite", "routes/auth/auth.invite.jsx"),

  // ── Raw response routes (no layout shell) ──────────────────────────────────
  route("documents/:id/download", "routes/documents/download.jsx"),
  route("documents/s3-download", "routes/documents/s3-download.jsx"),
  route("documents/verify", "routes/documents/verify.jsx"),
  route("documents/upload", "routes/documents/upload.jsx"),
  route("documents/delete", "routes/documents/delete.jsx"),
  route("tenancies/:id/evidence-bundle", "routes/tenancies/evidence-bundle.jsx"),

  // ── Notes API (no layout shell — fetcher-only routes) ──────────────────────
  route("api/maintenance/property-info", "routes/api/maintenance/property-info.jsx"),
  route("api/maintenance/run-cron", "routes/api/maintenance/run-cron.jsx"),
  route("api/tenancies/:id/rra-information-sheet", "routes/api/tenancies/$id.rra-information-sheet.jsx"),
  route("api/notifications", "routes/api/notifications.jsx"),
  route("api/attendance", "routes/api/attendance.jsx"),
  route("api/rota-task", "routes/api/rota-task.jsx"),


  layout("components/navigation/Layout.jsx", [

    route("dashboard", "routes/dashboard.jsx"),

    // ── Tenants ───────────────────────────────────────────
    route("tenants", "routes/tenants/index.jsx"),
    route("tenants/add", "routes/tenants/add.jsx"),
    route("tenants/:id", "routes/tenants/detail.jsx"),
    route("tenants/:id/edit", "routes/tenants/edit.jsx"),
    route("tenants/:id/delete", "routes/tenants/delete.jsx"),

    // ── Tenancies ─────────────────────────────────────────
    route("tenancies", "routes/tenancies/index.jsx"),
    route("tenancies/add", "routes/tenancies/add.jsx"),
    route("tenancies/:id", "routes/tenancies/detail.jsx"),
    route("tenancies/:id/edit", "routes/tenancies/edit.jsx"),

    // ── Obligations ───────────────────────────────────────
    route("obligations/:id/log", "routes/obligations/log.jsx"),
    route("obligations/:id/upload", "routes/obligations/upload.jsx"),

    // ── Compliance ────────────────────────────────────────
    route("compliance", "routes/compliance/dashboard.jsx"),
    route("compliance/bundle/:tenancyId", "routes/compliance/bundle.jsx"),

    // ── Documents ─────────────────────────────────────────
    route("documents", "routes/documents/index.jsx"),
    route("documents/generate-bundle", "routes/documents/generate-bundle.jsx"),

    // ── Admin / Settings ──────────────────────────────────
    route("organizations", "routes/organizations/index.jsx"),
    route("organizations/add", "routes/organizations/add.jsx"),
    route("organizations/:id/edit", "routes/organizations/edit.jsx"),
    route("organization/settings", "routes/organization/settings.jsx"),
    route("users", "routes/users/index.jsx"),
    route("document-types", "routes/document-types/index.jsx"),

    // ── User Accounts (Staff & Client) ──────────────────────
    route("user-accounts/staff", "routes/user-accounts/staff/index.jsx"),
    route("user-accounts/staff/add", "routes/user-accounts/staff/add.jsx"),
    route("user-accounts/staff/:id", "routes/user-accounts/staff/detail.jsx"),
    route("user-accounts/staff/:id/edit", "routes/user-accounts/staff/edit.jsx"),
    route("user-accounts/staff/:id/delete", "routes/user-accounts/staff/delete.jsx"),

    route("user-accounts/client", "routes/user-accounts/client/index.jsx"),
    route("user-accounts/client/add", "routes/user-accounts/client/add.jsx"),
    route("user-accounts/client/:id", "routes/user-accounts/client/detail.jsx"),
    route("user-accounts/client/:id/edit", "routes/user-accounts/client/edit.jsx"),
    route("user-accounts/client/:id/delete", "routes/user-accounts/client/delete.jsx"),

    // ── Transactions & Rent Tracker ───────────────────────
    route("disbursements/create", "routes/disbursements/create.jsx"),
    route("disbursements/:id/mark-paid", "routes/disbursements/$id.mark-paid.jsx"),
    route("expenses/create", "routes/expenses/create.jsx"),

    // ── Rota System ───────────────────────────────────────────────
    route("rota", "routes/rota/index.jsx"),

    // ── Staff Attendance & Tasks ──────────────────────────────────
    route("attendance", "routes/attendance/index.jsx"),
  ]),
] satisfies RouteConfig;

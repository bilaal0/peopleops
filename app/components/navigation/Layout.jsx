// app/components/navigation/Layout.jsx
import { useState } from "react";
import { Outlet, useLoaderData } from "react-router";
import Sidebar from "./Sidebar.jsx";
import TopBar from "./TopBar.jsx";
import { Toaster } from "react-hot-toast";

export async function loader({ request }) {
  const { getUserFromRequest } = await import("../../utils/auth.server.js");
  const claims = await getUserFromRequest(request);
  if (!claims) return { user: null, agency: null };

  const { connect } = await import("../../config/db.server.js");
  const { User } = await import("../../models/user.server.js");
  const { Agency } = await import("../../models/agency.server.js");

  await connect();
  const [user, agency] = await Promise.all([
    User.findById(claims.userId).select("title firstName lastName email roles agencyId").lean(),
    claims.agencyId ? Agency.findById(claims.agencyId).select("name image").lean() : null
  ]);

  if (!user) return { user: null, agency: null };

  const firstName = user.firstName || "";
  const lastName  = user.lastName  || "";

  return {
    user: {
      firstName,
      lastName,
      name:     `${firstName} ${lastName}`.trim() || user.email,
      initials: `${firstName[0] || ""}${lastName[0] || ""}`.toUpperCase() || "U",
      email:    user.email,
      roles:    user.roles || [],
      agencyId: claims.agencyId,
    },
    agency
  };
}

export default function Layout() {
  const { user, agency } = useLoaderData() || { user: null, agency: null };
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <Toaster position="top-right" toastOptions={{ duration: 5000 }} />

      {/* Sidebar */}
      <Sidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed((c) => !c)}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
        user={user}
        agency={agency}
      />

      {/* Top bar */}
      <TopBar
        sidebarCollapsed={collapsed}
        onMobileMenuToggle={() => setMobileOpen((v) => !v)}
        user={user}
        agency={agency}
      />

      {/* Main content — shifts on desktop, full width on mobile */}
      <main
        className={`transition-all duration-300 min-h-[calc(100vh-64px)] ${
          collapsed ? "lg:ml-[68px]" : "lg:ml-[240px]"
        }`}
      >
        <Outlet />
      </main>
    </div>
  );
}

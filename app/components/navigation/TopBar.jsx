import { Link, useLocation, useFetcher } from "react-router";
import { Bell, ChevronDown, AlertTriangle, Info, Clock, Activity, Loader2, ArrowRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { getOrganizationLogoUrl } from "../../utils/organizationLogo.js";

export default function TopBar({ sidebarCollapsed, onMobileMenuToggle, user, organization }) {
  const location = useLocation();
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef(null);
  const notifRef = useRef(null);
  const [notifOpen, setNotifOpen] = useState(false);
  const fetcher = useFetcher();

  // Dynamic title based on path
  const getPageTitle = () => {
    const path = location.pathname;
    if (path === "/dashboard") return "Dashboard";
    if (path.startsWith("/properties")) return "Properties";
    if (path.startsWith("/landlords")) return "Landlords";
    if (path.startsWith("/tenants")) return "Tenants";
    if (path.startsWith("/tenancies")) return "Tenancies";
    if (path.startsWith("/rent")) return "Rent";
    if (path.startsWith("/documents")) return "Documents";
    if (path.startsWith("/compliance")) return "Compliance";
    if (path.startsWith("/organization/settings")) return "Settings";
    return "Portal";
  };

  const todayStr = new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
  });

  useEffect(() => {
    if (notifOpen && fetcher.state === "idle" && !fetcher.data) {
      fetcher.load("/api/notifications");
    }
  }, [notifOpen, fetcher]);

  useEffect(() => {
    function handler(e) {
      if (profileRef.current && !profileRef.current.contains(e.target)) {
        setProfileOpen(false);
      }
      if (notifRef.current && !notifRef.current.contains(e.target)) {
        setNotifOpen(false);
      }
    }

    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function relativeTime(value) {
    if (!value) return "";
    const date = new Date(value);
    const diff = Date.now() - date.getTime();
    const minutes = Math.max(1, Math.floor(diff / 60000));
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  }

  return (
    <header
      className={`sticky top-0 z-20 flex items-center justify-between h-16 bg-white border-b border-[#E2E8F0] px-6 transition-all duration-300 font-sans ${
        sidebarCollapsed ? "lg:ml-[68px]" : "lg:ml-[240px]"
      }`}
    >
      {/* Left side: Hamburger (mobile) + Page Title + Date */}
      <div className="flex items-center gap-4 min-w-0">
        {/* Mobile menu trigger */}
        <button
          onClick={onMobileMenuToggle}
          className="lg:hidden flex items-center justify-center h-8 w-8 rounded-md text-[#475569] hover:bg-slate-50 border border-[#E2E8F0]"
          aria-label="Open menu"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
          </svg>
        </button>

        {/* Dynamic Page Title & Sub-date */}
        <div className="flex flex-col min-w-0">
          <h2 className="truncate text-sm font-bold text-[#1E293B] leading-none">{getPageTitle()}</h2>
          <span className="truncate text-[10px] text-[#94A3B8] font-semibold mt-1 leading-none">{todayStr}</span>
        </div>
      </div>

      {/* Right side: notifications + profile */}
      <div className="flex items-center gap-2">
        <div className="relative" ref={notifRef}>
          <button
            type="button"
            onClick={() => setNotifOpen((v) => !v)}
            className={`relative inline-flex h-9 w-9 items-center justify-center rounded-[6px] border transition ${
              notifOpen ? "border-[#2563EB] bg-[#EFF6FF] text-[#2563EB]" : "border-[#E2E8F0] text-[#475569] hover:border-[#2563EB] hover:bg-[#EFF6FF] hover:text-[#2563EB]"
            }`}
            aria-label="Notifications"
          >
            <Bell className="h-4 w-4" />
            <span className="absolute -top-1 -right-1 flex h-3 w-3 items-center justify-center rounded-full bg-red-500 text-[8px] font-bold text-white shadow-sm ring-2 ring-white">
              {fetcher.data?.urgent?.length > 0 ? fetcher.data.urgent.length : ""}
            </span>
          </button>

          {notifOpen && (
            <div className="absolute right-0 top-full z-50 mt-2 w-[480px] rounded-2xl border border-slate-200 bg-white shadow-[0_20px_60px_-15px_rgba(0,0,0,0.15)] overflow-hidden flex flex-col max-h-[85vh]">
              <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/50 px-5 py-4 shrink-0">
                <h3 className="text-base font-semibold text-slate-900">Notifications</h3>
                <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-600">
                  {(fetcher.data?.urgent?.length || 0) + (fetcher.data?.recent?.length || 0)} Total
                </span>
              </div>

              <div className="overflow-y-auto flex-1 p-2">
                {fetcher.state === "loading" && !fetcher.data ? (
                  <div className="flex flex-col items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
                    <p className="mt-3 text-sm text-slate-500">Loading notifications...</p>
                  </div>
                ) : (
                  <div className="space-y-6 px-3 py-2">
                    {/* Urgent Action Required */}
                    <div>
                      <h4 className="mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-red-600">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        Action Required
                      </h4>
                      {fetcher.data?.urgent?.length > 0 ? (
                        <div className="space-y-2">
                          {fetcher.data.urgent.map((alert, i) => (
                            <Link
                              key={`urgent-${i}`}
                              to={alert.link || "/dashboard"}
                              onClick={() => setNotifOpen(false)}
                              className="group block rounded-xl border border-red-100 bg-white p-3 shadow-sm transition hover:border-red-300 hover:bg-red-50/50"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="text-sm font-semibold text-slate-900 group-hover:text-red-700 transition-colors">{alert.title}</p>
                                  <p className="mt-0.5 text-xs text-slate-500">{alert.sub}</p>
                                </div>
                                <ArrowRight className="h-4 w-4 shrink-0 text-red-400 opacity-0 transition-opacity group-hover:opacity-100 mt-0.5" />
                              </div>
                            </Link>
                          ))}
                        </div>
                      ) : (
                        <div className="rounded-xl border border-dashed border-slate-200 p-4 text-center">
                          <p className="text-xs font-medium text-slate-500">No urgent items</p>
                        </div>
                      )}
                    </div>

                    {/* Recent Activity */}
                    <div>
                      <h4 className="mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
                        <Activity className="h-3.5 w-3.5" />
                        Recent Activity
                      </h4>
                      {fetcher.data?.recent?.length > 0 ? (
                        <div className="space-y-1">
                          {fetcher.data.recent.map((item, i) => (
                            <div key={`recent-${i}`} className="flex items-start gap-3 rounded-lg px-3 py-2 transition hover:bg-slate-50">
                              <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                                <Info className="h-3 w-3" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium text-slate-800">{item.title}</p>
                                <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-500 font-medium">
                                  <span className="capitalize">{item.subtitle}</span>
                                  <span>&bull;</span>
                                  <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {relativeTime(item.createdAt)}</span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="rounded-xl border border-dashed border-slate-200 p-4 text-center">
                          <p className="text-xs font-medium text-slate-500">No recent activity</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
              
              <div className="border-t border-slate-100 p-3 bg-slate-50 text-center shrink-0">
                <Link to="/dashboard" onClick={() => setNotifOpen(false)} className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition-colors">
                  View full dashboard
                </Link>
              </div>
            </div>
          )}
        </div>

        <div className="relative" ref={profileRef}>
          <button
            onClick={() => setProfileOpen((v) => !v)}
            className="flex items-center gap-2.5 rounded-lg border border-[#E2E8F0] bg-white px-2.5 py-1.5 transition hover:border-[#2563EB] hover:bg-[#EFF6FF]"
          >
            {getOrganizationLogoUrl(organization?.image) ? (
              <img
                src={getOrganizationLogoUrl(organization.image)}
                alt={organization?.name || "Organization Logo"}
                className="h-8 w-8 rounded-full object-cover border border-slate-200 bg-white shrink-0"
              />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#2563EB] text-xs font-bold text-white shrink-0">
                {user?.initials || user?.name?.charAt(0)?.toUpperCase() || "U"}
              </div>
            )}
            <div className="hidden md:block text-left">
              <p className="text-sm font-semibold leading-none text-[#1E293B]">{user?.name || "User"}</p>
              <p className="mt-0.5 text-[10px] leading-none text-[#94A3B8] font-medium truncate max-w-[120px]">{organization?.name || "Organization"}</p>
            </div>
            <ChevronDown className={`hidden h-3.5 w-3.5 text-[#94A3B8] transition-transform md:block ${profileOpen ? "rotate-180" : ""}`} />
          </button>

          {profileOpen && (
            <div className="absolute right-0 top-full z-50 mt-2 w-64 rounded-xl border border-[#E2E8F0] bg-white p-1.5 shadow-lg">
              <div className="border-b border-[#E2E8F0] px-3 py-2 flex items-center gap-3">
                {getOrganizationLogoUrl(organization?.image) && (
                  <img
                    src={getOrganizationLogoUrl(organization.image)}
                    alt={organization?.name}
                    className="w-10 h-10 rounded-lg object-cover border border-slate-200 bg-white shrink-0"
                  />
                )}
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[#1E293B] truncate">{user?.name || "User"}</p>
                  <p className="text-xs text-[#64748B] truncate">{user?.email || ""}</p>
                  <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-[#94A3B8] truncate">
                    {organization?.name || "Organization"}
                  </p>
                </div>
              </div>

              <div className="py-1">
                <Link
                  to="/organization/settings"
                  onClick={() => setProfileOpen(false)}
                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-[#475569] transition hover:bg-[#EFF6FF] hover:text-[#1E293B]"
                >
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#EFF6FF] text-[#2563EB]">O</span>
                  Organization settings
                </Link>
                <Link
                  to="/users"
                  onClick={() => setProfileOpen(false)}
                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-[#475569] transition hover:bg-[#EFF6FF] hover:text-[#1E293B]"
                >
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#EFF6FF] text-[#2563EB]">T</span>
                  Team members
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>

    </header>
  );
}

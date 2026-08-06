import { useState } from "react";
import { Link, Form, useLocation } from "react-router";
import {
  LayoutGrid,
  Building2,
  Users,
  UserCheck,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  LogOut,
  CalendarDays,
} from "lucide-react";
import { getAgencyLogoUrl } from "../../utils/agencyLogo.js";

export default function Sidebar({ collapsed, onToggle, mobileOpen, onMobileClose, user, agency }) {
  const location = useLocation();
  const [openSections, setOpenSections] = useState({});
  const isSuperAdmin = user?.roles?.includes("SUPER_ADMIN");

  const isActive = (href) => {
    if (href === "/dashboard") {
      return location.pathname === "/dashboard";
    }
    return location.pathname.startsWith(href);
  };

  const toggleSection = (name) => {
    setOpenSections((prev) => ({ ...prev, [name]: !prev[name] }));
  };

  const navItems = [
    { name: "Dashboard", href: "/dashboard", icon: LayoutGrid },
    ...(isSuperAdmin ? [{ name: "Organizations", href: "/organizations", icon: Building2 }] : []),
    {
      name: "User Accounts",
      icon: Users,
      children: [
        { name: "Staff", href: "/user-accounts/staff", icon: UserCheck },
        { name: "Clients", href: "/user-accounts/client", icon: Users },
      ],
    },
    { name: "Rota System", href: "/rota", icon: CalendarDays },
  ];

  const renderNavItems = () => {
    return navItems.map((item) => {
      if (item.children) {
        const hasActiveChild = item.children.some((child) => isActive(child.href));
        const isOpen = openSections[item.name] !== undefined ? openSections[item.name] : hasActiveChild;
        const Icon = item.icon;

        return (
          <div key={item.name} className="space-y-1">
            <button
              onClick={() => toggleSection(item.name)}
              title={collapsed ? item.name : undefined}
              className={`flex w-full items-center rounded-[6px] px-3 py-2 text-xs font-semibold transition-all duration-150 ${
                hasActiveChild || isOpen
                  ? "text-[#1E293B]"
                  : "text-[#475569] hover:bg-slate-50 hover:text-[#1E293B]"
              } ${collapsed ? "justify-center" : "justify-between"}`}
            >
              <div className={`flex items-center ${collapsed ? "justify-center gap-0" : "gap-3"}`}>
                <Icon className={`h-4 w-4 ${hasActiveChild ? "text-[#2563EB]" : "text-[#94A3B8]"}`} />
                {!collapsed && <span>{item.name}</span>}
              </div>
              {!collapsed &&
                (isOpen ? (
                  <ChevronDown className="h-3.5 w-3.5 text-[#94A3B8]" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5 text-[#94A3B8]" />
                ))}
            </button>
            {isOpen && (
              <div className={`space-y-1 ${collapsed ? "pl-1" : "pl-9"}`}>
                {item.children.map((child) => {
                  const active = isActive(child.href);
                  const ChildIcon = child.icon;
                  return (
                    <Link
                      key={child.name}
                      to={child.href}
                      onClick={onMobileClose}
                      title={collapsed ? child.name : undefined}
                      className={`flex items-center rounded-[6px] px-3 py-2 text-xs font-semibold transition-all duration-150 ${
                        active
                          ? "bg-[#EFF6FF] text-[#2563EB]"
                          : "text-[#64748B] hover:bg-slate-50 hover:text-[#1E293B]"
                      }`}
                    >
                      <div className={`flex items-center ${collapsed ? "justify-center gap-0" : "gap-2.5"}`}>
                        <ChildIcon className={`h-3.5 w-3.5 ${active ? "text-[#2563EB]" : "text-[#94A3B8]"}`} />
                        {!collapsed && <span>{child.name}</span>}
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        );
      }

      const active = isActive(item.href);
      const Icon = item.icon;
      return (
        <Link
          key={item.name}
          to={item.href}
          onClick={onMobileClose}
          title={collapsed ? item.name : undefined}
          className={`flex items-center rounded-[6px] px-3 py-2 text-xs font-semibold transition-all duration-150 ${
            active
              ? "bg-[#EFF6FF] text-[#2563EB]"
              : "text-[#475569] hover:bg-slate-50 hover:text-[#1E293B]"
          } ${collapsed ? "justify-center" : ""}`}
        >
          <div className={`flex items-center ${collapsed ? "justify-center gap-0" : "gap-3"}`}>
            <Icon className={`h-4 w-4 ${active ? "text-[#2563EB]" : "text-[#94A3B8]"}`} />
            {!collapsed && <span>{item.name}</span>}
          </div>
        </Link>
      );
    });
  };

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className={`hidden flex-col justify-between border-r border-[#E2E8F0] bg-white font-sans lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:flex transition-all duration-300 ${collapsed ? "lg:w-[68px]" : "lg:w-[240px]"}`}>
        <div className="flex min-h-0 flex-1 flex-col">
          <div className={`relative flex h-16 items-center border-b border-[#E2E8F0] ${collapsed ? "justify-center px-2" : "justify-between px-4"}`}>
            <Link to="/dashboard" className="group flex items-center">
              <img
                src="/assets/logo/Peopleops.png"
                alt="PeopleOps"
                className={`${collapsed ? "h-9" : "h-12"} w-auto object-contain transition-transform group-hover:scale-105`}
              />
            </Link>
            <button
              type="button"
              onClick={onToggle}
              className={`hidden lg:inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#E2E8F0] text-[#64748B] hover:border-[#2563EB] hover:bg-[#EFF6FF] hover:text-[#2563EB] ${collapsed ? "absolute right-2" : ""}`}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </button>
          </div>

          <nav className={`flex-1 space-y-2 overflow-y-auto py-6 ${collapsed ? "px-2" : "px-4"}`}>
            {renderNavItems()}
          </nav>
        </div>

        <div className="space-y-3 border-t border-[#E2E8F0] bg-slate-50/70 px-4 py-4">
          {!collapsed && (
            <div className="rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 flex items-center gap-2.5">
              {getAgencyLogoUrl(agency?.image) ? (
                <img
                  src={getAgencyLogoUrl(agency.image)}
                  alt={agency?.name || "Agency Logo"}
                  className="w-7 h-7 rounded-md object-cover border border-slate-200 bg-white shrink-0"
                />
              ) : (
                <div className="w-7 h-7 rounded-md bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-xs shrink-0 border border-indigo-100">
                  {agency?.name?.charAt(0)?.toUpperCase() || "A"}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-bold uppercase tracking-wider text-[#94A3B8]">Organization</p>
                <p className="mt-0.5 truncate text-xs font-bold text-[#1E293B]">{agency?.name || "Main Branch"}</p>
              </div>
            </div>
          )}

          <Form method="post" action="/logout">
            <button
              type="submit"
              title="Logout"
              className={`flex w-full items-center justify-center rounded-md bg-red-50 py-2 text-[11px] font-semibold text-[#DC2626] transition hover:bg-red-100 ${collapsed ? "px-2" : "gap-2.5 px-3"}`}
            >
              <LogOut className="h-3.5 w-3.5" />
              {!collapsed && <span>Logout</span>}
            </button>
          </Form>

          {!collapsed && <p className="pt-1 text-center text-[10px] font-medium text-[#94A3B8]">(c) 2026 PeopleOps</p>}
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div className="fixed inset-0 bg-black/20 backdrop-blur-xs transition-opacity" onClick={onMobileClose} />

          <aside className="relative z-10 flex w-[260px] max-w-xs flex-col bg-white shadow-xl transition-transform duration-300">
            <button
              onClick={onMobileClose}
              className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-lg text-[#94A3B8] hover:bg-slate-50 hover:text-[#1E293B]"
            >
              <span className="text-lg">x</span>
            </button>

            <div className="flex h-16 items-center border-b border-[#E2E8F0] px-6">
              <Link to="/dashboard" className="flex items-center" onClick={onMobileClose}>
                <img
                  src="/assets/logo/Peopleops.png"
                  alt="PeopleOps"
                  className="h-12 w-auto object-contain"
                />
              </Link>
            </div>

            <nav className="flex-1 space-y-2 overflow-y-auto px-4 py-6">
              {renderNavItems()}
            </nav>

            <div className="space-y-3 border-t border-[#E2E8F0] bg-slate-50/70 px-4 py-4">
              <div className="rounded-lg border border-[#E2E8F0] bg-white px-3 py-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-[#94A3B8]">Organization</p>
                <p className="mt-1 truncate text-xs font-bold text-[#1E293B]">{agency?.name || "Main Branch"}</p>
              </div>

              <Form method="post" action="/logout">
                <button
                  type="submit"
                  className="flex w-full items-center justify-center gap-2.5 rounded-md bg-red-50 px-3 py-2 text-[11px] font-semibold text-[#DC2626] transition hover:bg-red-100"
                >
                  <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-white text-[9px] font-bold text-[#DC2626]">
                    out
                  </span>
                  <span>Logout</span>
                </button>
              </Form>

              <p className="pt-1 text-center text-[10px] font-medium text-[#94A3B8]">(c) 2026 PeopleOps</p>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}

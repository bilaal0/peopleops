import { Link } from "react-router";
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  Activity,
  ShieldCheck,
  Wrench,
  PoundSterling,
  FileCheck,
  Home,
  FileText,
  AlertCircle,
  CheckCircle2
} from "lucide-react";

function currency(value) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function formatTime(value) {
  if (!value) return "";
  const date = new Date(value);
  const diff = Date.now() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  
  if (days === 0) {
    return date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  } else if (days === 1) {
    return "Yesterday";
  } else {
    return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  }
}

export default function OrganizationDashboard({ organization, dashboardData, user }) {
  if (!organization) {
    return (
      <div className="mx-auto max-w-7xl p-6">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-red-700">Organization Account Link Required</p>
          <p className="mt-2 text-sm text-red-800">
            Your profile is not currently linked to an organization. Please contact support.
          </p>
        </div>
      </div>
    );
  }

  if (dashboardData?.onboarding) {
    return (
      <div className="w-full pt-10 flex justify-center">
        <p className="text-lg text-gray-900 font-normal">
          Welcome to <span className="font-semibold">{organization.name}</span>
        </p>
      </div>
    );
  }

  return (
    <div className="w-full pt-10 flex justify-center">
      <p className="text-lg text-gray-900 font-normal">
        Welcome to <span className="font-semibold">{organization.name}</span>
      </p>
    </div>
  );
}

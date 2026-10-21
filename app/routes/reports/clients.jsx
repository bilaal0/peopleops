import { useState, useMemo } from "react";
import { redirect, useLoaderData, Link } from "react-router";
import { getUserFromRequest } from "../../utils/auth.server.js";
import { User } from "../../models/user.server.js";
import { Rota } from "../../models/rota.server.js";
import { Attendance } from "../../models/attendance.server.js";
import { connect } from "../../config/db.server.js";
import {
  Users, ClipboardList, CheckCircle2, Clock, XCircle,
  FileSpreadsheet, Search, Filter, Calendar, ChevronRight,
  ShieldCheck, AlertTriangle, ArrowUpRight, Phone, Mail,
  CalendarClock, Building2, Check
} from "lucide-react";

export async function loader({ request }) {
  const user = await getUserFromRequest(request);
  if (!user) return redirect("/login");

  const canManage = user.roles?.some((r) =>
    ["SUPER_ADMIN", "ADMIN", "MASTER_ADMIN", "INITIAL_ADMIN", "REGISTERED_MANAGER"].includes(r)
  );
  if (!canManage) {
    return redirect("/dashboard");
  }

  await connect();

  const isSuperAdmin = user.roles?.includes("SUPER_ADMIN");
  const query = { roles: "CLIENT", deleted: false };
  const orgQuery = {};

  if (!isSuperAdmin && user.organizationId) {
    query.organizationId = user.organizationId;
    orgQuery.organizationId = user.organizationId;
  }

  // 1. Fetch all clients
  const clientUsers = await User.find(query).sort({ firstName: 1 }).lean();
  const clientIds = clientUsers.map((c) => c._id);

  // 2. Fetch all Rota shifts assigned to these clients
  const rotaTasks = await Rota.find({
    assignedTo: { $in: clientIds },
    deleted: false,
    ...orgQuery,
  })
    .populate("assignedTo", "firstName lastName title companyName landlordData email phone addressLine1 postcode")
    .populate("employee", "firstName lastName title email phone jobTitle")
    .populate("taskUpdatedBy", "firstName lastName email")
    .sort({ date: -1, startTime: -1 })
    .lean();

  // 3. Fetch staff attendance records within organization
  const employeeIds = [...new Set(rotaTasks.map((t) => t.employee?._id?.toString()).filter(Boolean))];
  const attendanceRecords = employeeIds.length > 0
    ? await Attendance.find({
        user: { $in: employeeIds },
        ...orgQuery,
      }).sort({ date: -1, createdAt: -1 }).lean()
    : [];

  // Build attendance lookup: `${userId}_${yyyy-mm-dd}`
  const attendanceMap = new Map();
  for (const att of attendanceRecords) {
    if (att.date && att.user) {
      const d = new Date(att.date);
      const key = `${att.user.toString()}_${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
      if (!attendanceMap.has(key)) {
        attendanceMap.set(key, []);
      }
      attendanceMap.get(key).push(att);
    }
  }

  // Also query direct client attendance (if any)
  const directClientAttendance = await Attendance.find({
    user: { $in: clientIds },
    ...orgQuery,
  }).sort({ date: -1 }).lean();

  // 4. Format all tasks
  const allTasks = rotaTasks.map((t) => {
    const clientObj = t.assignedTo;
    const clientName = clientObj
      ? (clientObj.companyName || clientObj.landlordData?.companyName || `${clientObj.title ? clientObj.title + " " : ""}${clientObj.firstName || ""} ${clientObj.lastName || ""}`.trim())
      : (t.assignedToName || "Unnamed Client");

    const emp = t.employee;
    const staffName = emp
      ? `${emp.title ? emp.title + " " : ""}${emp.firstName || ""} ${emp.lastName || ""}`.trim() || emp.email
      : (t.employeeName || "Unassigned Staff");

    return {
      _id: t._id.toString(),
      title: t.title || "Care Shift / Task",
      description: t.description || "",
      date: t.date ? t.date.toISOString() : null,
      startTime: t.startTime || "",
      endTime: t.endTime || "",
      clientId: clientObj?._id?.toString() || "",
      clientName,
      staffId: emp?._id?.toString() || "",
      staffName,
      staffJobTitle: emp?.jobTitle || "",
      taskStatus: t.taskStatus || "pending",
      taskNotes: t.taskNotes || "",
      taskReasonIfNotDone: t.taskReasonIfNotDone || "",
      taskUpdatedAt: t.taskUpdatedAt ? t.taskUpdatedAt.toISOString() : null,
      taskUpdatedBy: t.taskUpdatedBy
        ? `${t.taskUpdatedBy.firstName || ""} ${t.taskUpdatedBy.lastName || ""}`.trim() || t.taskUpdatedBy.email
        : "",
    };
  });

  // 5. Format all attendance visits
  const allAttendance = rotaTasks.map((t) => {
    const clientObj = t.assignedTo;
    const clientName = clientObj
      ? (clientObj.companyName || clientObj.landlordData?.companyName || `${clientObj.title ? clientObj.title + " " : ""}${clientObj.firstName || ""} ${clientObj.lastName || ""}`.trim())
      : (t.assignedToName || "Unnamed Client");

    const emp = t.employee;
    const staffName = emp
      ? `${emp.title ? emp.title + " " : ""}${emp.firstName || ""} ${emp.lastName || ""}`.trim() || emp.email
      : (t.employeeName || "Unassigned Staff");

    let matchingAtt = null;
    if (t.date && emp?._id) {
      const d = new Date(t.date);
      const key = `${emp._id.toString()}_${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
      const atts = attendanceMap.get(key);
      if (atts && atts.length > 0) {
        matchingAtt = atts[0];
      }
    }

    const clockIn = matchingAtt?.clockInTime
      ? new Date(matchingAtt.clockInTime).toISOString()
      : (matchingAtt?.markedAt ? new Date(matchingAtt.markedAt).toISOString() : null);
    const clockOut = matchingAtt?.clockOutTime ? new Date(matchingAtt.clockOutTime).toISOString() : null;
    const totalHours = matchingAtt?.totalHours || 0;

    let status = "no_record";
    if (matchingAtt) {
      status = matchingAtt.status;
    } else if (t.taskStatus === "completed") {
      status = "marked";
    } else if (t.date && new Date(t.date) > new Date()) {
      status = "scheduled";
    }

    return {
      _id: t._id.toString(),
      shiftId: t._id.toString(),
      title: t.title || "Scheduled Visit",
      date: t.date ? t.date.toISOString() : null,
      scheduledTime: t.startTime && t.endTime ? `${t.startTime} - ${t.endTime}` : (t.startTime || "—"),
      clientId: clientObj?._id?.toString() || "",
      clientName,
      staffId: emp?._id?.toString() || "",
      staffName,
      staffPhone: emp?.phone || "",
      hasAttendanceRecord: Boolean(matchingAtt),
      clockInTime: clockIn,
      clockOutTime: clockOut,
      totalHours,
      status,
      notes: matchingAtt?.notes || t.taskNotes || "",
      taskStatus: t.taskStatus || "pending",
    };
  });

  // Include direct client attendance
  for (const dAtt of directClientAttendance) {
    const cUser = clientUsers.find((c) => c._id.toString() === dAtt.user?.toString());
    const cName = cUser
      ? (cUser.companyName || `${cUser.firstName || ""} ${cUser.lastName || ""}`.trim())
      : "Client";

    allAttendance.push({
      _id: dAtt._id.toString(),
      shiftId: dAtt._id.toString(),
      title: "Direct Client Attendance",
      date: dAtt.date ? dAtt.date.toISOString() : null,
      scheduledTime: "—",
      clientId: dAtt.user?.toString() || "",
      clientName: cName,
      staffId: dAtt.user?.toString() || "",
      staffName: cName,
      staffPhone: cUser?.phone || "",
      hasAttendanceRecord: true,
      clockInTime: dAtt.clockInTime?.toISOString() || dAtt.markedAt?.toISOString() || null,
      clockOutTime: dAtt.clockOutTime?.toISOString() || null,
      totalHours: dAtt.totalHours || 0,
      status: dAtt.status || "marked",
      notes: dAtt.notes || "",
      taskStatus: "completed",
    });
  }

  allAttendance.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

  // 6. Per-Client Summaries
  const clientSummaries = clientUsers.map((c) => {
    const cId = c._id.toString();
    const fullName = `${c.title ? c.title + " " : ""}${c.firstName || ""} ${c.lastName || ""}`.trim();
    const name = fullName || c.companyName || "Unnamed Client";
    const company = c.companyName || c.landlordData?.companyName || "";

    const cTasks = allTasks.filter((t) => t.clientId === cId);
    const cAtt = allAttendance.filter((a) => a.clientId === cId);

    const completed = cTasks.filter((t) => t.taskStatus === "completed").length;
    const notCompleted = cTasks.filter((t) => t.taskStatus === "not_completed").length;
    const pending = cTasks.filter((t) => t.taskStatus === "pending").length;
    const hours = cAtt.reduce((sum, curr) => sum + (Number(curr.totalHours) || 0), 0);
    const attended = cAtt.filter((a) => a.status === "clocked_out" || a.status === "clocked_in" || a.status === "marked" || a.hasAttendanceRecord).length;

    return {
      _id: cId,
      name,
      company,
      email: c.email || "",
      phone: c.phone || c.telephoneNo || "",
      city: c.postTown || c.city || "",
      postcode: c.postcode || "",
      totalTasks: cTasks.length,
      completedTasks: completed,
      pendingTasks: pending,
      notCompletedTasks: notCompleted,
      completionRate: cTasks.length > 0 ? Math.round((completed / cTasks.length) * 100) : 0,
      totalHours: hours,
      totalVisits: cAtt.length,
      attendedVisits: attended,
      attendanceRate: cAtt.length > 0 ? Math.round((attended / cAtt.length) * 100) : 0,
      status: c.status ?? 1,
    };
  });

  // Overall statistics
  const totalCompleted = allTasks.filter((t) => t.taskStatus === "completed").length;
  const totalPending = allTasks.filter((t) => t.taskStatus === "pending").length;
  const totalNotDone = allTasks.filter((t) => t.taskStatus === "not_completed").length;
  const totalHoursDelivered = allAttendance.reduce((sum, curr) => sum + (Number(curr.totalHours) || 0), 0);
  const totalAttendedVisits = allAttendance.filter((a) => a.status === "clocked_out" || a.status === "clocked_in" || a.status === "marked" || a.hasAttendanceRecord).length;

  const stats = {
    totalClients: clientUsers.length,
    totalTasks: allTasks.length,
    completedTasks: totalCompleted,
    pendingTasks: totalPending,
    notCompletedTasks: totalNotDone,
    completionRate: allTasks.length > 0 ? Math.round((totalCompleted / allTasks.length) * 100) : 0,
    totalVisits: allAttendance.length,
    attendedVisits: totalAttendedVisits,
    totalHoursDelivered,
    attendanceRate: allAttendance.length > 0 ? Math.round((totalAttendedVisits / allAttendance.length) * 100) : 0,
  };

  return {
    stats,
    clientSummaries,
    allTasks,
    allAttendance,
    clientsList: clientUsers.map((c) => ({
      _id: c._id.toString(),
      name: `${c.title ? c.title + " " : ""}${c.firstName || ""} ${c.lastName || ""}`.trim() || c.companyName || "Client",
    })),
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatTime12(timeStrOrIso) {
  if (!timeStrOrIso) return "—";
  try {
    if (typeof timeStrOrIso === "string" && timeStrOrIso.includes("T")) {
      const d = new Date(timeStrOrIso);
      if (!isNaN(d.getTime())) {
        return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true });
      }
    }
    const [h, m] = String(timeStrOrIso).split(":");
    const hour = parseInt(h, 10);
    const min = m || "00";
    const period = hour >= 12 ? "PM" : "AM";
    const hour12 = hour % 12 || 12;
    return `${hour12}:${min} ${period}`;
  } catch {
    return timeStrOrIso;
  }
}

function formatDateDisplay(isoOrDate) {
  if (!isoOrDate) return "—";
  try {
    const d = new Date(isoOrDate);
    if (isNaN(d.getTime())) return String(isoOrDate);
    return d.toLocaleDateString("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return String(isoOrDate);
  }
}

function exportClientSummaryCSV(clients) {
  const headers = ["Client Name", "Company", "Email", "Phone", "Location", "Total Tasks", "Completed", "Pending", "Not Done", "Completion %", "Visits", "Delivered Hours", "Attendance %", "Status"];
  const rows = clients.map((c) => [
    `"${c.name.replace(/"/g, '""')}"`,
    `"${(c.company || "").replace(/"/g, '""')}"`,
    `"${(c.email || "").replace(/"/g, '""')}"`,
    `"${(c.phone || "").replace(/"/g, '""')}"`,
    `"${([c.city, c.postcode].filter(Boolean).join(" ")).replace(/"/g, '""')}"`,
    c.totalTasks,
    c.completedTasks,
    c.pendingTasks,
    c.notCompletedTasks,
    `${c.completionRate}%`,
    c.totalVisits,
    c.totalHours.toFixed(1),
    `${c.attendanceRate}%`,
    c.status === 1 ? "Active" : "Inactive",
  ]);
  const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Organization_Clients_Report_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function ClientsReportPage() {
  const { stats, clientSummaries, allTasks, allAttendance, clientsList } = useLoaderData();
  const [activeTab, setActiveTab] = useState("overview"); // "overview" | "tasks" | "attendance"

  // Client summaries filter
  const [clientSearch, setClientSearch] = useState("");

  const filteredClients = useMemo(() => {
    if (!clientSearch.trim()) return clientSummaries;
    const q = clientSearch.toLowerCase();
    return clientSummaries.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.company.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q)
    );
  }, [clientSummaries, clientSearch]);

  // Tasks report filter
  const [taskClientFilter, setTaskClientFilter] = useState("all");
  const [taskStatusFilter, setTaskStatusFilter] = useState("all");
  const [taskSearch, setTaskSearch] = useState("");

  const filteredTasks = useMemo(() => {
    return allTasks.filter((t) => {
      if (taskClientFilter !== "all" && t.clientId !== taskClientFilter) return false;
      if (taskStatusFilter !== "all" && t.taskStatus !== taskStatusFilter) return false;
      if (taskSearch.trim()) {
        const q = taskSearch.toLowerCase();
        const matchTitle = t.title?.toLowerCase().includes(q);
        const matchClient = t.clientName?.toLowerCase().includes(q);
        const matchStaff = t.staffName?.toLowerCase().includes(q);
        const matchNotes = t.taskNotes?.toLowerCase().includes(q);
        if (!matchTitle && !matchClient && !matchStaff && !matchNotes) return false;
      }
      return true;
    });
  }, [allTasks, taskClientFilter, taskStatusFilter, taskSearch]);

  // Attendance filter
  const [attClientFilter, setAttClientFilter] = useState("all");
  const [attStatusFilter, setAttStatusFilter] = useState("all");
  const [attSearch, setAttSearch] = useState("");

  const filteredAttendance = useMemo(() => {
    return allAttendance.filter((a) => {
      if (attClientFilter !== "all" && a.clientId !== attClientFilter) return false;
      if (attStatusFilter === "confirmed") {
        const ok = a.status === "clocked_out" || a.status === "clocked_in" || a.status === "marked" || a.hasAttendanceRecord;
        if (!ok) return false;
      } else if (attStatusFilter === "missed") {
        const ok = a.status === "clocked_out" || a.status === "clocked_in" || a.status === "marked" || a.hasAttendanceRecord;
        if (ok) return false;
      }
      if (attSearch.trim()) {
        const q = attSearch.toLowerCase();
        const matchClient = a.clientName?.toLowerCase().includes(q);
        const matchStaff = a.staffName?.toLowerCase().includes(q);
        const matchNotes = a.notes?.toLowerCase().includes(q);
        if (!matchClient && !matchStaff && !matchNotes) return false;
      }
      return true;
    });
  }, [allAttendance, attClientFilter, attStatusFilter, attSearch]);

  return (
    <div className="min-h-screen bg-gray-50 pb-16">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 mb-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold text-indigo-600 uppercase tracking-wider">
                <Building2 className="w-3.5 h-3.5" />
                <span>Organization Reports</span>
              </div>
              <h1 className="text-3xl font-bold text-gray-900 mt-1">Clients Reports</h1>
              <p className="mt-1 text-sm text-gray-600">
                Full organization report on care shifts, task execution, staff notes, and attendance verification across all clients.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => exportClientSummaryCSV(clientSummaries)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition shadow-xs cursor-pointer"
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                Export CSV Report
              </button>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex gap-2 mt-6 border-b border-gray-200 overflow-x-auto">
            {[
              { key: "overview",   label: "Clients Summary", count: clientSummaries.length },
              { key: "tasks",      label: "All Tasks & Shift Reports", count: allTasks.length },
              { key: "attendance", label: "Attendance & Visits", count: allAttendance.length },
            ].map(({ key, label, count }) => (
              <button
                key={key}
                type="button"
                onClick={() => setActiveTab(key)}
                className={`px-4 py-2.5 text-sm font-semibold rounded-t-lg border-b-2 transition cursor-pointer whitespace-nowrap flex items-center gap-2 ${
                  activeTab === key
                    ? "border-indigo-600 text-indigo-600 bg-indigo-50/30"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                }`}
              >
                <span>{label}</span>
                <span className={`px-2 py-0.5 rounded-full text-xs ${
                  activeTab === key ? "bg-indigo-100 text-indigo-800 font-bold" : "bg-gray-100 text-gray-600"
                }`}>
                  {count}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Body */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
        {/* KPI Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total Clients</p>
              <Users className="w-4 h-4 text-slate-400" />
            </div>
            <p className="text-2xl font-bold text-slate-900 mt-2">{stats.totalClients}</p>
            <p className="text-xs text-slate-500 mt-1">Active client profiles</p>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total Tasks</p>
              <ClipboardList className="w-4 h-4 text-slate-400" />
            </div>
            <p className="text-2xl font-bold text-slate-900 mt-2">{stats.totalTasks}</p>
            <p className="text-xs text-slate-500 mt-1">Across all clients</p>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">Completed Tasks</p>
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="flex items-baseline gap-2 mt-2">
              <p className="text-2xl font-bold text-emerald-900">{stats.completedTasks}</p>
              <span className="text-xs font-bold text-emerald-700">({stats.completionRate}%)</span>
            </div>
            <p className="text-xs text-emerald-600 mt-1">Reported complete</p>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-indigo-700">Hours Delivered</p>
              <Clock className="w-4 h-4 text-indigo-600" />
            </div>
            <p className="text-2xl font-bold text-indigo-900 mt-2">{stats.totalHoursDelivered.toFixed(1)} hrs</p>
            <p className="text-xs text-indigo-600 mt-1">Delivered care hours</p>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs col-span-2 sm:col-span-1">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-purple-700">Attendance Rate</p>
              <ShieldCheck className="w-4 h-4 text-purple-600" />
            </div>
            <p className="text-2xl font-bold text-purple-900 mt-2">{stats.attendanceRate}%</p>
            <p className="text-xs text-purple-600 mt-1">{stats.attendedVisits} / {stats.totalVisits} verified visits</p>
          </div>
        </div>

        {/* Tab 1: Clients Overview */}
        {activeTab === "overview" && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-xs overflow-hidden">
            <div className="p-5 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-gray-900">Clients Breakdown</h2>
                <p className="text-xs text-gray-500 mt-0.5">Summary of scheduled tasks, care delivery, and attendance for each client</p>
              </div>
              <div className="relative w-full sm:w-72">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={clientSearch}
                  onChange={(e) => setClientSearch(e.target.value)}
                  placeholder="Search client by name, company, email..."
                  className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
                <thead className="bg-slate-50 font-bold text-slate-600 uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="px-4 py-3">Client</th>
                    <th className="px-4 py-3">Contact</th>
                    <th className="px-4 py-3 text-center">Total Tasks</th>
                    <th className="px-4 py-3 text-center">Completed</th>
                    <th className="px-4 py-3 text-center">Pending</th>
                    <th className="px-4 py-3 text-center">Not Done</th>
                    <th className="px-4 py-3 text-center">Completion %</th>
                    <th className="px-4 py-3 text-center">Delivered Hours</th>
                    <th className="px-4 py-3 text-center">Attendance %</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                  {filteredClients.map((client) => (
                    <tr key={client._id} className="hover:bg-slate-50/80 transition">
                      <td className="px-4 py-3.5">
                        <Link
                          to={`/user-accounts/client/${client._id}`}
                          className="font-bold text-slate-900 hover:text-indigo-600 transition block truncate max-w-xs"
                        >
                          {client.name}
                        </Link>
                        {client.company && client.company !== client.name && (
                          <span className="text-[11px] text-slate-400 block truncate max-w-xs">{client.company}</span>
                        )}
                      </td>

                      <td className="px-4 py-3.5 text-slate-500 whitespace-nowrap">
                        {client.email ? (
                          <div className="truncate max-w-[180px]">{client.email}</div>
                        ) : null}
                        {client.phone ? (
                          <div className="text-[11px] text-slate-400">{client.phone}</div>
                        ) : null}
                      </td>

                      <td className="px-4 py-3.5 text-center font-bold text-slate-900">{client.totalTasks}</td>

                      <td className="px-4 py-3.5 text-center">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          {client.completedTasks}
                        </span>
                      </td>

                      <td className="px-4 py-3.5 text-center">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                          {client.pendingTasks}
                        </span>
                      </td>

                      <td className="px-4 py-3.5 text-center">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-red-50 text-red-700 border border-red-200">
                          {client.notCompletedTasks}
                        </span>
                      </td>

                      <td className="px-4 py-3.5 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <div className="w-16 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                            <div
                              className="bg-emerald-500 h-1.5 rounded-full"
                              style={{ width: `${Math.min(100, client.completionRate)}%` }}
                            />
                          </div>
                          <span className="font-bold text-slate-800 text-[11px]">{client.completionRate}%</span>
                        </div>
                      </td>

                      <td className="px-4 py-3.5 text-center font-bold text-indigo-700">
                        {client.totalHours > 0 ? `${client.totalHours.toFixed(1)} hrs` : "—"}
                      </td>

                      <td className="px-4 py-3.5 text-center font-bold text-purple-700">
                        {client.totalVisits > 0 ? `${client.attendanceRate}%` : "—"}
                      </td>

                      <td className="px-4 py-3.5 text-right whitespace-nowrap">
                        <Link
                          to={`/user-accounts/client/${client._id}`}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 transition"
                        >
                          View Details <ChevronRight className="w-3.5 h-3.5" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab 2: All Tasks */}
        {activeTab === "tasks" && (
          <div className="space-y-4">
            {/* Filter Bar */}
            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2 flex-wrap">
                {/* Client Select */}
                <select
                  value={taskClientFilter}
                  onChange={(e) => setTaskClientFilter(e.target.value)}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs bg-white text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                >
                  <option value="all">All Clients ({clientsList.length})</option>
                  {clientsList.map((c) => (
                    <option key={c._id} value={c._id}>{c.name}</option>
                  ))}
                </select>

                {/* Status Filter */}
                <select
                  value={taskStatusFilter}
                  onChange={(e) => setTaskStatusFilter(e.target.value)}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs bg-white text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                >
                  <option value="all">All Statuses</option>
                  <option value="completed">Completed</option>
                  <option value="pending">Pending</option>
                  <option value="not_completed">Not Completed</option>
                </select>
              </div>

              <div className="relative w-full sm:w-72">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={taskSearch}
                  onChange={(e) => setTaskSearch(e.target.value)}
                  placeholder="Search task, client, staff, notes..."
                  className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>
            </div>

            {/* Tasks list */}
            {filteredTasks.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-slate-500 text-sm">
                No tasks match your filters.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredTasks.map((t) => {
                  const isDone = t.taskStatus === "completed";
                  const isNotDone = t.taskStatus === "not_completed";

                  return (
                    <div
                      key={t._id}
                      className={`bg-white rounded-xl border p-4 shadow-xs space-y-3 ${
                        isDone ? "border-l-4 border-l-emerald-500" : isNotDone ? "border-l-4 border-l-red-500" : "border-l-4 border-l-amber-500"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">
                          {t.clientName}
                        </span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          isDone ? "bg-emerald-100 text-emerald-800" : isNotDone ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"
                        }`}>
                          {t.taskStatus?.toUpperCase()}
                        </span>
                      </div>

                      <div>
                        <h3 className="text-sm font-bold text-slate-900">{t.title}</h3>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {formatDateDisplay(t.date)} · {formatTime12(t.startTime)} – {formatTime12(t.endTime)}
                        </p>
                      </div>

                      <div className="flex items-center justify-between text-xs text-slate-600 pt-2 border-t border-slate-100">
                        <span className="text-[11px] text-slate-500">Staff: <strong className="text-slate-800">{t.staffName}</strong></span>
                        <Link to={`/user-accounts/client/${t.clientId}`} className="text-indigo-600 hover:text-indigo-800 text-[11px] font-semibold flex items-center gap-1">
                          Client profile &rarr;
                        </Link>
                      </div>

                      {t.taskNotes && (
                        <div className="bg-slate-50 rounded-lg p-2.5 text-xs text-slate-700 border border-slate-100">
                          <strong className="text-slate-900 block text-[10px] uppercase">Staff Report:</strong>
                          <p className="mt-0.5 leading-relaxed">{t.taskNotes}</p>
                        </div>
                      )}

                      {t.taskReasonIfNotDone && (
                        <div className="bg-red-50 rounded-lg p-2.5 text-xs text-red-800 border border-red-100">
                          <strong className="text-red-900 block text-[10px] uppercase">Reason Not Done:</strong>
                          <p className="mt-0.5 leading-relaxed">{t.taskReasonIfNotDone}</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Tab 3: All Attendance */}
        {activeTab === "attendance" && (
          <div className="space-y-4">
            {/* Filter Bar */}
            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2 flex-wrap">
                <select
                  value={attClientFilter}
                  onChange={(e) => setAttClientFilter(e.target.value)}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs bg-white text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                >
                  <option value="all">All Clients ({clientsList.length})</option>
                  {clientsList.map((c) => (
                    <option key={c._id} value={c._id}>{c.name}</option>
                  ))}
                </select>

                <select
                  value={attStatusFilter}
                  onChange={(e) => setAttStatusFilter(e.target.value)}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs bg-white text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                >
                  <option value="all">All Attendance</option>
                  <option value="confirmed">Confirmed Attended</option>
                  <option value="missed">No Clock-in / Missed</option>
                </select>
              </div>

              <div className="relative w-full sm:w-72">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={attSearch}
                  onChange={(e) => setAttSearch(e.target.value)}
                  placeholder="Search client, staff, notes..."
                  className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>
            </div>

            {/* Attendance Table */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
                  <thead className="bg-slate-50 font-bold text-slate-600 uppercase tracking-wider text-[10px]">
                    <tr>
                      <th className="px-4 py-3">Date & Time</th>
                      <th className="px-4 py-3">Client</th>
                      <th className="px-4 py-3">Assigned Staff</th>
                      <th className="px-4 py-3">Clock-In</th>
                      <th className="px-4 py-3">Clock-Out</th>
                      <th className="px-4 py-3">Hours</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                    {filteredAttendance.map((a) => (
                      <tr key={a._id} className="hover:bg-slate-50/80 transition">
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="font-bold text-slate-900">{formatDateDisplay(a.date)}</div>
                          <div className="text-[11px] text-slate-500">{a.scheduledTime}</div>
                        </td>

                        <td className="px-4 py-3 font-semibold text-slate-900 whitespace-nowrap">
                          <Link to={`/user-accounts/client/${a.clientId}`} className="hover:text-indigo-600 transition">
                            {a.clientName}
                          </Link>
                        </td>

                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="font-medium text-slate-800">{a.staffName}</span>
                        </td>

                        <td className="px-4 py-3 whitespace-nowrap">
                          {a.clockInTime ? (
                            <span className="font-bold text-slate-900">{formatTime12(a.clockInTime)}</span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>

                        <td className="px-4 py-3 whitespace-nowrap">
                          {a.clockOutTime ? (
                            <span className="font-bold text-slate-900">{formatTime12(a.clockOutTime)}</span>
                          ) : a.clockInTime ? (
                            <span className="text-amber-600 font-semibold">In Progress</span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>

                        <td className="px-4 py-3 whitespace-nowrap font-bold text-slate-900">
                          {a.totalHours > 0 ? `${a.totalHours.toFixed(1)} hrs` : "—"}
                        </td>

                        <td className="px-4 py-3 whitespace-nowrap">
                          {a.status === "clocked_out" && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              Clocked Out
                            </span>
                          )}
                          {a.status === "clocked_in" && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-800">
                              <Clock className="w-3 h-3 text-blue-600" />
                              Clocked In
                            </span>
                          )}
                          {a.status === "marked" && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                              <Check className="w-3 h-3 text-emerald-600" />
                              Marked
                            </span>
                          )}
                          {a.status === "scheduled" && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                              <Calendar className="w-3 h-3 text-slate-400" />
                              Scheduled
                            </span>
                          )}
                          {a.status === "no_record" && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                              <AlertCircle className="w-3 h-3 text-amber-600" />
                              No Record
                            </span>
                          )}
                        </td>

                        <td className="px-4 py-3 max-w-xs truncate text-slate-600" title={a.notes}>
                          {a.notes || <span className="text-slate-300 italic">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

import { useState, useMemo } from "react";
import { redirect, useLoaderData, Link } from "react-router";
import { getUserFromRequest } from "../../utils/auth.server.js";
import { User } from "../../models/user.server.js";
import { Rota } from "../../models/rota.server.js";
import { Attendance } from "../../models/attendance.server.js";
import { connect } from "../../config/db.server.js";
import {
  UserCheck, Users, ClipboardList, CheckCircle2, Clock, XCircle,
  FileSpreadsheet, Search, Filter, Calendar, ChevronRight,
  ShieldCheck, AlertTriangle, ArrowUpRight, Phone, Mail,
  CalendarClock, Building2, Check, User as UserIcon
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
  const query = {
    roles: { $in: ["STAFF", "EMPLOYEE", "ADMIN", "REGISTERED_MANAGER", "FIELD_WORKER"] },
    deleted: false,
  };
  const orgQuery = {};

  if (!isSuperAdmin && user.organizationId) {
    query.organizationId = user.organizationId;
    orgQuery.organizationId = user.organizationId;
  }

  // Fetch staff users, rota tasks, and attendance records in parallel
  const rotaFilter = { deleted: false, ...orgQuery };
  const attFilter = { ...orgQuery };

  const [staffUsers, rotaTasks, attendanceRecords] = await Promise.all([
    User.find(query).sort({ firstName: 1 }).lean(),
    Rota.find(rotaFilter)
      .populate("employee", "firstName lastName title email phone jobTitle roles")
      .populate("assignedTo", "firstName lastName companyName landlordData email phone")
      .populate("taskUpdatedBy", "firstName lastName email")
      .sort({ date: -1, startTime: -1 })
      .lean(),
    Attendance.find(attFilter)
      .populate("user", "firstName lastName email phone jobTitle")
      .sort({ date: -1, createdAt: -1 })
      .lean(),
  ]);

  // 4. Format all tasks
  const allTasks = rotaTasks.map((t) => {
    const emp = t.employee;
    const staffName = emp
      ? `${emp.title ? emp.title + " " : ""}${emp.firstName || ""} ${emp.lastName || ""}`.trim() || emp.email
      : (t.employeeName || "Staff Member");

    const clientObj = t.assignedTo;
    const clientName = clientObj
      ? (clientObj.companyName || clientObj.landlordData?.companyName || `${clientObj.firstName || ""} ${clientObj.lastName || ""}`.trim())
      : (t.assignedToName || "General Shift");

    return {
      _id: t._id.toString(),
      title: t.title || "Assigned Task",
      description: t.description || "",
      date: t.date ? t.date.toISOString() : null,
      startTime: t.startTime || "",
      endTime: t.endTime || "",
      staffId: emp?._id?.toString() || "",
      staffName,
      staffEmail: emp?.email || "",
      staffPhone: emp?.phone || "",
      staffJobTitle: emp?.jobTitle || "",
      clientId: clientObj?._id?.toString() || "",
      clientName,
      taskStatus: t.taskStatus || "pending",
      taskNotes: t.taskNotes || "",
      taskReasonIfNotDone: t.taskReasonIfNotDone || "",
      taskUpdatedAt: t.taskUpdatedAt ? t.taskUpdatedAt.toISOString() : null,
      taskUpdatedBy: t.taskUpdatedBy
        ? `${t.taskUpdatedBy.firstName || ""} ${t.taskUpdatedBy.lastName || ""}`.trim() || t.taskUpdatedBy.email
        : "",
    };
  });

  // 5. Format all attendance time clock logs
  const allAttendance = attendanceRecords.map((att) => {
    const emp = att.user;
    const staffName = emp
      ? `${emp.firstName || ""} ${emp.lastName || ""}`.trim() || emp.email
      : (att.userName || "Staff");

    return {
      _id: att._id.toString(),
      date: att.date ? att.date.toISOString() : (att.createdAt ? att.createdAt.toISOString() : null),
      staffId: emp?._id?.toString() || att.user?.toString() || "",
      staffName,
      staffEmail: emp?.email || "",
      staffJobTitle: emp?.jobTitle || "",
      clockInTime: att.clockInTime?.toISOString() || att.markedAt?.toISOString() || null,
      clockOutTime: att.clockOutTime?.toISOString() || null,
      totalHours: att.totalHours || 0,
      status: att.status || "marked",
      notes: att.notes || "",
    };
  });

  // 6. Per-Staff Summaries
  const staffSummaries = staffUsers.map((s) => {
    const sId = s._id.toString();
    const fullName = `${s.title ? s.title + " " : ""}${s.firstName || ""} ${s.lastName || ""}`.trim();
    const name = fullName || s.email;

    const sTasks = allTasks.filter((t) => t.staffId === sId);
    const sAtt = allAttendance.filter((a) => a.staffId === sId);

    const completed = sTasks.filter((t) => t.taskStatus === "completed").length;
    const pending = sTasks.filter((t) => t.taskStatus === "pending").length;
    const notCompleted = sTasks.filter((t) => t.taskStatus === "not_completed").length;
    const hours = sAtt.reduce((sum, curr) => sum + (Number(curr.totalHours) || 0), 0);
    const attended = sAtt.filter((a) => a.status === "clocked_out" || a.status === "clocked_in" || a.status === "marked").length;

    return {
      _id: sId,
      name,
      jobTitle: s.jobTitle || s.roles?.[0] || "Staff",
      email: s.email || "",
      phone: s.phone || "",
      totalTasks: sTasks.length,
      completedTasks: completed,
      pendingTasks: pending,
      notCompletedTasks: notCompleted,
      completionRate: sTasks.length > 0 ? Math.round((completed / sTasks.length) * 100) : 0,
      attendanceSessions: sAtt.length,
      totalHours: hours,
      status: s.status ?? 1,
    };
  });

  // Overall Statistics
  const totalCompleted = allTasks.filter((t) => t.taskStatus === "completed").length;
  const totalHoursClocked = allAttendance.reduce((sum, curr) => sum + (Number(curr.totalHours) || 0), 0);

  const stats = {
    totalStaff: staffUsers.length,
    totalShifts: allTasks.length,
    completedTasks: totalCompleted,
    completionRate: allTasks.length > 0 ? Math.round((totalCompleted / allTasks.length) * 100) : 0,
    totalHoursClocked,
    totalAttendanceSessions: allAttendance.length,
  };

  return {
    stats,
    staffSummaries,
    allTasks,
    allAttendance,
    staffList: staffUsers.map((s) => ({
      _id: s._id.toString(),
      name: `${s.title ? s.title + " " : ""}${s.firstName || ""} ${s.lastName || ""}`.trim() || s.email,
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

function exportStaffSummaryCSV(staff) {
  const headers = ["Staff Name", "Job Title", "Email", "Phone", "Total Shifts", "Completed Tasks", "Pending Tasks", "Not Done", "Completion %", "Clock Sessions", "Total Hours", "Status"];
  const rows = staff.map((s) => [
    `"${s.name.replace(/"/g, '""')}"`,
    `"${(s.jobTitle || "").replace(/"/g, '""')}"`,
    `"${(s.email || "").replace(/"/g, '""')}"`,
    `"${(s.phone || "").replace(/"/g, '""')}"`,
    s.totalTasks,
    s.completedTasks,
    s.pendingTasks,
    s.notCompletedTasks,
    `${s.completionRate}%`,
    s.attendanceSessions,
    s.totalHours.toFixed(1),
    s.status === 1 ? "Active" : "Inactive",
  ]);
  const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Organization_Staff_Report_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function StaffReportPage() {
  const { stats, staffSummaries, allTasks, allAttendance, staffList } = useLoaderData();
  const [activeTab, setActiveTab] = useState("overview"); // "overview" | "tasks" | "attendance"

  // Staff search
  const [staffSearch, setStaffSearch] = useState("");

  const filteredStaff = useMemo(() => {
    if (!staffSearch.trim()) return staffSummaries;
    const q = staffSearch.toLowerCase();
    return staffSummaries.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.email.toLowerCase().includes(q) ||
        s.jobTitle.toLowerCase().includes(q) ||
        s.phone.toLowerCase().includes(q)
    );
  }, [staffSummaries, staffSearch]);

  // Tasks filter
  const [taskStaffFilter, setTaskStaffFilter] = useState("all");
  const [taskStatusFilter, setTaskStatusFilter] = useState("all");
  const [taskSearch, setTaskSearch] = useState("");

  const filteredTasks = useMemo(() => {
    return allTasks.filter((t) => {
      if (taskStaffFilter !== "all" && t.staffId !== taskStaffFilter) return false;
      if (taskStatusFilter !== "all" && t.taskStatus !== taskStatusFilter) return false;
      if (taskSearch.trim()) {
        const q = taskSearch.toLowerCase();
        const matchTitle = t.title?.toLowerCase().includes(q);
        const matchStaff = t.staffName?.toLowerCase().includes(q);
        const matchClient = t.clientName?.toLowerCase().includes(q);
        const matchNotes = t.taskNotes?.toLowerCase().includes(q);
        if (!matchTitle && !matchStaff && !matchClient && !matchNotes) return false;
      }
      return true;
    });
  }, [allTasks, taskStaffFilter, taskStatusFilter, taskSearch]);

  // Attendance filter
  const [attStaffFilter, setAttStaffFilter] = useState("all");
  const [attSearch, setAttSearch] = useState("");

  const filteredAttendance = useMemo(() => {
    return allAttendance.filter((a) => {
      if (attStaffFilter !== "all" && a.staffId !== attStaffFilter) return false;
      if (attSearch.trim()) {
        const q = attSearch.toLowerCase();
        const matchStaff = a.staffName?.toLowerCase().includes(q);
        const matchNotes = a.notes?.toLowerCase().includes(q);
        if (!matchStaff && !matchNotes) return false;
      }
      return true;
    });
  }, [allAttendance, attStaffFilter, attSearch]);

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
              <h1 className="text-3xl font-bold text-gray-900 mt-1">Staff Reports</h1>
              <p className="mt-1 text-sm text-gray-600">
                Organization-wide overview of staff shifts, task completion, clock-in/out verification, and total hours worked.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => exportStaffSummaryCSV(staffSummaries)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition shadow-xs cursor-pointer"
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                Export Staff Report
              </button>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex gap-2 mt-6 border-b border-gray-200 overflow-x-auto">
            {[
              { key: "overview",   label: "Staff Summary", count: staffSummaries.length },
              { key: "tasks",      label: "Staff Tasks & Handover Reports", count: allTasks.length },
              { key: "attendance", label: "Attendance & Clock Logs", count: allAttendance.length },
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
        {/* KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total Staff</p>
              <UserCheck className="w-4 h-4 text-slate-400" />
            </div>
            <p className="text-2xl font-bold text-slate-900 mt-2">{stats.totalStaff}</p>
            <p className="text-xs text-slate-500 mt-1">Active team members</p>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Assigned Shifts</p>
              <ClipboardList className="w-4 h-4 text-slate-400" />
            </div>
            <p className="text-2xl font-bold text-slate-900 mt-2">{stats.totalShifts}</p>
            <p className="text-xs text-slate-500 mt-1">Total tasks scheduled</p>
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
            <p className="text-xs text-emerald-600 mt-1">Task completion rate</p>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-indigo-700">Total Hours Clocked</p>
              <Clock className="w-4 h-4 text-indigo-600" />
            </div>
            <p className="text-2xl font-bold text-indigo-900 mt-2">{stats.totalHoursClocked.toFixed(1)} hrs</p>
            <p className="text-xs text-indigo-600 mt-1">{stats.totalAttendanceSessions} clock sessions</p>
          </div>
        </div>

        {/* Tab 1: Staff Overview */}
        {activeTab === "overview" && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-xs overflow-hidden">
            <div className="p-5 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-gray-900">Staff Performance Breakdown</h2>
                <p className="text-xs text-gray-500 mt-0.5">Overview of assigned shifts, task delivery, and total hours worked for each team member</p>
              </div>
              <div className="relative w-full sm:w-72">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={staffSearch}
                  onChange={(e) => setStaffSearch(e.target.value)}
                  placeholder="Search staff by name, role, email..."
                  className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
                <thead className="bg-slate-50 font-bold text-slate-600 uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="px-4 py-3">Staff Member</th>
                    <th className="px-4 py-3">Role / Title</th>
                    <th className="px-4 py-3">Contact</th>
                    <th className="px-4 py-3 text-center">Total Shifts</th>
                    <th className="px-4 py-3 text-center">Completed</th>
                    <th className="px-4 py-3 text-center">Pending</th>
                    <th className="px-4 py-3 text-center">Not Done</th>
                    <th className="px-4 py-3 text-center">Completion %</th>
                    <th className="px-4 py-3 text-center">Clocked Hours</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                  {filteredStaff.map((staff) => (
                    <tr key={staff._id} className="hover:bg-slate-50/80 transition">
                      <td className="px-4 py-3.5">
                        <Link
                          to={`/user-accounts/staff/${staff._id}`}
                          className="font-bold text-slate-900 hover:text-indigo-600 transition block truncate max-w-xs"
                        >
                          {staff.name}
                        </Link>
                      </td>

                      <td className="px-4 py-3.5 text-slate-600 whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[11px] font-medium">
                          {staff.jobTitle}
                        </span>
                      </td>

                      <td className="px-4 py-3.5 text-slate-500 whitespace-nowrap">
                        {staff.email ? <div className="truncate max-w-[180px]">{staff.email}</div> : null}
                        {staff.phone ? <div className="text-[11px] text-slate-400">{staff.phone}</div> : null}
                      </td>

                      <td className="px-4 py-3.5 text-center font-bold text-slate-900">{staff.totalTasks}</td>

                      <td className="px-4 py-3.5 text-center">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          {staff.completedTasks}
                        </span>
                      </td>

                      <td className="px-4 py-3.5 text-center">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                          {staff.pendingTasks}
                        </span>
                      </td>

                      <td className="px-4 py-3.5 text-center">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-red-50 text-red-700 border border-red-200">
                          {staff.notCompletedTasks}
                        </span>
                      </td>

                      <td className="px-4 py-3.5 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <div className="w-16 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                            <div
                              className="bg-emerald-500 h-1.5 rounded-full"
                              style={{ width: `${Math.min(100, staff.completionRate)}%` }}
                            />
                          </div>
                          <span className="font-bold text-slate-800 text-[11px]">{staff.completionRate}%</span>
                        </div>
                      </td>

                      <td className="px-4 py-3.5 text-center font-bold text-indigo-700">
                        {staff.totalHours > 0 ? `${staff.totalHours.toFixed(1)} hrs` : "—"}
                      </td>

                      <td className="px-4 py-3.5 text-right whitespace-nowrap">
                        <Link
                          to={`/user-accounts/staff/${staff._id}`}
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

        {/* Tab 2: Staff Tasks */}
        {activeTab === "tasks" && (
          <div className="space-y-4">
            {/* Filter Bar */}
            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2 flex-wrap">
                <select
                  value={taskStaffFilter}
                  onChange={(e) => setTaskStaffFilter(e.target.value)}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs bg-white text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                >
                  <option value="all">All Staff ({staffList.length})</option>
                  {staffList.map((s) => (
                    <option key={s._id} value={s._id}>{s.name}</option>
                  ))}
                </select>

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
                  placeholder="Search task, staff, client, notes..."
                  className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>
            </div>

            {/* Task Cards */}
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
                        <span className="text-xs font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded">
                          Staff: {t.staffName}
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
                        <span className="text-[11px] text-slate-500">Client: <strong className="text-indigo-700">{t.clientName}</strong></span>
                        <Link to={`/user-accounts/staff/${t.staffId}`} className="text-indigo-600 hover:text-indigo-800 text-[11px] font-semibold flex items-center gap-1">
                          Staff profile &rarr;
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

        {/* Tab 3: Attendance */}
        {activeTab === "attendance" && (
          <div className="space-y-4">
            {/* Filter Bar */}
            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <select
                  value={attStaffFilter}
                  onChange={(e) => setAttStaffFilter(e.target.value)}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs bg-white text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                >
                  <option value="all">All Staff ({staffList.length})</option>
                  {staffList.map((s) => (
                    <option key={s._id} value={s._id}>{s.name}</option>
                  ))}
                </select>
              </div>

              <div className="relative w-full sm:w-72">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={attSearch}
                  onChange={(e) => setAttSearch(e.target.value)}
                  placeholder="Search staff, notes..."
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
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Staff Member</th>
                      <th className="px-4 py-3">Clock-In Time</th>
                      <th className="px-4 py-3">Clock-Out Time</th>
                      <th className="px-4 py-3">Total Duration</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                    {filteredAttendance.map((a) => (
                      <tr key={a._id} className="hover:bg-slate-50/80 transition">
                        <td className="px-4 py-3 whitespace-nowrap font-bold text-slate-900">
                          {formatDateDisplay(a.date)}
                        </td>

                        <td className="px-4 py-3 whitespace-nowrap">
                          <Link to={`/user-accounts/staff/${a.staffId}`} className="font-semibold text-slate-900 hover:text-indigo-600">
                            {a.staffName}
                          </Link>
                          {a.staffJobTitle && (
                            <span className="text-[10px] text-slate-400 block">{a.staffJobTitle}</span>
                          )}
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
                              Marked Present
                            </span>
                          )}
                          {!["clocked_out", "clocked_in", "marked"].includes(a.status) && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700">
                              {a.status}
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

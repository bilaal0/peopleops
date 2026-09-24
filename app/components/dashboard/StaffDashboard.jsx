import { useState, useEffect } from "react";
import { Link, useFetcher, useRevalidator } from "react-router";
import {
  UserCheck,
  ArrowRight,
  CalendarClock,
  Clock,
  Building2,
  FileText,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Edit3,
  Check,
  Calendar,
  History,
  CalendarDays,
  ShieldCheck,
  ClipboardList,
} from "lucide-react";

function formatTime12(dateObjOrString) {
  if (!dateObjOrString) return "—";
  try {
    const d = new Date(dateObjOrString);
    if (!isNaN(d.getTime())) {
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true });
    }
    const [h, m] = dateObjOrString.split(":");
    const hour = parseInt(h, 10);
    const min = m || "00";
    const period = hour >= 12 ? "PM" : "AM";
    const hour12 = hour % 12 || 12;
    return `${hour12}:${min} ${period}`;
  } catch {
    return dateObjOrString;
  }
}

function formatDateDisplay(isoOrString) {
  if (!isoOrString) return "—";
  try {
    const d = new Date(isoOrString);
    if (isNaN(d.getTime())) return isoOrString;
    return d.toLocaleDateString("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return isoOrString;
  }
}

export default function StaffDashboard({
  user,
  dashboardData,
  organization,
  todayAttendance,
  attendanceHistory = [],
  previousTasks = [],
}) {
  const { todayRota } = dashboardData || { todayRota: [] };
  const { revalidate } = useRevalidator();

  // Fetchers for background actions
  const attendanceFetcher = useFetcher();
  const taskFetcher = useFetcher();

  // Active attendance state
  const currentAttendance = attendanceFetcher.data?.record || todayAttendance;
  const isMarkedToday = Boolean(currentAttendance);

  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [activeTab, setActiveTab] = useState("today_tasks"); // "today_tasks" | "previous_tasks" | "attendance_history"

  // Task Update Modal State
  const [activeTaskModal, setActiveTaskModal] = useState(null);
  const [taskStatus, setTaskStatus] = useState("completed");
  const [taskNotes, setTaskNotes] = useState("");
  const [taskReasonIfNotDone, setTaskReasonIfNotDone] = useState("");
  const [formError, setFormError] = useState("");

  const openTaskModal = (task) => {
    setActiveTaskModal(task);
    setTaskStatus(task.taskStatus === "not_completed" ? "not_completed" : "completed");
    setTaskNotes(task.taskNotes || "");
    setTaskReasonIfNotDone(task.taskReasonIfNotDone || "");
    setFormError("");
  };

  const closeTaskModal = () => {
    setActiveTaskModal(null);
    setFormError("");
  };

  const handleConfirmAttendance = () => {
    attendanceFetcher.submit(
      { _intent: "mark_attendance" },
      { method: "post", action: "/api/attendance" }
    );
  };

  // Close confirmation modal on success
  useEffect(() => {
    if (attendanceFetcher.state === "idle" && attendanceFetcher.data?.success) {
      setShowConfirmModal(false);
      revalidate();
    }
  }, [attendanceFetcher.state, attendanceFetcher.data]);

  const handleTaskSubmit = (e) => {
    e.preventDefault();
    if (taskStatus === "not_completed" && !taskReasonIfNotDone.trim()) {
      setFormError("Please provide a reason why this task was not completed.");
      return;
    }

    taskFetcher.submit(
      {
        rotaId: activeTaskModal._id,
        taskStatus,
        taskNotes,
        taskReasonIfNotDone: taskStatus === "not_completed" ? taskReasonIfNotDone : "",
      },
      { method: "post", action: "/api/rota-task" }
    );
  };

  // Close modal when task submission succeeds
  useEffect(() => {
    if (taskFetcher.state === "idle" && taskFetcher.data?.success) {
      closeTaskModal();
      revalidate();
    }
  }, [taskFetcher.state, taskFetcher.data]);

  // Merged task records with any recently submitted task
  const updatedTasks = (todayRota || []).map((t) => {
    if (taskFetcher.data?.task && taskFetcher.data.task.id === t._id) {
      return { ...t, ...taskFetcher.data.task };
    }
    return t;
  });

  const currentDateFormatted = new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="mx-auto max-w-[1400px] p-6 space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Welcome back, {user.firstName || user.name}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {currentDateFormatted} • Here is your workspace and duty overview for today.
          </p>
        </div>
      </div>

      {/* Daily Attendance Card (Mark Attendance) */}
      <div
        className={`rounded-2xl border p-6 shadow-sm transition-all ${
          isMarkedToday
            ? "border-emerald-200 bg-gradient-to-br from-emerald-50/70 via-white to-emerald-50/30"
            : "border-slate-200/80 bg-gradient-to-br from-white to-slate-50"
        }`}
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-start gap-4">
            <div
              className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl transition-colors ${
                isMarkedToday
                  ? "bg-emerald-500 text-white shadow-md shadow-emerald-500/25"
                  : "bg-indigo-50 text-indigo-600"
              }`}
            >
              {isMarkedToday ? (
                <CheckCircle2 className="h-6 w-6" />
              ) : (
                <UserCheck className="h-6 w-6" />
              )}
            </div>

            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="text-lg font-bold text-slate-900">Daily Attendance</h2>
                {isMarkedToday ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 border border-emerald-300 px-3 py-0.5 text-xs font-bold text-emerald-800">
                    <Check className="h-3.5 w-3.5" />
                    Attendance Marked
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded-full bg-amber-50 border border-amber-200 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
                    Not Marked Yet
                  </span>
                )}
              </div>

              <div className="mt-1 text-sm text-slate-600">
                {isMarkedToday ? (
                  <span>
                    Your attendance for today was recorded at{" "}
                    <strong className="text-emerald-800 font-bold">
                      {formatTime12(currentAttendance.markedAt || currentAttendance.clockInTime)}
                    </strong>
                    .
                  </span>
                ) : (
                  <span>
                    Please mark your attendance for today ({currentDateFormatted}).
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Action Button */}
          <div className="flex items-center gap-3">
            {isMarkedToday ? (
              <button
                type="button"
                disabled
                className="flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-300 px-5 py-2.5 text-sm font-bold text-emerald-700 opacity-90 cursor-default"
              >
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                Marked for Today
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setShowConfirmModal(true)}
                className="flex items-center gap-2 rounded-xl bg-[#1e3a5f] px-6 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-[#162d4a] active:scale-[0.98] transition cursor-pointer"
              >
                <UserCheck className="h-4 w-4" />
                Mark Attendance
              </button>
            )}
          </div>
        </div>

        {attendanceFetcher.data?.error && (
          <div className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700 border border-red-200 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{attendanceFetcher.data.error}</span>
          </div>
        )}
      </div>

      {/* Role & Org Info Card */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
            <UserCheck className="h-6 w-6" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-500">Your Role</p>
            <p className="text-xl font-bold text-slate-900 capitalize">{user.jobTitle || "Staff Member"}</p>
          </div>
        </div>

        {organization && (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <Building2 className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-500">Organization</p>
              <p className="text-xl font-bold text-slate-900">{organization.name}</p>
            </div>
          </div>
        )}
      </div>

      {/* Main Content: Tasks & Attendance Tabs + Quick Links */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-4">
          {/* Sub-Navigation Tabs */}
          <div className="flex items-center justify-between border-b border-slate-200 pb-2">
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => setActiveTab("today_tasks")}
                className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-bold transition cursor-pointer ${
                  activeTab === "today_tasks"
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
                }`}
              >
                <ClipboardList className="h-3.5 w-3.5" />
                Today's Tasks ({updatedTasks?.length || 0})
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("previous_tasks")}
                className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-bold transition cursor-pointer ${
                  activeTab === "previous_tasks"
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
                }`}
              >
                <CalendarDays className="h-3.5 w-3.5" />
                Previous Tasks ({previousTasks?.length || 0})
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("attendance_history")}
                className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-bold transition cursor-pointer ${
                  activeTab === "attendance_history"
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
                }`}
              >
                <History className="h-3.5 w-3.5" />
                Attendance Record ({attendanceHistory?.length || 0})
              </button>
            </div>

            <Link
              to="/rota"
              className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 shrink-0"
            >
              Full Calendar <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          {/* TAB 1: Today's Tasks */}
          {activeTab === "today_tasks" && (
            <div className="space-y-3">
              {updatedTasks?.length > 0 ? (
                updatedTasks.map((shift) => {
                  const isCompleted = shift.taskStatus === "completed";
                  const isNotCompleted = shift.taskStatus === "not_completed";
                  const isPending = !isCompleted && !isNotCompleted;

                  return (
                    <div
                      key={shift._id}
                      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:border-slate-300 transition"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-slate-100">
                        <div className="flex items-center gap-3">
                          <div
                            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                              isCompleted
                                ? "bg-emerald-50 text-emerald-600"
                                : isNotCompleted
                                ? "bg-red-50 text-red-600"
                                : "bg-indigo-50 text-indigo-600"
                            }`}
                          >
                            {isCompleted ? (
                              <CheckCircle2 className="h-5 w-5" />
                            ) : isNotCompleted ? (
                              <XCircle className="h-5 w-5" />
                            ) : (
                              <CalendarClock className="h-5 w-5" />
                            )}
                          </div>
                          <div>
                            <h3 className="font-bold text-slate-900 text-base">{shift.title || "Assigned Shift"}</h3>
                            <p className="text-xs text-slate-500">
                              {shift.assignedTo ? `Client: ${shift.assignedTo}` : "General Duty / Facility"}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                          <div className="flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-1 text-slate-700 text-xs font-bold">
                            <Clock className="h-3.5 w-3.5 text-slate-500" />
                            {shift.startTime} – {shift.endTime}
                          </div>

                          {isCompleted && (
                            <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700 border border-emerald-200">
                              <Check className="h-3.5 w-3.5" /> Completed
                            </span>
                          )}
                          {isNotCompleted && (
                            <span className="inline-flex items-center gap-1 rounded-lg bg-red-50 px-2.5 py-1 text-xs font-bold text-red-700 border border-red-200">
                              <XCircle className="h-3.5 w-3.5" /> Not Done
                            </span>
                          )}
                          {isPending && (
                            <span className="inline-flex items-center gap-1 rounded-lg bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700 border border-amber-200">
                              <AlertCircle className="h-3.5 w-3.5" /> Pending Status
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Task Description & Details */}
                      <div className="pt-3 space-y-2 text-sm">
                        {shift.description && (
                          <div className="text-slate-600 bg-slate-50/80 rounded-xl p-3 border border-slate-100">
                            <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block mb-1">
                              Shift Instructions / Purpose:
                            </span>
                            <p className="text-slate-700">{shift.description}</p>
                          </div>
                        )}

                        {isPending && (
                          <div className="mt-3 rounded-xl bg-amber-50/80 border border-amber-200/80 p-3 flex items-center justify-between gap-3 text-xs text-amber-900">
                            <div className="flex items-center gap-2">
                              <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
                              <span><strong>Note:</strong> Please submit a work report detailing task completion or reasons if incomplete.</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => openTaskModal(shift)}
                              className="shrink-0 font-bold text-indigo-700 hover:text-indigo-900 hover:underline cursor-pointer"
                            >
                              Add Report &rarr;
                            </button>
                          </div>
                        )}

                        {isNotCompleted && shift.taskReasonIfNotDone && (
                          <div className="rounded-xl bg-red-50 p-3 border border-red-200 text-red-900">
                            <span className="text-xs font-bold uppercase tracking-wider text-red-700 block mb-1">
                              Reason Not Completed:
                            </span>
                            <p className="text-sm font-medium">{shift.taskReasonIfNotDone}</p>
                          </div>
                        )}

                        {shift.taskNotes && (
                          <div className="rounded-xl bg-slate-50 p-3 border border-slate-100 text-slate-800">
                            <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block mb-1">
                              Your Notes / Details:
                            </span>
                            <p className="text-sm whitespace-pre-line">{shift.taskNotes}</p>
                          </div>
                        )}

                        <div className="flex justify-end pt-2">
                          <button
                            type="button"
                            onClick={() => openTaskModal(shift)}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition shadow-sm cursor-pointer"
                          >
                            <Edit3 className="h-3.5 w-3.5 text-indigo-600" />
                            {isPending ? "Update Task Status" : "Edit Task Report"}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-sm">
                  <Calendar className="h-8 w-8 mx-auto text-slate-300 mb-2" />
                  <p className="font-semibold text-slate-700">No Rota Tasks Scheduled For Today</p>
                  <p className="text-xs text-slate-400 mt-1">
                    When your manager schedules a rota for you, it will appear here as your task for the day.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: Previous Tasks History */}
          {activeTab === "previous_tasks" && (
            <div className="space-y-3">
              {previousTasks?.length > 0 ? (
                previousTasks.map((shift) => {
                  const isCompleted = shift.taskStatus === "completed";
                  const isNotDone = shift.taskStatus === "not_completed";

                  return (
                    <div
                      key={shift._id}
                      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:border-slate-300 transition"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                        <div className="flex items-start gap-3">
                          <div
                            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                              isCompleted
                                ? "bg-emerald-50 text-emerald-600"
                                : isNotDone
                                ? "bg-red-50 text-red-600"
                                : "bg-slate-100 text-slate-600"
                            }`}
                          >
                            {isCompleted ? (
                              <CheckCircle2 className="h-5 w-5" />
                            ) : isNotDone ? (
                              <XCircle className="h-5 w-5" />
                            ) : (
                              <Clock className="h-5 w-5" />
                            )}
                          </div>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="font-bold text-slate-900 text-base">{shift.title || "Assigned Shift"}</h3>
                              <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-700">
                                {formatDateDisplay(shift.date)}
                              </span>
                            </div>
                            <p className="text-xs text-slate-500 mt-0.5">
                              {shift.startTime} – {shift.endTime}
                              {shift.assignedTo && ` · Client: ${shift.assignedTo}`}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {isCompleted && (
                            <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700 border border-emerald-200">
                              <Check className="h-3.5 w-3.5" /> Completed
                            </span>
                          )}
                          {isNotDone && (
                            <span className="inline-flex items-center gap-1 rounded-lg bg-red-50 px-2.5 py-1 text-xs font-bold text-red-700 border border-red-200">
                              <XCircle className="h-3.5 w-3.5" /> Not Done
                            </span>
                          )}
                          {!isCompleted && !isNotDone && (
                            <span className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">
                              No Report
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => openTaskModal(shift)}
                            className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 transition shadow-sm cursor-pointer"
                          >
                            <Edit3 className="h-3.5 w-3.5 text-indigo-600" />
                            {isCompleted || isNotDone ? "Edit Report" : "Add Report"}
                          </button>
                        </div>
                      </div>

                      {(shift.taskNotes || shift.taskReasonIfNotDone) && (
                        <div className="mt-3 space-y-2 text-xs">
                          {shift.taskReasonIfNotDone && (
                            <div className="rounded-xl bg-red-50 border border-red-200 p-2.5 text-red-900">
                              <span className="font-bold block mb-0.5">Reason Not Completed:</span>
                              {shift.taskReasonIfNotDone}
                            </div>
                          )}
                          {shift.taskNotes && (
                            <div className="rounded-xl bg-slate-50 border border-slate-100 p-2.5 text-slate-800">
                              <span className="font-bold block text-slate-500 mb-0.5">Work Notes:</span>
                              <p className="whitespace-pre-line">{shift.taskNotes}</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              ) : (
                <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-sm">
                  <CalendarDays className="h-8 w-8 mx-auto text-slate-300 mb-2" />
                  <p className="font-semibold text-slate-700">No Previous Tasks Recorded</p>
                  <p className="text-xs text-slate-400 mt-1">
                    Your previous shifts and tasks history will be archived here.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: Attendance History Record */}
          {activeTab === "attendance_history" && (
            <div className="space-y-3">
              {attendanceHistory?.length > 0 ? (
                <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500 border-b border-slate-200">
                      <tr>
                        <th className="px-5 py-3 font-bold">Date</th>
                        <th className="px-5 py-3 font-bold">Marked Time</th>
                        <th className="px-5 py-3 font-bold">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {attendanceHistory.map((rec) => (
                        <tr key={rec._id} className="hover:bg-slate-50/60 transition">
                          <td className="px-5 py-3.5 font-semibold text-slate-900 whitespace-nowrap">
                            {formatDateDisplay(rec.date)}
                          </td>
                          <td className="px-5 py-3.5 whitespace-nowrap font-medium text-slate-800">
                            {formatTime12(rec.markedAt || rec.clockInTime)}
                          </td>
                          <td className="px-5 py-3.5 whitespace-nowrap">
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-xs font-bold text-emerald-700">
                              <Check className="h-3 w-3" /> Present / Marked
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-sm">
                  <History className="h-8 w-8 mx-auto text-slate-300 mb-2" />
                  <p className="font-semibold text-slate-700">No Attendance Records Found</p>
                  <p className="text-xs text-slate-400 mt-1">
                    When you mark attendance, your logs will be archived here.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Quick Links & Shortcuts */}
        <div className="space-y-4">
          <h2 className="text-lg font-bold text-slate-900">Quick Links</h2>
          <div className="flex flex-col gap-3">
            <Link
              to="/attendance"
              className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:border-indigo-300 hover:shadow-md transition group"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 group-hover:bg-indigo-100 transition">
                  <ClipboardList className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-semibold text-slate-800 group-hover:text-slate-900 transition">Attendance & Tasks</p>
                  <p className="text-xs text-slate-400">View logs & submit shift reports</p>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-slate-400 group-hover:text-indigo-600 transition" />
            </Link>

            <Link
              to="/documents"
              className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:border-indigo-300 hover:shadow-md transition group"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 group-hover:bg-emerald-100 transition">
                  <FileText className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-semibold text-slate-800 group-hover:text-slate-900 transition">My Documents</p>
                  <p className="text-xs text-slate-400">View contracts, certificates, and records</p>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-slate-400 group-hover:text-indigo-600 transition" />
            </Link>

            <Link
              to="/rota"
              className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:border-indigo-300 hover:shadow-md transition group"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-50 text-purple-600 group-hover:bg-purple-100 transition">
                  <Calendar className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-semibold text-slate-800 group-hover:text-slate-900 transition">Rota Calendar</p>
                  <p className="text-xs text-slate-400">View upcoming shifts & schedule</p>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-slate-400 group-hover:text-indigo-600 transition" />
            </Link>
          </div>
        </div>
      </div>

      {/* Confirmation Modal (Surety Check for Mark Attendance) */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl space-y-5 animate-in zoom-in-95 duration-150">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">Confirm Attendance</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Are you sure you want to mark your attendance for today?
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-1.5 text-xs text-slate-600">
              <p>
                <strong className="text-slate-900">Date:</strong> {currentDateFormatted}
              </p>
              <p>
                <strong className="text-slate-900">Staff:</strong> {user?.name || `${user?.firstName || ""} ${user?.lastName || ""}`.trim()}
              </p>
            </div>

            {attendanceFetcher.data?.error && (
              <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-xs text-red-700 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{attendanceFetcher.data.error}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={attendanceFetcher.state !== "idle"}
                onClick={handleConfirmAttendance}
                className="px-5 py-2 rounded-xl bg-[#1e3a5f] text-sm font-bold text-white hover:bg-[#162d4a] active:scale-95 transition disabled:opacity-50 cursor-pointer shadow-md shadow-[#1e3a5f]/20"
              >
                {attendanceFetcher.state !== "idle" ? "Marking..." : "Yes, Mark Attendance"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Task Update Modal */}
      {activeTaskModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Report Today's Task</h3>
                <p className="text-xs text-slate-500">
                  {activeTaskModal.title} ({activeTaskModal.startTime} - {activeTaskModal.endTime})
                </p>
              </div>
              <button
                type="button"
                onClick={closeTaskModal}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition cursor-pointer text-xl leading-none"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleTaskSubmit} className="space-y-4">
              {/* Task Report Note guidance */}
              <div className="rounded-xl bg-indigo-50/80 border border-indigo-200/80 p-3.5 flex items-start gap-2.5 text-xs text-indigo-950">
                <ClipboardList className="h-4 w-4 shrink-0 text-indigo-600 mt-0.5" />
                <div>
                  <span className="font-bold block text-indigo-900 mb-0.5">Task Report Note</span>
                  <span>Please add your report about this task. Detail what was completed, key observations, or specify the reason if the task was not completed.</span>
                </div>
              </div>

              {/* Task Status Selector */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-2">
                  Task Completion Status <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setTaskStatus("completed");
                      setFormError("");
                    }}
                    className={`flex items-center justify-center gap-2 rounded-xl p-3 border text-sm font-bold transition cursor-pointer ${
                      taskStatus === "completed"
                        ? "border-emerald-600 bg-emerald-50 text-emerald-800 ring-2 ring-emerald-500/20"
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    Task Completed (Done)
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setTaskStatus("not_completed");
                      setFormError("");
                    }}
                    className={`flex items-center justify-center gap-2 rounded-xl p-3 border text-sm font-bold transition cursor-pointer ${
                      taskStatus === "not_completed"
                        ? "border-red-600 bg-red-50 text-red-800 ring-2 ring-red-500/20"
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <XCircle className="h-4 w-4 text-red-600" />
                    Not Completed
                  </button>
                </div>
              </div>

              {/* If Not Done: Reason Input (Required) */}
              {taskStatus === "not_completed" && (
                <div className="space-y-1.5 animate-in fade-in duration-150">
                  <label className="block text-xs font-bold uppercase tracking-wider text-red-600">
                    Why was this task not completed? <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    rows={3}
                    required
                    value={taskReasonIfNotDone}
                    onChange={(e) => {
                      setTaskReasonIfNotDone(e.target.value);
                      if (formError) setFormError("");
                    }}
                    placeholder="Provide specific details explaining why the task could not be done..."
                    className="w-full rounded-xl border border-red-300 bg-red-50/30 p-3 text-sm text-slate-800 placeholder-slate-400 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-200"
                  />
                </div>
              )}

              {/* Work Details / Notes */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">
                  Task Details & Work Report
                </label>
                <textarea
                  rows={3}
                  value={taskNotes}
                  onChange={(e) => setTaskNotes(e.target.value)}
                  placeholder="Describe what was accomplished, any incidents, or general notes regarding this shift..."
                  className="w-full rounded-xl border border-slate-200 p-3 text-sm text-slate-800 placeholder-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                />
              </div>

              {formError && (
                <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700 border border-red-200 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {taskFetcher.data?.error && (
                <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700 border border-red-200 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{taskFetcher.data.error}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={closeTaskModal}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={taskFetcher.state !== "idle"}
                  className="rounded-xl bg-indigo-600 px-5 py-2 text-sm font-bold text-white shadow-sm hover:bg-indigo-700 active:scale-[0.98] transition cursor-pointer disabled:opacity-50"
                >
                  {taskFetcher.state !== "idle" ? "Saving..." : "Save Report"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

import { useState, useEffect } from "react";
import { useLoaderData, useFetcher, useRevalidator } from "react-router";
import {
  UserCheck,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  CalendarClock,
  Check,
  Edit3,
  Calendar,
  ClipboardList,
  RefreshCw,
  History,
  ShieldCheck,
  CalendarDays,
} from "lucide-react";

function formatTime12(isoOrString) {
  if (!isoOrString) return "—";
  try {
    const d = new Date(isoOrString);
    if (!isNaN(d.getTime())) {
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true });
    }
    // Handle HH:MM time strings
    const [h, m] = isoOrString.split(":");
    const hour = parseInt(h, 10);
    const min = m || "00";
    const period = hour >= 12 ? "PM" : "AM";
    const hour12 = hour % 12 || 12;
    return `${hour12}:${min} ${period}`;
  } catch {
    return isoOrString;
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

function TaskUpdateModal({ task, onClose, onSubmit, isSubmitting, serverError }) {
  const [status, setStatus] = useState(
    task.taskStatus === "not_completed" ? "not_completed" : "completed"
  );
  const [notes, setNotes] = useState(task.taskNotes || "");
  const [reason, setReason] = useState(task.taskReasonIfNotDone || "");
  const [localError, setLocalError] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    if (status === "not_completed" && !reason.trim()) {
      setLocalError("Please provide a reason why this task was not completed.");
      return;
    }
    setLocalError("");
    onSubmit({ status, notes, reason: status === "not_completed" ? reason : "" });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-slate-100">
          <div>
            <h2 className="text-base font-bold text-slate-900">Update Task Report</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {task.title} &nbsp;·&nbsp; {formatTime12(task.startTime)} – {formatTime12(task.endTime)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition text-xl leading-none cursor-pointer p-1 rounded-lg hover:bg-slate-100"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Note guidance */}
          <div className="rounded-xl bg-indigo-50/80 border border-indigo-200/80 p-3.5 flex items-start gap-2.5 text-xs text-indigo-950">
            <ClipboardList className="h-4 w-4 shrink-0 text-indigo-600 mt-0.5" />
            <div>
              <span className="font-bold block text-indigo-900 mb-0.5">Task Report Note</span>
              <span>Please add your work report for this task. Detail what was completed, any handover observations, or provide a specific reason if the task was not completed.</span>
            </div>
          </div>

          {/* Status selector */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-2">
              Task Completion Status <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => { setStatus("completed"); setLocalError(""); }}
                className={`flex items-center justify-center gap-2 rounded-xl border p-3 text-sm font-bold transition cursor-pointer ${
                  status === "completed"
                    ? "border-emerald-500 bg-emerald-50 text-emerald-800 ring-2 ring-emerald-400/25"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                Completed
              </button>
              <button
                type="button"
                onClick={() => { setStatus("not_completed"); setLocalError(""); }}
                className={`flex items-center justify-center gap-2 rounded-xl border p-3 text-sm font-bold transition cursor-pointer ${
                  status === "not_completed"
                    ? "border-red-500 bg-red-50 text-red-800 ring-2 ring-red-400/25"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                <XCircle className="h-4 w-4 text-red-600" />
                Not Completed
              </button>
            </div>
          </div>

          {/* Reason (required if not completed) */}
          {status === "not_completed" && (
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-red-600 mb-1.5">
                Why was it not completed? <span className="text-red-500">*</span>
              </label>
              <textarea
                rows={3}
                value={reason}
                onChange={(e) => { setReason(e.target.value); setLocalError(""); }}
                placeholder="Describe the reason(s) clearly..."
                className="w-full rounded-xl border border-red-300 bg-red-50/40 p-3 text-sm text-slate-800 placeholder-slate-400 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-200"
              />
            </div>
          )}

          {/* Work notes */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
              Work Notes / Details <span className="text-slate-400 font-normal normal-case">(optional)</span>
            </label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Describe what was done, any observations or handover notes..."
              className="w-full rounded-xl border border-slate-200 p-3 text-sm text-slate-800 placeholder-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            />
          </div>

          {(localError || serverError) && (
            <div className="rounded-xl bg-red-50 border border-red-200 p-3 flex items-start gap-2 text-sm text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{localError || serverError}</span>
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 rounded-xl bg-indigo-600 text-sm font-bold text-white hover:bg-indigo-700 transition active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              {isSubmitting ? "Saving..." : "Save Report"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function AttendancePage() {
  const {
    user,
    todayAttendance: initialAttendance,
    tasks: initialTasks,
    previousTasks = [],
    attendanceHistory = [],
  } = useLoaderData();

  const fetcher = useFetcher();
  const { revalidate } = useRevalidator();

  const [attendance, setAttendance] = useState(initialAttendance);
  const [tasks, setTasks] = useState(initialTasks);
  const [activeModal, setActiveModal] = useState(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [activeTab, setActiveTab] = useState("today_tasks"); // "today_tasks" | "previous_tasks" | "attendance_history"
  const [submitError, setSubmitError] = useState("");

  const isMarkedToday = Boolean(attendance);

  // Sync state when fetcher finishes
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data) {
      if (fetcher.data.success) {
        setSubmitError("");
        setShowConfirmModal(false);
        setActiveModal(null);
        revalidate();
      }
      if (fetcher.data.error) {
        setSubmitError(fetcher.data.error);
      }
    }
  }, [fetcher.state, fetcher.data]);

  // Sync tasks & attendance from loader after revalidation
  useEffect(() => {
    setAttendance(initialAttendance);
    setTasks(initialTasks);
  }, [initialAttendance, initialTasks]);

  const handleConfirmAttendance = () => {
    setSubmitError("");
    const fd = new FormData();
    fd.append("_intent", "mark_attendance");
    fetcher.submit(fd, { method: "post" });
  };

  const handleTaskUpdate = ({ status, notes, reason }) => {
    const fd = new FormData();
    fd.append("_intent", "update_task");
    fd.append("rotaId", activeModal._id);
    fd.append("taskStatus", status);
    fd.append("taskNotes", notes || "");
    fd.append("taskReasonIfNotDone", reason || "");
    fetcher.submit(fd, { method: "post" });
  };

  const todayFormatted = new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const pendingCount = (tasks || []).filter((t) => t.taskStatus === "pending").length;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Page Header */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2.5">
                <ClipboardList className="h-6 w-6 text-indigo-600" />
                Attendance & Tasks
              </h1>
              <p className="text-sm text-slate-500 mt-0.5">{todayFormatted}</p>
            </div>
            {pendingCount > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 border border-amber-200 px-3 py-1 text-xs font-bold text-amber-700">
                <AlertCircle className="h-3.5 w-3.5" />
                {pendingCount} task{pendingCount !== 1 ? "s" : ""} awaiting report
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* ── Attendance Card (Mark Attendance) ────────────────────────── */}
        <div
          className={`rounded-2xl border shadow-sm overflow-hidden transition-all ${
            isMarkedToday
              ? "border-emerald-200 bg-gradient-to-br from-emerald-50/70 via-white to-emerald-50/30"
              : "border-slate-200 bg-white"
          }`}
        >
          <div className="p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
              {/* Status Info */}
              <div className="flex items-start gap-4">
                <div
                  className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl transition-colors ${
                    isMarkedToday
                      ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/25"
                      : "bg-indigo-50 text-indigo-600"
                  }`}
                >
                  {isMarkedToday ? (
                    <CheckCircle2 className="h-7 w-7" />
                  ) : (
                    <UserCheck className="h-7 w-7" />
                  )}
                </div>

                <div className="flex-1">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <h2 className="text-lg font-bold text-slate-900">Daily Attendance</h2>
                    {isMarkedToday ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 border border-emerald-300 px-3 py-0.5 text-xs font-bold text-emerald-800">
                        <Check className="h-3.5 w-3.5" />
                        Attendance Marked
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-amber-50 border border-amber-200 px-2.5 py-0.5 text-xs font-bold text-amber-700">
                        Not Marked Yet
                      </span>
                    )}
                  </div>

                  <div className="mt-2 text-sm text-slate-600">
                    {isMarkedToday ? (
                      <div className="flex items-center gap-2 flex-wrap text-slate-700">
                        <span>
                          Your attendance for today was recorded at{" "}
                          <strong className="text-emerald-800 font-bold">
                            {formatTime12(attendance?.markedAt || attendance?.clockInTime)}
                          </strong>
                          .
                        </span>
                      </div>
                    ) : (
                      <span className="text-slate-500">
                        Click <strong>Mark Attendance</strong> to record your presence for today ({todayFormatted}).
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Action Button */}
              <div className="flex items-center gap-3 shrink-0">
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
                    onClick={() => {
                      setSubmitError("");
                      setShowConfirmModal(true);
                    }}
                    className="flex items-center gap-2 rounded-xl bg-[#1e3a5f] px-6 py-3 text-sm font-bold text-white shadow-md shadow-[#1e3a5f]/20 hover:bg-[#162d4a] active:scale-[0.98] transition cursor-pointer"
                  >
                    <UserCheck className="h-4 w-4" />
                    Mark Attendance
                  </button>
                )}
              </div>
            </div>

            {submitError && (
              <div className="mt-4 rounded-xl bg-red-50 border border-red-200 p-3 flex items-center gap-2 text-sm text-red-700">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {submitError}
              </div>
            )}
          </div>
        </div>

        {/* ── Tabs Navigation ─────────────────────────────────────────── */}
        <div className="flex items-center justify-between border-b border-slate-200 pb-2">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setActiveTab("today_tasks")}
              className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition cursor-pointer ${
                activeTab === "today_tasks"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
              }`}
            >
              <ClipboardList className="h-4 w-4" />
              Today's Tasks ({tasks?.length || 0})
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("previous_tasks")}
              className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition cursor-pointer ${
                activeTab === "previous_tasks"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
              }`}
            >
              <CalendarDays className="h-4 w-4" />
              Previous Tasks ({previousTasks?.length || 0})
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("attendance_history")}
              className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition cursor-pointer ${
                activeTab === "attendance_history"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
              }`}
            >
              <History className="h-4 w-4" />
              Attendance Record ({attendanceHistory?.length || 0})
            </button>
          </div>

          <button
            type="button"
            onClick={() => revalidate()}
            className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-indigo-600 transition"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>
        </div>

        {/* ── TAB 1: Today's Tasks ────────────────────────────────────── */}
        {activeTab === "today_tasks" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Today's Assigned Tasks</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Rota shifts and tasks assigned to you for today. Update each task status when complete.
                </p>
              </div>
            </div>

            {tasks.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center shadow-sm">
                <Calendar className="h-10 w-10 mx-auto text-slate-300 mb-3" />
                <p className="font-semibold text-slate-700">No Tasks Assigned For Today</p>
                <p className="text-xs text-slate-400 mt-1.5">
                  When your manager schedules a rota for today, it will appear here.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {tasks.map((task) => {
                  const isCompleted = task.taskStatus === "completed";
                  const isNotDone = task.taskStatus === "not_completed";
                  const isPending = task.taskStatus === "pending";

                  return (
                    <div
                      key={task._id}
                      className={`rounded-2xl border bg-white shadow-sm hover:shadow-md transition overflow-hidden ${
                        isCompleted
                          ? "border-emerald-200"
                          : isNotDone
                          ? "border-red-200"
                          : "border-slate-200"
                      }`}
                    >
                      <div
                        className={`h-1 ${
                          isCompleted ? "bg-emerald-500" : isNotDone ? "bg-red-500" : "bg-amber-400"
                        }`}
                      />

                      <div className="p-5">
                        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                          <div className="flex items-start gap-3">
                            <div
                              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                                isCompleted
                                  ? "bg-emerald-50 text-emerald-600"
                                  : isNotDone
                                  ? "bg-red-50 text-red-600"
                                  : "bg-indigo-50 text-indigo-600"
                              }`}
                            >
                              {isCompleted ? (
                                <CheckCircle2 className="h-5 w-5" />
                              ) : isNotDone ? (
                                <XCircle className="h-5 w-5" />
                              ) : (
                                <CalendarClock className="h-5 w-5" />
                              )}
                            </div>
                            <div>
                              <h3 className="font-bold text-slate-900">{task.title}</h3>
                              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                                  <Clock className="h-3 w-3" />
                                  {formatTime12(task.startTime)} – {formatTime12(task.endTime)}
                                </span>
                                {task.assignedTo && (
                                  <span className="text-xs text-slate-400">· Client: {task.assignedTo}</span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0 flex-wrap">
                            {isCompleted && (
                              <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 border border-emerald-200 px-2.5 py-1 text-xs font-bold text-emerald-700">
                                <Check className="h-3.5 w-3.5" /> Completed
                              </span>
                            )}
                            {isNotDone && (
                              <span className="inline-flex items-center gap-1 rounded-lg bg-red-50 border border-red-200 px-2.5 py-1 text-xs font-bold text-red-700">
                                <XCircle className="h-3.5 w-3.5" /> Not Done
                              </span>
                            )}
                            {isPending && (
                              <span className="inline-flex items-center gap-1 rounded-lg bg-amber-50 border border-amber-200 px-2.5 py-1 text-xs font-bold text-amber-700">
                                <AlertCircle className="h-3.5 w-3.5" /> Awaiting Report
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                setSubmitError("");
                                setActiveModal(task);
                              }}
                              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 transition shadow-sm cursor-pointer"
                            >
                              <Edit3 className="h-3.5 w-3.5" />
                              {isPending ? "Submit Report" : "Edit Report"}
                            </button>
                          </div>
                        </div>

                        {task.description && (
                          <div className="mt-3 rounded-xl bg-slate-50 border border-slate-100 p-3">
                            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                              Shift Instructions
                            </p>
                            <p className="text-sm text-slate-700">{task.description}</p>
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
                              onClick={() => {
                                setSubmitError("");
                                setActiveModal(task);
                              }}
                              className="shrink-0 font-bold text-indigo-700 hover:text-indigo-900 hover:underline cursor-pointer"
                            >
                              Add Report &rarr;
                            </button>
                          </div>
                        )}

                        {(task.taskNotes || task.taskReasonIfNotDone) && (
                          <div className="mt-3 space-y-2">
                            {isNotDone && task.taskReasonIfNotDone && (
                              <div className="rounded-xl bg-red-50 border border-red-200 p-3">
                                <p className="text-xs font-bold text-red-600 uppercase tracking-wider mb-1">
                                  Reason Not Completed
                                </p>
                                <p className="text-sm text-red-900">{task.taskReasonIfNotDone}</p>
                              </div>
                            )}
                            {task.taskNotes && (
                              <div className="rounded-xl bg-white border border-slate-200 p-3">
                                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                                  Your Work Notes
                                </p>
                                <p className="text-sm text-slate-800 whitespace-pre-line">{task.taskNotes}</p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── TAB 2: Previous Tasks History ───────────────────────────── */}
        {activeTab === "previous_tasks" && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Previous Assigned Tasks & History</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Past shifts and tasks assigned to you, along with your submitted work reports.
              </p>
            </div>

            {previousTasks.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center shadow-sm">
                <CalendarDays className="h-10 w-10 mx-auto text-slate-300 mb-3" />
                <p className="font-semibold text-slate-700">No Previous Tasks Recorded</p>
                <p className="text-xs text-slate-400 mt-1.5">
                  Your past completed and assigned tasks will be archived here.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {previousTasks.map((task) => {
                  const isCompleted = task.taskStatus === "completed";
                  const isNotDone = task.taskStatus === "not_completed";

                  return (
                    <div
                      key={task._id}
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
                              <h3 className="font-bold text-slate-900">{task.title}</h3>
                              <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-700">
                                {formatDateDisplay(task.date)}
                              </span>
                            </div>
                            <p className="text-xs text-slate-500 mt-0.5">
                              {formatTime12(task.startTime)} – {formatTime12(task.endTime)}
                              {task.assignedTo && ` · Client: ${task.assignedTo}`}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {isCompleted && (
                            <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 border border-emerald-200 px-2.5 py-1 text-xs font-bold text-emerald-700">
                              <Check className="h-3.5 w-3.5" /> Completed
                            </span>
                          )}
                          {isNotDone && (
                            <span className="inline-flex items-center gap-1 rounded-lg bg-red-50 border border-red-200 px-2.5 py-1 text-xs font-bold text-red-700">
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
                            onClick={() => {
                              setSubmitError("");
                              setActiveModal(task);
                            }}
                            className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 transition shadow-sm cursor-pointer"
                          >
                            <Edit3 className="h-3.5 w-3.5 text-indigo-600" />
                            {isCompleted || isNotDone ? "Edit Report" : "Add Report"}
                          </button>
                        </div>
                      </div>

                      {task.description && (
                        <div className="mt-3 rounded-xl bg-slate-50 border border-slate-100 p-3 text-xs text-slate-700">
                          <span className="font-bold block text-slate-500 uppercase tracking-wider mb-0.5">
                            Instructions:
                          </span>
                          {task.description}
                        </div>
                      )}

                      {(task.taskNotes || task.taskReasonIfNotDone) && (
                        <div className="mt-3 space-y-2 text-xs">
                          {task.taskReasonIfNotDone && (
                            <div className="rounded-xl bg-red-50 border border-red-200 p-2.5 text-red-900">
                              <span className="font-bold block mb-0.5">Reason Not Completed:</span>
                              {task.taskReasonIfNotDone}
                            </div>
                          )}
                          {task.taskNotes && (
                            <div className="rounded-xl bg-white border border-slate-200 p-2.5 text-slate-800">
                              <span className="font-bold block text-slate-500 mb-0.5">Work Notes:</span>
                              <p className="whitespace-pre-line">{task.taskNotes}</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── TAB 3: Attendance History Record ────────────────────────── */}
        {activeTab === "attendance_history" && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Previous Attendance Records</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Complete record of dates and times you marked attendance.
              </p>
            </div>

            {attendanceHistory.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center shadow-sm">
                <History className="h-10 w-10 mx-auto text-slate-300 mb-3" />
                <p className="font-semibold text-slate-700">No Attendance Records Found</p>
                <p className="text-xs text-slate-400 mt-1.5">
                  When you mark attendance, your logs will be archived here.
                </p>
              </div>
            ) : (
              <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500 border-b border-slate-200">
                      <tr>
                        <th className="px-6 py-3.5 font-bold">Date</th>
                        <th className="px-6 py-3.5 font-bold">Marked Time</th>
                        <th className="px-6 py-3.5 font-bold">Status</th>
                        <th className="px-6 py-3.5 font-bold">Notes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {attendanceHistory.map((rec) => (
                        <tr key={rec._id} className="hover:bg-slate-50/60 transition">
                          <td className="px-6 py-4 font-semibold text-slate-900 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <span>{formatDateDisplay(rec.date)}</span>
                              {rec.isToday && (
                                <span className="rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5">
                                  Today
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap font-medium text-slate-800">
                            {formatTime12(rec.markedAt || rec.clockInTime)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-xs font-bold text-emerald-700">
                              <Check className="h-3 w-3" /> Present / Marked
                            </span>
                          </td>
                          <td className="px-6 py-4 text-xs text-slate-500 max-w-xs truncate">
                            {rec.notes || "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Confirmation Modal (Surety Check for Mark Attendance) ──── */}
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
                <strong className="text-slate-900">Date:</strong> {todayFormatted}
              </p>
              <p>
                <strong className="text-slate-900">Staff:</strong> {user?.name || `${user?.firstName || ""} ${user?.lastName || ""}`.trim()}
              </p>
            </div>

            {submitError && (
              <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-xs text-red-700 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{submitError}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setShowConfirmModal(false);
                  setSubmitError("");
                }}
                className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={fetcher.state !== "idle"}
                onClick={handleConfirmAttendance}
                className="px-5 py-2 rounded-xl bg-[#1e3a5f] text-sm font-bold text-white hover:bg-[#162d4a] active:scale-95 transition disabled:opacity-50 cursor-pointer shadow-md shadow-[#1e3a5f]/20"
              >
                {fetcher.state !== "idle" ? "Marking..." : "Yes, Mark Attendance"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Task Update Modal ────────────────────────────────────────── */}
      {activeModal && (
        <TaskUpdateModal
          task={activeModal}
          onClose={() => {
            setActiveModal(null);
            setSubmitError("");
          }}
          onSubmit={handleTaskUpdate}
          isSubmitting={fetcher.state !== "idle"}
          serverError={fetcher.data?.error || ""}
        />
      )}
    </div>
  );
}

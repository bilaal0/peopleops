import { useState, useEffect, useRef } from "react";
import { useLoaderData, useFetcher, useRevalidator } from "react-router";
import {
  Timer,
  LogIn,
  LogOut,
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

function ElapsedTimer({ clockInTime }) {
  const [elapsed, setElapsed] = useState("");

  useEffect(() => {
    if (!clockInTime) return;
    const calc = () => {
      const diff = Math.max(0, Date.now() - new Date(clockInTime).getTime());
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      const pad = (n) => String(n).padStart(2, "0");
      setElapsed(`${pad(h)}:${pad(m)}:${pad(s)}`);
    };
    calc();
    const t = setInterval(calc, 1000);
    return () => clearInterval(t);
  }, [clockInTime]);

  return <span className="font-mono font-bold text-emerald-700">{elapsed}</span>;
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
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl">
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
  const { user, todayAttendance: initialAttendance, tasks: initialTasks } = useLoaderData();
  const fetcher = useFetcher();
  const { revalidate } = useRevalidator();

  const [attendance, setAttendance] = useState(initialAttendance);
  const [tasks, setTasks] = useState(initialTasks);
  const [activeModal, setActiveModal] = useState(null);
  const [submitError, setSubmitError] = useState("");

  const isClockedIn = attendance?.status === "clocked_in";
  const isClockedOut = attendance?.status === "clocked_out";

  // Sync attendance after clock in/out fetcher
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data) {
      if (fetcher.data.success) {
        setSubmitError("");
        if (fetcher.data.action === "update_task") {
          setActiveModal(null);
          revalidate();
        } else {
          revalidate();
        }
      }
      if (fetcher.data.error) {
        setSubmitError(fetcher.data.error);
      }
    }
  }, [fetcher.state, fetcher.data]);

  // Sync tasks from loader after revalidation
  useEffect(() => {
    setAttendance(initialAttendance);
    setTasks(initialTasks);
  }, [initialAttendance, initialTasks]);

  const handleClockAction = (intent) => {
    setSubmitError("");
    const fd = new FormData();
    fd.append("_intent", intent);
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

  const today = new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const pendingCount = tasks.filter((t) => t.taskStatus === "pending").length;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Page Header */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2.5">
                <ClipboardList className="h-6 w-6 text-indigo-600" />
                Attendance & Daily Tasks
              </h1>
              <p className="text-sm text-slate-500 mt-0.5">{today}</p>
            </div>
            {pendingCount > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 border border-amber-200 px-3 py-1 text-xs font-bold text-amber-700">
                <AlertCircle className="h-3.5 w-3.5" />
                {pendingCount} task{pendingCount !== 1 ? "s" : ""} need{pendingCount === 1 ? "s" : ""} your report
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* ── Attendance Clock Card ─────────────────────────────────────── */}
        <div className={`rounded-2xl border shadow-sm overflow-hidden ${
          isClockedIn
            ? "border-emerald-200 bg-gradient-to-br from-emerald-50 to-white"
            : isClockedOut
            ? "border-slate-200 bg-white"
            : "border-slate-200 bg-white"
        }`}>
          <div className="p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5">
              {/* Status Info */}
              <div className="flex items-start gap-4">
                <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${
                  isClockedIn
                    ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/30"
                    : isClockedOut
                    ? "bg-slate-200 text-slate-600"
                    : "bg-indigo-50 text-indigo-600"
                }`}>
                  <Timer className="h-7 w-7" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-lg font-bold text-slate-900">Daily Attendance</h2>
                    {isClockedIn && (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 border border-emerald-300 px-2.5 py-0.5 text-xs font-bold text-emerald-800">
                        <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                        On Duty
                      </span>
                    )}
                    {isClockedOut && (
                      <span className="inline-flex items-center rounded-full bg-slate-100 border border-slate-300 px-2.5 py-0.5 text-xs font-bold text-slate-600">
                        Shift Ended
                      </span>
                    )}
                    {!attendance && (
                      <span className="inline-flex items-center rounded-full bg-amber-50 border border-amber-200 px-2.5 py-0.5 text-xs font-bold text-amber-700">
                        Not Clocked In
                      </span>
                    )}
                  </div>

                  <div className="mt-2 text-sm text-slate-600 space-y-1">
                    {isClockedIn && attendance?.clockInTime && (
                      <div className="flex items-center gap-4 flex-wrap">
                        <span>
                          Clocked in at{" "}
                          <strong className="text-slate-900">
                            {formatTime12(attendance.clockInTime)}
                          </strong>
                        </span>
                        <span className="flex items-center gap-1.5 bg-emerald-100 rounded-lg px-2.5 py-1 text-xs">
                          <Clock className="h-3 w-3 text-emerald-600" />
                          <ElapsedTimer clockInTime={attendance.clockInTime} />
                        </span>
                      </div>
                    )}
                    {isClockedOut && (
                      <span>
                        <strong>{formatTime12(attendance.clockInTime)}</strong> →{" "}
                        <strong>{formatTime12(attendance.clockOutTime)}</strong>
                        &nbsp;·&nbsp;
                        <strong className="text-slate-900">{attendance.totalHours} hrs</strong> total
                      </span>
                    )}
                    {!attendance && (
                      <span className="text-slate-500">
                        Press Clock In to record your start time for today.
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Action Button */}
              <div className="flex items-center gap-3">
                {isClockedIn ? (
                  <button
                    type="button"
                    disabled={fetcher.state !== "idle"}
                    onClick={() => handleClockAction("clock_out")}
                    className="flex items-center gap-2 rounded-2xl bg-red-600 px-6 py-3 text-sm font-bold text-white shadow-md shadow-red-600/20 hover:bg-red-700 active:scale-95 transition disabled:opacity-50 cursor-pointer"
                  >
                    <LogOut className="h-4 w-4" />
                    {fetcher.state !== "idle" ? "Processing..." : "Clock Out"}
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={fetcher.state !== "idle"}
                    onClick={() => handleClockAction("clock_in")}
                    className="flex items-center gap-2 rounded-2xl bg-emerald-600 px-6 py-3 text-sm font-bold text-white shadow-md shadow-emerald-600/20 hover:bg-emerald-700 active:scale-95 transition disabled:opacity-50 cursor-pointer"
                  >
                    <LogIn className="h-4 w-4" />
                    {fetcher.state !== "idle"
                      ? "Processing..."
                      : isClockedOut
                      ? "Clock In Again"
                      : "Clock In"}
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

        {/* ── Today's Tasks ─────────────────────────────────────────────── */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Today's Assigned Tasks</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Rota shifts assigned to you for today. Update each task with your report.
              </p>
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

          {tasks.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center shadow-sm">
              <Calendar className="h-10 w-10 mx-auto text-slate-300 mb-3" />
              <p className="font-semibold text-slate-700">No Tasks Assigned For Today</p>
              <p className="text-xs text-slate-400 mt-1.5">
                Your manager hasn't scheduled a rota shift for you today. Check back later or view your full calendar.
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
                    {/* Task top bar */}
                    <div className={`h-1 ${
                      isCompleted ? "bg-emerald-500" : isNotDone ? "bg-red-500" : "bg-amber-400"
                    }`} />

                    <div className="p-5">
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                        <div className="flex items-start gap-3">
                          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                            isCompleted
                              ? "bg-emerald-50 text-emerald-600"
                              : isNotDone
                              ? "bg-red-50 text-red-600"
                              : "bg-indigo-50 text-indigo-600"
                          }`}>
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

                      {/* Description */}
                      {task.description && (
                        <div className="mt-3 rounded-xl bg-slate-50 border border-slate-100 p-3">
                          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                            Shift Instructions
                          </p>
                          <p className="text-sm text-slate-700">{task.description}</p>
                        </div>
                      )}

                      {/* Staff Report Preview */}
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
                                Your Notes
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
      </div>

      {/* Task Update Modal */}
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

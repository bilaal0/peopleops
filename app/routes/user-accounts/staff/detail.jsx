import { useState, useRef, useMemo, useEffect } from "react";
import { redirect, useLoaderData, useNavigate, Link, Form, useFetcher } from "react-router";
import { getUserFromRequest } from "../../../utils/auth.server.js";
import { User } from "../../../models/user.server.js";
import { Document } from "../../../models/document.server.js";
import { DocumentType } from "../../../models/documentType.server.js";
import { Rota } from "../../../models/rota.server.js";
import { Attendance } from "../../../models/attendance.server.js";
import { Message } from "../../../models/message.server.js";
import { connect } from "../../../config/db.server.js";
import { fmtDate } from "../../../utils/date.js";
import UKDateInput from "../../../components/ui/UKDateInput.jsx";
import DocumentViewer from "../../../components/documents/DocumentViewer.jsx";
import {
  FileText, Download, Upload, ShieldCheck, AlertCircle,
  CheckCircle2, Clock, X, Plus, Trash2, Eye,
  ClipboardList, XCircle, Search, Filter, Phone, Mail,
  CalendarClock, AlertTriangle, FileSpreadsheet, Calendar, Check,
  MessageSquare, SendHorizontal, CheckCheck
} from "lucide-react";

export async function loader({ params, request }) {
  const user = await getUserFromRequest(request);
  if (!user) return redirect("/login");

  await connect();

  const staffUser = await User.findOne({ _id: params.id, deleted: false }).lean();
  if (!staffUser) throw new Response("Staff User Not Found", { status: 404 });

  // Fetch all related staff data concurrently in parallel
  const [docs, docTypes, rotaTasks, attendanceRecords, rawMessages] = await Promise.all([
    Document.find({ entityId: params.id, deleted: false })
      .populate("docType", "name")
      .populate("uploadedBy", "firstName lastName title email")
      .sort({ createdAt: -1 })
      .lean(),
    DocumentType.find({ isActive: true }).sort({ name: 1 }).lean(),
    Rota.find({ employee: params.id, deleted: false })
      .populate("assignedTo", "firstName lastName companyName landlordData email phone")
      .populate("taskUpdatedBy", "firstName lastName email")
      .sort({ date: -1, startTime: -1 })
      .lean(),
    Attendance.find({ user: params.id }).sort({ date: -1, createdAt: -1 }).lean(),
    Message.find({
      $or: [
        { sender: params.id },
        { recipient: params.id },
      ],
    }).sort({ createdAt: 1 }).lean(),
  ]);

  // Mark unread messages sent by this staff member to current user as read
  if (rawMessages.some((m) => m.sender?.toString() === params.id && !m.read)) {
    Message.updateMany(
      { sender: params.id, recipient: user.userId, read: false },
      { $set: { read: true, readAt: new Date(), status: "read" } }
    ).exec().catch(() => {});
  }

  // Format tasks
  const tasks = rotaTasks.map((t) => {
    const clientObj = t.assignedTo;
    const clientName = clientObj
      ? (clientObj.companyName || clientObj.landlordData?.companyName || `${clientObj.firstName || ""} ${clientObj.lastName || ""}`.trim())
      : (t.assignedToName || "General Shift / Duty");

    return {
      _id: t._id.toString(),
      title: t.title || "Assigned Task / Shift",
      description: t.description || "",
      date: t.date ? t.date.toISOString() : null,
      startTime: t.startTime || "",
      endTime: t.endTime || "",
      client: {
        _id: clientObj?._id?.toString() || "",
        name: clientName,
        phone: clientObj?.phone || "",
        email: clientObj?.email || "",
      },
      taskStatus: t.taskStatus || "pending",
      taskNotes: t.taskNotes || "",
      taskReasonIfNotDone: t.taskReasonIfNotDone || "",
      taskUpdatedAt: t.taskUpdatedAt ? t.taskUpdatedAt.toISOString() : null,
      taskUpdatedBy: t.taskUpdatedBy
        ? `${t.taskUpdatedBy.firstName || ""} ${t.taskUpdatedBy.lastName || ""}`.trim() || t.taskUpdatedBy.email
        : "",
    };
  });

  // Format attendance records
  const attendanceLogs = attendanceRecords.map((att) => ({
    _id: att._id.toString(),
    date: att.date ? att.date.toISOString() : (att.createdAt ? att.createdAt.toISOString() : null),
    clockInTime: att.clockInTime?.toISOString() || att.markedAt?.toISOString() || null,
    clockOutTime: att.clockOutTime?.toISOString() || null,
    totalHours: att.totalHours || 0,
    status: att.status || "marked",
    notes: att.notes || "",
  }));

  // Format messages
  const messages = rawMessages.map((m) => ({
    _id: m._id.toString(),
    sender: m.sender?.toString() || "",
    recipient: m.recipient?.toString() || "",
    senderName: m.senderName || "User",
    senderRole: m.senderRole || "",
    recipientName: m.recipientName || "",
    message: m.message || "",
    read: Boolean(m.read),
    readAt: m.readAt ? m.readAt.toISOString() : null,
    status: m.status || "sent",
    createdAt: m.createdAt ? m.createdAt.toISOString() : new Date().toISOString(),
    isFromStaff: m.sender?.toString() === params.id,
    isFromMe: m.sender?.toString() === user.userId,
  }));

  // Stats
  const completedTasks = tasks.filter((t) => t.taskStatus === "completed").length;
  const taskStats = {
    total: tasks.length,
    completed: completedTasks,
    pending: tasks.filter((t) => t.taskStatus === "pending").length,
    notCompleted: tasks.filter((t) => t.taskStatus === "not_completed").length,
    rate: tasks.length > 0 ? Math.round((completedTasks / tasks.length) * 100) : 0,
  };

  const totalHoursWorked = attendanceLogs.reduce((acc, curr) => acc + (Number(curr.totalHours) || 0), 0);
  const attendanceStats = {
    totalSessions: attendanceLogs.length,
    totalHours: totalHoursWorked,
  };

  return {
    staff: {
      ...staffUser,
      _id: staffUser._id.toString(),
      organizationId: staffUser.organizationId?.toString(),
    },
    tasks,
    taskStats,
    attendanceLogs,
    attendanceStats,
    messages,
    currentUserId: user.userId,
    documents: docs.map((d) => ({
      _id:       d._id.toString(),
      fileName:  d.fileName,
      title:     d.title || null,
      docType:   d.docType ? { name: d.docType.name } : null,
      fileSize:  d.fileSize || null,
      mimeType:  d.mimeType || null,
      s3Key:     d.s3Key || null,
      status:    d.status || "pending",
      expiryDate: d.expiryDate || null,
      notes:     d.notes || null,
      createdAt: d.createdAt,
      uploadedBy: d.uploadedBy
        ? `${d.uploadedBy.title ? d.uploadedBy.title + " " : ""}${d.uploadedBy.firstName || ""} ${d.uploadedBy.lastName || ""}`.trim() || d.uploadedBy.email
        : "Unknown",
    })),
    documentTypes: docTypes.map(dt => ({ _id: dt._id.toString(), name: dt.name })),
    organizationId: user.organizationId?.toString() || null,
  };
}

export async function action({ request, params }) {
  const user = await getUserFromRequest(request);
  if (!user) return redirect("/login");

  await connect();

  const formData = await request.formData();
  const intent = formData.get("_intent");

  if (intent === "send_message") {
    const text = (formData.get("message") || "").toString().trim();
    if (!text) {
      return { error: "Message cannot be empty." };
    }

    const [senderUser, recipientUser] = await Promise.all([
      User.findById(user.userId).select("firstName lastName title roles").lean(),
      User.findById(params.id).select("firstName lastName title roles").lean(),
    ]);

    const senderName = senderUser
      ? `${senderUser.title ? senderUser.title + " " : ""}${senderUser.firstName || ""} ${senderUser.lastName || ""}`.trim()
      : "Management";
    const recipientName = recipientUser
      ? `${recipientUser.title ? recipientUser.title + " " : ""}${recipientUser.firstName || ""} ${recipientUser.lastName || ""}`.trim()
      : "Staff Member";

    const senderRole = user.roles?.includes("SUPER_ADMIN")
      ? "Super Admin"
      : user.roles?.includes("ADMIN") || user.roles?.includes("REGISTERED_MANAGER")
      ? "Management"
      : "Admin";

    await Message.create({
      sender: user.userId,
      recipient: params.id,
      organizationId: user.organizationId || null,
      message: text,
      senderName,
      senderRole,
      recipientName,
      read: false,
      status: "sent",
    });

    return { success: true };
  }

  return { error: "Unknown intent" };
}

// ── Small helpers ─────────────────────────────────────────────────────────────
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

function exportStaffAttendanceCSV(staffName, logs) {
  const headers = ["Date", "Clock In", "Clock Out", "Duration (Hours)", "Status", "Notes"];
  const rows = logs.map((l) => [
    l.date ? new Date(l.date).toLocaleDateString("en-GB") : "",
    l.clockInTime ? new Date(l.clockInTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—",
    l.clockOutTime ? new Date(l.clockOutTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—",
    l.totalHours || "0",
    `"${(l.status || "").replace(/_/g, " ")}"`,
    `"${(l.notes || "").replace(/"/g, '""').replace(/\n/g, ' ')}"`,
  ]);
  const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${(staffName || "Staff").replace(/\s+/g, "_")}_Attendance_Report.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function ExpiryBadge({ expiryDate }) {
  if (!expiryDate) return null;
  const days = Math.floor((new Date(expiryDate) - new Date()) / 86400000);
  if (days < 0)
    return <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-700"><AlertCircle className="w-3 h-3" />Expired</span>;
  if (days <= 60)
    return <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700"><Clock className="w-3 h-3" />{days}d left</span>;
  return <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700"><CheckCircle2 className="w-3 h-3" />Valid</span>;
}

function VerificationToggle({ documentId, currentStatus }) {
  const fetcher = useFetcher();
  const optimisticStatus = fetcher.formData ? fetcher.formData.get("status") : currentStatus;
  const isVerified = optimisticStatus === "verified";
  return (
    <fetcher.Form method="post" action="/documents/verify">
      <input type="hidden" name="documentId" value={documentId} />
      <input type="hidden" name="status" value={isVerified ? "pending" : "verified"} />
      <button type="submit" className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold transition ${isVerified ? "border-green-200 bg-green-50 text-green-700" : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"}`}>
        <ShieldCheck className={`w-3 h-3 ${isVerified ? "text-green-600" : "text-slate-400"}`} />
        {isVerified ? "Verified" : "Pending"}
      </button>
    </fetcher.Form>
  );
}

function DocDeleteButton({ documentId }) {
  const fetcher = useFetcher();
  return (
    <fetcher.Form method="post" action="/documents/delete" onSubmit={(e) => { if (!confirm("Delete this document?")) e.preventDefault(); }}>
      <input type="hidden" name="documentId" value={documentId} />
      <button type="submit" className="flex h-7 w-7 items-center justify-center rounded-full text-slate-400 hover:bg-red-50 hover:text-red-500 transition cursor-pointer" title="Delete">
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </fetcher.Form>
  );
}

// ── Upload modal ──────────────────────────────────────────────────────────────
function UploadModal({ staffId, organizationId, documentTypes, onClose }) {
  const fetcher = useFetcher();
  const fileRef = useRef(null);
  const [fileName, setFileName] = useState("");
  const isSubmitting = fetcher.state !== "idle";
  if (fetcher.data?.success) setTimeout(onClose, 600);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-sm font-bold text-slate-900">Upload Document</h2>
          <button onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 transition cursor-pointer"><X className="h-4 w-4" /></button>
        </div>
        <fetcher.Form method="post" action="/documents/upload" encType="multipart/form-data" className="p-5 space-y-4">
          <input type="hidden" name="entityType" value="staff" />
          <input type="hidden" name="entityId" value={staffId} />
          <input type="hidden" name="organizationId" value={organizationId || ""} />

          {/* File drop zone */}
          <div
            className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 p-5 text-center cursor-pointer hover:border-indigo-300 hover:bg-indigo-50/30 transition"
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="h-6 w-6 text-slate-400" />
            {fileName
              ? <p className="text-sm font-semibold text-indigo-600 truncate max-w-xs">{fileName}</p>
              : <>
                  <p className="text-sm font-semibold text-slate-700">Click to choose a file</p>
                  <p className="text-xs text-slate-400">PDF, JPG, PNG, MP3 or WAV — up to 10 MB</p>
                </>
            }
          </div>
          <input ref={fileRef} type="file" name="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.mp3,.wav,.wave,audio/mpeg,audio/wav,audio/*" onChange={(e) => setFileName(e.target.files?.[0]?.name || "")} />

          {/* Title */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Document Name <span className="text-slate-400 font-normal">(optional)</span></label>
            <input type="text" name="title" placeholder="e.g. DBS Certificate" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition" />
          </div>

          {/* Group */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Group</label>
            <select name="docType" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition bg-white" required>
              <option value="">Select a group...</option>
              {documentTypes.map(dt => (
                <option key={dt._id} value={dt._id}>{dt.name}</option>
              ))}
            </select>
          </div>

          {/* Expiry date */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Expiry Date <span className="text-slate-400 font-normal">(optional)</span></label>
            <UKDateInput name="expiryDate" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition" />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Notes <span className="text-slate-400 font-normal">(optional)</span></label>
            <textarea name="notes" rows={2} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition" />
          </div>

          {fetcher.data?.error && <p className="text-sm text-red-600">{fetcher.data.error}</p>}
          {fetcher.data?.success && <p className="text-sm text-green-600 font-semibold flex items-center gap-1"><CheckCircle2 className="h-4 w-4" />Uploaded!</p>}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 rounded-lg border border-slate-200 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition cursor-pointer">Cancel</button>
            <button type="submit" disabled={isSubmitting || !fileName} className="flex-1 rounded-lg bg-indigo-600 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 transition flex items-center justify-center gap-2 cursor-pointer">
              {isSubmitting ? "Uploading..." : <><Upload className="h-3.5 w-3.5" />Upload</>}
            </button>
          </div>
        </fetcher.Form>
      </div>
    </div>
  );
}

// ── Staff Tasks Tab Panel ─────────────────────────────────────────────────────
function StaffTasksPanel({ tasks, taskStats, staffName }) {
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (statusFilter !== "all" && t.taskStatus !== statusFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = t.title?.toLowerCase().includes(q);
        const matchClient = t.client?.name?.toLowerCase().includes(q);
        const matchNotes = t.taskNotes?.toLowerCase().includes(q);
        const matchReason = t.taskReasonIfNotDone?.toLowerCase().includes(q);
        if (!matchTitle && !matchClient && !matchNotes && !matchReason) return false;
      }
      return true;
    });
  }, [tasks, statusFilter, searchQuery]);

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total Shifts</p>
            <ClipboardList className="w-4 h-4 text-slate-400" />
          </div>
          <p className="text-2xl font-bold text-slate-900 mt-2">{taskStats.total}</p>
          <p className="text-xs text-slate-500 mt-1">Assigned to this staff</p>
        </div>

        <div className="bg-emerald-50/70 border border-emerald-200/80 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">Completed</p>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="flex items-baseline gap-2 mt-2">
            <p className="text-2xl font-bold text-emerald-900">{taskStats.completed}</p>
            <span className="text-xs font-semibold text-emerald-700">({taskStats.rate}%)</span>
          </div>
          <p className="text-xs text-emerald-600 mt-1">Reported complete</p>
        </div>

        <div className="bg-amber-50/70 border border-amber-200/80 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-amber-700">Pending</p>
            <Clock className="w-4 h-4 text-amber-600" />
          </div>
          <p className="text-2xl font-bold text-amber-900 mt-2">{taskStats.pending}</p>
          <p className="text-xs text-amber-600 mt-1">Awaiting shift / report</p>
        </div>

        <div className="bg-red-50/70 border border-red-200/80 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-red-700">Not Completed</p>
            <XCircle className="w-4 h-4 text-red-600" />
          </div>
          <p className="text-2xl font-bold text-red-900 mt-2">{taskStats.notCompleted}</p>
          <p className="text-xs text-red-600 mt-1">Recorded with reason</p>
        </div>
      </div>

      {/* Filter and Search */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          {[
            { key: "all", label: "All", count: taskStats.total },
            { key: "completed", label: "Completed", count: taskStats.completed },
            { key: "pending", label: "Pending", count: taskStats.pending },
            { key: "not_completed", label: "Not Done", count: taskStats.notCompleted },
          ].map(({ key, label, count }) => (
            <button
              key={key}
              type="button"
              onClick={() => setStatusFilter(key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 shrink-0 ${
                statusFilter === key
                  ? "bg-slate-900 text-white shadow-xs"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              <span>{label}</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                statusFilter === key ? "bg-slate-800 text-slate-200" : "bg-white text-slate-700"
              }`}>
                {count}
              </span>
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search shift title, client, or note..."
            className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          />
        </div>
      </div>

      {/* Task Cards */}
      {filteredTasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 py-16 text-center">
          <ClipboardList className="w-8 h-8 text-slate-300 mb-2" />
          <p className="text-sm font-semibold text-slate-700">No shifts or tasks found</p>
          <p className="text-xs text-slate-400 mt-1">There are no tasks matching the selected filter for {staffName}.</p>
        </div>
      ) : (
        <div className="space-y-3.5">
          {filteredTasks.map((task) => {
            const isCompleted = task.taskStatus === "completed";
            const isNotDone = task.taskStatus === "not_completed";
            const isPending = !isCompleted && !isNotDone;

            const borderColor = isCompleted
              ? "border-l-4 border-l-emerald-500"
              : isNotDone
              ? "border-l-4 border-l-red-500"
              : "border-l-4 border-l-amber-500";

            return (
              <div
                key={task._id}
                className={`bg-white border border-slate-200 rounded-xl p-5 shadow-xs hover:border-slate-300 transition ${borderColor}`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-slate-100 text-slate-800">
                      <Calendar className="w-3.5 h-3.5 text-slate-500" />
                      {formatDateDisplay(task.date)}
                    </span>
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-slate-100 text-slate-700">
                      <Clock className="w-3.5 h-3.5 text-slate-500" />
                      {formatTime12(task.startTime)} – {formatTime12(task.endTime)}
                    </span>
                    {task.client?.name && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-indigo-50 text-indigo-700">
                        Client: {task.client.name}
                      </span>
                    )}
                  </div>

                  <div>
                    {isCompleted && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        Completed
                      </span>
                    )}
                    {isNotDone && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-800">
                        <XCircle className="w-3.5 h-3.5 text-red-600" />
                        Not Completed
                      </span>
                    )}
                    {isPending && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800">
                        <Clock className="w-3.5 h-3.5 text-amber-600" />
                        Pending
                      </span>
                    )}
                  </div>
                </div>

                <div className="pt-3.5 space-y-2">
                  <h3 className="text-sm font-bold text-slate-900">{task.title}</h3>
                  {task.description && (
                    <p className="text-xs text-slate-600 leading-relaxed">{task.description}</p>
                  )}

                  {task.taskNotes && (
                    <div className="mt-3 rounded-lg bg-indigo-50/70 border border-indigo-100 p-3 text-xs">
                      <div className="flex items-center gap-1.5 text-indigo-900 font-semibold mb-1">
                        <ClipboardList className="w-3.5 h-3.5 text-indigo-600" />
                        <span>Staff Handover / Work Report Note</span>
                      </div>
                      <p className="text-slate-800 whitespace-pre-line leading-relaxed">{task.taskNotes}</p>
                    </div>
                  )}

                  {task.taskReasonIfNotDone && (
                    <div className="mt-3 rounded-lg bg-red-50 border border-red-200/80 p-3 text-xs">
                      <div className="flex items-center gap-1.5 text-red-900 font-semibold mb-1">
                        <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
                        <span>Reason Not Completed</span>
                      </div>
                      <p className="text-red-800 font-medium whitespace-pre-line leading-relaxed">{task.taskReasonIfNotDone}</p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Staff Attendance Tab Panel ────────────────────────────────────────────────
function StaffAttendancePanel({ attendanceLogs, attendanceStats, staffName }) {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredLogs = useMemo(() => {
    if (!searchQuery.trim()) return attendanceLogs;
    const q = searchQuery.toLowerCase();
    return attendanceLogs.filter(
      (a) => a.notes?.toLowerCase().includes(q) || a.status?.toLowerCase().includes(q)
    );
  }, [attendanceLogs, searchQuery]);

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Clock Sessions</p>
          <p className="text-2xl font-bold text-slate-900 mt-2">{attendanceStats.totalSessions}</p>
          <p className="text-xs text-slate-500 mt-1">Recorded attendance logs</p>
        </div>

        <div className="bg-indigo-50/70 border border-indigo-200/80 rounded-xl p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-indigo-700">Total Hours Clocked</p>
          <p className="text-2xl font-bold text-indigo-900 mt-2">{attendanceStats.totalHours.toFixed(1)} hrs</p>
          <p className="text-xs text-indigo-600 mt-1">Duration of shifts delivered</p>
        </div>

        <div className="bg-emerald-50/70 border border-emerald-200/80 rounded-xl p-4 col-span-2 sm:col-span-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">Avg Hours / Shift</p>
          <p className="text-2xl font-bold text-emerald-900 mt-2">
            {attendanceStats.totalSessions > 0
              ? `${(attendanceStats.totalHours / attendanceStats.totalSessions).toFixed(1)} hrs`
              : "—"}
          </p>
          <p className="text-xs text-emerald-600 mt-1">Average shift length</p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 pt-2">
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by notes or status..."
            className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          />
        </div>

        <button
          type="button"
          onClick={() => exportStaffAttendanceCSV(staffName, filteredLogs)}
          disabled={filteredLogs.length === 0}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition shadow-xs disabled:opacity-50 cursor-pointer"
        >
          <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
          Export CSV
        </button>
      </div>

      {/* Table */}
      {filteredLogs.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 py-16 text-center">
          <CalendarClock className="w-8 h-8 text-slate-300 mb-2" />
          <p className="text-sm font-semibold text-slate-700">No attendance logs</p>
          <p className="text-xs text-slate-400 mt-1">There are no attendance or clock-in records for {staffName} yet.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-xs">
          <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
            <thead className="bg-slate-50 font-bold text-slate-600 uppercase tracking-wider text-[10px]">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Clock-In Time</th>
                <th className="px-4 py-3">Clock-Out Time</th>
                <th className="px-4 py-3">Duration</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
              {filteredLogs.map((a) => (
                <tr key={a._id} className="hover:bg-slate-50/80 transition">
                  <td className="px-4 py-3.5 whitespace-nowrap font-bold text-slate-900">
                    {formatDateDisplay(a.date)}
                  </td>
                  <td className="px-4 py-3.5 whitespace-nowrap">
                    {a.clockInTime ? (
                      <span className="font-bold text-slate-900">{formatTime12(a.clockInTime)}</span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3.5 whitespace-nowrap">
                    {a.clockOutTime ? (
                      <span className="font-bold text-slate-900">{formatTime12(a.clockOutTime)}</span>
                    ) : a.clockInTime ? (
                      <span className="text-amber-600 font-semibold">In Progress</span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3.5 whitespace-nowrap font-bold text-slate-900">
                    {a.totalHours > 0 ? `${a.totalHours.toFixed(1)} hrs` : "—"}
                  </td>
                  <td className="px-4 py-3.5 whitespace-nowrap">
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
                  <td className="px-4 py-3.5 max-w-xs truncate text-slate-600" title={a.notes}>
                    {a.notes || <span className="text-slate-300 italic">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Documents Tab Panel ───────────────────────────────────────────────────────
function DocumentsPanel({ documents, staffId, organizationId, documentTypes }) {
  const [showUpload, setShowUpload] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{documents.length} document{documents.length !== 1 ? "s" : ""}</p>
        <button onClick={() => setShowUpload(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 transition cursor-pointer">
          <Plus className="h-3.5 w-3.5" />Upload Document
        </button>
      </div>

      {documents.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 py-14 text-center">
          <FileText className="mx-auto h-10 w-10 text-slate-300 mb-3" />
          <p className="text-sm font-semibold text-slate-700">No documents yet</p>
          <p className="text-xs text-slate-400 mt-1">Upload compliance documents, contracts, or certifications.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {documents.map((doc) => {
            const ext = doc.fileName?.split(".").pop()?.toUpperCase() || "FILE";
            return (
              <div key={doc._id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 hover:border-slate-300 transition">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 font-bold text-[11px]">
                  {ext.length <= 4 ? ext : <FileText className="h-4 w-4" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900 truncate">{doc.title || doc.fileName}</p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    {doc.docType && <span className="text-[10px] font-medium text-slate-500">{doc.docType.name}</span>}
                    {doc.fileSize && <span className="text-[10px] text-slate-400">{(doc.fileSize / 1024).toFixed(1)} KB</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <ExpiryBadge expiryDate={doc.expiryDate} />
                  <VerificationToggle documentId={doc._id} currentStatus={doc.status} />
                  <DocumentViewer
                    documentId={doc._id}
                    fileName={doc.fileName}
                    mimeType={doc.mimeType || "application/octet-stream"}
                    uploadedBy={doc.uploadedBy}
                    uploadedAt={doc.createdAt}
                    status={doc.status}
                    docTypeName={doc.docType?.name || "Staff Document"}
                    fileSize={doc.fileSize}
                    iconOnly={true}
                    buttonClassName="flex h-7 w-7 items-center justify-center rounded-full text-slate-400 hover:bg-indigo-50 hover:text-indigo-600 transition cursor-pointer"
                    title="View document"
                  />
                  <button onClick={() => window.open(`/documents/${doc._id}/download`, "_blank")} className="flex h-7 w-7 items-center justify-center rounded-full text-slate-400 hover:bg-indigo-50 hover:text-indigo-600 transition cursor-pointer" title="Download document">
                    <Download className="h-3.5 w-3.5" />
                  </button>
                  <DocDeleteButton documentId={doc._id} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showUpload && <UploadModal staffId={staffId} organizationId={organizationId} documentTypes={documentTypes} onClose={() => setShowUpload(false)} />}
    </div>
  );
}

// ── Staff Communication Panel ────────────────────────────────────────────────
function StaffCommunicationPanel({ staff, messages = [], currentUserId, organizationId }) {
  const fetcher = useFetcher();
  const [inputText, setInputText] = useState("");
  const messagesEndRef = useRef(null);

  const isSubmitting = fetcher.state !== "idle" && fetcher.formData?.get("_intent") === "send_message";
  const optimisticMessageText = isSubmitting ? fetcher.formData.get("message") : null;

  const displayMessages = useMemo(() => {
    if (!optimisticMessageText) return messages;
    return [
      ...messages,
      {
        _id: "temp-" + Date.now(),
        sender: currentUserId,
        recipient: staff._id,
        senderName: "You (Management)",
        senderRole: "Management",
        message: optimisticMessageText,
        read: false,
        status: "sending...",
        createdAt: new Date().toISOString(),
        isFromMe: true,
        isFromStaff: false,
      },
    ];
  }, [messages, optimisticMessageText, currentUserId, staff._id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [displayMessages.length]);

  const handleSendMessage = (e) => {
    if (e) e.preventDefault();
    const text = inputText.trim();
    if (!text) return;
    fetcher.submit(
      {
        _intent: "send_message",
        message: text,
      },
      { method: "post" }
    );
    setInputText("");
  };

  const handlePresetClick = (preset) => {
    setInputText(preset);
  };

  const presets = [
    `📅 Shift Reminder: Hi ${staff.firstName || "there"}, please confirm your upcoming shift on the rota.`,
    `⏱️ Attendance Notice: Hi ${staff.firstName || "there"}, please remember to clock in upon your arrival.`,
    `📋 Task Update: Hi ${staff.firstName || "there"}, please update your task completion notes for today.`,
    `📞 Urgent: Please call the management office as soon as you are available.`,
  ];

  return (
    <div className="space-y-6">
      {/* Staff Contact Strip */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-slate-50 border border-slate-200/80">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-indigo-600 text-white font-bold flex items-center justify-center text-sm shadow-xs">
            {staff.firstName?.charAt(0).toUpperCase() || "S"}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-slate-900">
                {`${staff.title ? staff.title + " " : ""}${staff.firstName || ""} ${staff.lastName || ""}`.trim()}
              </h3>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800">
                Direct SMS / Messaging Channel
              </span>
            </div>
            <p className="text-xs text-slate-500">{staff.jobTitle || "Staff Member"} • {staff.email}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {(staff.telephoneNo || staff.phone) && (
            <a
              href={`tel:${staff.telephoneNo || staff.phone}`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 transition shadow-xs"
            >
              <Phone className="w-3.5 h-3.5 text-slate-500" />
              <span>Call ({staff.telephoneNo || staff.phone})</span>
            </a>
          )}
          {staff.email && (
            <a
              href={`mailto:${staff.email}`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 transition shadow-xs"
            >
              <Mail className="w-3.5 h-3.5 text-slate-500" />
              <span>Email</span>
            </a>
          )}
        </div>
      </div>

      {/* Chat Timeline Box */}
      <div className="rounded-xl border border-slate-200 bg-slate-50/50 flex flex-col h-[520px]">
        {/* Messages scroll area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {displayMessages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-8">
              <div className="w-14 h-14 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center mb-3 text-indigo-600">
                <MessageSquare className="w-7 h-7" />
              </div>
              <h4 className="text-sm font-bold text-slate-900">No Messages Yet</h4>
              <p className="text-xs text-slate-500 max-w-sm mt-1">
                Send a direct text to {staff.firstName || "this staff member"}. They will see your message on their staff portal and can send their reply directly back here.
              </p>
              <div className="mt-4 flex flex-wrap gap-2 justify-center max-w-md">
                {presets.slice(0, 2).map((p, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handlePresetClick(p)}
                    className="text-[11px] font-medium bg-white border border-slate-200 hover:border-indigo-300 text-slate-700 px-3 py-1.5 rounded-lg transition shadow-2xs cursor-pointer"
                  >
                    {p.split(":")[0]}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            displayMessages.map((msg) => {
              const isStaffReply = msg.isFromStaff;
              const timeDisplay = msg.createdAt ? formatTime12(msg.createdAt) : "";
              const dateDisplay = msg.createdAt ? formatDateDisplay(msg.createdAt) : "";

              return (
                <div
                  key={msg._id}
                  className={`flex items-end gap-2.5 ${isStaffReply ? "justify-start" : "justify-end"}`}
                >
                  {/* Staff Avatar for staff replies */}
                  {isStaffReply && (
                    <div className="w-8 h-8 rounded-full bg-emerald-600 text-white font-bold text-xs flex items-center justify-center shrink-0 shadow-2xs">
                      {staff.firstName?.charAt(0).toUpperCase() || "S"}
                    </div>
                  )}

                  <div
                    className={`max-w-lg rounded-2xl p-4 shadow-xs ${
                      isStaffReply
                        ? "bg-white border border-slate-200 text-slate-900 rounded-bl-xs"
                        : "bg-indigo-600 text-white rounded-br-xs"
                    }`}
                  >
                    {/* Header info */}
                    <div className="flex items-center justify-between gap-3 mb-1.5">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`text-xs font-bold ${
                            isStaffReply ? "text-slate-900" : "text-indigo-100"
                          }`}
                        >
                          {isStaffReply ? msg.senderName || `${staff.firstName} (Staff)` : "You (Management)"}
                        </span>
                        {isStaffReply && (
                          <span className="inline-flex items-center px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-emerald-100 text-emerald-800">
                            Staff Reply
                          </span>
                        )}
                      </div>
                      <span
                        className={`text-[10px] ${
                          isStaffReply ? "text-slate-400" : "text-indigo-200"
                        }`}
                      >
                        {timeDisplay} {dateDisplay ? `• ${dateDisplay}` : ""}
                      </span>
                    </div>

                    {/* Message Body */}
                    <p className={`text-sm whitespace-pre-wrap leading-relaxed ${isStaffReply ? "text-slate-800" : "text-white"}`}>
                      {msg.message}
                    </p>

                    {/* Status checkmark for sent messages */}
                    {!isStaffReply && (
                      <div className="flex justify-end items-center gap-1 mt-1.5 text-[10px] text-indigo-200">
                        {msg.read ? (
                          <span className="flex items-center gap-0.5 text-emerald-300 font-semibold">
                            <CheckCheck className="w-3.5 h-3.5" /> Read by staff
                          </span>
                        ) : (
                          <span className="flex items-center gap-0.5">
                            <Check className="w-3.5 h-3.5" /> {msg.status === "sending..." ? "Sending..." : "Delivered"}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Management avatar for admin */}
                  {!isStaffReply && (
                    <div className="w-8 h-8 rounded-full bg-indigo-700 text-white font-bold text-xs flex items-center justify-center shrink-0 shadow-2xs">
                      M
                    </div>
                  )}
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Quick preset chips bar */}
        <div className="border-t border-slate-200/80 bg-white px-4 py-2.5">
          <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
            <span className="text-[11px] font-semibold text-slate-400 shrink-0 uppercase tracking-wider">
              Quick Text:
            </span>
            {presets.map((preset, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handlePresetClick(preset)}
                className="shrink-0 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-slate-700 text-[11px] font-medium transition cursor-pointer border border-transparent hover:border-indigo-200"
              >
                {preset.split(":")[0]}
              </button>
            ))}
          </div>
        </div>

        {/* Composer box */}
        <div className="border-t border-slate-200 bg-white p-3 rounded-b-xl">
          <form onSubmit={handleSendMessage} className="flex items-end gap-2">
            <div className="flex-1 relative">
              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                rows={2}
                placeholder={`Type a text message to ${staff.firstName || "staff"}... (Press Enter to send)`}
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting || !inputText.trim()}
              className="h-10 px-4 rounded-xl bg-indigo-600 text-white font-semibold text-xs hover:bg-indigo-700 disabled:opacity-50 transition flex items-center justify-center gap-1.5 shadow-sm cursor-pointer shrink-0 mb-1"
            >
              {isSubmitting ? (
                "Sending..."
              ) : (
                <>
                  <span>Send Text</span>
                  <SendHorizontal className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function StaffDetailPage() {
  const {
    staff,
    documents,
    organizationId,
    documentTypes,
    tasks,
    taskStats,
    attendanceLogs,
    attendanceStats,
    messages = [],
    currentUserId,
  } = useLoaderData();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("profile");

  const fullName = `${staff.title ? staff.title + " " : ""}${staff.firstName || ""} ${staff.lastName || ""}`.trim();
  const mainRole = staff.roles?.[0] || "EMPLOYEE";
  const unreadReplies = messages.filter((m) => m.isFromStaff && !m.read).length;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 mb-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-4">
              <button onClick={() => navigate("/user-accounts/staff")} className="flex items-center justify-center h-9 w-9 rounded-lg border border-gray-300 hover:bg-gray-50 transition cursor-pointer">
                <svg className="w-4 h-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
              </button>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">{fullName || "Staff Profile"}</h1>
                <p className="mt-1 text-sm text-gray-600">{staff.jobTitle || "Internal Staff Member"}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Link to={`/user-accounts/staff/${staff._id}/edit`} className="px-4 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 text-sm font-semibold hover:bg-gray-50 transition shadow-xs flex items-center gap-1.5">
                <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                Edit Staff
              </Link>
              <Form method="post" action={`/user-accounts/staff/${staff._id}/delete`} onSubmit={(e) => { if (!confirm("Delete this staff member?")) e.preventDefault(); }}>
                <button type="submit" className="px-4 py-2 rounded-lg bg-red-50 text-red-700 border border-red-200 text-sm font-semibold hover:bg-red-100 transition flex items-center gap-1.5 cursor-pointer">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  Delete
                </button>
              </Form>
            </div>
          </div>

          {/* Dedicated Separate Tabs */}
          <div className="flex gap-1 mt-6 border-b border-gray-200 overflow-x-auto">
            {[
              { key: "profile",       label: "Profile" },
              { key: "tasks",         label: `Tasks (${tasks.length})` },
              { key: "attendance",    label: `Attendance (${attendanceLogs.length})` },
              { key: "communication", label: `Communication (${messages.length})`, count: unreadReplies },
              { key: "documents",     label: `Documents${documents.length > 0 ? ` (${documents.length})` : ""}` },
            ].map(({ key, label, count }) => (
              <button
                key={key}
                type="button"
                onClick={() => setActiveTab(key)}
                className={`px-4 py-2.5 text-sm font-semibold rounded-t-lg border-b-2 transition cursor-pointer whitespace-nowrap flex items-center gap-2 ${
                  activeTab === key
                    ? "border-indigo-600 text-indigo-600 bg-indigo-50/20"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                }`}
              >
                <span>{label}</span>
                {count > 0 && (
                  <span className="inline-flex items-center px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-emerald-600 text-white animate-pulse">
                    {count} new
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
        {/* Tab 1: Profile */}
        {activeTab === "profile" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-6 shadow-xs space-y-6">
              <div className="flex items-center gap-4 pb-6 border-b border-gray-100">
                <div className="w-16 h-16 rounded-full bg-indigo-100 text-indigo-700 font-bold text-2xl flex items-center justify-center border border-indigo-200">
                  {staff.firstName?.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">{fullName}</h2>
                  <p className="text-sm text-gray-500">{staff.email}</p>
                  <div className="mt-2 flex items-center gap-2">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-800">{mainRole}</span>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${staff.status === 1 ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"}`}>
                      {staff.status === 1 ? "Active Account" : "Inactive Account"}
                    </span>
                  </div>
                </div>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-3">Employment & Personal Details</h3>
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                  <div><dt className="text-gray-500 text-xs">Job Title</dt><dd className="font-medium text-gray-900 mt-0.5">{staff.jobTitle || "—"}</dd></div>
                  <div><dt className="text-gray-500 text-xs">Joining Date</dt><dd className="font-medium text-gray-900 mt-0.5">{staff.joiningDate ? new Date(staff.joiningDate).toLocaleDateString("en-GB") : "—"}</dd></div>
                  <div><dt className="text-gray-500 text-xs">Gender</dt><dd className="font-medium text-gray-900 mt-0.5">{staff.gender || "—"}</dd></div>
                  <div><dt className="text-gray-500 text-xs">Date of Birth (DOB)</dt><dd className="font-medium text-gray-900 mt-0.5">{staff.dob ? new Date(staff.dob).toLocaleDateString("en-GB") : "—"}</dd></div>
                  <div><dt className="text-gray-500 text-xs">National Insurance (NIC)</dt><dd className="font-medium text-gray-900 mt-0.5 uppercase">{staff.nic || staff.nationalInsuranceNumber || "—"}</dd></div>
                  <div>
                    <dt className="text-gray-500 text-xs">Salary</dt>
                    <dd className="font-medium text-gray-900 mt-0.5">
                      {staff.salary !== undefined && staff.salary !== null
                        ? `£${Number(staff.salary).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                        : "—"}
                    </dd>
                  </div>
                  <div><dt className="text-gray-500 text-xs">Certificate of Sponsorship (COS)</dt><dd className="font-medium text-gray-900 mt-0.5">{staff.cos || staff.cosNumber || "—"}</dd></div>
                  <div><dt className="text-gray-500 text-xs">COS Expiry Date</dt><dd className="font-medium text-gray-900 mt-0.5">{staff.cosExpiry ? new Date(staff.cosExpiry).toLocaleDateString("en-GB") : "—"}</dd></div>
                </dl>
              </div>

              <div className="pt-6 border-t border-gray-100">
                <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-3">Bank Details</h3>
                {staff.bankDetails && (staff.bankDetails.accountName || staff.bankDetails.accountNumber || staff.bankDetails.sortCode || staff.bankDetails.bankName) ? (
                  <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                    <div><dt className="text-gray-500 text-xs">Account Name</dt><dd className="font-medium text-gray-900 mt-0.5">{staff.bankDetails.accountName || "—"}</dd></div>
                    <div><dt className="text-gray-500 text-xs">Bank Name</dt><dd className="font-medium text-gray-900 mt-0.5">{staff.bankDetails.bankName || "—"}</dd></div>
                    <div><dt className="text-gray-500 text-xs">Account Number</dt><dd className="font-mono font-medium text-gray-900 mt-0.5">{staff.bankDetails.accountNumber || "—"}</dd></div>
                    <div><dt className="text-gray-500 text-xs">Sort Code</dt><dd className="font-mono font-medium text-gray-900 mt-0.5">{staff.bankDetails.sortCode || "—"}</dd></div>
                  </dl>
                ) : (
                  <p className="text-sm text-gray-400 italic">No bank details provided.</p>
                )}
              </div>

              <div className="pt-6 border-t border-gray-100">
                <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-3">Address Information</h3>
                <p className="text-sm text-gray-700">
                  {staff.addressLine1 ? (
                    <>{staff.addressLine1}{staff.addressLine2 && <><br />{staff.addressLine2}</>}{(staff.postTown || staff.city) && <><br />{staff.postTown || staff.city}</>}{staff.postcode && <><br />{staff.postcode}</>}</>
                  ) : <span className="text-gray-400 italic">No address provided.</span>}
                </p>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-xs space-y-4 h-fit">
              <div className="space-y-3 text-sm">
                <div><span className="text-xs text-gray-500 block">Email Address</span><span className="font-medium text-gray-900 block mt-1 break-all">{staff.email}</span></div>
                <div><span className="text-xs text-gray-500 block">Telephone Number</span><span className="font-medium text-gray-900">{staff.phone || staff.telephoneNo || "—"}</span></div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Tasks */}
        {activeTab === "tasks" && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-xs">
            <div className="mb-6 pb-4 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">Assigned Tasks & Shifts</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Overview of care shifts and tasks assigned to {fullName}, their completion status, and submitted handover reports
              </p>
            </div>
            <StaffTasksPanel tasks={tasks} taskStats={taskStats} staffName={fullName} />
          </div>
        )}

        {/* Tab 3: Attendance */}
        {activeTab === "attendance" && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-xs">
            <div className="mb-6 pb-4 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">Attendance & Clock Logs</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Record of daily check-ins, clock-in/out timestamps, hours delivered, and shift notes for {fullName}
              </p>
            </div>
            <StaffAttendancePanel attendanceLogs={attendanceLogs} attendanceStats={attendanceStats} staffName={fullName} />
          </div>
        )}

        {/* Tab 4: Communication / Messages */}
        {activeTab === "communication" && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-xs">
            <div className="mb-6 pb-4 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">Communication & Messaging</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Direct text messaging with {fullName}. Send announcements, shift notices, or instructions and review their replies in real time.
              </p>
            </div>
            <StaffCommunicationPanel
              staff={staff}
              messages={messages}
              currentUserId={currentUserId}
              organizationId={organizationId}
            />
          </div>
        )}

        {/* Tab 5: Documents */}
        {activeTab === "documents" && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-xs">
            <DocumentsPanel documents={documents} staffId={staff._id} organizationId={organizationId} documentTypes={documentTypes} />
          </div>
        )}
      </div>
    </div>
  );
}

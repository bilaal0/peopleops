import { useState, useRef, useMemo, useEffect } from "react";
import { redirect, useLoaderData, useNavigate, Link, useFetcher, useSearchParams } from "react-router";
import { getUserFromRequest } from "../utils/auth.server.js";
import { connect } from "../config/db.server.js";
import { User } from "../models/user.server.js";
import { Message } from "../models/message.server.js";
import {
  MessageSquare, SendHorizontal, Search, Phone, Mail,
  Check, CheckCheck, Clock, UserCheck, Building2,
  ArrowRight, ShieldCheck, User as UserIcon
} from "lucide-react";

function formatTime12(timeStrOrIso) {
  if (!timeStrOrIso) return "—";
  try {
    const d = new Date(timeStrOrIso);
    if (!isNaN(d.getTime())) {
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true });
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

export async function loader({ request }) {
  const currentUser = await getUserFromRequest(request);
  if (!currentUser) return redirect("/login");

  await connect();

  const isSuperAdmin = currentUser.roles?.includes("SUPER_ADMIN");
  const canManage = currentUser.roles?.some((r) =>
    ["SUPER_ADMIN", "ADMIN", "MASTER_ADMIN", "INITIAL_ADMIN", "REGISTERED_MANAGER"].includes(r)
  );
  const isEmployeeOnly = !canManage;

  const url = new URL(request.url);
  const selectedStaffParam = url.searchParams.get("staffId");

  const orgQuery = {};
  if (!isSuperAdmin && currentUser.organizationId) {
    orgQuery.organizationId = currentUser.organizationId;
  }

  // Concurrently fetch staff directory and all organization messages in parallel
  const [staffUsers, allMessages] = await Promise.all([
    User.find({
      roles: { $in: ["STAFF", "EMPLOYEE", "ADMIN", "REGISTERED_MANAGER", "FIELD_WORKER"] },
      deleted: false,
      ...orgQuery,
    })
      .select("firstName lastName title email phone telephoneNo jobTitle roles status")
      .sort({ firstName: 1 })
      .lean(),
    Message.find(orgQuery).sort({ createdAt: 1 }).lean(),
  ]);

  // Clean mapped staff list
  const staffList = staffUsers.map((u) => ({
    _id: u._id.toString(),
    name: `${u.title ? u.title + " " : ""}${u.firstName || ""} ${u.lastName || ""}`.trim() || u.email,
    firstName: u.firstName || "Staff",
    lastName: u.lastName || "",
    email: u.email,
    phone: u.telephoneNo || u.phone || "",
    jobTitle: u.jobTitle || "Staff Member",
    roles: u.roles || [],
    status: u.status,
  }));

  // Clean mapped messages
  const messages = allMessages.map((m) => ({
    _id: m._id.toString(),
    sender: m.sender ? m.sender.toString() : "",
    recipient: m.recipient ? m.recipient.toString() : "",
    senderName: m.senderName || "User",
    senderRole: m.senderRole || "",
    recipientName: m.recipientName || "",
    message: m.message || "",
    read: Boolean(m.read),
    readAt: m.readAt ? m.readAt.toISOString() : null,
    status: m.status || "sent",
    createdAt: m.createdAt ? m.createdAt.toISOString() : new Date().toISOString(),
    isFromMe: m.sender ? m.sender.toString() === currentUser.userId : false,
  }));

  // Default selected staff member for management view
  let defaultStaffId = selectedStaffParam;
  if (!defaultStaffId && !isEmployeeOnly && staffList.length > 0) {
    const latestMsg = [...messages].reverse().find(
      (m) => staffList.some((s) => s._id === m.sender || s._id === m.recipient)
    );
    if (latestMsg) {
      defaultStaffId = staffList.some((s) => s._id === latestMsg.sender)
        ? latestMsg.sender
        : latestMsg.recipient;
    } else {
      defaultStaffId = staffList[0]._id;
    }
  }

  // Mark unread messages as read in the background
  if (isEmployeeOnly) {
    Message.updateMany(
      { recipient: currentUser.userId, read: false },
      { $set: { read: true, readAt: new Date(), status: "read" } }
    ).exec().catch(() => {});
  } else if (defaultStaffId) {
    Message.updateMany(
      { sender: defaultStaffId, recipient: currentUser.userId, read: false },
      { $set: { read: true, readAt: new Date(), status: "read" } }
    ).exec().catch(() => {});
  }

  return {
    currentUser,
    isEmployeeOnly,
    canManage,
    staffList,
    messages,
    defaultStaffId,
  };
}

export default function MessagesPage() {
  const {
    currentUser,
    isEmployeeOnly,
    canManage,
    staffList = [],
    messages = [],
    defaultStaffId,
  } = useLoaderData();

  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedStaffId, setSelectedStaffId] = useState(defaultStaffId);
  const [staffSearchQuery, setStaffSearchQuery] = useState("");
  const [inputText, setInputText] = useState("");
  const messagesEndRef = useRef(null);
  const fetcher = useFetcher();

  // Selected staff object
  const selectedStaff = useMemo(() => {
    return staffList.find((s) => s._id === selectedStaffId) || staffList[0] || null;
  }, [staffList, selectedStaffId]);

  // Management recipient for staff view
  const lastManagementMessage = useMemo(() => {
    return [...messages].reverse().find((m) => !m.isFromMe);
  }, [messages]);

  const managementRecipientId = lastManagementMessage ? lastManagementMessage.sender : "";

  // Messages in active conversation
  const isSubmitting = fetcher.state !== "idle" && fetcher.formData?.get("_intent") === "send_message";
  const optimisticText = isSubmitting ? fetcher.formData.get("message") : null;

  const conversationMessages = useMemo(() => {
    let base = [];
    if (isEmployeeOnly) {
      base = messages.filter(
        (m) => m.sender === currentUser.userId || m.recipient === currentUser.userId
      );
    } else if (selectedStaff) {
      base = messages.filter(
        (m) => m.sender === selectedStaff._id || m.recipient === selectedStaff._id
      );
    }

    if (!optimisticText) return base;

    return [
      ...base,
      {
        _id: "temp-" + Date.now(),
        sender: currentUser.userId,
        recipient: isEmployeeOnly ? managementRecipientId : selectedStaff?._id,
        senderName: isEmployeeOnly ? "You (Staff Reply)" : "You (Management)",
        senderRole: isEmployeeOnly ? "Staff" : "Management",
        message: optimisticText,
        read: false,
        status: "sending...",
        createdAt: new Date().toISOString(),
        isFromMe: true,
      },
    ];
  }, [messages, isEmployeeOnly, selectedStaff, currentUser.userId, managementRecipientId, optimisticText]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversationMessages.length]);

  const handleSelectStaff = (id) => {
    setSelectedStaffId(id);
    setSearchParams({ staffId: id });
    fetcher.submit(
      { _intent: "mark_read", senderId: id },
      { method: "post", action: "/api/messages" }
    );
  };

  const handleSendMessage = (e) => {
    if (e) e.preventDefault();
    const text = inputText.trim();
    if (!text) return;

    const recipientId = isEmployeeOnly ? managementRecipientId : selectedStaff?._id;
    if (!recipientId) return;

    fetcher.submit(
      {
        _intent: "send_message",
        recipientId,
        message: text,
      },
      { method: "post", action: "/api/messages" }
    );
    setInputText("");
  };

  const presets = isEmployeeOnly
    ? [
        "Received and understood. Thank you.",
        "I have completed the task and updated notes.",
        "I have marked attendance for today's shift.",
        "Will call the office shortly.",
      ]
    : [
        `📅 Shift Reminder: Hi ${selectedStaff?.firstName || "there"}, please confirm your upcoming shift on the rota.`,
        `⏱️ Attendance Notice: Hi ${selectedStaff?.firstName || "there"}, please remember to clock in upon your arrival.`,
        `📋 Task Update: Hi ${selectedStaff?.firstName || "there"}, please update your task notes for today.`,
        `📞 Urgent: Please call the management office as soon as you are available.`,
      ];

  // Filter staff list
  const filteredStaffList = useMemo(() => {
    if (!staffSearchQuery.trim()) return staffList;
    const q = staffSearchQuery.toLowerCase();
    return staffList.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.email.toLowerCase().includes(q) ||
        s.jobTitle.toLowerCase().includes(q)
    );
  }, [staffList, staffSearchQuery]);

  // Count unread messages per staff member
  const staffUnreadCounts = useMemo(() => {
    const counts = {};
    for (const m of messages) {
      if (!m.isFromMe && !m.read && m.sender) {
        counts[m.sender] = (counts[m.sender] || 0) + 1;
      }
    }
    return counts;
  }, [messages]);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 flex items-center gap-2.5">
                <MessageSquare className="h-7 w-7 text-indigo-600" />
                <span>{isEmployeeOnly ? "Messages from Management" : "Staff Communications"}</span>
              </h1>
              <p className="mt-1 text-sm text-gray-600">
                {isEmployeeOnly
                  ? "Read announcements, shift updates, and instructions, and submit your direct replies"
                  : "Send direct text messages to staff, track message delivery, and view staff replies in real time"}
              </p>
            </div>
            {!isEmployeeOnly && (
              <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                <span>Active 2-Way Text Channel</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Container */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden grid grid-cols-1 lg:grid-cols-12 min-h-[640px]">
          
          {/* Management: Left Staff List Directory */}
          {!isEmployeeOnly && (
            <div className="lg:col-span-4 border-r border-slate-200 flex flex-col bg-slate-50/40">
              {/* Search Box */}
              <div className="p-3.5 border-b border-slate-200 bg-white">
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="text"
                    value={staffSearchQuery}
                    onChange={(e) => setStaffSearchQuery(e.target.value)}
                    placeholder="Search staff by name or role..."
                    className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition"
                  />
                </div>
              </div>

              {/* Staff List */}
              <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
                {filteredStaffList.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-400">
                    No staff members found matching query.
                  </div>
                ) : (
                  filteredStaffList.map((st) => {
                    const isSelected = selectedStaff?._id === st._id;
                    const unreadCount = staffUnreadCounts[st._id] || 0;
                    const lastMsg = [...messages]
                      .reverse()
                      .find((m) => m.sender === st._id || m.recipient === st._id);

                    return (
                      <button
                        key={st._id}
                        type="button"
                        onClick={() => handleSelectStaff(st._id)}
                        className={`w-full text-left p-4 transition flex items-start gap-3 cursor-pointer ${
                          isSelected
                            ? "bg-indigo-50/80 border-l-4 border-indigo-600 shadow-2xs"
                            : "hover:bg-slate-100/60"
                        }`}
                      >
                        <div className="w-10 h-10 rounded-full bg-indigo-600 text-white font-bold text-sm flex items-center justify-center shrink-0 shadow-2xs">
                          {st.firstName?.charAt(0).toUpperCase() || "S"}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-1 mb-0.5">
                            <p className="text-xs font-bold text-slate-900 truncate">
                              {st.name}
                            </p>
                            {lastMsg && (
                              <span className="text-[10px] text-slate-400 shrink-0">
                                {formatTime12(lastMsg.createdAt)}
                              </span>
                            )}
                          </div>

                          <p className="text-[11px] text-slate-500 truncate mb-1">
                            {st.jobTitle}
                          </p>

                          {lastMsg ? (
                            <p className="text-xs text-slate-600 truncate flex items-center gap-1">
                              {lastMsg.isFromMe && <span className="text-indigo-600 font-semibold">You:</span>}
                              <span>{lastMsg.message}</span>
                            </p>
                          ) : (
                            <p className="text-[11px] text-slate-400 italic">No messages yet</p>
                          )}
                        </div>

                        {unreadCount > 0 && (
                          <span className="bg-emerald-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 shadow-2xs animate-pulse">
                            {unreadCount} new
                          </span>
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* Right Pane: Active Chat Conversation */}
          <div className={`${isEmployeeOnly ? "lg:col-span-12" : "lg:col-span-8"} flex flex-col bg-white`}>
            
            {/* Conversation Header */}
            <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-indigo-600 text-white font-bold text-sm flex items-center justify-center shadow-xs">
                  {isEmployeeOnly
                    ? "M"
                    : selectedStaff?.firstName?.charAt(0).toUpperCase() || "S"}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-bold text-slate-900">
                      {isEmployeeOnly
                        ? "Office Management Channel"
                        : selectedStaff?.name || "Select a Staff Member"}
                    </h2>
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                      Direct Text
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">
                    {isEmployeeOnly
                      ? "Direct updates, alerts, and instructions from your supervisors"
                      : `${selectedStaff?.jobTitle || "Staff"} • ${selectedStaff?.email || ""}`}
                  </p>
                </div>
              </div>

              {!isEmployeeOnly && selectedStaff && (
                <div className="flex items-center gap-2">
                  {selectedStaff.phone && (
                    <a
                      href={`tel:${selectedStaff.phone}`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 transition shadow-2xs"
                    >
                      <Phone className="w-3.5 h-3.5 text-slate-500" />
                      <span>Call</span>
                    </a>
                  )}
                  <Link
                    to={`/user-accounts/staff/${selectedStaff._id}`}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 text-xs font-bold hover:bg-indigo-100 transition"
                  >
                    View Staff Profile <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              )}
            </div>

            {/* Chat Messages Timeline */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 bg-slate-50/50">
              {conversationMessages.length === 0 ? (
                <div className="h-full min-h-[300px] flex flex-col items-center justify-center text-center p-8">
                  <div className="w-14 h-14 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center mb-3 text-indigo-600">
                    <MessageSquare className="w-7 h-7" />
                  </div>
                  <h4 className="text-sm font-bold text-slate-900">No Messages in this Thread</h4>
                  <p className="text-xs text-slate-500 max-w-sm mt-1">
                    {isEmployeeOnly
                      ? "You do not have any incoming messages from management yet. Send a note below if you have any questions."
                      : `Send a text to ${selectedStaff?.firstName || "staff"} below. They will receive it on their dashboard and can reply back.`}
                  </p>
                </div>
              ) : (
                conversationMessages.map((msg) => {
                  const isMe = msg.isFromMe;
                  const isStaffReply = !isEmployeeOnly && !isMe;
                  const timeDisplay = msg.createdAt ? formatTime12(msg.createdAt) : "";
                  const dateDisplay = msg.createdAt ? formatDateDisplay(msg.createdAt) : "";

                  return (
                    <div
                      key={msg._id}
                      className={`flex items-end gap-2.5 ${isMe ? "justify-end" : "justify-start"}`}
                    >
                      {/* Avatar for other party */}
                      {!isMe && (
                        <div
                          className={`w-8 h-8 rounded-full text-white font-bold text-xs flex items-center justify-center shrink-0 shadow-2xs ${
                            isEmployeeOnly ? "bg-indigo-700" : "bg-emerald-600"
                          }`}
                        >
                          {isEmployeeOnly ? "M" : selectedStaff?.firstName?.charAt(0).toUpperCase() || "S"}
                        </div>
                      )}

                      <div
                        className={`max-w-lg rounded-2xl p-4 shadow-xs ${
                          isMe
                            ? "bg-indigo-600 text-white rounded-br-xs"
                            : "bg-white border border-slate-200 text-slate-900 rounded-bl-xs"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3 mb-1.5">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`text-xs font-bold ${
                                isMe ? "text-indigo-100" : "text-slate-900"
                              }`}
                            >
                              {isMe
                                ? isEmployeeOnly
                                  ? "You (Staff Reply)"
                                  : "You (Management)"
                                : msg.senderName || (isEmployeeOnly ? "Management" : "Staff")}
                            </span>
                            {isStaffReply && (
                              <span className="inline-flex items-center px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-emerald-100 text-emerald-800">
                                Staff Reply
                              </span>
                            )}
                          </div>
                          <span
                            className={`text-[10px] ${
                              isMe ? "text-indigo-200" : "text-slate-400"
                            }`}
                          >
                            {timeDisplay} {dateDisplay ? `• ${dateDisplay}` : ""}
                          </span>
                        </div>

                        <p className={`text-sm whitespace-pre-wrap leading-relaxed ${isMe ? "text-white" : "text-slate-800"}`}>
                          {msg.message}
                        </p>

                        {isMe && (
                          <div className="flex justify-end items-center gap-1 mt-1.5 text-[10px] text-indigo-200">
                            {msg.read ? (
                              <span className="flex items-center gap-0.5 text-emerald-300 font-semibold">
                                <CheckCheck className="w-3.5 h-3.5" /> Read
                              </span>
                            ) : (
                              <span className="flex items-center gap-0.5">
                                <Check className="w-3.5 h-3.5" /> {msg.status === "sending..." ? "Sending..." : "Delivered"}
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Avatar for me */}
                      {isMe && (
                        <div
                          className={`w-8 h-8 rounded-full text-white font-bold text-xs flex items-center justify-center shrink-0 shadow-2xs ${
                            isEmployeeOnly ? "bg-emerald-600" : "bg-indigo-700"
                          }`}
                        >
                          {currentUser.roles?.includes("SUPER_ADMIN") || currentUser.roles?.includes("ADMIN") ? "M" : "S"}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Quick Presets */}
            <div className="border-t border-slate-200 bg-white px-4 py-2">
              <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
                <span className="text-[11px] font-semibold text-slate-400 shrink-0 uppercase tracking-wider">
                  Quick Text:
                </span>
                {presets.map((preset, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setInputText(preset)}
                    className="shrink-0 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-slate-700 text-[11px] font-medium transition cursor-pointer border border-transparent hover:border-indigo-200"
                  >
                    {preset.split(":")[0]}
                  </button>
                ))}
              </div>
            </div>

            {/* Message Composer Box */}
            <div className="border-t border-slate-200 bg-white p-3.5">
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
                    placeholder={
                      isEmployeeOnly
                        ? "Type your reply to management... (Press Enter to send)"
                        : `Type a message to ${selectedStaff?.firstName || "staff"}... (Press Enter to send)`
                    }
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting || !inputText.trim() || (!isEmployeeOnly && !selectedStaff)}
                  className="h-10 px-4 rounded-xl bg-indigo-600 text-white font-semibold text-xs hover:bg-indigo-700 disabled:opacity-50 transition flex items-center justify-center gap-1.5 shadow-sm cursor-pointer shrink-0 mb-1"
                >
                  {isSubmitting ? (
                    "Sending..."
                  ) : (
                    <>
                      <span>{isEmployeeOnly ? "Send Reply" : "Send Text"}</span>
                      <SendHorizontal className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

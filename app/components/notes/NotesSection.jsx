import React, { useState, useEffect } from "react";
import { useFetcher } from "react-router-dom";

// ── Timestamp formatter ──────────────────────────────────────────────────────
// Same day:      'Today at 14:32'
// Previous day:  'Yesterday at 09:15'
// This year:     '15 Mar at 11:00'
// Previous year: '15 Mar 2025 at 11:00'
function formatNoteTime(dateString) {
  const d = new Date(dateString);
  const now = new Date();
  const isSameDay = d.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();
  const isSameYear = d.getFullYear() === now.getFullYear();
  const timeStr = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  if (isSameDay) return `Today at ${timeStr}`;
  if (isYesterday) return `Yesterday at ${timeStr}`;

  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const dayStr = `${d.getDate()} ${months[d.getMonth()]}`;
  if (isSameYear) return `${dayStr} at ${timeStr}`;
  return `${dayStr} ${d.getFullYear()} at ${timeStr}`;
}

// ── Consistent avatar colour per user ───────────────────────────────────────
function getAvatarColor(name) {
  const palette = [
    "bg-red-100 text-red-700", "bg-orange-100 text-orange-700",
    "bg-amber-100 text-amber-700", "bg-green-100 text-green-700",
    "bg-emerald-100 text-emerald-700", "bg-teal-100 text-teal-700",
    "bg-cyan-100 text-cyan-700", "bg-blue-100 text-blue-700",
    "bg-indigo-100 text-indigo-700", "bg-violet-100 text-violet-700",
    "bg-purple-100 text-purple-700", "bg-pink-100 text-pink-700",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return palette[Math.abs(hash) % palette.length];
}

// ── NoteCard ─────────────────────────────────────────────────────────────────
// Props: note, currentUserId (string), currentUserRole (string), onDelete (fn)
function NoteCard({ note, currentUserId, currentUserRole, onDelete }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const deleteFetcher = useFetcher();
  const isDeleting = deleteFetcher.state !== "idle";

  const authorName = note.addedBy
    ? `${note.addedBy.title ? note.addedBy.title + ' ' : ''}${note.addedBy.firstName} ${note.addedBy.lastName}`
    : "Unknown User";
  const initials = note.addedBy
    ? `${note.addedBy.firstName?.[0] ?? ""}${note.addedBy.lastName?.[0] ?? ""}`.toUpperCase()
    : "?";

  // Spec: show Delete if own note OR currentUserRole === 'agency_admin'
  const isOwn = note.addedBy && currentUserId === note.addedBy._id;
  const isAdmin = currentUserRole === "agency_admin" || currentUserRole === "AGENCY_ADMIN" || currentUserRole === "SUPER_ADMIN";
  const canDelete = !note.isSystem && (isOwn || isAdmin);

  // useFetcher + useEffect — remove from list once server confirms hard delete
  useEffect(() => {
    if (deleteFetcher.state === "idle" && deleteFetcher.data?.success) {
      onDelete(note._id);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deleteFetcher.state, deleteFetcher.data]);

  const handleDelete = () => {
    deleteFetcher.submit({ noteId: note._id }, {
      method: "post",
      action: "/notes/delete",
    });
  };

  return (
    <div className={`p-4 rounded-xl border border-gray-200 bg-white shadow-sm flex gap-4 transition-opacity ${isDeleting ? "opacity-40 pointer-events-none" : "opacity-100"}`}>
      {/* Avatar */}
      <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ${getAvatarColor(authorName)}`}>
        {initials}
      </div>

      {/* Body */}
      <div className="flex-1 min-w-0">
        {/* Header row */}
        <div className="flex items-start justify-between gap-4 mb-2">
          <p className="text-sm font-bold text-gray-900">{authorName}</p>
          <p className="text-xs text-gray-400 whitespace-nowrap">{formatNoteTime(note.createdAt)}</p>
        </div>

        {/* Note text — no truncation, preserves line breaks */}
        <p className="text-sm text-gray-700 whitespace-pre-wrap break-words">{note.text}</p>

        {/* Delete control */}
        {canDelete && (
          <div className="mt-3 flex justify-end">
            {!confirmDelete ? (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="text-xs text-gray-400 hover:text-red-600 transition font-medium"
              >
                Delete
              </button>
            ) : (
              <div className="flex items-center gap-3 bg-red-50 px-3 py-1.5 rounded-md border border-red-100">
                <span className="text-xs font-semibold text-red-800">Are you sure?</span>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="text-xs font-bold text-red-600 hover:text-red-800 transition disabled:opacity-50"
                >
                  Yes, delete
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  disabled={isDeleting}
                  className="text-xs text-gray-500 hover:text-gray-700 transition"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── NotesSection ──────────────────────────────────────────────────────────────
// Props match spec:
//   entityType       String   — 'property' | 'landlord' | 'tenant' | 'tenancy'
//   entityId         String   — ObjectId string of the record
//   notes            Array    — initial page of notes
//   hasMore          Boolean  — whether more notes exist beyond the first 10
//   currentUserId    String   — logged-in user's _id string
//   currentUserRole  String   — logged-in user's role string
export default function NotesSection({
  entityType,
  entityId,
  notes: initialNotes,
  hasMore: initialHasMore,
  currentUserId,
  currentUserRole,
}) {
  const [localNotes, setLocalNotes] = useState(initialNotes || []);
  const [hasMore, setHasMore] = useState(initialHasMore || false);
  const [page, setPage] = useState(1);
  const [text, setText] = useState("");

  const addFetcher = useFetcher();
  const loadMoreFetcher = useFetcher();

  const isAdding = addFetcher.state !== "idle";
  const isLoadingMore = loadMoreFetcher.state !== "idle";

  // On successful add — prepend new note and clear textarea
  useEffect(() => {
    if (addFetcher.state === "idle" && addFetcher.data?.success && addFetcher.data?.note) {
      setLocalNotes((prev) => {
        if (prev.some((n) => n._id === addFetcher.data.note._id)) return prev;
        return [addFetcher.data.note, ...prev];
      });
      setText("");
    }
  }, [addFetcher.state, addFetcher.data]);

  // On load more — append without duplicates
  useEffect(() => {
    if (loadMoreFetcher.state === "idle" && loadMoreFetcher.data?.notes) {
      setLocalNotes((prev) => {
        const ids = new Set(prev.map((n) => n._id));
        return [...prev, ...loadMoreFetcher.data.notes.filter((n) => !ids.has(n._id))];
      });
      setHasMore(loadMoreFetcher.data.hasMore);
      setPage(loadMoreFetcher.data.page);
    }
  }, [loadMoreFetcher.state, loadMoreFetcher.data]);

  // Reset when navigating to a different entity
  useEffect(() => {
    setLocalNotes(initialNotes || []);
    setHasMore(initialHasMore || false);
    setPage(1);
    setText("");
  }, [entityId]);

  const handleDeleteOptimistic = (noteId) =>
    setLocalNotes((prev) => prev.filter((n) => n._id !== noteId));

  const handleAddNote = () => {
    if (!text.trim() || text.length > 2000) return;
    addFetcher.submit(
      { entityType, entityId, text: text.trim() },
      { method: "post", action: "/notes/add" }
    );
  };

  const handleLoadMore = () => {
    loadMoreFetcher.load(
      `/notes/add?entityType=${entityType}&entityId=${entityId}&page=${page + 1}`
    );
  };

  // Context-aware placeholder (spec Section 4)
  const placeholders = {
    property: "Add a note about this property…",
    landlord: "Add a note about this landlord…",
    tenant:   "Add a note about this tenant…",
    tenancy:  "Add a note about this tenancy…",
  };
  const placeholder = placeholders[entityType] || "Add a note…";

  // Character counter colouring (spec Section 4)
  const charCount = text.length;
  const counterCls =
    charCount >= 2000 ? "text-red-500 font-bold" :
    charCount >= 1800 ? "text-amber-500 font-medium" :
    "text-gray-400";

  return (
    <div className="mt-8 pt-8 border-t border-gray-200" id="activity-notes">
      {/* Section heading */}
      <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-6">
        Activity Notes
      </h2>

      {/* ── Add note textarea ──────────────────────────────────── */}
      <div className="mb-8">
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 shadow-sm focus-within:border-indigo-300 focus-within:ring-2 focus-within:ring-indigo-100 transition">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={isAdding}
            placeholder={placeholder}
            rows={Math.max(3, (text.match(/\n/g) || []).length + 1)}
            maxLength={2000}
            className="w-full bg-transparent border-none outline-none focus:ring-0 p-0 text-sm resize-none text-gray-900 placeholder-gray-400"
          />
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-dashed border-gray-200">
            <span className={`text-xs ${counterCls}`}>{charCount} / 2000</span>
            <button
              type="button"
              onClick={handleAddNote}
              disabled={isAdding || !text.trim() || charCount >= 2000}
              className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 rounded-lg text-xs font-semibold text-white hover:bg-indigo-700 transition disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
            >
              {isAdding ? (
                <>
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Saving…
                </>
              ) : "Add Note"}
            </button>
          </div>
        </div>
        {addFetcher.data?.error && (
          <p className="mt-2 text-sm text-red-600 font-medium">{addFetcher.data.error}</p>
        )}
      </div>

      {/* ── Notes list ────────────────────────────────────────── */}
      <div className="space-y-4">
        {localNotes.length === 0 ? (
          <div className="p-8 rounded-xl bg-gray-50 border border-dashed border-gray-200 text-center">
            <p className="text-sm text-gray-500 font-medium">
              No notes yet. Add the first note above.
            </p>
          </div>
        ) : (
          localNotes.map((note) => (
            <NoteCard
              key={note._id}
              note={note}
              currentUserId={currentUserId}
              currentUserRole={currentUserRole}
              onDelete={handleDeleteOptimistic}
            />
          ))
        )}
      </div>

      {/* ── Load more ─────────────────────────────────────────── */}
      {hasMore && (
        <div className="mt-6 flex justify-center">
          <button
            type="button"
            onClick={handleLoadMore}
            disabled={isLoadingMore}
            className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 shadow-sm transition disabled:opacity-50"
          >
            {isLoadingMore ? "Loading…" : "Load more notes"}
          </button>
        </div>
      )}
    </div>
  );
}

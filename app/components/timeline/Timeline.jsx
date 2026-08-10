import { useEffect, useMemo, useState } from "react";
import { useFetcher } from "react-router-dom";
import {
  ChevronDown,
  Clock3,
  Cog,
  Filter,
  Loader2,
  Plus,
  Trash2,
} from "lucide-react";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "events", label: "Events" },
  { key: "notes", label: "Notes" },
  { key: "rent", label: "Rent" },
  { key: "maintenance", label: "Maintenance" },
];

const GROUP_COLORS = {
  tenancy: "bg-blue-500",
  rent: "bg-emerald-500",
  maintenance: "bg-amber-500",
  document: "bg-violet-500",
  compliance: "bg-orange-500",
  communication: "bg-cyan-500",
  manual: "bg-slate-500",
  system: "bg-slate-400",
};

function toDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatGroupDate(value) {
  const date = toDate(value);
  if (!date) return "Unknown date";

  const options = {
    day: "numeric",
    month: "short",
  };
  if (date.getFullYear() !== new Date().getFullYear()) {
    options.year = "numeric";
  }

  return new Intl.DateTimeFormat("en-GB", options).format(date);
}

function formatTime(value) {
  const date = toDate(value);
  if (!date) return "";
  return date.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isSameDay(left, right) {
  return left && right && left.toDateString() === right.toDateString();
}

function isYesterday(date, now) {
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  return date.toDateString() === yesterday.toDateString();
}

function isInCurrentWeek(date, now) {
  const startOfWeek = new Date(now);
  startOfWeek.setHours(0, 0, 0, 0);
  const day = startOfWeek.getDay();
  const mondayOffset = day === 0 ? 6 : day - 1;
  startOfWeek.setDate(startOfWeek.getDate() - mondayOffset);
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(endOfWeek.getDate() + 7);
  return date >= startOfWeek && date < endOfWeek;
}

function getGroupLabel(dateValue) {
  const date = toDate(dateValue);
  if (!date) return "Unknown date";

  const now = new Date();
  if (isSameDay(date, now)) return "Today";
  if (isYesterday(date, now)) return "Yesterday";
  if (isInCurrentWeek(date, now)) return "This week";
  return formatGroupDate(date);
}

function getGroupKey(dateValue) {
  const date = toDate(dateValue);
  if (!date) return "unknown";

  const now = new Date();
  if (isSameDay(date, now)) return "today";
  if (isYesterday(date, now)) return "yesterday";
  if (isInCurrentWeek(date, now)) return "this-week";
  return date.toISOString().slice(0, 10);
}

function formatMoney(value) {
  if (value === null || value === undefined || value === "") return null;
  const amount = Number(value);
  if (Number.isNaN(amount)) return String(value);
  return `GBP ${amount.toLocaleString("en-GB", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

function niceLabel(value) {
  if (!value) return null;
  return String(value)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function getCategory(note) {
  if (!note?.isSystem) return "manual";

  const eventType = String(note.eventType || "");
  if (eventType.startsWith("rent_payment_")) return "rent";
  if (eventType.startsWith("maintenance_")) return "maintenance";
  if (eventType.startsWith("property_") || eventType.startsWith("tenant_") || eventType.startsWith("landlord_") || eventType.startsWith("document_")) {
    if (eventType.includes("_uploaded") || eventType.includes("_verified")) return "document";
  }
  if (eventType.startsWith("tenancy_") || eventType.startsWith("tenant_rtr_") || eventType.startsWith("landlord_aml_")) return "compliance";
  if (eventType === "evidence_bundle_generated") return "document";
  return "system";
}

function getDotClass(note) {
  const category = getCategory(note);
  return GROUP_COLORS[category] || GROUP_COLORS.system;
}

function getAuthorName(note) {
  if (note?.addedBy?.firstName || note?.addedBy?.lastName) {
    return `${note.addedBy.firstName || ""} ${note.addedBy.lastName || ""}`.trim();
  }
  if (note?.addedBy?.email) {
    return note.addedBy.email;
  }
  return note?.isSystem ? "Proplet System" : "Unknown user";
}

function getInitials(name) {
  const parts = String(name || "")
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "?";
  return parts
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function getMetadataPills(note) {
  const metadata = note?.metadata || {};
  const pills = [];
  const eventType = String(note?.eventType || "");

  const add = (value) => {
    if (value === null || value === undefined || value === "") return;
    pills.push(String(value));
  };

  if (eventType === "rent_payment_received" || eventType === "rent_payment_partial") {
    add(formatMoney(metadata.amountPaid));
    add(formatMoney(metadata.amountDue));
    add(metadata.method && niceLabel(metadata.method));
    add(formatMoney(metadata.commission) && `Commission ${formatMoney(metadata.commission)}`);
    add(formatMoney(metadata.netToLandlord) && `Net ${formatMoney(metadata.netToLandlord)}`);
    add(metadata.period);
  }

  if (eventType === "rent_payment_waived") {
    add(metadata.period);
    add(formatMoney(metadata.amount));
    add(metadata.reason);
  }

  if (eventType === "tenancy_deposit_protected") {
    add(metadata.scheme);
    add(metadata.reference && `Ref: ${metadata.reference}`);
    add(formatMoney(metadata.amount));
    add(metadata.protectedDate && new Date(metadata.protectedDate).toLocaleDateString("en-GB"));
  }

  if (eventType === "tenancy_deposit_prescribed_info_served") {
    add(metadata.servedDate && new Date(metadata.servedDate).toLocaleDateString("en-GB"));
  }

  if (eventType === "tenancy_how_to_rent_served") {
    add(metadata.version);
    add(metadata.servedDate && new Date(metadata.servedDate).toLocaleDateString("en-GB"));
  }

  if (eventType === "property_gas_cert_uploaded" || eventType === "property_eicr_uploaded" || eventType === "property_epc_uploaded" || eventType === "document_uploaded" || eventType === "document_verified") {
    add(metadata.docType && niceLabel(metadata.docType));
    add(metadata.rating);
    add(metadata.expiryDate && `Expires ${new Date(metadata.expiryDate).toLocaleDateString("en-GB")}`);
  }

  if (eventType === "maintenance_job_created" || eventType === "maintenance_job_updated" || eventType === "maintenance_job_completed" || eventType === "maintenance_job_closed" || eventType === "maintenance_contractor_assigned") {
    add(metadata.jobRef);
    add(metadata.category && niceLabel(metadata.category));
    add(metadata.priority && niceLabel(metadata.priority));
    add(metadata.contractorName);
    add(metadata.status && niceLabel(metadata.status));
    add(formatMoney(metadata.actualCost));
    add(metadata.invoiceRef && `Invoice ${metadata.invoiceRef}`);
  }

  if (eventType === "tenancy_created") {
    add(metadata.tenancyType);
    add(metadata.startDate && new Date(metadata.startDate).toLocaleDateString("en-GB"));
    add(metadata.endDate && metadata.endDate !== "Periodic" ? new Date(metadata.endDate).toLocaleDateString("en-GB") : "Periodic");
    add(formatMoney(metadata.rentAmount));
  }

  if (eventType === "landlord_aml_passed" || eventType === "landlord_aml_referred" || eventType === "landlord_aml_failed" || eventType === "tenant_rtr_checked") {
    add(metadata.result);
    add(metadata.docType);
    add(metadata.expiryDate && new Date(metadata.expiryDate).toLocaleDateString("en-GB"));
  }

  if (eventType === "evidence_bundle_generated") {
    add(metadata.generatedAt && new Date(metadata.generatedAt).toLocaleString("en-GB"));
  }

  if (eventType === "property_status_changed") {
    add(metadata.oldStatus && niceLabel(metadata.oldStatus));
    add(metadata.newStatus && niceLabel(metadata.newStatus));
  }

  return pills.slice(0, 4);
}

function TimelineEntry({
  note,
  currentUserId,
  currentUserRole,
  onDelete,
  showConnector,
}) {
  const deleteFetcher = useFetcher();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const isDeleting = deleteFetcher.state !== "idle";
  const authorName = getAuthorName(note);
  const initials = note.isSystem ? null : getInitials(authorName);
  const canDelete = !note.isSystem && (
    String(currentUserId) === String(note.addedBy?._id) ||
    ["organization_admin", "ORGANIZATION_ADMIN", "SUPER_ADMIN"].includes(currentUserRole)
  );

  useEffect(() => {
    if (deleteFetcher.state === "idle" && deleteFetcher.data?.success) {
      onDelete(note._id);
    }
  }, [deleteFetcher.state, deleteFetcher.data, note._id, onDelete]);

  const handleDelete = () => {
    deleteFetcher.submit(
      { noteId: note._id },
      { method: "post", action: "/notes/delete" }
    );
  };

  const timeLabel = (() => {
    const createdAt = toDate(note.createdAt);
    if (!createdAt) return "";
    const now = new Date();
    return isSameDay(createdAt, now) ? formatTime(createdAt) : formatGroupDate(createdAt);
  })();

  const pills = getMetadataPills(note);
  const category = getCategory(note);

  return (
    <div className="relative">
      {showConnector && (
        <div className="absolute left-6 top-0 bottom-0 w-px bg-slate-200" />
      )}

      <div className="relative pl-14">
        <div className={`absolute left-4 top-5 h-4 w-4 rounded-full ring-4 ring-white ${getDotClass(note)}`} />

        <div className="absolute left-2.5 top-3 flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white shadow-sm text-slate-500">
          {note.isSystem ? <Cog className="h-3.5 w-3.5" /> : <span className="text-[10px] font-bold">{initials}</span>}
        </div>

        <div className={`rounded-2xl border border-slate-200 bg-white shadow-sm transition ${isDeleting ? "opacity-40 pointer-events-none" : "opacity-100"}`}>
          <div className="p-4 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-start gap-3 min-w-0">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-slate-900">{authorName}</p>
                    {note.isSystem && (
                      <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                        System
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-slate-700 whitespace-pre-wrap break-words">{note.text}</p>

                  {pills.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {pills.map((pill) => (
                        <span
                          key={pill}
                          className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-600"
                        >
                          {pill}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <Clock3 className="h-3.5 w-3.5" />
                  <span>{timeLabel}</span>
                </div>
                <div className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${
                  category === "rent"
                    ? "bg-emerald-50 text-emerald-700"
                    : category === "maintenance"
                    ? "bg-amber-50 text-amber-700"
                    : category === "document"
                    ? "bg-violet-50 text-violet-700"
                    : category === "compliance"
                    ? "bg-orange-50 text-orange-700"
                    : note.isSystem
                    ? "bg-slate-100 text-slate-600"
                    : "bg-slate-100 text-slate-600"
                }`}>
                  {note.isSystem ? "Event" : "Note"}
                </div>
              </div>
            </div>

            {canDelete && (
              <div className="mt-4 flex justify-end">
                {!confirmDelete ? (
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(true)}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-red-600 transition"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </button>
                ) : (
                  <div className="flex flex-wrap items-center gap-2 rounded-xl border border-red-100 bg-red-50 px-3 py-2">
                    <span className="text-xs font-semibold text-red-800">Delete this note?</span>
                    <button
                      type="button"
                      onClick={handleDelete}
                      disabled={isDeleting}
                      className="inline-flex items-center gap-1 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-red-700 disabled:opacity-50"
                    >
                      {isDeleting ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                      Yes, delete
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(false)}
                      disabled={isDeleting}
                      className="text-xs font-medium text-slate-500 hover:text-slate-700 transition"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Timeline({
  entityType,
  entityId,
  notes: initialNotes = [],
  hasMore: initialHasMore = false,
  currentUserId,
  currentUserRole,
  showComposer = true,
  emptyState = "No activity recorded yet.",
}) {
  const [items, setItems] = useState(initialNotes || []);
  const [hasMore, setHasMore] = useState(Boolean(initialHasMore));
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState("all");
  const [text, setText] = useState("");

  const addFetcher = useFetcher();
  const loadMoreFetcher = useFetcher();

  const isAdding = addFetcher.state !== "idle";
  const isLoadingMore = loadMoreFetcher.state !== "idle";

  useEffect(() => {
    setItems(initialNotes || []);
    setHasMore(Boolean(initialHasMore));
    setPage(1);
    setFilter("all");
    setText("");
  }, [entityId, initialHasMore, initialNotes]);

  useEffect(() => {
    if (addFetcher.state === "idle" && addFetcher.data?.success && addFetcher.data?.note) {
      setItems((prev) => {
        if (prev.some((note) => note._id === addFetcher.data.note._id)) return prev;
        return [addFetcher.data.note, ...prev];
      });
      setText("");
    }
  }, [addFetcher.state, addFetcher.data]);

  useEffect(() => {
    if (loadMoreFetcher.state === "idle" && loadMoreFetcher.data?.notes) {
      setItems((prev) => {
        const existingIds = new Set(prev.map((note) => note._id));
        return [...prev, ...loadMoreFetcher.data.notes.filter((note) => !existingIds.has(note._id))];
      });
      setHasMore(Boolean(loadMoreFetcher.data.hasMore));
      setPage((currentPage) => loadMoreFetcher.data.page || currentPage + 1);
    }
  }, [loadMoreFetcher.state, loadMoreFetcher.data]);

  const filteredItems = useMemo(() => {
    return items.filter((note) => {
      if (filter === "events") return Boolean(note.isSystem);
      if (filter === "notes") return !note.isSystem;
      if (filter === "rent") return String(note.eventType || "").startsWith("rent_payment_");
      if (filter === "maintenance") return String(note.eventType || "").startsWith("maintenance_");
      return true;
    });
  }, [items, filter]);

  const groupedItems = useMemo(() => {
    const groups = [];
    const byKey = new Map();

    filteredItems.forEach((note) => {
      const key = getGroupKey(note.createdAt);
      const label = getGroupLabel(note.createdAt);
      if (!byKey.has(key)) {
        const group = { key, label, items: [] };
        byKey.set(key, group);
        groups.push(group);
      }
      byKey.get(key).items.push(note);
    });

    return groups;
  }, [filteredItems]);

  const handleAddNote = () => {
    if (!text.trim() || text.length > 2000) return;
    addFetcher.submit(
      { entityType, entityId, text: text.trim() },
      { method: "post", action: "/notes/add" }
    );
  };

  const handleLoadMore = () => {
    loadMoreFetcher.load(
      `/notes/add?entityType=${encodeURIComponent(entityType)}&entityId=${encodeURIComponent(entityId)}&page=${page + 1}`
    );
  };

  const handleDelete = (noteId) => {
    setItems((prev) => prev.filter((note) => note._id !== noteId));
  };

  const placeholder = {
    property: "Add a note about this property...",
    landlord: "Add a note about this landlord...",
    tenant: "Add a note about this tenant...",
    tenancy: "Add a note about this tenancy...",
    maintenance_job: "Add a note about this job...",
    contractor: "Add a note about this contractor...",
  }[entityType] || "Add a note...";

  return (
    <section className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Timeline</h2>
            <p className="mt-1 text-xs text-slate-500">
              System events and manual notes in one place.
            </p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600">
            <Filter className="h-3.5 w-3.5" />
            {filteredItems.length} items
          </div>
        </div>

        {showComposer && (
          <div className="border-b border-slate-200 bg-slate-50/70 px-5 py-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm focus-within:border-[#2657F7]/30 focus-within:ring-2 focus-within:ring-[#2657F7]/10 transition">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                disabled={isAdding}
                placeholder={placeholder}
                rows={3}
                maxLength={2000}
                className="w-full resize-none border-0 bg-transparent p-0 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:ring-0"
              />
              <div className="mt-3 flex items-center justify-between gap-3 border-t border-dashed border-slate-200 pt-3">
                <span className={`text-xs ${text.length >= 2000 ? "font-bold text-red-500" : text.length >= 1800 ? "font-medium text-amber-500" : "text-slate-400"}`}>
                  {text.length} / 2000
                </span>
                <button
                  type="button"
                  onClick={handleAddNote}
                  disabled={isAdding || !text.trim() || text.length >= 2000}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#2657F7] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#1f49d1] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isAdding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Add Note
                </button>
              </div>
            </div>
            {addFetcher.data?.error && (
              <p className="mt-2 text-sm font-medium text-red-600">{addFetcher.data.error}</p>
            )}
          </div>
        )}

        <div className="border-b border-slate-200 px-5 py-3">
          <div className="flex flex-wrap gap-2">
            {FILTERS.map((item) => {
              const active = filter === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setFilter(item.key)}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                    active
                      ? "bg-slate-900 text-white shadow-sm"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="px-5 py-5">
          {groupedItems.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-10 text-center">
              <p className="text-sm font-medium text-slate-500">{emptyState}</p>
            </div>
          ) : (
            <div className="space-y-6">
              {groupedItems.map((group) => (
                <div key={group.key} className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="h-px flex-1 bg-slate-200" />
                    <span className="inline-flex items-center rounded-full bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                      {group.label}
                    </span>
                    <div className="h-px flex-1 bg-slate-200" />
                  </div>

                  <div className="space-y-4">
                    {group.items.map((note, index) => (
                      <TimelineEntry
                        key={note._id}
                        note={note}
                        currentUserId={currentUserId}
                        currentUserRole={currentUserRole}
                        onDelete={handleDelete}
                        showConnector={index !== group.items.length - 1}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {hasMore && (
            <div className="mt-6 flex justify-center">
              <button
                type="button"
                onClick={handleLoadMore}
                disabled={isLoadingMore}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
              >
                {isLoadingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronDown className="h-4 w-4" />}
                Load more
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

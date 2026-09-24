/**
 * EventDetailModal — shows details of a clicked rota event.
 * Allows deletion of the event.
 */

function formatUKDate(isoString) {
  if (!isoString) return "—";
  try {
    const d = new Date(isoString);
    return d.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  } catch {
    return isoString;
  }
}

function formatTime12(time24) {
  if (!time24) return "—";
  const [hStr, mStr] = time24.split(":");
  const h = parseInt(hStr, 10);
  const m = mStr || "00";
  const period = h >= 12 ? "pm" : "am";
  const h12 = h % 12 || 12;
  return `${h12}:${m}${period}`;
}

const Row = ({ label, value }) => (
  <div className="flex items-start gap-3 py-2 border-b border-gray-50 last:border-0">
    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide w-32 flex-shrink-0 pt-0.5">{label}</span>
    <span className="text-sm text-gray-900">{value || "—"}</span>
  </div>
);

export default function EventDetailModal({ event, onClose, onDelete, canDelete = false }) {
  const confirmDelete = () => {
    if (window.confirm("Are you sure you want to delete this rota entry?")) {
      onDelete?.(event.id);
    }
  };

  const dateDisplay = formatUKDate(event.date || event.start);
  const startDisplay = formatTime12(event.startTime);
  const endDisplay = formatTime12(event.endTime);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div
              className="w-3 h-3 rounded-full flex-shrink-0"
              style={{ backgroundColor: "#1e3a5f" }}
            />
            <h2 className="text-base font-bold text-gray-900">Shift Details</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-gray-100 transition text-gray-500 cursor-pointer text-xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-4">
          <Row label="Date" value={dateDisplay} />
          <Row label="Start Time" value={startDisplay} />
          <Row label="End Time" value={endDisplay} />
          <Row label="Employee" value={event.employeeName} />
          {event.assignedToName && <Row label="Assigned To" value={event.assignedToName} />}
          {event.description && <Row label="Description" value={event.description} />}
          {event.repeat && event.repeat !== "none" && (
            <>
              <Row label="Repeat" value={event.repeat?.charAt(0).toUpperCase() + event.repeat?.slice(1)} />
              {event.repeatCount > 0 && <Row label="Times" value={event.repeatCount} />}
            </>
          )}
          <Row
            label="Task Status"
            value={
              event.taskStatus === "completed"
                ? "Completed"
                : event.taskStatus === "not_completed"
                ? "Not Completed"
                : "Pending Report"
            }
          />
          {event.taskStatus === "not_completed" && event.taskReasonIfNotDone && (
            <Row label="Reason Not Done" value={event.taskReasonIfNotDone} />
          )}
          {event.taskNotes && <Row label="Task Notes" value={event.taskNotes} />}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 pb-6">
          {canDelete && onDelete && (
            <button
              onClick={confirmDelete}
              className="px-5 py-2 rounded-lg bg-red-50 text-red-700 border border-red-200 text-sm font-semibold hover:bg-red-100 transition cursor-pointer"
            >
              Delete
            </button>
          )}
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 text-sm font-semibold hover:bg-gray-50 transition cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

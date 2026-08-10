import { useState, useEffect } from "react";
import { useFetcher } from "react-router";
import UKDateInput from "../ui/UKDateInput.jsx";

const inputClass =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 bg-white text-gray-900 transition";
const labelClass = "block text-sm font-semibold text-gray-700 mb-1";

export default function EditRotaModal({ event, employeeList = [], assignedToList = [], onClose, onSuccess }) {
  const fetcher = useFetcher();
  const isSubmitting = fetcher.state !== "idle";

  const [date, setDate] = useState(
    event.date ? event.date.split("T")[0] : (event.start ? event.start.split("T")[0] : "")
  );
  const [startTime, setStartTime] = useState(event.startTime || "");
  const [endTime, setEndTime]     = useState(event.endTime || "");
  const [repeat, setRepeat]       = useState(event.repeat || "none");
  const [repeatCount, setRepeatCount] = useState(event.repeatCount || "");
  const [description, setDescription] = useState(event.description || "");
  const [employeeId, setEmployeeId]   = useState(event.employeeId || "");
  const [assignedToId, setAssignedToId] = useState(event.assignedToId || "");
  const [formError, setFormError]     = useState("");

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.success) {
      onSuccess?.();
    }
    if (fetcher.data?.errors?.submit) {
      setFormError(fetcher.data.errors.submit);
    }
  }, [fetcher.state, fetcher.data]);

  const handleSubmit = (e) => {
    e.preventDefault();
    setFormError("");

    if (!date)        return setFormError("Please select a date.");
    if (!startTime)   return setFormError("Please enter a start time.");
    if (!endTime)     return setFormError("Please enter an end time.");
    if (!employeeId)  return setFormError("Please select an employee.");

    fetcher.submit(
      {
        _intent: "update",
        id: event.id,
        date,
        startTime,
        endTime,
        repeat,
        repeatCount: repeat !== "none" ? (repeatCount || "1") : "1",
        description,
        employeeId,
        assignedToId,
      },
      { method: "post", action: "/rota" }
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">Edit Rota</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 transition text-gray-500 cursor-pointer text-xl leading-none">×</button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          {formError && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{formError}</div>
          )}

          {/* Date */}
          <div>
            <label className={labelClass}>Date</label>
            <UKDateInput name="date" value={date} onChange={(e) => setDate(e.target.value)} placeholder="DD/MM/YYYY" required />
          </div>

          {/* Start / End Time */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Start Time</label>
              <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className={inputClass} required />
            </div>
            <div>
              <label className={labelClass}>End Time</label>
              <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className={inputClass} required />
            </div>
          </div>

          {/* Repeat */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Repeat</label>
              <select value={repeat} onChange={(e) => setRepeat(e.target.value)} className={inputClass}>
                <option value="none">No Repeat</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="fortnightly">Fortnightly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>How many times</label>
              <input
                type="number" min="1" max="365"
                value={repeatCount}
                onChange={(e) => setRepeatCount(e.target.value)}
                placeholder="e.g. 4"
                disabled={repeat === "none"}
                className={`${inputClass} ${repeat === "none" ? "opacity-50 cursor-not-allowed" : ""}`}
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className={labelClass}>Rota Description</label>
            <textarea
              value={description} onChange={(e) => setDescription(e.target.value)}
              rows={3} placeholder="Enter description..."
              className={`${inputClass} resize-none`}
            />
          </div>

          {/* Employee / Assigned To */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Select Employee</label>
              <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className={inputClass} required>
                <option value="">Select</option>
                {employeeList.map((s) => (
                  <option key={s._id} value={s._id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Assigned To</label>
              <select value={assignedToId} onChange={(e) => setAssignedToId(e.target.value)} className={inputClass}>
                <option value="">Select</option>
                {assignedToList.map((c) => (
                  <option key={c._id} value={c._id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 px-6 pb-6">
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="px-6 py-2 rounded-lg bg-[#1e3a5f] text-white text-sm font-semibold hover:bg-[#162d4a] disabled:opacity-60 transition cursor-pointer"
          >
            {isSubmitting ? "Updating..." : "Update"}
          </button>
          <button
            type="button" onClick={onClose}
            className="px-6 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 text-sm font-semibold hover:bg-gray-50 transition cursor-pointer"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

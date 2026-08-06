import { useState } from "react";

function formatUKDate(isoStr) {
  if (!isoStr) return "—";
  try {
    return new Date(isoStr).toLocaleDateString("en-GB", {
      day: "2-digit", month: "short", year: "numeric",
    });
  } catch { return isoStr; }
}

function fmt12(t) {
  if (!t) return "—";
  const [hStr, mStr] = t.split(":");
  const h = parseInt(hStr, 10);
  const m = mStr || "00";
  return `${String(h % 12 || 12).padStart(2, "0")}:${m}${h >= 12 ? "pm" : "am"}`;
}

const thClass = "px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap";
const tdClass = "px-4 py-3 text-sm text-gray-800 whitespace-nowrap";

export default function RotaListView({ rotaEvents, onEdit }) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState("start");
  const [sortDir, setSortDir] = useState("asc");

  const handleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };

  const filtered = rotaEvents
    .filter((e) => {
      const q = search.toLowerCase();
      const props = e.extendedProps || {};
      return (
        !q ||
        props.employeeName?.toLowerCase().includes(q) ||
        props.assignedToName?.toLowerCase().includes(q) ||
        props.description?.toLowerCase().includes(q) ||
        formatUKDate(e.start).toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      const pa = a.extendedProps || {};
      const pb = b.extendedProps || {};
      let va, vb;
      if (sortKey === "start")        { va = a.start; vb = b.start; }
      else if (sortKey === "employee") { va = pa.employeeName || ""; vb = pb.employeeName || ""; }
      else if (sortKey === "assigned") { va = pa.assignedToName || ""; vb = pb.assignedToName || ""; }
      else                            { va = pa.startTime || ""; vb = pb.startTime || ""; }
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });

  const SortIcon = ({ k }) => (
    <span className="ml-1 text-gray-400">
      {sortKey === k ? (sortDir === "asc" ? "↑" : "↓") : "↕"}
    </span>
  );

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Search bar */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-100 bg-gray-50">
        <input
          type="text"
          placeholder="Search by name, date or description…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full max-w-xs rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 bg-white"
        />
        <span className="text-xs text-gray-500 ml-auto">{filtered.length} record{filtered.length !== 1 ? "s" : ""}</span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className={thClass + " cursor-pointer"} onClick={() => handleSort("start")}>
                Date <SortIcon k="start" />
              </th>
              <th className={thClass + " cursor-pointer"} onClick={() => handleSort("time")}>
                Start <SortIcon k="time" />
              </th>
              <th className={thClass}>End</th>
              <th className={thClass + " cursor-pointer"} onClick={() => handleSort("employee")}>
                Employee <SortIcon k="employee" />
              </th>
              <th className={thClass + " cursor-pointer"} onClick={() => handleSort("assigned")}>
                Assigned To <SortIcon k="assigned" />
              </th>
              <th className={thClass}>Repeat</th>
              <th className={thClass}>Description</th>
              <th className={thClass}>Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-sm text-gray-400">
                  No rota entries found.
                </td>
              </tr>
            ) : (
              filtered.map((e) => {
                const p = e.extendedProps || {};
                return (
                  <tr key={e.id} className="hover:bg-gray-50 transition">
                    <td className={tdClass}>
                      <span className="font-medium">{formatUKDate(p.date || e.start)}</span>
                    </td>
                    <td className={tdClass}>{fmt12(p.startTime)}</td>
                    <td className={tdClass}>{fmt12(p.endTime)}</td>
                    <td className={tdClass}>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-[#1e3a5f] flex-shrink-0" />
                        {p.employeeName || "—"}
                      </span>
                    </td>
                    <td className={tdClass}>{p.assignedToName || "—"}</td>
                    <td className={tdClass}>
                      {p.repeat && p.repeat !== "none" ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700">
                          {p.repeat.charAt(0).toUpperCase() + p.repeat.slice(1)}
                          {p.repeatCount > 0 ? ` ×${p.repeatCount}` : ""}
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className={tdClass + " max-w-[180px] truncate"} title={p.description}>
                      {p.description || <span className="text-gray-400">—</span>}
                    </td>
                    <td className={tdClass}>
                      <button
                        onClick={() => onEdit(e)}
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold bg-[#1e3a5f] text-white hover:bg-[#162d4a] transition cursor-pointer"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

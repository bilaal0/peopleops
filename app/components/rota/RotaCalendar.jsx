import { useEffect, useRef, useState } from "react";
import AddRotaModal from "./AddRotaModal.jsx";
import EditRotaModal from "./EditRotaModal.jsx";

export default function RotaCalendar({ employeeList, staffList, clientList, rotaEvents, serverError }) {
  const calendarElRef = useRef(null);
  const calendarRef   = useRef(null);

  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);
  const [editingEvent, setEditingEvent] = useState(null);
  const [currentView, setCurrentView]   = useState("dayGridMonth");
  const [title, setTitle]               = useState("");

  // 12-hour formatter
  const fmt12 = (t) => {
    if (!t) return "";
    const [hStr, mStr] = t.split(":");
    const h   = parseInt(hStr, 10);
    const m   = mStr || "00";
    return `${String(h % 12 || 12).padStart(2, "0")}:${m}${h >= 12 ? "pm" : "am"}`;
  };

  // ── Init FullCalendar once on mount ────────────────────────────────────────
  useEffect(() => {
    if (!calendarElRef.current) return;
    let cal;

    Promise.all([
      import("@fullcalendar/core"),
      import("@fullcalendar/daygrid"),
      import("@fullcalendar/timegrid"),
      import("@fullcalendar/list"),
      import("@fullcalendar/interaction"),
    ]).then(([
      { Calendar },
      { default: dayGrid },
      { default: timeGrid },
      { default: listPlugin },
      { default: interaction },
    ]) => {
      if (!calendarElRef.current) return;

      cal = new Calendar(calendarElRef.current, {
        plugins: [dayGrid, timeGrid, listPlugin, interaction],
        initialView: "dayGridMonth",
        headerToolbar: false,
        events: rotaEvents,
        height: "auto",
        dayMaxEvents: 3,

        // List-view specific options
        listDaySideFormat: { weekday: "long" },
        listDayFormat: { day: "numeric", month: "short", year: "numeric" },
        noEventsContent: "No rota entries for this period.",

        dateClick: (info) => {
          setSelectedDate(info.dateStr);
          setShowAddModal(true);
        },
        eventClick: (info) => {
          setEditingEvent({
            id: info.event.id,
            title: info.event.title,
            start: info.event.startStr,
            end: info.event.endStr,
            ...info.event.extendedProps,
          });
        },
        datesSet: (info) => {
          setCurrentView(info.view.type);
          setTitle(info.view.title);
        },

        // Custom event rendering for calendar views only
        eventContent: (arg) => {
          // List views render their own rows — skip custom content
          if (arg.view.type.startsWith("list")) return true;

          const props = arg.event.extendedProps || {};
          const time  = fmt12(props.startTime || "");
          const name  = props.employeeName || props.assignedToName || arg.event.title || "";
          const bg    = arg.event.backgroundColor || arg.event.color || "#1e3a5f";

          const wrapper = document.createElement("div");
          wrapper.style.cssText = [
            "display:flex",
            "align-items:center",
            "gap:5px",
            `background:${bg}`,
            "border-radius:4px",
            "padding:2px 6px",
            "cursor:pointer",
            "overflow:hidden",
            "white-space:nowrap",
            "width:100%",
            "box-sizing:border-box",
          ].join(";");

          const dot = document.createElement("span");
          dot.style.cssText =
            "width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.65);flex-shrink:0;";

          const text = document.createElement("span");
          text.style.cssText =
            "font-size:11.5px;font-weight:500;color:#fff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
          text.textContent = time ? `${time} ${name}` : name;

          wrapper.appendChild(dot);
          wrapper.appendChild(text);

          return { domNodes: [wrapper] };
        },
      });

      cal.render();
      calendarRef.current = cal;
      setTitle(cal.view.title);
    });

    return () => {
      cal?.destroy();
      calendarRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Sync events whenever rotaEvents changes ────────────────────────────────
  useEffect(() => {
    const cal = calendarRef.current;
    if (!cal) return;
    cal.removeAllEvents();
    cal.addEventSource(rotaEvents);
  }, [rotaEvents]);

  const changeCalView = (view) => {
    calendarRef.current?.changeView(view);
    setCurrentView(view);
    setTitle(calendarRef.current?.view.title || "");
  };

  const navCalendar = (dir) => {
    if (dir === "prev")      calendarRef.current?.prev();
    else if (dir === "next") calendarRef.current?.next();
    else                     calendarRef.current?.today();
    setTitle(calendarRef.current?.view.title || "");
  };

  const isListView = currentView.startsWith("list");

  // View button groups
  const calendarViews = [
    { key: "dayGridMonth", label: "Month" },
    { key: "timeGridWeek", label: "Week" },
    { key: "timeGridDay",  label: "Day"  },
  ];
  const listViews = [
    { key: "listWeek",  label: "Week"  },
    { key: "listMonth", label: "Month" },
    { key: "listDay",   label: "Day"   },
  ];

  return (
    <div className="space-y-4">
      {/* ── Top bar: Calendar / List tabs + Add button ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
          {[
            { key: "calendar", label: "Calendar" },
            { key: "list",     label: "List"     },
          ].map(({ key, label }) => {
            const active = key === "list" ? isListView : !isListView;
            return (
              <button
                key={key}
                onClick={() => changeCalView(key === "list" ? "listWeek" : "dayGridMonth")}
                className={`px-4 py-1.5 rounded-md text-xs font-semibold transition cursor-pointer ${
                  active
                    ? "bg-white text-[#1e3a5f] shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        <button
          onClick={() => { setSelectedDate(null); setShowAddModal(true); }}
          className="px-4 py-2 rounded-lg bg-[#1e3a5f] text-white text-xs font-semibold hover:bg-[#162d4a] transition cursor-pointer"
        >
          + Add Rota
        </button>
      </div>

      {/* ── Calendar wrapper — ALWAYS in DOM ── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-b border-gray-100 bg-gray-50">
          <div className="flex items-center gap-2">
            <button onClick={() => navCalendar("prev")}  className="px-3 py-1.5 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 transition text-gray-600 text-sm font-bold cursor-pointer">‹</button>
            <button onClick={() => navCalendar("today")} className="px-3 py-1.5 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 transition text-gray-600 text-xs font-semibold cursor-pointer">Today</button>
            <button onClick={() => navCalendar("next")}  className="px-3 py-1.5 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 transition text-gray-600 text-sm font-bold cursor-pointer">›</button>
            {title && <span className="ml-2 text-sm font-bold text-gray-800">{title}</span>}
          </div>

          <div className="flex items-center gap-2">
            {(isListView ? listViews : calendarViews).map(({ key, label }) => (
              <button
                key={key}
                onClick={() => changeCalView(key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  currentView === key
                    ? "bg-[#1e3a5f] text-white"
                    : "border border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* ← FullCalendar mounts here (handles both calendar + list views) */}
        <div className="p-4">
          <div ref={calendarElRef} />
        </div>
      </div>

      {/* ── Add Rota Modal ── */}
      {showAddModal && (
        <AddRotaModal
          employeeList={clientList}
          assignedToList={staffList}
          defaultDate={selectedDate}
          serverError={serverError}
          onClose={() => setShowAddModal(false)}
          onSuccess={() => setShowAddModal(false)}
        />
      )}

      {/* ── Edit Rota Modal ── */}
      {editingEvent && (
        <EditRotaModal
          event={editingEvent}
          employeeList={clientList}
          assignedToList={staffList}
          onClose={() => setEditingEvent(null)}
          onSuccess={() => setEditingEvent(null)}
        />
      )}
    </div>
  );
}

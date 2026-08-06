import { redirect, data, useLoaderData, useActionData } from "react-router";
import { getUserFromRequest } from "../../utils/auth.server.js";
import { connect } from "../../config/db.server.js";
import { User } from "../../models/user.server.js";
import { Rota } from "../../models/rota.server.js";
import RotaCalendar from "../../components/rota/RotaCalendar.jsx";

// ─── Loader ──────────────────────────────────────────────────────────────────
export async function loader({ request }) {
  const currentUser = await getUserFromRequest(request);
  if (!currentUser) return redirect("/login");

  await connect();

  const isSuperAdmin = currentUser.roles?.includes("SUPER_ADMIN");

  // Staff users — same query as user-accounts/staff/index
  const staffQuery = {
    roles: { $in: ["EMPLOYEE", "REGISTERED_MANAGER", "ADMIN", "SUPER_ADMIN"] },
    deleted: false,
  };
  if (!isSuperAdmin && currentUser.agencyId) {
    staffQuery.agencyId = currentUser.agencyId;
  }

  // Client users — same query as user-accounts/client/index
  const clientQuery = {
    roles: "CLIENT",
    deleted: false,
  };
  if (!isSuperAdmin && currentUser.agencyId) {
    clientQuery.agencyId = currentUser.agencyId;
  }

  // Rota events scoped to agency
  const rotaFilter = { deleted: false };
  if (!isSuperAdmin && currentUser.agencyId) {
    rotaFilter.agencyId = currentUser.agencyId;
  }

  const [staffList, clientList, rotaEvents] = await Promise.all([
    User.find(staffQuery).select("firstName lastName jobTitle").sort({ firstName: 1 }).lean(),
    User.find(clientQuery).select("firstName lastName positionInCompany").sort({ firstName: 1 }).lean(),
    Rota.find(rotaFilter)
      .populate("employee", "firstName lastName")
      .populate("assignedTo", "firstName lastName")
      .sort({ start: 1 })
      .lean(),
  ]);

  const mappedStaff = staffList.map((u) => ({
    _id: u._id.toString(),
    name: `${u.firstName || ""} ${u.lastName || ""}`.trim(),
    label: u.jobTitle || "Staff",
  }));

  const mappedClients = clientList.map((u) => ({
    _id: u._id.toString(),
    name: `${u.firstName || ""} ${u.lastName || ""}`.trim(),
    label: u.positionInCompany || "Client",
  }));

  // Combined list for the Employee dropdown — staff first, then clients
  const employeeList = [...mappedStaff, ...mappedClients].sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  return {
    employeeList,
    staffList: mappedStaff,
    clientList: mappedClients,
    rotaEvents: rotaEvents.map((e) => ({
      id: e._id.toString(),
      title: `${e.startTime} – ${e.endTime}: ${e.employeeName || ""}`,
      start: e.start ? e.start.toISOString() : e.date?.toISOString(),
      end: e.end ? e.end.toISOString() : e.date?.toISOString(),
      color: e.color || "#1e3a5f",
      extendedProps: {
        description: e.description || "",
        employeeId: e.employee?._id?.toString() || "",
        employeeName: e.employeeName || "",
        assignedToId: e.assignedTo?._id?.toString() || "",
        assignedToName: e.assignedToName || "",
        startTime: e.startTime,
        endTime: e.endTime,
        repeat: e.repeat,
        repeatCount: e.repeatCount,
        date: e.date?.toISOString(),
      },
    })),
  };
}

// ─── Action ──────────────────────────────────────────────────────────────────
export async function action({ request }) {
  const currentUser = await getUserFromRequest(request);
  if (!currentUser) return redirect("/login");

  await connect();

  const formData = await request.formData();
  const intent = formData.get("_intent");

  // ── DELETE ──────────────────────────────────────────────────────────────────
  if (intent === "delete") {
    const id = formData.get("id");
    await Rota.findByIdAndUpdate(id, { deleted: true });
    return { success: true };
  }

  // Shared field extraction (used by both create & update)
  const dateRaw     = formData.get("date");
  const startTime   = formData.get("startTime");
  const endTime     = formData.get("endTime");
  const repeat      = formData.get("repeat") || "none";
  const repeatCount = parseInt(formData.get("repeatCount") || "1", 10);
  const description = formData.get("description") || "";
  const employeeId  = formData.get("employeeId");
  const assignedToId = formData.get("assignedToId");

  if (!dateRaw || !startTime || !endTime || !employeeId) {
    return data(
      { errors: { submit: "Date, start time, end time and employee are required." } },
      { status: 400 }
    );
  }

  // Resolve user names
  const [employee, client] = await Promise.all([
    User.findById(employeeId).select("firstName lastName").lean(),
    assignedToId ? User.findById(assignedToId).select("firstName lastName").lean() : null,
  ]);
  const employeeName   = employee ? `${employee.firstName || ""} ${employee.lastName || ""}`.trim() : "";
  const assignedToName = client   ? `${client.firstName || ""} ${client.lastName || ""}`.trim()   : "";

  const baseDate = new Date(dateRaw);
  const buildStartEnd = (d) => ({
    start: new Date(`${d.toISOString().split("T")[0]}T${startTime}:00.000Z`),
    end:   new Date(`${d.toISOString().split("T")[0]}T${endTime}:00.000Z`),
  });

  // ── UPDATE ──────────────────────────────────────────────────────────────────
  if (intent === "update") {
    const id = formData.get("id");
    const { start, end } = buildStartEnd(baseDate);

    await Rota.findByIdAndUpdate(id, {
      date: baseDate,
      startTime,
      endTime,
      start,
      end,
      description,
      repeat,
      repeatCount,
      employee: employeeId,
      employeeName,
      assignedTo: assignedToId || undefined,
      assignedToName,
    });

    return { success: true };
  }

  // ── CREATE (with repeat expansion) ──────────────────────────────────────────
  const iterations = repeat === "none" ? 1 : Math.max(1, Math.min(repeatCount || 1, 365));
  const events = [];

  for (let i = 0; i < iterations; i++) {
    const d = new Date(baseDate);
    if (repeat === "daily")       d.setDate(d.getDate() + i);
    else if (repeat === "weekly") d.setDate(d.getDate() + i * 7);
    else if (repeat === "fortnightly") d.setDate(d.getDate() + i * 14);
    else if (repeat === "monthly") d.setMonth(d.getMonth() + i);

    const { start, end } = buildStartEnd(d);

    events.push({
      date: d, startTime, endTime, start, end, description,
      repeat: i === 0 ? repeat : "none",
      repeatCount: i === 0 ? repeatCount : 0,
      employee: employeeId, employeeName,
      assignedTo: assignedToId || undefined, assignedToName,
      agencyId: currentUser.agencyId || null,
      addedBy: currentUser.userId,
      color: "#1e3a5f",
    });
  }

  await Rota.insertMany(events);
  return { success: true };
}

// ─── Page Component ───────────────────────────────────────────────────────────
export default function RotaIndexPage() {
  const { employeeList, staffList, clientList, rotaEvents } = useLoaderData();
  const actionData = useActionData();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Page Header */}
      <div className="bg-white border-b border-gray-200 mb-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Rota System</h1>
              <p className="mt-1 text-sm text-gray-600">
                Manage staff schedules and client assignments
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
        <RotaCalendar
          employeeList={employeeList}
          staffList={staffList}
          clientList={clientList}
          rotaEvents={rotaEvents}
          serverError={actionData?.errors?.submit}
        />
      </div>
    </div>
  );
}


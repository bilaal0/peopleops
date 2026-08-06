import { getUserFromRequest } from "../../utils/auth.server.js";
import { getAgencyDashboardData } from "../../utils/dashboard.server.js";
import { Note } from "../../models/note.server.js";

export async function loader({ request }) {
  const user = await getUserFromRequest(request);
  if (!user || !user.agencyId) return { urgent: [], recent: [] };

  // Fetch urgent alerts from dashboard utility
  const dashboardData = await getAgencyDashboardData(user.agencyId);
  
  // Fetch all recent notes (both system events and manual notes by staff)
  const recentNotes = await Note.find({ agencyId: user.agencyId, deleted: false })
    .populate("addedBy", "title firstName lastName")
    .sort({ createdAt: -1 })
    .limit(10)
    .lean();

  const activityFeed = recentNotes.map((item) => ({
    id: String(item._id),
    title: item.text || "System event",
    subtitle: item.isSystem ? (item.entityType ? item.entityType.replace(/_/g, " ") : "system") : `Note by ${item.addedBy?.firstName || "Staff"}`,
    createdAt: item.createdAt,
    isSystem: item.isSystem,
  }));

  return {
    urgent: dashboardData?.urgentAlerts || [],
    recent: activityFeed,
  };
}

// routes/notes/delete.jsx
import { getUserFromRequest } from "../../utils/auth.server.js";
import { connect } from "../../config/db.server.js";
import { Note } from "../../models/note.server.js";

const jsonResponse = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export async function action({ request }) {
  const user = await getUserFromRequest(request);
  if (!user) return jsonResponse({ error: "Unauthorized" }, 401);

  const formData = await request.formData();
  const noteId = formData.get("noteId")?.toString();

  if (!noteId) return jsonResponse({ error: "Missing noteId" }, 400);

  try {
    await connect();

    // Fetch note — agency scoped
    const note = await Note.findOne({ _id: noteId, agencyId: user.agencyId });
    if (!note) {
      return jsonResponse({ error: "Note not found" }, 404);
    }

    if (note.isSystem) {
      return jsonResponse({ error: "System events cannot be deleted" }, 403);
    }

    // Permission check: own note or agency admin
    const isOwn = note.addedBy.toString() === user.userId;
    const isAdmin = user.roles?.includes("AGENCY_ADMIN") || user.roles?.includes("SUPER_ADMIN");

    if (!isOwn && !isAdmin) {
      return jsonResponse({ error: "Forbidden" }, 403);
    }

    // Hard delete — spec requires this
    await Note.deleteOne({ _id: noteId, agencyId: user.agencyId });
    return jsonResponse({ success: true });
  } catch (err) {
    console.error("Error deleting note:", err);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
}

export default function DeleteNoteRoute() {
  return null;
}

import { getUserFromRequest } from "../../utils/auth.server.js";
import { connect } from "../../config/db.server.js";
import { Note, NOTE_ENTITY_TYPES } from "../../models/note.server.js";
import { verifyEntityOrganization, getNotesForEntity } from "../../utils/notes.server.js";

const jsonResponse = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });

// Load More Notes (Pagination)
export async function loader({ request }) {
  const user = await getUserFromRequest(request);
  if (!user) return jsonResponse({ error: "Unauthorized" }, 401);

  const url = new URL(request.url);
  const entityType = url.searchParams.get("entityType");
  const entityId = url.searchParams.get("entityId");
  const page = parseInt(url.searchParams.get("page") || "1", 10);

  if (!entityType || !entityId) {
    return jsonResponse({ error: "Missing entityType or entityId" }, 400);
  }

  try {
    await connect();
    const result = await getNotesForEntity(entityType, entityId, user.organizationId, page);
    return jsonResponse(result);
  } catch (err) {
    console.error("Error loading notes:", err);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
}

// Add Note
export async function action({ request }) {
  const user = await getUserFromRequest(request);
  if (!user) return jsonResponse({ error: "Unauthorized" }, 401);

  const formData = await request.formData();
  const text = formData.get("text")?.toString().trim();
  const entityType = formData.get("entityType")?.toString();
  const entityId = formData.get("entityId")?.toString().trim();

  if (!text || text.length > 2000) {
    return jsonResponse({ error: "Text is required and must be under 2000 characters" }, 400);
  }

  if (!NOTE_ENTITY_TYPES.includes(entityType)) {
    return jsonResponse({ error: "Invalid entity type" }, 400);
  }

  if (!entityId || entityId.length !== 24) {
    return jsonResponse({ error: "Invalid entity ID format" }, 400);
  }

  try {
    await connect();
    const isAuthorized = await verifyEntityOrganization(entityType, entityId, user.organizationId);
    if (!isAuthorized) {
      return jsonResponse({ error: "Entity not found or access denied" }, 404);
    }

    let note = await Note.create({
      organizationId: user.organizationId,
      entityType,
      entityId,
      text,
      addedBy: user.userId,
      eventType: null,
      isSystem: false,
      metadata: null,
      isInternal: false,
    });

    note = await note.populate("addedBy", "title firstName lastName email");

    const populatedNote = {
      ...note.toObject(),
      _id: note._id.toString(),
      addedBy: note.addedBy ? {
        firstName: note.addedBy.firstName,
        lastName: note.addedBy.lastName,
        email: note.addedBy.email,
        _id: note.addedBy._id.toString()
      } : null,
      organizationId: note.organizationId.toString(),
      entityId: note.entityId.toString(),
      eventType: note.eventType || null,
      isSystem: Boolean(note.isSystem),
      metadata: note.metadata || null,
      isInternal: Boolean(note.isInternal),
    };

    return jsonResponse({ success: true, note: populatedNote });
  } catch (err) {
    console.error("Error creating note:", err);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
}

export default function AddNoteRoute() {
  return null;
}

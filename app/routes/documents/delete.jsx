// routes/documents/delete.jsx
// POST /documents/delete — soft-deletes a document (sets deleted: true)
import { getUserFromRequest } from "../../utils/auth.server.js";
import { data } from "react-router";
import { connect } from "../../config/db.server.js";
import { Document } from "../../models/document.server.js";

export async function action({ request }) {
  const user = await getUserFromRequest(request);
  if (!user) return data({ error: "Unauthorised" }, { status: 401 });

  const formData   = await request.formData();
  const documentId = formData.get("documentId");

  if (!documentId) {
    return data({ error: "documentId is required." }, { status: 400 });
  }

  await connect();

  const doc = await Document.findOne({ _id: documentId, deleted: false });
  if (!doc) {
    return data({ error: "Document not found." }, { status: 404 });
  }

  doc.deleted = true;
  await doc.save();

  return data({ success: true });
}

export default function DocumentDelete() {
  return null;
}

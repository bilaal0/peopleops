// routes/documents/verify.jsx
// Action route to Verify or Reject a document
import { getUserFromRequest } from "../../utils/auth.server.js";
import { data } from "react-router";
import { connect } from "../../config/db.server.js";
import { Document } from "../../models/document.server.js";
import { logDocumentVerified } from "../../utils/activityLog.server.js";

export async function action({ request }) {
  const user = await getUserFromRequest(request);
  if (!user) return data({ error: "Unauthorised" }, { status: 401 });
  
  // NOTE: Temporarily allowing any agency user to verify documents as requested

  const formData   = await request.formData();
  const documentId = formData.get("documentId");
  const status     = formData.get("status"); // "verified" | "rejected" | "pending"
  const notes      = formData.get("notes") || null;

  if (!documentId || !["verified", "rejected", "pending"].includes(status)) {
    return data({ error: "Invalid verification parameters" }, { status: 400 });
  }

  await connect();
  
  // Verify document exists and belongs to this agency
  const doc = await Document.findOne({ 
    _id: documentId, 
    agencyId: user.agencyId 
  });
  
  if (!doc) {
    return data({ error: "Document not found" }, { status: 404 });
  }

  // Update verification status
  doc.status = status;
  doc.verifiedBy = user.userId;
  doc.verifiedAt = new Date();
  doc.verificationNotes = notes;
  
  await doc.save();

  if (status === "verified") {
    await logDocumentVerified(doc, user);
  }

  return data({
    success: true,
    message: `Document marked as ${status}`,
    document: {
      id: doc._id,
      status: doc.status,
    }
  });
}

// Action-only route
export default function DocumentVerify() {
  return null;
}

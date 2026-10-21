import { data } from "react-router";
import { getUserFromRequest } from "../../utils/auth.server.js";
import { connect } from "../../config/db.server.js";
import { User } from "../../models/user.server.js";
import { Message } from "../../models/message.server.js";

export async function loader({ request }) {
  const currentUser = await getUserFromRequest(request);
  if (!currentUser) {
    return data({ error: "Unauthorized" }, { status: 401 });
  }

  await connect();

  const url = new URL(request.url);
  const staffId = url.searchParams.get("staffId");

  const query = {};
  if (currentUser.organizationId) {
    query.organizationId = currentUser.organizationId;
  }

  if (staffId) {
    // Thread between management and this staff member
    query.$or = [
      { sender: staffId },
      { recipient: staffId },
    ];
  } else {
    // Messages involving currentUser
    query.$or = [
      { sender: currentUser.userId },
      { recipient: currentUser.userId },
    ];
  }

  const messages = await Message.find(query).sort({ createdAt: 1 }).lean();

  return data({
    messages: messages.map((m) => ({
      _id: m._id.toString(),
      sender: m.sender.toString(),
      recipient: m.recipient.toString(),
      senderName: m.senderName || "Unknown",
      senderRole: m.senderRole || "",
      recipientName: m.recipientName || "",
      message: m.message,
      read: m.read,
      readAt: m.readAt ? m.readAt.toISOString() : null,
      status: m.status || "sent",
      createdAt: m.createdAt.toISOString(),
    })),
  });
}

export async function action({ request }) {
  const currentUser = await getUserFromRequest(request);
  if (!currentUser) {
    return data({ error: "Unauthorized" }, { status: 401 });
  }

  await connect();

  const formData = await request.formData();
  const intent = formData.get("_intent");

  if (intent === "send_message") {
    const recipientId = formData.get("recipientId");
    const text = (formData.get("message") || "").toString().trim();

    if (!recipientId || !text) {
      return data({ error: "Recipient and message text are required." }, { status: 400 });
    }

    // Resolve sender and recipient names in parallel
    const [senderUser, recipientUser] = await Promise.all([
      User.findById(currentUser.userId).select("firstName lastName title roles").lean(),
      User.findById(recipientId).select("firstName lastName title roles").lean(),
    ]);

    const senderName = senderUser
      ? `${senderUser.title ? senderUser.title + " " : ""}${senderUser.firstName || ""} ${senderUser.lastName || ""}`.trim()
      : "Management";
    const recipientName = recipientUser
      ? `${recipientUser.title ? recipientUser.title + " " : ""}${recipientUser.firstName || ""} ${recipientUser.lastName || ""}`.trim()
      : "Staff";

    const senderRole = currentUser.roles?.includes("SUPER_ADMIN")
      ? "Super Admin"
      : currentUser.roles?.includes("ADMIN") || currentUser.roles?.includes("REGISTERED_MANAGER")
      ? "Management"
      : "Staff";

    const newMessage = await Message.create({
      sender: currentUser.userId,
      recipient: recipientId,
      organizationId: currentUser.organizationId || null,
      message: text,
      senderName,
      senderRole,
      recipientName,
      read: false,
      status: "sent",
    });

    return data({
      success: true,
      message: {
        _id: newMessage._id.toString(),
        sender: newMessage.sender.toString(),
        recipient: newMessage.recipient.toString(),
        senderName: newMessage.senderName,
        senderRole: newMessage.senderRole,
        recipientName: newMessage.recipientName,
        message: newMessage.message,
        read: newMessage.read,
        status: newMessage.status,
        createdAt: newMessage.createdAt.toISOString(),
      },
    });
  }

  if (intent === "mark_read") {
    const senderId = formData.get("senderId");
    if (senderId) {
      await Message.updateMany(
        { sender: senderId, recipient: currentUser.userId, read: false },
        { $set: { read: true, readAt: new Date(), status: "read" } }
      );
    }
    return data({ success: true });
  }

  return data({ error: "Invalid action intent" }, { status: 400 });
}

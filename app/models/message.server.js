// models/message.server.js
import { mongoose } from "../config/db.server.js";

const { Schema } = mongoose;

const messageSchema = new Schema(
  {
    sender: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    recipient: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      default: null,
      index: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    senderName: {
      type: String,
      default: "",
    },
    senderRole: {
      type: String,
      default: "",
    },
    recipientName: {
      type: String,
      default: "",
    },
    read: {
      type: Boolean,
      default: false,
    },
    readAt: {
      type: Date,
      default: null,
    },
    status: {
      type: String,
      enum: ["sent", "delivered", "read"],
      default: "sent",
    },
    replyTo: {
      type: Schema.Types.ObjectId,
      ref: "Message",
      default: null,
    },
  },
  { timestamps: true }
);

// High-speed compound indexes for chat threads & inbox counts
messageSchema.index({ recipient: 1, read: 1 });
messageSchema.index({ sender: 1, recipient: 1, createdAt: 1 });
messageSchema.index({ recipient: 1, sender: 1, createdAt: 1 });
messageSchema.index({ organizationId: 1, createdAt: -1 });

export const Message = mongoose.models.Message || mongoose.model("Message", messageSchema);

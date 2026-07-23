/**
 * Socket.IO helper
 * Initializes WebSocket event handling for conversations
 */

import { verifyAccessToken } from "../utils/jwt.js";
import { createMessage } from "../../modules/messages/service.js";
import { Conversation } from "../../models/Conversation.js";
import { Message } from "../../models/Message.js";
import { notifications } from "./notifications.js";
import { ApiError } from "../middleware/errorHandler.js";
import { HTTP_STATUS } from "../config/constants.js";

let ioInstance;

export function getSocketServer() {
  return ioInstance;
}

export function initializeSocketServer(io) {
  ioInstance = io;

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) {
      return next(new Error("Authentication token is required"));
    }

    try {
      const payload = verifyAccessToken(token);
      socket.data.user = payload;
      return next();
    } catch (error) {
      return next(new Error("Invalid authentication token"));
    }
  });

  io.on("connection", (socket) => {
    // join a personal room for direct notifications
    const userId = socket.data.user?.userId;
    if (userId) {
      socket.join(`user:${userId}`);
    }

    socket.on("join_conversation", async ({ conversationId }) => {
      try {
        if (!conversationId) {
          socket.emit("receive_error", "conversationId is required to join");
          return;
        }

        const conversation = await Conversation.findById(conversationId).lean();
        if (!conversation) {
          socket.emit("receive_error", "Conversation not found");
          return;
        }

        const userId = socket.data.user?.userId;
        const isParticipant = conversation.participants.some((participant) => participant.toString() === userId);
        if (!isParticipant) {
          socket.emit("receive_error", "You are not a participant in this conversation");
          return;
        }

        socket.join(conversationId);
        socket.emit("joined_conversation", { conversationId });
      } catch (error) {
        socket.emit("receive_error", error.message || "Failed to join conversation");
      }
    });

    socket.on("send_message", async ({ conversationId, text, attachments }) => {
      try {
        const userId = socket.data.user?.userId;
        const message = await createMessage({ conversationId, text, attachments }, userId);

        // populate sender info for socket clients and notifications
        const populated = await Message.findById(message._id)
          .populate("senderId", "firstName lastName email role")
          .lean();

        // emit message to conversation room
        io.to(conversationId).emit("receive_message", populated);

        // emit socket notification to each recipient (exclude sender)
        try {
          const conv = await Conversation.findById(conversationId).lean();
          if (conv && Array.isArray(conv.participants)) {
            const senderObj = populated?.senderId || {};
            const senderIdStr = senderObj?._id ? String(senderObj._id) : String(senderObj);
            const senderName = senderObj?.firstName ? `${senderObj.firstName}${senderObj.lastName ? ' ' + senderObj.lastName : ''}` : senderObj?.email || senderIdStr || "Unknown";

            for (const p of conv.participants) {
              const pid = String(p);
              if (pid === senderIdStr) continue;
              const payload = {
                type: "message",
                conversationId: String(conv._id),
                messageId: String(populated._id || populated.id),
                senderId: senderIdStr,
                senderName,
                title: `New message from ${senderName}`,
                body: (populated?.text || (populated?.attachments?.length ? "Sent an attachment" : "")).slice(0, 200),
                read: false,
              };
              io.to(`user:${pid}`).emit("notification", payload);
            }
          }
        } catch (err) {
          console.error("Failed to emit socket notifications for message", err?.message || err);
        }

        // persist notifications via existing notifications util
        try {
          notifications.emit("message.received", { message: populated });
        } catch (e) {
          console.error("Failed to emit message.received notification", e?.message || e);
        }
      } catch (error) {
        socket.emit("receive_error", error.message || "Failed to send message");
      }
    });
  });
}

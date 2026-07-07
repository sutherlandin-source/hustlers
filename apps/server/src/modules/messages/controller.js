/**
 * Message controller
 * Handles HTTP requests for message operations
 */

import { listMessagesForConversation, createMessage } from "./service.js";
import { Message } from "../../models/Message.js";
import { getSocketServer } from "../../shared/utils/socket.js";
import { notifications } from "../../shared/utils/notifications.js";
import { HTTP_STATUS, SUCCESS_MESSAGES } from "../../shared/config/constants.js";

function buildResponse(res, status, message, data = {}) {
  return res.status(status).json({ success: status >= 200 && status < 300, message, data, timestamp: new Date().toISOString() });
}

function getUserId(req) {
  return req.user?.userId || req.user?._id || req.user?.id;
}

export async function getMessages(req, res, next) {
  try {
    const conversationId = req.params.conversationId;
    const messages = await listMessagesForConversation(conversationId, getUserId(req));
    return buildResponse(res, HTTP_STATUS.OK, "Messages retrieved", { messages });
  } catch (err) {
    next(err);
  }
}

export async function postMessage(req, res, next) {
  try {
    const message = await createMessage(req.body, getUserId(req));
    const io = getSocketServer();
    // Populate sender details before emitting/returning
    const populated = await Message.findById(message._id)
      .populate("senderId", "firstName lastName email role")
      .lean();
    if (io && populated?.conversationId) {
      io.to(String(populated.conversationId)).emit("receive_message", populated);
    }

    // Emit notification event for recipients (handled by notifications util)
    try {
      notifications.emit("message.received", { message: populated });
    } catch (e) {
      console.error("Failed to emit message.received notification", e?.message || e);
    }
    return buildResponse(res, HTTP_STATUS.CREATED, SUCCESS_MESSAGES.CREATED, { message });
  } catch (err) {
    next(err);
  }
}

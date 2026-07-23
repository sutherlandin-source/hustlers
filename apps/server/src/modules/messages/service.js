/**
 * Message service
 * Business logic for message operations
 */

import { Message } from "../../models/Message.js";
import { Conversation } from "../../models/Conversation.js";
import { ApiError } from "../../shared/middleware/errorHandler.js";
import { HTTP_STATUS } from "../../shared/config/constants.js";

const MAX_ATTACHMENTS = 3;
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

export async function listMessagesForConversation(conversationId, userId) {
  const conversation = await Conversation.findById(conversationId).lean();

  if (!conversation) {
    throw new ApiError(HTTP_STATUS.NOT_FOUND, "Conversation not found");
  }

  const isParticipant = conversation.participants.some((participant) =>
    participant.toString() === userId
  );

  if (!isParticipant) {
    throw new ApiError(HTTP_STATUS.FORBIDDEN, "You are not a participant in this conversation");
  }

  return Message.find({ conversationId })
    .sort({ createdAt: 1 })
    .populate("senderId", "firstName lastName email role")
    .lean();
}

export async function createMessage(data, userId) {
  const { conversationId, text } = data;
  const attachments = normalizeAttachments(data.attachments);

  const conversation = await Conversation.findById(conversationId).lean();
  if (!conversation) {
    throw new ApiError(HTTP_STATUS.NOT_FOUND, "Conversation not found");
  }

  const isParticipant = conversation.participants.some((participant) =>
    participant.toString() === userId
  );

  if (!isParticipant) {
    throw new ApiError(HTTP_STATUS.FORBIDDEN, "You are not a participant in this conversation");
  }

  if ((!text || typeof text !== "string" || !text.trim()) && !attachments.length) {
    throw new ApiError(HTTP_STATUS.UNPROCESSABLE_ENTITY, "Message text or attachment is required");
  }

  const message = await Message.create({
    conversationId,
    senderId: userId,
    text: typeof text === "string" ? text.trim() : "",
    attachments,
  });

  return message.toObject();
}

function normalizeAttachments(attachments = []) {
  if (!Array.isArray(attachments)) return [];
  if (attachments.length > MAX_ATTACHMENTS) {
    throw new ApiError(HTTP_STATUS.UNPROCESSABLE_ENTITY, `You can attach up to ${MAX_ATTACHMENTS} files`);
  }

  return attachments.map((attachment) => {
    const name = String(attachment?.name || "").trim();
    const type = String(attachment?.type || "application/octet-stream").trim();
    const size = Number(attachment?.size || 0);
    const dataUrl = String(attachment?.dataUrl || "");

    if (!name || !dataUrl) {
      throw new ApiError(HTTP_STATUS.UNPROCESSABLE_ENTITY, "Attachment name and data are required");
    }
    if (size > MAX_ATTACHMENT_BYTES) {
      throw new ApiError(HTTP_STATUS.UNPROCESSABLE_ENTITY, "Attachment must be 5MB or smaller");
    }
    if (!dataUrl.startsWith("data:")) {
      throw new ApiError(HTTP_STATUS.UNPROCESSABLE_ENTITY, "Attachment data must be a data URL");
    }

    return { name, type, size, dataUrl };
  });
}

export async function markMessagesRead(conversationId, userId) {
  const conversation = await Conversation.findById(conversationId).lean();
  if (!conversation) {
    throw new ApiError(HTTP_STATUS.NOT_FOUND, "Conversation not found");
  }

  const isParticipant = conversation.participants.some((participant) => participant.toString() === userId);
  if (!isParticipant) {
    throw new ApiError(HTTP_STATUS.FORBIDDEN, "You are not a participant in this conversation");
  }

  await Message.updateMany(
    { conversationId, senderId: { $ne: userId }, read: false },
    { $set: { read: true } }
  );

  return true;
}

export async function getUnreadCountForConversation(conversationId, userId) {
  const conversation = await Conversation.findById(conversationId).lean();
  if (!conversation) return 0;

  const isParticipant = conversation.participants.some((participant) => participant.toString() === userId);
  if (!isParticipant) {
    return 0;
  }

  const count = await Message.countDocuments({ conversationId, senderId: { $ne: userId }, read: false });
  return count || 0;
}

/**
 * Message service
 * Business logic for message operations
 */

import { Message } from "../../models/Message.js";
import { Conversation } from "../../models/Conversation.js";
import { ApiError } from "../../shared/middleware/errorHandler.js";
import { HTTP_STATUS } from "../../shared/config/constants.js";

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

  if (!text || typeof text !== "string" || !text.trim()) {
    throw new ApiError(HTTP_STATUS.UNPROCESSABLE_ENTITY, "Message text is required");
  }

  const message = await Message.create({
    conversationId,
    senderId: userId,
    text: text.trim(),
  });

  return message.toObject();
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

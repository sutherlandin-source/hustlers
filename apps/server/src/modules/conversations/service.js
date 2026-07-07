/**
 * Conversation service
 * Business logic for conversations
 */

import { Conversation } from "../../models/Conversation.js";
import { ApiError } from "../../shared/middleware/errorHandler.js";
import { HTTP_STATUS } from "../../shared/config/constants.js";

export async function listConversationsForUser(userId) {
  return Conversation.find({ participants: userId })
    .sort({ updatedAt: -1 })
    .populate("participants", "firstName lastName email role")
    .lean();
}

export async function getConversationById(conversationId, userId) {
  const conversation = await Conversation.findById(conversationId)
    .populate("participants", "firstName lastName email role")
    .lean();

  if (!conversation) {
    throw new ApiError(HTTP_STATUS.NOT_FOUND, "Conversation not found");
  }

  const isParticipant = conversation.participants.some((participant) => {
    if (typeof participant === "string") return participant === userId;
    return participant._id?.toString() === userId;
  });

  if (!isParticipant) {
    throw new ApiError(HTTP_STATUS.FORBIDDEN, "You are not a participant in this conversation");
  }

  return conversation;
}

export async function createConversation(data, userId) {
  const participants = Array.isArray(data.participants)
    ? [...new Set(data.participants.map(String).filter(Boolean))]
    : [];

  if (!participants.length) {
    throw new ApiError(HTTP_STATUS.UNPROCESSABLE_ENTITY, "Participants are required");
  }

  if (!participants.includes(userId)) {
    participants.push(userId);
  }

  if (participants.length < 2) {
    throw new ApiError(HTTP_STATUS.UNPROCESSABLE_ENTITY, "At least two participants are required");
  }

  const conversation = await Conversation.create({
    contractId: data.contractId,
    participants,
  });

  return conversation.toObject();
}

export async function openConversationForContract(contractId, user) {
  // user may be an id string or the full user object
  const userId = typeof user === "string" ? user : user?.userId || user?._id || user?.id;
  const userRole = typeof user === "string" ? null : user?.role || null;

  const ContractModel = await import("../../models/Contract.js").then((m) => m.Contract);
  const contract = await ContractModel.findById(contractId).lean();

  if (!contract) {
    throw new ApiError(HTTP_STATUS.NOT_FOUND, "Contract not found");
  }

  const buyerId = contract.buyer?.toString();
  const sellerId = contract.seller?.toString();

  if (!sellerId) {
    throw new ApiError(HTTP_STATUS.CONFLICT, "Contract must have an assigned hustler to open chat");
  }

  // Managers may open a conversation with the assigned hustler.
  if (userRole === "manager") {
    let conversation = await Conversation.findOne({
      contractId,
      participants: { $all: [sellerId, userId] },
    })
      .populate("participants", "firstName lastName email role")
      .lean();

    if (!conversation) {
      conversation = await Conversation.create({
        contractId,
        participants: [sellerId, userId],
      });
      conversation = await Conversation.findById(conversation._id)
        .populate("participants", "firstName lastName email role")
        .lean();
    }

    return conversation;
  }

  // Default: require buyer and seller participation
  if (!buyerId) {
    throw new ApiError(HTTP_STATUS.CONFLICT, "Contract must have buyer and seller to open chat");
  }

  if (userId !== buyerId && userId !== sellerId) {
    throw new ApiError(HTTP_STATUS.FORBIDDEN, "You are not a participant in this contract conversation");
  }

  let conversation = await Conversation.findOne({
    contractId,
    participants: { $all: [buyerId, sellerId] },
  })
    .populate("participants", "firstName lastName email role")
    .lean();

  if (!conversation) {
    conversation = await Conversation.create({
      contractId,
      participants: [buyerId, sellerId],
    });
    conversation = await Conversation.findById(conversation._id)
      .populate("participants", "firstName lastName email role")
      .lean();
  }

  return conversation;
}

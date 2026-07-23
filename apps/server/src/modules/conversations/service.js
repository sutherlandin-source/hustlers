/**
 * Conversation service
 * Business logic for conversations
 */

import { Conversation } from "../../models/Conversation.js";
import { User } from "../../shared/models/User.js";
import { Contract } from "../../models/Contract.js";
import ContractApplication from "../applications/model.js";
import { Message } from "../../models/Message.js";
import { ApiError } from "../../shared/middleware/errorHandler.js";
import { HTTP_STATUS, USER_ROLES } from "../../shared/config/constants.js";
import { isManagerRole } from "../../shared/utils/roles.js";

function normalizeParticipantIds(participants) {
  return [...new Set(participants.map(String).filter(Boolean))].sort();
}

async function getActiveAdminIds() {
  const admins = await User.find({ role: USER_ROLES.ADMIN, isActive: true }).select("_id").lean();
  return admins.map((admin) => String(admin._id)).filter(Boolean);
}

async function getAssignedHustlerIds(contractId, contract = null) {
  const ids = new Set();
  const contractDoc = contract || (await Contract.findById(contractId).lean());
  if (!contractDoc) return [];

  const sellerId = contractDoc.seller?.toString();
  if (sellerId) ids.add(sellerId);

  const acceptedApplications = await ContractApplication.find({
    contractId,
    status: "accepted",
  })
    .select("hustlerId")
    .lean();

  for (const application of acceptedApplications) {
    const hustlerId = application.hustlerId?.toString();
    if (hustlerId) ids.add(hustlerId);
  }

  return [...ids];
}

async function findExistingConversation({ participants, contractId = null }) {
  const query = {
    participants: { $all: participants },
    $expr: { $eq: [{ $size: "$participants" }, participants.length] },
  };

  if (contractId) {
    query.contractId = contractId;
  }

  return Conversation.findOne(query)
    .populate("participants", "firstName lastName email role avatar")
    .populate("contractId", "title contractNumber status")
    .lean();
}

export async function listConversationsForUser(userId) {
  const conversations = await Conversation.find({ participants: userId })
    .sort({ updatedAt: -1 })
    .populate("participants", "firstName lastName email role avatar")
    .populate("contractId", "title contractNumber status")
    .lean();

  if (!conversations.length) {
    return [];
  }

  const uniqueConversations = [];
  const seenKeys = new Set();
  for (const conversation of conversations) {
    const participantIds = (Array.isArray(conversation.participants) ? conversation.participants : [])
      .map((participant) => String(participant?._id || participant?.id || participant))
      .filter(Boolean)
      .sort();
    const contractKey = String(conversation.contractId?._id || conversation.contractId?.id || conversation.contractId || "");
    const conversationKey = `${contractKey}:${participantIds.join(",")}`;
    if (seenKeys.has(conversationKey)) {
      continue;
    }
    seenKeys.add(conversationKey);
    uniqueConversations.push(conversation);
  }

  const conversationIds = uniqueConversations.map((conversation) => conversation._id);
  const [messages, unreadCounts] = await Promise.all([
    Message.find({ conversationId: { $in: conversationIds } })
      .sort({ createdAt: -1 })
      .populate("senderId", "firstName lastName email role avatar")
      .lean(),
    Promise.all(
      conversationIds.map(async (conversationId) => {
        const unreadCount = await Message.countDocuments({
          conversationId,
          senderId: { $ne: userId },
          read: false,
        });
        return [String(conversationId), unreadCount || 0];
      })
    ),
  ]);

  const unreadMap = Object.fromEntries(unreadCounts);
  const lastMessageMap = {};
  for (const message of messages) {
    const key = String(message.conversationId);
    if (!lastMessageMap[key]) {
      lastMessageMap[key] = message;
    }
  }

  return uniqueConversations.map((conversation) => {
    const conversationId = String(conversation._id);
    return {
      ...conversation,
      lastMessage: lastMessageMap[conversationId] || null,
      unreadCount: unreadMap[conversationId] || 0,
    };
  });
  // Note: conversations with no messages are intentionally included so newly
  // opened chats appear in the list immediately.
}

export async function getConversationById(conversationId, userId) {
  const conversation = await Conversation.findById(conversationId)
    .populate("participants", "firstName lastName email role avatar")
    .populate("contractId", "title contractNumber status")
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
  const participants = Array.isArray(data.participants) ? normalizeParticipantIds(data.participants) : [];
  const contractId = data.contractId ? String(data.contractId) : null;

  if (!participants.length) {
    throw new ApiError(HTTP_STATUS.UNPROCESSABLE_ENTITY, "Participants are required");
  }

  if (!participants.includes(userId)) {
    participants.push(userId);
  }

  if (participants.length < 2) {
    throw new ApiError(HTTP_STATUS.UNPROCESSABLE_ENTITY, "At least two participants are required");
  }

  if (contractId) {
    const existingConversation = await findExistingConversation({ participants, contractId });
    if (existingConversation) {
      return existingConversation;
    }

    const contract = await Contract.findById(contractId).lean();
    if (!contract) {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, "Contract not found");
    }
  } else {
    const existingConversation = await findExistingConversation({ participants });
    if (existingConversation) {
      return existingConversation;
    }
  }

  const conversation = await Conversation.create({
    contractId: contractId || data.contractId,
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
  const assignedHustlerIds = await getAssignedHustlerIds(contractId, contract);

  if (!assignedHustlerIds.length) {
    throw new ApiError(HTTP_STATUS.CONFLICT, "Contract must have an assigned hustler to open chat");
  }

  // Managers may open a conversation with the assigned hustler.
  if (isManagerRole(userRole)) {
    let conversation = await findExistingConversation({
      contractId,
      participants: normalizeParticipantIds([buyerId, userId, ...assignedHustlerIds]),
    });

    if (!conversation) {
      conversation = await Conversation.create({
        contractId,
        participants: normalizeParticipantIds([buyerId, userId, ...assignedHustlerIds]),
      });
      conversation = await Conversation.findById(conversation._id)
        .populate("participants", "firstName lastName email role avatar")
        .populate("contractId", "title contractNumber status")
        .lean();
    }

    return conversation;
  }

  // Default: require buyer and seller participation
  if (!buyerId) {
    throw new ApiError(HTTP_STATUS.CONFLICT, "Contract must have buyer and seller to open chat");
  }

  if (userId !== buyerId && !assignedHustlerIds.includes(String(userId))) {
    throw new ApiError(HTTP_STATUS.FORBIDDEN, "You are not a participant in this contract conversation");
  }

  let conversation = await findExistingConversation({
    contractId,
    participants: normalizeParticipantIds([buyerId, ...assignedHustlerIds]),
  });

  if (!conversation) {
    conversation = await Conversation.create({
      contractId,
      participants: normalizeParticipantIds([buyerId, ...assignedHustlerIds]),
    });
    conversation = await Conversation.findById(conversation._id)
      .populate("participants", "firstName lastName email role avatar")
      .populate("contractId", "title contractNumber status")
      .lean();
  }

  return conversation;
}

export async function openSupportConversation(user) {
  const userId = typeof user === "string" ? user : user?.userId || user?._id || user?.id;
  if (!userId) {
    throw new ApiError(HTTP_STATUS.UNAUTHORIZED, "Authentication required");
  }

  const adminIds = await getActiveAdminIds();
  if (!adminIds.length) {
    throw new ApiError(HTTP_STATUS.CONFLICT, "No support admins are available");
  }

  const participants = normalizeParticipantIds([userId, ...adminIds]);
  const existingConversation = await findExistingConversation({ participants });
  if (existingConversation) {
    return existingConversation;
  }

  const conversation = await Conversation.create({
    participants,
    metadata: { ...(typeof user === "object" && user ? { supportTicket: true } : {}), supportTicket: true },
  });

  return Conversation.findById(conversation._id)
    .populate("participants", "firstName lastName email role avatar")
    .populate("contractId", "title contractNumber status")
    .lean();
}

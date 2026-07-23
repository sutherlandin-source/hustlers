/**
 * Conversation controller
 * Handles HTTP requests for conversations
 */

import {
  listConversationsForUser,
  getConversationById,
  createConversation,
  openConversationForContract,
  openSupportConversation,
} from "./service.js";
import { markMessagesRead, getUnreadCountForConversation } from "../messages/service.js";
import { HTTP_STATUS, SUCCESS_MESSAGES } from "../../shared/config/constants.js";

function buildResponse(res, status, message, data = {}) {
  return res.status(status).json({ success: status >= 200 && status < 300, message, data, timestamp: new Date().toISOString() });
}

function getUserId(req) {
  return req.user?.userId || req.user?._id || req.user?.id;
}

export async function listConversations(req, res, next) {
  try {
    const conversations = await listConversationsForUser(getUserId(req));
    return buildResponse(res, HTTP_STATUS.OK, "Conversations retrieved", { conversations });
  } catch (err) {
    next(err);
  }
}

export async function getConversation(req, res, next) {
  try {
    const conversation = await getConversationById(req.params.id, getUserId(req));
    // mark unread messages as read for this user
    try {
      await markMessagesRead(conversation._id || conversation.id, getUserId(req));
    } catch (e) {
      // ignore mark-read errors
      console.error("Failed to mark messages read:", e?.message || e);
    }
    return buildResponse(res, HTTP_STATUS.OK, "Conversation retrieved", { conversation });
  } catch (err) {
    next(err);
  }
}

export async function createNewConversation(req, res, next) {
  try {
    const conversation = await createConversation(req.body, getUserId(req));
    return buildResponse(res, HTTP_STATUS.CREATED, SUCCESS_MESSAGES.CREATED, { conversation });
  } catch (err) {
    next(err);
  }
}

export async function openContractConversation(req, res, next) {
  try {
    const { contractId } = req.params;
    const conversation = await openConversationForContract(contractId, req.user);
    // mark unread messages as read for this user
    try {
      await markMessagesRead(conversation._id || conversation.id, getUserId(req));
    } catch (e) {
      console.error("Failed to mark messages read:", e?.message || e);
    }
    return buildResponse(res, HTTP_STATUS.OK, "Conversation opened", { conversation });
  } catch (err) {
    next(err);
  }
}

export async function openSupportTicket(req, res, next) {
  try {
    const conversation = await openSupportConversation(req.user);
    return buildResponse(res, HTTP_STATUS.OK, "Support ticket opened", { conversation });
  } catch (err) {
    next(err);
  }
}

export async function unreadForContract(req, res, next) {
  try {
    const { contractId } = req.params;
    // find conversation for contract
    const ConversationModel = await import("../../models/Conversation.js").then((m) => m.Conversation);
    const conv = await ConversationModel.findOne({ contractId }).lean();
    if (!conv) {
      return buildResponse(res, HTTP_STATUS.OK, "Unread count retrieved", { unreadCount: 0 });
    }
    const count = await getUnreadCountForConversation(conv._id || conv.id, getUserId(req));
    return buildResponse(res, HTTP_STATUS.OK, "Unread count retrieved", { unreadCount: count });
  } catch (err) {
    next(err);
  }
}

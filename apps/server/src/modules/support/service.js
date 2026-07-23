import { User } from "../../shared/models/User.js";
import { Conversation } from "../../models/Conversation.js";
import { Message } from "../../models/Message.js";
import { ApiError } from "../../shared/middleware/errorHandler.js";
import { HTTP_STATUS, USER_ROLES } from "../../shared/config/constants.js";
import { notifications } from "../../shared/utils/notifications.js";

function normalizeIds(values) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

async function getSupportAdminIds() {
  const admins = await User.find({ role: USER_ROLES.ADMIN, isActive: true }).select("_id").lean();
  return admins.map((admin) => String(admin._id)).filter(Boolean);
}

export async function createSupportTicket(payload = {}) {
  const normalizedEmail = String(payload.email || "").trim().toLowerCase();
  const body = String(payload.message || "").trim();
  const subject = String(payload.subject || payload.category || "Account appeal").trim();
  const category = String(payload.category || "Account appeal").trim();
  const fullName = String(payload.fullName || payload.name || "").trim();
  const accountReference = String(payload.accountReference || payload.referenceNumber || "").trim();
  const phone = String(payload.phone || payload.phoneNumber || "").trim();
  const attachments = Array.isArray(payload.attachments)
    ? payload.attachments
        .filter((attachment) => attachment && typeof attachment === "object")
        .map((attachment) => ({
          name: String(attachment.name || "attachment").trim(),
          type: String(attachment.type || "application/octet-stream").trim(),
          size: Number(attachment.size) || 0,
          dataUrl: String(attachment.dataUrl || "").trim(),
        }))
        .filter((attachment) => attachment.name && attachment.dataUrl)
    : [];

  if (!normalizedEmail) {
    throw new ApiError(HTTP_STATUS.UNPROCESSABLE_ENTITY, "Email is required");
  }

  if (!body) {
    throw new ApiError(HTTP_STATUS.UNPROCESSABLE_ENTITY, "Message is required");
  }

  const user = await User.findOne({ email: normalizedEmail }).select("_id email firstName lastName isActive accountStatus").lean();
  if (!user) {
    throw new ApiError(HTTP_STATUS.NOT_FOUND, "No account found for that email address");
  }

  const adminIds = await getSupportAdminIds();
  if (!adminIds.length) {
    throw new ApiError(HTTP_STATUS.CONFLICT, "No support admins are available");
  }

  const participantIds = normalizeIds([user._id, ...adminIds]);
  let conversation = await Conversation.findOne({ participants: { $all: participantIds }, $expr: { $eq: [{ $size: "$participants" }, participantIds.length] } });

  if (!conversation) {
    conversation = await Conversation.create({
      participants: participantIds,
      metadata: {
        supportTicket: true,
        supportEmail: normalizedEmail,
        supportSubject: subject,
        supportCategory: category,
        supportName: fullName,
        supportReference: accountReference,
        supportPhone: phone,
      },
    });
  } else {
    conversation.metadata = {
      ...(conversation.metadata || {}),
      supportTicket: true,
      supportEmail: normalizedEmail,
      supportSubject: subject,
      supportCategory: category,
      supportName: fullName,
      supportReference: accountReference,
      supportPhone: phone,
    };
    await conversation.save();
  }

  const conversationObject = conversation.toObject();
  const existingInitialMessage = await Message.findOne({ conversationId: conversationObject._id }).sort({ createdAt: 1 }).lean();
  if (!existingInitialMessage) {
    const summaryLines = [
      `Subject: ${subject}`,
      `Category: ${category}`,
      fullName ? `Name: ${fullName}` : null,
      `Email: ${normalizedEmail}`,
      accountReference ? `Reference: ${accountReference}` : null,
      phone ? `Phone: ${phone}` : null,
      "",
      body,
    ].filter(Boolean);
    const supportMessage = await Message.create({
      conversationId: conversationObject._id,
      senderId: user._id,
      text: summaryLines.join("\n"),
      attachments,
      read: false,
    });
    notifications.emit("message.received", { message: supportMessage.toObject() });
  }

  return conversationObject;
}

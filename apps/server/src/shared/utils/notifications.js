import EventEmitter from "events";
import { logger } from "./logger.js";
import { Notification } from "../models/Notification.js";
import { User } from "../models/User.js";
import { NOTIFICATION_TYPES, USER_ROLES } from "../config/constants.js";

function idOf(value) {
  if (!value) return null;
  return value._id || value.id || value;
}

function asString(value) {
  const id = idOf(value);
  return id ? String(id) : null;
}

function uniqueIds(values) {
  const seen = new Set();
  return values
    .map(asString)
    .filter(Boolean)
    .filter((id) => {
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
}

function contractTitle(contract) {
  return contract?.title || "a contract";
}

function contractId(contract) {
  return asString(contract?._id || contract?.id || contract);
}

function managerContractLink(contract) {
  const id = contractId(contract);
  return id ? `/manager/contracts/${id}` : "/manager/contracts";
}

function hustlerContractLink(contract) {
  const id = contractId(contract);
  return id ? `/dashboard/contracts/${id}` : "/dashboard/contracts";
}

function adminContractLink(contract) {
  const id = contractId(contract);
  return id ? `/admin/contracts/${id}` : "/admin/contracts";
}

async function adminIds() {
  const admins = await User.find({ role: USER_ROLES.ADMIN, isActive: true }).select("_id");
  return admins.map((admin) => admin._id);
}

async function createNotifications(items) {
  const validItems = items.filter((item) => item?.user && item?.title);
  if (!validItems.length) return;
  try {
    await Notification.insertMany(validItems, { ordered: false });
  } catch (err) {
    logger.error("Failed to create notifications", err);
  }
}

class Notifications extends EventEmitter {
  constructor() {
    super();
    // basic listeners can be attached here or by other modules
    this.on("milestone.approved", ({ milestone }) => {
      logger.info(`Notification: milestone approved ${milestone._id}`);
      // integrate with email/SMS/push providers here
    });
    this.on("contract.created", ({ contract }) => {
      logger.info(`Notification: contract created ${contract._id}`);
    });
    this.attachPersistenceListeners();
  }

  async sendEmail(to, subject, body) {
    logger.info(`sendEmail to=${to} subject=${subject}`);
    // placeholder - wire into real email provider
    return true;
  }

  attachPersistenceListeners() {
    this.on("contract.created", async ({ contract }) => {
      const admins = await adminIds();
      const recipients = uniqueIds([contract?.buyer, ...admins]);
      await createNotifications(recipients.map((user) => ({
        user,
        type: NOTIFICATION_TYPES.CONTRACT,
        title: "Contract created",
        message: `${contractTitle(contract)} is now available for applications.`,
        link: asString(user) === asString(contract?.buyer) ? managerContractLink(contract) : adminContractLink(contract),
        payload: { contractId: contractId(contract) },
      })));
    });

    this.on("contract.updated", async ({ contract }) => {
      const admins = await adminIds();
      const recipients = uniqueIds([contract?.buyer, ...admins]);
      await createNotifications(recipients.map((user) => ({
        user,
        type: NOTIFICATION_TYPES.CONTRACT,
        title: "Contract updated",
        message: `${contractTitle(contract)} was updated.`,
        link: asString(user) === asString(contract?.buyer) ? managerContractLink(contract) : adminContractLink(contract),
        payload: { contractId: contractId(contract) },
      })));
    });

    this.on("contract.assigned", async ({ contract }) => {
      await createNotifications([
        {
          user: idOf(contract?.buyer),
          type: NOTIFICATION_TYPES.CONTRACT,
          title: "Contract assigned",
          message: `${contractTitle(contract)} has been assigned to a hustler.`,
          link: managerContractLink(contract),
          payload: { contractId: contractId(contract) },
        },
        {
          user: idOf(contract?.seller),
          type: NOTIFICATION_TYPES.CONTRACT,
          title: "You were assigned",
          message: `You have been assigned to ${contractTitle(contract)}.`,
          link: hustlerContractLink(contract),
          payload: { contractId: contractId(contract) },
        },
      ]);
    });

    this.on("contract.escrowPrepared", async ({ contract }) => {
      await createNotifications([
        {
          user: idOf(contract?.buyer),
          type: NOTIFICATION_TYPES.TRANSACTION,
          title: "Escrow funded",
          message: `Escrow is funded for ${contractTitle(contract)}.`,
          link: managerContractLink(contract),
          payload: { contractId: contractId(contract) },
        },
        {
          user: idOf(contract?.seller),
          type: NOTIFICATION_TYPES.TRANSACTION,
          title: "Escrow funded",
          message: `Escrow is funded for ${contractTitle(contract)}. You can begin work.`,
          link: hustlerContractLink(contract),
          payload: { contractId: contractId(contract) },
        },
      ]);
    });

    this.on("contract.paymentReleased", async ({ contract, amount }) => {
      await createNotifications([
        {
          user: idOf(contract?.buyer),
          type: NOTIFICATION_TYPES.TRANSACTION,
          title: "Payment released",
          message: `Payment${amount ? ` of ${amount}` : ""} was released for ${contractTitle(contract)}.`,
          link: managerContractLink(contract),
          payload: { contractId: contractId(contract), amount },
        },
        {
          user: idOf(contract?.seller),
          type: NOTIFICATION_TYPES.TRANSACTION,
          title: "Payment received",
          message: `Payment${amount ? ` of ${amount}` : ""} was released for ${contractTitle(contract)}.`,
          link: hustlerContractLink(contract),
          payload: { contractId: contractId(contract), amount },
        },
      ]);
    });

    this.on("application.created", async ({ application, contract }) => {
      await createNotifications([
        {
          user: idOf(contract?.buyer),
          type: NOTIFICATION_TYPES.CONTRACT,
          title: "New application",
          message: `A hustler applied for ${contractTitle(contract)}.`,
          link: "/manager/applications",
          payload: { contractId: contractId(contract), applicationId: asString(application?._id || application?.id) },
        },
        {
          user: idOf(application?.hustlerId),
          type: NOTIFICATION_TYPES.CONTRACT,
          title: "Application submitted",
          message: `Your application for ${contractTitle(contract)} was submitted.`,
          link: "/dashboard/applications",
          payload: { contractId: contractId(contract), applicationId: asString(application?._id || application?.id) },
        },
      ]);
    });

    this.on("application.accepted", async ({ application, contract }) => {
      await createNotifications([
        {
          user: idOf(application?.hustlerId),
          type: NOTIFICATION_TYPES.CONTRACT,
          title: "Application accepted",
          message: `Your application for ${contractTitle(contract)} was accepted.`,
          link: hustlerContractLink(contract),
          payload: { contractId: contractId(contract), applicationId: asString(application?._id || application?.id) },
        },
        {
          user: idOf(contract?.buyer),
          type: NOTIFICATION_TYPES.CONTRACT,
          title: "Application accepted",
          message: `You accepted an application for ${contractTitle(contract)}.`,
          link: managerContractLink(contract),
          payload: { contractId: contractId(contract), applicationId: asString(application?._id || application?.id) },
        },
      ]);
    });

    this.on("application.rejected", async ({ application, contract }) => {
      await createNotifications([
        {
          user: idOf(application?.hustlerId),
          type: NOTIFICATION_TYPES.CONTRACT,
          title: "Application not selected",
          message: `Your application for ${contractTitle(contract)} was not selected.`,
          link: "/dashboard/applications",
          payload: { contractId: contractId(contract), applicationId: asString(application?._id || application?.id) },
        },
      ]);
    });

    this.on("milestone.created", async ({ milestone, contract }) => {
      await createNotifications([
        {
          user: idOf(contract?.seller),
          type: NOTIFICATION_TYPES.CONTRACT,
          title: "New work stage",
          message: `${milestone?.title || "A work stage"} was added to ${contractTitle(contract)}.`,
          link: hustlerContractLink(contract),
          payload: { contractId: contractId(contract), milestoneId: asString(milestone?._id || milestone?.id) },
        },
      ]);
    });


    this.on("message.received", async ({ message }) => {
      try {
        const Conversation = (await import("../models/Conversation.js")).Conversation;
        const conv = await Conversation.findById(message.conversationId).lean();
        if (!conv) return;

        const senderId = message?.senderId?._id || message?.senderId;
        const recipientIds = (conv.participants || []).map(asString).filter(Boolean).filter((id) => id !== String(senderId));
        if (!recipientIds.length) return;

        // load recipient roles
        const users = await User.find({ _id: { $in: recipientIds } }).select("_id role").lean();
        const userRoleById = users.reduce((acc, u) => ({ ...acc, [String(u._id)]: u.role }), {});

        const senderObj = message?.senderId || {};
        const senderIdStr = asString(senderObj);
        const senderName = senderObj?.firstName ? `${senderObj.firstName}${senderObj.lastName ? ' ' + senderObj.lastName : ''}` : senderObj?.email || senderIdStr || "Unknown";

        const items = recipientIds.map((userId) => {
          const role = userRoleById[String(userId)];
          const link = role === USER_ROLES.MANAGER ? `/manager/chat/${asString(conv._id)}` : role === USER_ROLES.ADMIN ? `/admin/chat/${asString(conv._id)}` : `/dashboard/chat/${asString(conv._id)}`;
          return {
            user: userId,
            type: NOTIFICATION_TYPES.MESSAGE,
            title: `New message from ${senderName}`,
            message: (message?.text || "")?.slice(0, 200),
            link,
            payload: {
              conversationId: asString(conv._id),
              messageId: asString(message?._id || message?.id),
              senderId: senderIdStr,
              senderName,
              contractId: contractId(conv),
              read: false,
            },
          };
        });

        await createNotifications(items);
      } catch (err) {
        logger.error("Failed to persist message.received notifications", err);
      }
    });
    this.on("milestone.submitted", async ({ milestone, contract }) => {
      const resolvedContract = contract || milestone?.contract;
      await createNotifications([
        {
          user: idOf(resolvedContract?.buyer),
          type: NOTIFICATION_TYPES.CONTRACT,
          title: "Work submitted",
          message: `${milestone?.title || "A work stage"} is ready for review.`,
          link: "/manager/approvals",
          payload: { contractId: contractId(resolvedContract), milestoneId: asString(milestone?._id || milestone?.id) },
        },
      ]);
    });

    this.on("milestone.approved", async ({ milestone, contract }) => {
      await createNotifications([
        {
          user: idOf(contract?.seller),
          type: NOTIFICATION_TYPES.CONTRACT,
          title: "Work approved",
          message: `${milestone?.title || "Your work"} was approved.`,
          link: hustlerContractLink(contract),
          payload: { contractId: contractId(contract), milestoneId: asString(milestone?._id || milestone?.id) },
        },
      ]);
    });

    this.on("milestone.rejected", async ({ milestone, contract }) => {
      const resolvedContract = contract || milestone?.contract;
      await createNotifications([
        {
          user: idOf(resolvedContract?.seller),
          type: NOTIFICATION_TYPES.CONTRACT,
          title: "Revision requested",
          message: `${milestone?.title || "Your work"} needs revision.`,
          link: hustlerContractLink(resolvedContract),
          payload: { contractId: contractId(resolvedContract), milestoneId: asString(milestone?._id || milestone?.id) },
        },
      ]);
    });
  }
}

export const notifications = new Notifications();

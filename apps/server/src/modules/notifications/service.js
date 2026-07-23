import { Notification } from "../../shared/models/Notification.js";
import { ApiError } from "../../shared/middleware/errorHandler.js";
import { HTTP_STATUS, NOTIFICATION_STATUSES, NOTIFICATION_TYPES } from "../../shared/config/constants.js";

export class NotificationService {
  async create(input) {
    if (!input?.user || !input?.title) return null;
    return Notification.create({
      user: input.user,
      type: input.type || NOTIFICATION_TYPES.SYSTEM,
      title: input.title,
      message: input.message || "",
      payload: input.payload || {},
      link: input.link || "",
      channel: input.channel || "in_app",
    });
  }

  async createMany(notifications) {
    const validNotifications = (notifications || []).filter((item) => item?.user && item?.title);
    if (!validNotifications.length) return [];
    return Notification.insertMany(
      validNotifications.map((item) => ({
        user: item.user,
        type: item.type || NOTIFICATION_TYPES.SYSTEM,
        title: item.title,
        message: item.message || "",
        payload: item.payload || {},
        link: item.link || "",
        channel: item.channel || "in_app",
      })),
      { ordered: false }
    );
  }

  async createOnce(input, uniquePayload = {}) {
    if (!input?.user || !input?.title) return null;

    const filter = {
      user: input.user,
      type: input.type || NOTIFICATION_TYPES.SYSTEM,
    };
    Object.entries(uniquePayload).forEach(([key, value]) => {
      filter[`payload.${key}`] = value;
    });

    const existingNotification = await Notification.findOne(filter);
    if (existingNotification) return existingNotification;

    return this.create({
      ...input,
      payload: {
        ...(input.payload || {}),
        ...uniquePayload,
      },
    });
  }

  async sendContractReviewPrompts(contract, hustlerIds = []) {
    const contractId = contract?._id?.toString() || contract?.id?.toString();
    const managerId = contract?.buyer?._id || contract?.buyer;
    const uniqueHustlerIds = [...new Set((hustlerIds || []).map((id) => id?.toString()).filter(Boolean))];
    if (!contractId || !managerId || !uniqueHustlerIds.length) return [];

    const managerPrompt = this.createOnce(
      {
        user: managerId,
        type: NOTIFICATION_TYPES.RATING,
        title: "Please rate your hustler.",
        message: "Please rate your hustler.",
        link: `/manager/contracts/${contractId}`,
      },
      {
        contractId,
        purpose: "contract_review_prompt",
        audience: "manager",
      }
    );

    const hustlerPrompts = uniqueHustlerIds.map((hustlerId) =>
      this.createOnce(
        {
          user: hustlerId,
          type: NOTIFICATION_TYPES.RATING,
          title: "Please review your manager.",
          message: "Please review your manager.",
          link: `/dashboard/contracts/${contractId}`,
        },
        {
          contractId,
          purpose: "contract_review_prompt",
          audience: "hustler",
        }
      )
    );

    return Promise.all([managerPrompt, ...hustlerPrompts]);
  }

  async listForUser(userId, options = {}) {
    const filter = { user: userId };
    if (options.status) {
      filter.status = options.status;
    } else {
      filter.status = { $ne: NOTIFICATION_STATUSES.ARCHIVED };
    }

    const allowed = Object.values(NOTIFICATION_TYPES || {});
    const resolveType = (value) => {
      const requestedType = String(value || "").toLowerCase();
      return allowed.find((type) => String(type).toLowerCase() === requestedType);
    };

    // Support filtering by notification type (e.g. ?type=message).
    // Omit type for "all"; use excludeType=message for the Notifications tab.
    if (options.type) {
      const requestedType = String(options.type).toLowerCase();
      if (requestedType === "all") {
        // No type filter.
      } else if (["notification", "notifications", "non-message", "non_message"].includes(requestedType)) {
        filter.$or = [
          { type: { $exists: false } },
          { type: { $ne: NOTIFICATION_TYPES.MESSAGE } },
        ];
      } else {
        const canonicalType = resolveType(options.type);
        if (!canonicalType) {
          throw new ApiError(HTTP_STATUS.BAD_REQUEST, "Invalid notification type");
        }
        if (canonicalType === NOTIFICATION_TYPES.SYSTEM) {
          // Keep backward compatibility with older notifications that may not have a type field.
          filter.$or = [
            { type: canonicalType },
            { type: { $exists: false } },
          ];
        } else {
          filter.type = canonicalType;
        }
      }
    }

    if (options.excludeType) {
      const canonicalType = resolveType(options.excludeType);
      if (!canonicalType) {
        throw new ApiError(HTTP_STATUS.BAD_REQUEST, "Invalid notification type");
      }
      filter.$or = [
        { type: { $exists: false } },
        { type: { $ne: canonicalType } },
      ];
    }
    const limit = Math.min(Number(options.limit) || 20, 100);
    const skip = Number(options.skip) || 0;
    const notifications = await Notification.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
    const unreadCount = await this.unreadCount(userId);

    return { notifications, unreadCount };
  }

  async unreadCount(userId) {
    return Notification.countDocuments({ user: userId, status: NOTIFICATION_STATUSES.UNREAD });
  }

  async markRead(notificationId, userId) {
    const notification = await Notification.findOneAndUpdate(
      { _id: notificationId, user: userId },
      { status: NOTIFICATION_STATUSES.READ, readAt: new Date() },
      { new: true }
    );
    if (!notification) throw new ApiError(HTTP_STATUS.NOT_FOUND, "Notification not found");
    return notification;
  }

  async markAllRead(userId) {
    await Notification.updateMany(
      { user: userId, status: NOTIFICATION_STATUSES.UNREAD },
      { status: NOTIFICATION_STATUSES.READ, readAt: new Date() }
    );
    return this.listForUser(userId);
  }

  async archive(notificationId, userId) {
    const notification = await Notification.findOneAndUpdate(
      { _id: notificationId, user: userId },
      { status: NOTIFICATION_STATUSES.ARCHIVED },
      { new: true }
    );
    if (!notification) throw new ApiError(HTTP_STATUS.NOT_FOUND, "Notification not found");
    return notification;
  }
}

export const notificationService = new NotificationService();

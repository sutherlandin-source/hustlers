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

  async listForUser(userId, options = {}) {
    const filter = { user: userId };
    if (options.status) {
      filter.status = options.status;
    } else {
      filter.status = { $ne: NOTIFICATION_STATUSES.ARCHIVED };
    }

    // Support filtering by notification type (e.g. ?type=message)
    if (options.type) {
      const allowed = Object.values(NOTIFICATION_TYPES || {});
      if (!allowed.includes(options.type)) {
        throw new ApiError(HTTP_STATUS.BAD_REQUEST, "Invalid notification type");
      }
      filter.type = options.type;
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

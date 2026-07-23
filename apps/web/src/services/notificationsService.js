import { axiosInstance, handleApiError } from "./api.js";

export const notificationsService = {
  async list(query = {}) {
    try {
      const res = await axiosInstance.get("/notifications", { params: query });
      const payload = res.data?.data ?? res.data;
      const nested = payload?.data ?? payload;
      const notifications = Array.isArray(payload)
        ? payload
        : Array.isArray(payload.notifications)
        ? payload.notifications
        : Array.isArray(nested.notifications)
        ? nested.notifications
        : [];
      const unreadCount = Number(payload?.unreadCount ?? nested?.unreadCount ?? 0);
      return { notifications, unreadCount };
    } catch (err) {
      throw handleApiError(err);
    }
  },

  async unreadCount() {
    try {
      const res = await axiosInstance.get("/notifications/unread-count");
      return res.data.data.count || 0;
    } catch (err) {
      throw handleApiError(err);
    }
  },

  async markRead(notificationId) {
    try {
      const res = await axiosInstance.patch(`/notifications/${notificationId}/read`);
      return res.data.data.notification || res.data.data;
    } catch (err) {
      throw handleApiError(err);
    }
  },

  async markAllRead() {
    try {
      const res = await axiosInstance.patch("/notifications/read-all");
      return res.data.data;
    } catch (err) {
      throw handleApiError(err);
    }
  },

  async archive(notificationId) {
    try {
      const res = await axiosInstance.patch(`/notifications/${notificationId}/archive`);
      return res.data.data.notification || res.data.data;
    } catch (err) {
      throw handleApiError(err);
    }
  },
};

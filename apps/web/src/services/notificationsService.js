import { axiosInstance, handleApiError } from "./api.js";

export const notificationsService = {
  async list(query = {}) {
    try {
      const res = await axiosInstance.get("/notifications", { params: query });
      return res.data?.data || res.data;
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

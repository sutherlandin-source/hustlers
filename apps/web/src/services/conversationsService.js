import { axiosInstance, handleApiError } from "./api.js";

export const conversationsService = {
  async openForContract(contractId) {
    try {
      const res = await axiosInstance.post(`/conversations/contract/${contractId}`);
      return res.data.data.conversation;
    } catch (err) {
      throw handleApiError(err);
    }
  },
  async getUnreadForContract(contractId) {
    try {
      const res = await axiosInstance.get(`/conversations/contract/${contractId}/unread`);
      return res.data.data.unreadCount || 0;
    } catch (err) {
      // return 0 on error to avoid breaking UI
      return 0;
    }
  },
};

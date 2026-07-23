import { axiosInstance, handleApiError } from "./api.js";

export const conversationsService = {
  async list() {
    try {
      const res = await axiosInstance.get("/conversations");
      return res.data.data.conversations || [];
    } catch (err) {
      throw handleApiError(err);
    }
  },

  async getConversation(conversationId) {
    try {
      const res = await axiosInstance.get(`/conversations/${conversationId}`);
      return res.data.data.conversation;
    } catch (err) {
      throw handleApiError(err);
    }
  },

  async createConversation(payload) {
    try {
      const res = await axiosInstance.post("/conversations", payload);
      return res.data.data.conversation;
    } catch (err) {
      throw handleApiError(err);
    }
  },

  async openForContract(contractId) {
    try {
      const res = await axiosInstance.post(`/conversations/contract/${contractId}`);
      return res.data.data.conversation;
    } catch (err) {
      throw handleApiError(err);
    }
  },
  async openSupportTicket() {
    try {
      const res = await axiosInstance.post("/conversations/support");
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

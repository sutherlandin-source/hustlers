import { axiosInstance, handleApiError } from "./api.js";

export const messagesService = {
  async list(conversationId) {
    try {
      const res = await axiosInstance.get(`/messages/${conversationId}`);
      return res.data.data.messages || [];
    } catch (err) {
      throw handleApiError(err);
    }
  },

  async create(conversationId, text, attachments = []) {
    try {
      const res = await axiosInstance.post("/messages", { conversationId, text, attachments });
      return res.data.data.message;
    } catch (err) {
      throw handleApiError(err);
    }
  },
};

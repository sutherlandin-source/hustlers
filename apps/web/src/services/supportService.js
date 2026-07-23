import { axiosInstance, handleApiError } from "./api.js";

export const supportService = {
  async createTicket(payload) {
    try {
      const res = await axiosInstance.post("/support/ticket", payload);
      return res.data.data.conversation || res.data.data;
    } catch (err) {
      throw handleApiError(err);
    }
  },
};

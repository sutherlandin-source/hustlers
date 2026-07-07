import { axiosInstance, handleApiError } from "./api.js";

export const transactionsService = {
  async list(query = {}) {
    try {
      const res = await axiosInstance.get(`/transactions`, { params: query });
      return res.data.data.transactions || [];
    } catch (err) {
      throw handleApiError(err);
    }
  },

  async get(transactionId) {
    try {
      const res = await axiosInstance.get(`/transactions/${transactionId}`);
      return res.data.data.transaction;
    } catch (err) {
      throw handleApiError(err);
    }
  },

  async releasePayment(milestoneId) {
    try {
      const res = await axiosInstance.post(`/milestones/${milestoneId}/approve`);
      return res.data.data;
    } catch (err) {
      throw handleApiError(err);
    }
  },
};

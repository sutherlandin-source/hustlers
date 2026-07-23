import { axiosInstance, handleApiError } from "./api.js";

export const reviewsService = {
  async create(payload) {
    try {
      const res = await axiosInstance.post("/reviews", payload);
      return res.data.data.review || res.data.data;
    } catch (err) {
      throw handleApiError(err);
    }
  },

  async listByContract(contractId) {
    try {
      const res = await axiosInstance.get(`/reviews/contract/${contractId}`);
      return res.data.data.reviews || res.data.data || [];
    } catch (err) {
      throw handleApiError(err);
    }
  },

  async listByUser(userId, query = {}) {
    try {
      const res = await axiosInstance.get(`/reviews/user/${userId}`, { params: query });
      const data = res.data.data || {};
      return {
        reviews: data.reviews || [],
        total: data.total || 0,
        limit: data.limit || query.limit || 20,
        skip: data.skip || query.skip || 0,
        distribution: data.distribution || { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      };
    } catch (err) {
      throw handleApiError(err);
    }
  },
};

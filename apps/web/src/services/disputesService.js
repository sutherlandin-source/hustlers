import { axiosInstance, handleApiError } from "./api.js";

export const disputesService = {
  async list() {
    try {
      const res = await axiosInstance.get("/disputes");
      return res.data.data.disputes || [];
    } catch (err) {
      throw handleApiError(err);
    }
  },

  async get(disputeId) {
    try {
      const res = await axiosInstance.get(`/disputes/${disputeId}`);
      return res.data.data;
    } catch (err) {
      throw handleApiError(err);
    }
  },

  async getForContract(contractId) {
    try {
      const res = await axiosInstance.get(`/disputes/contract/${contractId}`);
      return res.data.data;
    } catch (err) {
      throw handleApiError(err);
    }
  },

  async create(payload = {}) {
    try {
      const res = await axiosInstance.post("/disputes", payload);
      return res.data.data.dispute;
    } catch (err) {
      throw handleApiError(err);
    }
  },

  async addEvidence(disputeId, payload = {}) {
    try {
      const res = await axiosInstance.post(`/disputes/${disputeId}/evidence`, payload);
      return res.data.data.dispute;
    } catch (err) {
      throw handleApiError(err);
    }
  },

  async performAction(disputeId, payload = {}) {
    try {
      const res = await axiosInstance.post(`/disputes/${disputeId}/actions`, payload);
      return res.data.data.dispute;
    } catch (err) {
      throw handleApiError(err);
    }
  },
};

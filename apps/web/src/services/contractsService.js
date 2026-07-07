import { axiosInstance, handleApiError } from "./api.js";

export const contractsService = {
  async list(query = {}) {
    try {
      const res = await axiosInstance.get("/contracts", { params: query });
      const payload = res.data.data;
      return Array.isArray(payload) ? payload : payload?.contracts ?? payload ?? [];
    } catch (err) {
      throw handleApiError(err);
    }
  },

  async get(contractId) {
    try {
      const res = await axiosInstance.get(`/contracts/${contractId}`);
      return res.data.data.contract || res.data.data;
    } catch (err) {
      throw handleApiError(err);
    }
  },

  async create(payload) {
    try {
      const res = await axiosInstance.post("/contracts", payload);
      return res.data.data;
    } catch (err) {
      throw handleApiError(err);
    }
  },

  async update(contractId, payload) {
    try {
      const res = await axiosInstance.put(`/contracts/${contractId}`, payload);
      return res.data.data;
    } catch (err) {
      throw handleApiError(err);
    }
  },

  async assign(contractId, freelancerId) {
    try {
      const res = await axiosInstance.post(`/contracts/${contractId}/assign`, { freelancerId });
      return res.data.data;
    } catch (err) {
      throw handleApiError(err);
    }
  },

  async close(contractId) {
    try {
      const res = await axiosInstance.post(`/contracts/${contractId}/close`);
      return res.data.data;
    } catch (err) {
      throw handleApiError(err);
    }
  },

  async delete(contractId) {
    try {
      const res = await axiosInstance.delete(`/contracts/${contractId}`);
      return res.data.data.contract || res.data.data;
    } catch (err) {
      throw handleApiError(err);
    }
  },

  async prepareEscrow(contractId, amount) {
    try {
      const res = await axiosInstance.post(`/contracts/${contractId}/escrow`, { amount });
      return res.data.data;
    } catch (err) {
      throw handleApiError(err);
    }
  },

  async finalApprove(contractId) {
    try {
      const res = await axiosInstance.post(`/contracts/${contractId}/final-approval`);
      return res.data.data.contract || res.data.data;
    } catch (err) {
      throw handleApiError(err);
    }
  },
};

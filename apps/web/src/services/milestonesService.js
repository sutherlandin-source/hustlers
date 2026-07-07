import { axiosInstance, handleApiError } from "./api.js";

export const milestonesService = {
  async list(query = {}) {
    try {
      const res = await axiosInstance.get(`/milestones`, { params: query });
      const payload = res.data.data;
      return Array.isArray(payload) ? payload : payload?.milestones ?? payload ?? [];
    } catch (err) {
      throw handleApiError(err);
    }
  },

  async get(milestoneId) {
    try {
      const res = await axiosInstance.get(`/milestones/${milestoneId}`);
      return res.data.data.milestone || res.data.data;
    } catch (err) {
      throw handleApiError(err);
    }
  },

  async create(contractId, payload) {
    try {
      const res = await axiosInstance.post(`/contracts/${contractId}/milestones`, payload);
      return res.data.data.milestone || res.data.data || res.data;
    } catch (err) {
      throw handleApiError(err);
    }
  },

  async submit(milestoneId, submissionData) {
    try {
      const res = await axiosInstance.post(`/milestones/${milestoneId}/submit`, { submissionData });
      return res.data.data;
    } catch (err) {
      throw handleApiError(err);
    }
  },

  async approve(milestoneId) {
    try {
      const res = await axiosInstance.post(`/milestones/${milestoneId}/approve`);
      return res.data.data;
    } catch (err) {
      throw handleApiError(err);
    }
  },

  async reject(milestoneId, reason) {
    try {
      const res = await axiosInstance.post(`/milestones/${milestoneId}/reject`, { reason });
      return res.data.data;
    } catch (err) {
      throw handleApiError(err);
    }
  },

  async updateWorkStatus(milestoneId, workStatus, completionNotes = "", proofFiles = []) {
    if (!milestoneId) throw { message: "Missing milestone id" };
    try {
      const res = await axiosInstance.post(`/milestones/${milestoneId}/work-status`, {
        workStatus,
        completionNotes,
        proofFiles,
      });
      return res.data.data.milestone || res.data.data || res.data;
    } catch (err) {
      throw handleApiError(err);
    }
  },

  async requestRevision(milestoneId, reason) {
    try {
      const res = await axiosInstance.post(`/milestones/${milestoneId}/request-revision`, { reason });
      return res.data.data;
    } catch (err) {
      throw handleApiError(err);
    }
  },

  async getContractProgress(contractId) {
    try {
      const res = await axiosInstance.get(`/milestones/contract/${contractId}/progress`);
      return res.data.data.progress || res.data.data;
    } catch (err) {
      throw handleApiError(err);
    }
  },
};

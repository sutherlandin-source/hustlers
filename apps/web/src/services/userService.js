import { axiosInstance, handleApiError } from "./api.js";

export const userService = {
  async listUsers(query = {}) {
    try {
      const res = await axiosInstance.get("/users", { params: query });
      return res.data.data.users || [];
    } catch (err) {
      throw handleApiError(err);
    }
  },

  async getProfile() {
    try {
      const res = await axiosInstance.get("/users/me");
      return res.data.data;
    } catch (err) {
      throw handleApiError(err);
    }
  },

  async getAdminUserProfile(userId) {
    try {
      const res = await axiosInstance.get(`/users/admin/${userId}`);
      return res.data.data;
    } catch (err) {
      throw handleApiError(err);
    }
  },

  async verifyUser(userId) {
    try {
      const res = await axiosInstance.patch(`/users/admin/${userId}/verify`);
      return res.data.data;
    } catch (err) {
      throw handleApiError(err);
    }
  },

  async rejectVerification(userId, payload = {}) {
    try {
      const res = await axiosInstance.patch(`/users/admin/${userId}/reject-verification`, payload);
      return res.data.data;
    } catch (err) {
      throw handleApiError(err);
    }
  },

  async requestMoreVerificationInfo(userId, payload = {}) {
    try {
      const res = await axiosInstance.patch(`/users/admin/${userId}/request-more-info`, payload);
      return res.data.data;
    } catch (err) {
      throw handleApiError(err);
    }
  },

  async suspendUser(userId, payload = {}) {
    try {
      const res = await axiosInstance.patch(`/users/admin/${userId}/suspend`, payload);
      return res.data.data;
    } catch (err) {
      throw handleApiError(err);
    }
  },

  async deactivateUser(userId) {
    try {
      const res = await axiosInstance.patch(`/users/admin/${userId}/deactivate`);
      return res.data.data;
    } catch (err) {
      throw handleApiError(err);
    }
  },

  async resetVerification(userId) {
    try {
      const res = await axiosInstance.patch(`/users/admin/${userId}/reset-verification`);
      return res.data.data;
    } catch (err) {
      throw handleApiError(err);
    }
  },

  async updateProfile(payload) {
    try {
      const res = await axiosInstance.put("/users/me", payload);
      return res.data.data;
    } catch (err) {
      throw handleApiError(err);
    }
  },
};

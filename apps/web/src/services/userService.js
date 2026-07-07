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

  async updateProfile(payload) {
    try {
      const res = await axiosInstance.put("/users/me", payload);
      return res.data.data;
    } catch (err) {
      throw handleApiError(err);
    }
  },
};

import { axiosInstance, handleApiError } from "./api.js";
import { registerService } from "./registerService.js";

export const authService = {
  async login(payload) {
    try {
      const response = await axiosInstance.post("/auth/login", payload);
      return response.data.data;
    } catch (error) {
      throw handleApiError(error);
    }
  },

  async register(payload) {
    try {
      return await registerService.register(payload);
    } catch (error) {
      throw handleApiError(error);
    }
  },

  async refresh(refreshToken) {
    try {
      const response = await axiosInstance.post("/auth/refresh-token", { refreshToken });
      return response.data.data;
    } catch (error) {
      throw handleApiError(error);
    }
  },

  async logout() {
    try {
      await axiosInstance.post("/auth/logout");
    } catch (error) {
      throw handleApiError(error);
    }
  },
};

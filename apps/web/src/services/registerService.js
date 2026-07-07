import { axiosInstance, handleApiError } from "./api.js";

export const registerService = {
  async register(payload) {
    try {
      const response = await axiosInstance.post("/auth/register", payload);
      return response.data.data;
    } catch (error) {
      throw handleApiError(error);
    }
  },
};

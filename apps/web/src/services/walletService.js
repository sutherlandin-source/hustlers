import { axiosInstance, handleApiError } from "./api.js";

export const walletService = {
  async list(query = {}) {
    try {
      const res = await axiosInstance.get(`/wallets`, { params: query });
      return res.data.data.wallets || [];
    } catch (err) {
      throw handleApiError(err);
    }
  },

  async get(walletId) {
    try {
      const res = await axiosInstance.get(`/wallets/${walletId}`);
      return res.data.data.wallet;
    } catch (err) {
      throw handleApiError(err);
    }
  },

  async getBalance() {
    const wallets = await this.list();
    const userWallet = wallets.find((w) => w.type?.toLowerCase() === "user") || wallets[0] || null;
    const escrowWallet = wallets.find((w) => w.type?.toLowerCase() === "escrow") || null;
    const platformWallet = wallets.find((w) => w.type?.toLowerCase() === "platform") || null;

    return {
      available: userWallet?.availableBalance ?? 0,
      pending: escrowWallet?.availableBalance ?? 0,
      escrow: escrowWallet?.availableBalance ?? 0,
      onHold: escrowWallet?.lockedBalance ?? 0,
      released: 0,
      total: userWallet?.balance ?? 0,
      platform: platformWallet?.availableBalance ?? 0,
      platformTotal: platformWallet?.balance ?? 0,
      currency: userWallet?.currency || escrowWallet?.currency || platformWallet?.currency || "KSH",
      userWallet,
      escrowWallet,
      platformWallet,
      wallets,
    };
  },

  async fund(amount, description = "Escrow funding") {
    try {
      const res = await axiosInstance.post(`/wallets/fund`, { amount, description });
      return res.data.data;
    } catch (err) {
      throw handleApiError(err);
    }
  },
};

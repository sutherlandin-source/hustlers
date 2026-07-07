import create from "zustand";
import { devtools } from "zustand/middleware";
import { walletService } from "../services/walletService.js";
import { transactionsService } from "../services/transactionsService.js";

export const useWalletStore = create(
  devtools((set, get) => ({
    wallets: [],
    userWallet: null,
    escrowWallet: null,
    platformWallet: null,
    walletsLoading: false,
    walletsError: null,
    transactions: [],
    transactionsLoading: false,
    transactionsError: null,
    releaseLoading: false,
    releaseError: null,
    releaseSuccess: null,

    fetchWallets: async (query = {}) => {
      set({ walletsLoading: true, walletsError: null, releaseSuccess: null });
      try {
        const wallets = await walletService.list(query);
        const userWallet = wallets.find((wallet) => wallet.type?.toLowerCase() === "user") || wallets[0] || null;
        const escrowWallet = wallets.find((wallet) => wallet.type?.toLowerCase() === "escrow") || null;
        const platformWallet = wallets.find((wallet) => wallet.type?.toLowerCase() === "platform") || null;
        set({ wallets, userWallet, escrowWallet, platformWallet, walletsLoading: false });
      } catch (err) {
        set({ walletsError: err, walletsLoading: false });
      }
    },

    fetchTransactions: async (query = {}) => {
      set({ transactionsLoading: true, transactionsError: null });
      try {
        const data = await transactionsService.list(query);
        set({ transactions: data || [], transactionsLoading: false });
      } catch (err) {
        set({ transactionsError: err, transactionsLoading: false });
      }
    },

    releaseMilestonePayment: async (milestoneId) => {
      set({ releaseLoading: true, releaseError: null, releaseSuccess: null });
      try {
        const data = await transactionsService.releasePayment(milestoneId);
        set({ releaseSuccess: "Payment released successfully.", releaseLoading: false });
        get().fetchWallets();
        get().fetchTransactions();
        return data;
      } catch (err) {
        set({ releaseError: err, releaseLoading: false });
        throw err;
      }
    },

    clearReleaseState: () => set({ releaseError: null, releaseSuccess: null }),
  }))
);

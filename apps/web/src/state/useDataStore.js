import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { userService } from "../services/userService.js";
import { contractsService } from "../services/contractsService.js";
import { walletService } from "../services/walletService.js";
import { milestonesService } from "../services/milestonesService.js";
import { transactionsService } from "../services/transactionsService.js";

export const useDataStore = create(
  devtools((set, get) => ({
    // user
    user: null,
    userLoading: false,
    userError: null,
    // contracts
    contracts: [],
    contractsLoading: false,
    contractsError: null,
    // wallet
    wallet: null,
    walletLoading: false,
    walletError: null,
    // milestones
    milestones: [],
    milestonesLoading: false,
    milestonesError: null,
    // transactions
    transactions: [],
    transactionsLoading: false,
    transactionsError: null,

    // actions
    fetchUser: async () => {
      set({ userLoading: true, userError: null });
      try {
        const data = await userService.getProfile();
        set({ user: data?.user || data, userLoading: false });
      } catch (err) {
        set({ userError: err, userLoading: false });
      }
    },

    fetchContracts: async (query = {}) => {
      set({ contractsLoading: true, contractsError: null });
      try {
        const data = await contractsService.list(query);
        set({ contracts: data || [], contractsLoading: false });
      } catch (err) {
        set({ contractsError: err, contractsLoading: false });
      }
    },

    fetchWallet: async () => {
      set({ walletLoading: true, walletError: null });
      try {
        const data = await walletService.getBalance();
        set({ wallet: data, walletLoading: false });
      } catch (err) {
        set({ walletError: err, walletLoading: false });
      }
    },

    fetchMilestones: async (query = {}) => {
      set({ milestonesLoading: true, milestonesError: null });
      try {
        const data = await milestonesService.list(query);
        set({ milestones: data || [], milestonesLoading: false });
      } catch (err) {
        set({ milestonesError: err, milestonesLoading: false });
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
  }))
);

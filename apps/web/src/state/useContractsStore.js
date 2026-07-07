import create from "zustand";
import { devtools } from "zustand/middleware";
import { contractsService } from "../services/contractsService.js";

export const useContractsStore = create(
  devtools((set, get) => ({
    contracts: [],
    contract: null,
    contractsLoading: false,
    contractLoading: false,
    contractsError: null,
    contractError: null,
    createLoading: false,
    createError: null,
    actionLoading: false,
    actionError: null,

    fetchContracts: async (query = {}) => {
      set({ contractsLoading: true, contractsError: null });
      try {
        const data = await contractsService.list(query);
        set({ contracts: data || [], contractsLoading: false });
      } catch (err) {
        set({ contractsError: err, contractsLoading: false });
      }
    },

    fetchContract: async (contractId) => {
      set({ contractLoading: true, contractError: null });
      try {
        const data = await contractsService.get(contractId);
        set({ contract: data, contractLoading: false });
      } catch (err) {
        set({ contractError: err, contractLoading: false });
      }
    },

    createContract: async (payload) => {
      set({ createLoading: true, createError: null });
      try {
        const data = await contractsService.create(payload);
        set((state) => ({ contracts: [data.contract, ...(state.contracts || [])], createLoading: false }));
        return data.contract;
      } catch (err) {
        set({ createError: err, createLoading: false });
        throw err;
      }
    },

    updateContract: async (contractId, payload) => {
      set({ createLoading: true, createError: null });
      try {
        const data = await contractsService.update(contractId, payload);
        const updatedContract = data.contract || data;
        set((state) => ({
          contract: updatedContract,
          contracts: (state.contracts || []).map((item) =>
            (item._id || item.id) === (updatedContract._id || updatedContract.id) ? updatedContract : item
          ),
          createLoading: false,
        }));
        return updatedContract;
      } catch (err) {
        set({ createError: err, createLoading: false });
        throw err;
      }
    },

    assignContract: async (contractId, freelancerId) => {
      set({ actionLoading: true, actionError: null });
      try {
        const data = await contractsService.assign(contractId, freelancerId);
        set({ contract: data.contract, actionLoading: false });
        return data.contract;
      } catch (err) {
        set({ actionError: err, actionLoading: false });
        throw err;
      }
    },

    closeContract: async (contractId) => {
      set({ actionLoading: true, actionError: null });
      try {
        const data = await contractsService.close(contractId);
        set({ contract: data.contract, actionLoading: false });
        return data.contract;
      } catch (err) {
        set({ actionError: err, actionLoading: false });
        throw err;
      }
    },
  }))
);

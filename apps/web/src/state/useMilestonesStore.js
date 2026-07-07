import create from "zustand";
import { devtools } from "zustand/middleware";
import { milestonesService } from "../services/milestonesService.js";

export const useMilestonesStore = create(
  devtools((set, get) => ({
    milestones: [],
    milestone: null,
    milestonesLoading: false,
    milestoneLoading: false,
    createLoading: false,
    submitLoading: false,
    actionLoading: false,
    milestonesError: null,
    milestoneError: null,
    createError: null,
    submitError: null,
    actionError: null,

    fetchMilestones: async (query = {}) => {
      set({ milestonesLoading: true, milestonesError: null });
      try {
        const data = await milestonesService.list(query);
        set({ milestones: data || [], milestonesLoading: false });
      } catch (err) {
        set({ milestonesError: err, milestonesLoading: false });
      }
    },

    fetchMilestone: async (milestoneId) => {
      set({ milestoneLoading: true, milestoneError: null });
      try {
        const data = await milestonesService.get(milestoneId);
        set({ milestone: data, milestoneLoading: false });
      } catch (err) {
        set({ milestoneError: err, milestoneLoading: false });
      }
    },

    createMilestone: async (contractId, payload) => {
      set({ createLoading: true, createError: null });
      try {
        const data = await milestonesService.create(contractId, payload);
        set(({ milestones }) => ({ milestones: [data.milestone, ...(milestones || [])], createLoading: false }));
        return data.milestone;
      } catch (err) {
        set({ createError: err, createLoading: false });
        throw err;
      }
    },

    submitMilestone: async (milestoneId, submissionData) => {
      set({ submitLoading: true, submitError: null, actionError: null });
      try {
        const data = await milestonesService.submit(milestoneId, submissionData);
        set({ milestone: data.milestone, submitLoading: false });
        return data.milestone;
      } catch (err) {
        set({ submitError: err, submitLoading: false });
        throw err;
      }
    },

    approveMilestone: async (milestoneId) => {
      set({ actionLoading: true, actionError: null });
      try {
        const data = await milestonesService.approve(milestoneId);
        set({ milestone: data.milestone, actionLoading: false });
        return data.milestone;
      } catch (err) {
        set({ actionError: err, actionLoading: false });
        throw err;
      }
    },

    rejectMilestone: async (milestoneId, reason) => {
      set({ actionLoading: true, actionError: null });
      try {
        const data = await milestonesService.reject(milestoneId, reason);
        set({ milestone: data.milestone, actionLoading: false });
        return data.milestone;
      } catch (err) {
        set({ actionError: err, actionLoading: false });
        throw err;
      }
    },
  }))
);

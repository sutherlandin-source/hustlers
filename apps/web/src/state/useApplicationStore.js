/**
 * Application Store
 * Zustand store for managing contract applications state
 */

import { create } from "zustand";
import { ContractApplicationsService } from "../services/contractApplicationsService.js";
import useNotificationStore from "./useNotificationStore.js";

const useApplicationStore = create((set, get) => ({
  // State
  applications: [],
  pendingApplications: [],
  selectedApplication: null,
  loading: false,
  error: null,
  successMessage: null,

  // Actions
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  setSuccessMessage: (message) => set({ successMessage: message }),
  clearMessages: () => set({ error: null, successMessage: null }),

  // Apply for a contract
  applyForContract: async (contractId, applicationData) => {
    set({ loading: true, error: null });
    try {
      const response = await ContractApplicationsService.applyForContract(
        contractId,
        applicationData
      );
      const msg = response.message || "Application submitted successfully";
      set({
        loading: false,
        successMessage: msg,
      });
      // notify
      useNotificationStore.getState().addToast(msg, "success");
      return response.data;
    } catch (error) {
      const errorMessage = error.error?.message || error.message || "Failed to submit application";
      set({ loading: false, error: errorMessage });
      useNotificationStore.getState().addToast(errorMessage, "error");
      throw error;
    }
  },

  // Get my applications
  getMyApplications: async (status = null) => {
    set({ loading: true, error: null });
    try {
      const response = await ContractApplicationsService.getMyApplications(status);
      const prev = get().applications || [];
      const next = response.data || [];

      // detect status changes and notify
      next.forEach((app) => {
        const prevApp = prev.find((p) => (p._id && app._id && p._id === app._id) || (p.contractId === app.contractId));
        if (prevApp && prevApp.status !== app.status) {
          const title = app.contract?.title || app.contractTitle || app.contractId || "Contract";
          const status = app.status;
          const msg =
            status === "approved"
              ? `${title} was approved`
              : status === "rejected"
              ? `${title} was rejected`
              : `${title} status changed to ${status}`;
          useNotificationStore.getState().addToast(msg, status === "rejected" ? "error" : "success");
        }
      });

      set({
        applications: next,
        loading: false,
      });
      return response.data;
    } catch (error) {
      const errorMessage = error.error?.message || error.message || "Failed to fetch applications";
      set({ loading: false, error: errorMessage });
      useNotificationStore.getState().addToast(errorMessage, "error");
      throw error;
    }
  },

  // Get pending applications for a contract
  getPendingApplications: async (contractId) => {
    set({ loading: true, error: null });
    try {
      const response = await ContractApplicationsService.getPendingApplications(contractId);
      set({
        pendingApplications: response.data,
        loading: false,
      });
      return response.data;
    } catch (error) {
      const errorMessage = error.error?.message || error.message || "Failed to fetch applications";
      set({ loading: false, error: errorMessage });
      throw error;
    }
  },

  // Get application details
  getApplicationDetails: async (applicationId) => {
    set({ loading: true, error: null });
    try {
      const response = await ContractApplicationsService.getApplicationDetails(applicationId);
      set({
        selectedApplication: response.data,
        loading: false,
      });
      return response.data;
    } catch (error) {
      const errorMessage = error.error?.message || error.message || "Failed to fetch application";
      set({ loading: false, error: errorMessage });
      throw error;
    }
  },

  // Accept an application
  acceptApplication: async (applicationId) => {
    set({ loading: true, error: null });
    try {
      const response = await ContractApplicationsService.acceptApplication(applicationId);
      set({
        loading: false,
        successMessage: response.message || "Application accepted successfully",
      });
      return response.data;
    } catch (error) {
      const errorMessage = error.error?.message || error.message || "Failed to accept application";
      set({ loading: false, error: errorMessage });
      throw error;
    }
  },

  // Reject an application
  rejectApplication: async (applicationId, rejectionReason) => {
    set({ loading: true, error: null });
    try {
      const response = await ContractApplicationsService.rejectApplication(
        applicationId,
        rejectionReason
      );
      set({
        loading: false,
        successMessage: response.message || "Application rejected successfully",
      });
      // Update the selected application
      get().getApplicationDetails(applicationId);
      return response.data;
    } catch (error) {
      const errorMessage = error.error?.message || error.message || "Failed to reject application";
      set({ loading: false, error: errorMessage });
      throw error;
    }
  },

  // Clear selected application
  clearSelectedApplication: () => set({ selectedApplication: null }),

  // Clear all
  clear: () =>
    set({
      applications: [],
      pendingApplications: [],
      selectedApplication: null,
      loading: false,
      error: null,
      successMessage: null,
    }),
}));

export default useApplicationStore;

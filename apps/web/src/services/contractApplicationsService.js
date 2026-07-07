/**
 * Contract Applications Service
 * Frontend API client for contract applications
 */

import { axiosInstance } from "./api.js";

const API_BASE = "/applications";

export class ContractApplicationsService {
  /**
   * Create a new application for a contract
   */
  static async applyForContract(contractId, applicationData) {
    try {
      const response = await axiosInstance.post(`${API_BASE}/${contractId}`, applicationData);
      return response.data;
    } catch (error) {
      throw error.response?.data || error;
    }
  }

  /**
   * Get all applications by a hustler
   */
  static async getMyApplications(status = null) {
    try {
      const params = status ? { status } : {};
      const response = await axiosInstance.get(`${API_BASE}/hustler/my`, { params });
      return response.data;
    } catch (error) {
      throw error.response?.data || error;
    }
  }

  /**
   * Get application details
   */
  static async getApplicationDetails(applicationId) {
    try {
      const response = await axiosInstance.get(`${API_BASE}/${applicationId}`);
      return response.data;
    } catch (error) {
      throw error.response?.data || error;
    }
  }

  static async updateApplication(applicationId, applicationData) {
    try {
      const response = await axiosInstance.put(`${API_BASE}/${applicationId}`, applicationData);
      return response.data;
    } catch (error) {
      throw error.response?.data || error;
    }
  }

  static async cancelApplication(applicationId) {
    try {
      const response = await axiosInstance.post(`${API_BASE}/${applicationId}/cancel`);
      return response.data;
    } catch (error) {
      throw error.response?.data || error;
    }
  }

  /**
   * Get all applications for a contract (manager only)
   */
  static async getContractApplications(contractId, status = null) {
    try {
      const params = status ? { status } : {};
      const response = await axiosInstance.get(`${API_BASE}/contract/${contractId}`, { params });
      return response.data;
    } catch (error) {
      throw error.response?.data || error;
    }
  }

  /**
   * Get pending applications for a contract (manager only)
   */
  static async getPendingApplications(contractId) {
    try {
      const response = await axiosInstance.get(`${API_BASE}/contract/${contractId}/pending`);
      return response.data;
    } catch (error) {
      throw error.response?.data || error;
    }
  }

  /**
   * Accept an application (manager only)
   */
  static async acceptApplication(applicationId) {
    try {
      const response = await axiosInstance.post(`${API_BASE}/${applicationId}/accept`);
      return response.data;
    } catch (error) {
      throw error.response?.data || error;
    }
  }

  /**
   * Reject an application (manager only)
   */
  static async rejectApplication(applicationId, rejectionReason) {
    try {
      const response = await axiosInstance.post(`${API_BASE}/${applicationId}/reject`, {
        rejectionReason,
      });
      return response.data;
    } catch (error) {
      throw error.response?.data || error;
    }
  }
}

export default ContractApplicationsService;

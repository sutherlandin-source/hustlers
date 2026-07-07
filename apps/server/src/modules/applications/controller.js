/**
 * Contract Applications Module - Controller
 * Handles HTTP requests for contract applications
 */

import ContractApplicationService from "./service.js";
import { HTTP_STATUS, USER_ROLES } from "../../config/constants.js";
import { ApiError } from "../../shared/middleware/errorHandler.js";
import { env } from "../../config/env.js";

export class ContractApplicationController {
  /**
   * Create a new application
   * POST /api/applications/:contractId
   */
  static async createApplication(req, res, next) {
    try {
      const { contractId } = req.params;
      const hustlerId = req.user?.userId || req.user?._id || req.user?.id;
      // Only hustler role may apply for a contract
      if (req.user?.role && req.user.role !== USER_ROLES.HUSTLER) {
        throw new ApiError(HTTP_STATUS.FORBIDDEN, "Only hustlers can apply for contracts");
      }
      const { coverLetter, proposedRate, estimatedDuration, attachments } = req.body;

      console.log('[DEBUG] createApplication called');
      console.log('[DEBUG] contractId:', contractId);
      console.log('[DEBUG] hustlerId:', hustlerId);
      console.log('[DEBUG] req.body:', req.body);
      console.log('[DEBUG] coverLetter:', coverLetter, typeof coverLetter);
      console.log('[DEBUG] proposedRate:', proposedRate, typeof proposedRate);
      console.log('[DEBUG] estimatedDuration:', estimatedDuration, typeof estimatedDuration);

      const application = await ContractApplicationService.createApplication(
        contractId,
        hustlerId,
        {
          coverLetter,
          proposedRate,
          estimatedDuration,
          attachments,
        }
      );

      res.status(HTTP_STATUS.CREATED).json({
        success: true,
        message: "Application submitted successfully",
        data: application,
      });
    } catch (error) {
      console.error('[DEBUG] Error in createApplication:', error.message);
      next(error);
    }
  }

  /**
   * Get applications for a contract (manager only)
   * GET /api/applications/contract/:contractId
   */
  static async getContractApplications(req, res, next) {
    try {
      const { contractId } = req.params;
      const { status } = req.query;

      const applications = await ContractApplicationService.getContractApplications(
        contractId,
        status
      );

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: "Applications retrieved successfully",
        data: applications,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get all applications by a hustler
   * GET /api/applications/hustler/my
   */
  static async getHustlerApplications(req, res, next) {
    try {
      if (!req.user) {
        // No authenticated user on request
        throw new ApiError(401, "Authentication required to retrieve hustler applications");
      }
      const hustlerId = req.user?._id || req.user?.userId || req.user?.id;
      // DEBUG: log resolved hustler id from token
      console.debug("[DEBUG] getHustlerApplications hustlerId:", hustlerId);
      const { status } = req.query;

      try {
        const applications = await ContractApplicationService.getHustlerApplications(
          hustlerId,
          status
        );
        // DEBUG: log returned count
        console.debug("[DEBUG] getHustlerApplications returned:", Array.isArray(applications) ? applications.length : 0);

        res.status(HTTP_STATUS.OK).json({
          success: true,
          message: "Hustler applications retrieved successfully",
          data: applications,
        });
      } catch (error) {
        // Log full error for debugging
        console.error('[ERROR] getHustlerApplications failed:', error && error.stack ? error.stack : error);
        // In development, return the error details to the client to aid debugging
        if (env.NODE_ENV === 'development') {
          res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: error.message || 'Internal server error',
            stack: error.stack,
            timestamp: new Date().toISOString(),
          });
          return;
        }
        next(error);
      }
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get application details
   * GET /api/applications/:applicationId
   */
  static async getApplicationDetails(req, res, next) {
    try {
      const { applicationId } = req.params;

      const application = await ContractApplicationService.getApplicationDetails(
        applicationId
      );

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: "Application details retrieved successfully",
        data: application,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update a pending application
   * PUT /api/applications/:applicationId
   */
  static async updateApplication(req, res, next) {
    try {
      const { applicationId } = req.params;
      const hustlerId = req.user?.userId || req.user?._id || req.user?.id;
      const application = await ContractApplicationService.updateApplication(
        applicationId,
        hustlerId,
        req.body
      );

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: "Application updated successfully",
        data: application,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Cancel a pending application
   * POST /api/applications/:applicationId/cancel
   */
  static async cancelApplication(req, res, next) {
    try {
      const { applicationId } = req.params;
      const hustlerId = req.user?.userId || req.user?._id || req.user?.id;
      const application = await ContractApplicationService.cancelApplication(applicationId, hustlerId);

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: "Application cancelled successfully",
        data: application,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Accept an application
   * POST /api/applications/:applicationId/accept
   */
  static async acceptApplication(req, res, next) {
    try {
      const { applicationId } = req.params;
      const managerId = req.user?.userId || req.user?._id || req.user?.id;

      const application = await ContractApplicationService.acceptApplication(
        applicationId,
        managerId
      );
      const escrowMessage = application.escrowFunded
        ? "Application accepted and escrow funded successfully"
        : `Application accepted. Escrow still needs manager funding: ${application.escrowFundingError}`;

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: escrowMessage,
        data: application,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Reject an application
   * POST /api/applications/:applicationId/reject
   */
  static async rejectApplication(req, res, next) {
    try {
      const { applicationId } = req.params;
      const managerId = req.user?.userId || req.user?._id || req.user?.id;
      const { rejectionReason } = req.body;

      const application = await ContractApplicationService.rejectApplication(
        applicationId,
        managerId,
        rejectionReason
      );

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: "Application rejected successfully",
        data: application,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get pending applications for a contract
   * GET /api/applications/contract/:contractId/pending
   */
  static async getPendingApplications(req, res, next) {
    try {
      const { contractId } = req.params;

      const applications = await ContractApplicationService.getPendingApplications(
        contractId
      );

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: "Pending applications retrieved successfully",
        data: applications,
      });
    } catch (error) {
      next(error);
    }
  }
}

export default ContractApplicationController;

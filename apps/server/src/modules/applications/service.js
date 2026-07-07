/**
 * Contract Applications Module - Service
 * Handles contract application business logic
 */

import mongoose from "mongoose";
import ContractApplication from "./model.js";
import { Contract } from "../contracts/model.js";
import { escrowService } from "../escrow/index.js";
import { APPLICATION_STATUSES, HTTP_STATUS } from "../../config/constants.js";
import { CONTRACT_STATUSES, ESCROW_STATUSES } from "../../shared/config/constants.js";
import { ApiError } from "../../shared/middleware/errorHandler.js";
import { notifications } from "../../shared/utils/notifications.js";

export class ContractApplicationService {
  /**
   * Create a new application for a contract
   */
  static async createApplication(contractId, hustlerId, applicationData) {
    // Check if hustler already applied for this contract
    const existingApplication = await ContractApplication.findOne({
      contractId,
      hustlerId,
    });

    if (existingApplication) {
      if (existingApplication.status === APPLICATION_STATUSES.CANCELLED) {
        existingApplication.status = APPLICATION_STATUSES.PENDING;
        existingApplication.coverLetter = applicationData.coverLetter;
        existingApplication.proposedRate = applicationData.proposedRate;
        existingApplication.estimatedDuration = applicationData.estimatedDuration;
        existingApplication.attachments = applicationData.attachments || [];
        existingApplication.appliedAt = new Date();
        existingApplication.reviewedAt = null;
        existingApplication.reviewedBy = null;
        existingApplication.rejectionReason = undefined;
        await existingApplication.save();
        const contract = await Contract.findById(contractId);
        notifications.emit("application.created", { application: existingApplication, contract });
        return existingApplication;
      }
      throw new ApiError(HTTP_STATUS.CONFLICT, "You have already applied for this contract");
    }

    // Check if contract exists
    const contract = await Contract.findById(contractId);
    if (!contract) {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, "Contract not found");
    }

    // Create application
    const application = new ContractApplication({
      contractId,
      hustlerId,
      status: APPLICATION_STATUSES.PENDING,
      coverLetter: applicationData.coverLetter,
      proposedRate: applicationData.proposedRate,
      estimatedDuration: applicationData.estimatedDuration,
      attachments: applicationData.attachments || [],
    });

    await application.save();
    notifications.emit("application.created", { application, contract });
    // Keep the contract open until a manager accepts an applicant. The
    // application document is the source of truth for who has already applied.
    return application;
  }

  static async updateApplication(applicationId, hustlerId, applicationData) {
    const application = await ContractApplication.findById(applicationId);
    if (!application) {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, "Application not found");
    }
    if (application.hustlerId?.toString() !== hustlerId?.toString()) {
      throw new ApiError(HTTP_STATUS.FORBIDDEN, "You can only edit your own application");
    }
    if (application.status !== APPLICATION_STATUSES.PENDING) {
      throw new ApiError(HTTP_STATUS.CONFLICT, "Only pending applications can be edited");
    }

    if (applicationData.coverLetter !== undefined) application.coverLetter = applicationData.coverLetter;
    if (applicationData.proposedRate !== undefined) application.proposedRate = applicationData.proposedRate;
    if (applicationData.estimatedDuration !== undefined) application.estimatedDuration = applicationData.estimatedDuration;
    if (applicationData.attachments !== undefined) application.attachments = applicationData.attachments || [];
    await application.save();
    return this.getApplicationDetails(applicationId);
  }

  static async cancelApplication(applicationId, hustlerId) {
    const application = await ContractApplication.findById(applicationId);
    if (!application) {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, "Application not found");
    }
    if (application.hustlerId?.toString() !== hustlerId?.toString()) {
      throw new ApiError(HTTP_STATUS.FORBIDDEN, "You can only cancel your own application");
    }
    if (application.status !== APPLICATION_STATUSES.PENDING) {
      throw new ApiError(HTTP_STATUS.CONFLICT, "Only pending applications can be cancelled");
    }

    application.status = APPLICATION_STATUSES.CANCELLED;
    application.reviewedAt = new Date();
    application.rejectionReason = "Application withdrawn by hustler";
    await application.save();
    return this.getApplicationDetails(applicationId);
  }

  /**
   * Get all applications for a contract (for manager review)
   */
  static async getContractApplications(contractId, status = null) {
    const query = { contractId };
    if (status) {
      query.status = status;
    }

    const applications = await ContractApplication.find(query)
      .populate("hustlerId", "name email rating skills avatar")
      .populate("contractId", "title amount currency")
      .sort({ appliedAt: -1 });

    return applications;
  }

  /**
   * Get all applications by a hustler
   */
  static async getHustlerApplications(hustlerId, status = null) {
    // Ensure we query using an ObjectId when possible to match stored documents
    let searchHustlerId = hustlerId;
    if (typeof hustlerId === "string" && mongoose.Types.ObjectId.isValid(hustlerId)) {
      searchHustlerId = new mongoose.Types.ObjectId(hustlerId);
    }
    // Support matching either ObjectId or string-stored IDs in the DB
    const query = {
      $or: [{ hustlerId: searchHustlerId }, { hustlerId }],
    };
    if (status) {
      query.status = status;
    }

    const applications = await ContractApplication.find(query)
      .populate("contractId", "title amount currency description jobCategory seller escrowStatus escrowPrepared status")
      .populate("reviewedBy", "name email")
      .sort({ appliedAt: -1 });

    // If no application documents exist, fall back to checking Contracts where appliedBy was used
    if (!applications || applications.length === 0) {
      // Support matching either ObjectId or string in Contract.appliedBy
      const contractQuery = { $or: [{ appliedBy: searchHustlerId }, { appliedBy: hustlerId }] };
      if (status) contractQuery.status = status;

      const contracts = await Contract.find(contractQuery)
        .select("title amount currency description jobCategory milestones metadata appliedAt status seller escrowStatus escrowPrepared")
        .sort({ createdAt: -1 });

      // Map contracts to application-like objects so frontend can render them
      const fallbackApplications = contracts.map((c) => ({
        _id: `contract-${c._id}`,
        contractId: c._id,
        status: null,
        coverLetter: null,
        appliedAt: c.appliedAt || c.createdAt,
        contract: c,
      }));

      return fallbackApplications;
    }

    return applications;
  }

  /**
   * Get application details with applicant profile
   */
  static async getApplicationDetails(applicationId) {
    const application = await ContractApplication.findById(applicationId)
      .populate({
        path: "hustlerId",
        select: "name email phone rating skills avatar bio workExperience certifications",
      })
      .populate({
        path: "contractId",
        select: "title description amount currency jobCategory workLocation numWorkers seller status escrowStatus escrowPrepared",
      })
      .populate("reviewedBy", "name email");

    if (!application) {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, "Application not found");
    }

    return application;
  }

  /**
   * Accept an application
   * - Update application status to ACCEPTED
   * - Update contract status to ASSIGNED
   * - Assign the first accepted hustler to contract.seller for legacy contract flows
   * - Activate escrow workflow as waiting for funding
   */
  static async acceptApplication(applicationId, managerId) {
    const application = await ContractApplication.findById(applicationId);
    if (!application) {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, "Application not found");
    }

    if (application.status !== APPLICATION_STATUSES.PENDING) {
      throw new ApiError(HTTP_STATUS.CONFLICT, `Cannot accept application with status: ${application.status}`);
    }

    const contract = await Contract.findById(application.contractId);
    if (!contract) {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, "Contract not found");
    }

    const maxWorkers = Math.max(1, Number(contract.numWorkers) || 1);
    const acceptedBefore = await ContractApplication.countDocuments({
      contractId: application.contractId,
      status: APPLICATION_STATUSES.ACCEPTED,
    });
    if (acceptedBefore >= maxWorkers) {
      throw new ApiError(HTTP_STATUS.CONFLICT, "This contract already has the required number of accepted hustlers");
    }

    // Update application
    application.status = APPLICATION_STATUSES.ACCEPTED;
    application.reviewedAt = new Date();
    application.reviewedBy = managerId;
    await application.save();

    contract.status = CONTRACT_STATUSES.ASSIGNED;
    if (!contract.seller) {
      contract.seller = application.hustlerId;
    }
    if (!contract.escrowPrepared) {
      contract.escrowStatus = ESCROW_STATUSES.WAITING_FOR_FUNDING;
    }
    await contract.save();

    const acceptedAfter = acceptedBefore + 1;
    if (acceptedAfter >= maxWorkers) {
      await ContractApplication.updateMany(
        {
          contractId: application.contractId,
          _id: { $ne: application._id },
          status: APPLICATION_STATUSES.PENDING,
        },
        {
          $set: {
            status: APPLICATION_STATUSES.REJECTED,
            reviewedAt: new Date(),
            reviewedBy: managerId,
            rejectionReason: "All worker slots have been filled for this contract",
          },
        }
      );
    }

    let escrowFundingError = null;
    if (!contract.escrowPrepared) {
      try {
        await escrowService.reserveEscrow(contract._id, managerId, Number(contract.amount));
      } catch (error) {
        escrowFundingError = error?.message || "Escrow could not be funded automatically";
        contract.metadata = {
          ...(contract.metadata || {}),
          escrowFundingError,
          escrowFundingAttemptedAt: new Date(),
        };
        await contract.save();
      }
    }

    // Return updated data
    const updatedApplication = await this.getApplicationDetails(applicationId);
    notifications.emit("application.accepted", { application: updatedApplication, contract });
    const payload = updatedApplication.toObject ? updatedApplication.toObject() : updatedApplication;
    payload.escrowFunded = !escrowFundingError;
    payload.escrowFundingError = escrowFundingError;
    return payload;
  }

  /**
   * Reject an application
   * - Update application status to REJECTED
   * - Store rejection reason
   */
  static async rejectApplication(applicationId, managerId, rejectionReason) {
    const application = await ContractApplication.findById(applicationId);
    if (!application) {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, "Application not found");
    }

    if (application.status !== APPLICATION_STATUSES.PENDING) {
      throw new ApiError(HTTP_STATUS.CONFLICT, `Cannot reject application with status: ${application.status}`);
    }

    application.status = APPLICATION_STATUSES.REJECTED;
    application.rejectionReason = rejectionReason;
    application.reviewedAt = new Date();
    application.reviewedBy = managerId;
    await application.save();

    const contract = await Contract.findById(application.contractId);
    if (contract && contract.status === CONTRACT_STATUSES.APPLIED) {
      contract.status = CONTRACT_STATUSES.PENDING;
      if (contract.appliedBy?.toString() === application.hustlerId?.toString()) {
        contract.appliedBy = null;
      }
      await contract.save();
    }

    const updatedApplication = await this.getApplicationDetails(applicationId);
    notifications.emit("application.rejected", { application: updatedApplication, contract });
    return updatedApplication;
  }

  /**
   * Get pending applications for a contract
   */
  static async getPendingApplications(contractId) {
    const applications = await ContractApplication.find({
      contractId,
      status: APPLICATION_STATUSES.PENDING,
    })
      .populate("hustlerId", "name email rating skills avatar")
      .sort({ appliedAt: -1 });

    return applications;
  }
}

export default ContractApplicationService;

/**
 * Contract Applications Module - Service
 * Handles contract application business logic
 */

import mongoose from "mongoose";
import ContractApplication from "./model.js";
import { Contract } from "../contracts/model.js";
import { Milestone } from "../milestones/model.js";
import { User } from "../../shared/models/User.js";
import { escrowService } from "../escrow/index.js";
import { APPLICATION_STATUSES, HTTP_STATUS } from "../../config/constants.js";
import { CONTRACT_STATUSES, ESCROW_STATUSES, MILESTONE_STATUSES, PAYMENT_STATUSES, WORK_STATUS } from "../../shared/config/constants.js";
import { ApiError } from "../../shared/middleware/errorHandler.js";
import { hasApprovedIdentityVerification, requireIdentityVerification } from "../../shared/utils/identity.js";
import { notifications } from "../../shared/utils/notifications.js";

function toPlain(value) {
  if (!value) return null;
  return typeof value.toObject === "function" ? value.toObject() : value;
}

function sanitizePublicHustlerProfile(hustler) {
  const user = toPlain(hustler);
  if (!user) return null;

  const firstName = String(user.firstName || "").trim();
  const lastName = String(user.lastName || "").trim();
  const name = [firstName, lastName].filter(Boolean).join(" ") || user.name || "Hustler";

  return {
    _id: user._id || user.id,
    id: user.id,
    name,
    firstName,
    lastName,
    role: user.role,
    location: user.location || "",
    skills: Array.isArray(user.skills) ? user.skills : [],
    bio: user.bio || "",
    avatar: user.avatar || "",
    experienceLevel: user.experienceLevel || "",
    averageRating: Number(user.averageRating || 0),
    totalReviews: Number(user.totalReviews || 0),
    completedContracts: Number(user.completedContracts || 0),
    isEmailVerified: Boolean(user.isEmailVerified),
    identityVerified: Boolean(String(user.idNumber || "").trim() && String(user.mpesaNumber || "").trim()),
  };
}

export class ContractApplicationService {
  static async ensureMilestonesForHustler(contract, hustlerId) {
    const maxWorkers = Math.max(1, Number(contract.numWorkers) || 1);
    const workerAmount = (amount) => Number((Number(amount || 0) / maxWorkers).toFixed(2));
    const existingForHustler = await Milestone.countDocuments({
      contract: contract._id,
      assignedTo: hustlerId,
    });
    if (existingForHustler > 0) return;

    const milestones = await Milestone.find({ contract: contract._id }).sort({ createdAt: 1 });
    const unassignedMilestones = milestones.filter((milestone) => !milestone.assignedTo);
    if (unassignedMilestones.length > 0) {
      for (const milestone of unassignedMilestones) {
        milestone.assignedTo = hustlerId;
        milestone.metadata = {
          ...(milestone.metadata || {}),
          originalAmount: milestone.metadata?.originalAmount ?? milestone.amount,
        };
        milestone.amount = workerAmount(milestone.metadata.originalAmount);
        await milestone.save();
      }
      return;
    }

    const templateMilestones = milestones.filter((milestone) => !milestone.metadata?.sourceMilestoneId);
    const sourceMilestones = templateMilestones.length ? templateMilestones : milestones;
    const clonedMilestones = await Milestone.create(
      sourceMilestones.map((milestone) => ({
        contract: contract._id,
        title: milestone.title,
        description: milestone.description,
        amount: workerAmount(milestone.metadata?.originalAmount ?? milestone.amount),
        dueDate: milestone.dueDate,
        assignedTo: hustlerId,
        status: MILESTONE_STATUSES.PENDING,
        workStatus: WORK_STATUS.NOT_STARTED,
        paymentStatus: PAYMENT_STATUSES.PENDING,
        metadata: {
          ...(milestone.metadata || {}),
          sourceMilestoneId: milestone.metadata?.sourceMilestoneId || milestone._id,
          clonedForHustler: hustlerId,
        },
      }))
    );
    contract.milestones.push(...clonedMilestones.map((milestone) => milestone._id));
    await contract.save();
  }

  static async ensureMilestonesForAcceptedHustlers(contractId) {
    const contract = await Contract.findById(contractId);
    if (!contract) return;

    const acceptedApplications = await ContractApplication.find({
      contractId: contract._id,
      status: APPLICATION_STATUSES.ACCEPTED,
    }).sort({ reviewedAt: 1, createdAt: 1 });

    for (const acceptedApplication of acceptedApplications) {
      await this.ensureMilestonesForHustler(contract, acceptedApplication.hustlerId);
    }
  }


  /**
   * Create a new application for a contract
   */
  static async createApplication(contractId, hustlerId, applicationData) {
    try {
      if (!mongoose.Types.ObjectId.isValid(contractId)) {
        throw new ApiError(HTTP_STATUS.BAD_REQUEST, "Invalid contract id");
      }
      if (!mongoose.Types.ObjectId.isValid(hustlerId)) {
        throw new ApiError(HTTP_STATUS.UNAUTHORIZED, "Invalid user session");
      }

      const normalizedContractId = new mongoose.Types.ObjectId(contractId);
      const normalizedHustlerId = new mongoose.Types.ObjectId(hustlerId);

      const hustler = await User.findById(normalizedHustlerId).select("idNumber mpesaNumber verificationStatus isEmailVerified");
      if (!hustler) {
        throw new ApiError(HTTP_STATUS.NOT_FOUND, "User not found");
      }
      requireIdentityVerification(hustler, "apply for contracts");
      if (!hasApprovedIdentityVerification(hustler)) {
        throw new ApiError(HTTP_STATUS.FORBIDDEN, "Your verification must be approved before you can apply for contracts.");
      }

      // Check if hustler already applied for this contract
      const existingApplication = await ContractApplication.findOne({
        contractId: normalizedContractId,
        hustlerId: normalizedHustlerId,
      });

      if (existingApplication) {
        const reapplyable = [APPLICATION_STATUSES.CANCELLED, APPLICATION_STATUSES.REJECTED];
        if (reapplyable.includes(existingApplication.status)) {
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
          const contract = await Contract.findById(normalizedContractId);
          notifications.emit("application.created", { application: existingApplication, contract });
          return existingApplication;
        }
        throw new ApiError(HTTP_STATUS.CONFLICT, "You have already applied for this contract");
      }

      // Check if contract exists
      const contract = await Contract.findById(normalizedContractId);
      if (!contract) {
        throw new ApiError(HTTP_STATUS.NOT_FOUND, "Contract not found");
      }

      // Only allow applying to open/pending contracts
      const applyableStatuses = [CONTRACT_STATUSES.PENDING, CONTRACT_STATUSES.ACTIVE];
      if (!applyableStatuses.includes(contract.status)) {
        throw new ApiError(
          HTTP_STATUS.CONFLICT,
          `This contract is no longer accepting applications (status: ${contract.status})`
        );
      }

      // Block if all worker slots are already filled
      const maxWorkers = Math.max(1, Number(contract.numWorkers) || 1);
      const acceptedCount = await ContractApplication.countDocuments({
        contractId: normalizedContractId,
        status: APPLICATION_STATUSES.ACCEPTED,
      });
      if (acceptedCount >= maxWorkers) {
        throw new ApiError(HTTP_STATUS.CONFLICT, "This contract has already filled all available positions");
      }
      const application = new ContractApplication({
        contractId: normalizedContractId,
        hustlerId: normalizedHustlerId,
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
    } catch (error) {
      if (error?.code === 11000) {
        throw new ApiError(HTTP_STATUS.CONFLICT, "You have already applied for this contract");
      }
      if (error?.name === "CastError") {
        throw new ApiError(HTTP_STATUS.BAD_REQUEST, "Invalid application request");
      }
      throw error;
    }
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
      .populate("hustlerId", "firstName lastName location skills bio avatar experienceLevel averageRating totalReviews completedContracts isEmailVerified idNumber mpesaNumber")
      .populate("contractId", "title amount currency")
      .sort({ appliedAt: -1 });
    return applications.map((application) => {
      const record = application.toObject ? application.toObject() : application;
      record.hustlerId = sanitizePublicHustlerProfile(record.hustlerId);
      return record;
    });
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
      .populate("contractId", "title amount currency description jobCategory seller escrowStatus escrowPrepared status numWorkers metadata")
      .populate("reviewedBy", "name email")
      .sort({ appliedAt: -1 });

    const acceptedApplications = applications.filter((application) => application.status === APPLICATION_STATUSES.ACCEPTED);
    try {
      for (const application of acceptedApplications) {
        const contractId = application.contractId?._id || application.contractId;
        if (contractId) {
          await this.ensureMilestonesForAcceptedHustlers(contractId);
        }
      }
    } catch (error) {
      console.warn("[WARN] Failed to sync accepted hustler milestones during application load:", error?.message);
    }

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

    return applications.map((application) => {
      const record = application.toObject ? application.toObject() : application;
      record.hustlerId = sanitizePublicHustlerProfile(record.hustlerId);
      return record;
    });
  }

  /**
   * Get application details with applicant profile
   */
  static async getApplicationDetails(applicationId) {
    const application = await ContractApplication.findById(applicationId)
      .populate({
        path: "hustlerId",
        select: "firstName lastName location skills bio avatar experienceLevel averageRating totalReviews completedContracts isEmailVerified idNumber mpesaNumber",
      })
      .populate({
        path: "contractId",
        select: "title description amount currency jobCategory workLocation numWorkers seller status escrowStatus escrowPrepared",
      })
      .populate("reviewedBy", "name email");

    if (!application) {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, "Application not found");
    }

    const record = application.toObject ? application.toObject() : application;
    record.hustlerId = sanitizePublicHustlerProfile(record.hustlerId);
    return record;
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
    await this.ensureMilestonesForAcceptedHustlers(contract._id);
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
      .populate("hustlerId", "firstName lastName location skills bio avatar experienceLevel averageRating totalReviews completedContracts isEmailVerified idNumber mpesaNumber")
      .sort({ appliedAt: -1 });
    return applications.map((application) => {
      const record = application.toObject ? application.toObject() : application;
      record.hustlerId = sanitizePublicHustlerProfile(record.hustlerId);
      return record;
    });
  }
}

export default ContractApplicationService;

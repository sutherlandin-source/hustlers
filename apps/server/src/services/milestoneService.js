import { Milestone } from "../models/Milestone.js";
import { Contract } from "../models/Contract.js";
import { ApiError } from "../middleware/errorHandler.js";
import { HTTP_STATUS, MILESTONE_STATUSES, CONTRACT_STATUSES, ESCROW_STATUSES, WORK_STATUS } from "../config/constants.js";
import { logger } from "../utils/logger.js";
import { notifications } from "../utils/notifications.js";
import { financialService } from "./financialService.js";

export class MilestoneService {
  async createMilestone(contractId, input) {
    const contract = await Contract.findById(contractId);
    if (!contract) throw new ApiError(HTTP_STATUS.NOT_FOUND, "Contract not found");
    if (contract.status === CONTRACT_STATUSES.CANCELLED || contract.status === CONTRACT_STATUSES.COMPLETED) {
      throw new ApiError(HTTP_STATUS.CONFLICT, "Cannot add milestones to closed/cancelled contract");
    }

    const milestone = new Milestone({
      contract: contractId,
      title: input.title,
      description: input.description,
      amount: input.amount,
      dueDate: input.dueDate,
    });

    await milestone.save();
    contract.milestones.push(milestone._id);
    await contract.save();

    notifications.emit("milestone.created", { milestone, contract });
    logger.info("Milestone created", { milestoneId: milestone._id, contractId });
    return milestone;
  }

  async submitMilestone(milestoneId, userId, submissionData) {
    const milestone = await Milestone.findById(milestoneId);
    if (!milestone) throw new ApiError(HTTP_STATUS.NOT_FOUND, "Milestone not found");
    if (milestone.status !== MILESTONE_STATUSES.PENDING) {
      throw new ApiError(HTTP_STATUS.CONFLICT, "Milestone is not in a submittable state");
    }

    milestone.submittedBy = userId;
    milestone.submittedAt = new Date();
    milestone.submissionData = submissionData;
    milestone.status = MILESTONE_STATUSES.SUBMITTED;
    await milestone.save();

    notifications.emit("milestone.submitted", { milestone });
    return milestone;
  }

  async approveMilestone(milestoneId, approverId) {
    const paymentResult = await financialService.approveAndReleaseMilestonePayment(milestoneId, approverId);
    notifications.emit("milestone.approved", { milestone: paymentResult.milestone });
    return paymentResult.milestone;
  }

  async rejectMilestone(milestoneId, approverId, reason) {
    const milestone = await Milestone.findById(milestoneId);
    if (!milestone) throw new ApiError(HTTP_STATUS.NOT_FOUND, "Milestone not found");
    if (milestone.status !== MILESTONE_STATUSES.SUBMITTED) {
      throw new ApiError(HTTP_STATUS.CONFLICT, "Milestone is not in a rejectable state");
    }

    milestone.approvedBy = approverId;
    milestone.rejectionReason = reason;
    milestone.status = MILESTONE_STATUSES.REJECTED;
    milestone.workStatus = WORK_STATUS.NEEDS_REVISION;
    await milestone.save();

    const contract = await Contract.findById(milestone.contract);
    if (contract?.escrowPrepared && contract.escrowStatus !== ESCROW_STATUSES.RELEASED) {
      contract.escrowStatus = ESCROW_STATUSES.IN_PROGRESS;
      await contract.save();
    }

    notifications.emit("milestone.rejected", { milestone });
    return milestone;
  }

  async getMilestone(milestoneId) {
    return Milestone.findById(milestoneId).populate("contract");
  }

  async listMilestones(filter = {}, options = {}, sellerId = null) {
    const q = Milestone.find(filter)
      .sort({ createdAt: -1 })
      .populate({ path: "contract", populate: ["buyer", "seller"] });

    if (options.limit) q.limit(options.limit);
    if (options.skip) q.skip(options.skip);

    const results = await q;
    if (!sellerId) {
      return results;
    }

    const sellerString = sellerId.toString();
    return results.filter(
      (milestone) => milestone.contract &&
        ((milestone.contract.seller?._id && milestone.contract.seller._id.toString() === sellerString) ||
          milestone.contract.seller?.toString() === sellerString)
    );
  }

  async updateWorkStatus(milestoneId, userId, newStatus, data = {}) {
    const milestone = await Milestone.findById(milestoneId).populate("contract");
    if (!milestone) throw new ApiError(HTTP_STATUS.NOT_FOUND, "Milestone not found");

    // Verify hustler owns this milestone
    if (milestone.contract.seller.toString() !== userId.toString()) {
      throw new ApiError(HTTP_STATUS.FORBIDDEN, "Unauthorized to update this milestone");
    }

    // Validate status transitions
    const currentStatus = milestone.workStatus;
    const validTransitions = {
      [WORK_STATUS.NOT_STARTED]: [WORK_STATUS.IN_PROGRESS],
      [WORK_STATUS.IN_PROGRESS]: [WORK_STATUS.WORK_SUBMITTED, WORK_STATUS.NOT_STARTED],
      [WORK_STATUS.WORK_SUBMITTED]: [WORK_STATUS.IN_PROGRESS],
      [WORK_STATUS.NEEDS_REVISION]: [WORK_STATUS.IN_PROGRESS],
      [WORK_STATUS.APPROVED]: [],
    };

    if (!validTransitions[currentStatus]?.includes(newStatus)) {
      throw new ApiError(HTTP_STATUS.CONFLICT, `Cannot transition from ${currentStatus} to ${newStatus}`);
    }

    // Update status
    milestone.workStatus = newStatus;

    // If submitting work, update milestone status and capture submission data
    if (newStatus === WORK_STATUS.WORK_SUBMITTED) {
      milestone.status = MILESTONE_STATUSES.SUBMITTED;
      milestone.submittedBy = userId;
      milestone.submittedAt = new Date();
      milestone.completionNotes = data.completionNotes || "";
      milestone.proofFiles = data.proofFiles || [];
      milestone.submissionData = data;
      
      notifications.emit("milestone.submitted", { milestone, contract: milestone.contract });
      logger.info("Milestone work submitted", { milestoneId, userId });
    }

    if (newStatus === WORK_STATUS.IN_PROGRESS) {
      milestone.status = MILESTONE_STATUSES.PENDING;
      notifications.emit("milestone.workStarted", { milestone, contract: milestone.contract });
      logger.info("Milestone work started", { milestoneId, userId });
    }

    await milestone.save();
    return milestone;
  }

  async requestRevision(milestoneId, managerId, reason) {
    const milestone = await Milestone.findById(milestoneId).populate("contract");
    if (!milestone) throw new ApiError(HTTP_STATUS.NOT_FOUND, "Milestone not found");
    if (milestone.status !== MILESTONE_STATUSES.SUBMITTED) {
      throw new ApiError(HTTP_STATUS.CONFLICT, "Milestone is not in submitted state");
    }

    milestone.workStatus = WORK_STATUS.NEEDS_REVISION;
    milestone.rejectionReason = reason;
    milestone.revisionRequestedAt = new Date();
    milestone.approvedBy = managerId;
    milestone.status = MILESTONE_STATUSES.REJECTED;
    await milestone.save();

    notifications.emit("milestone.revisionRequested", { milestone, reason });
    logger.info("Revision requested", { milestoneId, managerId });
    return milestone;
  }

  async getContractProgress(contractId) {
    const milestones = await Milestone.find({ contract: contractId }).sort({ createdAt: 1 });
    
    const total = milestones.length;
    const completed = milestones.filter(m => m.workStatus === WORK_STATUS.APPROVED || m.status === MILESTONE_STATUSES.APPROVED).length;
    const inProgress = milestones.filter(m => m.workStatus === WORK_STATUS.IN_PROGRESS).length;
    const submitted = milestones.filter(m => m.workStatus === WORK_STATUS.WORK_SUBMITTED).length;
    const percentComplete = total > 0 ? Math.round((completed / total) * 100) : 0;

    return {
      total,
      completed,
      inProgress,
      submitted,
      notStarted: total - completed - inProgress - submitted,
      percentComplete,
      milestones: milestones.map(m => ({
        _id: m._id,
        title: m.title,
        workStatus: m.workStatus,
        status: m.status,
        amount: m.amount,
        completedAt: m.approvedAt,
      })),
    };
  }
}

export const milestoneService = new MilestoneService();

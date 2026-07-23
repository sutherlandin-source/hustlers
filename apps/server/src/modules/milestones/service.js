/**
 * Milestones Service
 * Business logic for milestone operations
 */

import { Milestone } from "./model.js";
import { Contract } from "../contracts/model.js";
import { ApiError } from "../../shared/middleware/errorHandler.js";
import { CONTRACT_PAYMENT_TYPES, ESCROW_STATUSES, HTTP_STATUS, MILESTONE_STATUSES, CONTRACT_STATUSES, WORK_STATUS, PAYMENT_STATUSES } from "../../shared/config/constants.js";
import { logger } from "../../shared/utils/logger.js";
import { notifications } from "../../shared/utils/notifications.js";

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
    if (milestone.assignedTo && milestone.assignedTo.toString() !== userId?.toString()) {
      throw new ApiError(HTTP_STATUS.FORBIDDEN, "You can only submit work assigned to you");
    }
    if (milestone.status !== MILESTONE_STATUSES.PENDING) {
      throw new ApiError(HTTP_STATUS.CONFLICT, "Milestone is not in a submittable state");
    }

    milestone.submittedBy = userId;
    milestone.submittedAt = new Date();
    milestone.submissionData = submissionData;
    milestone.status = MILESTONE_STATUSES.SUBMITTED;
    await milestone.save();

    const contract = await Contract.findById(milestone.contract);
    notifications.emit("milestone.submitted", { milestone, contract });
    return milestone;
  }

  async approveMilestone(milestoneId, approverId) {
    const milestone = await Milestone.findById(milestoneId);
    if (!milestone) throw new ApiError(HTTP_STATUS.NOT_FOUND, "Milestone not found");

    // Auto-heal: a milestone stuck in REJECTED/PENDING with real submission evidence
    // (e.g. after requestRevision with no re-submit) can still be approved by the manager.
    const hasSubmissionEvidence =
      Boolean(milestone.submittedBy) ||
      Boolean(milestone.submittedAt) ||
      Boolean(milestone.completionNotes?.trim()) ||
      Boolean(milestone.submissionData);
    if (
      (milestone.status === MILESTONE_STATUSES.REJECTED ||
        milestone.status === MILESTONE_STATUSES.PENDING) &&
      hasSubmissionEvidence
    ) {
      milestone.status = MILESTONE_STATUSES.SUBMITTED;
      if ([WORK_STATUS.NEEDS_REVISION, WORK_STATUS.REJECTED, WORK_STATUS.NOT_STARTED].includes(milestone.workStatus)) {
        milestone.workStatus = WORK_STATUS.WORK_SUBMITTED;
      }
      await milestone.save();
    }

    if (milestone.status !== MILESTONE_STATUSES.SUBMITTED) {
      throw new ApiError(HTTP_STATUS.CONFLICT, "Milestone must be submitted before approval");
    }

    const contract = await Contract.findById(milestone.contract).populate("milestones");
    if (!contract) throw new ApiError(HTTP_STATUS.NOT_FOUND, "Contract not found");
    if (contract.buyer?.toString() !== approverId?.toString()) {
      throw new ApiError(HTTP_STATUS.FORBIDDEN, "Only the contract manager can approve this work");
    }

    milestone.approvedBy = approverId;
    milestone.approvedAt = new Date();
    milestone.status = MILESTONE_STATUSES.APPROVED;
    milestone.workStatus = WORK_STATUS.APPROVED;
    await milestone.save();

    const milestones = Array.isArray(contract.milestones) ? contract.milestones : [];
    const paymentType = contract.paymentType || contract.contractType || CONTRACT_PAYMENT_TYPES.SINGLE;
    const approvedCount = milestones.filter((stage) => stage._id?.toString() === milestone._id.toString() || stage.status === MILESTONE_STATUSES.APPROVED).length;
    const finalApprovalReady =
      paymentType === CONTRACT_PAYMENT_TYPES.STAGED
        ? milestones.length > 0 && approvedCount === milestones.length
        : approvedCount > 0;

    if (contract.escrowPrepared && contract.escrowStatus !== ESCROW_STATUSES.RELEASED) {
      contract.escrowStatus = finalApprovalReady ? ESCROW_STATUSES.AWAITING_APPROVAL : ESCROW_STATUSES.IN_PROGRESS;
      await contract.save();
    }

    notifications.emit("milestone.approved", { milestone, contract });
    return milestone;
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

    notifications.emit("milestone.rejected", { milestone, contract });
    return milestone;
  }

  async rejectWork(milestoneId, approverId, payload = {}) {
    const milestone = await Milestone.findById(milestoneId);
    if (!milestone) throw new ApiError(HTTP_STATUS.NOT_FOUND, "Milestone not found");
    if (![MILESTONE_STATUSES.SUBMITTED, MILESTONE_STATUSES.PENDING, MILESTONE_STATUSES.REJECTED].includes(milestone.status)) {
      throw new ApiError(HTTP_STATUS.CONFLICT, "Milestone is not in a rejectable state");
    }

    const reasonType = String(payload.reasonType || payload.reason || "").trim();
    const comments = String(payload.comments || payload.note || "").trim();
    if (!reasonType) {
      throw new ApiError(HTTP_STATUS.UNPROCESSABLE_ENTITY, "A rejection reason is required");
    }

    milestone.approvedBy = approverId;
    milestone.rejectionReason = reasonType;
    milestone.rejectionComments = comments || "";
    milestone.status = MILESTONE_STATUSES.REJECTED;
    milestone.workStatus = WORK_STATUS.REJECTED;
    milestone.paymentStatus = milestone.paymentStatus || PAYMENT_STATUSES.PENDING;
    milestone.paymentMetadata = {
      ...(milestone.paymentMetadata || {}),
      rejectionReasonType: reasonType,
      rejectionComments: comments || "",
      rejectedBy: approverId,
      rejectedAt: new Date(),
    };
    await milestone.save();

    const contract = await Contract.findById(milestone.contract);
    if (contract?.escrowPrepared && contract.escrowStatus !== ESCROW_STATUSES.RELEASED) {
      contract.escrowStatus = ESCROW_STATUSES.IN_PROGRESS;
      await contract.save();
    }

    notifications.emit("milestone.rejected", { milestone, contract });
    return milestone;
  }

  async getMilestone(milestoneId) {
    return Milestone.findById(milestoneId).populate("contract");
  }

  async updateWorkStatus(milestoneId, userId, workStatus, options = {}) {
    const milestone = await Milestone.findById(milestoneId);
    if (!milestone) throw new ApiError(HTTP_STATUS.NOT_FOUND, "Milestone not found");
    const contract = await Contract.findById(milestone.contract);
    if (!contract) throw new ApiError(HTTP_STATUS.NOT_FOUND, "Contract not found");
    if (milestone.assignedTo && milestone.assignedTo.toString() !== userId?.toString()) {
      throw new ApiError(HTTP_STATUS.FORBIDDEN, "You can only update work assigned to you");
    }

    const isRevisionStart =
      workStatus === WORK_STATUS.IN_PROGRESS &&
      (milestone.status === MILESTONE_STATUSES.REJECTED || milestone.workStatus === WORK_STATUS.NEEDS_REVISION);

    if (
      workStatus === WORK_STATUS.IN_PROGRESS &&
      !isRevisionStart &&
      ![ESCROW_STATUSES.FUNDED, ESCROW_STATUSES.IN_PROGRESS, ESCROW_STATUSES.AWAITING_APPROVAL].includes(contract.escrowStatus)
    ) {
      throw new ApiError(HTTP_STATUS.CONFLICT, "Escrow must be funded before the hustler can start work");
    }

    // allowed values validated at controller layer; here apply basic transitions
    milestone.workStatus = workStatus;
    if (options.completionNotes) milestone.completionNotes = options.completionNotes;
    if (Array.isArray(options.proofFiles) && options.proofFiles.length) milestone.proofFiles = options.proofFiles;
    if (workStatus === WORK_STATUS.WORK_SUBMITTED) {
      milestone.submittedBy = userId;
      milestone.submittedAt = new Date();
      milestone.status = MILESTONE_STATUSES.SUBMITTED;
      contract.escrowStatus = ESCROW_STATUSES.AWAITING_APPROVAL;
      await contract.save();
    }
    if (workStatus === WORK_STATUS.IN_PROGRESS) {
      // mark start time in metadata
      milestone.metadata = { ...(milestone.metadata || {}), startedAt: new Date(), startedBy: userId };
      if (milestone.status === MILESTONE_STATUSES.REJECTED || milestone.workStatus === WORK_STATUS.NEEDS_REVISION) {
        milestone.status = MILESTONE_STATUSES.PENDING;
      }
      contract.escrowStatus = ESCROW_STATUSES.IN_PROGRESS;
      contract.status = CONTRACT_STATUSES.ACTIVE;
      await contract.save();
    }

    await milestone.save();
    notifications.emit("milestone.work_status_changed", { milestone, contract });
    if (workStatus === WORK_STATUS.WORK_SUBMITTED) {
      notifications.emit("milestone.submitted", { milestone, contract });
    }
    return milestone;
  }

  async requestRevision(milestoneId, userId, reason) {
    const milestone = await Milestone.findById(milestoneId);
    if (!milestone) throw new ApiError(HTTP_STATUS.NOT_FOUND, "Milestone not found");
    milestone.workStatus = WORK_STATUS.NEEDS_REVISION;
    milestone.status = MILESTONE_STATUSES.REJECTED;
    milestone.revisionRequestedAt = new Date();
    milestone.rejectionReason = reason;
    await milestone.save();
    const contract = await Contract.findById(milestone.contract);
    notifications.emit("milestone.rejected", { milestone, contract });
    notifications.emit("milestone.revision_requested", { milestone, contract });
    return milestone;
  }

  async listMilestones(filter = {}, options = {}, sellerId = null) {
    const queryFilter = { ...filter };
    const normalizedStatus = String(queryFilter.status || "").toLowerCase();
    if (normalizedStatus === "submitted" || normalizedStatus === "work_submitted") {
      queryFilter.$or = [
        { status: MILESTONE_STATUSES.SUBMITTED },
        { workStatus: WORK_STATUS.WORK_SUBMITTED },
      ];
      delete queryFilter.status;
    }
    if (sellerId) {
      // Only return milestones explicitly assigned to this seller.
      // Do NOT include unassigned milestones (assignedTo: null) — those belong
      // to the manager as templates and are irrelevant to a hustler's dashboard.
      queryFilter.assignedTo = sellerId;
    }

    const q = Milestone.find(queryFilter)
      .sort({ updatedAt: -1, createdAt: -1 })
      .populate("assignedTo", "name firstName lastName email avatar")
      .populate("submittedBy", "name firstName lastName email avatar")
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
        ((milestone.assignedTo?._id && milestone.assignedTo._id.toString() === sellerString) ||
          milestone.assignedTo?.toString() === sellerString ||
          milestone.contract.seller?._id && milestone.contract.seller._id.toString() === sellerString ||
          milestone.contract.seller?.toString() === sellerString)
    );
  }
}

export const milestoneService = new MilestoneService();

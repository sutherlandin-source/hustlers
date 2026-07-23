/**
 * Contracts Service
 * Business logic for contract operations
 */

import { Types } from "mongoose";
import { Contract } from "./model.js";
import { Milestone } from "../milestones/model.js";
import ContractApplication from "../applications/model.js";
import { Review } from "../reviews/model.js";
import { User } from "../../shared/models/User.js";
import { Dispute } from "../../models/Dispute.js";
import { ApiError } from "../../shared/middleware/errorHandler.js";
import {
  CONTRACT_PAYMENT_TYPES,
  CONTRACT_STATUSES,
  ESCROW_STATUSES,
  HTTP_STATUS,
  MILESTONE_STATUSES,
  PAYMENT_RATE_TYPES,
  USER_ROLES,
} from "../../shared/config/constants.js";
import { logger } from "../../shared/utils/logger.js";
import { requireIdentityVerification } from "../../shared/utils/identity.js";
import { notifications } from "../../shared/utils/notifications.js";
import { escrowService } from "../escrow/index.js";

const HUSTLER_COMMISSION_RATE = 0.025;

function getDisplayName(user) {
  if (!user) return "Unknown hustler";
  return user.name || [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email || "Unknown hustler";
}

function sameId(left, right) {
  return left?.toString() === right?.toString();
}

function getPersonId(person) {
  return person?._id || person?.id || person || null;
}

function getLatestMilestoneForUser(contract, userId) {
  const normalizedUserId = String(userId || "");
  if (!normalizedUserId) return null;

  return [...(Array.isArray(contract?.milestones) ? contract.milestones : [])]
    .filter((milestone) => {
      const assignedTo = getPersonId(milestone?.assignedTo);
      const submittedBy = getPersonId(milestone?.submittedBy);
      return String(assignedTo || submittedBy || "") === normalizedUserId;
    })
    .sort((left, right) => new Date(right.updatedAt || right.createdAt || 0) - new Date(left.updatedAt || left.createdAt || 0))[0] || null;
}

function isReviewableMilestone(milestone) {
  if (!milestone) return false;

  const workStatus = String(milestone?.workStatus || milestone?.status || "").toLowerCase();
  const paymentStatus = String(milestone?.paymentStatus || "").toLowerCase();
  return ["approved", "completed"].includes(workStatus) && paymentStatus === "released";
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeSortKey(value) {
  const key = String(value || "newest").replace(/-/g, "_").toLowerCase();
  const aliases = {
    highestrated: "highest_rated",
    highest_rating: "highest_rated",
    mostreviewed: "most_reviewed",
    most_completed: "most_completed_contracts",
    mostcompletedcontracts: "most_completed_contracts",
  };
  return aliases[key] || key;
}

function isFinalizedContract(contract) {
  const metadata = contract?.metadata || {};
  return Boolean(
    contract?.completedAt ||
      contract?.finalApprovedAt ||
      metadata?.disputePaymentReleasedAt ||
      metadata?.disputeOutcome === "release_full_payment"
  );
}

function normalizeContractCompletionState(contract) {
  if (!contract) return contract;
  const payload = contract?.toObject ? contract.toObject() : { ...contract };
  if (isFinalizedContract(payload)) {
    payload.status = CONTRACT_STATUSES.COMPLETED;
    payload.escrowStatus = ESCROW_STATUSES.RELEASED;
  }
  return payload;
}

export class ContractService {
  async attachMultiWorkerInfo(contracts) {
    const list = Array.isArray(contracts) ? contracts : [contracts];
    const contractIds = list.map((contract) => contract?._id).filter(Boolean);
    if (!contractIds.length) return contracts;

    const acceptedApplications = await ContractApplication.find({
      contractId: { $in: contractIds },
      status: { $in: ["accepted", "approved", "active", "in_progress"] },
    }).populate("hustlerId", "name firstName lastName email avatar");

    const applicationsByContract = acceptedApplications.reduce((acc, application) => {
      const id = application.contractId?.toString();
      if (!id) return acc;
      if (!acc[id]) acc[id] = [];
      acc[id].push(application);
      return acc;
    }, {});

    const enriched = list.map((contract) => {
      const payload = contract?.toObject ? contract.toObject() : { ...contract };
      const acceptedForContract = applicationsByContract[payload._id?.toString()] || [];
      const acceptedHustlers = acceptedForContract.map((application) => {
        const hustler = application.hustlerId;
        return {
          _id: hustler?._id || hustler,
          id: hustler?._id || hustler,
          name: getDisplayName(hustler),
          firstName: hustler?.firstName,
          lastName: hustler?.lastName,
          email: hustler?.email,
          avatar: hustler?.avatar,
          acceptedAt: application.reviewedAt,
          applicationId: application._id,
        };
      });
      const assignedHustlers = acceptedHustlers.length
        ? acceptedHustlers
        : payload.seller
          ? [{
              _id: payload.seller?._id || payload.seller,
              id: payload.seller?._id || payload.seller,
              name: getDisplayName(payload.seller),
              firstName: payload.seller?.firstName,
              lastName: payload.seller?.lastName,
              email: payload.seller?.email,
              avatar: payload.seller?.avatar,
            }]
          : [];
      const workerSlots = Math.max(1, Number(payload.numWorkers) || 1);
      const payoutCount = assignedHustlers.length || (payload.seller ? 1 : 0);
      const splitCount = Math.max(workerSlots, payoutCount, 1);
      const grossPerHustler = Number((Number(payload.amount || 0) / splitCount).toFixed(2));
      const commissionPerHustler = Number((grossPerHustler * HUSTLER_COMMISSION_RATE).toFixed(2));
      const netPerHustler = Number((grossPerHustler - commissionPerHustler).toFixed(2));

      payload.acceptedHustlers = acceptedHustlers;
      payload.assignedHustlers = assignedHustlers;
      payload.workerSlots = workerSlots;
      payload.payoutSummary = {
        workerSlots,
        acceptedCount: assignedHustlers.length,
        pendingSlots: Math.max(0, workerSlots - assignedHustlers.length),
        splitCount,
        grossPerHustler,
        commissionRate: HUSTLER_COMMISSION_RATE,
        commissionPerHustler,
        netPerHustler,
        currency: payload.currency || "KSH",
        isMultiWorker: workerSlots > 1,
      };
      return payload;
    });

    return Array.isArray(contracts) ? enriched : enriched[0];
  }

  async attachReviewEligibility(contracts, actorId = null) {
    const list = Array.isArray(contracts) ? contracts : [contracts];
    const contractIds = list.map((contract) => contract?._id).filter(Boolean);
    if (!contractIds.length) return contracts;

    const reviewerId = actorId?.toString();
    const existingReviews = reviewerId
      ? await Review.find({
          contract: { $in: contractIds },
          reviewer: reviewerId,
        }).select("contract reviewee")
      : [];

    const reviewedByContract = existingReviews.reduce((acc, review) => {
      const contractId = review.contract?.toString();
      const revieweeId = review.reviewee?.toString();
      if (!acc[contractId]) {
        acc[contractId] = {};
      }
      acc[contractId][revieweeId] = review;
      return acc;
    }, {});

    const enriched = list.map((contract) => {
      const payload = contract?.toObject ? contract.toObject() : { ...contract };
      const isCompleted = payload.status === CONTRACT_STATUSES.COMPLETED;
      const isPaymentReleased = payload.escrowStatus === ESCROW_STATUSES.RELEASED;
      const buyerId = payload.buyer?._id || payload.buyer;
      const acceptedHustlers = Array.isArray(payload.acceptedHustlers) ? payload.acceptedHustlers : [];
      const hustlers = acceptedHustlers.length
        ? acceptedHustlers
        : payload.seller
          ? [{ _id: payload.seller?._id || payload.seller, ...((typeof payload.seller === "object" && payload.seller) || {}) }]
          : [];

      const isManager = sameId(buyerId, reviewerId);
      const isHustler = hustlers.some((hustler) => sameId(hustler._id || hustler.id, reviewerId));
      const reviewedTargets = reviewedByContract[payload._id?.toString()] || {};
      const reviewTargets = isManager
        ? hustlers.map((hustler) => ({
            _id: hustler._id || hustler.id,
            id: hustler._id || hustler.id,
            name: getDisplayName(hustler),
            role: USER_ROLES.HUSTLER,
          }))
        : isHustler && buyerId
          ? [{
              _id: buyerId,
              id: buyerId,
              name: getDisplayName(payload.buyer),
              role: USER_ROLES.MANAGER,
            }]
          : [];

      const globallyReviewable = isCompleted && isPaymentReleased;
      const reviewContextMilestone = isManager
        ? null
        : getLatestMilestoneForUser(payload, reviewerId);

      let reviewBlockedReason = null;
      if (!reviewerId) reviewBlockedReason = "Authentication is required to review this contract";
      else if (!isManager && !isHustler) reviewBlockedReason = "Only contract participants can review this contract";
      else if (!reviewTargets.length) reviewBlockedReason = "No eligible review recipient is available for this contract";

      const reviewTargetsWithStatus = reviewTargets.map((target) => {
        const targetReview = reviewedTargets[target._id?.toString()];
        const targetMilestone = isManager ? getLatestMilestoneForUser(payload, target._id) : reviewContextMilestone;
        const targetReviewable = globallyReviewable || isReviewableMilestone(targetMilestone);
        return {
          ...target,
          reviewed: Boolean(targetReview),
          reviewId: targetReview?._id || null,
          reviewable: targetReviewable,
        };
      });

      const pendingReviewTargets = reviewTargetsWithStatus.filter((target) => target.reviewable && !target.reviewed);
      const hasAnyReviewed = reviewTargetsWithStatus.some((target) => target.reviewed);
      const hasAllReviewed = reviewTargetsWithStatus.length > 0 && reviewTargetsWithStatus.every((target) => target.reviewed || !target.reviewable);

      if (!reviewBlockedReason && !reviewTargetsWithStatus.some((target) => target.reviewable)) {
        reviewBlockedReason = "Reviews are only available after the specific worker submission has been approved and paid";
      }

      payload.reviewEligibility = {
        canReview: !reviewBlockedReason && pendingReviewTargets.length > 0,
        isCompleted,
        isPaymentReleased,
        hasReviewed: hasAllReviewed,
        hasAnyReviewed,
        blockedReason: reviewBlockedReason,
        targets: reviewBlockedReason ? [] : reviewTargetsWithStatus,
        pendingTargets: reviewBlockedReason ? [] : pendingReviewTargets,
      };

      return payload;
    });

    return Array.isArray(contracts) ? enriched : enriched[0];
  }

  resolveContractPaymentType(input) {
    if (Object.values(CONTRACT_PAYMENT_TYPES).includes(input.paymentType)) return input.paymentType;
    if (input.paymentStructure === "stages" || input.contractType === CONTRACT_PAYMENT_TYPES.STAGED || (Array.isArray(input.milestones) && input.milestones.length)) {
      return CONTRACT_PAYMENT_TYPES.STAGED;
    }
    return CONTRACT_PAYMENT_TYPES.SINGLE;
  }

  resolvePaymentRateType(input) {
    if (Object.values(PAYMENT_RATE_TYPES).includes(input.paymentRateType)) return input.paymentRateType;
    if (Object.values(PAYMENT_RATE_TYPES).includes(input.paymentType)) return input.paymentType;
    return PAYMENT_RATE_TYPES.FIXED;
  }

  async createContract(input, userId = null) {
    // Idempotency guard: if frontend provides a contractId and a contract already exists, return it
    if (input.contractId) {
      const existing = await Contract.findOne({ contractId: input.contractId });
      if (existing) {
        logger.info("Contract creation requested but existing contract found", { contractId: input.contractId, existingId: existing._id });
        return existing;
      }
    }

    const managerId = input.buyer || userId;
    if (managerId) {
      const manager = await User.findById(managerId).select("idNumber mpesaNumber");
      if (!manager) throw new ApiError(HTTP_STATUS.NOT_FOUND, "User not found");
      requireIdentityVerification(manager, "create a contract");
    }

    const contractPaymentType = this.resolveContractPaymentType(input);
    const paymentRateType = this.resolvePaymentRateType(input);

    const contract = new Contract({
      contractId: input.contractId,
      title: input.title,
      description: input.description,
      contractType: contractPaymentType,
      paymentType: contractPaymentType,
      paymentRateType,
      buyer: input.buyer || userId,
      seller: input.seller,
      amount: input.amount,
      currency: input.currency || "KSH",
      numWorkers: input.numWorkers || 1,
      paymentMethod: input.paymentMethod,
      jobCategory: input.jobCategory,
      workLocation: input.workLocation,
      startDate: input.startDate ? new Date(input.startDate) : null,
      completionDate: input.completionDate ? new Date(input.completionDate) : null,
      dueDate: input.completionDate ? new Date(input.completionDate) : null,
    });

    // Create milestones if provided
    if (Array.isArray(input.milestones) && input.milestones.length > 0) {
      const milestones = await Promise.all(
        input.milestones.map((m) =>
          Milestone.create({
            contract: contract._id,
            title: m.title,
            description: m.description,
            amount: m.amount,
            status: MILESTONE_STATUSES.PENDING,
          })
        )
      );
      contract.milestones = milestones.map((m) => m._id);
    }

    await contract.save();
    logger.info("Contract created", { contractId: contract._id });
    notifications.emit("contract.created", { contract });
    return contract;
  }

  async updateContract(contractId, input, actorId) {
    const contract = await Contract.findById(contractId);
    if (!contract) throw new ApiError(HTTP_STATUS.NOT_FOUND, "Contract not found");
    if (contract.buyer?.toString() !== actorId?.toString()) {
      throw new ApiError(HTTP_STATUS.FORBIDDEN, "Only the contract manager can edit this contract");
    }
    const manager = await User.findById(actorId).select("idNumber mpesaNumber");
    if (!manager) throw new ApiError(HTTP_STATUS.NOT_FOUND, "User not found");
    requireIdentityVerification(manager, "edit a contract");
    if (contract.seller || contract.escrowPrepared || contract.escrowWallet) {
      throw new ApiError(HTTP_STATUS.CONFLICT, "Assigned or funded contracts cannot be edited");
    }

    const editableStatuses = [CONTRACT_STATUSES.PENDING, CONTRACT_STATUSES.APPLIED, CONTRACT_STATUSES.REJECTED, CONTRACT_STATUSES.CANCELLED];
    if (!editableStatuses.includes(contract.status)) {
      throw new ApiError(HTTP_STATUS.CONFLICT, "Contract cannot be edited in its current state");
    }

    const contractPaymentType = this.resolveContractPaymentType(input);
    const paymentRateType = this.resolvePaymentRateType(input);

    contract.title = input.title;
    contract.description = input.description;
    contract.amount = input.amount;
    contract.currency = input.currency || contract.currency || "KSH";
    contract.contractType = contractPaymentType;
    contract.paymentType = contractPaymentType;
    contract.paymentRateType = paymentRateType;
    contract.numWorkers = input.numWorkers || 1;
    contract.jobCategory = input.jobCategory;
    contract.workLocation = input.workLocation;
    contract.startDate = input.startDate ? new Date(input.startDate) : null;
    contract.completionDate = input.completionDate ? new Date(input.completionDate) : null;
    contract.dueDate = input.completionDate ? new Date(input.completionDate) : null;

    await Milestone.deleteMany({ contract: contract._id });
    const milestoneInputs = contractPaymentType === CONTRACT_PAYMENT_TYPES.STAGED
      ? input.milestones || []
      : [{ title: "Job Completion", description: "Complete the full job and mark as done", amount: input.amount }];

    const milestones = await Promise.all(
      milestoneInputs.map((m) =>
        Milestone.create({
          contract: contract._id,
          title: m.title,
          description: m.description,
          amount: m.amount,
          status: MILESTONE_STATUSES.PENDING,
        })
      )
    );
    contract.milestones = milestones.map((m) => m._id);

    await contract.save();
    logger.info("Contract updated", { contractId: contract._id });
    notifications.emit("contract.updated", { contract });
    return contract.populate("milestones");
  }

  async assignContract(contractId, freelancerId) {
    const contract = await Contract.findById(contractId);
    if (!contract) throw new ApiError(HTTP_STATUS.NOT_FOUND, "Contract not found");
    if (![CONTRACT_STATUSES.PENDING, CONTRACT_STATUSES.APPLIED].includes(contract.status)) {
      throw new ApiError(HTTP_STATUS.CONFLICT, "Contract cannot be assigned in its current state");
    }
    contract.seller = freelancerId;
    contract.status = CONTRACT_STATUSES.ASSIGNED;
    contract.escrowStatus = ESCROW_STATUSES.WAITING_FOR_FUNDING;
    contract.escrowPrepared = false;
    contract.startDate = new Date();
    await contract.save();
    notifications.emit("contract.assigned", { contract });
    return contract;
  }

  async prepareEscrow(contractId, amount, actorId) {
    const manager = await User.findById(actorId).select("idNumber mpesaNumber");
    if (!manager) throw new ApiError(HTTP_STATUS.NOT_FOUND, "User not found");
    requireIdentityVerification(manager, "fund escrow");

    const result = await escrowService.reserveEscrow(contractId, actorId, amount);
    return result.contract;
  }

  async finalApproveContract(contractId, managerId) {
    const manager = await User.findById(managerId).select("idNumber mpesaNumber");
    if (!manager) throw new ApiError(HTTP_STATUS.NOT_FOUND, "User not found");
    requireIdentityVerification(manager, "release payment");

    const contract = await Contract.findById(contractId).populate("milestones");
    if (!contract) throw new ApiError(HTTP_STATUS.NOT_FOUND, "Contract not found");
    if (contract.buyer?.toString() !== managerId?.toString()) {
      throw new ApiError(HTTP_STATUS.FORBIDDEN, "Only the contract manager can final approve this contract");
    }
    if (!contract.escrowPrepared) {
      contract.escrowStatus = ESCROW_STATUSES.WAITING_FOR_FUNDING;
      await contract.save();
      throw new ApiError(HTTP_STATUS.CONFLICT, "Escrow must be funded before final approval");
    }
    if (!contract.seller) {
      throw new ApiError(HTTP_STATUS.CONFLICT, "Contract must have an assigned hustler before final approval");
    }

    const milestones = Array.isArray(contract.milestones) ? contract.milestones : [];
    if (!milestones.length) {
      throw new ApiError(HTTP_STATUS.CONFLICT, "Contract must have completed work before final approval");
    }

    const paymentType = contract.paymentType || contract.contractType || CONTRACT_PAYMENT_TYPES.SINGLE;
    const allStagesApproved = milestones.every((m) => m.status === MILESTONE_STATUSES.APPROVED);
    const finalWorkApproved = milestones.some((m) => m.status === MILESTONE_STATUSES.APPROVED);

    if (paymentType === CONTRACT_PAYMENT_TYPES.STAGED && !allStagesApproved) {
      contract.escrowStatus = ESCROW_STATUSES.IN_PROGRESS;
      await contract.save();
      throw new ApiError(HTTP_STATUS.CONFLICT, "All stages must be approved before final contract approval");
    }

    if (paymentType === CONTRACT_PAYMENT_TYPES.SINGLE && !finalWorkApproved) {
      contract.escrowStatus = ESCROW_STATUSES.AWAITING_APPROVAL;
      await contract.save();
      throw new ApiError(HTTP_STATUS.CONFLICT, "Final work must be approved before payment release");
    }

    const result = await escrowService.releaseContractEscrow(contract._id, managerId);
    return result.contract;
  }

  async closeContract(contractId, closingInfo = {}) {
    const contract = await Contract.findById(contractId);
    if (!contract) throw new ApiError(HTTP_STATUS.NOT_FOUND, "Contract not found");
    // Allow close only if active or paused
    if (![CONTRACT_STATUSES.ACTIVE, CONTRACT_STATUSES.PAUSED].includes(contract.status)) {
      throw new ApiError(HTTP_STATUS.CONFLICT, "Contract cannot be closed in its current state");
    }
    contract.status = CONTRACT_STATUSES.COMPLETED;
    contract.completedAt = new Date();
    contract.metadata = { ...contract.metadata, closedBy: closingInfo.closedBy || null };
    await contract.save();
    notifications.emit("contract.closed", { contract });
    return contract;
  }

  async cancelContract(contractId, reason) {
    const contract = await Contract.findById(contractId);
    if (!contract) throw new ApiError(HTTP_STATUS.NOT_FOUND, "Contract not found");
    contract.status = CONTRACT_STATUSES.CANCELLED;
    contract.cancelledAt = new Date();
    contract.metadata = { ...contract.metadata, cancelledReason: reason };
    await contract.save();
    notifications.emit("contract.cancelled", { contract });
    return contract;
  }

  async approveContract(contractId, managerId) {
    const contract = await Contract.findById(contractId);
    if (!contract) throw new ApiError(HTTP_STATUS.NOT_FOUND, "Contract not found");

    // Prevent approving terminal states
    if ([CONTRACT_STATUSES.CANCELLED, CONTRACT_STATUSES.COMPLETED, CONTRACT_STATUSES.TERMINATED].includes(contract.status)) {
      throw new ApiError(HTTP_STATUS.CONFLICT, "Contract cannot be approved in its current state");
    }

    contract.status = CONTRACT_STATUSES.APPROVED;
    contract.metadata = { ...contract.metadata, approvedBy: managerId, approvedAt: new Date() };
    await contract.save();
    notifications.emit("contract.approved", { contract });
    return contract;
  }

  async rejectContract(contractId, managerId, reason = null) {
    const contract = await Contract.findById(contractId);
    if (!contract) throw new ApiError(HTTP_STATUS.NOT_FOUND, "Contract not found");

    if ([CONTRACT_STATUSES.CANCELLED, CONTRACT_STATUSES.COMPLETED, CONTRACT_STATUSES.TERMINATED].includes(contract.status)) {
      throw new ApiError(HTTP_STATUS.CONFLICT, "Contract cannot be rejected in its current state");
    }

    contract.status = CONTRACT_STATUSES.REJECTED;
    contract.metadata = { ...contract.metadata, rejectedBy: managerId, rejectedAt: new Date(), rejectionReason: reason };
    await contract.save();
    notifications.emit("contract.rejected", { contract });
    return contract;
  }

  async deleteDraftContract(contractId, actorId) {
    const contract = await Contract.findById(contractId);
    if (!contract) throw new ApiError(HTTP_STATUS.NOT_FOUND, "Contract not found");
    if (contract.buyer?.toString() !== actorId?.toString()) {
      throw new ApiError(HTTP_STATUS.FORBIDDEN, "Only the contract manager can delete this contract");
    }
    if (contract.seller || contract.escrowPrepared || contract.escrowWallet) {
      throw new ApiError(HTTP_STATUS.CONFLICT, "Assigned or funded contracts cannot be deleted");
    }
    const deletableStatuses = [CONTRACT_STATUSES.PENDING, CONTRACT_STATUSES.APPLIED, CONTRACT_STATUSES.REJECTED, CONTRACT_STATUSES.CANCELLED];
    if (!deletableStatuses.includes(contract.status)) {
      throw new ApiError(HTTP_STATUS.CONFLICT, "Only unapproved and unassigned contracts can be deleted");
    }

    await Milestone.deleteMany({ contract: contract._id });
    await ContractApplication.deleteMany({ contractId: contract._id });
    await Contract.deleteOne({ _id: contract._id });
    notifications.emit("contract.deleted", { contract });
    return contract;
  }

  async getContract(contractId, actorId = null) {
    const contractDoc = await Contract.findById(contractId).populate("buyer seller");
    if (!contractDoc) {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, "Contract not found");
    }

    const baseContract = contractDoc.toObject();

    try {
      const milestones = await Milestone.find({ contract: contractDoc._id })
        .sort({ createdAt: 1 })
        .populate("assignedTo", "name firstName lastName email");

      const contract = {
        ...baseContract,
        milestones: milestones.map((milestone) => (milestone.toObject ? milestone.toObject() : milestone)),
      };

      let normalizedContract = contract;
      try {
        const enrichedContract = await this.attachMultiWorkerInfo(contract);
        const withReviews = await this.attachReviewEligibility(enrichedContract, actorId);
        normalizedContract = normalizeContractCompletionState(withReviews);
      } catch (error) {
        logger.warn("Falling back to base contract payload for getContract enrichment", {
          contractId: contractDoc._id?.toString(),
          error: error?.message,
        });
        normalizedContract = normalizeContractCompletionState(contract);
      }

      const actorStringId = actorId ? String(actorId) : null;
      const assignedHustlers = Array.isArray(normalizedContract.assignedHustlers) ? normalizedContract.assignedHustlers : [];
      const acceptedHustlers = Array.isArray(normalizedContract.acceptedHustlers) ? normalizedContract.acceptedHustlers : [];
      const contractMilestones = Array.isArray(normalizedContract.milestones) ? normalizedContract.milestones : [];
      const participantIds = new Set(
        [
          contractDoc.buyer?._id || contractDoc.buyer?.id || contractDoc.buyer,
          contractDoc.seller?._id || contractDoc.seller?.id || contractDoc.seller,
          ...((assignedHustlers.length ? assignedHustlers : acceptedHustlers).map((worker) => worker?._id || worker?.id || worker)),
          ...contractMilestones
            .map((milestone) => [
              milestone?.assignedTo?._id || milestone?.assignedTo?.id || milestone?.assignedTo,
              milestone?.submittedBy?._id || milestone?.submittedBy?.id || milestone?.submittedBy,
            ])
            .flat(),
        ]
          .map((value) => (value ? String(value) : null))
          .filter(Boolean)
      );

      const actorDispute = actorId
        ? await Dispute.findOne({
            contract: contractDoc._id,
            raisedBy: actorId,
          })
            .sort({ createdAt: -1 })
            .select("_id")
            .lean()
        : null;

      return {
        ...normalizedContract,
        userCanOpenDispute:
          Boolean(
            actorStringId &&
              participantIds.has(actorStringId) &&
              ["pending", "applied", "assigned", "approved", "active"].includes(String(normalizedContract.status || "").toLowerCase())
          ) || Boolean(normalizedContract.userDisputeId || actorDispute?._id),
        userDisputeId: actorDispute?._id || null,
      };
    } catch (error) {
      logger.error("getContract fallback used", { contractId, actorId, error: error?.message });
      return {
        ...baseContract,
        buyer: contractDoc.buyer || baseContract.buyer || null,
        seller: contractDoc.seller || baseContract.seller || null,
        milestones: [],
        assignedHustlers: [],
        acceptedHustlers: [],
        userCanOpenDispute: false,
        userDisputeId: null,
      };
    }
  }

  normalizeAggregateFilter(filter = {}) {
    const match = { ...filter };
    ["buyer", "seller", "appliedBy"].forEach((field) => {
      if (match[field] && Types.ObjectId.isValid(match[field])) {
        match[field] = new Types.ObjectId(match[field]);
      }
    });
    return match;
  }

  buildDiscoverySort(sortBy) {
    const sortOptions = {
      highest_rated: { "buyer.averageRating": -1, "buyer.totalReviews": -1, createdAt: -1 },
      most_reviewed: { "buyer.totalReviews": -1, "buyer.averageRating": -1, createdAt: -1 },
      newest: { createdAt: -1 },
      most_completed_contracts: { "buyer.completedContracts": -1, "buyer.averageRating": -1, createdAt: -1 },
    };
    return sortOptions[normalizeSortKey(sortBy)] || sortOptions.newest;
  }

  hasDiscoveryOptions(options = {}) {
    return Boolean(options.sortBy || options.minRating !== undefined || options.verified === "true" || options.verifiedUsers === "true" || options.skills);
  }

  async listContractsWithDiscovery(filter = {}, options = {}) {
    const pipeline = [
      { $match: this.normalizeAggregateFilter(filter) },
      {
        $lookup: {
          from: "users",
          localField: "buyer",
          foreignField: "_id",
          as: "buyer",
        },
      },
      { $unwind: { path: "$buyer", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "users",
          localField: "seller",
          foreignField: "_id",
          as: "seller",
        },
      },
      { $unwind: { path: "$seller", preserveNullAndEmptyArrays: true } },
    ];

    if (options.minRating !== undefined) {
      pipeline.push({ $match: { "buyer.averageRating": { $gte: Number(options.minRating) || 0 } } });
    }

    if (options.verified === "true" || options.verifiedUsers === "true") {
      pipeline.push({ $match: { "buyer.isEmailVerified": true } });
    }

    if (options.skills) {
      const skillList = String(options.skills)
        .split(",")
        .map((skill) => skill.trim())
        .filter(Boolean);
      if (skillList.length) {
        pipeline.push({
          $match: {
            "buyer.skills": { $in: skillList.map((skill) => new RegExp(`^${escapeRegex(skill)}$`, "i")) },
          },
        });
      }
    }

    pipeline.push(
      { $sort: this.buildDiscoverySort(options.sortBy) },
      { $skip: Number(options.skip) || 0 },
      { $limit: Math.min(Number(options.limit) || 20, 100) }
    );

    return Contract.aggregate(pipeline);
  }

  async listContracts(filter = {}, options = {}, actorId = null) {
    try {
      const normalizedFilter = this.normalizeAggregateFilter(filter);
      if (this.hasDiscoveryOptions(options)) {
        const contracts = await this.listContractsWithDiscovery(normalizedFilter, options);
        const enrichedContracts = await this.attachMultiWorkerInfo(contracts);
        const withReviews = await this.attachReviewEligibility(enrichedContracts, actorId);
        return Array.isArray(withReviews)
          ? withReviews.map((contract) => normalizeContractCompletionState(contract))
          : normalizeContractCompletionState(withReviews);
      }

      const q = Contract.find(normalizedFilter).sort({ updatedAt: -1, createdAt: -1 });
      if (options.limit) q.limit(options.limit);
      if (options.skip) q.skip(options.skip);
      const contracts = await q.populate("buyer seller");
      const contractIds = contracts.map((contract) => contract?._id).filter(Boolean);
      const milestones = contractIds.length
        ? await Milestone.find({ contract: { $in: contractIds } })
            .sort({ createdAt: 1 })
            .populate("assignedTo", "name firstName lastName email")
            .lean()
        : [];
      const milestonesByContract = milestones.reduce((accumulator, milestone) => {
        const key = String(milestone.contract || "");
        if (!key) return accumulator;
        if (!accumulator[key]) accumulator[key] = [];
        accumulator[key].push(milestone);
        return accumulator;
      }, {});
      const contractsWithMilestones = contracts.map((contract) => {
        const payload = contract?.toObject ? contract.toObject() : { ...contract };
        payload.milestones = milestonesByContract[String(payload._id)] || [];
        return payload;
      });
      const enrichedContracts = await this.attachMultiWorkerInfo(contractsWithMilestones);
      const withReviews = await this.attachReviewEligibility(enrichedContracts, actorId);
      return Array.isArray(withReviews)
        ? withReviews.map((contract) => normalizeContractCompletionState(contract))
        : normalizeContractCompletionState(withReviews);
    } catch (error) {
      logger.warn("Falling back to base listContracts payload", {
        error: error?.message,
        actorId,
      });
      try {
        const normalizedFilter = this.normalizeAggregateFilter(filter);
        const contracts = await Contract.aggregate([
          { $match: normalizedFilter },
          {
            $lookup: {
              from: "users",
              localField: "buyer",
              foreignField: "_id",
              as: "buyer",
            },
          },
          { $unwind: { path: "$buyer", preserveNullAndEmptyArrays: true } },
          {
            $lookup: {
              from: "users",
              localField: "seller",
              foreignField: "_id",
              as: "seller",
            },
          },
          { $unwind: { path: "$seller", preserveNullAndEmptyArrays: true } },
          { $sort: { updatedAt: -1, createdAt: -1 } },
          { $skip: Number(options.skip) || 0 },
          { $limit: Math.min(Number(options.limit) || 20, 100) },
        ]);
        const enriched = await this.attachMultiWorkerInfo(contracts);
        const withReviews = await this.attachReviewEligibility(enriched, actorId);
        return Array.isArray(withReviews)
          ? withReviews.map((contract) => normalizeContractCompletionState(contract))
          : normalizeContractCompletionState(withReviews);
      } catch (fallbackError) {
        logger.error("listContracts aggregate fallback failed", {
          error: fallbackError?.message,
          actorId,
        });
        return [];
      }
    }
  }
}

export const contractService = new ContractService();

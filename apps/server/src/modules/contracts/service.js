/**
 * Contracts Service
 * Business logic for contract operations
 */

import { Contract } from "./model.js";
import { Milestone } from "../milestones/model.js";
import ContractApplication from "../applications/model.js";
import { ApiError } from "../../shared/middleware/errorHandler.js";
import {
  CONTRACT_PAYMENT_TYPES,
  CONTRACT_STATUSES,
  ESCROW_STATUSES,
  HTTP_STATUS,
  MILESTONE_STATUSES,
  PAYMENT_RATE_TYPES,
} from "../../shared/config/constants.js";
import { logger } from "../../shared/utils/logger.js";
import { notifications } from "../../shared/utils/notifications.js";
import { escrowService } from "../escrow/index.js";

export class ContractService {
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
    const result = await escrowService.reserveEscrow(contractId, actorId, amount);
    return result.contract;
  }

  async finalApproveContract(contractId, managerId) {
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

  async getContract(contractId) {
    return Contract.findById(contractId).populate("milestones").populate("buyer seller");
  }

  async listContracts(filter = {}, options = {}) {
    const q = Contract.find(filter).sort({ updatedAt: -1, createdAt: -1 });
    if (options.limit) q.limit(options.limit);
    if (options.skip) q.skip(options.skip);
    return q.populate("buyer seller");
  }
}

export const contractService = new ContractService();

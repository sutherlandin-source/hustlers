import { Contract } from "../models/Contract.js";
import { Milestone } from "../models/Milestone.js";
import { ApiError } from "../middleware/errorHandler.js";
import { HTTP_STATUS, CONTRACT_STATUSES, MILESTONE_STATUSES } from "../config/constants.js";
import { logger } from "../utils/logger.js";
import { notifications } from "../utils/notifications.js";
import { financialService } from "./financialService.js";

export class ContractService {
  async createContract(input, userId = null) {
    const contract = new Contract({
      contractId: input.contractId,
      title: input.title,
      description: input.description,
      buyer: input.buyer || userId,
      seller: input.seller,
      amount: input.amount,
      currency: input.currency || "KSH",
      numWorkers: input.numWorkers || 1,
      paymentMethod: input.paymentMethod,
      jobCategory: input.jobCategory,
      workLocation: input.workLocation,
      paymentType: input.paymentType || "fixed",
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

  async assignContract(contractId, freelancerId) {
    const contract = await Contract.findById(contractId);
    if (!contract) throw new ApiError(HTTP_STATUS.NOT_FOUND, "Contract not found");
    if (contract.status !== CONTRACT_STATUSES.PENDING && contract.status !== CONTRACT_STATUSES.DRAFT) {
      throw new ApiError(HTTP_STATUS.CONFLICT, "Contract cannot be assigned in its current state");
    }
    contract.seller = freelancerId;
    contract.status = CONTRACT_STATUSES.ACTIVE;
    contract.startDate = new Date();
    await contract.save();
    notifications.emit("contract.assigned", { contract });
    return contract;
  }

  async prepareEscrow(contractId, amount, actorId) {
    const result = await financialService.reserveEscrow(contractId, actorId, amount);
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

  async getContract(contractId) {
    return Contract.findById(contractId).populate("milestones").populate("buyer seller");
  }

  async listContracts(filter = {}, options = {}) {
    const q = Contract.find(filter).sort({ createdAt: -1 });
    if (options.limit) q.limit(options.limit);
    if (options.skip) q.skip(options.skip);
    return q.populate("buyer seller");
  }
}

export const contractService = new ContractService();

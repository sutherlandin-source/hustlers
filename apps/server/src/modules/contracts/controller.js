/**
 * Contracts Controller
 * Handles contract-related HTTP requests
 */

import { contractService } from "./service.js";
import { SUCCESS_MESSAGES } from "../../shared/config/constants.js";

function buildResponse(res, status, message, data = {}) {
  return res.status(status).json({ success: status >= 200 && status < 300, message, data, timestamp: new Date().toISOString() });
}

export async function createContract(req, res, next) {
  try {
    const contract = await contractService.createContract(req.body, req.user?.userId);
    return buildResponse(res, 201, SUCCESS_MESSAGES.CREATED, { contract });
  } catch (err) {
    next(err);
  }
}

export async function updateContract(req, res, next) {
  try {
    const { id } = req.params;
    const contract = await contractService.updateContract(id, req.body, req.user?.userId);
    return buildResponse(res, 200, "Contract updated", { contract });
  } catch (err) {
    next(err);
  }
}

export async function assignContract(req, res, next) {
  try {
    const { id } = req.params;
    const { freelancerId } = req.body;
    const contract = await contractService.assignContract(id, freelancerId);
    return buildResponse(res, 200, "Contract assigned", { contract });
  } catch (err) {
    next(err);
  }
}

export async function prepareEscrow(req, res, next) {
  try {
    const { id } = req.params;
    const { amount } = req.body;
    const contract = await contractService.prepareEscrow(id, amount, req.user.userId);
    return buildResponse(res, 200, "Escrow prepared", { contract });
  } catch (err) {
    next(err);
  }
}

export async function finalApproveContract(req, res, next) {
  try {
    const { id } = req.params;
    const contract = await contractService.finalApproveContract(id, req.user.userId);
    return buildResponse(res, 200, "Final approval complete. Escrow payment released.", { contract });
  } catch (err) {
    next(err);
  }
}

export async function closeContract(req, res, next) {
  try {
    const { id } = req.params;
    const result = await contractService.closeContract(id, { closedBy: req.user?.userId });
    return buildResponse(res, 200, "Contract closed", { contract: result });
  } catch (err) {
    next(err);
  }
}

export async function approveContract(req, res, next) {
  try {
    const { id } = req.params;
    const contract = await contractService.approveContract(id, req.user?.userId);
    return buildResponse(res, 200, "Contract approved", { contract });
  } catch (err) {
    next(err);
  }
}

export async function rejectContract(req, res, next) {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const contract = await contractService.rejectContract(id, req.user?.userId, reason);
    return buildResponse(res, 200, "Contract rejected", { contract });
  } catch (err) {
    next(err);
  }
}

export async function deleteContract(req, res, next) {
  try {
    const { id } = req.params;
    const contract = await contractService.deleteDraftContract(id, req.user?.userId);
    return buildResponse(res, 200, "Contract deleted", { contract });
  } catch (err) {
    next(err);
  }
}

export async function getContract(req, res, next) {
  try {
    const { id } = req.params;
    const contract = await contractService.getContract(id);
    return buildResponse(res, 200, "Contract retrieved", { contract });
  } catch (err) {
    next(err);
  }
}

export async function listContracts(req, res, next) {
  try {
    const filter = {};
    if (req.query.sellerId) filter.seller = req.query.sellerId;
    if (req.query.buyerId) filter.buyer = req.query.buyerId;
    if (req.query.status) filter.status = req.query.status;
    const options = { limit: parseInt(req.query.limit) || 20, skip: parseInt(req.query.skip) || 0 };
    const contracts = await contractService.listContracts(filter, options);
    return buildResponse(res, 200, "Contracts list", { contracts });
  } catch (err) {
    next(err);
  }
}

export async function listMyContracts(req, res, next) {
  try {
    const filter = { appliedBy: req.user?.userId };
    if (req.query.status) filter.status = req.query.status;
    const options = { limit: parseInt(req.query.limit) || 20, skip: parseInt(req.query.skip) || 0 };
    const contracts = await contractService.listContracts(filter, options);
    return buildResponse(res, 200, "My applied contracts", { contracts });
  } catch (err) {
    next(err);
  }
}

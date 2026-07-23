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
    const contract = await contractService.getContract(id, req.user?.userId);
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

    // sellerOnly=true → scope to contracts where the calling hustler is the seller
    // OR has an accepted application (multi-worker contracts)
    if (req.query.sellerOnly === "true" && req.user?.userId) {
      const hustlerId = req.user.userId;

      // Fetch contract IDs from accepted applications for this hustler
      let acceptedContractIds = [];
      try {
        const ContractApplication = (await import("../applications/model.js")).default;
        const acceptedApps = await ContractApplication.find({
          hustlerId,
          status: { $in: ["accepted", "approved", "active", "in_progress"] },
        }).select("contractId").lean();
        acceptedContractIds = acceptedApps.map((app) => String(app.contractId)).filter(Boolean);
      } catch (_) {
        // non-fatal — fall back to seller-only filter
      }

      if (acceptedContractIds.length > 0) {
        // Combine: seller match OR accepted application
        filter.$or = [
          { seller: hustlerId },
          { _id: { $in: acceptedContractIds } },
        ];
      } else {
        filter.seller = hustlerId;
      }
    }

    const options = {
      limit: parseInt(req.query.limit) || 20,
      skip: parseInt(req.query.skip) || 0,
      sortBy: req.query.sortBy,
      minRating: req.query.minRating,
      verified: req.query.verified,
      verifiedUsers: req.query.verifiedUsers,
      skills: req.query.skills,
    };
    const contracts = await contractService.listContracts(filter, options, req.user?.userId);
    return buildResponse(res, 200, "Contracts list", { contracts });
  } catch (err) {
    next(err);
  }
}

export async function listMyContracts(req, res, next) {
  try {
    const filter = { appliedBy: req.user?.userId };
    if (req.query.status) filter.status = req.query.status;
    const options = {
      limit: parseInt(req.query.limit) || 20,
      skip: parseInt(req.query.skip) || 0,
      sortBy: req.query.sortBy,
      minRating: req.query.minRating,
      verified: req.query.verified,
      verifiedUsers: req.query.verifiedUsers,
      skills: req.query.skills,
    };
    const contracts = await contractService.listContracts(filter, options, req.user?.userId);
    return buildResponse(res, 200, "My applied contracts", { contracts });
  } catch (err) {
    next(err);
  }
}

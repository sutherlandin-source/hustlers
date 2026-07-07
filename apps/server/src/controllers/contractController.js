import { contractService } from "../services/contractService.js";
import { SUCCESS_MESSAGES } from "../config/constants.js";

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

export async function closeContract(req, res, next) {
  try {
    const { id } = req.params;
    const result = await contractService.closeContract(id, { closedBy: req.user?.userId });
    return buildResponse(res, 200, "Contract closed", { contract: result });
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
    const userRole = req.user?.role;
    const userId = req.user?.userId;
    
    if (req.query.sellerId) filter.seller = req.query.sellerId;
    if (req.query.buyerId) filter.buyer = req.query.buyerId;
    if (req.query.status) filter.status = req.query.status;
    
    // If no filters provided and user is a hustler, show available contracts (unassigned contracts posted by managers)
    if (Object.keys(filter).length === 0 && userRole === "hustler") {
      // Show contracts that have no seller assigned (unassigned) and are in pending state
      filter.$or = [
        { seller: null },
        { seller: { $exists: false } }
      ];
      filter.status = "pending"; // Only show pending contracts to hustlers
    }
    
    const options = { limit: parseInt(req.query.limit) || 20, skip: parseInt(req.query.skip) || 0 };
    const contracts = await contractService.listContracts(filter, options);
    return buildResponse(res, 200, "Contracts list", { contracts });
  } catch (err) {
    next(err);
  }
}

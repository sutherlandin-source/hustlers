import { milestoneService } from "../services/milestoneService.js";
import { SUCCESS_MESSAGES } from "../config/constants.js";

function buildResponse(res, status, message, data = {}) {
  return res.status(status).json({ success: status >= 200 && status < 300, message, data, timestamp: new Date().toISOString() });
}

export async function createMilestone(req, res, next) {
  try {
    const { contractId } = req.params;
    const milestone = await milestoneService.createMilestone(contractId, req.body);
    return buildResponse(res, 201, SUCCESS_MESSAGES.CREATED, { milestone });
  } catch (err) {
    next(err);
  }
}

export async function submitMilestone(req, res, next) {
  try {
    const { id } = req.params;
    const milestone = await milestoneService.submitMilestone(id, req.user.userId, req.body.submissionData);
    return buildResponse(res, 200, "Milestone submitted", { milestone });
  } catch (err) {
    next(err);
  }
}

export async function approveMilestone(req, res, next) {
  try {
    const { id } = req.params;
    const milestone = await milestoneService.approveMilestone(id, req.user.userId);
    return buildResponse(res, 200, "Milestone approved", { milestone });
  } catch (err) {
    next(err);
  }
}

export async function rejectMilestone(req, res, next) {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const milestone = await milestoneService.rejectMilestone(id, req.user.userId, reason);
    return buildResponse(res, 200, "Milestone rejected", { milestone });
  } catch (err) {
    next(err);
  }
}

export async function rejectWork(req, res, next) {
  try {
    const { id } = req.params;
    const milestone = await milestoneService.rejectWork(id, req.user.userId, req.body || {});
    return buildResponse(res, 200, "Work rejected", { milestone });
  } catch (err) {
    next(err);
  }
}

export async function getMilestone(req, res, next) {
  try {
    const { id } = req.params;
    const milestone = await milestoneService.getMilestone(id);
    return buildResponse(res, 200, "Milestone retrieved", { milestone });
  } catch (err) {
    next(err);
  }
}

export async function listMilestones(req, res, next) {
  try {
    const filter = {};
    if (req.query.contractId) filter.contract = req.query.contractId;
    if (req.query.status) filter.status = req.query.status;
    const sellerId = req.query.sellerId || (req.query.sellerOnly === "true" ? req.user.userId : null);
    const options = { limit: parseInt(req.query.limit) || 20, skip: parseInt(req.query.skip) || 0 };
    const milestones = await milestoneService.listMilestones(filter, options, sellerId);
    return buildResponse(res, 200, "Milestones list", { milestones });
  } catch (err) {
    next(err);
  }
}

export async function updateWorkStatus(req, res, next) {
  try {
    const { id } = req.params;
    const { workStatus, completionNotes, proofFiles } = req.body;
    const milestone = await milestoneService.updateWorkStatus(id, req.user.userId, workStatus, {
      completionNotes,
      proofFiles,
    });
    return buildResponse(res, 200, "Work status updated", { milestone });
  } catch (err) {
    next(err);
  }
}

export async function requestRevision(req, res, next) {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const milestone = await milestoneService.requestRevision(id, req.user.userId, reason);
    return buildResponse(res, 200, "Revision requested", { milestone });
  } catch (err) {
    next(err);
  }
}

export async function getContractProgress(req, res, next) {
  try {
    const { contractId } = req.params;
    const progress = await milestoneService.getContractProgress(contractId);
    return buildResponse(res, 200, "Contract progress retrieved", { progress });
  } catch (err) {
    next(err);
  }
}

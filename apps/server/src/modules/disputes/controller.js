import { disputeService } from "./service.js";
import { HTTP_STATUS } from "../../shared/config/constants.js";

function buildResponse(res, status, message, data = {}) {
  return res.status(status).json({ success: status >= 200 && status < 300, message, data, timestamp: new Date().toISOString() });
}

export async function createDispute(req, res, next) {
  try {
    const dispute = await disputeService.createDispute(req.body || {}, req.user);
    return buildResponse(res, HTTP_STATUS.CREATED, "Dispute created", { dispute });
  } catch (err) {
    next(err);
  }
}

export async function listDisputes(req, res, next) {
  try {
    const disputes = await disputeService.listDisputes(req.user);
    return buildResponse(res, HTTP_STATUS.OK, "Disputes retrieved", { disputes });
  } catch (err) {
    next(err);
  }
}

export async function getDispute(req, res, next) {
  try {
    const data = await disputeService.getDispute(req.params.id, req.user);
    return buildResponse(res, HTTP_STATUS.OK, "Dispute retrieved", data);
  } catch (err) {
    next(err);
  }
}

export async function getDisputeForContract(req, res, next) {
  try {
    const data = await disputeService.getDisputeForContract(req.params.contractId, req.user);
    if (!data) {
      return buildResponse(res, HTTP_STATUS.OK, "Dispute retrieved", { dispute: null, thread: null });
    }
    return buildResponse(res, HTTP_STATUS.OK, "Dispute retrieved", data);
  } catch (err) {
    next(err);
  }
}

export async function addEvidence(req, res, next) {
  try {
    const dispute = await disputeService.addEvidence(req.params.id, req.user, req.body || {});
    return buildResponse(res, HTTP_STATUS.OK, "Evidence added", { dispute });
  } catch (err) {
    next(err);
  }
}

export async function performAction(req, res, next) {
  try {
    const dispute = await disputeService.performAction(req.params.id, req.user, req.body || {});
    return buildResponse(res, HTTP_STATUS.OK, "Dispute updated", { dispute });
  } catch (err) {
    next(err);
  }
}

import { createSupportTicket } from "./service.js";
import { HTTP_STATUS } from "../../shared/config/constants.js";

function buildResponse(res, status, message, data = {}) {
  return res.status(status).json({ success: status >= 200 && status < 300, message, data, timestamp: new Date().toISOString() });
}

export async function createPublicSupportTicket(req, res, next) {
  try {
    const conversation = await createSupportTicket(req.body || {});
    return buildResponse(res, HTTP_STATUS.CREATED, "Support ticket created", { conversation });
  } catch (err) {
    next(err);
  }
}

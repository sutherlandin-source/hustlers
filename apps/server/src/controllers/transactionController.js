/**
 * Transaction controller
 */

import { financialService } from "../services/financialService.js";

function buildResponse(res, status, message, data = {}) {
  return res.status(status).json({ success: status >= 200 && status < 300, message, data, timestamp: new Date().toISOString() });
}

export async function listTransactions(req, res, next) {
  try {
    const filter = {};
    if (req.query.contractId) filter.contract = req.query.contractId;
    if (req.query.type) filter.type = req.query.type;
    const options = {
      limit: parseInt(req.query.limit, 10) || 20,
      skip: parseInt(req.query.skip, 10) || 0,
    };
    const transactions = await financialService.listTransactions(req.user.userId, filter, options);
    return buildResponse(res, 200, "Transactions retrieved", { transactions });
  } catch (err) {
    next(err);
  }
}

export async function getTransaction(req, res, next) {
  try {
    const transaction = await financialService.getTransactionById(req.params.id, req.user.userId);
    return buildResponse(res, 200, "Transaction retrieved", { transaction });
  } catch (err) {
    next(err);
  }
}

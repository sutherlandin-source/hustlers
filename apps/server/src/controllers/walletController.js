/**
 * Wallet controller
 */

import { financialService } from "../services/financialService.js";
import { ApiError } from "../middleware/errorHandler.js";
import { Wallet, Transaction } from "../models/index.js";
import { TRANSACTION_TYPES, TRANSACTION_STATUSES } from "../config/constants.js";

function buildResponse(res, status, message, data = {}) {
  return res.status(status).json({ success: status >= 200 && status < 300, message, data, timestamp: new Date().toISOString() });
}

export async function listWallets(req, res, next) {
  try {
    const wallets = await financialService.listWallets(req.user.userId);
    return buildResponse(res, 200, "Wallets retrieved", { wallets });
  } catch (err) {
    next(err);
  }
}

export async function getWallet(req, res, next) {
  try {
    const wallet = await financialService.getWalletById(req.params.id, req.user.userId);
    return buildResponse(res, 200, "Wallet retrieved", { wallet });
  } catch (err) {
    next(err);
  }
}

export async function createWallet(req, res, next) {
  try {
    const { currency, type } = req.body;
    const wallet = await financialService.createWallet(req.user.userId, currency, type);
    return buildResponse(res, 201, "Wallet created", { wallet });
  } catch (err) {
    next(err);
  }
}

export async function depositWallet(req, res, next) {
  try {
    const { amount, referenceId } = req.body;
    const result = await financialService.depositToWallet(req.params.id, req.user.userId, amount, referenceId);
    return buildResponse(res, 200, "Wallet funded", result);
  } catch (err) {
    next(err);
  }
}

export async function withdrawWallet(req, res, next) {
  try {
    const { amount, referenceId } = req.body;
    const result = await financialService.withdrawFromWallet(req.params.id, req.user.userId, amount, referenceId);
    return buildResponse(res, 200, "Wallet withdrawal completed", result);
  } catch (err) {
    next(err);
  }
}

export async function fundWallet(req, res, next) {
  try {
    const { amount, description } = req.body;
    // Get user's escrow wallet and fund it
    let wallets = await financialService.listWallets(req.user.userId);
    let escrowWallet = wallets.find(w => w.type?.toLowerCase() === "escrow");
    
    // Create escrow wallet if it doesn't exist
    if (!escrowWallet) {
      escrowWallet = await financialService.createWallet(req.user.userId, "KSH", "escrow");
    }
    
    // Direct wallet update without transaction (for development)
    if (amount <= 0) throw new ApiError(400, "Amount must be greater than zero");
    
    const wallet = await Wallet.findById(escrowWallet._id);
    if (!wallet) throw new ApiError(404, "Wallet not found");
    if (wallet.status !== "active") throw new ApiError(409, "Wallet is not active");
    
    wallet.balance += amount;
    wallet.availableBalance += amount;
    await wallet.save();
    
    const transaction = new Transaction({
      wallet: wallet._id,
      user: req.user.userId,
      type: TRANSACTION_TYPES.DEPOSIT,
      amount,
      currency: wallet.currency,
      status: TRANSACTION_STATUSES.COMPLETED,
      referenceId: description || "Escrow funding",
      description: description || "Escrow funding",
      balanceAfter: wallet.balance,
    });
    await transaction.save();
    
    return buildResponse(res, 200, "Escrow wallet funded successfully", { wallet, transaction });
  } catch (err) {
    next(err);
  }
}

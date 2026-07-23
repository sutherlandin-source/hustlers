/**
 * Wallets Controller
 * Handles wallet-related HTTP requests
 */

import { escrowService } from "../escrow/index.js";
import { ApiError } from "../../shared/middleware/errorHandler.js";
import { Contract } from "../contracts/model.js";
import { Wallet, Transaction } from "./model.js";
import { CONTRACT_STATUSES, ESCROW_STATUSES, TRANSACTION_TYPES, TRANSACTION_STATUSES } from "../../shared/config/constants.js";
import { randomUUID } from "node:crypto";

function buildResponse(res, status, message, data = {}) {
  return res.status(status).json({ success: status >= 200 && status < 300, message, data, timestamp: new Date().toISOString() });
}

async function fundPendingContractEscrows(managerId) {
  const pendingContracts = await Contract.find({
    buyer: managerId,
    seller: { $exists: true, $ne: null },
    status: { $in: [CONTRACT_STATUSES.ASSIGNED, CONTRACT_STATUSES.ACTIVE] },
    $or: [
      { escrowPrepared: false },
      { escrowPrepared: { $exists: false } },
      { escrowStatus: ESCROW_STATUSES.WAITING_FOR_FUNDING },
    ],
  }).sort({ updatedAt: 1, createdAt: 1 });

  const fundedContracts = [];
  const fundingErrors = [];

  for (const contract of pendingContracts) {
    try {
      const result = await escrowService.reserveEscrow(contract._id, managerId, Number(contract.amount));
      fundedContracts.push(result.contract);
    } catch (error) {
      const message = error?.message || "Escrow could not be funded automatically";
      contract.metadata = {
        ...(contract.metadata || {}),
        escrowFundingError: message,
        escrowFundingAttemptedAt: new Date(),
      };
      await contract.save();
      fundingErrors.push({ contractId: contract._id, message });
    }
  }

  return { fundedContracts, fundingErrors };
}

export async function listWallets(req, res, next) {
  try {
    const wallets = await escrowService.listWallets(req.user.userId);
    return buildResponse(res, 200, "Wallets retrieved", { wallets });
  } catch (err) {
    next(err);
  }
}

export async function getWallet(req, res, next) {
  try {
    const wallet = await escrowService.getWalletById(req.params.id, req.user.userId);
    return buildResponse(res, 200, "Wallet retrieved", { wallet });
  } catch (err) {
    next(err);
  }
}

export async function createWallet(req, res, next) {
  try {
    const { currency, type } = req.body;
    const wallet = await escrowService.createWallet(req.user.userId, currency, type);
    return buildResponse(res, 201, "Wallet created", { wallet });
  } catch (err) {
    next(err);
  }
}

export async function depositWallet(req, res, next) {
  try {
    const { amount, referenceId } = req.body;
    const result = await escrowService.depositToWallet(req.params.id, req.user.userId, amount, referenceId);
    return buildResponse(res, 200, "Wallet funded", result);
  } catch (err) {
    next(err);
  }
}

export async function withdrawWallet(req, res, next) {
  try {
    const { amount, referenceId } = req.body;
    const result = await escrowService.withdrawFromWallet(req.params.id, req.user.userId, amount, referenceId);
    return buildResponse(res, 200, "Wallet withdrawal completed", result);
  } catch (err) {
    next(err);
  }
}

export async function fundWallet(req, res, next) {
  try {
    const { description } = req.body;
    const amount = Number(req.body.amount);
    const currency = String(req.body.currency || "KSH").toUpperCase().trim() || "KSH";

    // Get user's escrow wallet and fund it
    let wallets = await escrowService.listWallets(req.user.userId);
    let escrowWallet = wallets.find(w => w.type?.toLowerCase() === "escrow" && w.currency === currency);

    // Fallback: any escrow wallet if currency-matched one doesn't exist yet
    if (!escrowWallet) {
      escrowWallet = wallets.find(w => w.type?.toLowerCase() === "escrow");
    }

    // Create escrow wallet if it doesn't exist
    if (!escrowWallet) {
      escrowWallet = await escrowService.createWallet(req.user.userId, currency, "escrow");
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
      referenceId: `wallet-fund-${randomUUID()}`,
      description: description || "Escrow funding",
      balanceAfter: wallet.balance,
    });
    await transaction.save();

    const escrowFunding = await fundPendingContractEscrows(req.user.userId);
    const updatedWallet = await Wallet.findById(wallet._id);

    return buildResponse(res, 200, "Escrow wallet funded successfully", {
      wallet: updatedWallet || wallet,
      transaction,
      escrowFunding,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Financial service
 * Handles wallet creation, escrow reservation, milestone payment release, deposits, withdrawals, and ledger entries.
 */

import mongoose from "mongoose";
import { randomUUID } from "crypto";
import { Wallet } from "../models/Wallet.js";
import { Transaction } from "../models/Transaction.js";
import { Contract } from "../models/Contract.js";
import { Milestone } from "../models/Milestone.js";
import { AuditLog } from "../models/AuditLog.js";
import { ApiError } from "../middleware/errorHandler.js";
import {
  HTTP_STATUS,
  TRANSACTION_TYPES,
  TRANSACTION_STATUSES,
  WALLET_TYPES,
  PAYMENT_STATUSES,
  AUDIT_ACTIONS,
  ENTITY_TYPES,
  CONTRACT_STATUSES,
  MILESTONE_STATUSES,
} from "../config/constants.js";
import { logger } from "../utils/logger.js";
import { notifications } from "../utils/notifications.js";

export class FinancialService {
  // Safe transaction wrapper that falls back to non-transactional execution for single-node MongoDB
  async safeTransaction(callback) {
    try {
      const session = await mongoose.startSession();
      try {
        let result;
        await session.withTransaction(async () => {
          result = await callback(session);
        });
        return result;
      } finally {
        await session.endSession();
      }
    } catch (err) {
      // If transaction isn't supported (single-node MongoDB), execute without transaction
      if (err.codeName === "OperationNotSupportedInTransaction" || err.message?.includes("Transaction numbers are only allowed")) {
        logger.warn("Transactions not supported in this MongoDB configuration, running without transaction", { error: err.message });
        return await callback(null);
      }
      throw err;
    }
  }

  // Helper to safely apply session to queries (handles null sessions)
  applySession(query, session) {
    return session ? query.session(session) : query;
  }

  async getOrCreateWallet(ownerId, currency, type = WALLET_TYPES.USER, session = null) {
    if (!ownerId) {
      logger.error("getOrCreateWallet called with null/undefined ownerId", { ownerId, currency, type });
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, "Invalid owner ID for wallet creation");
    }
    const query = { owner: ownerId, currency: currency.toUpperCase(), type };
    logger.debug("getOrCreateWallet query", { query, hasSession: !!session });
    let wallet = await this.applySession(Wallet.findOne(query), session);
    if (!wallet) {
      logger.info("Creating new wallet", { ownerId, currency, type });
      wallet = new Wallet({ owner: ownerId, currency: currency.toUpperCase(), type });
      const saveOptions = session ? { session } : {};
      await wallet.save(saveOptions);
      logger.info("Wallet created successfully", { walletId: wallet._id, ownerId, currency, type });
      await this.createAuditLog(ownerId, AUDIT_ACTIONS.CREATE, ENTITY_TYPES.WALLET, wallet._id, {}, wallet.toObject(), { walletType: type }, session);
    }
    return wallet;
  }

  async getWalletById(walletId, ownerId) {
    const wallet = await Wallet.findById(walletId);
    if (!wallet) {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, "Wallet not found");
    }
    if (!wallet.owner.equals(ownerId)) {
      throw new ApiError(HTTP_STATUS.FORBIDDEN, "Cannot access wallet");
    }
    return wallet;
  }

  async listWallets(ownerId) {
    return Wallet.find({ owner: ownerId }).sort({ createdAt: -1 });
  }

  async listTransactions(ownerId, filter = {}, options = {}) {
    const walletIds = await Wallet.find({ owner: ownerId }).select("_id");
    const query = { wallet: { $in: walletIds.map((wallet) => wallet._id) }, ...filter };
    const q = Transaction.find(query).sort({ createdAt: -1 });
    if (options.limit) q.limit(options.limit);
    if (options.skip) q.skip(options.skip);
    return q.populate("wallet").populate("contract");
  }

  async getTransactionById(transactionId, ownerId) {
    const transaction = await Transaction.findById(transactionId).populate("wallet").populate("contract");
    if (!transaction) throw new ApiError(HTTP_STATUS.NOT_FOUND, "Transaction not found");
    if (!transaction.wallet.owner.equals(ownerId)) {
      throw new ApiError(HTTP_STATUS.FORBIDDEN, "Cannot access transaction");
    }
    return transaction;
  }

  async createWallet(ownerId, currency, type = WALLET_TYPES.USER) {
    return this.getOrCreateWallet(ownerId, currency, type);
  }

  async depositToWallet(walletId, ownerId, amount, referenceId = null) {
    if (amount <= 0) throw new ApiError(HTTP_STATUS.BAD_REQUEST, "Deposit amount must be greater than zero");
    const session = await mongoose.startSession();
    try {
      let result;
      await session.withTransaction(async () => {
        const wallet = await Wallet.findById(walletId).session(session);
        if (!wallet) throw new ApiError(HTTP_STATUS.NOT_FOUND, "Wallet not found");
        if (!wallet.owner.equals(ownerId)) throw new ApiError(HTTP_STATUS.FORBIDDEN, "Cannot deposit into this wallet");
        if (wallet.status !== "active") throw new ApiError(HTTP_STATUS.CONFLICT, "Wallet is not active");

        const before = wallet.toObject();
        wallet.balance += amount;
        wallet.availableBalance += amount;
        wallet.balance = wallet.availableBalance + wallet.lockedBalance;
        await wallet.save({ session });

        const transaction = await this.createTransaction(
          {
            wallet: wallet._id,
            user: ownerId,
            type: TRANSACTION_TYPES.DEPOSIT,
            amount,
            currency: wallet.currency,
            status: TRANSACTION_STATUSES.COMPLETED,
            referenceId: referenceId || randomUUID(),
            description: "Wallet deposit",
            balanceAfter: wallet.balance,
          },
          session
        );

        await this.createAuditLog(ownerId, AUDIT_ACTIONS.TRANSACTION, ENTITY_TYPES.WALLET, wallet._id, before, wallet.toObject(), { amount, action: "deposit" }, session);
        result = { wallet, transaction };
      });
      return result;
    } finally {
      session.endSession();
    }
  }

  async withdrawFromWallet(walletId, ownerId, amount, referenceId = null) {
    if (amount <= 0) throw new ApiError(HTTP_STATUS.BAD_REQUEST, "Withdrawal amount must be greater than zero");
    const session = await mongoose.startSession();
    try {
      let result;
      await session.withTransaction(async () => {
        const wallet = await Wallet.findById(walletId).session(session);
        if (!wallet) throw new ApiError(HTTP_STATUS.NOT_FOUND, "Wallet not found");
        if (!wallet.owner.equals(ownerId)) throw new ApiError(HTTP_STATUS.FORBIDDEN, "Cannot withdraw from this wallet");
        if (wallet.status !== "active") throw new ApiError(HTTP_STATUS.CONFLICT, "Wallet is not active");
        if (wallet.availableBalance < amount) {
          throw new ApiError(HTTP_STATUS.CONFLICT, "Insufficient available balance");
        }

        const before = wallet.toObject();
        wallet.availableBalance -= amount;
        wallet.balance = wallet.availableBalance + wallet.lockedBalance;
        await wallet.save({ session });

        const transaction = await this.createTransaction(
          {
            wallet: wallet._id,
            user: ownerId,
            type: TRANSACTION_TYPES.WITHDRAWAL,
            amount,
            currency: wallet.currency,
            status: TRANSACTION_STATUSES.COMPLETED,
            referenceId: referenceId || randomUUID(),
            description: "Wallet withdrawal",
            balanceAfter: wallet.balance,
          },
          session
        );

        await this.createAuditLog(ownerId, AUDIT_ACTIONS.TRANSACTION, ENTITY_TYPES.WALLET, wallet._id, before, wallet.toObject(), { amount, action: "withdraw" }, session);
        result = { wallet, transaction };
      });
      return result;
    } finally {
      session.endSession();
    }
  }

  async reserveEscrow(contractId, actorId, amount, referenceId = null) {
    if (amount <= 0) throw new ApiError(HTTP_STATUS.BAD_REQUEST, "Escrow amount must be greater than zero");
    return this.safeTransaction(async (session) => {
      const contract = await this.applySession(Contract.findById(contractId), session);
      if (!contract) throw new ApiError(HTTP_STATUS.NOT_FOUND, "Contract not found");
      // Convert to strings for comparison since buyer might be ObjectId or string
      if (contract.buyer?.toString() !== actorId?.toString()) {
        throw new ApiError(HTTP_STATUS.FORBIDDEN, "Only the contract buyer may prepare escrow");
      }
      if ([CONTRACT_STATUSES.CANCELLED, CONTRACT_STATUSES.COMPLETED, CONTRACT_STATUSES.TERMINATED].includes(contract.status)) {
        throw new ApiError(HTTP_STATUS.CONFLICT, "Cannot prepare escrow for this contract");
      }
      if (amount > contract.amount) {
        throw new ApiError(HTTP_STATUS.CONFLICT, "Escrow amount cannot exceed contract total amount");
      }

      // Try to get wallet in contract currency, or fall back to primary wallet
      let buyerWallet = await this.getOrCreateWallet(contract.buyer, contract.currency, WALLET_TYPES.USER, session);
      
      // If insufficient funds in contract currency, try to find an alternate wallet
      if (buyerWallet.availableBalance < amount) {
        logger.info("Insufficient balance in primary wallet, searching for fallback", {
          contractId,
          primaryCurrency: contract.currency,
          primaryBalance: buyerWallet.availableBalance,
          requiredAmount: amount
        });
        
        // First try ESCROW wallet in SAME currency (most efficient)
        let alternateWallets = await this.applySession(Wallet.find({ 
          owner: contract.buyer, 
          type: WALLET_TYPES.ESCROW,
          currency: contract.currency
        }).lean(), session);
        
        logger.info("Same-currency ESCROW search", {
          found: alternateWallets?.length || 0,
          currency: contract.currency
        });
        
        // If no same-currency ESCROW, try USER wallet in different currency
        if (!alternateWallets || alternateWallets.length === 0) {
          alternateWallets = await this.applySession(Wallet.find({ 
            owner: contract.buyer, 
            type: WALLET_TYPES.USER,
            currency: { $ne: contract.currency }
          }).lean(), session);
          
          logger.info("Different-currency USER search", {
            found: alternateWallets?.length || 0
          });
        }
        
        // If still nothing, try ESCROW wallet in different currency (cross-currency conversion)
        if (!alternateWallets || alternateWallets.length === 0) {
          alternateWallets = await this.applySession(Wallet.find({ 
            owner: contract.buyer, 
            type: WALLET_TYPES.ESCROW,
            currency: { $ne: contract.currency }
          }).lean(), session);
          
          logger.info("Different-currency ESCROW search", {
            found: alternateWallets?.length || 0
          });
        }
        
        logger.info("Alternate wallets found", {
          count: alternateWallets?.length || 0,
          wallets: alternateWallets?.map(w => ({ type: w.type, currency: w.currency, available: w.availableBalance }))
        });
        
        // If we found an alternate wallet, use it
        if (alternateWallets && alternateWallets.length > 0) {
          const sourceWallet = alternateWallets[0];
          
          // Calculate conversion rate: USD to KSH is 130:1
          const sourceCurrency = String(sourceWallet.currency || "").trim();
          const targetCurrency = String(contract.currency || "").trim();
          let conversionRate = 1;
          
          logger.info("Currency comparison", {
            sourceCurrency,
            targetCurrency,
            isUSDtoKSH: sourceCurrency === "USD" && targetCurrency === "KSH"
          });
          
          if (sourceCurrency === "USD" && targetCurrency === "KSH") {
            conversionRate = 130;
          } else if (sourceCurrency === "KSH" && targetCurrency === "USD") {
            conversionRate = 1/130;
          }
          
          const requiredFromSource = Math.ceil(amount / conversionRate);
          
          logger.info("Checking cross-currency conversion", {
            sourceType: sourceWallet.type,
            sourceCurrency,
            targetCurrency,
            sourceBalance: sourceWallet.availableBalance,
            requiredAmount: requiredFromSource,
            conversionRate
          });
          
          if (sourceWallet.availableBalance >= requiredFromSource) {
            // Get the full document (not lean) for modification
            buyerWallet = await this.applySession(Wallet.findById(sourceWallet._id), session);
            logger.info("Using alternate wallet for escrow", {
              from: sourceWallet.currency,
              to: contract.currency,
              walletType: sourceWallet.type,
              conversionRate
            });
          } else {
            throw new ApiError(HTTP_STATUS.CONFLICT, "Insufficient available balance in all wallets");
          }
        } else {
          throw new ApiError(HTTP_STATUS.CONFLICT, "Insufficient available balance");
        }
      }

      const escrowWallet = contract.escrowWallet
        ? await this.applySession(Wallet.findById(contract.escrowWallet), session)
        : await this.getOrCreateWallet(contract.buyer, contract.currency, WALLET_TYPES.ESCROW, session);

      const beforeBuyer = buyerWallet.toObject();
      const beforeEscrow = escrowWallet.toObject();

      // For cross-currency, deduct in source currency but credit in target currency
      const buyerCurrency = String(buyerWallet.currency || "").trim();
      const contractCurrency = String(contract.currency || "").trim();
      const isConversion = buyerCurrency !== contractCurrency && buyerCurrency === "USD" && contractCurrency === "KSH";
      const conversionRate = isConversion ? 130 : 1;
      const deductAmount = isConversion ? Math.ceil(amount / conversionRate) : amount;
      
      logger.info("Deduct amount calculation", {
        buyerCurrency,
        contractCurrency,
        isConversion,
        conversionRate,
        amount,
        deductAmount
      });

      buyerWallet.availableBalance -= deductAmount;
      buyerWallet.lockedBalance += deductAmount;
      buyerWallet.balance = buyerWallet.availableBalance + buyerWallet.lockedBalance;

      // Add funds to escrow but mark them as locked (reserved for the contract)
      escrowWallet.balance += amount;
      escrowWallet.lockedBalance += amount;  // Mark funds as locked for this contract
      // availableBalance stays the same - funds are locked, not available for release until milestones are approved
      escrowWallet.balance = escrowWallet.availableBalance + escrowWallet.lockedBalance;

      contract.escrowWallet = escrowWallet._id;
      contract.escrowAmount = amount;
      contract.escrowPrepared = true;

      await buyerWallet.save({ session });
      await escrowWallet.save({ session });
      await contract.save({ session });

      const reference = referenceId || randomUUID();
      const buyerTransaction = {
        wallet: buyerWallet._id,
        user: actorId,
        contract: contract._id,
        type: TRANSACTION_TYPES.HOLD,
        amount: deductAmount,
        currency: buyerWallet.currency,
        status: TRANSACTION_STATUSES.COMPLETED,
        referenceId: `${reference}-buyer`,
        description: buyerWallet.currency !== contract.currency ? `Escrow reserved from ${buyerWallet.currency} wallet for ${contract.currency} contract` : "Escrow reserved from buyer wallet",
        balanceAfter: buyerWallet.balance,
      };

      const escrowTransaction = {
        wallet: escrowWallet._id,
        user: actorId,
        contract: contract._id,
        type: TRANSACTION_TYPES.CREDIT,
        amount,
        currency: contract.currency,
        status: TRANSACTION_STATUSES.COMPLETED,
        referenceId: `${reference}-escrow`,
        description: "Funds held in escrow",
        balanceAfter: escrowWallet.balance,
      };

        const txOptions = session ? { session } : {};
        await Transaction.create([buyerTransaction, escrowTransaction], txOptions);
      await this.createAuditLog(actorId, AUDIT_ACTIONS.TRANSACTION, ENTITY_TYPES.CONTRACT, contract._id, { before: { buyerWallet: beforeBuyer, escrowWallet: beforeEscrow } }, { after: { contract: contract.toObject() } }, { action: "reserveEscrow", amount }, session);

      notifications.emit("contract.escrowPrepared", { contract, amount, actorId });
      return { contract, buyerWallet, escrowWallet };
    });
  }

  async approveAndReleaseMilestonePayment(milestoneId, actorId, referenceId = null) {
    return this.safeTransaction(async (session) => {
      const milestone = await Milestone.findById(milestoneId).populate("contract").session(session);
      if (!milestone) throw new ApiError(HTTP_STATUS.NOT_FOUND, "Milestone not found");
      if (milestone.status !== MILESTONE_STATUSES.SUBMITTED) {
        throw new ApiError(HTTP_STATUS.CONFLICT, "Milestone must be submitted before approval and payment release");
      }

      milestone.approvedBy = actorId;
      milestone.approvedAt = new Date();
      milestone.status = MILESTONE_STATUSES.APPROVED;

      const contract = milestone.contract;
      if (!contract.escrowWallet) {
        throw new ApiError(HTTP_STATUS.CONFLICT, "Escrow wallet is not configured for this contract");
      }

      const escrowWallet = await Wallet.findById(contract.escrowWallet).session(session);
      if (!escrowWallet) throw new ApiError(HTTP_STATUS.NOT_FOUND, "Escrow wallet not found");
      if (escrowWallet.lockedBalance < milestone.amount) {
        throw new ApiError(HTTP_STATUS.CONFLICT, "Insufficient locked funds in escrow wallet");
      }

      const sellerWallet = await this.getOrCreateWallet(contract.seller, contract.currency, WALLET_TYPES.USER, session);
      const beforeEscrow = escrowWallet.toObject();
      const beforeSeller = sellerWallet.toObject();

      // Release funds from locked balance (remove from contract lock)
      escrowWallet.lockedBalance -= milestone.amount;
      escrowWallet.balance -= milestone.amount;
      // availableBalance stays the same since funds move from locked to paid-out
      
      sellerWallet.availableBalance += milestone.amount;
      sellerWallet.balance += milestone.amount;

      contract.escrowReleasedAmount += milestone.amount;

      await escrowWallet.save({ session });
      await sellerWallet.save({ session });
      await contract.save({ session });

      const reference = referenceId || randomUUID();
      const escrowTransaction = {
        wallet: escrowWallet._id,
        user: actorId,
        contract: contract._id,
        type: TRANSACTION_TYPES.DEBIT,
        amount: milestone.amount,
        currency: contract.currency,
        status: TRANSACTION_STATUSES.COMPLETED,
        referenceId: `${reference}-escrow`,
        description: "Milestone payment released from escrow",
        balanceAfter: escrowWallet.balance,
      };
      const sellerTransaction = {
        wallet: sellerWallet._id,
        user: actorId,
        contract: contract._id,
        type: TRANSACTION_TYPES.CREDIT,
        amount: milestone.amount,
        currency: contract.currency,
        status: TRANSACTION_STATUSES.COMPLETED,
        referenceId: `${reference}-seller`,
        description: "Milestone payment credited to seller wallet",
        balanceAfter: sellerWallet.balance,
      };

      const txOptions = session ? { session } : {};
      const [createdEscrowTx, createdSellerTx] = await Transaction.create([escrowTransaction, sellerTransaction], txOptions);

      milestone.paymentStatus = PAYMENT_STATUSES.RELEASED;
      milestone.paymentReleasedAt = new Date();
      milestone.paymentTransaction = createdSellerTx._id;
      milestone.paymentReferenceId = reference;
      await milestone.save({ session });

      await this.createAuditLog(actorId, AUDIT_ACTIONS.TRANSACTION, ENTITY_TYPES.MILESTONE, milestone._id, { before: { escrowWallet: beforeEscrow, sellerWallet: beforeSeller } }, { after: { milestone: milestone.toObject() } }, { action: "approveAndReleasePayment", amount: milestone.amount }, session);

      notifications.emit("milestone.paymentReleased", { milestone, contract });
      return { milestone, escrowWallet, sellerWallet, createdEscrowTx, createdSellerTx };
    });
  }

  async releaseMilestonePayment(milestoneId, actorId, referenceId = null) {
    const session = await mongoose.startSession();
    try {
      let result;
      await session.withTransaction(async () => {
        const milestone = await Milestone.findById(milestoneId).populate("contract").session(session);
        if (!milestone) throw new ApiError(HTTP_STATUS.NOT_FOUND, "Milestone not found");
        if (milestone.status !== MILESTONE_STATUSES.APPROVED) {
          throw new ApiError(HTTP_STATUS.CONFLICT, "Milestone must be approved before payment release");
        }
        if (milestone.paymentStatus !== PAYMENT_STATUSES.PENDING) {
          throw new ApiError(HTTP_STATUS.CONFLICT, "Milestone payment has already been processed");
        }

        const contract = milestone.contract;
        if (!contract.escrowWallet) {
          throw new ApiError(HTTP_STATUS.CONFLICT, "Escrow wallet is not configured for this contract");
        }

        const escrowWallet = await Wallet.findById(contract.escrowWallet).session(session);
        if (!escrowWallet) throw new ApiError(HTTP_STATUS.NOT_FOUND, "Escrow wallet not found");
        if (escrowWallet.lockedBalance < milestone.amount) {
          throw new ApiError(HTTP_STATUS.CONFLICT, "Insufficient locked funds in escrow wallet");
        }

        const sellerWallet = await this.getOrCreateWallet(contract.seller, contract.currency, WALLET_TYPES.USER, session);
        const beforeEscrow = escrowWallet.toObject();
        const beforeSeller = sellerWallet.toObject();

        // Release funds from locked balance (remove from contract lock)
        escrowWallet.lockedBalance -= milestone.amount;
        escrowWallet.balance -= milestone.amount;
        // availableBalance stays the same since funds move from locked to paid-out
        
        sellerWallet.availableBalance += milestone.amount;
        sellerWallet.balance += milestone.amount;

        contract.escrowReleasedAmount += milestone.amount;

        await escrowWallet.save({ session });
        await sellerWallet.save({ session });
        await contract.save({ session });

        const reference = referenceId || randomUUID();
        const escrowTransaction = {
          wallet: escrowWallet._id,
          user: actorId,
          contract: contract._id,
          type: TRANSACTION_TYPES.DEBIT,
          amount: milestone.amount,
          currency: contract.currency,
          status: TRANSACTION_STATUSES.COMPLETED,
          referenceId: `${reference}-escrow`,
          description: "Milestone payment released from escrow",
          balanceAfter: escrowWallet.balance,
        };
        const sellerTransaction = {
          wallet: sellerWallet._id,
          user: actorId,
          contract: contract._id,
          type: TRANSACTION_TYPES.CREDIT,
          amount: milestone.amount,
          currency: contract.currency,
          status: TRANSACTION_STATUSES.COMPLETED,
          referenceId: `${reference}-seller`,
          description: "Milestone payment credited to seller wallet",
          balanceAfter: sellerWallet.balance,
        };

        const txOptions = session ? { session } : {};
        const [createdEscrowTx, createdSellerTx] = await Transaction.create([escrowTransaction, sellerTransaction], txOptions);

        milestone.paymentStatus = PAYMENT_STATUSES.RELEASED;
        milestone.paymentReleasedAt = new Date();
        milestone.paymentTransaction = createdSellerTx._id;
        milestone.paymentReferenceId = reference;
        await milestone.save({ session });

        await this.createAuditLog(actorId, AUDIT_ACTIONS.TRANSACTION, ENTITY_TYPES.MILESTONE, milestone._id, { before: { escrowWallet: beforeEscrow, sellerWallet: beforeSeller } }, { after: { milestone: milestone.toObject() } }, { action: "releasePayment", amount }, session);
        notifications.emit("milestone.paymentReleased", { milestone, contract });
        result = { milestone, escrowWallet, sellerWallet, createdEscrowTx, createdSellerTx };
      });
      return result;
    } finally {
      session.endSession();
    }
  }

  async createTransaction(payload, session = null) {
    const transaction = new Transaction(payload);
    await transaction.save({ session });
    return transaction;
  }

  async createAuditLog(user, action, entityType, entityId, before = {}, after = {}, metadata = {}, session = null) {
    const createOptions = session ? { session } : {};
    await AuditLog.create(
      [
        {
          user,
          action,
          entityType,
          entityId,
          before,
          after,
          metadata,
        },
      ],
      createOptions
    );
  }
}

export const financialService = new FinancialService();
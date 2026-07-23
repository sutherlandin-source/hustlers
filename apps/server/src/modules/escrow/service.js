/**
 * Financial service
 * Handles wallet creation, escrow reservation, milestone payment release, deposits, withdrawals, and ledger entries.
 * CRITICAL: Contains all multi-currency escrow logic with KSH/USD support
 */

import mongoose from "mongoose";
import { randomUUID } from "crypto";
import { Wallet, Transaction } from "../wallets/model.js";
import { Contract } from "../contracts/model.js";
import { Milestone } from "../milestones/model.js";
import { Dispute } from "../../models/Dispute.js";
import ContractApplication from "../applications/model.js";
import { User } from "../../shared/models/User.js";
import { AuditLog } from "../../shared/models/AuditLog.js";
import { ApiError } from "../../shared/middleware/errorHandler.js";
import { APPLICATION_STATUSES } from "../../config/constants.js";
import {
  HTTP_STATUS,
  TRANSACTION_TYPES,
  TRANSACTION_STATUSES,
  WALLET_TYPES,
  PAYMENT_STATUSES,
  USER_ROLES,
  AUDIT_ACTIONS,
  ENTITY_TYPES,
  CONTRACT_STATUSES,
  ESCROW_STATUSES,
  DISPUTE_STATUSES,
  MILESTONE_STATUSES,
  WORK_STATUS,
} from "../../shared/config/constants.js";
import { logger } from "../../shared/utils/logger.js";
import { notifications } from "../../shared/utils/notifications.js";
import { notificationService } from "../notifications/service.js";

const HUSTLER_COMMISSION_RATE = 0.025;

function asString(value) {
  return value ? String(value._id || value.id || value) : null;
}

function splitAmount(amount, parts) {
  const totalCents = Math.round(Number(amount) * 100);
  const baseCents = Math.floor(totalCents / parts);
  const remainder = totalCents % parts;
  return Array.from({ length: parts }, (_, index) => Number(((baseCents + (index < remainder ? 1 : 0)) / 100).toFixed(2)));
}

function resolveMilestoneRecipient(milestone, contract) {
  return asString(milestone?.submittedBy) || asString(milestone?.assignedTo) || asString(contract?.seller);
}

async function closeManagerApprovedDisputes(contract, milestone, approverId, session = null) {
  const managerId = asString(contract?.buyer) || asString(approverId);
  const milestoneParticipantIds = [asString(milestone?.submittedBy), asString(milestone?.assignedTo)].filter(Boolean);
  if (!milestoneParticipantIds.length) return [];
  const query = {
    contract: contract._id,
    raisedBy: { $in: milestoneParticipantIds },
    status: { $in: [DISPUTE_STATUSES.OPEN, DISPUTE_STATUSES.WAITING_FOR_RESPONSE, DISPUTE_STATUSES.WAITING_FOR_EVIDENCE, DISPUTE_STATUSES.UNDER_REVIEW, DISPUTE_STATUSES.APPEALED] },
  };
  const disputes = session ? await Dispute.find(query).sort({ createdAt: -1 }).session(session) : await Dispute.find(query).sort({ createdAt: -1 });
  if (!disputes.length) return [];

  const now = new Date();
  for (const dispute of disputes) {
    dispute.status = DISPUTE_STATUSES.CLOSED;
    dispute.resolutionType = "manager_approved";
    dispute.adminNotes = "Manager approved the work.";
    dispute.resolution = "Manager approved the work and the dispute was closed.";
    dispute.resolvedBy = managerId || approverId;
    dispute.resolvedAt = now;
    dispute.metadata = {
      ...(dispute.metadata || {}),
      managerApprovedBy: managerId || approverId,
      managerApprovedAt: now,
      managerApprovedMilestoneId: milestone?._id || null,
      managerApprovedContractId: contract?._id || null,
    };
    dispute.timeline = Array.isArray(dispute.timeline) ? dispute.timeline : [];
    dispute.timeline.push({
      eventType: "manager_approved",
      title: "Manager approved the work",
      detail: "The manager approved the submission and the dispute was closed.",
      actor: managerId || approverId,
      status: DISPUTE_STATUSES.CLOSED,
      metadata: {
        milestoneId: milestone?._id || null,
        contractId: contract?._id || null,
      },
      createdAt: now,
    });
    await dispute.save({ session });
  }

  return disputes;
}

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

  async getPlatformWallet(currency, session = null) {
    const admin = await this.applySession(User.findOne({ role: USER_ROLES.ADMIN, isActive: true }).select("_id"), session);
    if (!admin?._id) {
      throw new ApiError(HTTP_STATUS.CONFLICT, "An admin user is required before platform commission can be collected");
    }
    return this.getOrCreateWallet(admin._id, currency, WALLET_TYPES.PLATFORM, session);
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
      if (!contract.seller || ![CONTRACT_STATUSES.ASSIGNED, CONTRACT_STATUSES.ACTIVE].includes(contract.status)) {
        throw new ApiError(HTTP_STATUS.CONFLICT, "Escrow can only be funded after a hustler has been assigned");
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
      if (escrowWallet.availableBalance < amount) {
        throw new ApiError(HTTP_STATUS.CONFLICT, "Insufficient available balance in escrow wallet");
      }

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
      buyerWallet.balance = buyerWallet.availableBalance + buyerWallet.lockedBalance;

      // Move funds from available escrow into locked escrow for the contract
      escrowWallet.availableBalance -= amount;
      escrowWallet.lockedBalance += amount;  // Mark funds as locked for this contract
      escrowWallet.balance = escrowWallet.availableBalance + escrowWallet.lockedBalance;

      contract.escrowWallet = escrowWallet._id;
      contract.escrowAmount = amount;
      contract.escrowPrepared = true;
      contract.escrowStatus = ESCROW_STATUSES.FUNDED;
      const metadata = { ...(contract.metadata || {}) };
      delete metadata.escrowFundingError;
      contract.metadata = {
        ...metadata,
        hustlerCommissionRate: HUSTLER_COMMISSION_RATE,
        escrowFundedAt: new Date(),
      };

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
      const milestone = await this.applySession(Milestone.findById(milestoneId).populate("contract"), session);
      if (!milestone) throw new ApiError(HTTP_STATUS.NOT_FOUND, "Milestone not found");
      const hasSubmissionEvidence =
        Boolean(milestone.submittedBy) ||
        Boolean(milestone.submittedAt) ||
        Boolean(milestone.completionNotes?.trim()) ||
        Boolean(Array.isArray(milestone.proofFiles) && milestone.proofFiles.length) ||
        Boolean(milestone.submissionData);
      // Auto-heal: if the milestone has real submission evidence but its status got stuck
      // in PENDING or REJECTED (e.g. after requestRevision / rejectWork), normalise it
      // back to SUBMITTED so the approval can proceed.
      if (
        (milestone.status === MILESTONE_STATUSES.PENDING ||
          milestone.status === MILESTONE_STATUSES.REJECTED) &&
        hasSubmissionEvidence
      ) {
        milestone.status = MILESTONE_STATUSES.SUBMITTED;
        if (
          milestone.workStatus === WORK_STATUS.NOT_STARTED ||
          milestone.workStatus === WORK_STATUS.NEEDS_REVISION ||
          milestone.workStatus === WORK_STATUS.REJECTED
        ) {
          milestone.workStatus = WORK_STATUS.WORK_SUBMITTED;
        }
        await milestone.save({ session });
      }
      const submittedState =
        milestone.status === MILESTONE_STATUSES.SUBMITTED ||
        String(milestone.workStatus || "").toLowerCase() === String(WORK_STATUS.WORK_SUBMITTED).toLowerCase();
      if (!submittedState) {
        throw new ApiError(HTTP_STATUS.CONFLICT, "Milestone must be submitted before approval");
      }
      if (milestone.status !== MILESTONE_STATUSES.SUBMITTED) {
        milestone.status = MILESTONE_STATUSES.SUBMITTED;
      }

      milestone.approvedBy = actorId;
      milestone.approvedAt = new Date();
      milestone.status = MILESTONE_STATUSES.APPROVED;
      milestone.workStatus = WORK_STATUS.APPROVED;
      await milestone.save({ session });

      const contract = milestone.contract;
      const closedDisputes = await closeManagerApprovedDisputes(contract, milestone, actorId, session);
      const releaseResult = contract?.escrowPrepared ? await this.releaseMilestonePayment(milestone._id, actorId, referenceId, session) : null;

      const remainingUnapprovedStages = await this.applySession(
        Milestone.countDocuments({
          contract: contract._id,
          status: { $ne: MILESTONE_STATUSES.APPROVED },
        }),
        session
      );

      if (contract?.escrowPrepared && remainingUnapprovedStages === 0) {
        contract.escrowStatus = ESCROW_STATUSES.RELEASED;
        contract.status = CONTRACT_STATUSES.COMPLETED;
        contract.completedAt = new Date();
        contract.finalApprovedBy = actorId;
        contract.finalApprovedAt = new Date();
        await contract.save({ session });
      } else if (contract?.escrowPrepared && contract.escrowStatus !== ESCROW_STATUSES.RELEASED) {
        contract.escrowStatus = ESCROW_STATUSES.IN_PROGRESS;
        await contract.save({ session });
      }

      await this.createAuditLog(actorId, AUDIT_ACTIONS.UPDATE, ENTITY_TYPES.MILESTONE, milestone._id, {}, { milestone: milestone.toObject() }, { action: "approveAndReleaseEscrow", releasedMilestonePayment: Boolean(releaseResult) }, session);
      notifications.emit("milestone.approved", { milestone, contract });
      if (closedDisputes.length) {
        closedDisputes.forEach((dispute) => {
          notifications.emit("dispute.resolved", {
            dispute: dispute.toObject(),
            contract,
            action: "manager_approved",
            resolutionType: "manager_approved",
          });
        });
      }
      return releaseResult ? { milestone: releaseResult.milestone, contract, ...releaseResult } : { milestone, contract };
    });
  }

  async releaseFundedContractEscrow(contract, actorId, session = null, referenceId = null) {
    if (!contract) throw new ApiError(HTTP_STATUS.NOT_FOUND, "Contract not found");
    if (contract.buyer?.toString() !== actorId?.toString()) {
      throw new ApiError(HTTP_STATUS.FORBIDDEN, "Only the contract buyer may release escrow");
    }
    if (!contract.escrowPrepared || !contract.escrowWallet) {
      throw new ApiError(HTTP_STATUS.CONFLICT, "Escrow must be funded before release");
    }
    if (!contract.seller) {
      throw new ApiError(HTTP_STATUS.CONFLICT, "Contract has no assigned hustler");
    }
    if (contract.escrowStatus === ESCROW_STATUSES.RELEASED || contract.escrowReleasedAmount >= contract.escrowAmount) {
      throw new ApiError(HTTP_STATUS.CONFLICT, "Contract escrow has already been released");
    }

    const amountToRelease = contract.escrowAmount - contract.escrowReleasedAmount;
    if (amountToRelease <= 0) {
      throw new ApiError(HTTP_STATUS.CONFLICT, "No escrow funds available for release");
    }

    const escrowWallet = await this.applySession(Wallet.findById(contract.escrowWallet), session);
    if (!escrowWallet) throw new ApiError(HTTP_STATUS.NOT_FOUND, "Escrow wallet not found");
    if (escrowWallet.lockedBalance < amountToRelease) {
      throw new ApiError(HTTP_STATUS.CONFLICT, "Insufficient reserved escrow funds");
    }

    const acceptedApplications = await this.applySession(
      ContractApplication.find({
        contractId: contract._id,
        status: APPLICATION_STATUSES.ACCEPTED,
      }).select("hustlerId"),
      session
    );
    const payeeIds = [
      ...new Set(
        (acceptedApplications.length ? acceptedApplications.map((application) => application.hustlerId) : [contract.seller])
          .filter(Boolean)
          .map((payeeId) => payeeId.toString())
      ),
    ];
    if (!payeeIds.length) {
      throw new ApiError(HTTP_STATUS.CONFLICT, "Contract has no accepted hustlers to pay");
    }
    const maxWorkers = Math.max(1, Number(contract.numWorkers) || 1);
    if (payeeIds.length < maxWorkers) {
      throw new ApiError(HTTP_STATUS.CONFLICT, "All worker slots must be accepted before escrow can be released");
    }

    const sellerWallets = [];
    for (const payeeId of payeeIds) {
      sellerWallets.push(await this.getOrCreateWallet(payeeId, contract.currency, WALLET_TYPES.USER, session));
    }
    const platformWallet = await this.getPlatformWallet(contract.currency, session);
    const holdTransaction = await this.applySession(
      Transaction.findOne({
        contract: contract._id,
        type: TRANSACTION_TYPES.HOLD,
      }).sort({ createdAt: -1 }),
      session
    );
    const buyerFundingWallet = holdTransaction?.wallet
      ? await this.applySession(Wallet.findById(holdTransaction.wallet), session)
      : null;
    const beforeEscrow = escrowWallet.toObject();
    const beforeSellers = sellerWallets.map((wallet) => wallet.toObject());
    const beforePlatform = platformWallet.toObject();
    const beforeBuyerFunding = buyerFundingWallet?.toObject?.() || null;
    const hustlerCommission = Number((amountToRelease * HUSTLER_COMMISSION_RATE).toFixed(2));
    const grossShares = splitAmount(amountToRelease, payeeIds.length);
    const commissionShares = splitAmount(hustlerCommission, payeeIds.length);
    const disbursements = grossShares.map((grossAmount, index) => ({
      hustler: payeeIds[index],
      grossAmount,
      commissionAmount: commissionShares[index],
      netAmount: Number((grossAmount - commissionShares[index]).toFixed(2)),
    }));
    const sellerNetAmount = Number(disbursements.reduce((total, item) => total + item.netAmount, 0).toFixed(2));

    escrowWallet.lockedBalance -= amountToRelease;
    escrowWallet.balance -= amountToRelease;
    sellerWallets.forEach((wallet, index) => {
      wallet.availableBalance += disbursements[index].netAmount;
      wallet.balance += disbursements[index].netAmount;
    });
    platformWallet.availableBalance += hustlerCommission;
    platformWallet.balance += hustlerCommission;

    if (buyerFundingWallet && buyerFundingWallet.lockedBalance > 0) {
      const lockedToClear = Math.min(buyerFundingWallet.lockedBalance, holdTransaction.amount);
      buyerFundingWallet.lockedBalance -= lockedToClear;
      buyerFundingWallet.balance = buyerFundingWallet.availableBalance + buyerFundingWallet.lockedBalance;
      holdTransaction.description = `${holdTransaction.description || "Escrow hold"} - released to hustler`;
      holdTransaction.metadata = {
        ...(holdTransaction.metadata || {}),
        releasedAt: new Date(),
        releasedAmount: amountToRelease,
      };
      await buyerFundingWallet.save({ session });
      await holdTransaction.save({ session });
    }

    contract.escrowReleasedAmount += amountToRelease;
    contract.escrowStatus = ESCROW_STATUSES.RELEASED;
    contract.status = CONTRACT_STATUSES.COMPLETED;
    contract.completedAt = new Date();
    contract.finalApprovedBy = actorId;
    contract.finalApprovedAt = new Date();
    contract.metadata = {
      ...(contract.metadata || {}),
      hustlerCommissionRate: HUSTLER_COMMISSION_RATE,
      hustlerCommissionAmount: hustlerCommission,
      hustlerNetAmount: sellerNetAmount,
      payoutStrategy: payeeIds.length > 1 ? "equal_split_between_accepted_hustlers" : "single_hustler",
      payoutCount: payeeIds.length,
      disbursements,
    };

    await escrowWallet.save({ session });
    for (const wallet of sellerWallets) {
      await wallet.save({ session });
    }
    await platformWallet.save({ session });
    await contract.save({ session });
    await this.applySession(
      User.updateMany(
        { _id: { $in: [contract.buyer, ...payeeIds] } },
        { $inc: { completedContracts: 1 } }
      ),
      session
    );

    const reference = referenceId || randomUUID();
    const txOptions = session ? { session } : {};
    const sellerTransactionPayloads = sellerWallets.map((wallet, index) => ({
      wallet: wallet._id,
      user: payeeIds[index],
      contract: contract._id,
      type: TRANSACTION_TYPES.CREDIT,
      amount: disbursements[index].netAmount,
      currency: contract.currency,
      status: TRANSACTION_STATUSES.COMPLETED,
      referenceId: `${reference}-contract-seller-${index + 1}`,
      description: `Final contract payment credited to hustler wallet after ${HUSTLER_COMMISSION_RATE * 100}% platform fee`,
      balanceAfter: wallet.balance,
      metadata: {
        grossAmount: disbursements[index].grossAmount,
        commissionAmount: disbursements[index].commissionAmount,
        commissionRate: HUSTLER_COMMISSION_RATE,
        payoutIndex: index + 1,
        payoutCount: payeeIds.length,
      },
    }));
    const [escrowTransaction, ...createdTransactions] = await Transaction.create(
      [
        {
          wallet: escrowWallet._id,
          user: actorId,
          contract: contract._id,
          type: TRANSACTION_TYPES.DEBIT,
          amount: amountToRelease,
          currency: contract.currency,
          status: TRANSACTION_STATUSES.COMPLETED,
          referenceId: `${reference}-contract-escrow`,
          description: "Final contract payment released from escrow",
          balanceAfter: escrowWallet.balance,
        },
        ...sellerTransactionPayloads,
        {
          wallet: platformWallet._id,
          user: platformWallet.owner,
          contract: contract._id,
          type: TRANSACTION_TYPES.COMMISSION,
          amount: hustlerCommission,
          currency: contract.currency,
          status: TRANSACTION_STATUSES.COMPLETED,
          referenceId: `${reference}-platform-hustler-commission`,
          description: `Platform commission from hustler (${HUSTLER_COMMISSION_RATE * 100}%)`,
          balanceAfter: platformWallet.balance,
          metadata: {
            payer: "hustler",
            sellerWallets: sellerWallets.map((wallet) => wallet._id),
            rate: HUSTLER_COMMISSION_RATE,
            grossAmount: amountToRelease,
            disbursements,
          },
        },
      ],
      txOptions
    );
    const sellerTransactions = createdTransactions.slice(0, sellerWallets.length);
    const platformHustlerCommissionTransaction = createdTransactions[sellerWallets.length];

    await Milestone.updateMany(
      { contract: contract._id, status: MILESTONE_STATUSES.APPROVED },
      {
        $set: {
          paymentStatus: PAYMENT_STATUSES.RELEASED,
          paymentReleasedAt: new Date(),
          paymentReferenceId: reference,
          paymentTransaction: sellerTransactions[0]?._id || null,
          paymentMetadata: { disbursements },
        },
      },
      session ? { session } : {}
    );

    await this.createAuditLog(
      actorId,
      AUDIT_ACTIONS.TRANSACTION,
      ENTITY_TYPES.CONTRACT,
      contract._id,
      { before: { escrowWallet: beforeEscrow, sellerWallets: beforeSellers, platformWallet: beforePlatform, buyerFundingWallet: beforeBuyerFunding } },
      { after: { contract: contract.toObject() } },
      { action: "releaseContractEscrow", amount: amountToRelease, hustlerCommission, sellerNetAmount, payoutCount: payeeIds.length, disbursements },
      session
    );

    await notificationService.sendContractReviewPrompts(contract, payeeIds);
    notifications.emit("contract.paymentReleased", { contract, amount: amountToRelease });
    return { contract, escrowWallet, sellerWallets, platformWallet, escrowTransaction, sellerTransactions, platformHustlerCommissionTransaction };
  }

  async releaseContractEscrow(contractId, actorId, referenceId = null) {
    return this.safeTransaction(async (session) => {
      const contract = await this.applySession(Contract.findById(contractId).populate("milestones"), session);
      return this.releaseFundedContractEscrow(contract, actorId, session, referenceId);
    });
  }

  async releaseMilestonePayment(milestoneId, actorId, referenceId = null, session = null) {
    const runRelease = async (session) => {
      const milestone = await this.applySession(Milestone.findById(milestoneId).populate("contract"), session);
      if (!milestone) throw new ApiError(HTTP_STATUS.NOT_FOUND, "Milestone not found");
      if (milestone.status !== MILESTONE_STATUSES.APPROVED) {
        throw new ApiError(HTTP_STATUS.CONFLICT, "Milestone must be approved before payment release");
      }
      if (milestone.paymentStatus !== PAYMENT_STATUSES.PENDING) {
        throw new ApiError(HTTP_STATUS.CONFLICT, "Milestone payment has already been processed");
      }

      const contract = milestone.contract;
      if (!contract?.escrowWallet) {
        throw new ApiError(HTTP_STATUS.CONFLICT, "Escrow wallet is not configured for this contract");
      }

      const recipientId = resolveMilestoneRecipient(milestone, contract);
      if (!recipientId) {
        throw new ApiError(HTTP_STATUS.CONFLICT, "No recipient is assigned to this milestone");
      }

      const escrowWallet = await this.applySession(Wallet.findById(contract.escrowWallet), session);
      if (!escrowWallet) throw new ApiError(HTTP_STATUS.NOT_FOUND, "Escrow wallet not found");
      if (escrowWallet.lockedBalance < milestone.amount) {
        throw new ApiError(HTTP_STATUS.CONFLICT, "Insufficient locked funds in escrow wallet");
      }

      const recipientWallet = await this.getOrCreateWallet(recipientId, contract.currency, WALLET_TYPES.USER, session);
      const platformWallet = await this.getPlatformWallet(contract.currency, session);
      const beforeEscrow = escrowWallet.toObject();
      const beforeRecipient = recipientWallet.toObject();
      const beforePlatform = platformWallet.toObject();
      const grossAmount = Number(milestone.amount || 0);
      const commissionAmount = Number((grossAmount * HUSTLER_COMMISSION_RATE).toFixed(2));
      const netAmount = Number((grossAmount - commissionAmount).toFixed(2));

      escrowWallet.lockedBalance -= grossAmount;
      escrowWallet.balance -= grossAmount;
      recipientWallet.availableBalance += netAmount;
      recipientWallet.balance += netAmount;
      platformWallet.availableBalance += commissionAmount;
      platformWallet.balance += commissionAmount;
      contract.escrowReleasedAmount += grossAmount;

      await escrowWallet.save({ session });
      await recipientWallet.save({ session });
      await platformWallet.save({ session });
      await contract.save({ session });

      const reference = referenceId || randomUUID();
      const escrowTransaction = {
        wallet: escrowWallet._id,
        user: actorId,
        contract: contract._id,
        type: TRANSACTION_TYPES.DEBIT,
        amount: grossAmount,
        currency: contract.currency,
        status: TRANSACTION_STATUSES.COMPLETED,
        referenceId: `${reference}-escrow`,
        description: "Milestone payment released from escrow",
        balanceAfter: escrowWallet.balance,
      };
      const recipientTransaction = {
        wallet: recipientWallet._id,
        user: actorId,
        contract: contract._id,
        type: TRANSACTION_TYPES.CREDIT,
        amount: netAmount,
        currency: contract.currency,
        status: TRANSACTION_STATUSES.COMPLETED,
        referenceId: `${reference}-recipient`,
        description: `Milestone payment credited to hustler wallet after ${HUSTLER_COMMISSION_RATE * 100}% platform fee`,
        balanceAfter: recipientWallet.balance,
      };
      const platformTransaction = {
        wallet: platformWallet._id,
        user: platformWallet.owner,
        contract: contract._id,
        type: TRANSACTION_TYPES.CREDIT,
        amount: commissionAmount,
        currency: contract.currency,
        status: TRANSACTION_STATUSES.COMPLETED,
        referenceId: `${reference}-platform-commission`,
        description: `Platform commission from milestone payment (${HUSTLER_COMMISSION_RATE * 100}%)`,
        balanceAfter: platformWallet.balance,
        metadata: {
          commissionRate: HUSTLER_COMMISSION_RATE,
          grossAmount,
          netAmount,
        },
      };

      const txOptions = session ? { session } : {};
      const [createdEscrowTx, createdRecipientTx, createdPlatformTx] = await Transaction.create([escrowTransaction, recipientTransaction, platformTransaction], txOptions);

      milestone.paymentStatus = PAYMENT_STATUSES.RELEASED;
      milestone.paymentReleasedAt = new Date();
      milestone.paymentTransaction = createdRecipientTx._id;
      milestone.paymentReferenceId = reference;
      milestone.metadata = {
        ...(milestone.metadata || {}),
        paymentReleasedBy: actorId,
        paymentReleasedAt: new Date(),
        paymentRecipientId: recipientId,
        commissionAmount,
        grossAmount,
        netAmount,
      };
      await milestone.save({ session });

      await this.createAuditLog(
        actorId,
        AUDIT_ACTIONS.TRANSACTION,
        ENTITY_TYPES.MILESTONE,
        milestone._id,
        { before: { escrowWallet: beforeEscrow, recipientWallet: beforeRecipient, platformWallet: beforePlatform } },
        { after: { milestone: milestone.toObject() } },
        { action: "releasePayment", amount: grossAmount, recipientId, commissionAmount, netAmount },
        session
      );
      notifications.emit("milestone.paymentReleased", { milestone, contract, recipientId });
      notifications.emit("contract.paymentReleased", {
        contract,
        amount: grossAmount,
        recipientPayments: [{ user: recipientId, amount: netAmount }],
      });
      return { milestone, contract, escrowWallet, recipientWallet, platformWallet, createdEscrowTx, createdRecipientTx, createdPlatformTx };
    };

    return session ? runRelease(session) : this.safeTransaction(runRelease);
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

export const escrowService = new FinancialService();

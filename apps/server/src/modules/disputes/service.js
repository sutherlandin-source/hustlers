import mongoose from "mongoose";
import { randomUUID } from "crypto";
import { Contract } from "../contracts/model.js";
import ContractApplication from "../applications/model.js";
import { Milestone } from "../milestones/model.js";
import { Conversation } from "../../models/Conversation.js";
import { Message } from "../../models/Message.js";
import { Dispute } from "../../models/Dispute.js";
import { User } from "../../shared/models/User.js";
import { escrowService as financialService } from "../escrow/service.js";
import { notifications } from "../../shared/utils/notifications.js";
import { logger } from "../../shared/utils/logger.js";
import { ApiError } from "../../shared/middleware/errorHandler.js";
import {
  CONTRACT_STATUSES,
  DISPUTE_STATUSES,
  ENTITY_TYPES,
  HTTP_STATUS,
  ESCROW_STATUSES,
  MILESTONE_STATUSES,
  PAYMENT_STATUSES,
  TRANSACTION_STATUSES,
  TRANSACTION_TYPES,
  USER_ROLES,
  WALLET_TYPES,
  AUDIT_ACTIONS,
  WORK_STATUS,
} from "../../shared/config/constants.js";
import { Wallet, Transaction } from "../wallets/model.js";

function toId(value) {
  return value?._id || value?.id || value?.userId || value || null;
}

function asString(value) {
  const id = toId(value);
  return id ? String(id) : null;
}

function uniqueIds(values) {
  return [...new Set(values.map(asString).filter(Boolean))];
}

function createTimelineEvent(eventType, title, detail = "", actor = null, status = null, metadata = {}) {
  return {
    eventType,
    title,
    detail,
    actor: toId(actor),
    status,
    metadata,
    createdAt: new Date(),
  };
}

function normalizeResolutionType(action) {
  const mapping = {
    release_payment: "release_full_payment",
    refund_manager: "refund_manager",
    split_payment: "split_payment",
    request_evidence: "request_additional_evidence",
    under_review: "under_review",
    close: "closed",
  };
  return mapping[String(action || "").trim().toLowerCase()] || String(action || "").trim().toLowerCase();
}

function requiresAdminNotes(action) {
  return ["release_payment", "refund_manager", "split_payment", "request_evidence", "close"].includes(String(action || "").trim().toLowerCase());
}

function normalizeEvidenceTypes(values = []) {
  const allowed = new Set(["photos", "videos", "documents", "receipts", "screenshots"]);
  return Array.isArray(values)
    ? values.map((value) => String(value || "").trim().toLowerCase()).filter((value) => allowed.has(value))
    : [];
}

function normalizeRecipientRoles(values = []) {
  const allowed = new Set(["manager", "hustler", "both"]);
  const roles = Array.isArray(values) ? values : [values];
  const normalized = roles.map((value) => String(value || "").trim().toLowerCase()).filter((value) => allowed.has(value));
  if (!normalized.length) return ["both"];
  if (normalized.includes("both")) return ["both"];
  return [...new Set(normalized)];
}

function getRequestRecipients(contract, roles = ["both"], hustlerIds = []) {
  const buyerId = asString(contract?.buyer);
  const sellerIds = Array.isArray(hustlerIds) && hustlerIds.length ? hustlerIds : uniqueIds([contract?.seller]);
  const normalizedRoles = normalizeRecipientRoles(roles);
  const recipientIds = [];

  if (normalizedRoles.includes("both") || normalizedRoles.includes("manager")) {
    if (buyerId) recipientIds.push(buyerId);
  }
  if (normalizedRoles.includes("both") || normalizedRoles.includes("hustler")) {
    recipientIds.push(...sellerIds);
  }

  return uniqueIds(recipientIds);
}

function parseDeadline(value) {
  if (!value) return null;
  const deadline = new Date(value);
  return Number.isNaN(deadline.getTime()) ? null : deadline;
}

function getLatestPendingEvidenceRequest(dispute, actorId = null) {
  const requests = Array.isArray(dispute?.evidenceRequests) ? dispute.evidenceRequests : [];
  const pendingRequests = requests.filter((request) => String(request?.status || "pending").toLowerCase() === "pending");
  if (!actorId) return pendingRequests[pendingRequests.length - 1] || null;
  return (
    [...pendingRequests]
      .reverse()
      .find((request) => {
        const recipients = Array.isArray(request?.recipientIds) ? request.recipientIds.map(asString) : [];
        return recipients.includes(String(actorId));
      }) || null
  );
}

const HUSTLER_COMMISSION_RATE = 0.025;

function splitAmount(amount, parts) {
  const totalCents = Math.round(Number(amount || 0) * 100);
  const baseCents = Math.floor(totalCents / parts);
  const remainder = totalCents % parts;
  return Array.from({ length: parts }, (_, index) => Number(((baseCents + (index < remainder ? 1 : 0)) / 100).toFixed(2)));
}

async function getDisputePayoutLedger(contract) {
  const existingDisbursements = Array.isArray(contract?.metadata?.disbursements) ? contract.metadata.disbursements : [];
  if (existingDisbursements.length) {
    return existingDisbursements
      .map((item, index) => {
        const user = asString(item?.hustler || item?.user || item?.recipientId);
        if (!user) return null;
        return {
          user,
          grossAmount: Number(item?.grossAmount || 0),
          commissionAmount: Number(item?.commissionAmount || 0),
          netAmount: Number(item?.netAmount || 0),
          paymentStatus: String(item?.paymentStatus || "pending").toLowerCase(),
          paymentReleasedAt: item?.paymentReleasedAt || null,
          paymentReferenceId: item?.paymentReferenceId || null,
          index,
        };
      })
      .filter(Boolean);
  }

  const payeeIds = await getContractHustlerIds(contract);
  if (!payeeIds.length) {
    return [];
  }

  const grossShares = splitAmount(contract?.amount || 0, payeeIds.length);
  const commissionShares = splitAmount((Number(contract?.amount || 0) * HUSTLER_COMMISSION_RATE), payeeIds.length);
  return payeeIds.map((user, index) => ({
    user,
    grossAmount: grossShares[index],
    commissionAmount: commissionShares[index],
    netAmount: Number((grossShares[index] - commissionShares[index]).toFixed(2)),
    paymentStatus: "pending",
    paymentReleasedAt: null,
    paymentReferenceId: null,
    index,
  }));
}

async function resolveDisputeRecipient(contract, dispute, targetHustlerId = null) {
  const ledger = await getDisputePayoutLedger(contract);
  const targetIds = uniqueIds([
    asString(dispute?.raisedBy),
    asString(targetHustlerId),
    asString(dispute?.metadata?.targetHustlerId),
    asString(dispute?.assignedTo),
  ]);

  let recipient = ledger.find((entry) => targetIds.includes(entry.user)) || null;
  if (!recipient && ledger.length > 1) {
    const pendingRecipients = ledger.filter((entry) => String(entry.paymentStatus || "").toLowerCase() !== PAYMENT_STATUSES.RELEASED);
    if (pendingRecipients.length === 1) {
      recipient = pendingRecipients[0];
    }
  }
  if (!recipient && ledger.length === 1) {
    recipient = ledger[0];
  }
  if (!recipient) {
    throw new ApiError(HTTP_STATUS.UNPROCESSABLE_ENTITY, "Select the hustler linked to this dispute before releasing payment");
  }

  if (!mongoose.isValidObjectId(recipient.user)) {
    throw new ApiError(HTTP_STATUS.UNPROCESSABLE_ENTITY, "Selected hustler record is invalid");
  }

  return { recipient, ledger };
}

async function releaseDisputePayment(contract, dispute, actorId, session, referenceId, targetHustlerId = null) {
  if (!contract?.escrowWallet || !mongoose.isValidObjectId(contract.escrowWallet)) {
    throw new ApiError(HTTP_STATUS.CONFLICT, "This contract does not have a valid escrow wallet");
  }
  const escrowWallet = await financialService.applySession(Wallet.findById(contract.escrowWallet), session);
  if (!escrowWallet) throw new ApiError(HTTP_STATUS.NOT_FOUND, "Escrow wallet not found");
  if (escrowWallet.lockedBalance <= 0) {
    throw new ApiError(HTTP_STATUS.CONFLICT, "No locked escrow funds are available");
  }

  const { recipient, ledger } = await resolveDisputeRecipient(contract, dispute, targetHustlerId);
  const recipientGross = Number(recipient.grossAmount || 0);
  const recipientCommission = Number(recipient.commissionAmount || Number((recipientGross * HUSTLER_COMMISSION_RATE).toFixed(2)));
  const recipientNet = Number(recipient.netAmount || Number((recipientGross - recipientCommission).toFixed(2)));
  if (String(recipient.paymentStatus || "").toLowerCase() === PAYMENT_STATUSES.RELEASED) {
    throw new ApiError(HTTP_STATUS.CONFLICT, "Selected hustler payment has already been released");
  }
  if (!contract?.currency) {
    throw new ApiError(HTTP_STATUS.CONFLICT, "This contract is missing a currency");
  }
  if (recipientGross <= 0) {
    throw new ApiError(HTTP_STATUS.CONFLICT, "No payable amount is available for the selected hustler");
  }
  if (escrowWallet.lockedBalance < recipientGross) {
    throw new ApiError(HTTP_STATUS.CONFLICT, "Insufficient locked escrow funds");
  }

  const recipientWallet = await financialService.getOrCreateWallet(recipient.user, contract.currency, WALLET_TYPES.USER, session);
  const platformWallet = await financialService.getPlatformWallet(contract.currency, session);
  const beforeEscrow = escrowWallet.toObject();
  const beforeRecipient = recipientWallet.toObject();
  const beforePlatform = platformWallet.toObject();

  escrowWallet.lockedBalance -= recipientGross;
  escrowWallet.balance -= recipientGross;
  recipientWallet.availableBalance += recipientNet;
  recipientWallet.balance += recipientNet;
  platformWallet.availableBalance += recipientCommission;
  platformWallet.balance += recipientCommission;

  const now = new Date();
  const updatedDisbursements = ledger.map((entry) => ({
    hustler: entry.user,
    grossAmount: entry.grossAmount,
    commissionAmount: entry.commissionAmount,
    netAmount: entry.netAmount,
    paymentStatus: String(entry.user) === String(recipient.user) ? PAYMENT_STATUSES.RELEASED : entry.paymentStatus || PAYMENT_STATUSES.PENDING,
    paymentReleasedAt: String(entry.user) === String(recipient.user) ? now : entry.paymentReleasedAt || null,
    paymentReferenceId: String(entry.user) === String(recipient.user) ? referenceId : entry.paymentReferenceId || null,
  }));

  const pendingDisbursements = updatedDisbursements.filter((entry) => String(entry.paymentStatus || "").toLowerCase() !== PAYMENT_STATUSES.RELEASED);
  const anyPending = pendingDisbursements.length > 0;
  contract.escrowReleasedAmount = Number(contract.escrowReleasedAmount || 0) + recipientGross;
  contract.escrowStatus = anyPending ? ESCROW_STATUSES.IN_PROGRESS : ESCROW_STATUSES.RELEASED;
  contract.status = anyPending ? contract.status || CONTRACT_STATUSES.DISPUTED : CONTRACT_STATUSES.COMPLETED;
  if (!anyPending) {
    contract.completedAt = now;
    contract.finalApprovedBy = actorId;
    contract.finalApprovedAt = now;
  }
  contract.metadata = {
    ...(contract.metadata || {}),
    disbursements: updatedDisbursements,
    disputeOutcome: "release_full_payment",
    disputeRecipientId: recipient.user,
    disputePaymentGrossAmount: recipientGross,
    disputePaymentCommissionAmount: recipientCommission,
    disputePaymentNetAmount: recipientNet,
    disputePaymentReferenceId: referenceId,
    disputePaymentReleasedAt: now,
    disputeRemainingWorkers: pendingDisbursements.length,
  };

  await escrowWallet.save({ session });
  await recipientWallet.save({ session });
  await platformWallet.save({ session });
  await contract.save({ session });

  const milestone = await financialService.applySession(
    Milestone.findOne({
      contract: contract._id,
      $or: [{ submittedBy: recipient.user }, { assignedTo: recipient.user }],
    }).sort({ updatedAt: -1, createdAt: -1 }),
    session
  );
  if (milestone) {
    milestone.status = MILESTONE_STATUSES.APPROVED;
    milestone.workStatus = WORK_STATUS.APPROVED;
    milestone.paymentStatus = PAYMENT_STATUSES.RELEASED;
    milestone.approvedBy = actorId;
    milestone.approvedAt = now;
    milestone.paymentMetadata = {
      ...(milestone.paymentMetadata || {}),
      releasedBy: actorId,
      releasedAt: now,
      releaseReferenceId: referenceId,
      disputeId: dispute?._id || null,
      disputeOutcome: "release_full_payment",
    };
    await milestone.save({ session });
  }

  const txOptions = session ? { session } : {};
  const [escrowTransaction, recipientTransaction, platformTransaction] = await Transaction.create(
    [
      {
        wallet: escrowWallet._id,
        user: actorId,
        contract: contract._id,
        type: TRANSACTION_TYPES.DEBIT,
        amount: recipientGross,
        currency: contract.currency,
        status: TRANSACTION_STATUSES.COMPLETED,
        referenceId: `${referenceId}-dispute-escrow`,
        description: "Dispute payment released from escrow",
        balanceAfter: escrowWallet.balance,
        metadata: {
          disputeId: dispute?._id || dispute?.id || null,
          recipientId: recipient.user,
          grossAmount: recipientGross,
        },
      },
      {
        wallet: recipientWallet._id,
        user: recipient.user,
        contract: contract._id,
        type: TRANSACTION_TYPES.CREDIT,
        amount: recipientNet,
        currency: contract.currency,
        status: TRANSACTION_STATUSES.COMPLETED,
        referenceId: `${referenceId}-dispute-recipient`,
        description: "Dispute payment credited to hustler wallet",
        balanceAfter: recipientWallet.balance,
        metadata: {
          disputeId: dispute?._id || dispute?.id || null,
          grossAmount: recipientGross,
          commissionAmount: recipientCommission,
        },
      },
      {
        wallet: platformWallet._id,
        user: platformWallet.owner,
        contract: contract._id,
        type: TRANSACTION_TYPES.COMMISSION,
        amount: recipientCommission,
        currency: contract.currency,
        status: TRANSACTION_STATUSES.COMPLETED,
        referenceId: `${referenceId}-dispute-platform`,
        description: "Platform commission from dispute payout",
        balanceAfter: platformWallet.balance,
        metadata: {
          disputeId: dispute?._id || dispute?.id || null,
          recipientId: recipient.user,
          grossAmount: recipientGross,
        },
      },
    ],
    txOptions
  );

  await financialService.createAuditLog(
    actorId,
    AUDIT_ACTIONS.TRANSACTION,
    ENTITY_TYPES.CONTRACT,
    contract._id,
    { before: { escrowWallet: beforeEscrow, recipientWallet: beforeRecipient, platformWallet: beforePlatform } },
    { after: { contract: contract.toObject() } },
    {
      action: "releaseDisputePayment",
      recipientId: recipient.user,
      grossAmount: recipientGross,
      commissionAmount: recipientCommission,
      netAmount: recipientNet,
      remainingWorkers: pendingDisbursements.length,
    },
    session
  );

  return {
    recipient,
    ledger: updatedDisbursements,
    escrowWallet,
    recipientWallet,
    platformWallet,
    escrowTransaction,
    recipientTransaction,
    platformTransaction,
    grossAmount: recipientGross,
    commissionAmount: recipientCommission,
    netAmount: recipientNet,
    contract,
  };
}

function normalizeAttachments(attachments = []) {
  return Array.isArray(attachments)
    ? attachments
        .filter((attachment) => attachment && typeof attachment === "object")
        .map((attachment) => ({
          name: String(attachment.name || "attachment").trim(),
          type: String(attachment.type || "application/octet-stream").trim(),
          size: Number(attachment.size) || 0,
          dataUrl: String(attachment.dataUrl || "").trim(),
          notes: String(attachment.notes || "").trim(),
        }))
        .filter((attachment) => attachment.name && attachment.dataUrl)
    : [];
}

async function getActiveAdminIds() {
  const admins = await User.find({ role: USER_ROLES.ADMIN, isActive: true }).select("_id").lean();
  return admins.map((admin) => String(admin._id)).filter(Boolean);
}

async function getContractHustlerIds(contract) {
  const acceptedApplications = await ContractApplication.find({
    contractId: contract._id,
    status: { $in: ["accepted", "approved", "active", "in_progress"] },
  })
    .select("hustlerId")
    .lean();

  const milestones = await Milestone.find({ contract: contract._id }).select("assignedTo submittedBy").lean();

  const acceptedIds = acceptedApplications.map((application) => asString(application.hustlerId)).filter(Boolean);
  const milestoneIds = milestones.flatMap((milestone) => [asString(milestone.assignedTo), asString(milestone.submittedBy)]);
  const metadataIds = Array.isArray(contract?.metadata?.acceptedHustlers) ? contract.metadata.acceptedHustlers.map(asString) : [];
  const assignedHustlerIds = Array.isArray(contract?.assignedHustlers) ? contract.assignedHustlers.map(asString) : [];
  const acceptedHustlerIds = Array.isArray(contract?.acceptedHustlers) ? contract.acceptedHustlers.map(asString) : [];
  const populatedIds = Array.isArray(contract?.acceptedHustlers)
    ? contract.acceptedHustlers.map((hustler) => asString(hustler?._id || hustler?.id || hustler))
    : [];

  const participantIds = uniqueIds([
    ...acceptedIds,
    ...milestoneIds,
    ...metadataIds,
    ...assignedHustlerIds,
    ...acceptedHustlerIds,
    ...populatedIds,
    contract.seller,
  ]);

  return participantIds;
}

async function getContractHustlerDetails(contract) {
  const hustlerIds = await getContractHustlerIds(contract);
  if (!hustlerIds.length) return [];

  const validIds = hustlerIds.filter((hustlerId) => mongoose.isValidObjectId(hustlerId));
  const hustlers = validIds.length
    ? await User.find({ _id: { $in: validIds } })
        .select("firstName lastName email role avatar")
        .lean()
    : [];

  const byId = hustlers.reduce((accumulator, hustler) => {
    accumulator[String(hustler._id)] = hustler;
    return accumulator;
  }, {});

  return hustlerIds.map((hustlerId) => {
    const hustler = byId[String(hustlerId)];
    return hustler
      ? { ...hustler, _id: hustler._id, id: hustler._id }
      : { _id: hustlerId, id: hustlerId, firstName: "", lastName: "", email: "", role: USER_ROLES.HUSTLER };
  });
}

function hasSubmittedWork(contract) {
  const milestones = Array.isArray(contract?.milestones) ? contract.milestones : [];
  return milestones.some((milestone) => ["submitted", "work_submitted"].includes(String(milestone?.status || milestone?.workStatus || "").toLowerCase()));
}

function canOpenDispute(contract) {
  const status = String(contract?.status || "").toLowerCase();
  if ([CONTRACT_STATUSES.CANCELLED, CONTRACT_STATUSES.COMPLETED, CONTRACT_STATUSES.TERMINATED].includes(status)) {
    return false;
  }
  return ["active", "assigned", "approved", CONTRACT_STATUSES.DISPUTED].includes(status) || hasSubmittedWork(contract);
}

async function assertDisputeAccess(contract, actorId) {
  const buyerId = asString(contract?.buyer);
  const hustlerIds = await getContractHustlerIds(contract);
  const participantIds = uniqueIds([buyerId, ...hustlerIds]);
  if (!participantIds.includes(String(actorId))) {
    throw new ApiError(HTTP_STATUS.FORBIDDEN, "Only the manager or assigned hustlers can open a dispute");
  }
  return { buyerId, hustlerIds, participantIds };
}

async function canActorAccessDispute(dispute, actorId, actorRole = "") {
  if (!dispute) return false;
  if (String(actorRole || "").toLowerCase() === USER_ROLES.ADMIN) return true;

  const contract = dispute.contract || {};
  const buyerId = asString(contract.buyer);
  const participantIds = uniqueIds([
    buyerId,
    ...(Array.isArray(contract.assignedHustlers) ? contract.assignedHustlers.map(asString) : []),
    ...(Array.isArray(contract.acceptedHustlers) ? contract.acceptedHustlers.map(asString) : []),
    ...(Array.isArray(contract.metadata?.acceptedHustlers) ? contract.metadata.acceptedHustlers.map(asString) : []),
    asString(dispute.raisedBy),
    asString(dispute.assignedTo),
    ...(Array.isArray(dispute.metadata?.participantIds) ? dispute.metadata.participantIds : []),
  ]);

  return participantIds.includes(String(actorId));
}

async function populateDispute(dispute) {
  if (!dispute) return null;
  const populated = await Dispute.findById(dispute._id || dispute.id)
    .populate({
      path: "contract",
      select: "title description amount currency status escrowStatus escrowPrepared disputedAt buyer seller numWorkers workLocation jobCategory metadata acceptedHustlers assignedHustlers",
      populate: [
        { path: "buyer", select: "firstName lastName email role avatar" },
        { path: "seller", select: "firstName lastName email role avatar" },
      ],
    })
    .populate("raisedBy", "firstName lastName email role avatar")
    .populate("assignedTo", "firstName lastName email role avatar")
    .populate("resolvedBy", "firstName lastName email role avatar")
    .populate("evidenceRequests.requestedBy", "firstName lastName email role avatar")
    .populate("evidenceRequests.responses.respondedBy", "firstName lastName email role avatar")
    .populate("timeline.actor", "firstName lastName email role avatar")
    .lean();
  if (populated?.contract) {
    populated.contract.assignedHustlers = await getContractHustlerDetails(populated.contract);
  }
  return populated;
}

function shouldAutoCloseManagerApprovedDispute(dispute) {
  const status = String(dispute?.status || "").toLowerCase();
  const contractStatus = String(dispute?.contract?.status || "").toLowerCase();
  const escrowStatus = String(dispute?.contract?.escrowStatus || "").toLowerCase();
  const managerApprovedBy = asString(dispute?.metadata?.managerApprovedBy || dispute?.resolvedBy || dispute?.contract?.buyer);
  const hasManagerApproval = Boolean(
    dispute?.metadata?.managerApprovedMilestoneId ||
      dispute?.metadata?.managerApprovedAt ||
      dispute?.metadata?.managerApprovedBy ||
      dispute?.resolvedBy ||
      dispute?.resolvedAt ||
      managerApprovedBy
  );

  return status === "open" && hasManagerApproval && contractStatus === "completed" && escrowStatus === "released";
}

async function finalizeManagerApprovedDispute(dispute, session = null) {
  if (!dispute || !shouldAutoCloseManagerApprovedDispute(dispute)) return dispute;
  const now = new Date();
  dispute.status = DISPUTE_STATUSES.CLOSED;
  dispute.resolutionType = "manager_approved";
  dispute.adminNotes = dispute.adminNotes || "Manager approved the work.";
  dispute.resolution = dispute.resolution || "Manager approved the work and the dispute was closed.";
  dispute.resolvedAt = dispute.resolvedAt || now;
  dispute.resolvedBy = dispute.resolvedBy || dispute.contract?.buyer || null;
  dispute.metadata = {
    ...(dispute.metadata || {}),
    managerApprovedAt: now,
    managerApprovedBy: dispute.resolvedBy || dispute.contract?.buyer || null,
  };
  dispute.timeline = Array.isArray(dispute.timeline) ? dispute.timeline : [];
  dispute.timeline.push(
    createTimelineEvent(
      "manager_approved",
      "Manager approved the work",
      "The manager approved the submission and the dispute was closed.",
      dispute.contract?.buyer || null,
      DISPUTE_STATUSES.CLOSED,
      {
        contractId: dispute.contract?._id || null,
      }
    )
  );
  await dispute.save(session ? { session } : {});
  return dispute;
}

async function getDisputeThread(conversationId, userId, skipParticipantCheck = false) {
  if (!conversationId) return null;
  const conversation = await Conversation.findById(conversationId).lean();
  if (!conversation) return null;
  if (userId && !skipParticipantCheck) {
    const participants = Array.isArray(conversation.participants) ? conversation.participants.map(String) : [];
    if (!participants.includes(String(userId))) {
      throw new ApiError(HTTP_STATUS.FORBIDDEN, "You cannot access this dispute thread");
    }
  }
  const messages = await Message.find({ conversationId }).sort({ createdAt: 1 }).populate("senderId", "firstName lastName email role avatar").lean();
  return { conversation, messages };
}

async function createDisputeThread({ contract, actorId, dispute, summaryText }) {
  const adminIds = await getActiveAdminIds();
  const participantIds = uniqueIds([contract.buyer, actorId, ...adminIds]);
  const conversation = await Conversation.create({
    participants: participantIds,
    metadata: {
      disputeThread: true,
      disputeId: dispute._id,
      contractId: contract._id,
    },
  });

  const conversationId = conversation._id;
  const initialMessage = await Message.create({
    conversationId,
    senderId: actorId,
    text: summaryText,
    attachments: normalizeAttachments(dispute.evidence),
    read: false,
  });
  notifications.emit("message.received", { message: initialMessage.toObject() });

  dispute.conversationId = conversationId;
  await dispute.save();
  return conversation;
}

async function buildDisputeSummary({ reason, details, requestedResolution }) {
  return [
    `Dispute opened`,
    `Reason: ${reason}`,
    requestedResolution ? `Requested resolution: ${requestedResolution}` : null,
    details ? `Details: ${details}` : null,
  ].filter(Boolean).join("\n");
}

async function refundRemainingEscrow(contract, dispute, actorId, session, referenceId, targetHustlerId = null) {
  const escrowWallet = await financialService.applySession(Wallet.findById(contract.escrowWallet), session);
  if (!escrowWallet) throw new ApiError(HTTP_STATUS.NOT_FOUND, "Escrow wallet not found");
  const { recipient } = await resolveDisputeRecipient(contract, dispute, targetHustlerId);
  const refundAmount = Number(recipient?.grossAmount || 0);
  if (refundAmount <= 0) {
    throw new ApiError(HTTP_STATUS.CONFLICT, "No refundable disputed amount is available");
  }
  if (escrowWallet.lockedBalance < refundAmount) {
    throw new ApiError(HTTP_STATUS.CONFLICT, "No locked escrow funds are available");
  }

  const beforeEscrow = escrowWallet.toObject();

  escrowWallet.lockedBalance -= refundAmount;
  escrowWallet.availableBalance += refundAmount;
  escrowWallet.balance = escrowWallet.availableBalance + escrowWallet.lockedBalance;

  await escrowWallet.save({ session });

  contract.escrowRefundedAmount += refundAmount;
  contract.escrowStatus = escrowWallet.lockedBalance > 0 ? ESCROW_STATUSES.IN_PROGRESS : ESCROW_STATUSES.RELEASED;
  contract.status = CONTRACT_STATUSES.COMPLETED;
  contract.completedAt = new Date();
  contract.metadata = {
    ...(contract.metadata || {}),
    disputeOutcome: "refund_manager",
    disputeRefundAmount: refundAmount,
    disputeRefundDestination: "escrow_available",
    disputeRefundRecipientId: recipient.user,
  };
  await contract.save({ session });

  const txOptions = session ? { session } : {};
  const [escrowTx] = await Transaction.create(
    [
      {
        wallet: escrowWallet._id,
        user: actorId,
        contract: contract._id,
        type: TRANSACTION_TYPES.REFUND,
        amount: refundAmount,
        currency: contract.currency,
        status: TRANSACTION_STATUSES.COMPLETED,
        referenceId: `${referenceId}-escrow-refund`,
        description: "Disputed hustler share returned to available escrow balance",
        balanceAfter: escrowWallet.balance,
      },
    ],
    txOptions
  );

  await financialService.createAuditLog(
    actorId,
    AUDIT_ACTIONS.TRANSACTION,
    ENTITY_TYPES.CONTRACT,
    contract._id,
    { before: { escrowWallet: beforeEscrow } },
    { after: { contract: contract.toObject() } },
    { action: "refundDispute", amount: refundAmount },
    session
  );

  return { refundAmount, escrowWallet, escrowTx, recipient };
}

async function markRefundedMilestone(contract, recipientId, actorId, dispute, note, refundedAmount, session) {
  const milestone = await financialService.applySession(
    Milestone.findOne({
      contract: contract._id,
      $or: [{ submittedBy: recipientId }, { assignedTo: recipientId }],
    }).sort({ updatedAt: -1, createdAt: -1 }),
    session
  );

  if (!milestone) return null;

  milestone.status = MILESTONE_STATUSES.REJECTED;
  milestone.workStatus = WORK_STATUS.REJECTED;
  milestone.paymentStatus = PAYMENT_STATUSES.REFUNDED;
  milestone.paymentMetadata = {
    ...(milestone.paymentMetadata || {}),
    refundedBy: actorId,
    refundedAt: new Date(),
    refundedAmount,
    disputeId: dispute?._id || null,
    disputeReason: dispute?.reason || "",
    refundNote: note || "Refunded to manager",
    disputeOutcome: "refund_manager",
  };
  await milestone.save({ session });
  return milestone;
}

async function splitRemainingEscrow(contract, actorId, session, referenceId, splitRatio = 50) {
  const escrowWallet = await financialService.applySession(Wallet.findById(contract.escrowWallet), session);
  if (!escrowWallet) throw new ApiError(HTTP_STATUS.NOT_FOUND, "Escrow wallet not found");
  if (escrowWallet.lockedBalance <= 0) {
    throw new ApiError(HTTP_STATUS.CONFLICT, "No locked escrow funds are available");
  }

  const remainingAmount = Number(escrowWallet.lockedBalance.toFixed(2));
  const buyerShare = Number(Math.max(0, Math.min(100, Number(splitRatio) || 50)).toFixed(2));
  const buyerAmount = Number((remainingAmount * (buyerShare / 100)).toFixed(2));
  const hustlerIds = await getContractHustlerIds(contract);
  const hustlerCount = Math.max(1, hustlerIds.length);
  const hustlerPool = Number((remainingAmount - buyerAmount).toFixed(2));
  const hustlerAmountEach = Number((hustlerPool / hustlerCount).toFixed(2));

  const buyerWallet = await financialService.getOrCreateWallet(contract.buyer, contract.currency, WALLET_TYPES.USER, session);
  const hustlerWallets = [];
  for (const hustlerId of hustlerIds.length ? hustlerIds : [contract.seller]) {
    if (hustlerId) {
      hustlerWallets.push(await financialService.getOrCreateWallet(hustlerId, contract.currency, WALLET_TYPES.USER, session));
    }
  }

  const beforeEscrow = escrowWallet.toObject();
  const beforeBuyer = buyerWallet.toObject();
  const beforeHustlers = hustlerWallets.map((wallet) => wallet.toObject());

  escrowWallet.lockedBalance -= remainingAmount;
  escrowWallet.balance -= remainingAmount;
  buyerWallet.availableBalance += buyerAmount;
  buyerWallet.balance += buyerAmount;
  hustlerWallets.forEach((wallet) => {
    wallet.availableBalance += hustlerAmountEach;
    wallet.balance += hustlerAmountEach;
  });

  await escrowWallet.save({ session });
  await buyerWallet.save({ session });
  for (const wallet of hustlerWallets) {
    await wallet.save({ session });
  }

  contract.escrowRefundedAmount += buyerAmount;
  contract.escrowReleasedAmount += remainingAmount - buyerAmount;
  contract.status = CONTRACT_STATUSES.TERMINATED;
  contract.escrowStatus = ESCROW_STATUSES.RELEASED;
  contract.metadata = {
    ...(contract.metadata || {}),
    disputeOutcome: "split",
    disputeSplitRatio: buyerShare,
    disputeSplitBuyerAmount: buyerAmount,
    disputeSplitHustlerAmount: hustlerAmountEach,
    disputeSplitHustlerCount: hustlerWallets.length,
  };
  await contract.save({ session });

  const txOptions = session ? { session } : {};
  const transactions = await Transaction.create(
    [
      {
        wallet: escrowWallet._id,
        user: actorId,
        contract: contract._id,
        type: TRANSACTION_TYPES.DEBIT,
        amount: remainingAmount,
        currency: contract.currency,
        status: TRANSACTION_STATUSES.COMPLETED,
        referenceId: `${referenceId}-escrow-split`,
        description: "Escrow split during dispute resolution",
        balanceAfter: escrowWallet.balance,
      },
      {
        wallet: buyerWallet._id,
        user: actorId,
        contract: contract._id,
        type: TRANSACTION_TYPES.REFUND,
        amount: buyerAmount,
        currency: contract.currency,
        status: TRANSACTION_STATUSES.COMPLETED,
        referenceId: `${referenceId}-buyer-split`,
        description: "Manager share credited during dispute split",
        balanceAfter: buyerWallet.balance,
      },
      ...hustlerWallets.map((wallet, index) => ({
        wallet: wallet._id,
        user: hustlerIds[index] || contract.seller,
        contract: contract._id,
        type: TRANSACTION_TYPES.CREDIT,
        amount: hustlerAmountEach,
        currency: contract.currency,
        status: TRANSACTION_STATUSES.COMPLETED,
        referenceId: `${referenceId}-hustler-split-${index + 1}`,
        description: "Hustler share credited during dispute split",
        balanceAfter: wallet.balance,
      })),
    ],
    txOptions
  );

  await financialService.createAuditLog(
    actorId,
    AUDIT_ACTIONS.TRANSACTION,
    ENTITY_TYPES.CONTRACT,
    contract._id,
    { before: { escrowWallet: beforeEscrow, buyerWallet: beforeBuyer, hustlerWallets: beforeHustlers } },
    { after: { contract: contract.toObject() } },
    { action: "splitDispute", amount: remainingAmount, buyerAmount, hustlerAmountEach, hustlerCount: hustlerWallets.length },
    session
  );

  // Update each hustler's milestone to reflect the split settlement
  const allHustlerIds = hustlerIds.length ? hustlerIds : (contract.seller ? [asString(contract.seller)] : []);
  for (const hustlerId of allHustlerIds) {
    if (!hustlerId) continue;
    const milestone = await financialService.applySession(
      Milestone.findOne({
        contract: contract._id,
        $or: [{ assignedTo: hustlerId }, { submittedBy: hustlerId }],
      }).sort({ updatedAt: -1, createdAt: -1 }),
      session
    );
    if (milestone) {
      milestone.status = MILESTONE_STATUSES.APPROVED;
      milestone.workStatus = WORK_STATUS.APPROVED;
      milestone.paymentStatus = PAYMENT_STATUSES.RELEASED;
      milestone.paymentMetadata = {
        ...(milestone.paymentMetadata || {}),
        settledBy: actorId,
        settledAt: new Date(),
        disputeOutcome: "split",
        splitHustlerAmount: hustlerAmountEach,
        splitRatio: buyerShare,
      };
      await milestone.save({ session });
    }
  }

  return { remainingAmount, buyerAmount, hustlerAmountEach, escrowWallet, buyerWallet, hustlerWallets, transactions };
}

export const disputeService = {
  async createDispute(payload, actor) {
    const contractId = payload.contractId || payload.contract;
    const actorId = asString(actor);
    if (!contractId) {
      throw new ApiError(HTTP_STATUS.UNPROCESSABLE_ENTITY, "Contract is required");
    }
    if (!actorId) {
      throw new ApiError(HTTP_STATUS.UNAUTHORIZED, "Authentication required");
    }

    const contract = await Contract.findById(contractId).populate("buyer seller milestones");
    if (!contract) {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, "Contract not found");
    }

    if (!canOpenDispute(contract)) {
      throw new ApiError(HTTP_STATUS.CONFLICT, "Disputes can only be opened for active or submitted contracts");
    }

    const { buyerId, hustlerIds, participantIds } = await assertDisputeAccess(contract, actorId);
    const actorIsHustler = hustlerIds.includes(actorId);
    const targetHustlerId = actorIsHustler ? actorId : null;

    const existing = await Dispute.findOne({
      contract: contract._id,
      raisedBy: actorId,
      status: { $in: [DISPUTE_STATUSES.OPEN, DISPUTE_STATUSES.WAITING_FOR_RESPONSE, DISPUTE_STATUSES.UNDER_REVIEW, DISPUTE_STATUSES.APPEALED, DISPUTE_STATUSES.RESOLVED] },
    }).sort({ createdAt: -1 });
    if (existing) {
      return populateDispute(existing);
    }

    const reason = String(payload.reason || "").trim();
    const details = String(payload.details || payload.description || "").trim();
    const requestedResolution = String(payload.requestedResolution || "").trim();
    if (!reason) {
      throw new ApiError(HTTP_STATUS.UNPROCESSABLE_ENTITY, "Dispute reason is required");
    }

    const evidence = normalizeAttachments(payload.attachments || payload.evidence || []);
    const dispute = await Dispute.create({
      contract: contract._id,
      raisedBy: actorId,
      assignedTo: targetHustlerId,
      status: DISPUTE_STATUSES.OPEN,
      reason,
      details,
      requestedResolution,
      evidence,
      conversationId: null,
      timeline: [createTimelineEvent("opened", "Dispute opened", reason, actorId, DISPUTE_STATUSES.OPEN, { buyerId, hustlerIds, participantIds })],
      metadata: {
        participantIds,
        raisedBy: actorId,
        targetHustlerId,
        disputeContractId: contract._id,
      },
    });

    const summaryText = await buildDisputeSummary({ reason, details, requestedResolution });
    await createDisputeThread({ contract, actorId, dispute, summaryText });

    notifications.emit("dispute.created", { dispute: dispute.toObject(), contract });
    return populateDispute(dispute);
  },

  async listDisputes(actor) {
    const actorId = asString(actor);
    const role = String(actor?.role || "").toLowerCase();
    let disputes = await Dispute.find()
      .sort({ createdAt: -1 })
      .populate("contract", "title description amount currency status escrowStatus escrowPrepared disputedAt buyer seller numWorkers workLocation jobCategory metadata acceptedHustlers assignedHustlers")
      .populate("raisedBy", "firstName lastName email role avatar")
      .populate("assignedTo", "firstName lastName email role avatar")
      .populate("timeline.actor", "firstName lastName email role avatar")
      .lean();

    if (role !== USER_ROLES.ADMIN) {
      const filteredDisputes = [];
      for (const dispute of disputes) {
        const contract = dispute.contract || {};
        const buyerId = asString(contract.buyer);
        const hustlerIds = await getContractHustlerIds(contract);
        const participantIds = uniqueIds([buyerId, ...hustlerIds, asString(dispute.raisedBy), asString(dispute.assignedTo), ...(Array.isArray(dispute.metadata?.participantIds) ? dispute.metadata.participantIds : [])]);
        if (participantIds.includes(actorId)) {
          filteredDisputes.push(dispute);
        }
      }
      disputes = filteredDisputes;
    } else {
      for (let index = 0; index < disputes.length; index += 1) {
        if (shouldAutoCloseManagerApprovedDispute(disputes[index])) {
          const doc = await Dispute.findById(disputes[index]._id).populate("contract");
          if (doc) {
            await finalizeManagerApprovedDispute(doc);
            disputes[index].status = doc.status;
            disputes[index].resolutionType = doc.resolutionType;
            disputes[index].adminNotes = doc.adminNotes;
            disputes[index].resolution = doc.resolution;
            disputes[index].resolvedBy = doc.resolvedBy;
            disputes[index].resolvedAt = doc.resolvedAt;
            disputes[index].metadata = doc.metadata;
          }
        }
      }
    }

    return disputes;
  },

  async getDispute(disputeId, actor) {
    const baseDispute = await Dispute.findById(disputeId);
    if (baseDispute) {
      await baseDispute.populate("contract");
      await finalizeManagerApprovedDispute(baseDispute);
    }
    const dispute = await populateDispute(baseDispute);
    if (!dispute) {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, "Dispute not found");
    }

    const actorId = asString(actor);
    const actorRole = String(actor?.role || "").toLowerCase();
    if (!(await canActorAccessDispute(dispute, actorId, actorRole))) {
      throw new ApiError(HTTP_STATUS.FORBIDDEN, "You cannot access this dispute");
    }

    const thread = await getDisputeThread(dispute.conversationId, asString(actor), String(actor?.role || "").toLowerCase() === USER_ROLES.ADMIN);
    return { dispute, thread };
  },

  async getDisputeForContract(contractId, actor) {
    const actorId = asString(actor);
    const role = String(actor?.role || "").toLowerCase();
    const contract = await Contract.findById(contractId).select("buyer").lean();
    if (!contract) return null;

    let query = { contract: contractId };
    if (role !== USER_ROLES.ADMIN && String(contract.buyer || "") !== actorId) {
      query = {
        contract: contractId,
        $or: [{ raisedBy: actorId }, { assignedTo: actorId }, { "metadata.participantIds": actorId }],
      };
    }

    const dispute = await Dispute.findOne(query).sort({ createdAt: -1 });
    if (!dispute) return null;
    return this.getDispute(dispute._id, actor);
  },

  async addEvidence(disputeId, actor, payload) {
    const actorId = asString(actor);
    const dispute = await Dispute.findById(disputeId);
    if (!dispute) throw new ApiError(HTTP_STATUS.NOT_FOUND, "Dispute not found");
    const contract = await Contract.findById(dispute.contract).populate("buyer seller milestones");
    if (!contract) throw new ApiError(HTTP_STATUS.NOT_FOUND, "Contract not found");
    const { participantIds } = await assertDisputeAccess(contract, actorId).catch((err) => {
      if (String(actor?.role || "").toLowerCase() === USER_ROLES.ADMIN) return { participantIds: [] };
      throw err;
    });

    const notes = String(payload.notes || payload.message || payload.responseMessage || "").trim();
    const attachments = normalizeAttachments(payload.attachments || []);
    if (!attachments.length) {
      throw new ApiError(HTTP_STATUS.UNPROCESSABLE_ENTITY, "At least one evidence file is required");
    }

    const requestId = String(payload.requestId || payload.evidenceRequestId || "").trim();
    if (requestId && !notes) {
      throw new ApiError(HTTP_STATUS.UNPROCESSABLE_ENTITY, "A response message is required");
    }
    const evidenceRequests = Array.isArray(dispute.evidenceRequests) ? dispute.evidenceRequests : [];
    const activeRequest = requestId
      ? evidenceRequests.find((request) => String(request.requestId) === requestId)
      : getLatestPendingEvidenceRequest(dispute, actorId);
    if (requestId && !activeRequest) {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, "Evidence request not found");
    }

    if (activeRequest) {
      const recipientIds = Array.isArray(activeRequest.recipientIds) ? activeRequest.recipientIds.map(asString) : [];
      if (String(activeRequest.status || "pending").toLowerCase() !== "pending" && requestId) {
        throw new ApiError(HTTP_STATUS.CONFLICT, "This evidence request is no longer pending");
      }
      if (recipientIds.length && !recipientIds.includes(String(actorId)) && String(actor?.role || "").toLowerCase() !== USER_ROLES.ADMIN) {
        throw new ApiError(HTTP_STATUS.FORBIDDEN, "You cannot respond to this evidence request");
      }
      activeRequest.responses = Array.isArray(activeRequest.responses) ? activeRequest.responses : [];
      activeRequest.responses.push({
        respondedBy: actorId,
        message: notes,
        attachments,
        createdAt: new Date(),
      });
      activeRequest.status = "responded";
      activeRequest.respondedAt = new Date();
      dispute.status = DISPUTE_STATUSES.UNDER_REVIEW;
      dispute.timeline.push(
        createTimelineEvent(
          "evidence_response",
          "Evidence response submitted",
          notes || "Requested evidence was submitted.",
          actorId,
          dispute.status,
          {
            requestId: activeRequest.requestId,
            files: attachments.length,
            participantIds,
          }
        )
      );
    } else {
      dispute.timeline.push(
        createTimelineEvent("evidence_added", "Evidence added", notes || "Supporting evidence uploaded", actorId, dispute.status, { files: attachments.length, participantIds })
      );
    }

    dispute.evidence.push(...attachments.map((attachment) => ({ ...attachment, notes })));
    await dispute.save();

    notifications.emit(activeRequest ? "dispute.evidence_submitted" : "dispute.updated", {
      dispute: dispute.toObject(),
      contract,
      action: activeRequest ? "evidence_submitted" : "evidence_added",
      requestId: activeRequest?.requestId || null,
      evidenceRequest: activeRequest || null,
    });
    return populateDispute(dispute);
  },

  async performAction(disputeId, actor, payload) {
    const actorId = asString(actor);
    const role = String(actor?.role || "").toLowerCase();
    if (role !== USER_ROLES.ADMIN) {
      throw new ApiError(HTTP_STATUS.FORBIDDEN, "Only admins can manage disputes");
    }

    const dispute = await Dispute.findById(disputeId);
    if (!dispute) throw new ApiError(HTTP_STATUS.NOT_FOUND, "Dispute not found");
    const contract = await Contract.findById(dispute.contract).populate("buyer seller milestones");
    if (!contract) throw new ApiError(HTTP_STATUS.NOT_FOUND, "Contract not found");

    const action = String(payload.action || "").trim().toLowerCase();
    const note = String(payload.note || payload.notes || payload.message || "").trim();
    const referenceId = payload.referenceId || null;
    const resolutionType = normalizeResolutionType(action);

    if (requiresAdminNotes(action) && !note) {
      throw new ApiError(HTTP_STATUS.UNPROCESSABLE_ENTITY, "Admin notes are required for this action");
    }

    let outcome = null;
    let actionDetail = note;
    let shouldMarkResolved = false;

    if (action === "under_review") {
      dispute.status = DISPUTE_STATUSES.UNDER_REVIEW;
      dispute.resolutionType = resolutionType;
      dispute.adminNotes = note;
      dispute.resolution = note || "Dispute marked as under review.";
      outcome = "marked_under_review";
    } else if (action === "request_evidence") {
      const rawRecipientRoles = payload.recipientRoles || payload.recipients || payload.recipientRole || payload.targetRoles || "both";
      const recipientRoles = normalizeRecipientRoles(rawRecipientRoles);
      const requiredEvidenceTypes = normalizeEvidenceTypes(payload.requiredEvidenceTypes || payload.evidenceTypes || payload.types || []);
      const responseDeadline = parseDeadline(payload.responseDeadline || payload.deadline || payload.deadlineAt);
      if (!requiredEvidenceTypes.length) {
        throw new ApiError(HTTP_STATUS.UNPROCESSABLE_ENTITY, "Select at least one required evidence type");
      }
      if (!responseDeadline) {
        throw new ApiError(HTTP_STATUS.UNPROCESSABLE_ENTITY, "Response deadline is required");
      }
      const hustlerIds = await getContractHustlerIds(contract);
      const recipientIds = getRequestRecipients(contract, recipientRoles, hustlerIds);
      if (!recipientIds.length) {
        throw new ApiError(HTTP_STATUS.UNPROCESSABLE_ENTITY, "At least one recipient must be selected");
      }

      const requestId = String(payload.requestId || payload.evidenceRequestId || randomUUID()).trim();
      const evidenceRequests = Array.isArray(dispute.evidenceRequests) ? dispute.evidenceRequests : [];
      dispute.evidenceRequests = evidenceRequests;
      dispute.evidenceRequests.push({
        requestId,
        requestedBy: actorId,
        recipientRoles,
        recipientIds,
        message: note,
        requiredEvidenceTypes,
        responseDeadline,
        status: "pending",
        responses: [],
        createdAt: new Date(),
      });
      dispute.status = DISPUTE_STATUSES.WAITING_FOR_EVIDENCE;
      dispute.resolutionType = resolutionType;
      dispute.adminNotes = note;
      dispute.resolution = note || "Additional evidence requested.";
      outcome = "additional_evidence_requested";
      actionDetail = note || "Additional evidence was requested.";
      dispute.timeline.push(
        createTimelineEvent("evidence_request", "Additional evidence requested", actionDetail, actorId, dispute.status, {
          requestId,
          recipientRoles,
          recipientIds,
          requiredEvidenceTypes,
          responseDeadline,
        })
      );
    } else if (action === "release_payment") {
      const releaseReferenceId = referenceId || `dispute-${dispute._id}`;
      let releaseResult;
      try {
        releaseResult = await financialService.safeTransaction(async (session) => {
          const result = await releaseDisputePayment(contract, dispute, actorId, session, releaseReferenceId, payload.targetHustlerId || null);
          dispute.status = DISPUTE_STATUSES.RESOLVED;
          dispute.resolutionType = resolutionType;
          dispute.adminNotes = note;
          dispute.resolution = note || "Payment released to the hustler associated with this dispute.";
          dispute.resolvedBy = actorId;
          dispute.resolvedAt = new Date();
          dispute.metadata = {
            ...(dispute.metadata || {}),
            resolvedPaymentRecipientId: result.recipient?.user || null,
            resolvedPaymentGrossAmount: result.grossAmount,
            resolvedPaymentCommissionAmount: result.commissionAmount,
            resolvedPaymentNetAmount: result.netAmount,
            resolvedPaymentReferenceId: releaseReferenceId,
          };
          await dispute.save({ session });
          return result;
        });
      } catch (error) {
        logger.error("Failed to release dispute payment", error);
        if (error instanceof ApiError) throw error;
        throw new ApiError(HTTP_STATUS.INTERNAL_SERVER_ERROR, error?.message || "Failed to release dispute payment");
      }
      outcome = "payment_released";
      actionDetail = note || "Payment released from escrow.";
      shouldMarkResolved = true;
      notifications.emit("contract.paymentReleased", {
        contract: releaseResult.contract,
        amount: releaseResult.grossAmount,
        recipientPayments: [
          {
            user: releaseResult.recipient.user,
            amount: releaseResult.netAmount,
            netAmount: releaseResult.netAmount,
            grossAmount: releaseResult.grossAmount,
            commissionAmount: releaseResult.commissionAmount,
            recipientId: releaseResult.recipient.user,
          },
        ],
        dispute: dispute.toObject(),
        resolutionType,
      });
    } else if (action === "refund_manager") {
      let refundResult = null;
      await financialService.safeTransaction(async (session) => {
        refundResult = await refundRemainingEscrow(contract, dispute, actorId, session, referenceId || `dispute-${dispute._id}`, payload.targetHustlerId || null);
        await markRefundedMilestone(contract, refundResult.recipient.user, actorId, dispute, note, refundResult.refundAmount, session);
      });
      dispute.status = DISPUTE_STATUSES.RESOLVED;
      dispute.resolutionType = resolutionType;
      dispute.adminNotes = note;
      dispute.resolution = note || "Disputed hustler share returned to the available escrow balance.";
      dispute.resolvedBy = actorId;
      dispute.resolvedAt = new Date();
      outcome = "manager_refunded";
      actionDetail = note || "Disputed hustler share returned to available escrow.";
      shouldMarkResolved = true;
    } else if (action === "split_payment") {
      const splitRatio = Number(payload.splitRatio ?? 50);
      await financialService.safeTransaction(async (session) => {
        await splitRemainingEscrow(contract, actorId, session, referenceId || `dispute-${dispute._id}`, splitRatio);
      });
      dispute.status = DISPUTE_STATUSES.RESOLVED;
      dispute.resolutionType = resolutionType;
      dispute.adminNotes = note;
      dispute.resolution = note || "Remaining escrow split between the parties.";
      dispute.resolvedBy = actorId;
      dispute.resolvedAt = new Date();
      outcome = "payment_split";
      actionDetail = note || `Payment split using a ${splitRatio}% manager share.`;
      shouldMarkResolved = true;
    } else if (action === "close") {
      dispute.status = DISPUTE_STATUSES.CLOSED;
      dispute.resolutionType = resolutionType;
      dispute.adminNotes = note;
      dispute.resolution = note || "Dispute closed by admin.";
      dispute.resolvedBy = actorId;
      dispute.resolvedAt = new Date();
      outcome = "closed";
      actionDetail = note || "Dispute closed by admin.";
      shouldMarkResolved = true;
      contract.status = CONTRACT_STATUSES.COMPLETED;
      contract.completedAt = new Date();
      contract.metadata = {
        ...(contract.metadata || {}),
        disputeOutcome: "closed",
      };
      await contract.save();
      // Mark any still-open hustler milestones so the hustler sees a resolved state
      const hustlerIds = await getContractHustlerIds(contract);
      for (const hustlerId of hustlerIds) {
        if (!hustlerId) continue;
        const milestone = await Milestone.findOne({
          contract: contract._id,
          $or: [{ assignedTo: hustlerId }, { submittedBy: hustlerId }],
          paymentStatus: { $nin: [PAYMENT_STATUSES.RELEASED, PAYMENT_STATUSES.REFUNDED] },
        }).sort({ updatedAt: -1, createdAt: -1 });
        if (milestone) {
          milestone.paymentMetadata = {
            ...(milestone.paymentMetadata || {}),
            closedBy: actorId,
            closedAt: new Date(),
            disputeOutcome: "closed",
          };
          await milestone.save();
        }
      }
    } else {
      throw new ApiError(HTTP_STATUS.UNPROCESSABLE_ENTITY, "Unsupported dispute action");
    }

    if (action !== "request_evidence") {
      dispute.timeline.push(createTimelineEvent("admin_action", action.replace(/_/g, " "), actionDetail, actorId, dispute.status, { outcome }));
    }
    await dispute.save();

    if (action === "request_evidence") {
      if (dispute.conversationId) {
        await Message.create({
          conversationId: dispute.conversationId,
          senderId: actorId,
          text: actionDetail,
          attachments: [],
          read: false,
        });
      }
    }

    const disputePayload = dispute.toObject();
    if (shouldMarkResolved) {
      notifications.emit("dispute.resolved", {
        dispute: disputePayload,
        contract,
        action: outcome,
        resolutionType,
      });
    } else if (action === "request_evidence") {
      notifications.emit("dispute.evidence_requested", {
        dispute: disputePayload,
        contract,
        action: outcome,
        evidenceRequest: disputePayload.evidenceRequests?.[disputePayload.evidenceRequests.length - 1] || null,
      });
    } else {
      notifications.emit("dispute.updated", { dispute: disputePayload, contract, action: outcome });
    }
    return populateDispute(dispute);
  },
};

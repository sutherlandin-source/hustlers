/**
 * Contract Model
 * Represents work agreements between buyers and vendors
 */

import { Schema, model } from "mongoose";
import { getBaseSchemaOptions } from "../../shared/models/BaseSchema.js";
import { CONTRACT_PAYMENT_TYPES, CONTRACT_STATUSES, ESCROW_STATUSES, PAYMENT_RATE_TYPES } from "../../shared/config/constants.js";

function normalizeEscrowStatus(status) {
  const map = {
    "Waiting For Funding": ESCROW_STATUSES.WAITING_FOR_FUNDING,
    Funded: ESCROW_STATUSES.FUNDED,
    "In Progress": ESCROW_STATUSES.IN_PROGRESS,
    "Awaiting Approval": ESCROW_STATUSES.AWAITING_APPROVAL,
    "Payment Released": ESCROW_STATUSES.RELEASED,
  };
  return map[status] || status;
}

function normalizeLegacyPaymentFields(contract) {
  const paymentType = contract.paymentType;
  if (Object.values(PAYMENT_RATE_TYPES).includes(paymentType)) {
    contract.paymentRateType = paymentType;
    contract.paymentType = Object.values(CONTRACT_PAYMENT_TYPES).includes(contract.contractType)
      ? contract.contractType
      : CONTRACT_PAYMENT_TYPES.SINGLE;
  }
}

const contractSchema = new Schema(
  {
    contractId: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
      maxlength: [50, "Contract ID cannot exceed 50 characters"],
    },
    contractNumber: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
    },
    title: {
      type: String,
      required: [true, "Contract title is required"],
      trim: true,
      maxlength: [200, "Contract title cannot exceed 200 characters"],
    },
    description: {
      type: String,
      required: [true, "Contract description is required"],
      trim: true,
      maxlength: [2000, "Contract description cannot exceed 2000 characters"],
    },
    buyer: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    seller: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    numWorkers: {
      type: Number,
      default: 1,
      min: [1, "Number of workers must be at least 1"],
    },
    jobCategory: {
      type: String,
      trim: true,
      maxlength: [50, "Job category cannot exceed 50 characters"],
    },
    workLocation: {
      type: String,
      trim: true,
      maxlength: [200, "Work location cannot exceed 200 characters"],
    },
    contractType: {
      type: String,
      enum: Object.values(CONTRACT_PAYMENT_TYPES),
      default: CONTRACT_PAYMENT_TYPES.SINGLE,
      index: true,
    },
    paymentType: {
      type: String,
      enum: Object.values(CONTRACT_PAYMENT_TYPES),
      default: CONTRACT_PAYMENT_TYPES.SINGLE,
      index: true,
    },
    paymentRateType: {
      type: String,
      enum: Object.values(PAYMENT_RATE_TYPES),
      default: PAYMENT_RATE_TYPES.FIXED,
    },
    amount: {
      type: Number,
      required: [true, "Contract amount is required"],
      min: [0, "Contract amount cannot be negative"],
    },
    currency: {
      type: String,
      required: [true, "Currency is required"],
      trim: true,
      uppercase: true,
      minlength: [3, "Currency code must be 3 characters"],
      maxlength: [3, "Currency code must be 3 characters"],
    },
    escrowAmount: {
      type: Number,
      default: 0,
      min: [0, "Escrow amount cannot be negative"],
    },
    escrowPrepared: {
      type: Boolean,
      default: false,
    },
    escrowWallet: {
      type: Schema.Types.ObjectId,
      ref: "Wallet",
      default: null,
    },
    escrowStatus: {
      type: String,
      enum: Object.values(ESCROW_STATUSES),
      default: ESCROW_STATUSES.WAITING_FOR_FUNDING,
      set: normalizeEscrowStatus,
      index: true,
    },
    escrowReleasedAmount: {
      type: Number,
      default: 0,
      min: [0, "Escrow released amount cannot be negative"],
    },
    escrowRefundedAmount: {
      type: Number,
      default: 0,
      min: [0, "Escrow refunded amount cannot be negative"],
    },
    paymentMethod: {
      type: String,
      trim: true,
      maxlength: [100, "Payment method cannot exceed 100 characters"],
    },
    milestones: [
      { type: Schema.Types.ObjectId, ref: "Milestone" }
    ],
    appliedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    status: {
      type: String,
      enum: Object.values(CONTRACT_STATUSES),
      default: CONTRACT_STATUSES.PENDING,
      index: true,
    },
    startDate: {
      type: Date,
      default: null,
    },
    completionDate: {
      type: Date,
      default: null,
    },
    dueDate: {
      type: Date,
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    finalApprovedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    finalApprovedAt: {
      type: Date,
      default: null,
    },
    cancelledAt: {
      type: Date,
      default: null,
    },
    disputedAt: {
      type: Date,
      default: null,
    },
    tags: [
      {
        type: String,
        trim: true,
        maxlength: [50, "Tag cannot exceed 50 characters"],
      },
    ],
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  getBaseSchemaOptions()
);

contractSchema.index({ seller: 1, buyer: 1, status: 1 });

contractSchema.pre("validate", function normalizeLegacyFields(next) {
  this.escrowStatus = normalizeEscrowStatus(this.escrowStatus);
  normalizeLegacyPaymentFields(this);
  next();
});

export const Contract = model("Contract", contractSchema);

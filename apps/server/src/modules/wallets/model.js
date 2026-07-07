/**
 * Wallet Model
 * Tracks balances and ledger ownership
 */

import { Schema, model } from "mongoose";
import { getBaseSchemaOptions } from "../../shared/models/BaseSchema.js";
import { WALLET_STATUSES, WALLET_TYPES } from "../../shared/config/constants.js";

const walletSchema = new Schema(
  {
    owner: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Wallet owner is required"],
      index: true,
    },
    type: {
      type: String,
      enum: Object.values(WALLET_TYPES),
      default: WALLET_TYPES.USER,
      index: true,
    },
    currency: {
      type: String,
      required: [true, "Currency is required"],
      trim: true,
      uppercase: true,
      minlength: [3, "Currency code must be 3 characters"],
      maxlength: [3, "Currency code must be 3 characters"],
      index: true,
    },
    balance: {
      type: Number,
      default: 0,
      min: [0, "Balance cannot be negative"],
    },
    availableBalance: {
      type: Number,
      default: 0,
      min: [0, "Available balance cannot be negative"],
    },
    lockedBalance: {
      type: Number,
      default: 0,
      min: [0, "Locked balance cannot be negative"],
    },
    status: {
      type: String,
      enum: Object.values(WALLET_STATUSES),
      default: WALLET_STATUSES.ACTIVE,
      index: true,
    },
    isDefault: {
      type: Boolean,
      default: false,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  getBaseSchemaOptions()
);

walletSchema.index({ owner: 1, type: 1, currency: 1 }, { unique: true, partialFilterExpression: { owner: { $exists: true } } });
walletSchema.index({ owner: 1, currency: 1 });

const walletModel = model("Wallet", walletSchema);

/**
 * Transaction Model
 * Records every ledger entry and balance change
 */

import { TRANSACTION_STATUSES, TRANSACTION_TYPES } from "../../shared/config/constants.js";

const transactionSchema = new Schema(
  {
    wallet: {
      type: Schema.Types.ObjectId,
      ref: "Wallet",
      required: [true, "Transaction wallet is required"],
      index: true,
    },
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Transaction user is required"],
      index: true,
    },
    contract: {
      type: Schema.Types.ObjectId,
      ref: "Contract",
      index: true,
    },
    type: {
      type: String,
      enum: Object.values(TRANSACTION_TYPES),
      required: [true, "Transaction type is required"],
      index: true,
    },
    amount: {
      type: Number,
      required: [true, "Transaction amount is required"],
      min: [0, "Transaction amount cannot be negative"],
    },
    currency: {
      type: String,
      required: [true, "Currency is required"],
      trim: true,
      uppercase: true,
      minlength: [3, "Currency code must be 3 characters"],
      maxlength: [3, "Currency code must be 3 characters"],
    },
    status: {
      type: String,
      enum: Object.values(TRANSACTION_STATUSES),
      default: TRANSACTION_STATUSES.PENDING,
      index: true,
    },
    referenceId: {
      type: String,
      trim: true,
      index: true,
    },
    description: {
      type: String,
      trim: true,
      maxlength: [1000, "Description cannot exceed 1000 characters"],
    },
    balanceAfter: {
      type: Number,
      min: [0, "Balance after transaction cannot be negative"],
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  getBaseSchemaOptions()
);

transactionSchema.index({ wallet: 1, status: 1, createdAt: -1 });
transactionSchema.index({ contract: 1, type: 1 });
transactionSchema.index({ referenceId: 1 }, { unique: true, sparse: true });

const transactionModel = model("Transaction", transactionSchema);

export const Wallet = walletModel;
export const Transaction = transactionModel;

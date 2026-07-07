/**
 * Transaction Model
 * Records every ledger entry and balance change
 */

import mongoose, { Schema, model } from "mongoose";
import { getBaseSchemaOptions } from "./BaseSchema.js";
import { TRANSACTION_STATUSES, TRANSACTION_TYPES } from "../config/constants.js";

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

// Handle model recompilation on hot reload (nodemon)
let Transaction;
try {
  Transaction = model("Transaction", transactionSchema);
} catch (error) {
  if (error.name === "OverwriteModelError") {
    Transaction = mongoose.model("Transaction");
  } else {
    throw error;
  }
}
export { Transaction };

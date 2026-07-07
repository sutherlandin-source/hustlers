/**
 * Wallet Model
 * Tracks balances and ledger ownership
 */

import mongoose, { Schema, model } from "mongoose";
import { getBaseSchemaOptions } from "./BaseSchema.js";
import { WALLET_STATUSES, WALLET_TYPES } from "../config/constants.js";

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

// Handle model recompilation on hot reload (nodemon)
let Wallet;
try {
  Wallet = model("Wallet", walletSchema);
} catch (error) {
  if (error.name === "OverwriteModelError") {
    Wallet = mongoose.model("Wallet");
  } else {
    throw error;
  }
}
export { Wallet };

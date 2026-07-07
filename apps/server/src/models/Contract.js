/**
 * Contract Model
 * Represents work agreements between buyers and vendors
 */

import mongoose, { Schema, model } from "mongoose";
import { getBaseSchemaOptions } from "./BaseSchema.js";
import { CONTRACT_STATUSES } from "../config/constants.js";

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
    paymentType: {
      type: String,
      enum: ["fixed", "daily", "hourly"],
      default: "fixed",
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
    contractType: {
      type: String,
      enum: ["single", "staged"],
      default: "single",
      index: true,
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

contractSchema.index({ buyer: 1, seller: 1, status: 1, createdAt: -1 });
contractSchema.index({ contractNumber: 1 }, { unique: true, sparse: true });
contractSchema.index({ dueDate: 1 });
contractSchema.index({ status: 1, updatedAt: -1 });

// Handle model recompilation on hot reload (nodemon)
// Safely register model - if it already exists in mongoose, it will throw and we catch it
let Contract;
try {
  Contract = model("Contract", contractSchema);
} catch (error) {
  if (error.name === "OverwriteModelError") {
    // Model already registered, get from mongoose models
    Contract = mongoose.model("Contract");
  } else {
    throw error;
  }
}
export { Contract };

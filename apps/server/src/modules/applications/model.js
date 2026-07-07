/**
 * Contract Application Model
 * Represents a hustler's application for a contract
 */

import mongoose, { Schema, model } from "mongoose";
import { APPLICATION_STATUSES } from "../../config/constants.js";

const contractApplicationSchema = new Schema(
  {
    contractId: {
      type: Schema.Types.ObjectId,
      ref: "Contract",
      required: [true, "Contract ID is required"],
      index: true,
    },
    hustlerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Hustler ID is required"],
      index: true,
    },
    status: {
      type: String,
      enum: Object.values(APPLICATION_STATUSES),
      default: APPLICATION_STATUSES.PENDING,
      index: true,
    },
    coverLetter: {
      type: String,
      trim: true,
      maxlength: [1000, "Cover letter cannot exceed 1000 characters"],
    },
    proposedRate: {
      type: Number,
      min: [0, "Proposed rate cannot be negative"],
    },
    estimatedDuration: {
      type: String,
      trim: true,
      maxlength: [100, "Estimated duration cannot exceed 100 characters"],
    },
    attachments: [
      {
        type: String,
        trim: true,
      },
    ],
    appliedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
    reviewedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    rejectionReason: {
      type: String,
      trim: true,
      maxlength: [500, "Rejection reason cannot exceed 500 characters"],
    },
    notes: {
      type: String,
      trim: true,
      maxlength: [1000, "Notes cannot exceed 1000 characters"],
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for finding applications by contract and hustler
contractApplicationSchema.index({ contractId: 1, hustlerId: 1 }, { unique: true });

// Index for finding applications for review
contractApplicationSchema.index({ contractId: 1, status: 1 });

// Index for finding hustler's applications
contractApplicationSchema.index({ hustlerId: 1, status: 1 });

// Handle model recompilation on hot reload (nodemon)
// Safely register model - if it already exists in mongoose, it will throw and we catch it
let ContractApplication;
try {
  ContractApplication = model("ContractApplication", contractApplicationSchema);
} catch (error) {
  if (error.name === "OverwriteModelError") {
    // Model already registered, get from mongoose models
    ContractApplication = mongoose.model("ContractApplication");
  } else {
    throw error;
  }
}
export default ContractApplication;

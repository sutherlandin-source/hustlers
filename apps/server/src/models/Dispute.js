/**
 * Dispute Model
 * Enables dispute resolution workflows for contracts
 */

import mongoose, { Schema, model } from "mongoose";
import { getBaseSchemaOptions } from "./BaseSchema.js";
import { DISPUTE_STATUSES } from "../config/constants.js";

const disputeSchema = new Schema(
  {
    contract: {
      type: Schema.Types.ObjectId,
      ref: "Contract",
      required: [true, "Contract is required"],
      index: true,
    },
    raisedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Dispute owner is required"],
      index: true,
    },
    assignedTo: {
      type: Schema.Types.ObjectId,
      ref: "User",
      index: true,
      default: null,
    },
    status: {
      type: String,
      enum: Object.values(DISPUTE_STATUSES),
      default: DISPUTE_STATUSES.OPEN,
      index: true,
    },
    reason: {
      type: String,
      required: [true, "Dispute reason is required"],
      trim: true,
      maxlength: [1000, "Reason cannot exceed 1000 characters"],
    },
    details: {
      type: String,
      trim: true,
      maxlength: [3000, "Details cannot exceed 3000 characters"],
    },
    requestedResolution: {
      type: String,
      trim: true,
      maxlength: [1000, "Requested resolution cannot exceed 1000 characters"],
    },
    resolution: {
      type: String,
      trim: true,
      maxlength: [2000, "Resolution summary cannot exceed 2000 characters"],
    },
    resolvedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    resolvedAt: {
      type: Date,
      default: null,
    },
    evidence: [
      {
        url: {
          type: String,
          trim: true,
        },
        type: {
          type: String,
          trim: true,
        },
        notes: {
          type: String,
          trim: true,
          maxlength: [1000, "Evidence note cannot exceed 1000 characters"],
        },
      },
    ],
    priority: {
      type: String,
      trim: true,
      enum: ["low", "medium", "high"],
      default: "medium",
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  getBaseSchemaOptions()
);

disputeSchema.index({ contract: 1, status: 1, raisedBy: 1, createdAt: -1 });

// Handle model recompilation on hot reload (nodemon)
let Dispute;
try {
  Dispute = model("Dispute", disputeSchema);
} catch (error) {
  if (error.name === "OverwriteModelError") {
    Dispute = mongoose.model("Dispute");
  } else {
    throw error;
  }
}
export { Dispute };

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
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: "Conversation",
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
    resolutionType: {
      type: String,
      trim: true,
      default: null,
    },
    adminNotes: {
      type: String,
      trim: true,
      maxlength: [5000, "Admin notes cannot exceed 5000 characters"],
      default: "",
    },
    evidenceRequests: [
      {
        requestId: {
          type: String,
          trim: true,
          required: true,
        },
        requestedBy: {
          type: Schema.Types.ObjectId,
          ref: "User",
          default: null,
        },
        recipientRoles: [
          {
            type: String,
            trim: true,
          },
        ],
        recipientIds: [
          {
            type: Schema.Types.ObjectId,
            ref: "User",
          },
        ],
        message: {
          type: String,
          trim: true,
          maxlength: [2000, "Evidence request message cannot exceed 2000 characters"],
        },
        requiredEvidenceTypes: [
          {
            type: String,
            trim: true,
          },
        ],
        responseDeadline: {
          type: Date,
          default: null,
        },
        status: {
          type: String,
          trim: true,
          default: "pending",
        },
        responses: [
          {
            respondedBy: {
              type: Schema.Types.ObjectId,
              ref: "User",
              default: null,
            },
            message: {
              type: String,
              trim: true,
              maxlength: [2000, "Evidence response message cannot exceed 2000 characters"],
            },
            attachments: {
              type: Array,
              default: [],
            },
            createdAt: {
              type: Date,
              default: Date.now,
            },
          },
        ],
        createdAt: {
          type: Date,
          default: Date.now,
        },
        respondedAt: {
          type: Date,
          default: null,
        },
        expiredAt: {
          type: Date,
          default: null,
        },
      },
    ],
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
        name: {
          type: String,
          trim: true,
          maxlength: [255, "Evidence name cannot exceed 255 characters"],
        },
        url: {
          type: String,
          trim: true,
        },
        dataUrl: {
          type: String,
          trim: true,
        },
        type: {
          type: String,
          trim: true,
        },
        size: {
          type: Number,
          default: 0,
        },
        notes: {
          type: String,
          trim: true,
          maxlength: [1000, "Evidence note cannot exceed 1000 characters"],
        },
      },
    ],
    timeline: [
      {
        eventType: {
          type: String,
          trim: true,
          required: true,
        },
        title: {
          type: String,
          trim: true,
          required: true,
        },
        detail: {
          type: String,
          trim: true,
          default: "",
        },
        actor: {
          type: Schema.Types.ObjectId,
          ref: "User",
          default: null,
        },
        status: {
          type: String,
          trim: true,
          default: null,
        },
        metadata: {
          type: Schema.Types.Mixed,
          default: {},
        },
        createdAt: {
          type: Date,
          default: Date.now,
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

// Guard against OverwriteModelError on hot-reload (nodemon) and when both
// legacy src/models/Dispute.js and this shared model are loaded in the same process.
let Dispute;
try {
  Dispute = model("Dispute", disputeSchema);
} catch (err) {
  if (err.name === "OverwriteModelError") {
    Dispute = mongoose.model("Dispute");
  } else {
    throw err;
  }
}

export { Dispute };

/**
 * Audit Log Model
 * Maintains an immutable trail of security and workflow events
 */

import mongoose, { Schema, model } from "mongoose";
import { getBaseSchemaOptions } from "./BaseSchema.js";
import { AUDIT_ACTIONS, ENTITY_TYPES } from "../config/constants.js";

const auditLogSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    action: {
      type: String,
      enum: Object.values(AUDIT_ACTIONS),
      required: [true, "Audit action is required"],
      index: true,
    },
    entityType: {
      type: String,
      enum: Object.values(ENTITY_TYPES),
      required: [true, "Entity type is required"],
      index: true,
    },
    entityId: {
      type: Schema.Types.ObjectId,
      required: [true, "Entity id is required"],
      index: true,
    },
    ipAddress: {
      type: String,
      trim: true,
      maxlength: [45, "IP address cannot exceed 45 characters"],
    },
    userAgent: {
      type: String,
      trim: true,
      maxlength: [512, "User agent cannot exceed 512 characters"],
    },
    before: {
      type: Schema.Types.Mixed,
      default: {},
    },
    after: {
      type: Schema.Types.Mixed,
      default: {},
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  getBaseSchemaOptions()
);

auditLogSchema.index({ entityType: 1, entityId: 1, createdAt: -1 });
auditLogSchema.index({ user: 1, action: 1, createdAt: -1 });

// Handle model recompilation on hot reload (nodemon)
let AuditLog;
try {
  AuditLog = model("AuditLog", auditLogSchema);
} catch (error) {
  if (error.name === "OverwriteModelError") {
    AuditLog = mongoose.model("AuditLog");
  } else {
    throw error;
  }
}
export { AuditLog };

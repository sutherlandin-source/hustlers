/**
 * Notification Model
 * Stores in-app notification events for users
 */

import mongoose, { Schema, model } from "mongoose";
import { getBaseSchemaOptions } from "./BaseSchema.js";
import { NOTIFICATION_STATUSES, NOTIFICATION_TYPES } from "../config/constants.js";

const notificationSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Notification recipient is required"],
      index: true,
    },
    type: {
      type: String,
      enum: Object.values(NOTIFICATION_TYPES),
      default: NOTIFICATION_TYPES.SYSTEM,
      index: true,
    },
    status: {
      type: String,
      enum: Object.values(NOTIFICATION_STATUSES),
      default: NOTIFICATION_STATUSES.UNREAD,
      index: true,
    },
    title: {
      type: String,
      required: [true, "Notification title is required"],
      trim: true,
      maxlength: [200, "Notification title cannot exceed 200 characters"],
    },
    message: {
      type: String,
      trim: true,
      maxlength: [2000, "Notification message cannot exceed 2000 characters"],
    },
    payload: {
      type: Schema.Types.Mixed,
      default: {},
    },
    link: {
      type: String,
      trim: true,
    },
    channel: {
      type: String,
      trim: true,
      maxlength: [100, "Channel identifier cannot exceed 100 characters"],
    },
    readAt: {
      type: Date,
      default: null,
    },
    expiresAt: {
      type: Date,
      default: null,
      index: true,
    },
  },
  getBaseSchemaOptions()
);

notificationSchema.index({ user: 1, status: 1, createdAt: -1 });
notificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Handle model recompilation on hot reload (nodemon)
let Notification;
try {
  Notification = model("Notification", notificationSchema);
} catch (error) {
  if (error.name === "OverwriteModelError") {
    Notification = mongoose.model("Notification");
  } else {
    throw error;
  }
}
export { Notification };

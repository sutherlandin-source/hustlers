/**
 * Conversation Model
 * Represents a chat conversation linked to a contract
 */

import mongoose, { Schema, model } from "mongoose";
import { getBaseSchemaOptions } from "./BaseSchema.js";

const conversationSchema = new Schema(
  {
    contractId: {
      type: Schema.Types.ObjectId,
      ref: "Contract",
      default: null,
    },
    participants: [
      {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
    ],
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  getBaseSchemaOptions()
);

conversationSchema.index({ contractId: 1 });
conversationSchema.index({ participants: 1 });

let Conversation;
try {
  Conversation = model("Conversation", conversationSchema);
} catch (error) {
  if (error.name === "OverwriteModelError") {
    Conversation = mongoose.model("Conversation");
  } else {
    throw error;
  }
}

export { Conversation };

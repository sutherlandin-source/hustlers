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
      required: [true, "Contract ID is required"],
    },
    participants: [
      {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
    ],
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

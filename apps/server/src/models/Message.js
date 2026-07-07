/**
 * Message Model
 * Represents a message within a conversation
 */

import mongoose, { Schema, model } from "mongoose";
import { getBaseSchemaOptions } from "./BaseSchema.js";

const messageSchema = new Schema(
  {
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: "Conversation",
      required: [true, "Conversation ID is required"],
    },
    senderId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Sender ID is required"],
    },
    text: {
      type: String,
      required: [true, "Message text is required"],
      trim: true,
    },
    read: {
      type: Boolean,
      default: false,
    },
  },
  getBaseSchemaOptions()
);

messageSchema.index({ conversationId: 1 });
messageSchema.index({ senderId: 1 });

let Message;
try {
  Message = model("Message", messageSchema);
} catch (error) {
  if (error.name === "OverwriteModelError") {
    Message = mongoose.model("Message");
  } else {
    throw error;
  }
}

export { Message };

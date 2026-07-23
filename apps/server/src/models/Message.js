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
      default: "",
      trim: true,
    },
    attachments: [
      {
        name: {
          type: String,
          required: true,
          trim: true,
          maxlength: [255, "Attachment name cannot exceed 255 characters"],
        },
        type: {
          type: String,
          trim: true,
          maxlength: [120, "Attachment type cannot exceed 120 characters"],
        },
        size: {
          type: Number,
          default: 0,
        },
        dataUrl: {
          type: String,
          required: true,
        },
      },
    ],
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

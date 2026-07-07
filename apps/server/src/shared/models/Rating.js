/**
 * Rating Model
 * Captures trust signals and feedback between users
 */

import { Schema, model } from "mongoose";
import { getBaseSchemaOptions } from "./BaseSchema.js";
import { RATING_TYPES } from "../config/constants.js";

const ratingSchema = new Schema(
  {
    contract: {
      type: Schema.Types.ObjectId,
      ref: "Contract",
      required: [true, "Contract reference is required"],
      index: true,
    },
    fromUser: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Rating author is required"],
      index: true,
    },
    toUser: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Rated user is required"],
      index: true,
    },
    type: {
      type: String,
      enum: Object.values(RATING_TYPES),
      default: RATING_TYPES.SERVICE,
      index: true,
    },
    score: {
      type: Number,
      required: [true, "Rating score is required"],
      min: [1, "Rating must be at least 1"],
      max: [5, "Rating cannot exceed 5"],
    },
    review: {
      type: String,
      trim: true,
      maxlength: [2000, "Review cannot exceed 2000 characters"],
    },
    isPublished: {
      type: Boolean,
      default: true,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  getBaseSchemaOptions()
);

ratingSchema.index({ toUser: 1, type: 1, score: -1 });
ratingSchema.index({ fromUser: 1, contract: 1 }, { unique: true });

export const Rating = model("Rating", ratingSchema);

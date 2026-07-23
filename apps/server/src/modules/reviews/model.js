/**
 * Review Model
 * Captures contract-linked feedback between managers and hustlers
 */

import { Schema, model } from "mongoose";
import { getBaseSchemaOptions } from "../../shared/models/BaseSchema.js";

const scoreField = {
  type: Number,
  required: true,
  min: [1, "Rating must be at least 1"],
  max: [5, "Rating cannot exceed 5"],
};

const reviewSchema = new Schema(
  {
    contract: {
      type: Schema.Types.ObjectId,
      ref: "Contract",
      required: [true, "Contract reference is required"],
      index: true,
    },
    reviewer: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Reviewer is required"],
      index: true,
    },
    reviewee: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Reviewee is required"],
      index: true,
    },
    rating: {
      ...scoreField,
      required: [true, "Overall rating is required"],
    },
    communication: {
      ...scoreField,
      required: [true, "Communication rating is required"],
    },
    professionalism: {
      ...scoreField,
      required: [true, "Professionalism rating is required"],
    },
    quality: {
      ...scoreField,
      required: [true, "Quality rating is required"],
    },
    timeliness: {
      ...scoreField,
      required: [true, "Timeliness rating is required"],
    },
    reviewText: {
      type: String,
      trim: true,
      maxlength: [2000, "Review text cannot exceed 2000 characters"],
    },
  },
  getBaseSchemaOptions()
);

reviewSchema.index({ contract: 1, reviewer: 1, reviewee: 1 }, { unique: true });
reviewSchema.index({ reviewee: 1, createdAt: -1 });
reviewSchema.index({ contract: 1, reviewee: 1 });

export const Review = model("Review", reviewSchema);

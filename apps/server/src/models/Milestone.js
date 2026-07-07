import mongoose, { Schema, model } from "mongoose";
import { getBaseSchemaOptions } from "./BaseSchema.js";
import { MILESTONE_STATUSES, PAYMENT_STATUSES, WORK_STATUS } from "../config/constants.js";

const milestoneSchema = new Schema(
  {
    contract: { type: Schema.Types.ObjectId, ref: "Contract", required: true, index: true },
    title: { type: String, required: [true, "Milestone title is required"], trim: true },
    description: { type: String, trim: true },
    amount: { type: Number, required: [true, "Milestone amount is required"], min: [0, "Amount cannot be negative"] },
    dueDate: { type: Date, default: null },
    status: { type: String, enum: Object.values(MILESTONE_STATUSES), default: MILESTONE_STATUSES.PENDING, index: true },
    workStatus: { type: String, enum: Object.values(WORK_STATUS), default: WORK_STATUS.NOT_STARTED, index: true },
    paymentStatus: {
      type: String,
      enum: Object.values(PAYMENT_STATUSES),
      default: PAYMENT_STATUSES.PENDING,
      index: true,
    },
    paymentReleasedAt: { type: Date, default: null },
    paymentTransaction: { type: Schema.Types.ObjectId, ref: "Transaction", default: null },
    paymentReferenceId: { type: String, trim: true, default: null, index: true },
    paymentMetadata: { type: Schema.Types.Mixed, default: {} },
    submittedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    submittedAt: { type: Date, default: null },
    approvedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    approvedAt: { type: Date, default: null },
    rejectionReason: { type: String, trim: true },
    revisionRequestedAt: { type: Date, default: null },
    submissionData: { type: Schema.Types.Mixed },
    completionNotes: { type: String, trim: true },
    proofFiles: [{ type: String }],
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  getBaseSchemaOptions()
);

milestoneSchema.index({ contract: 1, status: 1 });

// Handle model recompilation on hot reload (nodemon)
let Milestone;
try {
  Milestone = model("Milestone", milestoneSchema);
} catch (error) {
  if (error.name === "OverwriteModelError") {
    Milestone = mongoose.model("Milestone");
  } else {
    throw error;
  }
}
export { Milestone };

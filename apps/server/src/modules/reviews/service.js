/**
 * Reviews Service
 * Business logic for contract-linked reviews
 */

import { Types } from "mongoose";
import { Review } from "./model.js";
import { Contract } from "../contracts/model.js";
import { Milestone } from "../milestones/model.js";
import ContractApplication from "../applications/model.js";
import { User } from "../../shared/models/User.js";
import { ApiError } from "../../shared/middleware/errorHandler.js";
import { CONTRACT_STATUSES, ESCROW_STATUSES, HTTP_STATUS } from "../../shared/config/constants.js";

function sameId(left, right) {
  return left?.toString() === right?.toString();
}

function normalizeObjectId(id, label) {
  if (!Types.ObjectId.isValid(id)) {
    throw new ApiError(HTTP_STATUS.BAD_REQUEST, `${label} is invalid`);
  }
  return new Types.ObjectId(id);
}

function getPersonId(person) {
  return person?._id || person?.id || person || null;
}

function getLatestMilestoneForUser(contract, userId) {
  const normalizedUserId = String(userId || "");
  if (!normalizedUserId) return null;

  return [...(Array.isArray(contract?.milestones) ? contract.milestones : [])]
    .filter((milestone) => {
      const assignedTo = getPersonId(milestone?.assignedTo);
      const submittedBy = getPersonId(milestone?.submittedBy);
      return String(assignedTo || submittedBy || "") === normalizedUserId;
    })
    .sort((left, right) => new Date(right.updatedAt || right.createdAt || 0) - new Date(left.updatedAt || left.createdAt || 0))[0] || null;
}

function isMilestoneReviewable(milestone) {
  if (!milestone) return false;

  const workStatus = String(milestone?.workStatus || milestone?.status || "").toLowerCase();
  const paymentStatus = String(milestone?.paymentStatus || "").toLowerCase();
  return ["approved", "completed"].includes(workStatus) && paymentStatus === "released";
}

export class ReviewService {
  async recalculateUserReviewStats(revieweeId) {
    if (!revieweeId) return;

    const normalizedRevieweeId = typeof revieweeId === "string" ? normalizeObjectId(revieweeId, "Reviewee ID") : revieweeId;
    const [stats] = await Review.aggregate([
      { $match: { reviewee: normalizedRevieweeId } },
      {
        $group: {
          _id: "$reviewee",
          averageRating: { $avg: "$rating" },
          totalReviews: { $sum: 1 },
        },
      },
    ]);

    await User.findByIdAndUpdate(normalizedRevieweeId, {
      averageRating: stats ? Number(stats.averageRating.toFixed(2)) : 0,
      totalReviews: stats?.totalReviews || 0,
    });
  }

  async getAcceptedHustlerIds(contractId) {
    const acceptedApplications = await ContractApplication.find({
      contractId,
      status: "accepted",
    }).select("hustlerId");

    return acceptedApplications.map((application) => application.hustlerId?.toString()).filter(Boolean);
  }

  async getContractParticipants(contract) {
    const buyerId = contract.buyer?.toString();
    const sellerId = contract.seller?.toString();
    const acceptedHustlerIds = await this.getAcceptedHustlerIds(contract._id);
    const hustlerIds = [...new Set([sellerId, ...acceptedHustlerIds].filter(Boolean))];

    return {
      buyerId,
      hustlerIds,
      allParticipantIds: [...new Set([buyerId, ...hustlerIds].filter(Boolean))],
    };
  }

  async getReviewableContract(contractId, reviewerId = null, revieweeId = null) {
    const contract = await Contract.findById(normalizeObjectId(contractId, "Contract ID")).populate("buyer seller");
    if (!contract) {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, "Contract not found");
    }

    const milestoneDocs = await Milestone.find({ contract: contract._id })
      .sort({ createdAt: 1 })
      .populate("assignedTo", "name firstName lastName email")
      .populate("submittedBy", "name firstName lastName email");

    const contractData = contract.toObject ? contract.toObject() : { ...contract };
    contractData.milestones = milestoneDocs.map((milestone) => (milestone.toObject ? milestone.toObject() : milestone));
    const globallyReviewable =
      contractData.status === CONTRACT_STATUSES.COMPLETED && contractData.escrowStatus === ESCROW_STATUSES.RELEASED;

    if (!globallyReviewable && reviewerId && revieweeId) {
      const buyerId = getPersonId(contractData.buyer);
      const normalizedReviewerId = String(reviewerId);
      const normalizedRevieweeId = String(revieweeId);
      const reviewerIsManager = String(buyerId || "") === normalizedReviewerId;
      const revieweeIsManager = String(buyerId || "") === normalizedRevieweeId;
      const reviewerIsHustler = !reviewerIsManager;
      const revieweeIsHustler = !revieweeIsManager;
      const targetWorkerId = reviewerIsManager ? normalizedRevieweeId : normalizedReviewerId;
      const targetMilestone = getLatestMilestoneForUser(contractData, targetWorkerId);
      const targetReviewable = isMilestoneReviewable(targetMilestone);

      if (!((reviewerIsManager && revieweeIsHustler) || (reviewerIsHustler && revieweeIsManager)) || !targetReviewable) {
        throw new ApiError(HTTP_STATUS.CONFLICT, "Reviews can only be submitted after the specific worker submission has been approved and paid");
      }
    } else if (!globallyReviewable) {
      throw new ApiError(HTTP_STATUS.CONFLICT, "Reviews can only be submitted after the contract is completed");
    }

    return contract;
  }

  async validateParticipants(contract, reviewerId, revieweeId) {
    const participants = await this.getContractParticipants(contract);

    if (!participants.allParticipantIds.some((participantId) => sameId(participantId, reviewerId))) {
      throw new ApiError(HTTP_STATUS.FORBIDDEN, "Reviewer must be a participant in this contract");
    }

    if (!participants.allParticipantIds.some((participantId) => sameId(participantId, revieweeId))) {
      throw new ApiError(HTTP_STATUS.FORBIDDEN, "Reviewee must be a participant in this contract");
    }

    if (sameId(reviewerId, revieweeId)) {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, "Reviewer and reviewee must be different users");
    }

    const reviewerIsManager = sameId(reviewerId, participants.buyerId);
    const revieweeIsManager = sameId(revieweeId, participants.buyerId);
    const reviewerIsHustler = participants.hustlerIds.some((hustlerId) => sameId(hustlerId, reviewerId));
    const revieweeIsHustler = participants.hustlerIds.some((hustlerId) => sameId(hustlerId, revieweeId));

    if (!((reviewerIsManager && revieweeIsHustler) || (reviewerIsHustler && revieweeIsManager))) {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, "Reviews are only allowed between the manager and hired hustler");
    }
  }

  buildReviewPayload(input) {
    return {
      rating: input.rating,
      communication: input.communication,
      professionalism: input.professionalism,
      quality: input.quality,
      timeliness: input.timeliness,
      reviewText: input.reviewText,
    };
  }

  async createReview(input, actorId) {
    const contract = await this.getReviewableContract(input.contractId, actorId, input.revieweeId);
    const revieweeId = normalizeObjectId(input.revieweeId, "Reviewee ID");
    await this.validateParticipants(contract, actorId, revieweeId);

    const existingReview = await Review.findOne({
      contract: contract._id,
      reviewer: actorId,
      reviewee: revieweeId,
    });

    if (existingReview) {
      throw new ApiError(HTTP_STATUS.CONFLICT, "You have already reviewed this contract");
    }

    try {
      const review = await Review.create({
        contract: contract._id,
        reviewer: actorId,
        reviewee: revieweeId,
        ...this.buildReviewPayload(input),
      });
      await this.recalculateUserReviewStats(review.reviewee);
      return this.getReview(review._id);
    } catch (error) {
      if (error.code === 11000) {
        throw new ApiError(HTTP_STATUS.CONFLICT, "You have already reviewed this contract");
      }
      throw error;
    }
  }

  async listReviewsByUser(userId, options = {}) {
    const revieweeId = normalizeObjectId(userId, "User ID");
    const limit = Math.min(Number(options.limit) || 20, 100);
    const skip = Number(options.skip) || 0;
    const filter = { reviewee: revieweeId };
    const query = Review.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("contract", "title contractId contractNumber")
      .populate("reviewer", "firstName lastName email avatar averageRating totalReviews")
      .populate("reviewee", "firstName lastName email avatar averageRating totalReviews");

    const [reviews, total, distribution] = await Promise.all([
      query,
      Review.countDocuments(filter),
      Review.aggregate([
        { $match: filter },
        { $group: { _id: "$rating", count: { $sum: 1 } } },
        { $sort: { _id: -1 } },
      ]),
    ]);

    return {
      reviews,
      total,
      limit,
      skip,
      distribution: distribution.reduce((acc, item) => {
        acc[item._id] = item.count;
        return acc;
      }, { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }),
    };
  }

  async listReviewsByContract(contractId, options = {}) {
    const query = Review.find({ contract: normalizeObjectId(contractId, "Contract ID") })
      .sort({ createdAt: -1 })
      .populate("reviewer", "firstName lastName email avatar averageRating totalReviews")
      .populate("reviewee", "firstName lastName email avatar averageRating totalReviews");

    if (options.limit) query.limit(options.limit);
    if (options.skip) query.skip(options.skip);
    return query;
  }

  async getReview(reviewId) {
    const review = await Review.findById(normalizeObjectId(reviewId, "Review ID"))
      .populate("contract", "title contractId contractNumber status escrowStatus")
      .populate("reviewer", "firstName lastName email avatar averageRating totalReviews")
      .populate("reviewee", "firstName lastName email avatar averageRating totalReviews");

    if (!review) {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, "Review not found");
    }

    return review;
  }

  async updateReview(reviewId, input, actorId) {
    const review = await Review.findById(normalizeObjectId(reviewId, "Review ID"));
    if (!review) {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, "Review not found");
    }

    if (!sameId(review.reviewer, actorId)) {
      throw new ApiError(HTTP_STATUS.FORBIDDEN, "You can only update your own review");
    }

    await this.getReviewableContract(review.contract, review.reviewer, review.reviewee);

    Object.assign(review, this.buildReviewPayload({ ...review.toObject(), ...input }));
    await review.save();
    await this.recalculateUserReviewStats(review.reviewee);
    return this.getReview(review._id);
  }

  async deleteReview(reviewId, actorId) {
    const review = await Review.findById(normalizeObjectId(reviewId, "Review ID"));
    if (!review) {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, "Review not found");
    }

    if (!sameId(review.reviewer, actorId)) {
      throw new ApiError(HTTP_STATUS.FORBIDDEN, "You can only delete your own review");
    }

    await this.getReviewableContract(review.contract, review.reviewer, review.reviewee);
    await Review.findByIdAndDelete(review._id);
    await this.recalculateUserReviewStats(review.reviewee);
    return review;
  }
}

export const reviewService = new ReviewService();

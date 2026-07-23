/**
 * Reviews Controller
 * Handles review-related HTTP requests
 */

import { reviewService } from "./service.js";

function buildResponse(res, status, message, data = {}) {
  return res.status(status).json({ success: status >= 200 && status < 300, message, data, timestamp: new Date().toISOString() });
}

function paginationOptions(query) {
  return {
    limit: parseInt(query.limit) || 20,
    skip: parseInt(query.skip) || 0,
  };
}

export async function createReview(req, res, next) {
  try {
    const review = await reviewService.createReview(req.body, req.user.userId);
    return buildResponse(res, 201, "Review created", { review });
  } catch (err) {
    next(err);
  }
}

export async function listUserReviews(req, res, next) {
  try {
    const data = await reviewService.listReviewsByUser(req.params.userId, paginationOptions(req.query));
    return buildResponse(res, 200, "User reviews retrieved", data);
  } catch (err) {
    next(err);
  }
}

export async function listContractReviews(req, res, next) {
  try {
    const reviews = await reviewService.listReviewsByContract(req.params.contractId, paginationOptions(req.query));
    return buildResponse(res, 200, "Contract reviews retrieved", { reviews });
  } catch (err) {
    next(err);
  }
}

export async function updateReview(req, res, next) {
  try {
    const review = await reviewService.updateReview(req.params.reviewId, req.body, req.user.userId);
    return buildResponse(res, 200, "Review updated", { review });
  } catch (err) {
    next(err);
  }
}

export async function deleteReview(req, res, next) {
  try {
    const review = await reviewService.deleteReview(req.params.reviewId, req.user.userId);
    return buildResponse(res, 200, "Review deleted", { review });
  } catch (err) {
    next(err);
  }
}

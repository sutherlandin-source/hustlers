/**
 * Reviews Routes
 * REST API endpoints for review operations
 */

import { Router } from "express";
import { createReview, deleteReview, listContractReviews, listUserReviews, updateReview } from "./controller.js";
import { authenticateToken } from "../../shared/middleware/auth.js";
import { validate } from "../../shared/middleware/validation.js";
import { createReviewRules, updateReviewRules } from "./validation.js";

const router = Router();

router.post("/", authenticateToken, validate(createReviewRules), createReview);
router.get("/user/:userId", authenticateToken, listUserReviews);
router.get("/contract/:contractId", authenticateToken, listContractReviews);
router.patch("/:reviewId", authenticateToken, validate(updateReviewRules), updateReview);
router.delete("/:reviewId", authenticateToken, deleteReview);

export default router;

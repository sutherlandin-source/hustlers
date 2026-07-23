/**
 * User Routes
 * User profile and account management endpoints
 */

import { Router } from "express";
import { authenticateToken } from "../../middleware/auth.js";
import { getProfile, updateProfile } from "../../controllers/userController.js";
import { validate } from "../../middleware/validation.js";
import { userValidation } from "../../modules/users/validation.js";

const router = Router();

/**
 * GET /users/me - Get authenticated user's profile
 */
router.get("/me", authenticateToken, getProfile);

/**
 * PUT /users/me - Update authenticated user's profile
 */
router.put("/me", authenticateToken, validate(userValidation.updateProfile), updateProfile);

export default router;

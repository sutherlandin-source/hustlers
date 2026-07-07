/**
 * User Routes
 * User profile and account management endpoints
 */

import { Router } from "express";
import { authenticateToken } from "../../shared/middleware/auth.js";
import { authorizeRoles } from "../../shared/middleware/auth.js";
import { validate } from "../../shared/middleware/validation.js";
import { USER_ROLES } from "../../shared/config/constants.js";
import { getProfile, listUsers, updateProfile } from "./controller.js";
import { userValidation } from "./validation.js";

const router = Router();

/**
 * GET /users/me - Get authenticated user's profile
 */
router.get("/me", authenticateToken, getProfile);
router.get("/", authenticateToken, authorizeRoles(USER_ROLES.ADMIN), listUsers);

/**
 * PUT /users/me - Update authenticated user's profile
 */
router.put("/me", authenticateToken, validate(userValidation.updateProfile), updateProfile);

export default router;

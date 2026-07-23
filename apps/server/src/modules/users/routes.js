/**
 * User Routes
 * User profile and account management endpoints
 */

import { Router } from "express";
import { authenticateToken } from "../../shared/middleware/auth.js";
import { authorizeRoles } from "../../shared/middleware/auth.js";
import { validate } from "../../shared/middleware/validation.js";
import { USER_ROLES } from "../../shared/config/constants.js";
import { getAdminUserProfile, deactivateUser, getProfile, listUsers, rejectVerification, requestMoreVerificationInfo, suspendUser, updateProfile, verifyUser } from "./controller.js";
import { userValidation } from "./validation.js";

const router = Router();

/**
 * GET /users/me - Get authenticated user's profile
 */
router.get("/me", authenticateToken, getProfile);
router.get("/", authenticateToken, authorizeRoles(USER_ROLES.ADMIN), listUsers);
router.get("/admin/:userId", authenticateToken, authorizeRoles(USER_ROLES.ADMIN), getAdminUserProfile);
router.patch("/admin/:userId/verify", authenticateToken, authorizeRoles(USER_ROLES.ADMIN), verifyUser);
router.patch("/admin/:userId/reject-verification", authenticateToken, authorizeRoles(USER_ROLES.ADMIN), rejectVerification);
router.patch("/admin/:userId/request-more-info", authenticateToken, authorizeRoles(USER_ROLES.ADMIN), requestMoreVerificationInfo);
router.patch("/admin/:userId/suspend", authenticateToken, authorizeRoles(USER_ROLES.ADMIN), suspendUser);
router.patch("/admin/:userId/deactivate", authenticateToken, authorizeRoles(USER_ROLES.ADMIN), deactivateUser);

/**
 * PUT /users/me - Update authenticated user's profile
 */
router.put("/me", authenticateToken, validate(userValidation.updateProfile), updateProfile);

export default router;

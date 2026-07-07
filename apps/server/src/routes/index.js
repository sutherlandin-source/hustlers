/**
 * API Routes
 * Central routing for all API endpoints
 */

import { Router } from "express";
import healthRoutes from "../modules/health/index.js";
import authRoutes from "../modules/auth/index.js";
import contractRoutes from "../modules/contracts/index.js";
import applicationRoutes from "../modules/applications/index.js";
import milestoneRoutes from "../modules/milestones/index.js";
import notificationRoutes from "../modules/notifications/index.js";
import walletRoutes from "../modules/wallets/index.js";
import transactionRoutes from "../modules/transactions/index.js";
import userRoutes from "../modules/users/index.js";
import conversationRoutes from "../modules/conversations/index.js";
import messageRoutes from "../modules/messages/index.js";

const router = Router();

/**
 * Health check routes
 * GET /api/health
 */
router.use("/health", healthRoutes);

/**
 * Authentication routes
 * POST /api/auth/register
 * POST /api/auth/login
 * POST /api/auth/logout
 */
router.use("/auth", authRoutes);

/**
 * User profile and account management
 * GET /api/users/me
 * PUT /api/users/me
 */
router.use("/users", userRoutes);

/**
 * Contracts and applications
 */
router.use("/contracts", contractRoutes);
router.use("/applications", applicationRoutes);
// Nested milestones under contracts for creation: /contracts/:contractId/milestones
router.use("/contracts/:contractId/milestones", milestoneRoutes);
// Also expose top-level milestones listing for admin/global queries
router.use("/milestones", milestoneRoutes);
router.use("/conversations", conversationRoutes);
router.use("/messages", messageRoutes);
router.use("/notifications", notificationRoutes);

router.use("/wallets", walletRoutes);
router.use("/transactions", transactionRoutes);

export default router;

/**
 * Health Routes
 * Health check endpoints
 */

import { Router } from "express";
import { healthCheck, readinessCheck } from "../../controllers/healthController.js";

const router = Router();

/**
 * Health check endpoint
 * GET /api/health
 */
router.get("/", healthCheck);

/**
 * Readiness check endpoint
 * GET /api/ready
 */
router.get("/ready", readinessCheck);

export default router;

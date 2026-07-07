/**
 * Contract Applications Module - Routes
 * API endpoints for contract applications
 */

import { Router } from "express";
import ContractApplicationController from "./controller.js";
import { authenticateToken } from "../../shared/middleware/auth.js";

const router = Router();

// All routes require authentication
router.use(authenticateToken);

/**
 * GET /api/applications/hustler/my
 * Get all applications by the current hustler
 */
router.get(
  "/hustler/my",
  ContractApplicationController.getHustlerApplications
);

/**
 * POST /api/applications/:contractId
 * Create a new application for a contract
 */
router.post(
  "/:contractId",
  ContractApplicationController.createApplication
);

/**
 * GET /api/applications/contract/:contractId
 * Get all applications for a contract (manager only)
 */
router.get(
  "/contract/:contractId",
  ContractApplicationController.getContractApplications
);

/**
 * GET /api/applications/contract/:contractId/pending
 * Get pending applications for a contract
 */
router.get(
  "/contract/:contractId/pending",
  ContractApplicationController.getPendingApplications
);

/**
 * GET /api/applications/:applicationId
 * Get application details with applicant profile
 */
router.get(
  "/:applicationId",
  ContractApplicationController.getApplicationDetails
);

router.put(
  "/:applicationId",
  ContractApplicationController.updateApplication
);

router.post(
  "/:applicationId/cancel",
  ContractApplicationController.cancelApplication
);

/**
 * POST /api/applications/:applicationId/accept
 * Accept an application (manager only)
 */
router.post(
  "/:applicationId/accept",
  ContractApplicationController.acceptApplication
);

/**
 * POST /api/applications/:applicationId/reject
 * Reject an application (manager only)
 */
router.post(
  "/:applicationId/reject",
  ContractApplicationController.rejectApplication
);

export default router;

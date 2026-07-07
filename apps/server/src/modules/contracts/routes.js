/**
 * Contracts Routes
 * REST API endpoints for contract operations
 */

import { Router } from "express";
import { createContract, updateContract, assignContract, prepareEscrow, finalApproveContract, closeContract, deleteContract, getContract, listContracts, approveContract, rejectContract, listMyContracts } from "./controller.js";
import { validate } from "../../shared/middleware/validation.js";
import { authenticateToken, authorizeRoles } from "../../shared/middleware/auth.js";
import { USER_ROLES } from "../../config/constants.js";

const router = Router();

router.post(
  "/",
  authenticateToken,
  validate([
    { field: "title", type: "string", required: true, minLength: 1 },
    { field: "description", type: "string", required: true, minLength: 1 },
    { field: "amount", type: "number", required: true },
    { field: "currency", type: "string", required: true, minLength: 1 },
  ]),
  createContract
);

router.put(
  "/:id",
  authenticateToken,
  authorizeRoles(USER_ROLES.MANAGER),
  validate([
    { field: "title", type: "string", required: true, minLength: 1 },
    { field: "description", type: "string", required: true, minLength: 1 },
    { field: "amount", type: "number", required: true },
    { field: "currency", type: "string", required: true, minLength: 1 },
  ]),
  updateContract
);

router.post("/:id/assign", authenticateToken, validate([{ field: "freelancerId", type: "string", required: true }]), assignContract);
router.post("/:id/escrow", authenticateToken, validate([{ field: "amount", type: "number", required: true }]), prepareEscrow);
router.post("/:id/final-approval", authenticateToken, authorizeRoles(USER_ROLES.MANAGER), finalApproveContract);
router.post("/:id/close", authenticateToken, closeContract);
router.post("/:id/approve", authenticateToken, authorizeRoles(USER_ROLES.MANAGER), approveContract);
router.post("/:id/reject", authenticateToken, authorizeRoles(USER_ROLES.MANAGER), validate([{ field: "reason", type: "string", required: false }]), rejectContract);
router.delete("/:id", authenticateToken, authorizeRoles(USER_ROLES.MANAGER), deleteContract);

// Hustler: view contracts they applied for
router.get("/my", authenticateToken, authorizeRoles(USER_ROLES.HUSTLER), listMyContracts);

// Manager-only: list all contracts with status 'applied'
router.get("/applied", authenticateToken, authorizeRoles(USER_ROLES.MANAGER), (req, res, next) => {
  // delegate to listContracts controller with status filter
  req.query.status = "applied";
  return listContracts(req, res, next);
});

router.get("/:id", authenticateToken, getContract);
router.get("/", authenticateToken, listContracts);

export default router;

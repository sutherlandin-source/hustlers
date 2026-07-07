import { Router } from "express";
import { createContract, assignContract, prepareEscrow, closeContract, getContract, listContracts } from "../../controllers/contractController.js";
import { validate } from "../../middleware/validation.js";
import { authenticateToken } from "../../middleware/auth.js";

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

router.post("/:id/assign", authenticateToken, validate([{ field: "freelancerId", type: "string", required: true }]), assignContract);
router.post("/:id/escrow", authenticateToken, validate([{ field: "amount", type: "number", required: true }]), prepareEscrow);
router.post("/:id/close", authenticateToken, closeContract);

router.get("/:id", authenticateToken, getContract);
router.get("/", authenticateToken, listContracts);

export default router;

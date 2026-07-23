import { Router } from "express";
import { authenticateToken } from "../../shared/middleware/auth.js";
import { validate } from "../../shared/middleware/validation.js";
import { createDispute, listDisputes, getDispute, getDisputeForContract, addEvidence, performAction } from "./controller.js";

const router = Router();

router.use(authenticateToken);

router.get("/", listDisputes);
router.get("/contract/:contractId", getDisputeForContract);
router.get("/:id", getDispute);
router.post(
  "/",
  validate([
    { field: "contractId", type: "string", required: true },
    { field: "reason", type: "string", required: true },
    { field: "details", type: "string", required: false },
    { field: "requestedResolution", type: "string", required: false },
    { field: "attachments", type: "array", required: false },
  ]),
  createDispute
);
router.post(
  "/:id/evidence",
  validate([
    { field: "attachments", type: "array", required: true },
    { field: "notes", type: "string", required: false },
  ]),
  addEvidence
);
router.post("/:id/actions", performAction);

export default router;

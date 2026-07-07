/**
 * Conversations Routes
 */

import { Router } from "express";
import { authenticateToken } from "../../shared/middleware/auth.js";
import { validate } from "../../shared/middleware/validation.js";
import { listConversations, getConversation, createNewConversation, openContractConversation, unreadForContract } from "./controller.js";

const router = Router();

router.use(authenticateToken);

router.get("/", listConversations);
router.get("/:id", getConversation);
router.get("/contract/:contractId/unread", unreadForContract);
router.post("/contract/:contractId", openContractConversation);
router.post(
  "/",
  validate([
    { field: "contractId", type: "string", required: false },
    { field: "participants", type: "array", required: true },
  ]),
  createNewConversation
);

export default router;

/**
 * Conversations Routes
 */

import { Router } from "express";
import { authenticateToken } from "../../shared/middleware/auth.js";
import { validate } from "../../shared/middleware/validation.js";
import { listConversations, getConversation, createNewConversation, openContractConversation, openSupportTicket, unreadForContract } from "./controller.js";

const router = Router();

router.use(authenticateToken);

router.get("/", listConversations);
// ⚠️ Specific routes MUST come before /:id wildcard
router.get("/contract/:contractId/unread", unreadForContract);
router.post("/contract/:contractId", openContractConversation);
router.post("/support", openSupportTicket);
router.get("/:id", getConversation);
router.post(
  "/",
  validate([
    { field: "contractId", type: "string", required: false },
    { field: "participants", type: "array", required: true },
  ]),
  createNewConversation
);

export default router;

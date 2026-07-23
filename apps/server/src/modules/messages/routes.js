/**
 * Messages Routes
 */

import { Router } from "express";
import { authenticateToken } from "../../shared/middleware/auth.js";
import { validate } from "../../shared/middleware/validation.js";
import { getMessages, postMessage } from "./controller.js";

const router = Router();

router.use(authenticateToken);

router.get("/:conversationId", getMessages);
router.post(
  "/",
  validate([
    { field: "conversationId", type: "string", required: true },
    { field: "text", type: "string", required: false },
    { field: "attachments", type: "array", required: false },
  ]),
  postMessage
);

export default router;

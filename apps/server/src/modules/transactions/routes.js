/**
 * Transactions Routes
 * REST API endpoints for transaction operations
 */

import { Router } from "express";
import { validate } from "../../shared/middleware/validation.js";
import { authenticateToken } from "../../shared/middleware/auth.js";
import { listTransactions, getTransaction } from "./controller.js";

const router = Router();

router.get("/", authenticateToken, listTransactions);
router.get("/:id", authenticateToken, getTransaction);

export default router;

import { Router } from "express";
import { validate } from "../../middleware/validation.js";
import { authenticateToken } from "../../middleware/auth.js";
import { listTransactions, getTransaction } from "../../controllers/transactionController.js";

const router = Router();

router.get("/", authenticateToken, listTransactions);
router.get("/:id", authenticateToken, getTransaction);

export default router;

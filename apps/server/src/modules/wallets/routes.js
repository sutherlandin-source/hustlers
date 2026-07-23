/**
 * Wallets Routes
 * REST API endpoints for wallet operations
 */

import { Router } from "express";
import { validate } from "../../shared/middleware/validation.js";
import { authenticateToken } from "../../shared/middleware/auth.js";
import { createWallet, listWallets, getWallet, depositWallet, withdrawWallet, fundWallet } from "./controller.js";

const router = Router();

router.post(
  "/",
  authenticateToken,
  validate([
    { field: "currency", type: "string", required: true, minLength: 3 },
    { field: "type", type: "string", required: false },
  ]),
  createWallet
);

router.get("/", authenticateToken, listWallets);
router.post(
  "/fund",
  authenticateToken,
  validate([
    { field: "amount", type: "number", required: true, min: 0.01 },
    { field: "currency", type: "string", required: false },
    { field: "description", type: "string", required: false },
  ]),
  fundWallet
);
router.get("/:id", authenticateToken, getWallet);
router.post(
  "/:id/deposit",
  authenticateToken,
  validate([{ field: "amount", type: "number", required: true, min: 0.01 }]),
  depositWallet
);
router.post(
  "/:id/withdraw",
  authenticateToken,
  validate([{ field: "amount", type: "number", required: true, min: 0.01 }]),
  withdrawWallet
);

export default router;

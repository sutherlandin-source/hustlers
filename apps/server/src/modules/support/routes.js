import { Router } from "express";
import { validate } from "../../shared/middleware/validation.js";
import { createPublicSupportTicket } from "./controller.js";

const router = Router();

router.post(
  "/ticket",
  validate([
    { field: "email", type: "string", required: true },
    { field: "message", type: "string", required: true },
  ]),
  createPublicSupportTicket
);

export default router;

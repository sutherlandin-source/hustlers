/**
 * Authentication Routes
 * Authentication and user endpoints
 */

import { Router } from "express";
import {
  register,
  login,
  refreshToken,
  logout,
  requestPasswordReset,
  resetPassword,
  requestOtp,
  verifyOtp,
  getProfile,
} from "../../controllers/authController.js";
import { validate } from "../../middleware/validation.js";
import { authenticateToken } from "../../middleware/auth.js";

const router = Router();

router.post(
  "/register",
  validate([
    { field: "email", type: "email", required: true },
    { field: "password", type: "string", required: true, minLength: 8 },
    { field: "firstName", type: "string", required: true, minLength: 2 },
    { field: "lastName", type: "string", required: true, minLength: 2 },
    { field: "phoneNumber", type: "string", required: true, pattern: /^\+254\d{9}$/ },
    { field: "location", type: "string", required: true, minLength: 2 },
    { field: "skills", type: "array", required: false },
    { field: "bio", type: "string", required: false, minLength: 10, maxLength: 500 },
    { field: "experienceLevel", type: "string", required: false },
    { field: "companyName", type: "string", required: false },
    { field: "industry", type: "string", required: false, minLength: 2 },
  ]),
  register
);

router.post(
  "/login",
  validate([
    { field: "email", type: "email", required: true },
    { field: "password", type: "string", required: true },
  ]),
  login
);

router.post(
  "/refresh-token",
  validate([{ field: "refreshToken", type: "string", required: true }]),
  refreshToken
);

router.post("/logout", authenticateToken, logout);

router.post(
  "/password/forgot",
  validate([{ field: "email", type: "email", required: true }]),
  requestPasswordReset
);

router.post(
  "/password/reset",
  validate([
    { field: "email", type: "email", required: true },
    { field: "token", type: "string", required: true },
    { field: "password", type: "string", required: true, minLength: 8 },
  ]),
  resetPassword
);

router.post(
  "/otp/request",
  validate([{ field: "email", type: "email", required: true }]),
  requestOtp
);

router.post(
  "/otp/verify",
  validate([
    { field: "email", type: "email", required: true },
    { field: "otpCode", type: "string", required: true, minLength: 4 },
  ]),
  verifyOtp
);

router.get("/me", authenticateToken, getProfile);

export default router;

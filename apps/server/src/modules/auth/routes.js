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
} from "./controller.js";
import { validate } from "../../shared/middleware/validation.js";
import { authenticateToken } from "../../shared/middleware/auth.js";
import { USER_ROLES } from "../../shared/config/constants.js";
import { authValidation } from "./validation.js";

const router = Router();

router.post("/register", validate(authValidation.register), register);
router.post("/login", validate(authValidation.login), login);
router.post("/refresh-token", validate(authValidation.refreshToken), refreshToken);
router.post("/logout", authenticateToken, logout);
router.post("/password/forgot", validate(authValidation.passwordForgot), requestPasswordReset);
router.post("/password/reset", validate(authValidation.passwordReset), resetPassword);
router.post("/otp/request", validate(authValidation.otpRequest), requestOtp);
router.post("/otp/verify", validate(authValidation.otpVerify), verifyOtp);
router.get("/me", authenticateToken, getProfile);

export default router;

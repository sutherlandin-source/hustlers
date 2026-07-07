/**
 * Authentication Controller
 * Handles authentication endpoints
 */

import { authService } from "./service.js";
import { SUCCESS_MESSAGES, ERROR_MESSAGES } from "../../shared/config/constants.js";

function buildResponse(res, status, message, data = {}) {
  return res.status(status).json({
    success: status >= 200 && status < 300,
    message,
    data,
    timestamp: new Date().toISOString(),
  });
}

export async function register(req, res, next) {
  try {
    const result = await authService.register(req.body);
    return buildResponse(res, 201, SUCCESS_MESSAGES.REGISTER_SUCCESS, result);
  } catch (error) {
    next(error);
  }
}

export async function login(req, res, next) {
  try {
    const result = await authService.login(req.body);
    return buildResponse(res, 200, SUCCESS_MESSAGES.LOGIN_SUCCESS, result);
  } catch (error) {
    next(error);
  }
}

export async function refreshToken(req, res, next) {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      throw new Error(ERROR_MESSAGES.MISSING_REQUIRED_FIELDS);
    }

    const result = await authService.refreshTokens(refreshToken);
    return buildResponse(res, 200, "Token refreshed successfully", result);
  } catch (error) {
    next(error);
  }
}

export async function logout(req, res, next) {
  try {
    await authService.logout(req.user.userId);
    return buildResponse(res, 200, SUCCESS_MESSAGES.LOGOUT_SUCCESS);
  } catch (error) {
    next(error);
  }
}

export async function requestPasswordReset(req, res, next) {
  try {
    const { email } = req.body;
    const result = await authService.requestPasswordReset(email);
    return buildResponse(res, 200, result.message, { success: true });
  } catch (error) {
    next(error);
  }
}

export async function resetPassword(req, res, next) {
  try {
    const { email, token, password } = req.body;
    const result = await authService.resetPassword(email, token, password);
    return buildResponse(res, 200, result.message, { success: true });
  } catch (error) {
    next(error);
  }
}

export async function requestOtp(req, res, next) {
  try {
    const { email, purpose } = req.body;
    const result = await authService.requestOtp(email, purpose);
    return buildResponse(res, 200, result.message, { success: true });
  } catch (error) {
    next(error);
  }
}

export async function verifyOtp(req, res, next) {
  try {
    const { email, otpCode, purpose } = req.body;
    const result = await authService.verifyOtp(email, otpCode, purpose);
    return buildResponse(res, 200, result.message, { success: true });
  } catch (error) {
    next(error);
  }
}

export async function getProfile(req, res, next) {
  try {
    const user = await authService.getUserById(req.user.userId);
    return buildResponse(res, 200, "User profile retrieved", { user: user?.getPublicProfile() ?? null });
  } catch (error) {
    next(error);
  }
}

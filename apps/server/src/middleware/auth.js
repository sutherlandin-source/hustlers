/**
 * Authentication middleware
 * Verifies JWT tokens and protects routes
 */

import { verifyAccessToken } from "../utils/jwt.js";
import { ApiError } from "./errorHandler.js";
import { HTTP_STATUS, ERROR_MESSAGES } from "../config/constants.js";
import { logger } from "../utils/logger.js";
import { hasAllowedRole } from "../shared/utils/roles.js";

export function authenticateToken(req, _res, next) {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(" ")[1];

    if (!token) {
      throw new ApiError(HTTP_STATUS.UNAUTHORIZED, ERROR_MESSAGES.UNAUTHORIZED);
    }

    const payload = verifyAccessToken(token);
    req.user = payload;

    logger.debug("Token verified", {
      userId: payload.userId,
      email: payload.email,
    });

    next();
  } catch (error) {
    if (error instanceof ApiError) {
      next(error);
    } else if (error instanceof Error) {
      next(new ApiError(HTTP_STATUS.UNAUTHORIZED, error.message));
    } else {
      next(new ApiError(HTTP_STATUS.UNAUTHORIZED, ERROR_MESSAGES.UNAUTHORIZED));
    }
  }
}

export function authorize(...allowedRoles) {
  return (req, _res, next) => {
    try {
      if (!req.user) {
        throw new ApiError(HTTP_STATUS.UNAUTHORIZED, ERROR_MESSAGES.UNAUTHORIZED);
      }

      if (!hasAllowedRole(req.user.role, allowedRoles)) {
        throw new ApiError(HTTP_STATUS.FORBIDDEN, "Insufficient permissions");
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

export const authorizeRoles = authorize;

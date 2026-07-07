/**
 * Error handling middleware
 * Centralized error handling for all routes
 */

import { logger } from "../utils/logger.js";
import { HTTP_STATUS, ERROR_MESSAGES } from "../config/constants.js";

export class ApiError extends Error {
  constructor(statusCode, message, errors) {
    super(message);
    this.statusCode = statusCode;
    this.errors = errors;
    this.name = "ApiError";
  }
}

/**
 * Global error handler middleware
 */
export function errorHandler(error, _req, res, _next) {
  logger.error("Error caught by error handler", error);

  // Handle known API errors
  if (error instanceof ApiError) {
    res.status(error.statusCode).json({
      success: false,
      message: error.message,
      errors: error.errors,
      timestamp: new Date().toISOString(),
    });
    return;
  }

  // Handle JWT errors
  if (error.name === "JsonWebTokenError") {
    res.status(HTTP_STATUS.UNAUTHORIZED).json({
      success: false,
      message: ERROR_MESSAGES.INVALID_TOKEN,
      timestamp: new Date().toISOString(),
    });
    return;
  }

  if (error.name === "TokenExpiredError") {
    res.status(HTTP_STATUS.UNAUTHORIZED).json({
      success: false,
      message: ERROR_MESSAGES.TOKEN_EXPIRED,
      timestamp: new Date().toISOString(),
    });
    return;
  }

  // Handle MongoDB validation errors
  if (error.name === "ValidationError") {
    res.status(HTTP_STATUS.UNPROCESSABLE_ENTITY).json({
      success: false,
      message: ERROR_MESSAGES.VALIDATION_FAILED,
      timestamp: new Date().toISOString(),
    });
    return;
  }

  // Default error response
  res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
    success: false,
    message: ERROR_MESSAGES.INTERNAL_ERROR,
    timestamp: new Date().toISOString(),
  });
}

/**
 * 404 handler middleware
 */
export function notFoundHandler(_req, res, _next) {
  res.status(HTTP_STATUS.NOT_FOUND).json({
    success: false,
    message: ERROR_MESSAGES.NOT_FOUND,
    timestamp: new Date().toISOString(),
  });
}

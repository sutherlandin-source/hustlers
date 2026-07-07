/**
 * Express Application Factory
 * Creates and configures the Express app with production-ready middleware
 */

import express from "express";
import cors from "cors";
import helmet from "helmet";
import apiRoutes from "./routes/index.js";
import { requestLogger } from "./shared/middleware/logger.js";
import { errorHandler, notFoundHandler } from "./shared/middleware/errorHandler.js";
import { asyncHandler } from "./shared/middleware/asyncHandler.js";
import { apiRateLimit } from "./shared/middleware/rateLimit.js";
import { requestIdMiddleware } from "./shared/middleware/requestId.js";
import { env } from "./shared/config/env.js";
import { logger } from "./shared/utils/logger.js";

/**
 * Create and configure Express application
 */
export function createApp() {
  const app = express();

  // ===== SECURITY MIDDLEWARE =====
  /**
   * Helmet - Sets HTTP security headers
   * Protects against common vulnerabilities like XSS, CSRF, etc.
   */
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
        },
      },
      hsts: {
        maxAge: 31536000, // 1 year in seconds
        includeSubDomains: true,
        preload: true,
      },
    })
  );
  logger.info("Helmet security middleware enabled");

  /**
   * CORS - Cross-Origin Resource Sharing
   * Configured for specific origins in production
   */
  app.use(
    cors({
      origin: env.ALLOWED_ORIGINS,
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "X-Request-ID"],
      exposedHeaders: ["X-Request-ID", "X-RateLimit-Limit", "X-RateLimit-Remaining"],
      maxAge: 3600, // Preflight cache for 1 hour
    })
  );
  logger.info("CORS middleware configured");

  /**
   * Rate Limiting - Prevents API abuse
   */
  app.use(apiRateLimit());
  logger.info("Rate limiting middleware enabled");

  // ===== PARSING MIDDLEWARE =====
  /**
   * Request ID - Unique identifier for request tracing
   */
  app.use(requestIdMiddleware);
  logger.info("Request ID middleware enabled");

  /**
   * JSON and URL-encoded body parser
   */
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ limit: "10mb", extended: true }));
  logger.info("Body parsing middleware configured");

  // ===== LOGGING MIDDLEWARE =====
  /**
   * Request logging - Logs all incoming requests
   */
  app.use(requestLogger);

  // ===== HEALTH CHECK ENDPOINT =====
  /**
   * Health check endpoint - Used by load balancers and monitoring
   */
  app.get("/health", (req, res) => {
    res.status(200).json({
      status: "ok",
      timestamp: new Date().toISOString(),
      requestId: req.id,
    });
  });

  app.get("/ready", (req, res) => {
    res.status(200).json({
      status: "ready",
      environment: env.NODE_ENV,
      timestamp: new Date().toISOString(),
      requestId: req.id,
    });
  });

  // ===== API ROUTES =====
  /**
   * Main API routes with version prefix
   * Pattern: /api/v1/*
   */
  app.use(`${env.API_PREFIX}/${env.API_VERSION}`, apiRoutes);
  logger.info(`API routes mounted at ${env.API_PREFIX}/${env.API_VERSION}`);

  // ===== ERROR HANDLING MIDDLEWARE =====
  /**
   * 404 handler - Handles undefined routes
   */
  app.use(notFoundHandler);

  /**
   * Global error handler - Must be last
   */
  app.use(errorHandler);

  logger.info("Express app configured successfully");

  return app;
}

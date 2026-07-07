/**
 * Health Controller
 * Simple health check endpoints
 */

import { getConnectionStatus } from "../config/database.js";
import { SUCCESS_MESSAGES } from "../config/constants.js";

/**
 * Health check endpoint
 */
export async function healthCheck(_req, res, _next) {
  const { connected, readyState } = getConnectionStatus();

  res.status(200).json({
    success: true,
    message: SUCCESS_MESSAGES.HEALTH_CHECK,
    data: {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      database: {
        connected,
        readyState,
      },
      timestamp: new Date().toISOString(),
    },
    timestamp: new Date().toISOString(),
  });
}

/**
 * Readiness check endpoint
 */
export async function readinessCheck(_req, res, _next) {
  const { connected } = getConnectionStatus();

  if (!connected) {
    res.status(503).json({
      success: false,
      message: "Service not ready - database disconnected",
      timestamp: new Date().toISOString(),
    });
    return;
  }

  res.status(200).json({
    success: true,
    message: "Ready to serve requests",
    timestamp: new Date().toISOString(),
  });
}

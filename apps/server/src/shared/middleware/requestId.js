/**
 * Request ID Middleware
 * Assigns unique IDs to requests for tracing and debugging
 */

import { v4 as uuidv4 } from "uuid";

/**
 * Middleware to add unique request ID to each request
 * Useful for request tracing in logs and debugging
 */
export function requestIdMiddleware(req, res, next) {
  const requestId = req.headers["x-request-id"] || uuidv4();
  req.id = requestId;
  req.requestId = requestId;

  res.setHeader("X-Request-ID", requestId);

  // Make request ID available in logs via context
  const originalLog = console.log;
  console.log = (...args) => {
    originalLog(`[${requestId}]`, ...args);
  };

  // Restore console.log on response
  const originalJson = res.json;
  res.json = function (data) {
    console.log = originalLog;
    return originalJson.call(this, data);
  };

  next();
}

/**
 * Logging middleware
 * Logs all incoming requests and responses
 */

import { v4 as uuidv4 } from "uuid";
import { logger } from "../utils/logger.js";

export function requestLogger(req, res, next) {
  const requestId = uuidv4();
  req.requestId = requestId;

  logger.info(`→ ${req.method} ${req.path}`, {
    requestId,
    method: req.method,
    path: req.path,
    query: Object.keys(req.query).length > 0 ? req.query : undefined,
    ip: req.ip,
  });

  const originalSend = res.send;

  res.send = function (data) {
    logger.info(`← ${req.method} ${req.path} [${res.statusCode}]`, {
      requestId,
      statusCode: res.statusCode,
      responseTime: `${Date.now() - req.startTime}ms`,
    });
    return originalSend.call(this, data);
  };

  req.startTime = Date.now();

  next();
}

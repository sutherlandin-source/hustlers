/**
 * Rate Limiting Middleware
 * Prevents API abuse through rate limiting
 */

import { HTTP_STATUS, ERROR_MESSAGES } from "../config/constants.js";
import { logger } from "../utils/logger.js";

/**
 * In-memory store for rate limiting
 * In production, use Redis for distributed rate limiting
 */
class RateLimitStore {
  constructor() {
    this.requests = new Map();
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000); // Cleanup every minute
  }

  addRequest(identifier) {
    const now = Date.now();
    const userRequests = this.requests.get(identifier) || [];

    // Remove requests older than 1 minute
    const recentRequests = userRequests.filter((time) => now - time < 60000);
    recentRequests.push(now);

    this.requests.set(identifier, recentRequests);
    return recentRequests.length;
  }

  cleanup() {
    const now = Date.now();
    for (const [key, times] of this.requests.entries()) {
      const recentTimes = times.filter((time) => now - time < 60000);
      if (recentTimes.length === 0) {
        this.requests.delete(key);
      } else {
        this.requests.set(key, recentTimes);
      }
    }
  }

  destroy() {
    clearInterval(this.cleanupInterval);
  }
}

const store = new RateLimitStore();

/**
 * General rate limiter middleware
 * @param {number} limit - Number of requests allowed
 * @param {number} windowMs - Time window in milliseconds
 * @returns {Function} Express middleware
 */
export function rateLimit({ limit = 100, windowMs = 60000 } = {}) {
  return (req, res, next) => {
    const identifier = req.ip || req.socket.remoteAddress;
    const requestCount = store.addRequest(identifier);

    res.set("X-RateLimit-Limit", limit);
    res.set("X-RateLimit-Remaining", Math.max(0, limit - requestCount));

    if (requestCount > limit) {
      logger.warn(`Rate limit exceeded for IP: ${identifier}`);
      return res.status(HTTP_STATUS.TOO_MANY_REQUESTS).json({
        success: false,
        message: "Too many requests, please try again later",
        retryAfter: Math.ceil(windowMs / 1000),
        timestamp: new Date().toISOString(),
      });
    }

    next();
  };
}

/**
 * Strict rate limiter for authentication endpoints
 * More restrictive than general rate limiter
 */
export function authRateLimit() {
  return rateLimit({ limit: 5, windowMs: 900000 }); // 5 requests per 15 minutes
}

/**
 * API endpoint rate limiter
 * Standard rate limit for most endpoints
 */
export function apiRateLimit() {
  return rateLimit({ limit: 100, windowMs: 60000 }); // 100 requests per minute
}

export { store };

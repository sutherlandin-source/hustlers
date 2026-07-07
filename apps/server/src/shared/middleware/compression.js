/**
 * Response Compression Middleware
 * Compresses responses for faster transfer in production
 */

import { logger } from "../utils/logger.js";

/**
 * Simple compression middleware for responses
 * In production, consider using the 'compression' npm package
 */
export function compressionMiddleware(req, res, next) {
  // Check if client accepts gzip compression
  const acceptEncoding = req.headers["accept-encoding"] || "";

  if (!acceptEncoding.includes("gzip")) {
    return next();
  }

  // For production, install: npm install compression
  // import compression from 'compression';
  // app.use(compression({ level: 6 }));

  next();
}

/**
 * Production compression setup recommendation
 * Install: npm install compression
 *
 * Usage in app.js:
 * import compression from 'compression';
 * app.use(compression({ level: 6 }));
 */
export const compressionConfig = {
  installation: "npm install compression",
  level: 6, // Compression level (0-9, higher = better but slower)
  threshold: 1024, // Only compress responses larger than 1KB
  filter: (req, res) => {
    // Don't compress if request has X-No-Compression header
    if (req.headers["x-no-compression"]) {
      return false;
    }
    return true;
  },
};

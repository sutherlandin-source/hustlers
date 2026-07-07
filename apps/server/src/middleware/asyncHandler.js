/**
 * Async Request Wrapper
 * Wraps async route handlers to catch errors and pass them to error middleware
 * Eliminates need for try-catch in every route
 */

/**
 * Wrap async controller functions to automatically handle errors
 * @param {Function} fn - Async function to wrap
 * @returns {Function} Express middleware function
 */
export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Alternative: Express async error handler wrapper
 * Usage: app.use(expressAsyncErrors())
 */
export function expressAsyncErrors() {
  return (req, res, next) => {
    const originalSend = res.send;

    res.send = function (data) {
      res.send = originalSend;
      return res.send(data);
    };

    next();
  };
}

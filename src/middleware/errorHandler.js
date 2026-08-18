/**
 * Catches anything thrown/rejected inside a route and returns a clean
 * JSON error instead of leaking a stack trace to the client. Route
 * handlers should call next(err) on failure, or use the asyncHandler
 * wrapper below so they don't need a try/catch in every single route.
 */
function errorHandler(err, req, res, next) {
  console.error("Unhandled error:", err);

  const status = err.status || 500;
  const message =
    status === 500 ? "Internal server error." : err.message || "Request failed.";

  res.status(status).json({ error: message });
}

/**
 * Wraps an async route handler so a thrown error is forwarded to
 * errorHandler instead of crashing the process or hanging the request.
 * Usage: router.get("/x", asyncHandler(async (req, res) => { ... }))
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = { errorHandler, asyncHandler };

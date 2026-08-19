// TEST-ONLY — swaps real Firebase token verification for a fake that
// trusts a plain "x-test-uid" header, so booking-flow HTTP tests can
// run locally without needing real Firebase project credentials.
//
// This file is never deployed: the Dockerfile only copies server.js
// and src/ into the production image, never test/. It exists purely
// so you (or CI) can run `npm test` locally against a real Postgres
// and exercise the full HTTP + ownership + state-machine flow.
const express = require("express");
const { errorHandler } = require("../src/middleware/errorHandler");

// Order matters: patch the auth module's export BEFORE anything
// requires routes/bookings.js, because bookings.js destructures
// `requireAuth` out of this module at require-time. If bookings.js is
// required first, it captures the original (real Firebase-checking)
// function by value, and patching the module afterward has no effect.
const authModule = require("../src/middleware/auth");
authModule.requireAuth = (req, res, next) => {
  const uid = req.headers["x-test-uid"];
  if (!uid) return res.status(401).json({ error: "Missing x-test-uid test header." });
  req.userId = uid;
  next();
};

// Only require bookings.js AFTER the patch above.
const bookingRoutes = require("../src/routes/bookings");

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use(bookingRoutes);
  app.use((req, res) => res.status(404).json({ error: "Not found." }));
  app.use(errorHandler);
  return app;
}

module.exports = { createTestApp };

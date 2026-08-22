const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");

const healthRoutes = require("./routes/health");
const meRoutes = require("./routes/me");
const bookingRoutes = require("./routes/bookings");
const paymentRoutes = require("./routes/payments");
const stripeWebhookRoutes = require("./routes/stripeWebhook");
const adminRoutes = require("./routes/admin");
const { errorHandler } = require("./middleware/errorHandler");
const connectRoutes = require("./routes/connect"); 

function createApp() {
  const app = express();

  // Trust the reverse proxy (Nginx) for correct client IPs — needed for
  // rate limiting and logging to reflect the real caller, not the proxy.
  app.set("trust proxy", 1);

  app.use(helmet());
  app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

  // Must be mounted BEFORE express.json() — Stripe signature verification
  // needs the raw, unparsed request body.
  app.use(stripeWebhookRoutes);

  app.use(express.json());

  const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

  app.use(
    cors({
      origin: allowedOrigins.length > 0 ? allowedOrigins : undefined,
    })
  );

  const limiter = rateLimit({
    windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
    max: Number(process.env.RATE_LIMIT_MAX_REQUESTS) || 200,
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use(limiter);

  app.use(healthRoutes);
  app.use(meRoutes);
  app.use(bookingRoutes);
  app.use(paymentRoutes);
  app.use(connectRoutes);
  app.use(adminRoutes);
  

  // 404 for anything unmatched
  app.use((req, res) => {
    res.status(404).json({ error: "Not found." });
  });

  // Must be registered last — Express calls this for any next(err)
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };

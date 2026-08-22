const express = require("express");
const { requireAuth } = require("../middleware/auth");
const { asyncHandler } = require("../middleware/errorHandler");
const { getStripeClient } = require("../config/stripe");
const userRepo = require("../repositories/userRepository");

const router = express.Router();

const RETURN_URL = process.env.STRIPE_CONNECT_RETURN_URL || "https://scholarinapp.duckdns.org/connect/complete";
const REFRESH_URL = process.env.STRIPE_CONNECT_REFRESH_URL || "https://scholarinapp.duckdns.org/connect/refresh";

router.post(
  "/connect/onboard",
  requireAuth,
  asyncHandler(async (req, res) => {
    const role = await userRepo.getUserRole(req.userId);
    if (role !== "CONSULTANT") {
      return res.status(403).json({ error: "Only consultants can connect a Stripe account." });
    }

    const stripe = getStripeClient();
    const existing = await userRepo.getStripeConnectAccount(req.userId);
    let accountId = existing?.stripe_connect_account_id;

    if (!accountId) {
      const user = await userRepo.getUserBasicInfo(req.userId);
      const created = await stripe.accounts.create({
        type: "express",
        email: user?.email,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
      });
      accountId = created.id;
      await userRepo.saveStripeConnectAccountId(req.userId, accountId);
    }

    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: REFRESH_URL,
      return_url: RETURN_URL,
      type: "account_onboarding",
    });

    res.json({ url: accountLink.url });
  })
);

router.get(
  "/connect/status",
  requireAuth,
  asyncHandler(async (req, res) => {
    const account = await userRepo.getStripeConnectAccount(req.userId);
    if (!account?.stripe_connect_account_id) {
      return res.json({ connected: false, chargesEnabled: false });
    }

    // DB value is kept current by the account.updated webhook, but double-check
    // live in case that event hasn't landed yet.
    const stripe = getStripeClient();
    const live = await stripe.accounts.retrieve(account.stripe_connect_account_id);
    if (live.charges_enabled !== account.stripe_connect_charges_enabled) {
      await userRepo.setChargesEnabledByAccountId(account.stripe_connect_account_id, live.charges_enabled);
    }

    res.json({
      connected: true,
      chargesEnabled: live.charges_enabled,
      accountId: account.stripe_connect_account_id,
    });
  })
);

module.exports = router;
const express = require("express");
const { requireAuth } = require("../middleware/auth");
const { requireAdmin } = require("../middleware/requireAdmin");
const { asyncHandler } = require("../middleware/errorHandler");
const { getStripeClient } = require("../config/stripe");
const bookingRepo = require("../repositories/bookingRepository");
const { STATUSES, ACTORS, isTransitionAllowed } = require("../domain/bookingStateMachine");

const router = express.Router();

router.get(
  "/admin/disputes",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const disputes = await bookingRepo.listDisputedBookings();
    res.json(disputes);
  })
);

router.post(
  "/admin/disputes/:id/resolve",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { resolution, note } = req.body;
    if (!["refund", "release"].includes(resolution)) {
      return res.status(400).json({ error: 'resolution must be "refund" or "release".' });
    }

    const booking = await bookingRepo.getBookingById(req.params.id);
    if (!booking) {
      return res.status(404).json({ error: "Booking not found." });
    }

    const targetStatus = resolution === "refund" ? STATUSES.REFUNDED : STATUSES.COMPLETED;
    const check = isTransitionAllowed(booking.status, targetStatus, ACTORS.ADMIN);
    if (!check.allowed) {
      return res.status(409).json({ error: check.reason });
    }

    if (resolution === "refund") {
      if (!booking.stripe_payment_intent_id) {
        return res.status(400).json({ error: "This booking has no recorded payment to refund." });
      }
      const stripe = getStripeClient();
      await stripe.refunds.create({ payment_intent: booking.stripe_payment_intent_id });
    }

    const resolutionText =
      resolution === "refund"
        ? `Refunded to student by admin.${note ? " Note: " + note : ""}`
        : `Resolved in consultant's favor by admin. NOTE: payout to consultant is not yet automated (Stripe Connect not implemented).${
            note ? " Note: " + note : ""
          }`;

    const updated = await bookingRepo.resolveDispute(booking.id, targetStatus, resolutionText);
    res.json(updated);
  })
);

module.exports = router;
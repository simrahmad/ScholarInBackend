const express = require("express");
const { requireAuth } = require("../middleware/auth");
const { asyncHandler } = require("../middleware/errorHandler");
const { getStripeClient } = require("../config/stripe");
const bookingRepo = require("../repositories/bookingRepository");

const router = express.Router();

router.post(
  "/bookings/:id/create-payment-intent",
  requireAuth,
  asyncHandler(async (req, res) => {
    const booking = await bookingRepo.getBookingById(req.params.id);
    if (!booking) {
      return res.status(404).json({ error: "Booking not found." });
    }
    if (booking.student_id !== req.userId) {
      return res.status(403).json({ error: "Only the student on this booking can pay for it." });
    }
    if (booking.status !== "accepted") {
      return res.status(409).json({
        error: `Cannot start payment — booking status is "${booking.status}", expected "accepted".`,
      });
    }

    const amountInCents = Math.round(Number(booking.price) * 100);

    const stripe = getStripeClient();
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInCents,
      currency: "usd",
      metadata: {
        bookingId: booking.id,
        studentId: booking.student_id,
        consultantId: booking.consultant_id,
      },
      automatic_payment_methods: { enabled: true },
    });

    await bookingRepo.attachPaymentIntent(booking.id, paymentIntent.id);

    res.json({ clientSecret: paymentIntent.client_secret });
  })
);

module.exports = router;
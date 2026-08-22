const express = require("express");
const { getStripeClient } = require("../config/stripe");
const { asyncHandler } = require("../middleware/errorHandler");
const bookingRepo = require("../repositories/bookingRepository");
const userRepo = require("../repositories/userRepository");
const { sendPaymentReceivedEmail } = require("../services/email");
const { STATUSES, isTransitionAllowed } = require("../domain/bookingStateMachine");

const router = express.Router();

router.post(
  "/webhooks/stripe",
  express.raw({ type: "application/json" }),
  asyncHandler(async (req, res) => {
    const signature = req.headers["stripe-signature"];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) {
      console.error("STRIPE_WEBHOOK_SECRET is not set — rejecting webhook.");
      return res.status(500).send("Webhook not configured.");
    }

    let event;
    try {
      event = getStripeClient().webhooks.constructEvent(req.body, signature, webhookSecret);
    } catch (err) {
      console.error("Stripe webhook signature verification failed:", err.message);
      return res.status(400).send(`Webhook signature verification failed.`);
    }

    const isFirstTimeSeeingThisEvent = await bookingRepo.markStripeEventProcessed(event.id);
    if (!isFirstTimeSeeingThisEvent) {
      return res.status(200).json({ received: true, note: "duplicate event, already processed" });
    }

    if (event.type === "payment_intent.succeeded") {
      await handlePaymentSucceeded(event.data.object);
    } else if (event.type === "payment_intent.payment_failed") {
      console.warn(`PaymentIntent ${event.data.object.id} failed — booking stays unpaid.`);
    } else if (event.type === "account.updated") {
      await handleAccountUpdated(event.data.object);
    }

    res.status(200).json({ received: true });
  })
);

async function handlePaymentSucceeded(paymentIntent) {
  const booking = await bookingRepo.getBookingByPaymentIntentId(paymentIntent.id);
  if (!booking) {
    console.warn(`No booking found for PaymentIntent ${paymentIntent.id} — ignoring.`);
    return;
  }

  const expectedCents = Math.round(Number(booking.price) * 100);
  if (paymentIntent.amount !== expectedCents) {
    console.error(
      `Amount mismatch for booking ${booking.id}: expected ${expectedCents}, got ${paymentIntent.amount}. NOT marking paid.`
    );
    return;
  }
  if (paymentIntent.currency !== "usd") {
    console.error(`Unexpected currency for booking ${booking.id}: ${paymentIntent.currency}. NOT marking paid.`);
    return;
  }

  const check = isTransitionAllowed(booking.status, STATUSES.PAID, "system");
  if (!check.allowed) {
    console.warn(`Cannot mark booking ${booking.id} paid: ${check.reason}`);
    return;
  }

  await bookingRepo.markPaid(booking.id);
  console.log(`Booking ${booking.id} marked paid via PaymentIntent ${paymentIntent.id}.`);

  const consultant = await userRepo.getUserBasicInfo(booking.consultant_id);
  const platformFeePercent = Number(booking.platform_fee_percent ?? 20);
  const consultantAmount = Number(booking.price) * (1 - platformFeePercent / 100);

const consultant = await userRepo.getUserBasicInfo(booking.consultant_id);
await sendPaymentReceivedEmail({
  to: consultant?.email,
  consultantName: consultant?.name,
  amount: consultantAmount,   // ← now correctly $80, not $100
  bookingId: booking.id,
});
}

async function handleAccountUpdated(account) {
  await userRepo.setChargesEnabledByAccountId(account.id, account.charges_enabled);
}

module.exports = router;
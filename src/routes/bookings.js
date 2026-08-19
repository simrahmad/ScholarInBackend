const express = require("express");
const { requireAuth } = require("../middleware/auth");
const { asyncHandler } = require("../middleware/errorHandler");
const { STATUSES, ACTORS, isTransitionAllowed } = require("../domain/bookingStateMachine");
const bookingRepo = require("../repositories/bookingRepository");

const router = express.Router();

const PLATFORM_FEE_PERCENT = 20;

/**
 * Loads a booking and confirms the calling user is actually involved
 * in it (student or consultant on this exact booking). Every route
 * below calls this first — nobody can view or modify a booking they
 * have no part in, no matter what ID they guess or supply.
 */
async function loadBookingForParticipant(req, res) {
  const booking = await bookingRepo.getBookingById(req.params.id);
  if (!booking) {
    res.status(404).json({ error: "Booking not found." });
    return null;
  }
  if (booking.student_id !== req.userId && booking.consultant_id !== req.userId) {
    res.status(403).json({ error: "You are not part of this booking." });
    return null;
  }
  return booking;
}

function actorRoleFor(booking, userId) {
  if (booking.student_id === userId) return ACTORS.STUDENT;
  if (booking.consultant_id === userId) return ACTORS.CONSULTANT;
  return null;
}

// POST /bookings — student requests a booking on a gig.
router.post(
  "/bookings",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { gigId, message } = req.body;
    if (!gigId) {
      return res.status(400).json({ error: "gigId is required." });
    }

    const gig = await bookingRepo.getGigById(gigId);
    if (!gig) {
      return res.status(404).json({ error: "Gig not found." });
    }
    if (gig.status !== "active") {
      return res.status(400).json({ error: "This gig is not currently active." });
    }
    if (gig.consultant_id === req.userId) {
      return res.status(400).json({ error: "You cannot book your own gig." });
    }

    // The price is read from the database, right now, server-side —
    // never trusted from the request body. This is the exact rule
    // from your sir's document: "the backend must obtain the actual
    // price from the database," not from whatever the client sends.
    const booking = await bookingRepo.createBooking({
      gigId,
      studentId: req.userId,
      consultantId: gig.consultant_id,
      message,
      price: gig.price,
      platformFeePercent: PLATFORM_FEE_PERCENT,
    });

    res.status(201).json(booking);
  })
);

// GET /bookings — list every booking the caller is part of, either side.
router.get(
  "/bookings",
  requireAuth,
  asyncHandler(async (req, res) => {
    const bookings = await bookingRepo.listBookingsForUser(req.userId);
    res.json(bookings);
  })
);

// GET /bookings/:id — fetch one booking, only if the caller is part of it.
router.get(
  "/bookings/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const booking = await loadBookingForParticipant(req, res);
    if (!booking) return; // response already sent by the helper
    res.json(booking);
  })
);

/**
 * Shared handler for every simple status-change route below. Each one
 * only differs in which target status it moves toward — the actual
 * legality check is always the same call to isTransitionAllowed().
 */
function makeTransitionRoute(targetStatus, { requireBody } = {}) {
  return asyncHandler(async (req, res) => {
    const booking = await loadBookingForParticipant(req, res);
    if (!booking) return;

    const actorRole = actorRoleFor(booking, req.userId);
    const check = isTransitionAllowed(booking.status, targetStatus, actorRole);
    if (!check.allowed) {
      return res.status(409).json({ error: check.reason });
    }

    const extra = {};
    if (targetStatus === STATUSES.DISPUTED) {
      if (requireBody && !req.body.reason) {
        return res.status(400).json({ error: "A reason is required to file a dispute." });
      }
      extra.disputeFiledBy = actorRole;
      extra.disputeReason = req.body.reason || null;
      extra.disputeFiledAt = new Date().toISOString();
    }

    const updated = await bookingRepo.updateBookingStatus(booking.id, targetStatus, extra);
    res.json(updated);
  });
}

router.post("/bookings/:id/accept", requireAuth, makeTransitionRoute(STATUSES.ACCEPTED));
router.post("/bookings/:id/decline", requireAuth, makeTransitionRoute(STATUSES.DECLINED));
router.post("/bookings/:id/cancel", requireAuth, makeTransitionRoute(STATUSES.CANCELLED));
router.post(
  "/bookings/:id/request-completion",
  requireAuth,
  makeTransitionRoute(STATUSES.COMPLETION_REQUESTED)
);
router.post("/bookings/:id/confirm-completion", requireAuth, makeTransitionRoute(STATUSES.COMPLETED));
router.post(
  "/bookings/:id/dispute",
  requireAuth,
  makeTransitionRoute(STATUSES.DISPUTED, { requireBody: true })
);

// ── DEV-ONLY TEST STUB ──────────────────────────────────────────────────
// There is no real payment yet — that's Phase 3. This route exists purely
// so Phase 2 can be tested end-to-end (accepted -> paid -> ...) without
// Stripe. It is hard-disabled outside development so it can NEVER be
// reachable once this is deployed for real — a booking must not be
// markable "paid" by anyone calling an endpoint; only a verified Stripe
// webhook may do that, starting in Phase 3.
if (process.env.NODE_ENV !== "production") {
  router.post(
    "/bookings/:id/_dev_mark_paid",
    requireAuth,
    asyncHandler(async (req, res) => {
      const booking = await loadBookingForParticipant(req, res);
      if (!booking) return;
      const check = isTransitionAllowed(booking.status, STATUSES.PAID, "system");
      if (!check.allowed) {
        return res.status(409).json({ error: check.reason });
      }
      const updated = await bookingRepo.updateBookingStatus(booking.id, STATUSES.PAID);
      res.json({ ...updated, _warning: "DEV-ONLY STUB — not present in production." });
    })
  );
}

module.exports = router;

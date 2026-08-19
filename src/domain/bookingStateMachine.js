/**
 * The booking state machine, matching the workflow your sir specified:
 *
 *   pending -> accepted -> paid -> completion_requested -> completed
 *                                        (consultant marks complete,
 *                                         student confirms)
 *
 *   pending -> declined
 *
 *   From "paid" or "completion_requested", either party can file a
 *   complaint -> disputed. From "disputed", an admin resolves it to
 *   either "refunded" or "completed" (payout released).
 *
 * This module is deliberately pure — no database, no HTTP, no Stripe.
 * Every route handler must call isTransitionAllowed() before writing
 * a new status, so "can this actually happen" is defined in exactly
 * one place and is trivially unit-testable without spinning up a DB.
 */

const STATUSES = Object.freeze({
  PENDING: "pending",
  ACCEPTED: "accepted",
  DECLINED: "declined",
  PAID: "paid",
  COMPLETION_REQUESTED: "completion_requested",
  COMPLETED: "completed",
  DISPUTED: "disputed",
  REFUNDED: "refunded",
  CANCELLED: "cancelled",
});

const ACTORS = Object.freeze({
  STUDENT: "student",
  CONSULTANT: "consultant",
  ADMIN: "admin",
});

// Each entry: from-status -> allowed transitions, each naming which
// actor role is allowed to trigger it. This table IS the state machine —
// there is no other place in the codebase that decides what's legal.
const TRANSITIONS = {
  [STATUSES.PENDING]: {
    [STATUSES.ACCEPTED]: [ACTORS.CONSULTANT],
    [STATUSES.DECLINED]: [ACTORS.CONSULTANT],
    [STATUSES.CANCELLED]: [ACTORS.STUDENT],
  },
  [STATUSES.ACCEPTED]: {
    // Payment is driven by a Stripe webhook (Phase 3), not a person
    // clicking a button — but the state machine still validates it
    // the same way, with the "actor" being the system itself.
    [STATUSES.PAID]: ["system"],
    [STATUSES.CANCELLED]: [ACTORS.STUDENT],
  },
  [STATUSES.PAID]: {
    [STATUSES.COMPLETION_REQUESTED]: [ACTORS.CONSULTANT],
    [STATUSES.DISPUTED]: [ACTORS.STUDENT, ACTORS.CONSULTANT],
  },
  [STATUSES.COMPLETION_REQUESTED]: {
    [STATUSES.COMPLETED]: [ACTORS.STUDENT],
    [STATUSES.DISPUTED]: [ACTORS.STUDENT, ACTORS.CONSULTANT],
  },
  [STATUSES.DISPUTED]: {
    [STATUSES.REFUNDED]: [ACTORS.ADMIN],
    [STATUSES.COMPLETED]: [ACTORS.ADMIN], // admin sides with consultant, payout proceeds
  },
  // Terminal states — no outgoing transitions.
  [STATUSES.DECLINED]: {},
  [STATUSES.COMPLETED]: {},
  [STATUSES.REFUNDED]: {},
  [STATUSES.CANCELLED]: {},
};

/**
 * @param {string} fromStatus - the booking's current status in the DB
 * @param {string} toStatus - the status being requested
 * @param {string} actorRole - one of ACTORS (or "system" for webhook-driven transitions)
 * @returns {{ allowed: boolean, reason?: string }}
 */
function isTransitionAllowed(fromStatus, toStatus, actorRole) {
  const validFromState = TRANSITIONS[fromStatus];
  if (!validFromState) {
    return { allowed: false, reason: `Unknown current status: "${fromStatus}"` };
  }

  const allowedActors = validFromState[toStatus];
  if (!allowedActors) {
    return {
      allowed: false,
      reason: `Cannot go from "${fromStatus}" to "${toStatus}".`,
    };
  }

  if (!allowedActors.includes(actorRole)) {
    return {
      allowed: false,
      reason: `"${actorRole}" is not allowed to move a booking from "${fromStatus}" to "${toStatus}".`,
    };
  }

  return { allowed: true };
}

module.exports = { STATUSES, ACTORS, TRANSITIONS, isTransitionAllowed };

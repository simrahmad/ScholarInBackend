const { getPool } = require("../config/db");

/**
 * All booking data access lives here. Every query uses parameterized
 * placeholders ($1, $2, ...) — never string-interpolated SQL — so user
 * input can never alter the query's structure (SQL injection).
 */

async function getGigById(gigId) {
  const { rows } = await getPool().query(
    `SELECT id, consultant_id, title, price, status
     FROM consultant_gigs
     WHERE id = $1`,
    [gigId]
  );
  return rows[0] || null;
}

async function createBooking({ gigId, studentId, consultantId, message, price, platformFeePercent }) {
  const { rows } = await getPool().query(
    `INSERT INTO gig_bookings
       (gig_id, student_id, consultant_id, message, status, price, platform_fee_percent)
     VALUES ($1, $2, $3, $4, 'pending', $5, $6)
     RETURNING *`,
    [gigId, studentId, consultantId, message || "", price, platformFeePercent]
  );
  return rows[0];
}

async function getBookingById(bookingId) {
  const { rows } = await getPool().query(
    `SELECT * FROM gig_bookings WHERE id = $1`,
    [bookingId]
  );
  return rows[0] || null;
}

async function listBookingsForUser(userId) {
  const { rows } = await getPool().query(
    `SELECT * FROM gig_bookings
     WHERE student_id = $1 OR consultant_id = $1
     ORDER BY created_at DESC`,
    [userId]
  );
  return rows;
}

/**
 * Updates a booking's status. Every column that could matter for a
 * dispute/audit trail can optionally be set in the same statement,
 * so a status change and its metadata land in one atomic write.
 */
async function updateBookingStatus(bookingId, newStatus, extra = {}) {
  const { rows } = await getPool().query(
    `UPDATE gig_bookings
     SET status = $2,
         updated_at = now(),
         dispute_filed_by = COALESCE($3, dispute_filed_by),
         dispute_reason = COALESCE($4, dispute_reason),
         dispute_filed_at = COALESCE($5, dispute_filed_at),
         admin_resolution = COALESCE($6, admin_resolution),
         admin_resolved_at = COALESCE($7, admin_resolved_at)
     WHERE id = $1
     RETURNING *`,
    [
      bookingId,
      newStatus,
      extra.disputeFiledBy || null,
      extra.disputeReason || null,
      extra.disputeFiledAt || null,
      extra.adminResolution || null,
      extra.adminResolvedAt || null,
    ]
  );
  return rows[0];
}

async function attachPaymentIntent(bookingId, paymentIntentId) {
  const { rows } = await getPool().query(
    `UPDATE gig_bookings
     SET stripe_payment_intent_id = $2
     WHERE id = $1
     RETURNING *`,
    [bookingId, paymentIntentId]
  );
  return rows[0];
}

async function getBookingByPaymentIntentId(paymentIntentId) {
  const { rows } = await getPool().query(
    `SELECT * FROM gig_bookings WHERE stripe_payment_intent_id = $1`,
    [paymentIntentId]
  );
  return rows[0] || null;
}

async function markPaid(bookingId) {
  const { rows } = await getPool().query(
    `UPDATE gig_bookings
     SET status = 'paid', paid_at = now(), updated_at = now()
     WHERE id = $1
     RETURNING *`,
    [bookingId]
  );
  return rows[0];
}

async function markStripeEventProcessed(eventId) {
  const { rows } = await getPool().query(
    `INSERT INTO processed_stripe_events (event_id)
     VALUES ($1)
     ON CONFLICT (event_id) DO NOTHING
     RETURNING event_id`,
    [eventId]
  );
  return rows.length > 0;
}

module.exports = {
  getGigById,
  createBooking,
  getBookingById,
  listBookingsForUser,
  updateBookingStatus,
  attachPaymentIntent,
  getBookingByPaymentIntentId,
  markPaid,
  markStripeEventProcessed,
};

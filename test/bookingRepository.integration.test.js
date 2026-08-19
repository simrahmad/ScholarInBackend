// Integration test — runs against a REAL local Postgres (see README's
// "Testing Phase 2 locally" section for how this was set up). This is
// not a mock: every query below actually executes against a live
// database, using the exact same schema shape as production.
require("dotenv").config();
const test = require("node:test");
const assert = require("node:assert/strict");
const { getPool } = require("../src/config/db");
const bookingRepo = require("../src/repositories/bookingRepository");

let gigId;

test("setup: fetch the seeded test gig", async () => {
  const { rows } = await getPool().query(
    `SELECT id FROM consultant_gigs WHERE title = 'CV Review' LIMIT 1`
  );
  assert.ok(rows[0], "expected the seeded test gig to exist");
  gigId = rows[0].id;
});

test("getGigById returns the gig with its real price", async () => {
  const gig = await bookingRepo.getGigById(gigId);
  assert.equal(gig.title, "CV Review");
  assert.equal(Number(gig.price), 50);
});

test("createBooking snapshots the price at booking time, not a live reference", async () => {
  const booking = await bookingRepo.createBooking({
    gigId,
    studentId: "student-uid-1",
    consultantId: "consultant-uid-1",
    message: "Can you review by Friday?",
    price: 50,
    platformFeePercent: 20,
  });

  assert.equal(booking.status, "pending");
  assert.equal(Number(booking.price), 50);
  assert.equal(Number(booking.platform_fee_percent), 20);
  assert.equal(booking.student_id, "student-uid-1");
  assert.equal(booking.consultant_id, "consultant-uid-1");

  // Now change the gig's live price — the booking's snapshotted price
  // must NOT change, proving we never re-read price from consultant_gigs
  // after booking creation.
  await getPool().query(`UPDATE consultant_gigs SET price = 999 WHERE id = $1`, [gigId]);
  const refetched = await bookingRepo.getBookingById(booking.id);
  assert.equal(Number(refetched.price), 50, "booking price must stay frozen at snapshot time");

  // restore for other tests
  await getPool().query(`UPDATE consultant_gigs SET price = 50 WHERE id = $1`, [gigId]);
});

test("listBookingsForUser finds bookings whether the user is student or consultant", async () => {
  const asStudent = await bookingRepo.listBookingsForUser("student-uid-1");
  const asConsultant = await bookingRepo.listBookingsForUser("consultant-uid-1");
  assert.ok(asStudent.length >= 1);
  assert.ok(asConsultant.length >= 1);

  const strangerResults = await bookingRepo.listBookingsForUser("some-random-uid-nobody-owns");
  assert.equal(strangerResults.length, 0, "a user with no bookings should see an empty list, not an error");
});

test("updateBookingStatus writes dispute metadata atomically", async () => {
  const booking = await bookingRepo.createBooking({
    gigId,
    studentId: "student-uid-2",
    consultantId: "consultant-uid-1",
    message: "",
    price: 50,
    platformFeePercent: 20,
  });

  const disputed = await bookingRepo.updateBookingStatus(booking.id, "disputed", {
    disputeFiledBy: "student",
    disputeReason: "Consultant never responded to messages.",
    disputeFiledAt: new Date().toISOString(),
  });

  assert.equal(disputed.status, "disputed");
  assert.equal(disputed.dispute_filed_by, "student");
  assert.equal(disputed.dispute_reason, "Consultant never responded to messages.");
  assert.ok(disputed.dispute_filed_at);
});

test("cleanup: close the pool", async () => {
  await getPool().end();
});

require("dotenv").config();
const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const { createTestApp } = require("./_testAuthDouble");
const { getPool } = require("../src/config/db");

const app = createTestApp();

const STUDENT = "http-student-1";
const CONSULTANT = "consultant-uid-1";
const OTHER_STUDENT = "http-student-intruder";

let gigId;
let bookingId;

test("setup: find the seeded gig", async () => {
  const { rows } = await getPool().query(
    `SELECT id FROM consultant_gigs WHERE title = 'CV Review' LIMIT 1`
  );
  gigId = rows[0].id;
});

test("unauthenticated request is rejected", async () => {
  const res = await request(app).get("/bookings");
  assert.equal(res.status, 401);
});

test("consultant cannot book their own gig", async () => {
  const res = await request(app)
    .post("/bookings")
    .set("x-test-uid", CONSULTANT)
    .send({ gigId });
  assert.equal(res.status, 400);
  assert.match(res.body.error, /cannot book your own gig/);
});

test("student creates a booking — price comes from the server, not the request", async () => {
  const res = await request(app)
    .post("/bookings")
    .set("x-test-uid", STUDENT)
    .send({ gigId, message: "Please review by Friday", price: 1 }); // client tries to send price=1

  assert.equal(res.status, 201);
  assert.equal(res.body.status, "pending");
  assert.equal(Number(res.body.price), 50, "must use the real gig price, ignoring the client-sent price");
  bookingId = res.body.id;
});

test("a stranger (not student or consultant on this booking) cannot view it", async () => {
  const res = await request(app)
    .get(`/bookings/${bookingId}`)
    .set("x-test-uid", OTHER_STUDENT);
  assert.equal(res.status, 403);
});

test("the student who created it CAN view it", async () => {
  const res = await request(app)
    .get(`/bookings/${bookingId}`)
    .set("x-test-uid", STUDENT);
  assert.equal(res.status, 200);
  assert.equal(res.body.id, bookingId);
});

test("student cannot accept their own booking (only the consultant can)", async () => {
  const res = await request(app)
    .post(`/bookings/${bookingId}/accept`)
    .set("x-test-uid", STUDENT);
  assert.equal(res.status, 409);
});

test("a stranger cannot accept a booking they're not part of", async () => {
  const res = await request(app)
    .post(`/bookings/${bookingId}/accept`)
    .set("x-test-uid", OTHER_STUDENT);
  assert.equal(res.status, 403);
});

test("consultant accepts the booking", async () => {
  const res = await request(app)
    .post(`/bookings/${bookingId}/accept`)
    .set("x-test-uid", CONSULTANT);
  assert.equal(res.status, 200);
  assert.equal(res.body.status, "accepted");
});

test("consultant cannot request completion before payment", async () => {
  const res = await request(app)
    .post(`/bookings/${bookingId}/request-completion`)
    .set("x-test-uid", CONSULTANT);
  assert.equal(res.status, 409);
  assert.match(res.body.error, /Cannot go from "accepted" to "completion_requested"/);
});

test("dev-only stub marks the booking as paid (Phase 3 replaces this with a real webhook)", async () => {
  const res = await request(app)
    .post(`/bookings/${bookingId}/_dev_mark_paid`)
    .set("x-test-uid", STUDENT);
  assert.equal(res.status, 200);
  assert.equal(res.body.status, "paid");
});

test("consultant requests completion now that it's paid", async () => {
  const res = await request(app)
    .post(`/bookings/${bookingId}/request-completion`)
    .set("x-test-uid", CONSULTANT);
  assert.equal(res.status, 200);
  assert.equal(res.body.status, "completion_requested");
});

test("consultant cannot self-confirm completion", async () => {
  const res = await request(app)
    .post(`/bookings/${bookingId}/confirm-completion`)
    .set("x-test-uid", CONSULTANT);
  assert.equal(res.status, 409);
});

test("student confirms completion", async () => {
  const res = await request(app)
    .post(`/bookings/${bookingId}/confirm-completion`)
    .set("x-test-uid", STUDENT);
  assert.equal(res.status, 200);
  assert.equal(res.body.status, "completed");
});

test("completed is terminal — nothing further can happen to this booking", async () => {
  const res = await request(app)
    .post(`/bookings/${bookingId}/dispute`)
    .set("x-test-uid", STUDENT)
    .send({ reason: "too late now" });
  assert.equal(res.status, 409);
});

test("separate booking: consultant can file a dispute if student never confirms", async () => {
  const created = await request(app)
    .post("/bookings")
    .set("x-test-uid", STUDENT)
    .send({ gigId, message: "second booking" });
  const secondBookingId = created.body.id;

  await request(app).post(`/bookings/${secondBookingId}/accept`).set("x-test-uid", CONSULTANT);
  await request(app).post(`/bookings/${secondBookingId}/_dev_mark_paid`).set("x-test-uid", STUDENT);
  await request(app)
    .post(`/bookings/${secondBookingId}/request-completion`)
    .set("x-test-uid", CONSULTANT);

  const disputeRes = await request(app)
    .post(`/bookings/${secondBookingId}/dispute`)
    .set("x-test-uid", CONSULTANT)
    .send({ reason: "Student went silent after I finished the work." });

  assert.equal(disputeRes.status, 200);
  assert.equal(disputeRes.body.status, "disputed");
  assert.equal(disputeRes.body.dispute_filed_by, "consultant");
});

test("dispute without a reason is rejected", async () => {
  const created = await request(app)
    .post("/bookings")
    .set("x-test-uid", STUDENT)
    .send({ gigId, message: "third booking" });
  await request(app).post(`/bookings/${created.body.id}/accept`).set("x-test-uid", CONSULTANT);
  await request(app).post(`/bookings/${created.body.id}/_dev_mark_paid`).set("x-test-uid", STUDENT);

  const res = await request(app)
    .post(`/bookings/${created.body.id}/dispute`)
    .set("x-test-uid", STUDENT)
    .send({}); // no reason
  assert.equal(res.status, 400);
});

test("cleanup: close the pool", async () => {
  await getPool().end();
});

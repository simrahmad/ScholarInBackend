const test = require("node:test");
const assert = require("node:assert/strict");
const { STATUSES, ACTORS, isTransitionAllowed } = require("../src/domain/bookingStateMachine");

test("consultant can accept a pending booking", () => {
  const result = isTransitionAllowed(STATUSES.PENDING, STATUSES.ACCEPTED, ACTORS.CONSULTANT);
  assert.equal(result.allowed, true);
});

test("student CANNOT accept a booking (only consultant can)", () => {
  const result = isTransitionAllowed(STATUSES.PENDING, STATUSES.ACCEPTED, ACTORS.STUDENT);
  assert.equal(result.allowed, false);
});

test("consultant can decline a pending booking", () => {
  const result = isTransitionAllowed(STATUSES.PENDING, STATUSES.DECLINED, ACTORS.CONSULTANT);
  assert.equal(result.allowed, true);
});

test("cannot jump straight from pending to paid (must go through accepted)", () => {
  const result = isTransitionAllowed(STATUSES.PENDING, STATUSES.PAID, "system");
  assert.equal(result.allowed, false);
});

test("cannot jump straight from pending to completed", () => {
  const result = isTransitionAllowed(STATUSES.PENDING, STATUSES.COMPLETED, ACTORS.STUDENT);
  assert.equal(result.allowed, false);
});

test("system can mark an accepted booking as paid (webhook-driven)", () => {
  const result = isTransitionAllowed(STATUSES.ACCEPTED, STATUSES.PAID, "system");
  assert.equal(result.allowed, true);
});

test("consultant CANNOT mark a booking paid directly (must come from the payment webhook)", () => {
  const result = isTransitionAllowed(STATUSES.ACCEPTED, STATUSES.PAID, ACTORS.CONSULTANT);
  assert.equal(result.allowed, false);
});

test("consultant can request completion once paid", () => {
  const result = isTransitionAllowed(STATUSES.PAID, STATUSES.COMPLETION_REQUESTED, ACTORS.CONSULTANT);
  assert.equal(result.allowed, true);
});

test("student CANNOT request completion (only consultant can)", () => {
  const result = isTransitionAllowed(STATUSES.PAID, STATUSES.COMPLETION_REQUESTED, ACTORS.STUDENT);
  assert.equal(result.allowed, false);
});

test("student can confirm completion after consultant requested it", () => {
  const result = isTransitionAllowed(STATUSES.COMPLETION_REQUESTED, STATUSES.COMPLETED, ACTORS.STUDENT);
  assert.equal(result.allowed, true);
});

test("consultant CANNOT self-confirm completion (only student can)", () => {
  const result = isTransitionAllowed(STATUSES.COMPLETION_REQUESTED, STATUSES.COMPLETED, ACTORS.CONSULTANT);
  assert.equal(result.allowed, false);
});

test("student can file a dispute after paying", () => {
  const result = isTransitionAllowed(STATUSES.PAID, STATUSES.DISPUTED, ACTORS.STUDENT);
  assert.equal(result.allowed, true);
});

test("consultant can also file a dispute after payment (per your sir's spec)", () => {
  const result = isTransitionAllowed(STATUSES.PAID, STATUSES.DISPUTED, ACTORS.CONSULTANT);
  assert.equal(result.allowed, true);
});

test("consultant can file a dispute if student goes silent after completion_requested", () => {
  const result = isTransitionAllowed(
    STATUSES.COMPLETION_REQUESTED,
    STATUSES.DISPUTED,
    ACTORS.CONSULTANT
  );
  assert.equal(result.allowed, true);
});

test("only admin can resolve a dispute as refunded", () => {
  const asAdmin = isTransitionAllowed(STATUSES.DISPUTED, STATUSES.REFUNDED, ACTORS.ADMIN);
  const asStudent = isTransitionAllowed(STATUSES.DISPUTED, STATUSES.REFUNDED, ACTORS.STUDENT);
  const asConsultant = isTransitionAllowed(STATUSES.DISPUTED, STATUSES.REFUNDED, ACTORS.CONSULTANT);

  assert.equal(asAdmin.allowed, true);
  assert.equal(asStudent.allowed, false);
  assert.equal(asConsultant.allowed, false);
});

test("only admin can resolve a dispute in the consultant's favor", () => {
  const result = isTransitionAllowed(STATUSES.DISPUTED, STATUSES.COMPLETED, ACTORS.ADMIN);
  assert.equal(result.allowed, true);
});

test("completed is a terminal state — nothing can transition out of it", () => {
  const result = isTransitionAllowed(STATUSES.COMPLETED, STATUSES.DISPUTED, ACTORS.STUDENT);
  assert.equal(result.allowed, false);
});

test("declined is a terminal state — nothing can transition out of it", () => {
  const result = isTransitionAllowed(STATUSES.DECLINED, STATUSES.ACCEPTED, ACTORS.CONSULTANT);
  assert.equal(result.allowed, false);
});

test("refunded is a terminal state", () => {
  const result = isTransitionAllowed(STATUSES.REFUNDED, STATUSES.COMPLETED, ACTORS.ADMIN);
  assert.equal(result.allowed, false);
});

test("unknown starting status is rejected safely, not crashed on", () => {
  const result = isTransitionAllowed("some_made_up_status", STATUSES.ACCEPTED, ACTORS.CONSULTANT);
  assert.equal(result.allowed, false);
  assert.match(result.reason, /Unknown current status/);
});

test("student can cancel their own pending booking before consultant responds", () => {
  const result = isTransitionAllowed(STATUSES.PENDING, STATUSES.CANCELLED, ACTORS.STUDENT);
  assert.equal(result.allowed, true);
});

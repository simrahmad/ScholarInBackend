# Phase 2 — Booking State Machine

Adds the actual booking lifecycle from your sir's workflow diagram:
`pending → accepted → paid → completion_requested → completed`, plus
`declined`, `cancelled`, and `disputed` branches. Still no Stripe (Phase 3)
and no admin panel (Phase 4) — this phase is entirely about the backend
correctly enforcing *who* can move a booking *where*, and *when*.

## What was actually tested (not just written)

Everything below was run against a **real local Postgres**, not mocked:

- `test/bookingStateMachine.test.js` — 21 tests on the pure state-machine
  logic (no database at all): every legal transition, every illegal one,
  wrong-actor attempts, terminal states, unknown statuses.
- `test/bookingRepository.integration.test.js` — 6 tests against a real
  database: gig lookup, booking creation, and critically, that a
  booking's price is *frozen* at creation time even if the gig's price
  changes afterward (this is the same rule your sir's document states for
  the frontend — applied here to prevent a *later* price change from
  affecting an *already-existing* booking).
- `test/bookingHttp.integration.test.js` — 18 tests over real HTTP
  requests: every ownership check (a stranger can't view/act on a
  booking they're not part of), every wrong-actor rejection (student
  can't accept their own booking; consultant can't self-confirm
  completion), the dispute path from both sides, and confirmation that
  the client-sent price is silently ignored in favor of the real one.

**45/45 passing.**

## Run the tests yourself

You need a local Postgres to run the integration tests (the pure
state-machine tests don't need one). Quickest option — Docker:

```bash
docker run --name scholario-test-db -e POSTGRES_PASSWORD=testpass123 \
  -e POSTGRES_USER=scholario_app -e POSTGRES_DB=scholario_test \
  -p 5432:5432 -d postgres:16
```

Then create the test schema (this mirrors your real `consultant_gigs`/
`gig_bookings` tables):

```bash
PGPASSWORD=testpass123 psql -h localhost -U scholario_app -d scholario_test << 'EOF'
CREATE TABLE consultant_gigs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consultant_id text NOT NULL,
  title text NOT NULL,
  description text,
  category text,
  price numeric NOT NULL,
  delivery_days int4,
  status text DEFAULT 'active',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE gig_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gig_id uuid REFERENCES consultant_gigs(id),
  student_id text NOT NULL,
  consultant_id text NOT NULL,
  message text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz DEFAULT now(),
  reviewed bool DEFAULT false
);

INSERT INTO consultant_gigs (consultant_id, title, description, category, price, delivery_days, status)
VALUES ('consultant-uid-1', 'CV Review', 'I will review your CV', 'CV Review', 50.00, 3, 'active');
EOF
```

Apply the Phase 2 migration:
```bash
PGPASSWORD=testpass123 psql -h localhost -U scholario_app -d scholario_test \
  -f migrations/002_phase2_booking_columns.sql
```

Create `.env` (copy `.env.example` and add these two lines):
```
DATABASE_URL=postgresql://scholario_app:testpass123@localhost:5432/scholario_test
DATABASE_SSL=false
```

Run everything:
```bash
npm install
npm test
```

## Applying this to your REAL Supabase database

**Do not run the `CREATE TABLE` block above against Supabase** — those
tables already exist there (you can see them in your Supabase dashboard).
Only run the migration file, since it's additive (`ADD COLUMN IF NOT
EXISTS`) and safe against your real, already-populated tables:

1. Supabase dashboard → SQL Editor → paste the contents of
   `migrations/002_phase2_booking_columns.sql` → Run.
2. Get your real connection string: Supabase dashboard → Project
   Settings → Database → Connection string → choose **"Transaction"**
   pooling mode (not "Session" — Transaction mode is built for exactly
   this kind of server workload).
3. On the VM, add to `.env`:
   ```
   DATABASE_URL=<your real Supabase connection string>
   ```
   Leave `DATABASE_SSL` unset (Supabase requires SSL; the default
   `rejectUnauthorized: false` in `src/config/db.js` is the standard
   setting for Supabase's pooler, which uses a certificate chain that
   isn't in Node's default trusted root list).
4. `docker compose up -d` to restart the container with the new database
   connection.

## API reference

All routes below require `Authorization: Bearer <firebase-id-token>`.

| Method | Route | Who can call it | What it does |
|---|---|---|---|
| POST | `/bookings` | Any authenticated student | Creates a booking. Body: `{ "gigId": "...", "message": "..." }`. Price is read from the database, never trusted from the request. |
| GET | `/bookings` | Anyone | Lists every booking the caller is part of (as student or consultant). |
| GET | `/bookings/:id` | Student or consultant on that booking | Fetch one booking. 403 if you're not part of it. |
| POST | `/bookings/:id/accept` | Consultant on that booking | `pending → accepted` |
| POST | `/bookings/:id/decline` | Consultant on that booking | `pending → declined` |
| POST | `/bookings/:id/cancel` | Student on that booking | `pending → cancelled` |
| POST | `/bookings/:id/request-completion` | Consultant on that booking | `paid → completion_requested` |
| POST | `/bookings/:id/confirm-completion` | Student on that booking | `completion_requested → completed` |
| POST | `/bookings/:id/dispute` | Either party | `paid` or `completion_requested` → `disputed`. Body: `{ "reason": "..." }` (required). |

**`accepted → paid` has no route.** This transition only happens via a
Stripe webhook, which is Phase 3 — nobody, including you, should be able
to move a booking to `paid` by calling an endpoint. In development only
(`NODE_ENV !== "production"`), a stub exists at
`POST /bookings/:id/_dev_mark_paid` purely so this phase could be tested
end-to-end without Stripe. **This route does not exist at all when
`NODE_ENV=production`** — confirmed by inspecting Express's route table
at boot in each mode, not just by a runtime check inside the handler.

## What's NOT in Phase 2 (comes next)
- No real payment — the `_dev_mark_paid` stub is temporary scaffolding, deleted in spirit once Phase 3 adds the real webhook-driven transition.
- No admin panel or dispute resolution UI (Phase 4) — disputes can be *filed* via the API now, but nothing resolves them yet.
- Android app still talks directly to Supabase for bookings (Phase 5 rewires it to call this backend instead).

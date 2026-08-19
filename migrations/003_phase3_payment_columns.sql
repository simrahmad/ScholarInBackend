ALTER TABLE gig_bookings
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz;

CREATE TABLE IF NOT EXISTS processed_stripe_events (
  event_id text PRIMARY KEY,
  processed_at timestamptz DEFAULT now()
);
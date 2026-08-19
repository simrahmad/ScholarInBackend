-- Phase 2 migration — run this once against your real Supabase database
-- (SQL editor, or psql against the connection string) before deploying
-- Phase 2. Safe to run on the existing production gig_bookings table —
-- every column is ADD COLUMN IF NOT EXISTS, nothing is dropped or altered,
-- and the Android app's existing direct Supabase calls keep working
-- exactly as before (this backend doesn't replace those until Phase 5).

ALTER TABLE gig_bookings
  ADD COLUMN IF NOT EXISTS price numeric,
  ADD COLUMN IF NOT EXISTS platform_fee_percent numeric DEFAULT 20,
  ADD COLUMN IF NOT EXISTS dispute_filed_by text,
  ADD COLUMN IF NOT EXISTS dispute_reason text,
  ADD COLUMN IF NOT EXISTS dispute_filed_at timestamptz,
  ADD COLUMN IF NOT EXISTS admin_resolution text,
  ADD COLUMN IF NOT EXISTS admin_resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- price is filled in at booking-creation time by the backend (a snapshot
-- of the gig's price at that moment), NOT read fresh from consultant_gigs
-- on every future status check — this is deliberate: if the consultant
-- later changes their gig's price, existing bookings must NOT change
-- what the student is charged. See "The frontend should never be trusted
-- for the actual price" in your sir's document — this is the backend
-- equivalent: don't trust a *future* price for a *past* booking either.

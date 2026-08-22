ALTER TABLE users
  ADD COLUMN IF NOT EXISTS stripe_connect_account_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_connect_charges_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS stripe_connect_onboarded_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_stripe_connect_account_id
  ON users (stripe_connect_account_id)
  WHERE stripe_connect_account_id IS NOT NULL;
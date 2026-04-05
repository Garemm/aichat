-- ── password_resets migration ─────────────────────────────────────────────────
-- Run this once against your PostgreSQL database to support the
-- forgot-password / reset-password flow.

CREATE TABLE IF NOT EXISTS password_resets (
  id         SERIAL PRIMARY KEY,
  admin_id   INTEGER      NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  token_hash TEXT         NOT NULL,
  expires_at TIMESTAMPTZ  NOT NULL,
  used       BOOLEAN      NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_password_resets_token_hash ON password_resets(token_hash);

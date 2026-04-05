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

-- ── product_query_logs ────────────────────────────────────────────────────────
-- Tracks how many times each product has been queried per business per day.
-- Used by the analytics dashboard to show top 10 consulted products.

CREATE TABLE IF NOT EXISTS product_query_logs (
  id          SERIAL PRIMARY KEY,
  business_id INTEGER      NOT NULL,
  product_id  INTEGER      NOT NULL,
  query_date  DATE         NOT NULL DEFAULT CURRENT_DATE,
  query_count INTEGER      NOT NULL DEFAULT 1,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (business_id, product_id, query_date)
);

CREATE INDEX IF NOT EXISTS idx_pql_business_date ON product_query_logs (business_id, query_date);

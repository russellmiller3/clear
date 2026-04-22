-- =============================================================================
-- CC-5a: app_domains — custom domain metadata per app
-- =============================================================================
-- Stores the custom domains a tenant has pointed at their Clear Cloud app.
-- One row per (app, domain) pair. The DNS verification poller (CC-5b)
-- reads this table to find pending domains; SSL provisioning (CC-5c)
-- reads it to find newly-verified domains that need a Fly cert.
--
-- Depends on:
--   - playground/tenants-db/migrations/001-tenants.sql (creates `apps`)
-- Run order: tenants/001 → cloud-auth/001 → cloud-teams/001 → tenants/002 → cloud-domains/001
--
-- Conventions (match tenants-db + cloud-auth + cloud-teams):
--   - TIMESTAMPTZ for cross-region safety
--   - Soft-delete via status='removed' (audit trail for who removed what when)
--   - domain is UNIQUE across all apps — one domain points at one app

-- ─────────────────────────────────────────────────────────────────────────────
-- app_domains: (app, custom domain) pairs with verification + SSL state
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app_domains (
  id               SERIAL PRIMARY KEY,
  app_id           INTEGER NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  -- Normalized domain (lowercased, no protocol, no trailing dot). Written
  -- after cloud-domains.normalizeDomain() by the add helper so the DB
  -- never sees messy user input. 253-char DNS spec cap.
  domain           VARCHAR(253) NOT NULL UNIQUE,
  -- The CNAME target we told the user to add (cloud-domains.expectedCnameFor
  -- output at add time). Stored so the verification poller compares against
  -- the value Meph used at add time even if DEFAULT_ROOT_DOMAIN drifts later.
  expected_cname   VARCHAR(253) NOT NULL,
  -- State machine:
  --   pending  — added but DNS not verified yet (poller still checking)
  --   verified — DNS points at expected_cname; SSL may or may not be provisioned
  --   failed   — DNS points somewhere else; user needs to fix their records
  --   removed  — soft-delete; user removed the domain
  status           VARCHAR(32) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'verified', 'failed', 'removed')),
  -- Timestamps for the poller: when DNS first verified, when it last ran
  verified_at      TIMESTAMPTZ,
  last_checked_at  TIMESTAMPTZ,
  -- Error message from the last verification attempt if status=failed.
  -- First 500 chars of whatever the DNS layer reported. Clears on retry.
  last_error       TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_app_domains_app_id  ON app_domains(app_id);
CREATE INDEX IF NOT EXISTS idx_app_domains_domain  ON app_domains(domain);
CREATE INDEX IF NOT EXISTS idx_app_domains_status  ON app_domains(status);
-- Partial index — pending rows are what the poller cares about most
CREATE INDEX IF NOT EXISTS idx_app_domains_pending
  ON app_domains(last_checked_at NULLS FIRST)
  WHERE status = 'pending';

-- ─────────────────────────────────────────────────────────────────────────────
-- Trigger: keep updated_at fresh
-- Mirrors the _touch_updated_at function from tenants-db + cloud-teams.
-- OR REPLACE is safe — the function signature is identical.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION _touch_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS touch_app_domains_updated_at ON app_domains;
CREATE TRIGGER touch_app_domains_updated_at
  BEFORE UPDATE ON app_domains
  FOR EACH ROW
  EXECUTE FUNCTION _touch_updated_at();

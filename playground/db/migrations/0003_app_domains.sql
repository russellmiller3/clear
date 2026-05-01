-- 0003_app_domains.sql — CC-5 custom domain attachment per app.
--
-- Stores the custom domains a customer has pointed at one of their Clear
-- Cloud apps. One row per (tenant_slug, app_slug, domain) triple. Keyed by
-- the same (tenant_slug, app_slug) pair every other table in the cloud
-- layer uses (cf_deploys, app_versions, app_secret_keys, app_audit_log).
--
-- The CC-5b DNS verification poller will read this table to find pending
-- rows; CC-5c SSL provisioning reads it for newly-verified rows that need
-- a Fly cert. Those are follow-up phases — this migration just lands the
-- storage shape so the URL handlers and dashboard can wire end-to-end.
--
-- Adapted from playground/cloud-domains/migrations/001-domains.sql which
-- assumed an `apps(id)` table that doesn't exist in the current cloud layer.
-- Stripped the PL/pgSQL trigger to keep pg-mem happy (same pattern as
-- 0002_users_sessions). updated_at is bumped explicitly by the helpers.

CREATE TABLE IF NOT EXISTS app_domains (
  id               SERIAL PRIMARY KEY,
  -- Composite app key. Matches every other (tenant_slug, app_slug)-keyed
  -- table in the cloud layer. Not a FK because the apps table lives in
  -- the clear_cloud schema and pg-mem chokes on cross-schema FKs; the
  -- URL handlers verify the (tenant_slug, app_slug) belongs to the authed
  -- user before any insert.
  tenant_slug      VARCHAR(64) NOT NULL,
  app_slug         VARCHAR(64) NOT NULL,
  -- Normalized domain (lowercased, no protocol, no trailing dot). Written
  -- after cloud-domains.normalizeDomain() by the add helper so the DB
  -- never sees messy user input. 253-char DNS spec cap.
  domain           VARCHAR(253) NOT NULL UNIQUE,
  -- The CNAME target we told the user to add (cloud-domains.expectedCnameFor
  -- output at add time). Stored so the verification poller compares against
  -- the value we used at add time even if DEFAULT_ROOT_DOMAIN drifts later.
  expected_cname   VARCHAR(253) NOT NULL,
  -- State machine:
  --   pending  — added but DNS not verified yet (poller still checking)
  --   verified — DNS points at expected_cname; SSL may or may not be live
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
CREATE INDEX IF NOT EXISTS idx_app_domains_app
  ON app_domains(tenant_slug, app_slug);
CREATE INDEX IF NOT EXISTS idx_app_domains_domain
  ON app_domains(domain);
CREATE INDEX IF NOT EXISTS idx_app_domains_status
  ON app_domains(status);
-- Partial index — pending rows are what the poller cares about most
CREATE INDEX IF NOT EXISTS idx_app_domains_pending
  ON app_domains(last_checked_at NULLS FIRST)
  WHERE status = 'pending';

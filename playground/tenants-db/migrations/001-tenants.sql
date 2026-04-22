-- =============================================================================
-- CC-1a: Tenants DB schema
-- =============================================================================
-- Multi-tenant hosting metadata for Clear Cloud (buildclear.dev).
--
-- This database tracks: WHO has deployed WHAT, WHERE it lives on Fly, and
-- HOW MUCH they've spent on AI calls this billing period. It is NOT the
-- storage for tenant application data — each deployed Clear app gets its
-- OWN isolated DB (SQLite file in the tenant's Fly volume, or a
-- schema-per-app in tenant Postgres — see CC-1c). This schema is the
-- CONTROL PLANE; each app's DB is its DATA PLANE.
--
-- Tables:
--   tenants    — top-level account (one per signup)
--   apps       — deployed Clear apps under a tenant (one per slug/subdomain)
--   deploys    — history of deployments per app (build → push → spin-up)
--   usage_rows — per-request AI proxy usage, keyed to app for billing
--
-- Apply (dev):
--   psql $DATABASE_URL -f playground/tenants-db/migrations/001-tenants.sql
--
-- Apply (prod, once Phase 85a lands):
--   Run via whatever migration tool Clear Cloud operations settle on —
--   plain psql, node-pg-migrate, Flyway, etc. For now this is written as
--   idempotent raw SQL that can be applied directly.
--
-- Conventions:
--   - All tables use TIMESTAMPTZ (not TIMESTAMP) so times compare cleanly
--     across Fly regions.
--   - `slug` columns are lowercase, url-safe, bounded at 63 chars
--     (matches DNS-subdomain cap for future-proofing).
--   - Soft deletes are NOT used here — tenant deletion cascades to apps,
--     deploys, and usage rows. Billing is already settled before a
--     tenant can be deleted (handled outside this schema).
--   - `CHECK` constraints encode the enums inline (plan, deploy status)
--     to keep the schema self-documenting without a CREATE TYPE dance.

-- ─────────────────────────────────────────────────────────────────────────────
-- tenants: top-level account
-- One row per customer (Marcus, team lead, enterprise buyer). Every app
-- belongs to exactly one tenant.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenants (
  id                 SERIAL PRIMARY KEY,
  -- URL-safe identifier used in admin UIs, support tickets, logs. Not
  -- used as a subdomain directly — apps have their own subdomain field.
  slug               VARCHAR(63) NOT NULL UNIQUE,
  -- Display name shown in UI ("Acme Corp RevOps", "Marcus @ Widgetco").
  name               VARCHAR(255) NOT NULL,
  -- Billing plan — gates quotas + features in CC-4 billing enforcement.
  plan               VARCHAR(32) NOT NULL DEFAULT 'free'
    CHECK (plan IN ('free', 'team', 'business', 'enterprise')),
  -- Stripe customer ID (null on free tier — no Stripe record created
  -- until upgrade).
  stripe_customer_id VARCHAR(64),
  -- Contact email for billing + ops alerts. Nullable so we can seed
  -- admin-created tenants without requiring email yet.
  email              VARCHAR(255),
  -- Soft status so admins can freeze a tenant without deleting data
  -- (outstanding billing, abuse report, self-requested pause).
  status             VARCHAR(32) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'frozen', 'deleted')),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tenants_slug   ON tenants(slug);
CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants(status);

-- ─────────────────────────────────────────────────────────────────────────────
-- apps: a deployed Clear app under a tenant
-- The subdomain router (CC-1b) looks up this row by `subdomain` on every
-- request to *.buildclear.dev. Kept lean — deploy-specific state lives in
-- the deploys table, usage in usage_rows.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS apps (
  id                 SERIAL PRIMARY KEY,
  tenant_id          INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  -- App identifier within the tenant ("approvals", "crm", "deal-desk").
  -- Unique per tenant, not globally — Marcus's "approvals" is different
  -- from AcmeCorp's "approvals".
  slug               VARCHAR(63) NOT NULL,
  -- Full subdomain under buildclear.dev (e.g. "acme-approvals" →
  -- https://acme-approvals.buildclear.dev). Globally unique — this is
  -- what the router keys on.
  subdomain          VARCHAR(63) NOT NULL UNIQUE,
  -- Fly's internal app name. Typically "<tenant-slug>-<app-slug>" or a
  -- UUID — decided by the deploy orchestrator (CC-1c).
  fly_app_name       VARCHAR(63) NOT NULL UNIQUE,
  -- Connection string for the app's ISOLATED database (per CC-1c). May
  -- be a sqlite:// path inside a Fly volume OR a Postgres URL with an
  -- app-scoped schema. Opaque to this schema — the deploy pipeline
  -- writes it, the runtime reads it via the /api/config endpoint on
  -- the AI proxy.
  fly_db_conn_str    TEXT,
  -- Pointer to the currently-serving deploy (null until first successful
  -- deploy; read-only from this schema's POV — updated by the deploy
  -- orchestrator when a build succeeds). Intentionally NOT a FK because
  -- deploys point to apps, not the reverse — this is a cache.
  current_deploy_id  INTEGER,
  -- Soft status so we can disable a misbehaving app without taking the
  -- tenant down.
  status             VARCHAR(32) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'deleted')),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Two apps under the same tenant can't share a slug.
  UNIQUE (tenant_id, slug)
);
CREATE INDEX IF NOT EXISTS idx_apps_tenant_id    ON apps(tenant_id);
CREATE INDEX IF NOT EXISTS idx_apps_subdomain    ON apps(subdomain);
CREATE INDEX IF NOT EXISTS idx_apps_fly_app_name ON apps(fly_app_name);
CREATE INDEX IF NOT EXISTS idx_apps_status       ON apps(status);

-- ─────────────────────────────────────────────────────────────────────────────
-- deploys: history of build → push → spin-up attempts per app
-- Every push through the deploy pipeline creates one row. Successful
-- deploys update apps.current_deploy_id; failed deploys leave the app's
-- current deploy unchanged (rollback-by-doing-nothing).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS deploys (
  id            SERIAL PRIMARY KEY,
  app_id        INTEGER NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  -- Version identifier — typically the git SHA of the .clear source at
  -- build time, but the deploy pipeline can set whatever it wants
  -- (semver, timestamp, etc.). Not enforced — treated as opaque.
  version       VARCHAR(64) NOT NULL,
  -- Full Docker image tag that this deploy pushed/uses. Something like
  -- "registry.fly.io/acme-approvals:v0.4.2" or a sha256 digest.
  image         VARCHAR(255) NOT NULL,
  -- Status transitions: pending → building → deployed (success) OR
  -- pending → building → failed (any stage) OR ... → rolled_back.
  status        VARCHAR(32) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'building', 'deployed', 'failed', 'rolled_back')),
  -- If status = 'failed', the error message for debugging. First 2 KB
  -- of whatever the deploy pipeline captured (stderr tail, exception,
  -- timeout reason). Truncate before insert.
  error         TEXT,
  -- Who kicked off the deploy (for audit). Typically an email or user
  -- ID from the eventual CC-2 auth layer; null for autonomous deploys.
  initiated_by  VARCHAR(255),
  started_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Populated when status reaches a terminal state (deployed / failed /
  -- rolled_back). NULL while pending/building.
  completed_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_deploys_app_id     ON deploys(app_id);
CREATE INDEX IF NOT EXISTS idx_deploys_status     ON deploys(status);
CREATE INDEX IF NOT EXISTS idx_deploys_started_at ON deploys(started_at DESC);
-- Composite index for the common "latest successful deploy per app" query.
CREATE INDEX IF NOT EXISTS idx_deploys_app_id_status_started
  ON deploys(app_id, status, started_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- usage_rows: per-request AI proxy usage
-- The AI proxy writes one row per `ask claude` call from a deployed app.
-- Billing aggregates these per tenant per billing period. High-volume
-- table — BIGSERIAL + careful indexes matter.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS usage_rows (
  id                 BIGSERIAL PRIMARY KEY,
  app_id             INTEGER NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  ts                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Which Anthropic (or other) model — drives cost calculation per
  -- model pricing tier. Free-form so future models don't need schema
  -- changes; validation happens in the proxy.
  model              VARCHAR(64) NOT NULL,
  tokens_in          INTEGER NOT NULL DEFAULT 0,
  tokens_out         INTEGER NOT NULL DEFAULT 0,
  -- Cache-read tokens are ~10x cheaper than fresh input — tracked
  -- separately so billing reflects the actual spend, not a naive
  -- tokens_in × rate calc.
  cache_read_tokens  INTEGER NOT NULL DEFAULT 0,
  cost_usd           DECIMAL(10, 6) NOT NULL DEFAULT 0,
  -- Anthropic's request id from response headers — for correlating
  -- with Anthropic's console if a dispute arises.
  request_id         VARCHAR(64)
);
-- Primary query pattern: "total cost for app X in period Y"
CREATE INDEX IF NOT EXISTS idx_usage_rows_app_id_ts ON usage_rows(app_id, ts DESC);
-- Secondary: cross-tenant dashboards (admin view).
CREATE INDEX IF NOT EXISTS idx_usage_rows_ts        ON usage_rows(ts DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- Trigger: keep updated_at fresh
-- Postgres doesn't auto-update timestamps on UPDATE like MySQL does;
-- emulate it with a trigger so tenants.updated_at and apps.updated_at
-- always reflect the last write.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION _touch_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS touch_tenants_updated_at ON tenants;
CREATE TRIGGER touch_tenants_updated_at
  BEFORE UPDATE ON tenants
  FOR EACH ROW
  EXECUTE FUNCTION _touch_updated_at();

DROP TRIGGER IF EXISTS touch_apps_updated_at ON apps;
CREATE TRIGGER touch_apps_updated_at
  BEFORE UPDATE ON apps
  FOR EACH ROW
  EXECUTE FUNCTION _touch_updated_at();

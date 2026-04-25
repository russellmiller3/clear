-- 0001_init.sql — initial schema for clear_cloud (CC-1 cycle 1).
--
-- All 7 multi-tenant tables + their indexes, in the `clear_cloud` schema.
-- The audit log is shipped Phase-C-ready (status / kind / before / after /
-- reason / ip / user_agent / version_id / error columns) so we don't need a
-- second migration when Phase C lands. Empty columns sit harmlessly until then.
--
-- Plan: plans/plan-cc-1-postgres-wire-up-04-25-2026.md (Schema spec section).
--
-- Idempotency: every CREATE uses IF NOT EXISTS so a partially-applied
-- migration (extremely rare given our transactional runner, but possible if
-- someone hand-runs this against a populated DB) doesn't blow up.

CREATE SCHEMA IF NOT EXISTS clear_cloud;

-- ─────────────────────────────────────────────────────────────────────────
-- tenants — one row per paying customer.
-- Slug format `clear-<6hex>`, never customer-chosen.
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clear_cloud.tenants (
  id                   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug                 text        NOT NULL UNIQUE,
  stripe_customer_id   text,
  plan                 text        NOT NULL DEFAULT 'pro',
  apps_deployed        int         NOT NULL DEFAULT 0,
  ai_spent_cents       int         NOT NULL DEFAULT 0,
  ai_credit_cents      int         NOT NULL DEFAULT 0,
  created_at           timestamptz NOT NULL DEFAULT now(),
  grace_expires_at     timestamptz
);

-- Partial unique on stripe_customer_id — null repeats allowed during signup,
-- but once a real customer id lands, no two tenants can share it.
CREATE UNIQUE INDEX IF NOT EXISTS tenants_stripe_customer_unique
  ON clear_cloud.tenants (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────
-- apps — the {tenant_slug, app_slug, app_name} mapping. The "app_name" is
-- the script name on Cloudflare; recordApp upserts by (tenant_slug, app_slug).
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clear_cloud.apps (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_slug   text        NOT NULL REFERENCES clear_cloud.tenants(slug) ON DELETE RESTRICT,
  app_slug      text        NOT NULL,
  app_name      text        NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_slug, app_slug)
);

-- ─────────────────────────────────────────────────────────────────────────
-- cf_deploys — Cloudflare deploy state per app. Backs lookupAppBySubdomain,
-- markAppDeployed, getAppRecord, loadKnownApps.
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clear_cloud.cf_deploys (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_slug       text        NOT NULL,
  app_slug          text        NOT NULL,
  script_name       text        NOT NULL,
  d1_database_id    text,
  hostname          text,
  deployed_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_slug, app_slug)
);

-- Subdomain lookup index. Plain `lower(hostname)` instead of the cleverer
-- `lower(split_part(hostname, '.', 1))` — pg-mem doesn't speak PL/pgSQL so
-- the EXCEPTION wrapper trick doesn't work, and split_part itself is shaky
-- in pg-mem. Cycle 7's lookupAppBySubdomain uses
-- `WHERE lower(hostname) LIKE lower($1) || '.%'` against this index, which
-- is slightly less selective than the split_part variant but indexable in
-- both pg-mem and real Postgres. If/when subdomain lookup becomes a hot
-- path at scale, swap to a generated column on the leading label and
-- index that — same effect, portable SQL.
CREATE INDEX IF NOT EXISTS cf_deploys_subdomain_idx
  ON clear_cloud.cf_deploys (lower(hostname));

-- ─────────────────────────────────────────────────────────────────────────
-- app_versions — per-app version history. Cap at 20 in app code (not DB)
-- because that's how the in-memory store behaves. Cascade on cf_deploys
-- delete so removing an app cleans its versions.
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clear_cloud.app_versions (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_slug       text        NOT NULL,
  app_slug          text        NOT NULL,
  version_id        text,
  uploaded_at       timestamptz NOT NULL,
  source_hash       text,
  migrations_hash   text,
  note              text,
  via               text,
  FOREIGN KEY (tenant_slug, app_slug)
    REFERENCES clear_cloud.cf_deploys (tenant_slug, app_slug)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS app_versions_lookup_idx
  ON clear_cloud.app_versions (tenant_slug, app_slug, uploaded_at DESC);

-- ─────────────────────────────────────────────────────────────────────────
-- app_secret_keys — KEY NAMES only, never values. SECURITY-LOAD-BEARING:
-- secret values flow through Cloudflare's setSecrets and never touch this
-- DB. Storing as a row gives us a free "when was this key first set" trail.
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clear_cloud.app_secret_keys (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_slug   text        NOT NULL,
  app_slug      text        NOT NULL,
  key_name      text        NOT NULL,
  set_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_slug, app_slug, key_name)
);

-- ─────────────────────────────────────────────────────────────────────────
-- app_audit_log — the GDPR/CCPA/HIPAA receipt. Append-only, never trimmed
-- past MAX_AUDIT_PER_APP=200 in app code. NO foreign key on
-- (tenant_slug, app_slug) — the audit row must outlive the app it describes
-- (legal compliance: even after deleting an app, the audit row remains).
--
-- Phase-C-ready columns (status, kind, before, after, reason, ip, user_agent,
-- version_id, error) are included from day one. They sit empty until Phase C
-- ships, but having them now means no second migration when it does.
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clear_cloud.app_audit_log (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_slug         text        NOT NULL,
  app_slug            text        NOT NULL,
  ts                  timestamptz NOT NULL DEFAULT now(),
  actor               text        NOT NULL DEFAULT 'unknown',
  action              text        NOT NULL DEFAULT 'unknown',
  verdict             text,
  source_hash_before  text,
  source_hash_after   text,
  note                text,
  -- Phase C extensions ──────────────────────────────────────────────────
  kind                text,
  "before"            text,
  "after"             text,
  reason              text,
  ip                  inet,
  user_agent          text,
  status              text        NOT NULL DEFAULT 'shipped',
  version_id          text,
  error               text
);

CREATE INDEX IF NOT EXISTS app_audit_log_lookup_idx
  ON clear_cloud.app_audit_log (tenant_slug, app_slug, ts DESC);

-- ─────────────────────────────────────────────────────────────────────────
-- stripe_events — webhook deduplication. recordStripeEvent does
-- INSERT ... ON CONFLICT (event_id) DO NOTHING — idempotent replay.
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clear_cloud.stripe_events (
  event_id      text        PRIMARY KEY,
  received_at   timestamptz NOT NULL DEFAULT now()
);

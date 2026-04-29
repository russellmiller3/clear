-- 0002_users_sessions.sql — CC-2 auth schema (Clear Cloud accounts + sessions).
--
-- This is the auth layer for buildclear.dev itself — NOT the auth layer
-- INSIDE deployed Clear apps (which uses Clear's `allow signup and login`
-- syntax against per-tenant SQLite).
--
-- Tables live in the public schema (default), separate from `clear_cloud.*`
-- which holds the multi-tenant deploy state. Same logical Postgres DB,
-- two concern-scoped namespaces.
--
-- Backs:
--   buildclear.dev/api/auth/signup → creates a users row
--   buildclear.dev/api/auth/login  → creates a sessions row
--   buildclear.dev/api/auth/me     → reads the authed user via session cookie
--   buildclear.dev/api/auth/logout → soft-deletes the session
--   buildclear.dev/dashboard       → gated by valid session
--
-- The Node helpers (playground/cloud-auth/index.js) own the SQL these
-- tables receive. Schema mirrors playground/cloud-auth/migrations/001-users-sessions.sql,
-- minus the PL/pgSQL trigger (pg-mem doesn't speak PL/pgSQL, and no current
-- code path reads `updated_at` — column stays in case a future audit feature
-- wants it).

-- ─────────────────────────────────────────────────────────────────────────────
-- users: one row per Clear Cloud account
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id                 SERIAL PRIMARY KEY,
  email              VARCHAR(255) NOT NULL UNIQUE,
  password_hash      VARCHAR(255),
  name               VARCHAR(255) NOT NULL,
  email_verified_at  TIMESTAMPTZ,
  email_verify_token VARCHAR(64),
  password_reset_token       VARCHAR(64),
  password_reset_expires_at  TIMESTAMPTZ,
  status             VARCHAR(32) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'frozen', 'deleted')),
  role               VARCHAR(32) NOT NULL DEFAULT 'member'
    CHECK (role IN ('member', 'admin')),
  -- Each Clear Cloud user belongs to one tenant. Auto-created at signup
  -- (1:1 mapping for v1 — teams come later via a tenant_users join table).
  -- Not a FK because the tenants table lives in the clear_cloud schema and
  -- pg-mem chokes on cross-schema foreign keys; the slug uniqueness on
  -- clear_cloud.tenants gives the integrity guarantee we need at app code.
  tenant_slug        VARCHAR(64),
  last_login_at      TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email              ON users(email);
CREATE INDEX        IF NOT EXISTS idx_users_tenant_slug        ON users(tenant_slug)
  WHERE tenant_slug IS NOT NULL;
CREATE INDEX        IF NOT EXISTS idx_users_status             ON users(status);
CREATE INDEX        IF NOT EXISTS idx_users_email_verify_token ON users(email_verify_token)
  WHERE email_verify_token IS NOT NULL;
CREATE INDEX        IF NOT EXISTS idx_users_password_reset_token ON users(password_reset_token)
  WHERE password_reset_token IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- sessions: one row per active login. The session cookie carries an opaque
-- random token; we hash it with SHA-256 before storage so a DB leak doesn't
-- expose live sessions.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sessions (
  id                SERIAL PRIMARY KEY,
  user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash        VARCHAR(64) NOT NULL UNIQUE,
  ip_address        INET,
  user_agent        TEXT,
  last_seen_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at        TIMESTAMPTZ NOT NULL,
  revoked_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id    ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at)
  WHERE revoked_at IS NULL;

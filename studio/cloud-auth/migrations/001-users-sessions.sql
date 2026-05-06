-- =============================================================================
-- CC-2a: Accounts + sessions schema
-- =============================================================================
-- User authentication for buildclear.dev itself. NOT the auth layer
-- INSIDE deployed Clear apps — that stays with Clear's existing
-- `allow signup and login` syntax. This schema backs:
--
--   buildclear.dev/signup   → creates a users row
--   buildclear.dev/login    → creates a sessions row
--   buildclear.dev/logout   → deletes the session
--   buildclear.dev/dashboard→ gated by valid session
--
-- Tables:
--   users    — one row per signup (Marcus, teammate, admin)
--   sessions — one row per active login. Token-based (JWT in the cookie;
--              the row serves as a revocation list)
--
-- Team membership (users.team_id, teams, team_members) is CC-2b — lives
-- in a separate migration so CC-2a can ship + smoke-test standalone.
--
-- Apply (dev):
--   psql $DATABASE_URL -f playground/cloud-auth/migrations/001-users-sessions.sql
--
-- This schema can share the same Postgres instance as the tenants-db
-- (CC-1a) — Clear Cloud uses one logical database with multiple
-- concern-scoped schemas. Or it can be separate; the Node client in
-- index.js doesn't care.

-- ─────────────────────────────────────────────────────────────────────────────
-- users: one row per Clear Cloud account
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id                 SERIAL PRIMARY KEY,
  -- Email is the login identifier. Lowercased at signup to make case-
  -- insensitive uniqueness work without a functional index.
  email              VARCHAR(255) NOT NULL UNIQUE,
  -- Bcrypt hash — ALWAYS bcrypt (matches Clear's built-in `allow signup
  -- and login` syntax — same bcryptjs dep, same cost factor). Null
  -- allowed for passwordless/SSO users (future CC-2 extensions).
  password_hash      VARCHAR(255),
  -- Display name — required for the dashboard greeting. Not necessarily
  -- unique; two Marcuses can coexist.
  name               VARCHAR(255) NOT NULL,
  -- Email verification state. Required before first deploy so we can
  -- reliably send deploy-failed / billing-alert / abuse-report notices.
  email_verified_at  TIMESTAMPTZ,
  email_verify_token VARCHAR(64),
  -- Password-reset flow uses a separate token so a leaked
  -- email_verify_token can't also reset the password.
  password_reset_token       VARCHAR(64),
  password_reset_expires_at  TIMESTAMPTZ,
  -- Soft status so admins can freeze abusive accounts without
  -- destroying their data.
  status             VARCHAR(32) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'frozen', 'deleted')),
  -- Role gates admin-plane actions (support impersonation, usage
  -- dashboards across tenants). Default 'member' — regular Marcus.
  -- 'admin' reserved for Clear Cloud staff seat(s).
  role               VARCHAR(32) NOT NULL DEFAULT 'member'
    CHECK (role IN ('member', 'admin')),
  last_login_at      TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email              ON users(email);
CREATE INDEX        IF NOT EXISTS idx_users_status             ON users(status);
CREATE INDEX        IF NOT EXISTS idx_users_email_verify_token ON users(email_verify_token)
  WHERE email_verify_token IS NOT NULL;
CREATE INDEX        IF NOT EXISTS idx_users_password_reset_token ON users(password_reset_token)
  WHERE password_reset_token IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- sessions: one row per active login
-- The session cookie carries a JWT for stateless validation, but we ALSO
-- store a row per session so we can revoke. Logout deletes the row;
-- "logout everywhere" deletes all rows for a user.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sessions (
  id                SERIAL PRIMARY KEY,
  user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Opaque token (random 32-byte hex). Stored server-side; the client
  -- carries it in an httpOnly cookie. We hash the token before storage
  -- so a DB leak doesn't expose live sessions — the column holds the
  -- SHA-256 hex digest, not the raw token.
  token_hash        VARCHAR(64) NOT NULL UNIQUE,
  -- User agent + IP captured at issue time for abuse investigations and
  -- the "active sessions" view in the dashboard.
  ip_address        INET,
  user_agent        TEXT,
  -- Rolling-window model: `last_seen_at` bumps on every authed request;
  -- inactive sessions expire after CC_SESSION_IDLE_TIMEOUT_MINUTES
  -- (config, not schema). Hard expiry caps at `expires_at` so even an
  -- active session has to re-login after ~30 days.
  last_seen_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at        TIMESTAMPTZ NOT NULL,
  -- Soft revocation — setting revoked_at to a non-null value kills the
  -- session without deleting the audit row. Useful for abuse cases
  -- where we want to keep forensics.
  revoked_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id    ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at)
  WHERE revoked_at IS NULL;  -- the GC job scans only live sessions

-- updated_at auto-touch (matches tenants-db pattern)
CREATE OR REPLACE FUNCTION _touch_users_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS touch_users_updated_at ON users;
CREATE TRIGGER touch_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION _touch_users_updated_at();

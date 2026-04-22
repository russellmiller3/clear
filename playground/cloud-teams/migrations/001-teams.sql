-- =============================================================================
-- CC-2b: Teams + memberships + invites schema
-- =============================================================================
-- Collaboration primitives for Clear Cloud accounts. One tenant (billing
-- account) may have many teams (access-control groups); one user may be a
-- member of many teams with different roles in each. See CC-2a for users
-- + sessions; see tenants-db/migrations/001-tenants.sql for tenants.
--
-- Tables:
--   teams          — top-level collaboration group with a slug + tenant
--   team_members   — (team, user, role) with last-owner guarantees at the
--                    app layer (see playground/cloud-teams/index.js)
--   team_invites   — pending email invites, single-use, time-boxed
--
-- Apply (dev):
--   psql $DATABASE_URL -f playground/cloud-teams/migrations/001-teams.sql
--
-- Apply (prod, once Phase 85a lands):
--   Same as tenants — plain psql, or whatever migration runner the ops
--   stack settles on. Written idempotently (IF NOT EXISTS everywhere).
--
-- Conventions (match tenants-db + cloud-auth):
--   - TIMESTAMPTZ for all timestamps (cross-region safe)
--   - slug is lowercase url-safe, 63-char DNS cap
--   - Soft-delete via status column rather than DELETE, so owner actions
--     like "team.delete" preserve audit history
--   - Invites use soft-delete (revoked_at) + consumed marker (accepted_at)
--     rather than separate tables, because the audit trail is useful for
--     "who sent whom an invite when, who accepted when, who revoked when"

-- ─────────────────────────────────────────────────────────────────────────────
-- teams: top-level collaboration group
-- A team lives under zero or one tenants (nullable for admin-created teams
-- that aren't tied to a billing account yet). Slug is globally unique — it
-- becomes part of URLs (buildclear.dev/team/<slug>) and display keys.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS teams (
  id          SERIAL PRIMARY KEY,
  slug        VARCHAR(63) NOT NULL UNIQUE,
  name        VARCHAR(255) NOT NULL,
  -- Nullable — a team can be created before it's billed to a tenant
  -- (ops-seeded teams, admin debugging). Upgrade path attaches it later.
  tenant_id   INTEGER REFERENCES tenants(id) ON DELETE SET NULL,
  status      VARCHAR(32) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'archived', 'deleted')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_teams_slug      ON teams(slug);
CREATE INDEX IF NOT EXISTS idx_teams_tenant_id ON teams(tenant_id);
CREATE INDEX IF NOT EXISTS idx_teams_status    ON teams(status);

-- ─────────────────────────────────────────────────────────────────────────────
-- team_members: (team, user, role) triples
-- The primary access-control table. can(role, action) in index.js reads
-- this row to decide owner/admin/member privileges. The last-owner guard
-- (see removeMember, updateMemberRole, transferOwnership) enforces
-- "teams always have ≥1 owner" at the app layer — atomic via BEGIN/COMMIT
-- transactions rather than a DB trigger, because admin recovery tools need
-- to override this rule in rare cases.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS team_members (
  id         SERIAL PRIMARY KEY,
  team_id    INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  -- FK to cloud-auth users table (created by that migration first). If
  -- cloud-auth's migration hasn't run yet, this reference will dangle —
  -- callers should apply migrations in order tenants → cloud-auth →
  -- cloud-teams.
  user_id    INTEGER NOT NULL,
  role       VARCHAR(16) NOT NULL DEFAULT 'member'
    CHECK (role IN ('owner', 'admin', 'member')),
  joined_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- One membership per (team, user) — no duplicate rows. Re-add after
  -- removal creates a fresh row via DELETE + INSERT semantics.
  UNIQUE (team_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_team_members_team_id ON team_members(team_id);
CREATE INDEX IF NOT EXISTS idx_team_members_user_id ON team_members(user_id);
-- Partial index speeds up the last-owner guard's COUNT(*) query.
CREATE INDEX IF NOT EXISTS idx_team_members_owners  ON team_members(team_id) WHERE role = 'owner';

-- ─────────────────────────────────────────────────────────────────────────────
-- team_invites: pending email invites, single-use + time-boxed
-- Soft-delete pattern: accepted_at and revoked_at are set instead of
-- deleting the row, so audit trail ("who sent what to whom when, who
-- accepted/revoked when") survives. listPendingInvites filters these
-- out via WHERE accepted_at IS NULL AND revoked_at IS NULL AND
-- expires_at > NOW().
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS team_invites (
  id           SERIAL PRIMARY KEY,
  team_id      INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  -- Email normalized (lowercased + trimmed) by index.js before INSERT.
  -- 320-char RFC 5321 cap.
  email        VARCHAR(320) NOT NULL,
  role         VARCHAR(16) NOT NULL DEFAULT 'member'
    CHECK (role IN ('owner', 'admin', 'member')),
  -- 64-char hex from randomBytes(32).toString('hex'). Unique because the
  -- token IS the invite — if two invites shared one, accepting either
  -- would ambiguate.
  token        VARCHAR(128) NOT NULL UNIQUE,
  -- Who sent the invite (user_id). Nullable for ops-seeded invites.
  invited_by   INTEGER,
  invited_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at   TIMESTAMPTZ NOT NULL,
  -- Populated when the invite is consumed via acceptInvite.
  accepted_at  TIMESTAMPTZ,
  accepted_by  INTEGER,
  -- Populated when an admin revokes the invite before it's accepted.
  -- accepted_at XOR revoked_at (enforced at app layer) — both set at once
  -- is a logic bug upstream.
  revoked_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_team_invites_team_id   ON team_invites(team_id);
CREATE INDEX IF NOT EXISTS idx_team_invites_token     ON team_invites(token);
CREATE INDEX IF NOT EXISTS idx_team_invites_email     ON team_invites(email);
-- The listPendingInvites query — scan pending invites ordered by recency.
CREATE INDEX IF NOT EXISTS idx_team_invites_pending
  ON team_invites(team_id, invited_at DESC)
  WHERE accepted_at IS NULL AND revoked_at IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- Trigger: keep updated_at fresh on teams
-- Postgres doesn't auto-touch UPDATE timestamps. Mirror tenants-db's
-- _touch_updated_at function (safe to redefine with OR REPLACE even if
-- that migration already ran).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION _touch_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS touch_teams_updated_at ON teams;
CREATE TRIGGER touch_teams_updated_at
  BEFORE UPDATE ON teams
  FOR EACH ROW
  EXECUTE FUNCTION _touch_updated_at();

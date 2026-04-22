-- =============================================================================
-- CC-2d: Wire deployed apps to Clear Cloud teams
-- =============================================================================
-- An app's `tenant_id` is the BILLING boundary (who pays for it). CC-2d
-- adds the COLLABORATION boundary: which team can deploy, edit, and view
-- usage for this app. team_members (from cloud-teams) gives us owner /
-- admin / member roles; the app-layer code consults them before letting
-- a request mutate an app.
--
-- Depends on:
--   - 001-tenants.sql (this module) — creates `apps`
--   - cloud-teams/migrations/001-teams.sql — creates `teams`
-- Run order: tenants/001 → cloud-auth/001 → cloud-teams/001 → tenants/002
--
-- Nullability: team_id is NOT NULL for new rows going forward, but this
-- migration adds it as NULLABLE because pre-CC-2d apps rows (dev, seed
-- data) have no team yet. A future migration backfills them and flips
-- the column to NOT NULL once access-control enforcement ships and the
-- backfill completes.

-- ─────────────────────────────────────────────────────────────────────────────
-- apps.team_id — who owns this app, for access control
-- ON DELETE SET NULL mirrors teams.tenant_id — deleting a team doesn't
-- nuke the apps it owned (would lose usage history + billing). App owners
-- are expected to transfer or explicitly delete apps before team deletion.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE IF EXISTS apps
  ADD COLUMN IF NOT EXISTS team_id INTEGER REFERENCES teams(id) ON DELETE SET NULL;

-- Index for the common "apps my team can access" dashboard query.
CREATE INDEX IF NOT EXISTS idx_apps_team_id ON apps(team_id);

/*
 * Clear Cloud teams — CC-2b (TDD build).
 *
 * Grows one test at a time. See index.test.js for the red→green→refactor
 * history encoded in commit log.
 */

import { randomBytes } from 'crypto';

// Invite expires after this many days unless the caller overrides.
// 7 days matches common SaaS convention — enough time for the recipient
// to see the email through a weekend, short enough to rotate stale
// invites out quickly.
export const INVITE_TTL_DAYS = Number(process.env.CC_INVITE_TTL_DAYS) || 7;

// ─── Permission matrix ──────────────────────────────────────────────────
// Fail-closed: missing action → deny, missing role → deny. Owner-only
// actions are the dangerous ones (billing, delete). Admin gets the
// collaboration surface. Member gets the deploy + read surface.
const PERMISSIONS = {
  'billing.manage':       ['owner'],
  'team.delete':          ['owner'],
  'team.invite':          ['owner', 'admin'],
  'team.remove-member':   ['owner', 'admin'],
  'team.view-members':    ['owner', 'admin', 'member'],
  'app.deploy':           ['owner', 'admin', 'member'],
  'app.delete-with-data': ['owner'],
};

/**
 * Static permission check. No DB hit — compose with a caller's own
 * membership lookup. Returns true iff `role` is in the action's
 * allowlist. Unknown role or unknown action → false (fail closed).
 */
export function can(role, action) {
  if (!role || typeof role !== 'string') return false;
  const allowed = PERMISSIONS[action];
  if (!allowed) return false;
  return allowed.includes(role);
}

/**
 * Create a new team. Inserts into teams, adds the caller as owner in
 * team_members, returns the team row.
 *
 * @param {object} db - pg Pool or compatible { query(text, params) }
 * @param {object} input - { slug, name, ownerUserId, tenantId? }
 */
export async function createTeam(db, input) {
  await db.query('BEGIN');
  let team;
  try {
    const { rows } = await db.query(
      `INSERT INTO teams (slug, name, tenant_id) VALUES ($1, $2, $3) RETURNING *`,
      [input.slug, input.name, input.tenantId || null]
    );
    team = rows[0];
    await db.query(
      `INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, $3)`,
      [team.id, input.ownerUserId, 'owner']
    );
    await db.query('COMMIT');
  } catch (err) {
    try { await db.query('ROLLBACK'); } catch {}
    if (err.code === '23505') throw new Error('A team with that slug already exists.');
    throw err;
  }
  return team;
}

/**
 * Look up a team by URL slug. Returns the row or null.
 * Also mocks the mock-db — needs a SELECT handler added alongside.
 */
export async function getTeamBySlug(db, slug) {
  const { rows } = await db.query(
    `SELECT * FROM teams WHERE slug = $1 LIMIT 1`,
    [slug]
  );
  return rows[0] || null;
}

/**
 * All teams a user belongs to. Each row carries the user's role
 * under `my_role` for the common dashboard "team list" rendering.
 */
export async function listTeamsForUser(db, userId) {
  const { rows } = await db.query(
    `SELECT t.*, tm.role AS my_role
     FROM teams t
     JOIN team_members tm ON tm.team_id = t.id
     WHERE tm.user_id = $1 AND t.status = 'active'
     ORDER BY tm.joined_at DESC`,
    [userId]
  );
  return rows;
}

/**
 * Look up a user's membership in a specific team. Row or null.
 */
export async function getMembership(db, teamId, userId) {
  const { rows } = await db.query(
    `SELECT * FROM team_members WHERE team_id = $1 AND user_id = $2 LIMIT 1`,
    [teamId, userId]
  );
  return rows[0] || null;
}

const VALID_ROLES = ['owner', 'admin', 'member'];

/**
 * Add a user to a team. Called by admin actions + invite acceptance.
 * Rejects invalid role strings at the boundary (fail fast, not at the
 * DB CHECK constraint which surfaces as opaque 23514).
 */
export async function addMember(db, teamId, userId, role = 'member') {
  if (!VALID_ROLES.includes(role)) {
    throw new Error(`invalid role "${role}" — must be one of ${VALID_ROLES.join(', ')}`);
  }
  const { rows } = await db.query(
    `INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, $3) RETURNING *`,
    [teamId, userId, role]
  );
  return rows[0];
}

/**
 * Count current owners of a team. Used by the last-owner guard.
 */
async function countOwners(db, teamId) {
  const { rows } = await db.query(
    `SELECT COUNT(*)::integer AS n FROM team_members WHERE team_id = $1 AND role = 'owner'`,
    [teamId]
  );
  return rows[0]?.n || 0;
}

/**
 * Remove a user from a team. Refuses to remove the LAST owner — every
 * team must have at least one owner at all times. Enforced at the app
 * layer (not a DB trigger) so admin tools can override in recovery.
 *
 * Returns true if a row was deleted, false if the user wasn't in the
 * team. Idempotent. Throws only on the last-owner safety check.
 */
export async function removeMember(db, teamId, userId) {
  const m = await getMembership(db, teamId, userId);
  if (!m) return false;
  if (m.role === 'owner') {
    const owners = await countOwners(db, teamId);
    if (owners <= 1) {
      throw new Error('Cannot remove the last owner. Transfer ownership first.');
    }
  }
  const { rowCount } = await db.query(
    `DELETE FROM team_members WHERE team_id = $1 AND user_id = $2`,
    [teamId, userId]
  );
  return rowCount > 0;
}

/**
 * Create a pending invite. Generates a 32-byte crypto-random hex token
 * (64 chars), stores the row with INVITE_TTL_DAYS expiry. The caller
 * sends the email with a link containing the token; the recipient
 * clicks to accept (cycle 10).
 *
 * Email normalized (lowercased + trimmed) at the boundary so the
 * database never sees mixed-case duplicates.
 */
export async function createInvite(db, input) {
  const email = (input.email || '').trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Invalid email address.');
  }
  const role = input.role || 'member';
  if (!VALID_ROLES.includes(role)) {
    throw new Error(`invalid role "${role}" — must be one of ${VALID_ROLES.join(', ')}`);
  }
  if (!input.teamId) throw new Error('teamId required');
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
  const { rows } = await db.query(
    `INSERT INTO team_invites (team_id, email, role, token, invited_by, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [input.teamId, email, role, token, input.invitedBy || null, expiresAt]
  );
  return rows[0];
}

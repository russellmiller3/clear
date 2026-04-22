/*
 * Clear Cloud teams — CC-2b (TDD build).
 *
 * Grows one test at a time. See index.test.js for the red→green→refactor
 * history encoded in commit log.
 */

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

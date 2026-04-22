/*
 * Clear Cloud teams — CC-2b (TDD build).
 *
 * Grows one test at a time. See index.test.js for the red→green→refactor
 * history encoded in commit log.
 */

/**
 * Create a new team. Inserts into teams, adds the caller as owner in
 * team_members, returns the team row.
 *
 * @param {object} db - pg Pool or compatible { query(text, params) }
 * @param {object} input - { slug, name, ownerUserId, tenantId? }
 */
export async function createTeam(db, input) {
  await db.query('BEGIN');
  const { rows } = await db.query(
    `INSERT INTO teams (slug, name, tenant_id) VALUES ($1, $2, $3) RETURNING *`,
    [input.slug, input.name, input.tenantId || null]
  );
  const team = rows[0];
  await db.query(
    `INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, 'owner')`,
    [team.id, input.ownerUserId]
  );
  await db.query('COMMIT');
  return team;
}

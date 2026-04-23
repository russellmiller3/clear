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
 * Change a member's role (promote or demote). Validates new role at the
 * boundary. Refuses to demote the last owner — preserves the "at least
 * one owner" invariant that keeps a team recoverable. Promoting an
 * existing owner to owner is a no-op (doesn't trigger the last-owner
 * guard since role isn't actually changing).
 *
 * Throws on missing membership. Returns the updated row on success.
 */
export async function updateMemberRole(db, teamId, userId, newRole) {
  if (!VALID_ROLES.includes(newRole)) {
    throw new Error(`invalid role "${newRole}" — must be one of ${VALID_ROLES.join(', ')}`);
  }
  const m = await getMembership(db, teamId, userId);
  if (!m) throw new Error('Membership not found.');
  // Last-owner guard — only triggers on an actual demotion (owner → not-owner).
  // Owner → owner is a no-op and must not trip the guard.
  if (m.role === 'owner' && newRole !== 'owner') {
    const owners = await countOwners(db, teamId);
    if (owners <= 1) {
      throw new Error('Cannot demote the last owner. Transfer ownership first.');
    }
  }
  const { rows } = await db.query(
    `UPDATE team_members SET role = $3 WHERE team_id = $1 AND user_id = $2 RETURNING *`,
    [teamId, userId, newRole]
  );
  return rows[0];
}

/**
 * Atomically transfer ownership from one user to another. The ONLY
 * way a sole owner can step back from a team without adding+demoting
 * manually — calling removeMember on the sole owner throws the
 * last-owner guard, and calling updateMemberRole demote throws it too.
 *
 * Semantics: "demote fromUser to member, promote toUser to owner" —
 * both happen in a single transaction. If either step fails, the DB
 * state is unchanged.
 *
 * Pre-conditions (checked before BEGIN to fail fast with clean errors):
 *   - fromUser and toUser are different users
 *   - toUser is currently a member of the team (can't transfer to an outsider)
 *   - fromUser is currently an owner (admins + members can't transfer ownership)
 *
 * The guard in updateMemberRole would normally block the demote half —
 * we bypass it by updating the to-user first (so there are briefly two
 * owners), then the from-user's demote passes the >1-owners check.
 *
 * @returns {{ fromRole: 'member', toRole: 'owner' }} for caller confirmation
 */
export async function transferOwnership(db, teamId, fromUserId, toUserId) {
  if (fromUserId === toUserId) {
    throw new Error('Cannot transfer ownership to the same user.');
  }
  const fromM = await getMembership(db, teamId, fromUserId);
  if (!fromM) throw new Error('From-user is not a member of the team.');
  if (fromM.role !== 'owner') throw new Error('From-user is not an owner.');
  const toM = await getMembership(db, teamId, toUserId);
  if (!toM) throw new Error('To-user is not a member of the team.');

  // Transaction so half-completed transfers don't leave the team
  // with zero or two permanent owners on failure.
  await db.query('BEGIN');
  try {
    // Promote first — briefly two owners. This is intentional: if we
    // demoted first, the countOwners check would fire on the demote
    // and block the whole transfer.
    // Parameterize role values (match cycle-4 lesson: SQL literals can
    // confuse mocks + obscure the actual value at the callsite).
    await db.query(
      `UPDATE team_members SET role = $3 WHERE team_id = $1 AND user_id = $2`,
      [teamId, toUserId, 'owner']
    );
    // Demote from-user. countOwners is now 2 so the guard doesn't trip.
    await db.query(
      `UPDATE team_members SET role = $3 WHERE team_id = $1 AND user_id = $2`,
      [teamId, fromUserId, 'member']
    );
    await db.query('COMMIT');
  } catch (err) {
    try { await db.query('ROLLBACK'); } catch {}
    throw err;
  }
  return { fromRole: 'member', toRole: 'owner' };
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

/**
 * Consume a pending invite. Validates the token isn't expired, revoked,
 * or already accepted, then adds the user to the team with the invite's
 * role and marks the invite accepted (single-use).
 *
 * Returns { teamId, role } so the caller (buildclear.dev/accept-invite
 * route handler) can redirect to the team dashboard with the fresh role.
 * Throws "Invalid invite token." for ALL failure modes so callers don't
 * leak which invites exist vs. which are expired.
 */

/**
 * List pending invites for a team — admin UI "outstanding invites"
 * view. Filters out accepted + revoked + expired invites so the list
 * only contains invites a user can still act on.
 */
export async function listPendingInvites(db, teamId) {
  const { rows } = await db.query(
    `SELECT * FROM team_invites
     WHERE team_id = $1
       AND accepted_at IS NULL
       AND revoked_at IS NULL
       AND expires_at > NOW()
     ORDER BY invited_at DESC`,
    [teamId]
  );
  return rows;
}

/**
 * Revoke a pending invite (admin cancels it before it's accepted).
 * Soft-delete: sets revoked_at. Idempotent — returns false on already-
 * revoked or non-existent invites, doesn't throw. Revoked invites
 * remain in the DB for audit trail ("who revoked whose invite when").
 */
export async function revokeInvite(db, inviteId) {
  const { rowCount } = await db.query(
    `UPDATE team_invites SET revoked_at = NOW()
     WHERE id = $1 AND accepted_at IS NULL AND revoked_at IS NULL`,
    [inviteId]
  );
  return rowCount > 0;
}

export async function acceptInvite(db, token, acceptingUserId) {
  if (!token || typeof token !== 'string') throw new Error('Invalid invite token.');
  const { rows } = await db.query(
    `SELECT * FROM team_invites
     WHERE token = $1
       AND accepted_at IS NULL
       AND revoked_at IS NULL
       AND expires_at > NOW()
     LIMIT 1`,
    [token]
  );
  const invite = rows[0];
  if (!invite) throw new Error('Invalid invite token.');
  // Add membership (skip if already a member — idempotent on re-accept
  // after DB rows were nuked, or if user joined via a different path).
  const existing = await getMembership(db, invite.team_id, acceptingUserId);
  if (!existing) {
    await db.query(
      `INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, $3)`,
      [invite.team_id, acceptingUserId, invite.role]
    );
  }
  // Mark the invite consumed.
  await db.query(
    `UPDATE team_invites SET accepted_at = NOW(), accepted_by = $1 WHERE id = $2`,
    [acceptingUserId, invite.id]
  );
  return { teamId: invite.team_id, role: invite.role };
}

/**
 * CC-2d access-control primitive. Returns the user's role on the app's
 * team, or null if the user isn't a member, the app has no team, or the
 * app doesn't exist. Compose with can(role, action) for the full
 * permission check.
 *
 * One SQL round-trip — JOINs apps → team_members so we don't need the
 * caller to look up the team_id first. Returns 'owner' | 'admin' |
 * 'member' | null. UNIQUE(team_id, user_id) on team_members means at
 * most one row comes back.
 *
 * @param {object} db - pg Pool or compatible { query(text, params) }
 * @param {number} userId
 * @param {number} appId
 * @returns {Promise<string|null>}
 */
export async function getAppAccess(db, userId, appId) {
  const { rows } = await db.query(
    `SELECT tm.role
     FROM apps a
     JOIN team_members tm ON tm.team_id = a.team_id
     WHERE a.id = $1 AND tm.user_id = $2
     LIMIT 1`,
    [appId, userId]
  );
  return rows[0] ? rows[0].role : null;
}

/**
 * CC-2d endpoint guard. Throws a 403 Error if the user can't perform
 * the action on the app; returns the user's role on allow. Caller
 * wraps with `await assertCanAccessApp(...)` — Express error middleware
 * turns the throw into a 403 response with the message.
 *
 * Deny cases (all throw Error with .status=403):
 *   - User isn't a member of the app's team
 *   - App has no team (orphan, pre-CC-2d backfill)
 *   - App doesn't exist (returned as 403 not 404 — info leak guard)
 *   - Unknown action in can() matrix (fail-closed on typos like
 *     'app.deploys' vs 'app.deploy')
 *   - User's role doesn't allow the action
 *
 * Allow case: returns the role string so handlers can log/audit who
 * did what (e.g. "user 42 (owner) deployed app 100").
 *
 * @param {object} db - pg Pool or compatible
 * @param {number} userId
 * @param {number} appId
 * @param {string} action - key from can()'s permission matrix
 * @returns {Promise<string>} the user's role
 * @throws {Error} 403 on any deny case
 */
export async function assertCanAccessApp(db, userId, appId, action) {
  const role = await getAppAccess(db, userId, appId);
  if (!role) {
    const err = new Error(
      `User ${userId} is not a member of app ${appId}'s team (or app has no team).`
    );
    err.status = 403;
    throw err;
  }
  if (!can(role, action)) {
    const err = new Error(
      `User ${userId} (role ${role}) is not authorized for ${action} on app ${appId}.`
    );
    err.status = 403;
    throw err;
  }
  return role;
}

/**
 * CC-2c dashboard query — every app the user can access across all their
 * teams. One SQL JOIN (apps ← team_members WHERE user_id = $1). Each row
 * carries `my_role` so the dashboard renders "Manage" vs "View" buttons
 * without a second round-trip per app.
 *
 * Filters:
 *   - apps.team_id NOT NULL (orphan apps don't belong to anyone)
 *   - apps.status = 'active' (archived/deleted apps don't show on the
 *     main dashboard — they'd live on a separate "Archived apps" view)
 *
 * Ordering: user's most-recent team membership first (recent teams at the
 * top of the dashboard), then by app slug for stability. Matches the
 * "what am I working on this week" UX intent.
 *
 * @param {object} db - pg Pool or compatible { query(text, params) }
 * @param {number} userId
 * @returns {Promise<Array<object>>} apps rows + my_role, empty array if no access
 */
export async function listAppsForUser(db, userId) {
  const { rows } = await db.query(
    `SELECT a.*, tm.role AS my_role
     FROM apps a
     JOIN team_members tm ON tm.team_id = a.team_id
     WHERE tm.user_id = $1
       AND a.team_id IS NOT NULL
       AND a.status = 'active'
     ORDER BY tm.joined_at DESC, a.slug ASC`,
    [userId]
  );
  return rows;
}

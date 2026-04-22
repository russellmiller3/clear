/*
 * Clear Cloud auth — CC-2a scaffold.
 *
 * Signup / login / session management for buildclear.dev itself. Separate
 * from auth INSIDE deployed Clear apps (which uses Clear's `allow signup
 * and login` syntax).
 *
 * Public API:
 *   hashPassword(pw)              — bcryptjs hash
 *   verifyPassword(pw, hash)      — bcryptjs compare
 *   generateSessionToken()        — 32-byte crypto random → hex string
 *   hashSessionToken(raw)         — SHA-256 hex digest (what gets stored)
 *   signupUser(db, {email, password, name})    — create user row
 *   loginUser(db, {email, password, ipAddress, userAgent}) — returns {user, token}
 *   validateSession(db, token)    — returns user or null (bumps last_seen_at)
 *   revokeSession(db, token)      — soft delete (revoked_at = NOW())
 *   logoutAllSessions(db, userId) — bulk revoke (for "log out everywhere")
 *   issueEmailVerifyToken(db, userId), verifyEmailToken(db, token)
 *   issuePasswordResetToken(db, email), resetPassword(db, token, newPw)
 *
 * `db` is a pg Pool (or compatible `{query(text, params)}` shape). The
 * helpers accept it as a param so the same module backs both the Studio
 * test harness (dev Postgres) and the production server (Fly Postgres).
 *
 * bcryptjs is an optional-require dep. If the module isn't installed,
 * hashPassword / verifyPassword throw with a clear install message —
 * same pattern as tenants-db's lazy pg import.
 */

import { randomBytes, createHash } from 'crypto';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATION_001_PATH = join(__dirname, 'migrations', '001-users-sessions.sql');

// Tunables — expose as env vars so production can harden without a
// code change.
export const BCRYPT_COST = Number(process.env.CC_BCRYPT_COST) || 12;
export const SESSION_HARD_TTL_DAYS = Number(process.env.CC_SESSION_HARD_TTL_DAYS) || 30;
export const SESSION_IDLE_TIMEOUT_MINUTES = Number(process.env.CC_SESSION_IDLE_TIMEOUT_MINUTES) || 60 * 24 * 7; // 7 days

let _bcrypt = null;
async function getBcrypt() {
  if (_bcrypt) return _bcrypt;
  try {
    const mod = await import('bcryptjs');
    _bcrypt = mod.default || mod;
    return _bcrypt;
  } catch {
    throw new Error(
      'cloud-auth: `bcryptjs` not installed. Run `npm install bcryptjs` in the ' +
      'playground dir to use signup/login helpers. Matches Clear\'s runtime ' +
      'auth — same dep, same version.'
    );
  }
}

/** Load the migration SQL for applying the schema. */
export function loadMigration001() {
  return readFileSync(MIGRATION_001_PATH, 'utf8');
}

// ─────────────────────────────────────────────────────────────────────────────
// Password hashing
// ─────────────────────────────────────────────────────────────────────────────

export async function hashPassword(password) {
  if (typeof password !== 'string' || password.length < 8) {
    throw new Error('Password must be a string of at least 8 characters.');
  }
  const bcrypt = await getBcrypt();
  return bcrypt.hash(password, BCRYPT_COST);
}

export async function verifyPassword(password, hash) {
  if (typeof password !== 'string' || typeof hash !== 'string') return false;
  const bcrypt = await getBcrypt();
  return bcrypt.compare(password, hash);
}

// ─────────────────────────────────────────────────────────────────────────────
// Session tokens
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate a fresh session token — 32 bytes of crypto randomness → 64
 * char hex string. This is the raw token the client receives in its
 * httpOnly cookie. We hash it before storing (see hashSessionToken).
 */
export function generateSessionToken() {
  return randomBytes(32).toString('hex');
}

/**
 * Convert a raw session token to its stored representation (SHA-256 hex).
 * Storing the hash means a DB snapshot leak doesn't expose live sessions
 * — an attacker would still need to brute-force SHA-256 preimages to mint
 * a usable cookie.
 */
export function hashSessionToken(raw) {
  return createHash('sha256').update(String(raw || ''), 'utf8').digest('hex');
}

// ─────────────────────────────────────────────────────────────────────────────
// Normalization helpers
// ─────────────────────────────────────────────────────────────────────────────

export function normalizeEmail(email) {
  if (typeof email !== 'string') return '';
  return email.trim().toLowerCase();
}

function validateEmail(email) {
  // Permissive — any string with an @ and a dot after it. Real validation
  // happens when we send the verification email.
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ─────────────────────────────────────────────────────────────────────────────
// Signup + login
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a new user. Throws if email is taken, password too short, or
 * email malformed.
 *
 * @param {object} db - pg Pool or compatible
 * @param {object} input - { email, password, name }
 * @returns {Promise<object>} the created user row (password_hash stripped)
 */
export async function signupUser(db, input) {
  const email = normalizeEmail(input.email);
  if (!validateEmail(email)) throw new Error('Invalid email address.');
  if (!input.name || typeof input.name !== 'string' || !input.name.trim()) {
    throw new Error('Name is required.');
  }
  const hash = await hashPassword(input.password);
  // Email-verify token generated at signup and returned in the user row
  // so the caller can send the verification email.
  const verifyToken = randomBytes(32).toString('hex');
  let row;
  try {
    const result = await db.query(
      `INSERT INTO users (email, password_hash, name, email_verify_token)
       VALUES ($1, $2, $3, $4)
       RETURNING id, email, name, status, role, email_verified_at, email_verify_token, created_at`,
      [email, hash, input.name.trim(), verifyToken]
    );
    row = result.rows[0];
  } catch (err) {
    // Postgres unique_violation (23505) — email already taken.
    if (err.code === '23505') {
      throw new Error('An account with that email already exists.');
    }
    throw err;
  }
  return row;
}

/**
 * Log in an existing user. Returns { user, token } on success where
 * `token` is the RAW session token the caller should set as an httpOnly
 * cookie. Throws on bad credentials, frozen account, etc.
 *
 * @param {object} db
 * @param {object} input - { email, password, ipAddress?, userAgent? }
 */
export async function loginUser(db, input) {
  const email = normalizeEmail(input.email);
  const { rows } = await db.query(
    `SELECT id, email, password_hash, name, status, role, email_verified_at
     FROM users WHERE email = $1 LIMIT 1`,
    [email]
  );
  const user = rows[0];
  if (!user) throw new Error('Invalid email or password.');
  if (user.status === 'frozen') throw new Error('Account is frozen. Contact support.');
  if (user.status === 'deleted') throw new Error('Account not found.');
  const ok = await verifyPassword(input.password, user.password_hash || '');
  if (!ok) throw new Error('Invalid email or password.');
  // Create the session row
  const rawToken = generateSessionToken();
  const tokenHash = hashSessionToken(rawToken);
  const expiresAt = new Date(Date.now() + SESSION_HARD_TTL_DAYS * 24 * 60 * 60 * 1000);
  await db.query(
    `INSERT INTO sessions (user_id, token_hash, ip_address, user_agent, expires_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [user.id, tokenHash, input.ipAddress || null, input.userAgent || null, expiresAt]
  );
  await db.query(`UPDATE users SET last_login_at = NOW() WHERE id = $1`, [user.id]);
  // Strip the hash before returning.
  delete user.password_hash;
  return { user, token: rawToken };
}

/**
 * Validate a session token from a cookie. Returns the user or null.
 * Bumps last_seen_at on match so the idle-timeout window refreshes.
 *
 * Rejects sessions that are:
 *   - Past expires_at (hard TTL)
 *   - Revoked (revoked_at is set)
 *   - Idle past SESSION_IDLE_TIMEOUT_MINUTES (last_seen_at too old)
 *   - Belong to a non-active user
 */
export async function validateSession(db, rawToken) {
  if (!rawToken || typeof rawToken !== 'string') return null;
  const tokenHash = hashSessionToken(rawToken);
  const { rows } = await db.query(
    `SELECT s.id AS session_id, s.last_seen_at, s.expires_at, s.revoked_at,
            u.id, u.email, u.name, u.status, u.role, u.email_verified_at
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1
     LIMIT 1`,
    [tokenHash]
  );
  const row = rows[0];
  if (!row) return null;
  if (row.revoked_at) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) return null;
  if (row.status !== 'active') return null;
  const idleCutoff = Date.now() - SESSION_IDLE_TIMEOUT_MINUTES * 60 * 1000;
  if (new Date(row.last_seen_at).getTime() < idleCutoff) return null;
  // Bump last_seen_at (best-effort — don't fail the auth check if the
  // UPDATE fails for a transient reason).
  try {
    await db.query(`UPDATE sessions SET last_seen_at = NOW() WHERE id = $1`, [row.session_id]);
  } catch { /* non-fatal */ }
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    status: row.status,
    role: row.role,
    email_verified_at: row.email_verified_at,
  };
}

/**
 * Revoke a session (logout). Idempotent — revoking an already-revoked
 * session is a no-op.
 */
export async function revokeSession(db, rawToken) {
  if (!rawToken || typeof rawToken !== 'string') return false;
  const tokenHash = hashSessionToken(rawToken);
  const { rowCount } = await db.query(
    `UPDATE sessions SET revoked_at = NOW()
     WHERE token_hash = $1 AND revoked_at IS NULL`,
    [tokenHash]
  );
  return rowCount > 0;
}

/**
 * Revoke every active session for a user ("log out everywhere"). Used
 * by the password-reset flow and by admins on a compromised account.
 */
export async function logoutAllSessions(db, userId) {
  const { rowCount } = await db.query(
    `UPDATE sessions SET revoked_at = NOW()
     WHERE user_id = $1 AND revoked_at IS NULL`,
    [userId]
  );
  return rowCount;
}

// ─────────────────────────────────────────────────────────────────────────────
// Email verification + password reset
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate a fresh email-verify token (rotates the existing one — useful
 * when the user asks for a new verification email).
 */
export async function issueEmailVerifyToken(db, userId) {
  const token = randomBytes(32).toString('hex');
  await db.query(
    `UPDATE users SET email_verify_token = $1 WHERE id = $2`,
    [token, userId]
  );
  return token;
}

/**
 * Validate an email-verify token and mark the user verified. Returns
 * the user id on success, null on miss.
 */
export async function verifyEmailToken(db, token) {
  if (!token || typeof token !== 'string') return null;
  const { rows } = await db.query(
    `UPDATE users
     SET email_verified_at = NOW(), email_verify_token = NULL
     WHERE email_verify_token = $1
     RETURNING id`,
    [token]
  );
  return rows[0]?.id || null;
}

/**
 * Issue a password-reset token. 1-hour expiry. Doesn't leak whether the
 * email exists — always returns the user's token or null (so a caller
 * that sends email on a non-null return doesn't tell an attacker which
 * emails are registered).
 */
export async function issuePasswordResetToken(db, email) {
  const normalizedEmail = normalizeEmail(email);
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
  const { rows } = await db.query(
    `UPDATE users
     SET password_reset_token = $1, password_reset_expires_at = $2
     WHERE email = $3 AND status = 'active'
     RETURNING id`,
    [token, expiresAt, normalizedEmail]
  );
  return rows[0] ? token : null;
}

/**
 * Reset a password given a valid token. Also revokes all existing
 * sessions so a stolen-session attacker gets logged out.
 */
export async function resetPassword(db, token, newPassword) {
  if (!token || typeof token !== 'string') throw new Error('Invalid reset token.');
  const newHash = await hashPassword(newPassword);
  const { rows } = await db.query(
    `UPDATE users
     SET password_hash = $1,
         password_reset_token = NULL,
         password_reset_expires_at = NULL
     WHERE password_reset_token = $2
       AND password_reset_expires_at > NOW()
       AND status = 'active'
     RETURNING id`,
    [newHash, token]
  );
  const userId = rows[0]?.id;
  if (!userId) throw new Error('Reset token is invalid or expired.');
  await logoutAllSessions(db, userId);
  return userId;
}

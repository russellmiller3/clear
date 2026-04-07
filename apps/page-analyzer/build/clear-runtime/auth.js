// =============================================================================
// CLEAR RUNTIME — AUTH MODULE
// =============================================================================
//
// PURPOSE: Provides authentication middleware for compiled Clear backend apps.
// Zero external dependencies. Uses signed JWT-like tokens (HMAC-SHA256).
//
// API:
//   auth.middleware()       — Express middleware that verifies Bearer tokens
//   auth.createToken(user)  — Create a signed token for a user object
//   auth.verifyToken(token) — Verify and decode a token
//   auth.hashPassword(pw)   — Hash a password (simple, no bcrypt dep)
//   auth.checkPassword(pw, hash) — Compare password to hash
//
// Token format: base64(payload).base64(signature)
// Payload: JSON with { id, role, exp }
// Signature: HMAC-SHA256(payload, secret)
//
// The secret comes from process.env.CLEAR_AUTH_SECRET or a default dev key.
// IMPORTANT: In production, always set CLEAR_AUTH_SECRET.
//
// =============================================================================

const crypto = require('crypto');

const SECRET = process.env.CLEAR_AUTH_SECRET || 'clear-dev-secret-change-in-production';
const TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

if (!process.env.CLEAR_AUTH_SECRET) {
  console.warn('[clear-auth] WARNING: Using default auth secret. Set CLEAR_AUTH_SECRET in production.');
}

// =============================================================================
// TOKEN OPERATIONS
// =============================================================================

function createToken(user) {
  const payload = {
    id: user.id,
    role: user.role || 'user',
    email: user.email,
    exp: Date.now() + TOKEN_EXPIRY_MS,
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', SECRET).update(payloadB64).digest('base64url');
  return `${payloadB64}.${signature}`;
}

function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;

  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [payloadB64, signature] = parts;
  const expectedSig = crypto.createHmac('sha256', SECRET).update(payloadB64).digest('base64url');

  if (signature !== expectedSig) return null;

  try {
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());
    if (payload.exp && payload.exp < Date.now()) return null; // expired
    return payload;
  } catch {
    return null;
  }
}

// =============================================================================
// PASSWORD HASHING (simple PBKDF2, no external deps)
// =============================================================================

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

function checkPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const check = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return hash === check;
}

// =============================================================================
// EXPRESS MIDDLEWARE
// =============================================================================

function middleware() {
  return (req, res, next) => {
    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) {
      req.user = null;
      return next();
    }

    const token = authHeader.slice(7);
    const user = verifyToken(token);
    req.user = user; // null if invalid/expired, user object if valid
    next();
  };
}

// =============================================================================
// PUBLIC API
// =============================================================================

const auth = {
  middleware,
  createToken,
  verifyToken,
  hashPassword,
  checkPassword,
};

module.exports = auth;

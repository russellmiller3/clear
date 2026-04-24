// =============================================================================
// EVAL AUTH — shared-secret JWT minter for eval child probes
// =============================================================================
//
// PURPOSE
// Compiled Clear apps gate endpoints behind `requires login` → the inline
// auth middleware the compiler emits expects a `Bearer <token>` header
// verified via `jsonwebtoken.verify(token, JWT_SECRET)`. When the eval
// runner fires unauthenticated probes at those endpoints, every request
// 401s before reaching the agent. Every eval fails for the same meta-
// reason — not because the agent is broken but because the front door
// is locked.
//
// FIX
// The parent (playground server) and the child (the spawned compiled app)
// share one secret, EVAL_JWT_SECRET. It's randomized per parent boot so
// tokens from a previous Studio session can't slip into this one. The
// parent exports JWT_SECRET=EVAL_JWT_SECRET into the child's env before
// spawn (ensureEvalChild). mintEvalAuthToken(user) produces a standard
// RFC 7519 HS256 JWT the child's jsonwebtoken.verify will accept.
//
// CONTRACT
// Token format MUST match `jwt.sign(payload, secret, { algorithm: 'HS256' })`:
//   - header    = {"alg":"HS256","typ":"JWT"}
//   - payload   = { id, email, role, iat, exp }   (iat/exp in SECONDS)
//   - signature = HMAC-SHA256(base64url(header) + "." + base64url(payload), secret)
//   - token     = base64url(header) + "." + base64url(payload) + "." + base64url(signature)
// The runtime/auth.js format (2-part HMAC) is a different, legacy shape
// used only by one-off templates. If the compiler changes how it emits
// auth middleware, this module must change in lockstep.
// =============================================================================

import crypto from 'crypto';

// Randomized per server boot — 32 hex chars. Passed to child as JWT_SECRET
// (primary — used by the jsonwebtoken-based auth the compiler emits) and
// CLEAR_AUTH_SECRET (shared secret for the legacy runtime/auth.js scheme).
// Only the jsonwebtoken scheme is fully covered by mintEvalAuthToken —
// legacy templates using runtime/auth.js would need a separate 2-part
// HMAC token format that this helper doesn't produce yet.
export const EVAL_JWT_SECRET = 'clear-eval-' + crypto.randomBytes(16).toString('hex');

// The fake user identity every eval probe runs as. Stable across runs so
// eval scenarios that index by owner (e.g. "this user's todos") land on a
// predictable record set. The id is a well-formed UUID-ish string so apps
// that validate user id shape don't reject it.
export const EVAL_USER = Object.freeze({
  id: 'eval-0000-0000-0000-000000000001',
  email: 'eval@test.local',
  role: 'user',
});

// 1 hour is plenty for a single suite run (typical: 60-90s). Short enough that
// a stolen token won't outlive its usefulness.
const TOKEN_TTL_SECONDS = 60 * 60;

function base64url(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

export function mintEvalAuthToken(user) {
  const u = user || EVAL_USER;
  const nowSec = Math.floor(Date.now() / 1000);
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    id: u.id,
    email: u.email,
    role: u.role || 'user',
    iat: nowSec,
    exp: nowSec + TOKEN_TTL_SECONDS,
  };
  const headerB64 = base64url(header);
  const payloadB64 = base64url(payload);
  const signingInput = `${headerB64}.${payloadB64}`;
  const signature = crypto.createHmac('sha256', EVAL_JWT_SECRET).update(signingInput).digest('base64url');
  return `${signingInput}.${signature}`;
}

// =============================================================================
// LEGACY FORMAT — runtime/auth.js compatibility
// =============================================================================
//
// Some templates (blog-api, lead-scorer, page-analyzer, and anything that
// compiles `require('./clear-runtime/auth')`) verify tokens with runtime/
// auth.js's home-rolled 2-part HMAC format instead of the standard JWT.
// Shape: base64url(payload) + "." + base64url(HMAC-SHA256(payload, secret))
// — no header, two parts. Uses MILLISECONDS for exp (not seconds like
// jsonwebtoken). Shares EVAL_JWT_SECRET with the JWT format; the parent
// exports both as JWT_SECRET and CLEAR_AUTH_SECRET to the child at spawn.
//
// callEvalEndpoint picks which mint to call based on which auth library
// the compiled child imports — detected once at spawn time.
export function mintLegacyEvalAuthToken(user) {
  const u = user || EVAL_USER;
  const payload = {
    id: u.id,
    role: u.role || 'user',
    email: u.email,
    exp: Date.now() + TOKEN_TTL_SECONDS * 1000, // ms, matches runtime/auth.js
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', EVAL_JWT_SECRET).update(payloadB64).digest('base64url');
  return `${payloadB64}.${signature}`;
}

// Verify a 2-part legacy token (payload.signature shape). Returns the
// decoded payload on success, or null if anything fails: malformed shape,
// wrong signature, payload isn't JSON, or payload.exp already past.
//
// Used by Studio's liveEditAuth middleware to gate /__meph__/api/* routes.
// Without HMAC verification (the pre-Session-44 state) any client that
// knew the payload shape could forge {"role":"owner"} and get a live-edit
// session. Constant-time comparison uses timingSafeEqual to avoid string-
// compare timing leaks on the signature check.
export function verifyLegacyEvalAuthToken(token) {
  if (typeof token !== 'string' || token.length === 0) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payloadB64, signature] = parts;
  if (!payloadB64 || !signature) return null;
  const expected = crypto.createHmac('sha256', EVAL_JWT_SECRET).update(payloadB64).digest('base64url');
  let sigBuf, expBuf;
  try {
    sigBuf = Buffer.from(signature, 'base64url');
    expBuf = Buffer.from(expected, 'base64url');
  } catch { return null; }
  if (sigBuf.length !== expBuf.length) return null;
  if (!crypto.timingSafeEqual(sigBuf, expBuf)) return null;
  let payload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());
  } catch { return null; }
  if (!payload || typeof payload !== 'object') return null;
  if (typeof payload.exp === 'number' && payload.exp < Date.now()) return null;
  return payload;
}

// playground/cloud-auth/routes.js
//
// CC-2 — Express routes for buildclear.dev's auth layer. Mounts the 4
// URL handlers Marcus needs to log into the dashboard:
//
//   POST /api/auth/signup  → body: {email, password, name}
//   POST /api/auth/login   → body: {email, password}
//   GET  /api/auth/me      → reads the session cookie, returns the user
//   POST /api/auth/logout  → revokes the session and clears the cookie
//
// Integrates with the auth helpers in ./index.js. Without a Postgres pool
// (DATABASE_URL unset) every endpoint returns 503 — auth is gated on the
// database being configured. This keeps Studio's dev experience zero-config
// (no auth needed locally) while production gets full auth the moment the
// env var lands.
//
// Cookie strategy:
//   - Name: `clear_session`
//   - httpOnly (no JS access — XSS can't steal it)
//   - SameSite=Lax (blocks most CSRF; safe for a top-level dashboard)
//   - Secure when behind HTTPS (production) or NODE_ENV=production
//   - Max-Age = 30 days (matches SESSION_HARD_TTL_DAYS in index.js)
//   - Path=/ so every URL on buildclear.dev sees the cookie
//
// Inline cookie parsing/formatting — no cookie-parser dependency. The Cookie
// header is a simple `name=value; name2=value2` string; ~10 lines covers the
// signup/login/me/logout surface we need.

import {
  signupUser, loginUser, validateSession, revokeSession,
  SESSION_HARD_TTL_DAYS,
} from './index.js';

export const SESSION_COOKIE_NAME = 'clear_session';

// Parse the Cookie request header into a name → value map. Returns {} for
// missing or malformed headers. Tolerates leading/trailing whitespace and
// duplicate names (last value wins, matches express's cookie-parser).
export function parseCookies(header) {
  if (!header || typeof header !== 'string') return {};
  const out = {};
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const name = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (!name) continue;
    try { out[name] = decodeURIComponent(value); }
    catch { out[name] = value; }
  }
  return out;
}

// Build a Set-Cookie header value for issuing a fresh session token.
// `secure` defaults to true unless explicitly set false (matters for tests
// over plain HTTP). Returns the full header string.
export function buildSessionCookie(token, { secure = true, maxAgeSeconds } = {}) {
  const seconds = maxAgeSeconds ?? SESSION_HARD_TTL_DAYS * 24 * 60 * 60;
  const parts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${seconds}`,
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

// Build a Set-Cookie header value that clears the session (logout). Same
// shape as the issue cookie but Max-Age=0 so the browser deletes it.
export function buildClearSessionCookie({ secure = true } = {}) {
  const parts = [
    `${SESSION_COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

// Are we behind HTTPS? Trust the X-Forwarded-Proto header (set by Fly's
// load balancer) OR NODE_ENV=production OR a direct https request.
function isSecureRequest(req) {
  if (process.env.NODE_ENV === 'production') return true;
  const xfp = req.headers['x-forwarded-proto'];
  if (xfp && String(xfp).toLowerCase().split(',')[0].trim() === 'https') return true;
  if (req.protocol === 'https') return true;
  return false;
}

// Extract the client IP for the sessions row. Trusts X-Forwarded-For when
// present (Fly sets it), otherwise falls back to req.ip / connection address.
// Strips the IPv4-mapped IPv6 prefix (`::ffff:127.0.0.1` → `127.0.0.1`) so
// the value parses cleanly as a Postgres INET — Node's HTTP server returns
// the mapped form on dual-stack hosts, which pg-mem rejects outright and
// real Postgres accepts but stores as IPv6.
function clientIp(req) {
  let raw = null;
  const xff = req.headers['x-forwarded-for'];
  if (xff) raw = String(xff).split(',')[0].trim();
  else raw = req.ip || req.connection?.remoteAddress || null;
  if (!raw) return null;
  if (raw.startsWith('::ffff:')) return raw.slice(7);
  return raw;
}

// Strip a user row down to the safe fields a client should see. Never
// returns password_hash or password_reset_token even if they're present.
function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    status: u.status,
    email_verified_at: u.email_verified_at || null,
  };
}

/**
 * Mount the 4 auth routes on an Express app. Idempotent in the sense that
 * calling it twice on the same app double-registers — don't do that.
 *
 * @param {object} app   — Express app (must already have express.json mounted)
 * @param {object} opts
 * @param {object} opts.pool — pg.Pool (or pg-mem equivalent). When null/undefined,
 *                             every route returns 503 "auth not configured".
 */
export function mountCloudAuthRoutes(app, { pool } = {}) {
  // No DB → every endpoint stubs out. Keeps Studio dev-mode (no DATABASE_URL)
  // working without weird 500s if anyone hits the URLs accidentally.
  if (!pool) {
    const stub = (_req, res) => res.status(503).json({
      ok: false,
      error: 'auth_not_configured',
      message: 'Cloud auth requires DATABASE_URL. Set it and restart to enable signup/login.',
    });
    app.post('/api/auth/signup', stub);
    app.post('/api/auth/login', stub);
    app.get('/api/auth/me', stub);
    app.post('/api/auth/logout', stub);
    return { mounted: false };
  }

  app.post('/api/auth/signup', async (req, res) => {
    const { email, password, name } = req.body || {};
    if (!email || !password || !name) {
      return res.status(400).json({ ok: false, error: 'missing_fields',
        message: 'email, password, and name are required.' });
    }
    try {
      const user = await signupUser(pool, { email, password, name });
      // Auto-login the new account so the next request hits /api/auth/me cleanly.
      const { token } = await loginUser(pool, {
        email, password,
        ipAddress: clientIp(req),
        userAgent: req.headers['user-agent'] || null,
      });
      res.setHeader('Set-Cookie', buildSessionCookie(token, { secure: isSecureRequest(req) }));
      return res.status(201).json({ ok: true, user: publicUser(user) });
    } catch (err) {
      const msg = err.message || 'signup_failed';
      const status = msg.includes('already exists') ? 409
        : msg.includes('Invalid email') || msg.includes('Name') || msg.includes('at least 8') ? 400
        : 500;
      return res.status(status).json({ ok: false, error: 'signup_failed', message: msg });
    }
  });

  app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ ok: false, error: 'missing_fields',
        message: 'email and password are required.' });
    }
    try {
      const { user, token } = await loginUser(pool, {
        email, password,
        ipAddress: clientIp(req),
        userAgent: req.headers['user-agent'] || null,
      });
      res.setHeader('Set-Cookie', buildSessionCookie(token, { secure: isSecureRequest(req) }));
      return res.json({ ok: true, user: publicUser(user) });
    } catch (err) {
      const msg = err.message || 'login_failed';
      const status = msg.includes('frozen') ? 403
        : msg.includes('Invalid email or password') ? 401
        : 500;
      return res.status(status).json({ ok: false, error: 'login_failed', message: msg });
    }
  });

  app.get('/api/auth/me', async (req, res) => {
    const cookies = parseCookies(req.headers.cookie);
    const token = cookies[SESSION_COOKIE_NAME];
    if (!token) {
      return res.status(401).json({ ok: false, error: 'not_authenticated' });
    }
    try {
      const user = await validateSession(pool, token);
      if (!user) {
        return res.status(401).json({ ok: false, error: 'session_invalid' });
      }
      return res.json({ ok: true, user: publicUser(user) });
    } catch (err) {
      return res.status(500).json({ ok: false, error: 'me_failed', message: err.message });
    }
  });

  app.post('/api/auth/logout', async (req, res) => {
    const cookies = parseCookies(req.headers.cookie);
    const token = cookies[SESSION_COOKIE_NAME];
    // Clearing the cookie is unconditional — even if there's no token or
    // it's already invalid, we want the browser to drop any stale state.
    res.setHeader('Set-Cookie', buildClearSessionCookie({ secure: isSecureRequest(req) }));
    if (token) {
      try { await revokeSession(pool, token); } catch { /* idempotent */ }
    }
    return res.json({ ok: true });
  });

  return { mounted: true };
}

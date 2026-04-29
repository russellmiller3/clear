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

import { randomBytes } from 'crypto';
import {
  signupUser, loginUser, validateSession, revokeSession,
  SESSION_HARD_TTL_DAYS,
} from './index.js';
import { normalizeDomain, expectedCnameFor } from '../cloud-domains/index.js';

export const SESSION_COOKIE_NAME = 'clear_session';

// CC-2 cycle 10 — slug format for auto-created tenants. Matches the
// `clear-<6hex>` shape used elsewhere in the cloud layer (CC-1 cycle 1).
// Customers never see this slug; it shows up only in subdomain URLs and
// internal references. 6 hex chars = 16M unique slugs, plenty for now.
function generateTenantSlug() {
  return 'clear-' + randomBytes(3).toString('hex');
}

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
    tenant_slug: u.tenant_slug || null,
  };
}

/**
 * Mount the 5 auth + dashboard routes on an Express app. Idempotent in the
 * sense that calling it twice on the same app double-registers — don't.
 *
 * @param {object} app   — Express app (must already have express.json mounted)
 * @param {object} opts
 * @param {object} opts.pool        — pg.Pool (or pg-mem equivalent). When null,
 *                                    every route returns 503 "auth not configured".
 * @param {object} opts.tenantStore — InMemory/Postgres/DualWrite tenant store.
 *                                    Used to (a) auto-create a tenant on signup
 *                                    and (b) list a customer's deployed apps.
 *                                    When null, signup still works but the apps
 *                                    list is always empty (degraded mode).
 */
export function mountCloudAuthRoutes(app, { pool, tenantStore } = {}) {
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
    app.get('/api/apps', stub);
    app.get('/api/apps/:appSlug/domains', stub);
    app.post('/api/apps/:appSlug/domains', stub);
    app.delete('/api/apps/:appSlug/domains/:id', stub);
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
      // CC-2 cycle 10 — auto-create a tenant for this account and write the
      // slug back onto the user. 1:1 user→tenant for v1 (teams come later
      // via a tenant_users join). Best-effort: if the tenant store isn't
      // configured (degraded mode) the signup still succeeds, the user just
      // has no tenant_slug until something backfills it.
      let tenantSlug = null;
      if (tenantStore && typeof tenantStore.create === 'function') {
        try {
          tenantSlug = generateTenantSlug();
          await tenantStore.create({ slug: tenantSlug, plan: 'pro' });
          await pool.query(`UPDATE users SET tenant_slug = $1 WHERE id = $2`, [tenantSlug, user.id]);
          user.tenant_slug = tenantSlug;
        } catch (tenantErr) {
          // Don't fail signup just because the tenant didn't materialize —
          // log and continue. Whoever inspects the failed tenant later
          // can backfill via a one-shot script.
          console.warn('[cloud-auth] tenant auto-create failed for user', user.id, tenantErr.message);
          tenantSlug = null;
        }
      }
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

  // CC-5 cycle 1 — shared helper for the domain routes. Reads cookie,
  // validates session, returns the authed user OR a 401-shaped error so
  // the caller can early-return without duplicating the gate.
  async function authedUserFor(req, res) {
    const cookies = parseCookies(req.headers.cookie);
    const token = cookies[SESSION_COOKIE_NAME];
    if (!token) {
      res.status(401).json({ ok: false, error: 'not_authenticated' });
      return null;
    }
    const user = await validateSession(pool, token);
    if (!user) {
      res.status(401).json({ ok: false, error: 'session_invalid' });
      return null;
    }
    return user;
  }

  // CC-5 cycle 1 — verify the (tenant_slug, app_slug) belongs to the authed
  // user's tenant before any domain mutation. Without this check, any logged-
  // in user could attach a domain to any other tenant's app. Returns true on
  // success and writes the right error response on failure.
  async function ensureAppOwnedByUser(req, res, user, appSlug) {
    if (!user.tenant_slug) {
      res.status(403).json({ ok: false, error: 'no_tenant',
        message: 'Your account has no tenant yet. Wait a moment and refresh.' });
      return false;
    }
    if (!tenantStore || typeof tenantStore.getAppRecord !== 'function') {
      res.status(503).json({ ok: false, error: 'tenant_store_unavailable' });
      return false;
    }
    const record = await tenantStore.getAppRecord(user.tenant_slug, appSlug);
    if (!record) {
      res.status(404).json({ ok: false, error: 'app_not_found',
        message: `No app "${appSlug}" found in your tenant.` });
      return false;
    }
    return true;
  }

  // CC-5 cycle 1 — list custom domains for one of the customer's apps.
  app.get('/api/apps/:appSlug/domains', async (req, res) => {
    const user = await authedUserFor(req, res);
    if (!user) return;
    const appSlug = String(req.params.appSlug || '');
    if (!(await ensureAppOwnedByUser(req, res, user, appSlug))) return;
    try {
      const { rows } = await pool.query(
        `SELECT id, domain, expected_cname, status, verified_at, last_checked_at,
                last_error, created_at
         FROM app_domains
         WHERE tenant_slug = $1 AND app_slug = $2 AND status != 'removed'
         ORDER BY created_at DESC`,
        [user.tenant_slug, appSlug]
      );
      return res.json({ ok: true, domains: rows });
    } catch (err) {
      return res.status(500).json({ ok: false, error: 'list_domains_failed', message: err.message });
    }
  });

  // CC-5 cycle 1 — attach a custom domain to one of the customer's apps.
  // Body: { domain }. Normalizes the domain via cloud-domains.normalizeDomain
  // (rejects garbage), computes the expected CNAME target, inserts the
  // pending row. The DNS verification poller (CC-5b) flips status to
  // verified or failed once it's looked up the customer's CNAME records.
  app.post('/api/apps/:appSlug/domains', async (req, res) => {
    const user = await authedUserFor(req, res);
    if (!user) return;
    const appSlug = String(req.params.appSlug || '');
    if (!(await ensureAppOwnedByUser(req, res, user, appSlug))) return;
    const rawDomain = req.body?.domain;
    const domain = normalizeDomain(rawDomain);
    if (!domain) {
      return res.status(400).json({ ok: false, error: 'invalid_domain',
        message: `"${rawDomain}" is not a DNS-valid hostname. Try something like "deals.acme.com".` });
    }
    const expectedCname = expectedCnameFor(appSlug);
    try {
      const { rows } = await pool.query(
        `INSERT INTO app_domains (tenant_slug, app_slug, domain, expected_cname)
         VALUES ($1, $2, $3, $4)
         RETURNING id, domain, expected_cname, status, verified_at, last_checked_at, last_error, created_at`,
        [user.tenant_slug, appSlug, domain, expectedCname]
      );
      return res.status(201).json({ ok: true, domain: rows[0] });
    } catch (err) {
      // 23505 = Postgres unique_violation. Domain already attached somewhere.
      if (err.code === '23505') {
        return res.status(409).json({ ok: false, error: 'domain_taken',
          message: `${domain} is already attached to another app.` });
      }
      return res.status(500).json({ ok: false, error: 'add_domain_failed', message: err.message });
    }
  });

  // CC-5 cycle 1 — soft-delete a custom domain. Marks status='removed' so
  // the audit trail survives but the dashboard, the DNS poller, and the
  // customer's app stop seeing it.
  app.delete('/api/apps/:appSlug/domains/:id', async (req, res) => {
    const user = await authedUserFor(req, res);
    if (!user) return;
    const appSlug = String(req.params.appSlug || '');
    if (!(await ensureAppOwnedByUser(req, res, user, appSlug))) return;
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ ok: false, error: 'invalid_id' });
    }
    try {
      const { rowCount } = await pool.query(
        `UPDATE app_domains SET status = 'removed', updated_at = NOW()
         WHERE id = $1 AND tenant_slug = $2 AND app_slug = $3 AND status != 'removed'`,
        [id, user.tenant_slug, appSlug]
      );
      if (rowCount === 0) {
        return res.status(404).json({ ok: false, error: 'domain_not_found' });
      }
      return res.json({ ok: true });
    } catch (err) {
      return res.status(500).json({ ok: false, error: 'remove_domain_failed', message: err.message });
    }
  });

  // CC-2 cycle 10 — dashboard's app grid. Reads the session cookie, looks
  // up the user's tenant_slug, asks the tenant store for that tenant's
  // deployed apps. Returns {apps: []} with one row per deploy:
  //   {appSlug, scriptName, hostname, deployedAt, latestVersionId}
  // 401 if no session. Empty array if the user has no tenant_slug yet
  // (signup ran before the tenant store was wired) or the tenant has no
  // deploys yet.
  app.get('/api/apps', async (req, res) => {
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
      if (!user.tenant_slug || !tenantStore || typeof tenantStore.listAppsByTenant !== 'function') {
        return res.json({ ok: true, apps: [] });
      }
      const apps = await tenantStore.listAppsByTenant(user.tenant_slug);
      return res.json({ ok: true, apps: Array.isArray(apps) ? apps : [] });
    } catch (err) {
      return res.status(500).json({ ok: false, error: 'apps_failed', message: err.message });
    }
  });

  return { mounted: true };
}

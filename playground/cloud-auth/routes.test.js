// =============================================================================
// CC-2 — Auth routes integration tests
// =============================================================================
// Spin up an Express app with the 4 routes mounted against a pg-mem pool +
// drive the full signup → login → me → logout flow. Tests cover:
//
//   • signup creates a row, sets the session cookie, returns 201 + user
//   • signup rejects missing fields with 400
//   • signup rejects duplicate emails with 409
//   • login with valid creds sets a fresh cookie, returns 200 + user
//   • login with bad creds returns 401 (no enumeration)
//   • me returns 401 when no cookie present
//   • me returns 401 when cookie carries an unknown / revoked token
//   • me returns the user when cookie is valid
//   • logout revokes the session AND sets a Max-Age=0 cookie
//   • when pool is null, every endpoint returns 503 auth_not_configured
//
// Run: node playground/cloud-auth/routes.test.js
// =============================================================================

import express from 'express';
import { newDb } from 'pg-mem';
import path from 'path';
import { fileURLToPath } from 'url';
import { runMigrations } from '../db/migrations.js';
import { mountCloudAuthRoutes, parseCookies, buildSessionCookie, buildClearSessionCookie, SESSION_COOKIE_NAME } from './routes.js';
import { hashPassword } from './index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, '..', 'db', 'migrations');

let passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}`); }
}
async function runAsync(fn) {
  try { await fn(); }
  catch (e) {
    failed++;
    console.log('  ✗ UNHANDLED: ' + (e.message || e) + (e.stack ? '\n' + e.stack : ''));
  }
}

// Build a fresh pg-mem-backed pool and apply both migrations.
async function makePool() {
  const db = newDb();
  const { Pool } = db.adapters.createPg();
  const pool = new Pool();
  await runMigrations(pool, MIGRATIONS_DIR);
  return pool;
}

// Build a fresh app with the 5 routes mounted. Returns { app, pool, tenantStore }.
async function makeApp(opts = {}) {
  const pool = await makePool();
  const app = express();
  app.use(express.json());
  // CC-2 cycle 10 — most tests want a real in-memory tenant store so signup
  // auto-creates a tenant + GET /api/apps can list deploys. Pass
  // `noTenantStore: true` to test the degraded mode.
  let tenantStore = null;
  if (!opts.noTenantStore) {
    const { InMemoryTenantStore } = await import('../tenants.js');
    tenantStore = new InMemoryTenantStore();
  }
  mountCloudAuthRoutes(app, { pool, tenantStore });
  return { app, pool, tenantStore };
}

// Make an HTTP request against the app on a one-shot listener. Returns
// { status, headers, body }. Avoids supertest dep — keeps test surface tiny.
import http from 'http';
function request(app, { method = 'GET', path: urlPath, body, cookie } = {}) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const port = server.address().port;
      const headers = { 'content-type': 'application/json' };
      if (cookie) headers.cookie = cookie;
      const data = body ? JSON.stringify(body) : null;
      if (data) headers['content-length'] = Buffer.byteLength(data);
      const req = http.request({ hostname: '127.0.0.1', port, method, path: urlPath, headers }, (res) => {
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => {
          server.close();
          const text = Buffer.concat(chunks).toString('utf8');
          let parsed = null;
          try { parsed = JSON.parse(text); } catch { /* leave null */ }
          resolve({ status: res.statusCode, headers: res.headers, body: parsed, raw: text });
        });
      });
      req.on('error', err => { server.close(); reject(err); });
      if (data) req.write(data);
      req.end();
    });
  });
}

// Pull the session cookie value out of a Set-Cookie header (or array).
function extractSessionCookie(setCookie) {
  if (!setCookie) return null;
  const headers = Array.isArray(setCookie) ? setCookie : [setCookie];
  for (const h of headers) {
    const match = h.match(new RegExp(`${SESSION_COOKIE_NAME}=([^;]*)`));
    if (match) return match[1];
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n🍪 parseCookies — header parsing');
// ─────────────────────────────────────────────────────────────────────────────

assert(JSON.stringify(parseCookies('a=1; b=2')) === '{"a":"1","b":"2"}',
  'parses a simple two-cookie header');
assert(JSON.stringify(parseCookies('  a = 1 ; b = 2 ')) === '{"a":"1","b":"2"}',
  'tolerates whitespace around names + values');
assert(JSON.stringify(parseCookies('')) === '{}', 'empty header → empty map');
assert(JSON.stringify(parseCookies(null)) === '{}', 'null header → empty map');
assert(parseCookies('clear_session=abc%3Ddef').clear_session === 'abc=def',
  'url-decodes the value');

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n🍪 buildSessionCookie — Set-Cookie format');
// ─────────────────────────────────────────────────────────────────────────────

{
  const c = buildSessionCookie('rawtoken', { secure: false });
  assert(c.includes('clear_session=rawtoken'), 'includes the token');
  assert(c.includes('HttpOnly'), 'sets HttpOnly');
  assert(c.includes('SameSite=Lax'), 'sets SameSite=Lax');
  assert(c.includes('Max-Age=2592000'), 'sets Max-Age to 30 days');
  assert(c.includes('Path=/'), 'sets Path=/');
  assert(!c.includes('Secure'), 'omits Secure when secure=false');
  assert(buildSessionCookie('t').includes('Secure'), 'includes Secure when secure defaults to true');
}

{
  const c = buildClearSessionCookie({ secure: false });
  assert(c.includes('Max-Age=0'), 'clear cookie has Max-Age=0');
  assert(c.includes('clear_session='), 'clear cookie has empty value');
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n🛑 No-pool stub mode — every endpoint returns 503');
// ─────────────────────────────────────────────────────────────────────────────

await runAsync(async () => {
  const app = express();
  app.use(express.json());
  const result = mountCloudAuthRoutes(app, { pool: null });
  assert(result.mounted === false, 'mountCloudAuthRoutes returns { mounted: false } when pool is null');

  for (const [method, path] of [['POST', '/api/auth/signup'], ['POST', '/api/auth/login'],
                                ['GET', '/api/auth/me'], ['POST', '/api/auth/logout']]) {
    const r = await request(app, { method, path, body: method === 'POST' ? {} : undefined });
    assert(r.status === 503, `${method} ${path} → 503 (got ${r.status})`);
    assert(r.body?.error === 'auth_not_configured',
      `${method} ${path} → error=auth_not_configured`);
  }
});

// Stop here if bcryptjs isn't available — every signup/login test depends on it.
let bcryptAvailable = true;
try { await hashPassword('anything12'); }
catch (err) { if (err.message.includes('bcryptjs')) bcryptAvailable = false; }

if (!bcryptAvailable) {
  console.log('\n⏭  Skipping signup/login tests — bcryptjs not installed (run npm install bcryptjs in playground)');
  console.log(`\n${failed === 0 ? '✅' : '❌'} ${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n📝 POST /api/auth/signup');
// ─────────────────────────────────────────────────────────────────────────────

await runAsync(async () => {
  const { app } = await makeApp();
  const r = await request(app, {
    method: 'POST',
    path: '/api/auth/signup',
    body: { email: 'marcus@widgetco.com', password: 'marcuspass123', name: 'Marcus' },
  });
  assert(r.status === 201, `signup → 201 (got ${r.status})`);
  assert(r.body?.ok === true, 'response body has ok=true');
  assert(r.body?.user?.email === 'marcus@widgetco.com', 'returns the user row');
  assert(r.body?.user?.password_hash === undefined, 'never leaks password_hash');
  const cookieToken = extractSessionCookie(r.headers['set-cookie']);
  assert(cookieToken && cookieToken.length === 64, 'sets clear_session cookie with 64-char token');
});

await runAsync(async () => {
  const { app } = await makeApp();
  const r = await request(app, {
    method: 'POST',
    path: '/api/auth/signup',
    body: { email: '', password: 'short', name: '' },
  });
  assert(r.status === 400, `signup with missing fields → 400 (got ${r.status})`);
  assert(r.body?.error === 'missing_fields', 'error=missing_fields');
});

await runAsync(async () => {
  const { app } = await makeApp();
  await request(app, {
    method: 'POST',
    path: '/api/auth/signup',
    body: { email: 'dup@example.com', password: 'pass1234', name: 'Dup' },
  });
  const r = await request(app, {
    method: 'POST',
    path: '/api/auth/signup',
    body: { email: 'dup@example.com', password: 'otherpass', name: 'Other' },
  });
  assert(r.status === 409, `duplicate email → 409 (got ${r.status})`);
  assert(r.body?.message?.includes('already exists'), 'message names the conflict');
});

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n🔐 POST /api/auth/login');
// ─────────────────────────────────────────────────────────────────────────────

await runAsync(async () => {
  const { app } = await makeApp();
  await request(app, {
    method: 'POST', path: '/api/auth/signup',
    body: { email: 'marcus@widgetco.com', password: 'pass1234', name: 'Marcus' },
  });
  const r = await request(app, {
    method: 'POST', path: '/api/auth/login',
    body: { email: 'marcus@widgetco.com', password: 'pass1234' },
  });
  assert(r.status === 200, `login → 200 (got ${r.status})`);
  assert(r.body?.user?.email === 'marcus@widgetco.com', 'returns the user');
  const cookieToken = extractSessionCookie(r.headers['set-cookie']);
  assert(cookieToken && cookieToken.length === 64, 'sets a fresh session cookie on login');
});

await runAsync(async () => {
  const { app } = await makeApp();
  await request(app, {
    method: 'POST', path: '/api/auth/signup',
    body: { email: 'marcus@widgetco.com', password: 'pass1234', name: 'Marcus' },
  });
  const r = await request(app, {
    method: 'POST', path: '/api/auth/login',
    body: { email: 'marcus@widgetco.com', password: 'wrongpass' },
  });
  assert(r.status === 401, `wrong password → 401 (got ${r.status})`);
  assert(r.body?.error === 'login_failed', 'error=login_failed');

  const r2 = await request(app, {
    method: 'POST', path: '/api/auth/login',
    body: { email: 'nobody@example.com', password: 'anything12' },
  });
  assert(r2.status === 401, 'nonexistent user → 401 (same as wrong pw, no enumeration)');
});

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n👤 GET /api/auth/me');
// ─────────────────────────────────────────────────────────────────────────────

await runAsync(async () => {
  const { app } = await makeApp();
  // No cookie → 401
  const r1 = await request(app, { method: 'GET', path: '/api/auth/me' });
  assert(r1.status === 401, `no cookie → 401 (got ${r1.status})`);
  assert(r1.body?.error === 'not_authenticated', 'error=not_authenticated');

  // Bogus cookie → 401
  const r2 = await request(app, {
    method: 'GET', path: '/api/auth/me',
    cookie: `${SESSION_COOKIE_NAME}=bogustoken`,
  });
  assert(r2.status === 401, `bogus cookie → 401 (got ${r2.status})`);
  assert(r2.body?.error === 'session_invalid', 'error=session_invalid');
});

await runAsync(async () => {
  const { app } = await makeApp();
  const signup = await request(app, {
    method: 'POST', path: '/api/auth/signup',
    body: { email: 'marcus@widgetco.com', password: 'pass1234', name: 'Marcus' },
  });
  const cookieToken = extractSessionCookie(signup.headers['set-cookie']);
  const r = await request(app, {
    method: 'GET', path: '/api/auth/me',
    cookie: `${SESSION_COOKIE_NAME}=${cookieToken}`,
  });
  assert(r.status === 200, `valid cookie → 200 (got ${r.status})`);
  assert(r.body?.user?.email === 'marcus@widgetco.com', 'returns the authed user');
});

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n🚪 POST /api/auth/logout');
// ─────────────────────────────────────────────────────────────────────────────

await runAsync(async () => {
  const { app } = await makeApp();
  const signup = await request(app, {
    method: 'POST', path: '/api/auth/signup',
    body: { email: 'marcus@widgetco.com', password: 'pass1234', name: 'Marcus' },
  });
  const cookieToken = extractSessionCookie(signup.headers['set-cookie']);

  // Logout with the cookie
  const r = await request(app, {
    method: 'POST', path: '/api/auth/logout',
    body: {},
    cookie: `${SESSION_COOKIE_NAME}=${cookieToken}`,
  });
  assert(r.status === 200, `logout → 200 (got ${r.status})`);
  assert(r.body?.ok === true, 'logout returns ok=true');
  // Set-Cookie clears the session
  const clearedHeader = (Array.isArray(r.headers['set-cookie']) ? r.headers['set-cookie'] : [r.headers['set-cookie']]).join(';');
  assert(/Max-Age=0/.test(clearedHeader), 'logout sets Max-Age=0 to clear the cookie');

  // The session is now revoked — me should 401
  const after = await request(app, {
    method: 'GET', path: '/api/auth/me',
    cookie: `${SESSION_COOKIE_NAME}=${cookieToken}`,
  });
  assert(after.status === 401, 'session is revoked after logout');
});

// Logout with no cookie still returns 200 (idempotent) and still sends the
// clearing Set-Cookie so any stale browser state gets cleaned up.
await runAsync(async () => {
  const { app } = await makeApp();
  const r = await request(app, { method: 'POST', path: '/api/auth/logout', body: {} });
  assert(r.status === 200, 'logout with no cookie → 200 (idempotent)');
  const clearedHeader = (Array.isArray(r.headers['set-cookie']) ? r.headers['set-cookie'] : [r.headers['set-cookie']]).join(';');
  assert(/Max-Age=0/.test(clearedHeader), 'still sends the clearing Set-Cookie');
});

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n🏷  Signup auto-creates a tenant + writes back tenant_slug');
// ─────────────────────────────────────────────────────────────────────────────

await runAsync(async () => {
  const { app, pool, tenantStore } = await makeApp();
  const r = await request(app, {
    method: 'POST', path: '/api/auth/signup',
    body: { email: 'tenant@widgetco.com', password: 'pass1234', name: 'Tenant Test' },
  });
  assert(r.status === 201, `signup → 201 (got ${r.status})`);
  assert(r.body?.user?.tenant_slug && /^clear-[a-f0-9]{6}$/.test(r.body.user.tenant_slug),
    `tenant_slug auto-assigned with clear-<6hex> shape (got ${r.body?.user?.tenant_slug})`);
  // The slug exists in the tenant store too
  const t = await tenantStore.get(r.body.user.tenant_slug);
  assert(t && t.slug === r.body.user.tenant_slug,
    'tenant row exists in the store with the same slug');
  // And users.tenant_slug is set in the DB
  const dbRow = await pool.query(`SELECT tenant_slug FROM users WHERE id = $1`, [r.body.user.id]);
  assert(dbRow.rows[0]?.tenant_slug === r.body.user.tenant_slug,
    'users.tenant_slug column is set in the DB');
});

await runAsync(async () => {
  // Without a tenant store, signup still succeeds — tenant_slug just stays null
  const { app } = await makeApp({ noTenantStore: true });
  const r = await request(app, {
    method: 'POST', path: '/api/auth/signup',
    body: { email: 'no-tenant@x.com', password: 'pass1234', name: 'NoTenant' },
  });
  assert(r.status === 201, `signup still works without a tenant store (got ${r.status})`);
  assert(r.body?.user?.tenant_slug === null,
    `tenant_slug is null when no tenant store wired (got ${r.body?.user?.tenant_slug})`);
});

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n📋 GET /api/apps');
// ─────────────────────────────────────────────────────────────────────────────

await runAsync(async () => {
  const { app } = await makeApp();
  const r = await request(app, { method: 'GET', path: '/api/apps' });
  assert(r.status === 401, `no cookie → 401 (got ${r.status})`);
  assert(r.body?.error === 'not_authenticated', 'error=not_authenticated');
});

await runAsync(async () => {
  const { app } = await makeApp();
  const r = await request(app, {
    method: 'GET', path: '/api/apps',
    cookie: `${SESSION_COOKIE_NAME}=bogus-token`,
  });
  assert(r.status === 401, `bogus cookie → 401 (got ${r.status})`);
  assert(r.body?.error === 'session_invalid', 'error=session_invalid');
});

await runAsync(async () => {
  // Authed user with no deployed apps → empty array
  const { app } = await makeApp();
  const signup = await request(app, {
    method: 'POST', path: '/api/auth/signup',
    body: { email: 'marcus@widgetco.com', password: 'pass1234', name: 'Marcus' },
  });
  const cookieToken = extractSessionCookie(signup.headers['set-cookie']);
  const r = await request(app, {
    method: 'GET', path: '/api/apps',
    cookie: `${SESSION_COOKIE_NAME}=${cookieToken}`,
  });
  assert(r.status === 200, `valid cookie → 200 (got ${r.status})`);
  assert(r.body?.ok === true, 'ok:true');
  assert(Array.isArray(r.body?.apps) && r.body.apps.length === 0,
    `empty array when no deploys (got ${JSON.stringify(r.body?.apps)})`);
});

await runAsync(async () => {
  // Authed user with one deployed app → that app comes back
  const { app, tenantStore } = await makeApp();
  const signup = await request(app, {
    method: 'POST', path: '/api/auth/signup',
    body: { email: 'marcus@widgetco.com', password: 'pass1234', name: 'Marcus' },
  });
  const cookieToken = extractSessionCookie(signup.headers['set-cookie']);
  const tenantSlug = signup.body.user.tenant_slug;

  // Pretend Marcus deployed an app
  await tenantStore.markAppDeployed({
    tenantSlug, appSlug: 'deal-desk',
    scriptName: tenantSlug + '-deal-desk',
    d1_database_id: 'd1-deal-desk',
    hostname: 'deals.buildclear.dev',
    versionId: 'v-001', sourceHash: 'sh1',
  });

  const r = await request(app, {
    method: 'GET', path: '/api/apps',
    cookie: `${SESSION_COOKIE_NAME}=${cookieToken}`,
  });
  assert(r.status === 200, `200 (got ${r.status})`);
  assert(r.body?.apps?.length === 1, `1 app (got ${r.body?.apps?.length})`);
  assert(r.body.apps[0].appSlug === 'deal-desk', 'appSlug surfaces');
  assert(r.body.apps[0].hostname === 'deals.buildclear.dev', 'hostname surfaces');
  assert(r.body.apps[0].latestVersionId === 'v-001', 'latestVersionId surfaces');
});

await runAsync(async () => {
  // Cross-tenant isolation — other customer's apps don't leak into Marcus's list
  const { app, tenantStore } = await makeApp();
  const marcus = await request(app, {
    method: 'POST', path: '/api/auth/signup',
    body: { email: 'marcus@widgetco.com', password: 'pass1234', name: 'Marcus' },
  });
  const dave = await request(app, {
    method: 'POST', path: '/api/auth/signup',
    body: { email: 'dave@othercorp.com', password: 'pass1234', name: 'Dave' },
  });
  // Dave deploys an app
  await tenantStore.markAppDeployed({
    tenantSlug: dave.body.user.tenant_slug, appSlug: 'lead-router',
    scriptName: 'dave-lead-router', d1_database_id: 'd1', hostname: 'leads.x',
  });
  // Marcus's list should NOT include Dave's app
  const cookieToken = extractSessionCookie(marcus.headers['set-cookie']);
  const r = await request(app, {
    method: 'GET', path: '/api/apps',
    cookie: `${SESSION_COOKIE_NAME}=${cookieToken}`,
  });
  assert(r.status === 200, `marcus list 200 (got ${r.status})`);
  assert(r.body?.apps?.length === 0,
    `marcus sees 0 apps (got ${r.body?.apps?.length}) — cross-tenant isolation`);
});

await runAsync(async () => {
  // Stub mode (no pool) → 503
  const stubApp = express();
  stubApp.use(express.json());
  mountCloudAuthRoutes(stubApp, { pool: null });
  const r = await request(stubApp, { method: 'GET', path: '/api/apps' });
  assert(r.status === 503, `no pool → 503 (got ${r.status})`);
  assert(r.body?.error === 'auth_not_configured', 'auth_not_configured error');
});

console.log(`\n${failed === 0 ? '✅' : '❌'} ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);

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

// Build a fresh app with the 4 routes mounted. Returns { app, pool }.
async function makeApp() {
  const pool = await makePool();
  const app = express();
  app.use(express.json());
  mountCloudAuthRoutes(app, { pool });
  return { app, pool };
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

console.log(`\n${failed === 0 ? '✅' : '❌'} ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);

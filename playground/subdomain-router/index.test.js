// =============================================================================
// CC-1b — Subdomain router tests
// =============================================================================
// Covers extractSubdomain (pure), resolveAppTarget (composes extract +
// lookup), and createRouterMiddleware (full proxy through a local mock
// target). End-to-end Fly internal-DNS proxying requires Phase 85a.
//
// Run: node playground/subdomain-router/index.test.js
// =============================================================================

import {
  extractSubdomain,
  resolveAppTarget,
  createRouterMiddleware,
  getRootDomain,
} from './index.js';
import http from 'http';

// Raw http.request wrapper — fetch() overrides the Host header, which
// the subdomain router keys on, so we can't use fetch for these tests.
function rawRequest(url, { method = 'GET', headers = {}, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = http.request({
      hostname: u.hostname,
      port: u.port,
      path: u.pathname + u.search,
      method,
      headers,
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text: data }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

let passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}`); }
}

console.log('\n🧭 extractSubdomain — pure subdomain parsing\n');

// Happy path — plain subdomain
assert(extractSubdomain('approvals.buildclear.dev') === 'approvals',
  'extracts plain subdomain');
assert(extractSubdomain('acme-approvals.buildclear.dev') === 'acme-approvals',
  'extracts hyphenated subdomain');
assert(extractSubdomain('APPROVALS.BUILDCLEAR.DEV') === 'approvals',
  'case-insensitive; returns lowercase');

// Port stripping
assert(extractSubdomain('approvals.buildclear.dev:8080') === 'approvals',
  'strips port before parsing');
assert(extractSubdomain('approvals.buildclear.dev:443') === 'approvals',
  'strips port 443');

// Null returns
assert(extractSubdomain('buildclear.dev') === null,
  'root domain itself → null (no tenant app at the apex)');
assert(extractSubdomain('www.buildclear.dev') === null,
  'www is reserved for marketing — not a tenant');
assert(extractSubdomain('api.buildclear.dev') === null,
  'api is reserved for admin plane');
assert(extractSubdomain('nested.app.buildclear.dev') === null,
  'nested subdomains not supported yet');
assert(extractSubdomain('some-other-domain.com') === null,
  'wrong domain entirely → null');
assert(extractSubdomain('') === null, 'empty Host → null');
assert(extractSubdomain(null) === null, 'null Host → null');
assert(extractSubdomain(undefined) === null, 'undefined Host → null');
assert(extractSubdomain(42) === null, 'non-string Host → null');

// Root override
assert(extractSubdomain('myapp.staging.dev', 'staging.dev') === 'myapp',
  'root override works for staging');
assert(extractSubdomain('myapp.staging.dev', 'production.dev') === null,
  'root mismatch → null');

// getRootDomain + env override
{
  const origRoot = process.env.CLEAR_CLOUD_ROOT_DOMAIN;
  delete process.env.CLEAR_CLOUD_ROOT_DOMAIN;
  assert(getRootDomain() === 'buildclear.dev', 'default root is buildclear.dev');
  process.env.CLEAR_CLOUD_ROOT_DOMAIN = 'clear.example';
  assert(getRootDomain() === 'clear.example', 'env override changes root');
  if (origRoot === undefined) delete process.env.CLEAR_CLOUD_ROOT_DOMAIN;
  else process.env.CLEAR_CLOUD_ROOT_DOMAIN = origRoot;
}

console.log('\n🔎 resolveAppTarget — extract + lookup\n');

// Happy path
{
  const lookup = async (sub) => sub === 'acme-approvals' ? {
    id: 42, tenant_id: 7, subdomain: 'acme-approvals', fly_app_name: 'fly-acme-approvals',
    status: 'active', tenant_status: 'active', tenant_plan: 'team',
  } : null;
  const r = await resolveAppTarget('acme-approvals.buildclear.dev', lookup);
  assert(r.ok === true, `ok=true on valid subdomain (got ${JSON.stringify(r).slice(0, 120)})`);
  assert(r.target.appId === 42 && r.target.tenantId === 7,
    'target carries app + tenant ids');
  assert(r.target.flyAppName === 'fly-acme-approvals',
    'target carries fly app name for Fly internal DNS');
  assert(r.target.plan === 'team', 'target carries tenant plan (for quota checks)');
  assert(r.target.url.startsWith('http://fly-acme-approvals.internal:'),
    `target url uses {fly_app_name}.internal pattern (got ${r.target.url})`);
}

// Subdomain not found → 404
{
  const lookup = async () => null;
  const r = await resolveAppTarget('ghost.buildclear.dev', lookup);
  assert(r.ok === false && r.status === 404 && r.reason.includes('not found'),
    `unknown subdomain returns 404 (got ${JSON.stringify(r)})`);
  assert(r.subdomain === 'ghost',
    'response carries the attempted subdomain for observability');
}

// Unparseable subdomain → 400
{
  const lookup = async () => { throw new Error('should not be called'); };
  const r = await resolveAppTarget('some-other-domain.com', lookup);
  assert(r.ok === false && r.status === 400,
    `non-matching host returns 400 (got status ${r.status})`);
}

// Tenant-DB throws → 502
{
  const lookup = async () => { throw new Error('connection refused'); };
  const r = await resolveAppTarget('x.buildclear.dev', lookup);
  assert(r.ok === false && r.status === 502,
    `lookup throws → 502 (got ${r.status})`);
  assert(r.reason.includes('tenants-db lookup failed'),
    'reason names the failing layer');
}

// Frozen tenant → 403
{
  const lookup = async () => ({
    id: 1, tenant_id: 1, subdomain: 'x', fly_app_name: 'fly-x',
    status: 'active', tenant_status: 'frozen',
  });
  const r = await resolveAppTarget('x.buildclear.dev', lookup);
  assert(r.ok === false && r.status === 403 && r.reason.includes('frozen'),
    `frozen tenant → 403 naming the state (got ${JSON.stringify(r)})`);
}

// Paused app → 403
{
  const lookup = async () => ({
    id: 1, tenant_id: 1, subdomain: 'x', fly_app_name: 'fly-x',
    status: 'paused', tenant_status: 'active',
  });
  const r = await resolveAppTarget('x.buildclear.dev', lookup);
  assert(r.ok === false && r.status === 403 && r.reason.includes('paused'),
    `paused app → 403 naming the state (got ${JSON.stringify(r)})`);
}

// Missing fly_app_name → 502 (deploy half-configured)
{
  const lookup = async () => ({
    id: 1, tenant_id: 1, subdomain: 'x', fly_app_name: null,
    status: 'active', tenant_status: 'active',
  });
  const r = await resolveAppTarget('x.buildclear.dev', lookup);
  assert(r.ok === false && r.status === 502,
    `missing fly_app_name → 502 (got ${r.status})`);
}

// Target URL templating via env overrides
{
  const origHost = process.env.CLEAR_CLOUD_TARGET_HOST;
  const origPort = process.env.CLEAR_CLOUD_TARGET_PORT;
  const origScheme = process.env.CLEAR_CLOUD_TARGET_SCHEME;
  process.env.CLEAR_CLOUD_TARGET_HOST = 'localhost';
  process.env.CLEAR_CLOUD_TARGET_PORT = '3999';
  process.env.CLEAR_CLOUD_TARGET_SCHEME = 'http';
  const lookup = async () => ({
    id: 1, tenant_id: 1, subdomain: 'local', fly_app_name: 'irrelevant-in-dev',
    status: 'active', tenant_status: 'active',
  });
  const r = await resolveAppTarget('local.buildclear.dev', lookup);
  assert(r.ok && r.target.url === 'http://localhost:3999',
    `env overrides flatten target URL for local dev (got ${r.target.url})`);
  if (origHost === undefined) delete process.env.CLEAR_CLOUD_TARGET_HOST;
  else process.env.CLEAR_CLOUD_TARGET_HOST = origHost;
  if (origPort === undefined) delete process.env.CLEAR_CLOUD_TARGET_PORT;
  else process.env.CLEAR_CLOUD_TARGET_PORT = origPort;
  if (origScheme === undefined) delete process.env.CLEAR_CLOUD_TARGET_SCHEME;
  else process.env.CLEAR_CLOUD_TARGET_SCHEME = origScheme;
}

// =============================================================================
// CC-4 cycle 3 — Cloudflare-target arm in resolveAppTarget
// =============================================================================
console.log('\n☁️  resolveAppTarget — Cloudflare-target arm (CC-4 cycle 3)\n');

// CF-shaped row + CLEAR_CLOUD_CF_PROXY=1 → ok with public CF URL
{
  const origProxy = process.env.CLEAR_CLOUD_CF_PROXY;
  process.env.CLEAR_CLOUD_CF_PROXY = '1';
  const lookup = async (sub) => sub === 'deal-desk' ? {
    id: 99, tenant_id: 7, subdomain: 'deal-desk',
    scriptName: 'deal-desk', d1_database_id: 'd1-fake',
    hostname: 'deal-desk.buildclear.dev',
    status: 'active', tenant_status: 'active', tenant_plan: 'pro',
  } : null;
  const r = await resolveAppTarget('deal-desk.buildclear.dev', lookup);
  assert(r.ok === true,
    `CF row + proxy env=1 → ok=true (got ${JSON.stringify(r).slice(0, 160)})`);
  assert(r.target.backend === 'cloudflare',
    `target.backend === 'cloudflare' (got ${r.target.backend})`);
  assert(r.target.scriptName === 'deal-desk',
    `target.scriptName preserved (got ${r.target.scriptName})`);
  assert(r.target.hostname === 'deal-desk.buildclear.dev',
    `target.hostname preserved (got ${r.target.hostname})`);
  assert(r.target.url === 'https://deal-desk.buildclear.dev',
    `target.url is the public CF edge URL (got ${r.target.url})`);
  assert(r.target.subdomain === 'deal-desk',
    `target.subdomain set (got ${r.target.subdomain})`);
  if (origProxy === undefined) delete process.env.CLEAR_CLOUD_CF_PROXY;
  else process.env.CLEAR_CLOUD_CF_PROXY = origProxy;
}

// CF-shaped row + no proxy env → 502 with helpful message
{
  const origProxy = process.env.CLEAR_CLOUD_CF_PROXY;
  delete process.env.CLEAR_CLOUD_CF_PROXY;
  const lookup = async () => ({
    id: 99, tenant_id: 7, subdomain: 'deal-desk',
    scriptName: 'deal-desk', d1_database_id: 'd1-fake',
    hostname: 'deal-desk.buildclear.dev',
    status: 'active', tenant_status: 'active',
  });
  const r = await resolveAppTarget('deal-desk.buildclear.dev', lookup);
  assert(r.ok === false && r.status === 502,
    `CF row without proxy env → 502 (got status ${r.status})`);
  assert(/cloudflare-deployed app — set CLEAR_CLOUD_CF_PROXY=1/i.test(r.reason),
    `reason explains how to opt-in (got ${JSON.stringify(r.reason)})`);
  assert(/dev mode only/i.test(r.reason) && /do not use in production/i.test(r.reason),
    `reason warns against production use (got ${JSON.stringify(r.reason)})`);
  if (origProxy !== undefined) process.env.CLEAR_CLOUD_CF_PROXY = origProxy;
}

// CF env value other than '1' (e.g. 'true', '0') → still 502 (strict equality gate)
{
  const origProxy = process.env.CLEAR_CLOUD_CF_PROXY;
  process.env.CLEAR_CLOUD_CF_PROXY = 'true';
  const lookup = async () => ({
    id: 99, tenant_id: 7, subdomain: 'deal-desk',
    scriptName: 'deal-desk', hostname: 'deal-desk.buildclear.dev',
    status: 'active', tenant_status: 'active',
  });
  const r = await resolveAppTarget('deal-desk.buildclear.dev', lookup);
  assert(r.ok === false && r.status === 502,
    `proxy env='true' (truthy but not '1') still → 502 (got status ${r.status})`);
  if (origProxy === undefined) delete process.env.CLEAR_CLOUD_CF_PROXY;
  else process.env.CLEAR_CLOUD_CF_PROXY = origProxy;
}

// Existing Fly-shaped row → unchanged (regression test)
{
  const origProxy = process.env.CLEAR_CLOUD_CF_PROXY;
  // Set proxy env to verify the Fly arm still wins for Fly-shaped rows
  // (the CF arm only fires when scriptName + hostname are both present).
  process.env.CLEAR_CLOUD_CF_PROXY = '1';
  const lookup = async () => ({
    id: 1, tenant_id: 1, subdomain: 'flyapp', fly_app_name: 'fly-flyapp',
    status: 'active', tenant_status: 'active', tenant_plan: 'team',
  });
  const r = await resolveAppTarget('flyapp.buildclear.dev', lookup);
  assert(r.ok === true,
    `Fly-shaped row still resolves (got ${JSON.stringify(r).slice(0, 120)})`);
  assert(r.target.backend === 'fly',
    `Fly row → backend === 'fly' (got ${r.target.backend})`);
  assert(r.target.flyAppName === 'fly-flyapp',
    `Fly row preserves flyAppName (got ${r.target.flyAppName})`);
  assert(r.target.url.startsWith('http://fly-flyapp.internal:'),
    `Fly row builds internal URL (got ${r.target.url})`);
  if (origProxy === undefined) delete process.env.CLEAR_CLOUD_CF_PROXY;
  else process.env.CLEAR_CLOUD_CF_PROXY = origProxy;
}

// Orphan row (neither fly_app_name nor scriptName) → still 502 (existing behavior)
{
  const origProxy = process.env.CLEAR_CLOUD_CF_PROXY;
  process.env.CLEAR_CLOUD_CF_PROXY = '1';  // even with proxy on, an orphan is an orphan
  const lookup = async () => ({
    id: 1, tenant_id: 1, subdomain: 'orphan',
    fly_app_name: null, scriptName: null, hostname: null,
    status: 'active', tenant_status: 'active',
  });
  const r = await resolveAppTarget('orphan.buildclear.dev', lookup);
  assert(r.ok === false && r.status === 502,
    `orphan row (no CF, no Fly) → 502 (got status ${r.status})`);
  assert(/no fly_app_name/i.test(r.reason),
    `orphan reason mentions fly_app_name (got ${JSON.stringify(r.reason)})`);
  if (origProxy === undefined) delete process.env.CLEAR_CLOUD_CF_PROXY;
  else process.env.CLEAR_CLOUD_CF_PROXY = origProxy;
}

// CF row missing hostname (partial CF data) → falls through to Fly check → 502
{
  const origProxy = process.env.CLEAR_CLOUD_CF_PROXY;
  process.env.CLEAR_CLOUD_CF_PROXY = '1';
  const lookup = async () => ({
    id: 1, tenant_id: 1, subdomain: 'half-cf',
    scriptName: 'half-cf', hostname: null,  // missing — half-configured
    fly_app_name: null,
    status: 'active', tenant_status: 'active',
  });
  const r = await resolveAppTarget('half-cf.buildclear.dev', lookup);
  assert(r.ok === false && r.status === 502,
    `CF row missing hostname → 502 (got status ${r.status})`);
  if (origProxy === undefined) delete process.env.CLEAR_CLOUD_CF_PROXY;
  else process.env.CLEAR_CLOUD_CF_PROXY = origProxy;
}

console.log('\n🛤  createRouterMiddleware — full proxy flow\n');

// Spin up a mock target that echoes its view of the request
const mockTarget = http.createServer((req, res) => {
  let body = '';
  req.on('data', c => body += c);
  req.on('end', () => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      method: req.method,
      url: req.url,
      host: req.headers.host,
      forwardedHost: req.headers['x-forwarded-host'],
      body: body || null,
      seenHeader: req.headers['x-custom-test'] || null,
    }));
  });
});
await new Promise(r => mockTarget.listen(0, '127.0.0.1', r));
const mockPort = mockTarget.address().port;

// Set target env to point at mock for this block
process.env.CLEAR_CLOUD_TARGET_HOST = '127.0.0.1';
process.env.CLEAR_CLOUD_TARGET_PORT = String(mockPort);
process.env.CLEAR_CLOUD_TARGET_SCHEME = 'http';

// Throw-away required: createRouterMiddleware validates opts
{
  let threw = false;
  try { createRouterMiddleware({}); } catch (err) { threw = err.message.includes('lookupApp'); }
  assert(threw, 'createRouterMiddleware throws if opts.lookupApp missing');
}

// Happy path — forward request, verify mock sees it
{
  const lookup = async (sub) => sub === 'myapp' ? {
    id: 1, tenant_id: 1, subdomain: 'myapp', fly_app_name: 'fly-myapp',
    status: 'active', tenant_status: 'active', tenant_plan: 'free',
  } : null;
  const middleware = createRouterMiddleware({ lookupApp: lookup });

  // Spin up a router HTTP server that uses the middleware
  const routerServer = http.createServer((req, res) => middleware(req, res));
  await new Promise(r => routerServer.listen(0, '127.0.0.1', r));
  const routerPort = routerServer.address().port;

  const resp = await rawRequest(`http://127.0.0.1:${routerPort}/api/hello?x=1`, {
    method: 'POST',
    headers: { 'Host': 'myapp.buildclear.dev', 'x-custom-test': 'yes', 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: 'router' }),
  });
  assert(resp.status === 200, `proxied request returns 200 (got ${resp.status})`);
  const payload = JSON.parse(resp.text);
  assert(payload.method === 'POST', 'mock target saw POST method');
  assert(payload.url === '/api/hello?x=1',
    `mock target saw correct path+query (got ${payload.url})`);
  assert(payload.body === '{"from":"router"}',
    `mock target received request body (got ${payload.body})`);
  assert(payload.forwardedHost === 'myapp.buildclear.dev',
    `X-Forwarded-Host set to original Host (got ${payload.forwardedHost})`);
  assert(payload.seenHeader === 'yes',
    'arbitrary custom headers forwarded through');
  await new Promise(r => routerServer.close(r));
}

// Unknown subdomain → 404 (no next handler)
{
  const lookup = async () => null;
  const middleware = createRouterMiddleware({ lookupApp: lookup });
  const routerServer = http.createServer((req, res) => middleware(req, res));
  await new Promise(r => routerServer.listen(0, '127.0.0.1', r));
  const routerPort = routerServer.address().port;
  const resp = await rawRequest(`http://127.0.0.1:${routerPort}/`, {
    headers: { 'Host': 'ghost.buildclear.dev' },
  });
  assert(resp.status === 404,
    `unknown subdomain → 404 when no next handler (got ${resp.status})`);
  await new Promise(r => routerServer.close(r));
}

// onResolved + onError hooks fire
{
  const resolutions = [];
  const errors = [];
  const lookup = async (sub) => sub === 'alive' ? {
    id: 1, tenant_id: 1, subdomain: 'alive', fly_app_name: 'fly-alive',
    status: 'active', tenant_status: 'active',
  } : null;
  const middleware = createRouterMiddleware({
    lookupApp: lookup,
    onResolved: (req, r) => resolutions.push(r.ok),
    onError: (req, r) => errors.push(r.reason),
  });
  const routerServer = http.createServer((req, res) => middleware(req, res));
  await new Promise(r => routerServer.listen(0, '127.0.0.1', r));
  const routerPort = routerServer.address().port;
  await rawRequest(`http://127.0.0.1:${routerPort}/`, { headers: { 'Host': 'alive.buildclear.dev' } });
  await rawRequest(`http://127.0.0.1:${routerPort}/`, { headers: { 'Host': 'dead.buildclear.dev' } });
  assert(resolutions.length === 2, `onResolved fires for every request (got ${resolutions.length})`);
  assert(resolutions.includes(true) && resolutions.includes(false),
    'onResolved sees both success + failure');
  assert(errors.length === 1 && errors[0].includes('not found'),
    `onError fires once (for the 404), reason surfaced (got ${JSON.stringify(errors)})`);
  await new Promise(r => routerServer.close(r));
}

// next() delegation — when caller wants non-tenant traffic to fall through
{
  const lookup = async () => null;
  const middleware = createRouterMiddleware({ lookupApp: lookup });
  let fellThrough = false;
  const routerServer = http.createServer(async (req, res) => {
    await middleware(req, res, () => {
      fellThrough = true;
      res.statusCode = 200;
      res.end('fallback handler');
    });
  });
  await new Promise(r => routerServer.listen(0, '127.0.0.1', r));
  const routerPort = routerServer.address().port;
  const resp = await rawRequest(`http://127.0.0.1:${routerPort}/`, {
    headers: { 'Host': 'unknown.buildclear.dev' },
  });
  assert(resp.status === 200 && resp.text === 'fallback handler' && fellThrough,
    'next() fallback handler runs when middleware can\'t route');
  await new Promise(r => routerServer.close(r));
}

// Cleanup
await new Promise(r => mockTarget.close(r));
delete process.env.CLEAR_CLOUD_TARGET_HOST;
delete process.env.CLEAR_CLOUD_TARGET_PORT;
delete process.env.CLEAR_CLOUD_TARGET_SCHEME;

console.log(`\n${failed === 0 ? '✅' : '❌'} ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);

// =============================================================================
// CC-1 — Cloud routing wiring helper tests
// =============================================================================
// Covers isCloudRoutingEnabled (pure env gate) and mountCloudRouting (the
// composer that wires subdomain-router onto an Express app when the gate
// is open). End-to-end traffic flow is already covered by the existing
// subdomain-router tests; this file is the wiring contract.
//
// Run: node playground/cloud-routing/index.test.js
// =============================================================================

import { isCloudRoutingEnabled, mountCloudRouting } from './index.js';
import { InMemoryTenantStore } from '../tenants.js';

let passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; console.log('  ✅ ' + msg); }
  else { failed++; console.log('  ❌ ' + msg); }
}

// Minimal app stub — capture .use calls. Don't pull in Express here; the
// helper only depends on the .use shape and that's the contract we want
// to lock in.
function makeAppStub() {
  const calls = [];
  return {
    calls,
    use: (...args) => { calls.push(args); },
  };
}

console.log('\n🧭 isCloudRoutingEnabled — env gate');
assert(isCloudRoutingEnabled({ CLEAR_CLOUD_MODE: '1' }) === true,
  "CLEAR_CLOUD_MODE='1' opens the gate");
assert(isCloudRoutingEnabled({}) === false, 'unset env keeps the gate closed');
assert(isCloudRoutingEnabled({ CLEAR_CLOUD_MODE: '0' }) === false, "'0' keeps it closed");
assert(isCloudRoutingEnabled({ CLEAR_CLOUD_MODE: 'true' }) === false,
  "only literal '1' enables — fail-closed on typos");

console.log('\n🧭 mountCloudRouting — wires when env is set');
{
  const app = makeAppStub();
  const store = new InMemoryTenantStore();
  const mounted = mountCloudRouting(app, { store, env: { CLEAR_CLOUD_MODE: '1' } });
  assert(mounted === true, 'returns true when mounted');
  assert(app.calls.length === 1, 'mounts exactly one middleware');
  assert(typeof app.calls[0][0] === 'function', 'mounted argument is a function (Express middleware)');
}

console.log('\n🧭 mountCloudRouting — skips when env is unset');
{
  const app = makeAppStub();
  const store = new InMemoryTenantStore();
  const mounted = mountCloudRouting(app, { store, env: {} });
  assert(mounted === false, 'returns false when skipped');
  assert(app.calls.length === 0, 'no middleware mounted on the app');
}

console.log('\n🧭 mountCloudRouting — guards inputs');
{
  let threw = null;
  try { mountCloudRouting(null, { store: new InMemoryTenantStore() }); }
  catch (e) { threw = e; }
  assert(threw && /app.*Express/.test(threw.message), 'rejects null app with a hint');
}
{
  const app = makeAppStub();
  let threw = null;
  try { mountCloudRouting(app, { store: {} }); }
  catch (e) { threw = e; }
  assert(threw && /lookupAppBySubdomain/.test(threw.message),
    'rejects a store missing lookupAppBySubdomain');
}

console.log('\n🧭 mountCloudRouting — lookup wires through to the store');
{
  // The point of this test: when the middleware is mounted, the lookup
  // function it gets passed actually calls store.lookupAppBySubdomain.
  // We don't drive HTTP traffic here — the subdomain-router has its own
  // tests for that — but we DO verify that the lookup function the
  // helper builds talks to the store we passed in.
  const store = new InMemoryTenantStore();
  await store.markAppDeployed({
    tenantSlug: 'acme', appSlug: 'deals',
    scriptName: 'acme-deals',
    d1_database_id: 'd1',
    hostname: 'acme-deals.buildclear.dev',
  });

  // Spy on store.lookupAppBySubdomain so we can confirm it was called.
  let lookedUp = null;
  const origLookup = store.lookupAppBySubdomain.bind(store);
  store.lookupAppBySubdomain = async (sub) => { lookedUp = sub; return origLookup(sub); };

  // Build a one-off Express-shaped app so we can grab the middleware
  // function the helper mounts and invoke it directly.
  let mounted;
  const app = { use: (mw) => { mounted = mw; } };
  mountCloudRouting(app, { store, env: { CLEAR_CLOUD_MODE: '1' } });

  // The mounted middleware will try to extract a subdomain from req.headers.host
  // and call lookupApp with it. Drive a fake req that triggers the lookup,
  // then short-circuit response writes via a stub res.
  const req = { headers: { host: 'acme-deals.buildclear.dev' }, url: '/' };
  let nextCalled = false;
  const res = {
    statusCode: 0, headersSent: false,
    setHeader: () => {}, end: () => {},
  };
  // Wait for the middleware's async work — it tries a proxy after the
  // lookup, which fails because there's no real Fly target. That's fine:
  // the lookup itself is what we're locking in. We give it 200ms then
  // assert.
  await mounted(req, res, () => { nextCalled = true; });
  await new Promise(r => setTimeout(r, 50));
  assert(lookedUp === 'acme-deals',
    "middleware calls store.lookupAppBySubdomain with the extracted subdomain");
}

console.log(`\n${failed === 0 ? '✅' : '❌'} ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);

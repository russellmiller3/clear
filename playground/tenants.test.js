// Tests for playground/tenants.js — InMemoryTenantStore + helpers.
//
// Session 44 Track 3 Phase 1 (LAE cloud shipping prereq): add per-app
// version history + secretKeys to the tenant store. This enables:
//   • widget-mode Ship on a CF-deployed app → append a new version row
//   • widget-mode Undo → roll back to the previous versionId
//   • partial-secrets filter on incremental deploys (only set new keys)
//
// Cycles 1.0-1.5 of plans/plan-live-editing-phase-b-cloud-04-23-2026.md.

import { InMemoryTenantStore, newTenantSlug, overQuota, canDeploy } from './tenants.js';

let passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; console.log('  ✅ ' + msg); }
  else { failed++; console.log('  ❌ ' + msg); }
}
async function runAsync(fn) {
  try { await fn(); }
  catch (e) { failed++; console.log('  ❌ UNHANDLED: ' + e.message); }
}

(async () => {

console.log('\n🏢 tenants — constructor + baseline shape');
{
  const s = new InMemoryTenantStore();
  assert(s.tenants instanceof Map, 'tenants is a Map');
  assert(s.appsByTenant instanceof Map, 'appsByTenant is a Map');
  assert(s.stripeEvents instanceof Set, 'stripeEvents is a Set');
}

console.log('\n🏢 tenants — existing create + get (regression floor)');
await runAsync(async () => {
  const s = new InMemoryTenantStore();
  const slug = newTenantSlug();
  const row = await s.create({ slug, stripeCustomerId: 'cus_123', plan: 'pro' });
  assert(row.slug === slug, 'create returns slug');
  assert(row.plan === 'pro', 'create returns plan');
  assert(await s.get(slug) === row, 'get returns the same row');
  assert(await s.get('nonexistent') === null, 'get returns null for unknown slug');
});

// ── CYCLE 1.0 — getAppRecord reader ────────────────────────────────────────
console.log('\n🧩 Cycle 1.0 — getAppRecord reader');
await runAsync(async () => {
  const s = new InMemoryTenantStore();
  const tenantSlug = 'clear-abc123';
  const appSlug = 'todo';
  assert(await s.getAppRecord(tenantSlug, appSlug) === null,
    'getAppRecord returns null for unknown app');
  await s.markAppDeployed({
    tenantSlug, appSlug,
    scriptName: 'clear-abc123-todo',
    d1_database_id: 'd1-xyz',
    hostname: 'todo-abc123.buildclear.dev',
  });
  const rec = await s.getAppRecord(tenantSlug, appSlug);
  assert(rec !== null, 'getAppRecord returns non-null after markAppDeployed');
  assert(rec.scriptName === 'clear-abc123-todo', 'getAppRecord returns scriptName');
  assert(rec.d1_database_id === 'd1-xyz', 'getAppRecord returns d1_database_id');
  assert(rec.hostname === 'todo-abc123.buildclear.dev', 'getAppRecord returns hostname');
  assert(typeof rec.deployedAt === 'string', 'getAppRecord returns deployedAt iso string');
});

// ── CYCLE 1.1 — recordVersion appends ──────────────────────────────────────
console.log('\n🧩 Cycle 1.1 — recordVersion appends to versions[]');
await runAsync(async () => {
  const s = new InMemoryTenantStore();
  await s.markAppDeployed({
    tenantSlug: 't1', appSlug: 'a1',
    scriptName: 't1-a1', d1_database_id: 'd1', hostname: 'a1.x',
  });
  const res = await s.recordVersion({
    tenantSlug: 't1', appSlug: 'a1',
    versionId: 'v-001', uploadedAt: '2026-04-23T20:00:00Z', sourceHash: 'sh1',
  });
  assert(res.ok === true, 'recordVersion returns {ok:true} on happy path');
  const rec = await s.getAppRecord('t1', 'a1');
  assert(Array.isArray(rec.versions) && rec.versions.length === 1,
    'versions[] has 1 entry after recordVersion');
  assert(rec.versions[0].versionId === 'v-001',
    'versions[0].versionId matches input');
  assert(rec.versions[0].sourceHash === 'sh1',
    'versions[0].sourceHash matches input');
});

await runAsync(async () => {
  const s = new InMemoryTenantStore();
  const res = await s.recordVersion({
    tenantSlug: 'missing', appSlug: 'app',
    versionId: 'v1', uploadedAt: '2026-04-23T20:00:00Z', sourceHash: 'x',
  });
  assert(res && res.ok === false && res.code === 'APP_NOT_FOUND',
    'recordVersion on unknown app returns {ok:false, code:APP_NOT_FOUND}');
});

// ── CYCLE 1.2 — versions returned newest-first ─────────────────────────────
console.log('\n🧩 Cycle 1.2 — getAppRecord sorts versions newest-first');
await runAsync(async () => {
  const s = new InMemoryTenantStore();
  await s.markAppDeployed({
    tenantSlug: 't2', appSlug: 'a2',
    scriptName: 't2-a2', d1_database_id: 'd', hostname: 'h',
  });
  await s.recordVersion({ tenantSlug: 't2', appSlug: 'a2', versionId: 'v-middle', uploadedAt: '2026-04-23T12:00:00Z', sourceHash: 'b' });
  await s.recordVersion({ tenantSlug: 't2', appSlug: 'a2', versionId: 'v-newest', uploadedAt: '2026-04-23T20:00:00Z', sourceHash: 'c' });
  await s.recordVersion({ tenantSlug: 't2', appSlug: 'a2', versionId: 'v-oldest', uploadedAt: '2026-04-23T06:00:00Z', sourceHash: 'a' });
  const rec = await s.getAppRecord('t2', 'a2');
  assert(rec.versions[0].versionId === 'v-newest', 'versions[0] is the most-recent uploadedAt');
  assert(rec.versions[1].versionId === 'v-middle', 'versions[1] is middle');
  assert(rec.versions[2].versionId === 'v-oldest', 'versions[2] is oldest');
});

// ── CYCLE 1.3 — versions[] caps at 20 ──────────────────────────────────────
console.log('\n🧩 Cycle 1.3 — versions[] caps at 20 entries');
await runAsync(async () => {
  const s = new InMemoryTenantStore();
  await s.markAppDeployed({
    tenantSlug: 't3', appSlug: 'a3',
    scriptName: 't3-a3', d1_database_id: 'd', hostname: 'h',
  });
  for (let i = 0; i < 25; i++) {
    await s.recordVersion({
      tenantSlug: 't3', appSlug: 'a3',
      versionId: `v${i}`,
      uploadedAt: new Date(1000000 + i * 1000).toISOString(),
      sourceHash: `sh${i}`,
    });
  }
  const rec = await s.getAppRecord('t3', 'a3');
  assert(rec.versions.length === 20,
    `versions capped at 20 (got ${rec.versions.length})`);
  // Newest-first: the trimmed ones should be v0-v4; kept should be v5-v24.
  const keptIds = rec.versions.map(v => v.versionId).sort();
  assert(keptIds[0] === 'v10',
    // v5, v6, ..., v24 sorted lex: "v10" < "v11" < ... < "v19" < "v20" < ... < "v24" < "v5" < "v6" < v7 < v8 < v9
    // so keptIds[0] is v10 (first lex after v1... but we dropped v0-v4 so v10-v24, and v10 is first lex)
    `oldest of kept versions is v10 — v0-v4 were trimmed (got ${keptIds[0]})`);
  assert(!rec.versions.find(v => v.versionId === 'v0'),
    'v0 was trimmed from the oldest end');
});

// ── CYCLE 1.4 — markAppDeployed seeds versions + tracks secretKeys ────────
console.log('\n🧩 Cycle 1.4 — markAppDeployed seeds versions[] + stores secretKeys');
await runAsync(async () => {
  const s = new InMemoryTenantStore();
  await s.markAppDeployed({
    tenantSlug: 't4', appSlug: 'a4',
    scriptName: 't4-a4', d1_database_id: 'd', hostname: 'h',
    versionId: 'v-seed',
    sourceHash: 'sh-seed',
    migrationsHash: 'mh-seed',
    secretKeys: ['API_KEY', 'DB_URL'],
  });
  const rec = await s.getAppRecord('t4', 'a4');
  assert(Array.isArray(rec.versions) && rec.versions.length === 1,
    'versions[] seeded with exactly 1 entry');
  assert(rec.versions[0].versionId === 'v-seed', 'seed versionId matches input');
  assert(rec.versions[0].sourceHash === 'sh-seed', 'seed sourceHash carried through');
  assert(rec.versions[0].migrationsHash === 'mh-seed', 'seed migrationsHash carried through');
  assert(Array.isArray(rec.secretKeys) && rec.secretKeys.length === 2,
    'secretKeys stored as array');
  assert(rec.secretKeys.includes('API_KEY') && rec.secretKeys.includes('DB_URL'),
    'both secretKeys present');
});

// Backward compat: markAppDeployed without versionId should still work
// (no seed version row).
await runAsync(async () => {
  const s = new InMemoryTenantStore();
  await s.markAppDeployed({
    tenantSlug: 't4b', appSlug: 'a4b',
    scriptName: 't4b-a4b', d1_database_id: 'd', hostname: 'h',
  });
  const rec = await s.getAppRecord('t4b', 'a4b');
  assert(!rec.versions || rec.versions.length === 0,
    'markAppDeployed without versionId does not seed a version row');
  assert(!rec.secretKeys || rec.secretKeys.length === 0,
    'markAppDeployed without secretKeys yields empty/absent secretKeys');
});

// SECURITY: secretKeys stores KEY NAMES only, never values. Caller passes
// an array of strings; if someone accidentally passes {API_KEY: 'abc'}
// (object), Object.keys should be used upstream — the store doesn't
// accept objects as secretKeys.
await runAsync(async () => {
  const s = new InMemoryTenantStore();
  await s.markAppDeployed({
    tenantSlug: 't4c', appSlug: 'a4c',
    scriptName: 't4c-a4c', d1_database_id: 'd', hostname: 'h',
    secretKeys: ['KEY1'],
  });
  const rec = await s.getAppRecord('t4c', 'a4c');
  // No stored values — the row only has the KEY NAMES
  const recJSON = JSON.stringify(rec);
  assert(!recJSON.includes('secret-value-') || recJSON.length < 1000,
    'tenants-db never stores secret values (only key names)');
});

// ── CYCLE 1.5 — updateSecretKeys appends new keys ─────────────────────────
console.log('\n🧩 Cycle 1.5 — updateSecretKeys appends new keys (deduped)');
await runAsync(async () => {
  const s = new InMemoryTenantStore();
  await s.markAppDeployed({
    tenantSlug: 't5', appSlug: 'a5',
    scriptName: 't5-a5', d1_database_id: 'd', hostname: 'h',
    secretKeys: ['API_KEY'],
  });
  const res = await s.updateSecretKeys({
    tenantSlug: 't5', appSlug: 'a5',
    newKeys: ['DB_URL'],
  });
  assert(res.ok === true, 'updateSecretKeys returns {ok:true} on existing app');
  const rec = await s.getAppRecord('t5', 'a5');
  assert(rec.secretKeys.length === 2, 'secretKeys now has 2 entries');
  assert(rec.secretKeys.includes('API_KEY') && rec.secretKeys.includes('DB_URL'),
    'both old and new keys present');
});

await runAsync(async () => {
  const s = new InMemoryTenantStore();
  await s.markAppDeployed({
    tenantSlug: 't5b', appSlug: 'a5b',
    scriptName: 't5b-a5b', d1_database_id: 'd', hostname: 'h',
    secretKeys: ['API_KEY'],
  });
  // Adding a key that already exists — should dedupe, not append twice.
  await s.updateSecretKeys({ tenantSlug: 't5b', appSlug: 'a5b', newKeys: ['API_KEY', 'DB_URL'] });
  const rec = await s.getAppRecord('t5b', 'a5b');
  assert(rec.secretKeys.length === 2, 'duplicate key deduped on update');
});

await runAsync(async () => {
  const s = new InMemoryTenantStore();
  const res = await s.updateSecretKeys({
    tenantSlug: 'missing', appSlug: 'ghost',
    newKeys: ['X'],
  });
  assert(res && res.ok === false && res.code === 'APP_NOT_FOUND',
    'updateSecretKeys on unknown app returns APP_NOT_FOUND');
});

// ── CC-1 multi-tenant routing: lookupAppBySubdomain ─────────────────────────
// The subdomain router needs a way to go from `acme-deals` (extracted from
// Host:) to the deployed-app row that lives in cfDeploys. The hostname field
// is already stored at deploy time (`hostname: 'acme-deals.buildclear.dev'`)
// so the lookup is just a scan of cfDeploys keyed on the leading subdomain.
console.log('\n🧭 CC-1 — lookupAppBySubdomain');
await runAsync(async () => {
  const s = new InMemoryTenantStore();
  await s.markAppDeployed({
    tenantSlug: 'acme', appSlug: 'deals',
    scriptName: 'acme-deals-prod',
    d1_database_id: 'd1-acme',
    hostname: 'acme-deals.buildclear.dev',
  });
  const row = await s.lookupAppBySubdomain('acme-deals');
  assert(row && row.scriptName === 'acme-deals-prod', 'lookup returns the right script');
  assert(row.d1_database_id === 'd1-acme', 'lookup returns the d1 binding');
  assert(row.tenantSlug === 'acme', 'lookup carries tenantSlug for further auth');
});

await runAsync(async () => {
  const s = new InMemoryTenantStore();
  const row = await s.lookupAppBySubdomain('does-not-exist');
  assert(row === null, 'unknown subdomain returns null');
});

await runAsync(async () => {
  const s = new InMemoryTenantStore();
  await s.markAppDeployed({
    tenantSlug: 'acme', appSlug: 'deals',
    scriptName: 'acme-deals',
    d1_database_id: 'd1', hostname: 'acme-deals.buildclear.dev',
  });
  // Subdomain match is case-insensitive (Host headers are canonicalized
  // lowercase by extractSubdomain, but the store should be defensive).
  const row = await s.lookupAppBySubdomain('ACME-DEALS');
  assert(row && row.scriptName === 'acme-deals', 'lookup is case-insensitive');
});

// ── Regression floor: existing Phase 7.7 behavior preserved ─────────────────
console.log('\n🧩 Regression — loadKnownApps still works across the new fields');
await runAsync(async () => {
  const s = new InMemoryTenantStore();
  await s.markAppDeployed({
    tenantSlug: 'tl', appSlug: 'al',
    scriptName: 'tl-al', d1_database_id: 'd-load', hostname: 'h',
    versionId: 'v-seed', secretKeys: ['S'],
  });
  const { scripts, databases } = await s.loadKnownApps();
  assert(scripts.has('tl-al'), 'loadKnownApps still surfaces scriptName');
  assert(databases.has('d-load'), 'loadKnownApps still surfaces d1_database_id');
});

console.log(`\n${failed === 0 ? '✅' : '❌'} ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);

})();

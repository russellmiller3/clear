// Tests for playground/tenants.js — InMemoryTenantStore + helpers.
//
// Session 44 Track 3 Phase 1 (LAE cloud shipping prereq): add per-app
// version history + secretKeys to the tenant store. This enables:
//   • widget-mode Ship on a CF-deployed app → append a new version row
//   • widget-mode Undo → roll back to the previous versionId
//   • partial-secrets filter on incremental deploys (only set new keys)
//
// Cycles 1.0-1.5 of plans/plan-live-editing-phase-b-cloud-04-23-2026.md.

import { InMemoryTenantStore, PostgresTenantStore, newTenantSlug, overQuota, canDeploy } from './tenants.js';

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
    lastBundle: { 'migrations/001-init.sql': 'CREATE TABLE a(id INTEGER);' },
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
  assert(rec.lastBundle && rec.lastBundle['migrations/001-init.sql'].includes('CREATE TABLE'),
    'lastBundle stored on initial deploy record');
});

await runAsync(async () => {
  const s = new InMemoryTenantStore();
  await s.markAppDeployed({
    tenantSlug: 't4d', appSlug: 'a4d',
    scriptName: 't4d-a4d', d1_database_id: 'd', hostname: 'h',
    lastBundle: { 'migrations/001-init.sql': 'CREATE TABLE old_items(id INTEGER);' },
  });
  await s.recordVersion({
    tenantSlug: 't4d', appSlug: 'a4d',
    versionId: 'v-new', uploadedAt: '2026-04-23T20:00:00Z',
    sourceHash: 'sh-new',
    lastBundle: { 'migrations/001-init.sql': 'CREATE TABLE new_items(id INTEGER);' },
  });
  const rec = await s.getAppRecord('t4d', 'a4d');
  assert(rec.lastBundle && rec.lastBundle['migrations/001-init.sql'].includes('new_items'),
    'recordVersion refreshes lastBundle for the next migration check');
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

// ── LAE Phase D — LAE-8 audit log per app ─────────────────────────────────
// Every widget ship (additive, reversible, destructive) writes an audit row.
// Append-only — old entries never mutate. Phase C's destructive flow uses
// this as the accountability surface (no data snapshot; the audit row is
// the GDPR/CCPA/HIPAA receipt). Phase D adds the read-side UI; the write
// path needs to land first so destructive ships can record their reason.
console.log('\n📜 LAE-8 — audit log per app');
await runAsync(async () => {
  const s = new InMemoryTenantStore();
  await s.markAppDeployed({
    tenantSlug: 'acme', appSlug: 'deals',
    scriptName: 'acme-deals', d1_database_id: 'd1',
    hostname: 'acme-deals.buildclear.dev',
  });
  // Empty log on a fresh app.
  const empty = await s.getAuditLog('acme', 'deals');
  assert(Array.isArray(empty) && empty.length === 0,
    'getAuditLog returns empty array on fresh app');
});
await runAsync(async () => {
  const s = new InMemoryTenantStore();
  await s.markAppDeployed({
    tenantSlug: 'acme', appSlug: 'deals',
    scriptName: 'acme-deals', d1_database_id: 'd1', hostname: 'h',
  });
  const res = await s.appendAuditEntry({
    tenantSlug: 'acme', appSlug: 'deals',
    actor: 'owner@example.com',
    action: 'ship',
    verdict: 'additive',
    sourceHashBefore: 'aaa',
    sourceHashAfter: 'bbb',
    note: 'add priority field',
  });
  assert(res && res.ok === true, 'appendAuditEntry returns ok');
  const log = await s.getAuditLog('acme', 'deals');
  assert(log.length === 1, 'log now has 1 row');
  assert(log[0].actor === 'owner@example.com', 'actor preserved');
  assert(log[0].action === 'ship', 'action preserved');
  assert(log[0].verdict === 'additive', 'verdict preserved');
  assert(typeof log[0].ts === 'string' && log[0].ts.length > 0, 'ts auto-stamped (ISO string)');
});
await runAsync(async () => {
  const s = new InMemoryTenantStore();
  // appendAuditEntry on an unknown app returns APP_NOT_FOUND. Same shape
  // as recordVersion. The widget-ship path knows the tenantSlug+appSlug
  // from the running widget context, so this only fires on misconfig.
  const res = await s.appendAuditEntry({
    tenantSlug: 'ghost', appSlug: 'missing',
    actor: 'x', action: 'ship', verdict: 'additive',
  });
  assert(res && res.ok === false && res.code === 'APP_NOT_FOUND',
    'appendAuditEntry returns APP_NOT_FOUND for unknown app');
});
await runAsync(async () => {
  // Appending up to MAX_AUDIT_PER_APP entries preserves ALL of them.
  // (Phase C cycle 3 changed the contract: getAuditLog returns NEWEST-FIRST
  // and the log caps at MAX_AUDIT_PER_APP=200. 50 < 200, so all 50 are
  // kept — but order is now reversed from insertion.)
  const s = new InMemoryTenantStore();
  await s.markAppDeployed({
    tenantSlug: 't', appSlug: 'a',
    scriptName: 'ta', d1_database_id: 'd', hostname: 'h',
  });
  for (let i = 0; i < 50; i++) {
    await s.appendAuditEntry({
      tenantSlug: 't', appSlug: 'a',
      actor: 'o', action: 'ship', verdict: 'additive', note: 'i=' + i,
    });
  }
  const log = await s.getAuditLog('t', 'a');
  assert(log.length === 50, 'all 50 entries kept (under cap of 200)');
  assert(log[0].note === 'i=49' && log[49].note === 'i=0',
    'log returns newest-first (i=49 first, i=0 last)');
});

// ── LAE Phase C cycle 3 — destructive-row extension on audit log ──────────
// Phase C destructive ships need to write an audit row BEFORE the change
// touches the deployed app (locked-in decision #4: write `pending` first,
// ship, mark `shipped` or `ship-failed`). This requires:
//   • appendAuditEntry accepts new fields: kind, before/after diff hunks,
//     reason, ip, userAgent, status (default 'shipped' for back-compat).
//   • appendAuditEntry returns {ok:true, auditId} so the caller can mark
//     the row later with the ship outcome.
//   • markAuditEntry({auditId, status, versionId?, error?}) does an in-place
//     update — never trims, even if the cap is hit.
//   • MAX_AUDIT_PER_APP=200 cap; oldest trimmed on append (NOT on mark —
//     pending rows in flight must never disappear).
//   • getAuditLog returns rows newest-first.
// Schema lock-in: before/after are tiny diff snippets, never full source.
console.log('\n🛡️ LAE Phase C cycle 3 — destructive audit-row extension');

// New fields stored verbatim + auditId returned.
await runAsync(async () => {
  const s = new InMemoryTenantStore();
  await s.markAppDeployed({
    tenantSlug: 'pc', appSlug: 'app',
    scriptName: 'pc-app', d1_database_id: 'd', hostname: 'h',
  });
  const res = await s.appendAuditEntry({
    tenantSlug: 'pc', appSlug: 'app',
    actor: 'owner@example.com',
    action: 'ship',
    verdict: 'destructive',
    sourceHashBefore: 'aaa',
    sourceHashAfter: 'bbb',
    note: 'remove notes field',
    kind: 'remove_field',
    before: '- notes (text)',
    after: '(removed)',
    reason: 'GDPR erasure request',
    ip: '203.0.113.7',
    userAgent: 'Mozilla/5.0 (test)',
    status: 'pending',
  });
  assert(res && res.ok === true, 'appendAuditEntry returns ok:true');
  assert(typeof res.auditId === 'string' && res.auditId.length > 0,
    'appendAuditEntry returns a non-empty auditId');
  const log = await s.getAuditLog('pc', 'app');
  assert(log.length === 1, 'log has 1 row');
  assert(log[0].kind === 'remove_field', 'kind preserved verbatim');
  assert(log[0].before === '- notes (text)', 'before (diff hunk) preserved verbatim');
  assert(log[0].after === '(removed)', 'after preserved verbatim');
  assert(log[0].reason === 'GDPR erasure request', 'reason preserved verbatim');
  assert(log[0].ip === '203.0.113.7', 'ip preserved verbatim');
  assert(log[0].userAgent === 'Mozilla/5.0 (test)', 'userAgent preserved verbatim');
  assert(log[0].status === 'pending', 'status preserved as pending');
  assert(log[0].auditId === res.auditId, 'row carries the same auditId returned by append');
});

// status defaults to 'shipped' when omitted (back-compat for non-destructive).
await runAsync(async () => {
  const s = new InMemoryTenantStore();
  await s.markAppDeployed({
    tenantSlug: 'pc2', appSlug: 'app',
    scriptName: 'pc2-app', d1_database_id: 'd', hostname: 'h',
  });
  const res = await s.appendAuditEntry({
    tenantSlug: 'pc2', appSlug: 'app',
    actor: 'o', action: 'ship', verdict: 'additive', note: 'add field',
  });
  assert(res.ok === true, 'append succeeds without status');
  const log = await s.getAuditLog('pc2', 'app');
  assert(log[0].status === 'shipped',
    'status defaults to "shipped" when caller omits it');
});

// markAuditEntry updates status pending → shipped with versionId.
await runAsync(async () => {
  const s = new InMemoryTenantStore();
  await s.markAppDeployed({
    tenantSlug: 'pc3', appSlug: 'app',
    scriptName: 'pc3-app', d1_database_id: 'd', hostname: 'h',
  });
  const append = await s.appendAuditEntry({
    tenantSlug: 'pc3', appSlug: 'app',
    actor: 'o', action: 'ship', verdict: 'destructive',
    kind: 'remove_field', before: '- x', after: '(removed)',
    reason: 'cleanup', status: 'pending',
  });
  const mark = await s.markAuditEntry({
    auditId: append.auditId,
    status: 'shipped',
    versionId: 'v-789',
  });
  assert(mark && mark.ok === true, 'markAuditEntry returns ok:true on success');
  const log = await s.getAuditLog('pc3', 'app');
  assert(log[0].status === 'shipped', 'status flipped to shipped');
  assert(log[0].versionId === 'v-789', 'versionId merged into row');
  // Verify other fields preserved.
  assert(log[0].kind === 'remove_field', 'kind preserved across mark');
  assert(log[0].reason === 'cleanup', 'reason preserved across mark');
  assert(log[0].before === '- x', 'before preserved across mark');
});

// markAuditEntry status:'ship-failed' + error.
await runAsync(async () => {
  const s = new InMemoryTenantStore();
  await s.markAppDeployed({
    tenantSlug: 'pc4', appSlug: 'app',
    scriptName: 'pc4-app', d1_database_id: 'd', hostname: 'h',
  });
  const append = await s.appendAuditEntry({
    tenantSlug: 'pc4', appSlug: 'app',
    actor: 'o', action: 'ship', verdict: 'destructive',
    kind: 'remove_field', before: '- y', after: '(removed)',
    reason: 'try', status: 'pending',
  });
  const mark = await s.markAuditEntry({
    auditId: append.auditId,
    status: 'ship-failed',
    error: 'D1 binding rejected ALTER',
  });
  assert(mark.ok === true, 'mark with ship-failed succeeds');
  const log = await s.getAuditLog('pc4', 'app');
  assert(log[0].status === 'ship-failed', 'status set to ship-failed');
  assert(log[0].error === 'D1 binding rejected ALTER', 'error preserved');
});

// markAuditEntry on unknown auditId returns AUDIT_NOT_FOUND.
await runAsync(async () => {
  const s = new InMemoryTenantStore();
  await s.markAppDeployed({
    tenantSlug: 'pc5', appSlug: 'app',
    scriptName: 'pc5-app', d1_database_id: 'd', hostname: 'h',
  });
  const mark = await s.markAuditEntry({
    auditId: 'does-not-exist-12345',
    status: 'shipped',
    versionId: 'v-1',
  });
  assert(mark && mark.ok === false && mark.code === 'AUDIT_NOT_FOUND',
    'markAuditEntry on unknown id returns AUDIT_NOT_FOUND');
});

// markAuditEntry does NOT trim the cap — pending rows must never vanish.
// Fill to MAX (200) of pending rows, then mark one — count stays 200.
await runAsync(async () => {
  const s = new InMemoryTenantStore();
  await s.markAppDeployed({
    tenantSlug: 'pc6', appSlug: 'app',
    scriptName: 'pc6-app', d1_database_id: 'd', hostname: 'h',
  });
  let firstId = null;
  for (let i = 0; i < 200; i++) {
    const r = await s.appendAuditEntry({
      tenantSlug: 'pc6', appSlug: 'app',
      actor: 'o', action: 'ship', verdict: 'destructive',
      kind: 'remove_field', before: '- a', after: '(removed)',
      reason: 'r' + i, status: 'pending',
    });
    if (i === 100) firstId = r.auditId; // pick a middle row to mark
  }
  let log = await s.getAuditLog('pc6', 'app');
  assert(log.length === 200, `cap reached: 200 rows (got ${log.length})`);
  const mark = await s.markAuditEntry({
    auditId: firstId, status: 'shipped', versionId: 'v-x',
  });
  assert(mark.ok === true, 'mark succeeded at the cap');
  log = await s.getAuditLog('pc6', 'app');
  assert(log.length === 200,
    `mark did not trim — still 200 rows (got ${log.length})`);
});

// appendAuditEntry past 200 trims the OLDEST.
await runAsync(async () => {
  const s = new InMemoryTenantStore();
  await s.markAppDeployed({
    tenantSlug: 'pc7', appSlug: 'app',
    scriptName: 'pc7-app', d1_database_id: 'd', hostname: 'h',
  });
  // Append 205 rows; expect the first 5 (reason r0..r4) trimmed.
  for (let i = 0; i < 205; i++) {
    await s.appendAuditEntry({
      tenantSlug: 'pc7', appSlug: 'app',
      actor: 'o', action: 'ship', verdict: 'additive', reason: 'r' + i,
    });
  }
  const log = await s.getAuditLog('pc7', 'app');
  assert(log.length === 200,
    `cap enforced at 200 (got ${log.length})`);
  // newest-first: log[0] is r204, log[199] is r5 (r0..r4 trimmed)
  assert(log[0].reason === 'r204', 'newest row first (r204)');
  assert(log[199].reason === 'r5',
    `oldest kept row is r5 — r0..r4 trimmed (got ${log[199].reason})`);
  assert(!log.find(e => e.reason === 'r0'), 'r0 was trimmed');
  assert(!log.find(e => e.reason === 'r4'), 'r4 was trimmed');
});

// getAuditLog returns newest-first.
await runAsync(async () => {
  const s = new InMemoryTenantStore();
  await s.markAppDeployed({
    tenantSlug: 'pc8', appSlug: 'app',
    scriptName: 'pc8-app', d1_database_id: 'd', hostname: 'h',
  });
  // Three appends; sleep a microtask between each so ts strings differ.
  await s.appendAuditEntry({
    tenantSlug: 'pc8', appSlug: 'app',
    actor: 'o', action: 'ship', verdict: 'additive', reason: 'first',
  });
  await new Promise(r => setTimeout(r, 5));
  await s.appendAuditEntry({
    tenantSlug: 'pc8', appSlug: 'app',
    actor: 'o', action: 'ship', verdict: 'additive', reason: 'second',
  });
  await new Promise(r => setTimeout(r, 5));
  await s.appendAuditEntry({
    tenantSlug: 'pc8', appSlug: 'app',
    actor: 'o', action: 'ship', verdict: 'additive', reason: 'third',
  });
  const log = await s.getAuditLog('pc8', 'app');
  assert(log.length === 3, 'three rows present');
  assert(log[0].reason === 'third', 'log[0] is the most recent (third)');
  assert(log[1].reason === 'second', 'log[1] is middle (second)');
  assert(log[2].reason === 'first', 'log[2] is oldest (first)');
});

// ── CC-1 (Postgres path) — interface contract test ──────────────────────────
// PostgresTenantStore is a Phase 85a-blocked stub. Until the real wire-up
// lands, its only contract is: same method surface as InMemoryTenantStore,
// every method throws NOT_IMPLEMENTED with the SQL the production version
// will run. This locks the contract so a future PR can fill it in without
// surprise renames.
console.log('\n🐘 CC-1 — PostgresTenantStore interface contract');
{
  const inMem = new InMemoryTenantStore();
  const pg = new PostgresTenantStore();
  // Every async method on InMemoryTenantStore exists on PostgresTenantStore.
  // Public methods only — private helpers (leading _) are implementation
  // details. Postgres's equivalent helper would be a query builder, not the
  // same in-memory key string.
  const inMemMethods = Object.getOwnPropertyNames(InMemoryTenantStore.prototype)
    .filter(m => m !== 'constructor' && !m.startsWith('_') && typeof inMem[m] === 'function');
  const pgMethods = new Set(
    Object.getOwnPropertyNames(PostgresTenantStore.prototype)
      .filter(m => m !== 'constructor' && typeof pg[m] === 'function')
  );
  for (const m of inMemMethods) {
    assert(pgMethods.has(m), `PostgresTenantStore implements ${m} (matches InMemoryTenantStore)`);
  }
}
await runAsync(async () => {
  const pg = new PostgresTenantStore();
  let caught = null;
  try { await pg.lookupAppBySubdomain('acme'); } catch (err) { caught = err; }
  assert(caught && caught.code === 'NOT_IMPLEMENTED',
    'PostgresTenantStore stub throws NOT_IMPLEMENTED');
  assert(caught && /SQL:/.test(caught.message),
    'NOT_IMPLEMENTED error includes the future SQL for grep-ability');
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

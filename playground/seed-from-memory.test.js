// Tests for playground/seed-from-memory.js — copies in-memory tenant
// state into a target store via the public API. CC-1 cutover step 2.
//
// Coverage:
//   1. Empty source → empty target after run
//   2. Tenants + apps + versions + stripe events copy across
//   3. Idempotent: second run on same target produces no duplicates
//   4. Audit log entries copy with status preserved
//   5. Returns a summary object the caller can log

import { InMemoryTenantStore } from './tenants.js';
import { seedFromMemory } from './seed-from-memory.js';

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

console.log('\n🌱 seedFromMemory — empty source produces empty target');
await runAsync(async () => {
  const source = new InMemoryTenantStore();
  const target = new InMemoryTenantStore();
  const summary = await seedFromMemory({ source, target });
  assert(typeof summary === 'object' && summary !== null, 'returns a summary object');
  assert(summary.tenantsCopied === 0, 'no tenants copied');
  assert(summary.appsCopied === 0, 'no apps copied');
  assert(summary.stripeEventsCopied === 0, 'no stripe events copied');
  assert((await target.listTenants()).length === 0, 'target has zero tenants');
});

console.log('\n🌱 seedFromMemory — copies tenants, apps, stripe events');
await runAsync(async () => {
  const source = new InMemoryTenantStore();
  await source.create({ slug: 't1', stripeCustomerId: 'cus_t1', plan: 'pro' });
  await source.create({ slug: 't2', stripeCustomerId: 'cus_t2', plan: 'team' });
  await source.markAppDeployed({
    tenantSlug: 't1', appSlug: 'a1', scriptName: 't1-a1',
    d1_database_id: 'd-t1a1', hostname: 'h-a1',
    versionId: 'v1', secretKeys: ['K1'],
  });
  await source.recordStripeEvent('evt_one');
  await source.recordStripeEvent('evt_two');

  const target = new InMemoryTenantStore();
  const summary = await seedFromMemory({ source, target });

  assert(summary.tenantsCopied === 2, 'two tenants copied');
  assert(summary.appsCopied === 1, 'one app copied');
  assert(summary.stripeEventsCopied === 2, 'two stripe events copied');

  const targetTenants = await target.listTenants();
  assert(targetTenants.length === 2, 'target has two tenants');
  const slugs = targetTenants.map(t => t.slug).sort();
  assert(slugs.join(',') === 't1,t2', 'both slugs present in target');

  const a1 = await target.getAppRecord('t1', 'a1');
  assert(a1 !== null, 'app record copied to target');
  assert(a1.scriptName === 't1-a1', 'app scriptName preserved');

  const evts = await target.listStripeEvents();
  assert(evts.includes('evt_one') && evts.includes('evt_two'), 'stripe events present');
});

console.log('\n🌱 seedFromMemory — idempotent on rerun (no duplicates)');
await runAsync(async () => {
  const source = new InMemoryTenantStore();
  await source.create({ slug: 'idem', stripeCustomerId: 'cus_idem', plan: 'pro' });
  await source.recordStripeEvent('evt_idem');

  const target = new InMemoryTenantStore();
  const first = await seedFromMemory({ source, target });
  assert(first.tenantsCopied === 1, 'first run copies one tenant');
  assert(first.tenantsSkipped === 0, 'first run skips none');

  const second = await seedFromMemory({ source, target });
  assert(second.tenantsCopied === 0, 'second run copies zero (already exists)');
  assert(second.tenantsSkipped === 1, 'second run skips one');
  assert(second.stripeEventsCopied === 0, 'second run copies zero stripe events');

  assert((await target.listTenants()).length === 1, 'still only one tenant in target');
});

console.log('\n🌱 seedFromMemory — copies audit log entries');
await runAsync(async () => {
  const source = new InMemoryTenantStore();
  await source.create({ slug: 'au', stripeCustomerId: 'cus_au', plan: 'pro' });
  await source.markAppDeployed({
    tenantSlug: 'au', appSlug: 'audit-app', scriptName: 'au-audit',
    d1_database_id: 'd-au', hostname: 'h-au',
    versionId: 'v-au-1', secretKeys: [],
  });
  const e1 = await source.appendAuditEntry({
    tenantSlug: 'au', appSlug: 'audit-app',
    action: 'deploy', ip: '1.2.3.4', userAgent: 'tester',
  });
  await source.markAuditEntry({ auditId: e1.auditId, status: 'shipped', versionId: 'v-au-1' });

  const target = new InMemoryTenantStore();
  await seedFromMemory({ source, target });

  const log = await target.getAuditLog('au', 'audit-app');
  assert(Array.isArray(log) && log.length === 1, 'audit log copied (one entry)');
  assert(log[0].action === 'deploy', 'audit action preserved');
  assert(log[0].status === 'shipped', 'audit status preserved');
});

console.log('\n🌱 seedFromMemory — accepts onProgress callback');
await runAsync(async () => {
  const source = new InMemoryTenantStore();
  await source.create({ slug: 'p1', stripeCustomerId: 'cus_p1', plan: 'pro' });
  await source.create({ slug: 'p2', stripeCustomerId: 'cus_p2', plan: 'pro' });

  const events = [];
  const target = new InMemoryTenantStore();
  await seedFromMemory({ source, target, onProgress: e => events.push(e) });

  assert(events.length >= 2, 'progress fired at least twice');
  assert(events.some(e => e.kind === 'tenant'), 'tenant progress event fired');
});

console.log(`\n${failed === 0 ? '✅' : '❌'} ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);

})();

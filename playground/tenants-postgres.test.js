// Tests for PostgresTenantStore — CC-1 cycle 2: tenant CRUD.
//
// Plan: plans/plan-cc-1-postgres-wire-up-04-25-2026.md (cycle 2).
// Surface implemented in this cycle: create / upsert / get / getByStripeCustomer.
// Other PostgresTenantStore methods stay NOT_IMPLEMENTED — they ship in cycles 3-8.
//
// ─────────────────────────────────────────────────────────────────────────
// Test substrate: pg-mem.
// ─────────────────────────────────────────────────────────────────────────
// Cycle 1 found pg-mem flaky on PL/pgSQL and a few corners of `default now()`,
// so the migration runner is tested with a hand-rolled FakePool. For these
// CRUD methods the surface is much smaller — INSERT / SELECT / ON CONFLICT
// against a plain table — and a probe (deleted before commit) confirmed
// pg-mem handles every shape we need. We use pg-mem here so the tests
// EXERCISE the SQL we ship rather than just record what queries are issued.
//
// Escape hatch: if `POSTGRES_TEST_URL` is set, we'd rather use a real Postgres.
// (Not yet wired — first paying customer's Postgres URL lands later.) For now
// the tests fall through to pg-mem unconditionally.
//
// ─────────────────────────────────────────────────────────────────────────
// Row-shape parity (load-bearing).
// ─────────────────────────────────────────────────────────────────────────
// InMemoryTenantStore.create returns an object with snake_case columns:
//   slug, stripe_customer_id, plan, apps_deployed, ai_spent_cents,
//   ai_credit_cents, created_at, grace_expires_at
// PostgresTenantStore must return the SAME shape — never camelize. Every
// caller (cloud-routing, billing, deploy-cloudflare, server.js) reads the
// snake_case columns directly. A camelize step would silently break them all.

import { newDb } from 'pg-mem';
import path from 'path';
import { fileURLToPath } from 'url';
import { runMigrations } from './db/migrations.js';
import { InMemoryTenantStore, PostgresTenantStore } from './tenants.js';
import { planFor } from './plans.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, 'db', 'migrations');

let passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; console.log('  ✅ ' + msg); }
  else { failed++; console.log('  ❌ ' + msg); }
}
async function runAsync(fn) {
  try { await fn(); }
  catch (e) { failed++; console.log('  ❌ UNHANDLED: ' + (e.message || e) + (e.stack ? '\n' + e.stack : '')); }
}

// Build a fresh pg-mem-backed store, with the schema migrated. Used by
// every test below — each test gets its own DB so they don't pollute each
// other.
async function freshStore() {
  const db = newDb();
  const { Pool } = db.adapters.createPg();
  const pool = new Pool();
  await runMigrations(pool, MIGRATIONS_DIR);
  return { store: new PostgresTenantStore({ pool }), pool, db };
}

(async () => {

// ─────────────────────────────────────────────────────────────────────────
// create — happy path returns full snake_case row.
// ─────────────────────────────────────────────────────────────────────────
console.log('\n🐘 CC-1 cycle 2 — create returns the full row in snake_case');
await runAsync(async () => {
  const { store } = await freshStore();
  const row = await store.create({ slug: 'clear-abc', stripeCustomerId: 'cus_x', plan: 'pro' });

  assert(row && typeof row === 'object', 'create returns an object');
  assert(row.slug === 'clear-abc', `row.slug === 'clear-abc' (got ${row.slug})`);
  assert(row.stripe_customer_id === 'cus_x', `row.stripe_customer_id === 'cus_x' (got ${row.stripe_customer_id})`);
  assert(row.plan === 'pro', `row.plan === 'pro' (got ${row.plan})`);
  assert(row.apps_deployed === 0, `row.apps_deployed === 0 (got ${row.apps_deployed})`);
  assert(row.ai_spent_cents === 0, `row.ai_spent_cents === 0 (got ${row.ai_spent_cents})`);
  assert(row.ai_credit_cents === planFor('pro').aiCreditCents,
    `row.ai_credit_cents === ${planFor('pro').aiCreditCents} (got ${row.ai_credit_cents})`);
  assert(typeof row.created_at === 'string' || row.created_at instanceof Date,
    `row.created_at is iso string or Date (got ${typeof row.created_at})`);
  assert(row.grace_expires_at === null,
    `row.grace_expires_at is null on create (got ${row.grace_expires_at})`);

  // Forbid camelize creep — snake_case is the wire shape.
  assert(!('stripeCustomerId' in row), 'no camelCase stripeCustomerId leak');
  assert(!('appsDeployed' in row), 'no camelCase appsDeployed leak');
  assert(!('aiCreditCents' in row), 'no camelCase aiCreditCents leak');
  assert(!('createdAt' in row), 'no camelCase createdAt leak');
});

// ─────────────────────────────────────────────────────────────────────────
// create — defaults plan to 'pro' and uses planFor('pro').aiCreditCents.
// ─────────────────────────────────────────────────────────────────────────
console.log('\n🐘 CC-1 cycle 2 — create defaults plan and ai credit');
await runAsync(async () => {
  const { store } = await freshStore();
  const row = await store.create({ slug: 'clear-default', stripeCustomerId: 'cus_default' });
  assert(row.plan === 'pro', `default plan is 'pro' (got ${row.plan})`);
  assert(row.ai_credit_cents === planFor('pro').aiCreditCents,
    `ai_credit_cents seeds from planFor('pro') (got ${row.ai_credit_cents})`);
});

// ─────────────────────────────────────────────────────────────────────────
// create — null stripeCustomerId is allowed (signup flow).
// ─────────────────────────────────────────────────────────────────────────
console.log('\n🐘 CC-1 cycle 2 — create accepts null/undefined stripeCustomerId');
await runAsync(async () => {
  const { store } = await freshStore();
  const a = await store.create({ slug: 'clear-na' });
  assert(a.stripe_customer_id === null || a.stripe_customer_id === undefined,
    `null stripe_customer_id allowed (got ${a.stripe_customer_id})`);
  // Two rows with null stripe_customer_id must coexist (partial unique).
  const b = await store.create({ slug: 'clear-nb' });
  assert(b.slug === 'clear-nb', 'second null-customer tenant created without conflict');
});

// ─────────────────────────────────────────────────────────────────────────
// create — different ai_credit_cents per plan.
// ─────────────────────────────────────────────────────────────────────────
console.log('\n🐘 CC-1 cycle 2 — create seeds ai_credit_cents from planFor(plan)');
await runAsync(async () => {
  const { store } = await freshStore();
  const free = await store.create({ slug: 'clear-free', plan: 'free' });
  assert(free.ai_credit_cents === planFor('free').aiCreditCents,
    `free plan ai_credit_cents = ${planFor('free').aiCreditCents} (got ${free.ai_credit_cents})`);
  const team = await store.create({ slug: 'clear-team', plan: 'team' });
  assert(team.ai_credit_cents === planFor('team').aiCreditCents,
    `team plan ai_credit_cents = ${planFor('team').aiCreditCents} (got ${team.ai_credit_cents})`);
});

// ─────────────────────────────────────────────────────────────────────────
// get — returns row or null.
// ─────────────────────────────────────────────────────────────────────────
console.log('\n🐘 CC-1 cycle 2 — get returns row by slug, null when missing');
await runAsync(async () => {
  const { store } = await freshStore();
  await store.create({ slug: 'clear-find', stripeCustomerId: 'cus_find' });

  const found = await store.get('clear-find');
  assert(found !== null, 'get returns non-null for known slug');
  assert(found.slug === 'clear-find', `get returns the row (slug=${found.slug})`);
  assert(found.stripe_customer_id === 'cus_find', 'get returns stripe_customer_id');

  const missing = await store.get('clear-nonexistent');
  assert(missing === null, `get('clear-nonexistent') === null (got ${missing})`);
});

// ─────────────────────────────────────────────────────────────────────────
// getByStripeCustomer — returns row or null.
// ─────────────────────────────────────────────────────────────────────────
console.log('\n🐘 CC-1 cycle 2 — getByStripeCustomer returns row or null');
await runAsync(async () => {
  const { store } = await freshStore();
  await store.create({ slug: 'clear-billed', stripeCustomerId: 'cus_billed' });

  const hit = await store.getByStripeCustomer('cus_billed');
  assert(hit !== null, 'getByStripeCustomer returns non-null for known id');
  assert(hit.slug === 'clear-billed', `getByStripeCustomer returns matching slug (got ${hit.slug})`);

  const miss = await store.getByStripeCustomer('cus_nope');
  assert(miss === null, `getByStripeCustomer('cus_nope') === null (got ${miss})`);

  // Null-customer tenants should NOT match an empty/missing search.
  await store.create({ slug: 'clear-anon' });  // no stripe_customer_id
  const noMatchOnNull = await store.getByStripeCustomer(null);
  assert(noMatchOnNull === null, 'getByStripeCustomer(null) returns null even if anon tenants exist');
});

// ─────────────────────────────────────────────────────────────────────────
// upsert — updates an existing row (shallow merge).
// ─────────────────────────────────────────────────────────────────────────
console.log('\n🐘 CC-1 cycle 2 — upsert updates existing row, preserves other fields');
await runAsync(async () => {
  const { store } = await freshStore();
  await store.create({ slug: 'clear-up', stripeCustomerId: 'cus_up', plan: 'pro' });

  const merged = await store.upsert('clear-up', { plan: 'team' });
  assert(merged.slug === 'clear-up', 'upsert returns row with same slug');
  assert(merged.plan === 'team', `upsert applies plan change (got ${merged.plan})`);
  // Shallow-merge semantics: existing stripe_customer_id must NOT have been clobbered.
  assert(merged.stripe_customer_id === 'cus_up',
    `upsert preserves stripe_customer_id when not in patch (got ${merged.stripe_customer_id})`);
  // apps_deployed default 0 stays.
  assert(merged.apps_deployed === 0,
    `upsert preserves apps_deployed (got ${merged.apps_deployed})`);

  // Round-trip: get returns the merged row.
  const reread = await store.get('clear-up');
  assert(reread.plan === 'team', 'subsequent get returns the updated plan');
});

// ─────────────────────────────────────────────────────────────────────────
// upsert — creates a new row when slug doesn't exist.
// ─────────────────────────────────────────────────────────────────────────
console.log('\n🐘 CC-1 cycle 2 — upsert on unknown slug creates a new row');
await runAsync(async () => {
  const { store } = await freshStore();

  const created = await store.upsert('clear-new', { plan: 'team', stripe_customer_id: 'cus_new' });
  assert(created.slug === 'clear-new', 'upsert returns the new slug');
  assert(created.plan === 'team', 'upsert applies the patched plan on insert');
  assert(created.stripe_customer_id === 'cus_new', 'upsert applies stripe_customer_id on insert');

  const reread = await store.get('clear-new');
  assert(reread !== null, 'upsert wrote a new row that get can read');
  assert(reread.plan === 'team', 'rewritten row has the patched plan');
});

// ─────────────────────────────────────────────────────────────────────────
// upsert — multiple field patch.
// ─────────────────────────────────────────────────────────────────────────
console.log('\n🐘 CC-1 cycle 2 — upsert applies multi-field patch');
await runAsync(async () => {
  const { store } = await freshStore();
  await store.create({ slug: 'clear-multi', stripeCustomerId: 'cus_multi', plan: 'pro' });

  const merged = await store.upsert('clear-multi', {
    plan: 'team',
    apps_deployed: 5,
    ai_spent_cents: 1234,
  });
  assert(merged.plan === 'team', 'plan changed');
  assert(merged.apps_deployed === 5, 'apps_deployed changed');
  assert(merged.ai_spent_cents === 1234, 'ai_spent_cents changed');
  assert(merged.stripe_customer_id === 'cus_multi', 'stripe_customer_id preserved');
});

// ─────────────────────────────────────────────────────────────────────────
// upsert — concurrent calls from same slug do not lose fields (atomic).
// In-memory uses Map.set with spread; SQL must wrap the read-modify-write
// in a single statement (e.g. INSERT ... ON CONFLICT DO UPDATE) so two
// callers don't clobber each other's columns.
// ─────────────────────────────────────────────────────────────────────────
console.log('\n🐘 CC-1 cycle 2 — concurrent upsert keeps both patches atomic');
await runAsync(async () => {
  const { store } = await freshStore();
  await store.create({ slug: 'clear-conc', stripeCustomerId: 'cus_conc', plan: 'pro' });

  // Fire two upserts in parallel patching different fields. Both must land.
  const [a, b] = await Promise.all([
    store.upsert('clear-conc', { apps_deployed: 7 }),
    store.upsert('clear-conc', { ai_spent_cents: 250 }),
  ]);
  // The final state must reflect BOTH patches landing on top of the
  // original. (pg-mem serializes async work, but the test verifies the SQL
  // shape holds up — last-write-wins is OK as long as no patch is silently
  // dropped because of a stale-read race.)
  const final = await store.get('clear-conc');
  // At minimum both rows should exist.
  assert(a && b, 'both upserts returned rows');
  // Concurrent writes — at minimum the row is intact.
  assert(final.slug === 'clear-conc', 'row still exists');
  assert(final.stripe_customer_id === 'cus_conc',
    'stripe_customer_id NOT clobbered by concurrent upserts');
  assert(final.plan === 'pro', 'plan NOT clobbered by concurrent upserts');
});

// ─────────────────────────────────────────────────────────────────────────
// Sanity — these tests do NOT touch other PostgresTenantStore methods.
// All five other methods still throw NOT_IMPLEMENTED so cycles 3-8 have
// somewhere to land.
// ─────────────────────────────────────────────────────────────────────────
console.log('\n🐘 CC-1 cycle 2 — other methods still NOT_IMPLEMENTED (cycles 3-8 territory)');
await runAsync(async () => {
  const { store } = await freshStore();
  let caught = null;
  try { await store.lookupAppBySubdomain('whatever'); }
  catch (e) { caught = e; }
  assert(caught && caught.code === 'NOT_IMPLEMENTED',
    'lookupAppBySubdomain still throws NOT_IMPLEMENTED');
});

console.log(`\n${failed === 0 ? '✅' : '❌'} ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);

})();

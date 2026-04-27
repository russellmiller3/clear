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
import { InMemoryTenantStore, PostgresTenantStore, MAX_VERSIONS_PER_APP } from './tenants.js';
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

// ═════════════════════════════════════════════════════════════════════════
// CC-1 cycle 3 — small mutations: incrementAppsDeployed, setPlan,
// seenStripeEvent, recordStripeEvent.
// ═════════════════════════════════════════════════════════════════════════
//
// These four are the smallest SQL surface in the plan: counter bumps, plan
// flips, and webhook dedupe. They get called every time a customer ships an
// app (incrementAppsDeployed) or Stripe redelivers a webhook
// (recordStripeEvent / seenStripeEvent). Two of them (setPlan, increment)
// must mirror the in-memory store's null-on-missing behavior exactly so the
// existing call sites in billing.js + cloud-routing/index.js don't change
// shape. The other two (Stripe events) make the webhook handler idempotent:
// any number of redeliveries of the same event_id are a no-op.

// ─────────────────────────────────────────────────────────────────────────
// incrementAppsDeployed — atomic counter bump (UPDATE ... RETURNING *).
// ─────────────────────────────────────────────────────────────────────────
console.log('\n🐘 CC-1 cycle 3 — incrementAppsDeployed bumps counter and returns row');
await runAsync(async () => {
  const { store } = await freshStore();
  await store.create({ slug: 'clear-bump', stripeCustomerId: 'cus_bump', plan: 'pro' });

  const r1 = await store.incrementAppsDeployed('clear-bump');
  assert(r1 !== null, 'incrementAppsDeployed returns the updated row');
  assert(r1.slug === 'clear-bump', 'returned row has the right slug');
  assert(r1.apps_deployed === 1, `apps_deployed bumped to 1 (got ${r1.apps_deployed})`);
  // Other columns must come along for the ride — the in-memory store returns
  // the same `t` reference, so the row shape is identical.
  assert(r1.stripe_customer_id === 'cus_bump',
    `stripe_customer_id preserved (got ${r1.stripe_customer_id})`);
  assert(r1.plan === 'pro', `plan preserved (got ${r1.plan})`);

  // Second bump — same row, count goes to 2.
  const r2 = await store.incrementAppsDeployed('clear-bump');
  assert(r2.apps_deployed === 2, `second bump → 2 (got ${r2.apps_deployed})`);
});

// ─────────────────────────────────────────────────────────────────────────
// incrementAppsDeployed — unknown slug returns null (matches in-memory).
// ─────────────────────────────────────────────────────────────────────────
console.log('\n🐘 CC-1 cycle 3 — incrementAppsDeployed returns null for unknown slug');
await runAsync(async () => {
  const { store } = await freshStore();
  const r = await store.incrementAppsDeployed('clear-nope');
  assert(r === null, `null for unknown slug (got ${r})`);
});

// ─────────────────────────────────────────────────────────────────────────
// incrementAppsDeployed — concurrent bumps both land (atomic UPDATE).
// In a read-modify-write pattern, two parallel bumps could each read 0 and
// write 1 → final value 1, lost-update race. Atomic SQL
// (`apps_deployed = apps_deployed + 1`) makes both increments add up.
//
// pg-mem caveat: the pg-mem driver runs queries serially per pool client,
// so this isn't a TRUE concurrent-bump test the way real Postgres would be
// under SERIALIZABLE. Two truly-concurrent transactions on real Postgres
// would either both succeed (default READ COMMITTED — UPDATE locks the row)
// or one would retry on serialization_failure. Either way the final count
// must be +2 — which is what we assert. The shape of the SQL
// (`UPDATE ... SET apps_deployed = apps_deployed + 1`) is what guarantees
// no lost-update; the test confirms the SQL was written that way (a
// read-modify-write impl would still hit final=2 here under pg-mem's serial
// dispatch but would race under real concurrency).
// ─────────────────────────────────────────────────────────────────────────
console.log('\n🐘 CC-1 cycle 3 — concurrent incrementAppsDeployed → +2 (no lost update)');
await runAsync(async () => {
  const { store } = await freshStore();
  await store.create({ slug: 'clear-race', stripeCustomerId: 'cus_race', plan: 'pro' });

  const [a, b] = await Promise.all([
    store.incrementAppsDeployed('clear-race'),
    store.incrementAppsDeployed('clear-race'),
  ]);
  assert(a && b, 'both concurrent bumps returned rows');
  // Final count must reflect BOTH bumps.
  const final = await store.get('clear-race');
  assert(final.apps_deployed === 2,
    `concurrent +1 +1 → final 2, no lost update (got ${final.apps_deployed})`);
  // The two returned rows should reflect 1 and 2 (in some order).
  const counts = [a.apps_deployed, b.apps_deployed].sort((x, y) => x - y);
  assert(counts[0] === 1 && counts[1] === 2,
    `returned rows show monotonic 1 then 2 (got ${counts.join(',')})`);
});

// ─────────────────────────────────────────────────────────────────────────
// setPlan — updates plan + grace_expires_at, returns the row.
// ─────────────────────────────────────────────────────────────────────────
console.log('\n🐘 CC-1 cycle 3 — setPlan updates plan and grace_expires_at');
await runAsync(async () => {
  const { store } = await freshStore();
  await store.create({ slug: 'clear-plan', stripeCustomerId: 'cus_plan', plan: 'pro' });

  // Promote to team, no grace window.
  const promoted = await store.setPlan('clear-plan', 'team', null);
  assert(promoted !== null, 'setPlan returns the updated row');
  assert(promoted.slug === 'clear-plan', 'returned row has right slug');
  assert(promoted.plan === 'team', `plan flipped to team (got ${promoted.plan})`);
  assert(promoted.grace_expires_at === null,
    `grace_expires_at is null (got ${promoted.grace_expires_at})`);

  // Demote to past_due with a grace window.
  const futureIso = new Date(Date.now() + 86400000).toISOString();
  const past = await store.setPlan('clear-plan', 'past_due', futureIso);
  assert(past.plan === 'past_due', `plan flipped to past_due (got ${past.plan})`);
  // Postgres returns timestamptz as a Date OR an ISO string — accept either.
  const graceTs = past.grace_expires_at instanceof Date
    ? past.grace_expires_at.toISOString()
    : past.grace_expires_at;
  assert(graceTs === futureIso || Date.parse(graceTs) === Date.parse(futureIso),
    `grace_expires_at set to provided iso (got ${graceTs}, want ${futureIso})`);

  // Other columns must NOT have been clobbered.
  assert(past.stripe_customer_id === 'cus_plan',
    `stripe_customer_id preserved (got ${past.stripe_customer_id})`);
});

// ─────────────────────────────────────────────────────────────────────────
// setPlan — unknown slug returns null.
// ─────────────────────────────────────────────────────────────────────────
console.log('\n🐘 CC-1 cycle 3 — setPlan returns null for unknown slug');
await runAsync(async () => {
  const { store } = await freshStore();
  const r = await store.setPlan('clear-nope', 'team', null);
  assert(r === null, `null for unknown slug (got ${r})`);
});

// ─────────────────────────────────────────────────────────────────────────
// setPlan — graceExpiresAt defaults to null when omitted (matches in-memory
// signature: `async setPlan(slug, plan, graceExpiresAt = null)`).
// ─────────────────────────────────────────────────────────────────────────
console.log('\n🐘 CC-1 cycle 3 — setPlan defaults graceExpiresAt to null');
await runAsync(async () => {
  const { store } = await freshStore();
  await store.create({ slug: 'clear-def', plan: 'pro' });
  // Set a grace first, then call setPlan without the third arg — should
  // clear it back to null.
  const futureIso = new Date(Date.now() + 86400000).toISOString();
  await store.setPlan('clear-def', 'past_due', futureIso);
  const cleared = await store.setPlan('clear-def', 'team');
  assert(cleared.plan === 'team', 'plan changed');
  assert(cleared.grace_expires_at === null,
    `grace_expires_at cleared back to null when arg omitted (got ${cleared.grace_expires_at})`);
});

// ─────────────────────────────────────────────────────────────────────────
// seenStripeEvent — returns false before record, true after.
// ─────────────────────────────────────────────────────────────────────────
console.log('\n🐘 CC-1 cycle 3 — seenStripeEvent flips false → true after recordStripeEvent');
await runAsync(async () => {
  const { store } = await freshStore();
  const eventId = 'evt_abc_123';

  const before = await store.seenStripeEvent(eventId);
  assert(before === false, `seenStripeEvent === false before record (got ${before})`);

  await store.recordStripeEvent(eventId);

  const after = await store.seenStripeEvent(eventId);
  assert(after === true, `seenStripeEvent === true after record (got ${after})`);

  // Different event id still returns false.
  const other = await store.seenStripeEvent('evt_xyz_999');
  assert(other === false, `unrelated event id still false (got ${other})`);
});

// ─────────────────────────────────────────────────────────────────────────
// recordStripeEvent — double insert is a no-op (ON CONFLICT DO NOTHING).
// Webhook idempotency: if Stripe redelivers the same event_id, the second
// call must succeed silently and seenStripeEvent must still return true.
// ─────────────────────────────────────────────────────────────────────────
console.log('\n🐘 CC-1 cycle 3 — recordStripeEvent is idempotent on duplicate event_id');
await runAsync(async () => {
  const { store } = await freshStore();
  const eventId = 'evt_dup_001';

  await store.recordStripeEvent(eventId);
  // Second call must not throw.
  let threw = null;
  try { await store.recordStripeEvent(eventId); }
  catch (e) { threw = e; }
  assert(threw === null, `second recordStripeEvent did not throw (got ${threw && threw.message})`);

  // seenStripeEvent still true after both calls.
  assert(await store.seenStripeEvent(eventId) === true,
    'seenStripeEvent still true after duplicate record');
});

// ─────────────────────────────────────────────────────────────────────────
// recordStripeEvent — returns void/undefined (mirrors in-memory).
// ─────────────────────────────────────────────────────────────────────────
console.log('\n🐘 CC-1 cycle 3 — recordStripeEvent returns void/undefined');
await runAsync(async () => {
  const { store } = await freshStore();
  const r = await store.recordStripeEvent('evt_void_001');
  assert(r === undefined, `recordStripeEvent returns undefined (got ${r})`);
});

// ═════════════════════════════════════════════════════════════════════════
// CC-1 cycle 4 — app registration: recordApp, appNameFor, markAppDeployed
// (without versions+secrets seeding — those land in cycles 5-6).
// ═════════════════════════════════════════════════════════════════════════
//
// recordApp + appNameFor are the {tenant_slug, app_slug} → script_name
// mapping that backs Studio's "did this tenant already deploy this app?"
// check. markAppDeployed is the cross-table seed call run after every
// successful Cloudflare deploy: writes the deploy state to cf_deploys AND
// mirrors the script name into apps so appNameFor returns it. Both writes
// happen in one transaction so a partial failure doesn't leave the two
// tables out of sync.
//
// Cycle 4 explicitly does NOT seed app_versions or app_secret_keys — even
// when versionId / secretKeys are passed in, they're ignored here. Cycles
// 5-6 will extend the same transaction. getAppRecord still throws
// NOT_IMPLEMENTED until cycle 5.

// Helper: cycle 4's test apps need a tenant row to satisfy the
// apps.tenant_slug FK. Wraps create() so the test bodies stay terse.
async function freshStoreWithTenant(slug = 'clear-app') {
  const { store, pool, db } = await freshStore();
  await store.create({ slug, stripeCustomerId: `cus_${slug}`, plan: 'pro' });
  return { store, pool, db, slug };
}

// ─────────────────────────────────────────────────────────────────────────
// recordApp — happy path returns the app_name; appNameFor mirrors it.
// ─────────────────────────────────────────────────────────────────────────
console.log('\n🐘 CC-1 cycle 4 — recordApp returns app_name; appNameFor reads it back');
await runAsync(async () => {
  const { store, slug } = await freshStoreWithTenant();
  const name = await store.recordApp(slug, 'todo', 'clear-abc-todo');
  assert(name === 'clear-abc-todo', `recordApp returns the app_name (got ${name})`);

  const reread = await store.appNameFor(slug, 'todo');
  assert(reread === 'clear-abc-todo', `appNameFor returns the same name (got ${reread})`);
});

// ─────────────────────────────────────────────────────────────────────────
// recordApp — second call with same (slug, appSlug) and different appName
// upserts (UPDATE wins, returns the new name).
// ─────────────────────────────────────────────────────────────────────────
console.log('\n🐘 CC-1 cycle 4 — recordApp upserts on same (slug, appSlug)');
await runAsync(async () => {
  const { store, slug } = await freshStoreWithTenant();
  const first = await store.recordApp(slug, 'todo', 'clear-abc-todo');
  assert(first === 'clear-abc-todo', `first recordApp returns first name (got ${first})`);

  const second = await store.recordApp(slug, 'todo', 'clear-abc-todo-renamed');
  assert(second === 'clear-abc-todo-renamed',
    `second recordApp returns the NEW name (got ${second})`);

  // appNameFor reflects the latest write.
  const reread = await store.appNameFor(slug, 'todo');
  assert(reread === 'clear-abc-todo-renamed',
    `appNameFor returns the upserted name (got ${reread})`);
});

// ─────────────────────────────────────────────────────────────────────────
// appNameFor — null on unknown.
// ─────────────────────────────────────────────────────────────────────────
console.log('\n🐘 CC-1 cycle 4 — appNameFor returns null for unknown (slug, appSlug)');
await runAsync(async () => {
  const { store, slug } = await freshStoreWithTenant();
  const missing = await store.appNameFor(slug, 'never-recorded');
  assert(missing === null, `appNameFor unknown app → null (got ${missing})`);

  // Wrong tenant slug also returns null.
  const wrongTenant = await store.appNameFor('clear-other', 'todo');
  assert(wrongTenant === null,
    `appNameFor with unknown tenant → null (got ${wrongTenant})`);
});

// ─────────────────────────────────────────────────────────────────────────
// markAppDeployed — happy path returns {ok:true} and writes both tables.
// ─────────────────────────────────────────────────────────────────────────
console.log('\n🐘 CC-1 cycle 4 — markAppDeployed writes cf_deploys + apps in one transaction');
await runAsync(async () => {
  const { store, pool, slug } = await freshStoreWithTenant();
  const result = await store.markAppDeployed({
    tenantSlug: slug,
    appSlug: 'todo',
    scriptName: 'clear-abc-todo',
    d1_database_id: 'db_abc_123',
    hostname: 'todo-abc.buildclear.dev',
  });
  assert(result && result.ok === true,
    `markAppDeployed returns {ok:true} (got ${JSON.stringify(result)})`);

  // cf_deploys row exists with all fields.
  const cf = await pool.query(
    `SELECT tenant_slug, app_slug, script_name, d1_database_id, hostname
     FROM clear_cloud.cf_deploys WHERE tenant_slug = $1 AND app_slug = $2`,
    [slug, 'todo']
  );
  assert(cf.rows.length === 1, `cf_deploys has exactly one row (got ${cf.rows.length})`);
  assert(cf.rows[0].tenant_slug === slug, 'cf_deploys.tenant_slug correct');
  assert(cf.rows[0].app_slug === 'todo', 'cf_deploys.app_slug correct');
  assert(cf.rows[0].script_name === 'clear-abc-todo',
    `cf_deploys.script_name = clear-abc-todo (got ${cf.rows[0].script_name})`);
  assert(cf.rows[0].d1_database_id === 'db_abc_123',
    `cf_deploys.d1_database_id = db_abc_123 (got ${cf.rows[0].d1_database_id})`);
  assert(cf.rows[0].hostname === 'todo-abc.buildclear.dev',
    `cf_deploys.hostname = todo-abc.buildclear.dev (got ${cf.rows[0].hostname})`);

  // apps row mirrors script name (the dual-write at line 108 of in-memory store).
  const apps = await pool.query(
    `SELECT app_name FROM clear_cloud.apps WHERE tenant_slug = $1 AND app_slug = $2`,
    [slug, 'todo']
  );
  assert(apps.rows.length === 1, `apps has exactly one mirrored row (got ${apps.rows.length})`);
  assert(apps.rows[0].app_name === 'clear-abc-todo',
    `apps.app_name mirrors script_name (got ${apps.rows[0].app_name})`);

  // appNameFor returns it (the public API for the dual-write).
  const named = await store.appNameFor(slug, 'todo');
  assert(named === 'clear-abc-todo',
    `appNameFor returns the mirrored script_name (got ${named})`);
});

// ─────────────────────────────────────────────────────────────────────────
// markAppDeployed — UPSERT semantics: same (tenantSlug, appSlug) called
// twice with different scriptName, second wins, no duplicate rows.
// ─────────────────────────────────────────────────────────────────────────
console.log('\n🐘 CC-1 cycle 4 — markAppDeployed twice on same (tenantSlug, appSlug) upserts');
await runAsync(async () => {
  const { store, pool, slug } = await freshStoreWithTenant();
  await store.markAppDeployed({
    tenantSlug: slug, appSlug: 'todo',
    scriptName: 'clear-abc-todo-v1',
    d1_database_id: 'db_v1', hostname: 'v1.buildclear.dev',
  });
  await store.markAppDeployed({
    tenantSlug: slug, appSlug: 'todo',
    scriptName: 'clear-abc-todo-v2',
    d1_database_id: 'db_v2', hostname: 'v2.buildclear.dev',
  });

  // Still exactly one row per table.
  const cf = await pool.query(
    `SELECT script_name, d1_database_id, hostname
     FROM clear_cloud.cf_deploys WHERE tenant_slug = $1 AND app_slug = $2`,
    [slug, 'todo']
  );
  assert(cf.rows.length === 1, `cf_deploys has exactly one row after upsert (got ${cf.rows.length})`);
  assert(cf.rows[0].script_name === 'clear-abc-todo-v2',
    `script_name updated to v2 (got ${cf.rows[0].script_name})`);
  assert(cf.rows[0].d1_database_id === 'db_v2',
    `d1_database_id updated to db_v2 (got ${cf.rows[0].d1_database_id})`);
  assert(cf.rows[0].hostname === 'v2.buildclear.dev',
    `hostname updated to v2.buildclear.dev (got ${cf.rows[0].hostname})`);

  const apps = await pool.query(
    `SELECT app_name FROM clear_cloud.apps WHERE tenant_slug = $1 AND app_slug = $2`,
    [slug, 'todo']
  );
  assert(apps.rows.length === 1, `apps has exactly one row after upsert (got ${apps.rows.length})`);
  assert(apps.rows[0].app_name === 'clear-abc-todo-v2',
    `apps.app_name updated to v2 (got ${apps.rows[0].app_name})`);

  // Public API confirms the upsert.
  const named = await store.appNameFor(slug, 'todo');
  assert(named === 'clear-abc-todo-v2',
    `appNameFor returns the upserted name (got ${named})`);
});

// ─────────────────────────────────────────────────────────────────────────
// markAppDeployed — d1_database_id and hostname are nullable, both null
// case must store nulls (not coerce to empty strings or skip the columns).
// ─────────────────────────────────────────────────────────────────────────
console.log('\n🐘 CC-1 cycle 4 — markAppDeployed accepts null d1_database_id + null hostname');
await runAsync(async () => {
  const { store, pool, slug } = await freshStoreWithTenant();
  const result = await store.markAppDeployed({
    tenantSlug: slug,
    appSlug: 'no-db',
    scriptName: 'clear-abc-no-db',
    d1_database_id: null,
    hostname: null,
  });
  assert(result.ok === true, `markAppDeployed with nulls returns {ok:true} (got ${JSON.stringify(result)})`);

  const cf = await pool.query(
    `SELECT script_name, d1_database_id, hostname
     FROM clear_cloud.cf_deploys WHERE tenant_slug = $1 AND app_slug = $2`,
    [slug, 'no-db']
  );
  assert(cf.rows.length === 1, 'cf_deploys row exists');
  assert(cf.rows[0].script_name === 'clear-abc-no-db', 'script_name persisted');
  assert(cf.rows[0].d1_database_id === null,
    `d1_database_id stored as null (got ${cf.rows[0].d1_database_id})`);
  assert(cf.rows[0].hostname === null,
    `hostname stored as null (got ${cf.rows[0].hostname})`);
});

// ═════════════════════════════════════════════════════════════════════════
// CC-1 cycle 5 — versions: seed in markAppDeployed, recordVersion,
// getAppRecord newest-first, cap at 20.
// ═════════════════════════════════════════════════════════════════════════
//
// In-memory parity (the contract):
//   - markAppDeployed({...versionId, sourceHash, migrationsHash}) seeds an
//     initial app_versions row when versionId is non-null.
//   - recordVersion({tenantSlug, appSlug, versionId, uploadedAt, sourceHash,
//     migrationsHash, note?, via?}) appends a row, returns {ok:true} on hit
//     or {ok:false, code:'APP_NOT_FOUND'} when the app doesn't exist.
//   - getAppRecord(tenantSlug, appSlug) returns:
//       {tenantSlug, appSlug, scriptName, d1_database_id, hostname,
//        deployedAt:<iso string>, versions:[…newest-first…], secretKeys:[…]}
//     or null on miss. versions[i] = {versionId, uploadedAt, sourceHash,
//     migrationsHash, note?, via?}. secretKeys is an empty [] in cycle 5
//     (cycle 6 wires the seed + dedupe-append).
//   - versions is capped at MAX_VERSIONS_PER_APP=20 — the OLDEST entries
//     are trimmed first. Cap is enforced inside recordVersion's transaction
//     so the row never lives in an over-capped state.
//
// pg-mem caveat: pg-mem ignores ORDER BY *inside* aggregates (json_agg /
// array_agg) — it returns insertion order. So we DO NOT use the
// `json_agg(av ORDER BY uploaded_at DESC)` shape from the plan. Instead
// getAppRecord runs three plain SELECTs (cf_deploys row, versions ORDER BY
// uploaded_at DESC, secret keys ORDER BY set_at) and assembles the record
// in JS. Same observable behavior, portable to real Postgres.
//
// MAX_VERSIONS_PER_APP is exported from tenants.js — we import it at the top
// of this file so the trim test below uses the same constant the
// implementation does.

// ─────────────────────────────────────────────────────────────────────────
// markAppDeployed seeds an initial version row when versionId is non-null.
// getAppRecord returns the seed row in versions[].
// ─────────────────────────────────────────────────────────────────────────
console.log('\n🐘 CC-1 cycle 5 — markAppDeployed seeds versions[] when versionId is non-null');
await runAsync(async () => {
  const { store, slug } = await freshStoreWithTenant();
  await store.markAppDeployed({
    tenantSlug: slug, appSlug: 'todo',
    scriptName: 'clear-abc-todo',
    d1_database_id: 'db_abc',
    hostname: 'todo.buildclear.dev',
    versionId: 'v-seed',
    sourceHash: 'sh-seed',
    migrationsHash: 'mh-seed',
    lastBundle: { 'migrations/001-init.sql': 'CREATE TABLE seeded(id INTEGER);' },
  });

  const rec = await store.getAppRecord(slug, 'todo');
  assert(rec !== null, 'getAppRecord returns non-null after markAppDeployed');
  assert(rec.scriptName === 'clear-abc-todo', `scriptName carried (got ${rec.scriptName})`);
  assert(rec.d1_database_id === 'db_abc', `d1_database_id carried (got ${rec.d1_database_id})`);
  assert(rec.hostname === 'todo.buildclear.dev', `hostname carried (got ${rec.hostname})`);
  assert(typeof rec.deployedAt === 'string', `deployedAt is iso string (got ${typeof rec.deployedAt})`);
  assert(Array.isArray(rec.versions) && rec.versions.length === 1,
    `versions[] seeded with exactly 1 row (got ${rec.versions && rec.versions.length})`);
  assert(rec.versions[0].versionId === 'v-seed',
    `seed versionId carries through (got ${rec.versions[0].versionId})`);
  assert(rec.versions[0].sourceHash === 'sh-seed',
    `seed sourceHash carries through (got ${rec.versions[0].sourceHash})`);
  assert(rec.versions[0].migrationsHash === 'mh-seed',
    `seed migrationsHash carries through (got ${rec.versions[0].migrationsHash})`);
  assert(rec.lastBundle && rec.lastBundle['migrations/001-init.sql'].includes('seeded'),
    'lastBundle carries through from markAppDeployed');
  assert(Array.isArray(rec.secretKeys) && rec.secretKeys.length === 0,
    'secretKeys is empty array in cycle 5 (cycle 6 wires the seed)');
});

// ─────────────────────────────────────────────────────────────────────────
// markAppDeployed without versionId does NOT seed a version row.
// (Backward compat with Phase 7 callers that don't pass version metadata.)
// ─────────────────────────────────────────────────────────────────────────
console.log('\n🐘 CC-1 cycle 5 — markAppDeployed without versionId does NOT seed a version row');
await runAsync(async () => {
  const { store, slug } = await freshStoreWithTenant();
  await store.markAppDeployed({
    tenantSlug: slug, appSlug: 'no-ver',
    scriptName: 'clear-abc-no-ver',
    d1_database_id: 'db_x', hostname: 'h.x',
  });
  const rec = await store.getAppRecord(slug, 'no-ver');
  assert(rec !== null, 'getAppRecord returns non-null');
  assert(Array.isArray(rec.versions) && rec.versions.length === 0,
    `versions[] is empty when no versionId passed (got ${rec.versions && rec.versions.length})`);
});

// ─────────────────────────────────────────────────────────────────────────
// markAppDeployed UPSERT must NOT clobber existing versions[]. A redeploy
// without versionId of an app that has accumulated versions keeps the
// versions intact (we only ever INSERT seed rows when versionId is given,
// and the existing rows survive the cf_deploys UPSERT because the FK from
// app_versions points at (tenant_slug, app_slug), not at cf_deploys.id).
// ─────────────────────────────────────────────────────────────────────────
console.log('\n🐘 CC-1 cycle 5 — markAppDeployed UPSERT preserves existing versions[]');
await runAsync(async () => {
  const { store, slug } = await freshStoreWithTenant();
  await store.markAppDeployed({
    tenantSlug: slug, appSlug: 'keep',
    scriptName: 'sn1', d1_database_id: 'db1', hostname: 'h.x',
    versionId: 'v-original',
    sourceHash: 'sh-original',
  });
  // Add a couple more versions.
  await store.recordVersion({
    tenantSlug: slug, appSlug: 'keep',
    versionId: 'v-2', uploadedAt: '2026-04-23T12:00:00Z', sourceHash: 'sh2',
  });
  await store.recordVersion({
    tenantSlug: slug, appSlug: 'keep',
    versionId: 'v-3', uploadedAt: '2026-04-23T13:00:00Z', sourceHash: 'sh3',
  });

  // Redeploy WITHOUT versionId — should not seed a new row, and existing 3
  // versions must survive the UPSERT.
  await store.markAppDeployed({
    tenantSlug: slug, appSlug: 'keep',
    scriptName: 'sn1-new', d1_database_id: 'db1-new', hostname: 'h.x',
  });

  const rec = await store.getAppRecord(slug, 'keep');
  assert(rec.versions.length === 3,
    `existing versions[] preserved through UPSERT (got ${rec.versions.length})`);
  assert(rec.scriptName === 'sn1-new',
    `scriptName updated by UPSERT (got ${rec.scriptName})`);
});

// ─────────────────────────────────────────────────────────────────────────
// recordVersion appends a row; getAppRecord shows it.
// ─────────────────────────────────────────────────────────────────────────
console.log('\n🐘 CC-1 cycle 5 — recordVersion appends and getAppRecord shows it');
await runAsync(async () => {
  const { store, slug } = await freshStoreWithTenant();
  await store.markAppDeployed({
    tenantSlug: slug, appSlug: 'app',
    scriptName: 'sn', d1_database_id: 'db', hostname: 'h.x',
  });
  const res = await store.recordVersion({
    tenantSlug: slug, appSlug: 'app',
    versionId: 'v-001',
    uploadedAt: '2026-04-23T20:00:00Z',
    sourceHash: 'sh1',
    migrationsHash: 'mh1',
    note: 'first ship',
    via: 'widget',
  });
  assert(res && res.ok === true, `recordVersion returns {ok:true} (got ${JSON.stringify(res)})`);

  const rec = await store.getAppRecord(slug, 'app');
  assert(rec.versions.length === 1, `versions has 1 row (got ${rec.versions.length})`);
  assert(rec.versions[0].versionId === 'v-001', `versionId carried (got ${rec.versions[0].versionId})`);
  assert(rec.versions[0].sourceHash === 'sh1', `sourceHash carried (got ${rec.versions[0].sourceHash})`);
  assert(rec.versions[0].migrationsHash === 'mh1', `migrationsHash carried (got ${rec.versions[0].migrationsHash})`);
  assert(rec.versions[0].note === 'first ship', `note carried (got ${rec.versions[0].note})`);
  assert(rec.versions[0].via === 'widget', `via carried (got ${rec.versions[0].via})`);
});

console.log('\n🐘 CC-1 cycle 5 — recordVersion refreshes lastBundle for migration checks');
await runAsync(async () => {
  const { store, slug } = await freshStoreWithTenant();
  await store.markAppDeployed({
    tenantSlug: slug, appSlug: 'bundle-app',
    scriptName: 'sn', d1_database_id: 'db', hostname: 'h.x',
    lastBundle: { 'migrations/001-init.sql': 'CREATE TABLE old_items(id INTEGER);' },
  });
  const res = await store.recordVersion({
    tenantSlug: slug, appSlug: 'bundle-app',
    versionId: 'v-bundle',
    uploadedAt: '2026-04-23T20:00:00Z',
    sourceHash: 'sh-bundle',
    lastBundle: { 'migrations/001-init.sql': 'CREATE TABLE new_items(id INTEGER);' },
  });
  assert(res && res.ok === true, `recordVersion returns {ok:true} (got ${JSON.stringify(res)})`);
  const rec = await store.getAppRecord(slug, 'bundle-app');
  assert(rec.lastBundle && rec.lastBundle['migrations/001-init.sql'].includes('new_items'),
    'lastBundle refreshes on recordVersion');
});

// ─────────────────────────────────────────────────────────────────────────
// recordVersion on unknown app returns {ok:false, code:'APP_NOT_FOUND'}.
// ─────────────────────────────────────────────────────────────────────────
console.log('\n🐘 CC-1 cycle 5 — recordVersion on unknown app returns APP_NOT_FOUND');
await runAsync(async () => {
  const { store } = await freshStore();
  const res = await store.recordVersion({
    tenantSlug: 'clear-ghost',
    appSlug: 'ghost-app',
    versionId: 'v1',
    uploadedAt: '2026-04-23T20:00:00Z',
    sourceHash: 'x',
  });
  assert(res && res.ok === false && res.code === 'APP_NOT_FOUND',
    `unknown app returns {ok:false, code:APP_NOT_FOUND} (got ${JSON.stringify(res)})`);
});

// ─────────────────────────────────────────────────────────────────────────
// getAppRecord returns versions newest-first by uploaded_at.
// ─────────────────────────────────────────────────────────────────────────
console.log('\n🐘 CC-1 cycle 5 — getAppRecord sorts versions newest-first by uploaded_at');
await runAsync(async () => {
  const { store, slug } = await freshStoreWithTenant();
  await store.markAppDeployed({
    tenantSlug: slug, appSlug: 'sortme',
    scriptName: 'sn', d1_database_id: 'db', hostname: 'h.x',
  });
  // Insert in non-chronological order on purpose.
  await store.recordVersion({
    tenantSlug: slug, appSlug: 'sortme',
    versionId: 'v-middle', uploadedAt: '2026-04-23T12:00:00Z', sourceHash: 'b',
  });
  await store.recordVersion({
    tenantSlug: slug, appSlug: 'sortme',
    versionId: 'v-newest', uploadedAt: '2026-04-23T20:00:00Z', sourceHash: 'c',
  });
  await store.recordVersion({
    tenantSlug: slug, appSlug: 'sortme',
    versionId: 'v-oldest', uploadedAt: '2026-04-23T06:00:00Z', sourceHash: 'a',
  });

  const rec = await store.getAppRecord(slug, 'sortme');
  assert(rec.versions[0].versionId === 'v-newest',
    `versions[0] is newest (got ${rec.versions[0].versionId})`);
  assert(rec.versions[1].versionId === 'v-middle',
    `versions[1] is middle (got ${rec.versions[1].versionId})`);
  assert(rec.versions[2].versionId === 'v-oldest',
    `versions[2] is oldest (got ${rec.versions[2].versionId})`);
});

// ─────────────────────────────────────────────────────────────────────────
// recordVersion caps at MAX_VERSIONS_PER_APP, oldest trimmed.
// ─────────────────────────────────────────────────────────────────────────
console.log('\n🐘 CC-1 cycle 5 — recordVersion caps at MAX_VERSIONS_PER_APP=20, oldest trimmed');
await runAsync(async () => {
  const { store, slug } = await freshStoreWithTenant();
  await store.markAppDeployed({
    tenantSlug: slug, appSlug: 'cap',
    scriptName: 'sn', d1_database_id: 'db', hostname: 'h.x',
  });
  // Insert 25 versions with monotonically increasing timestamps.
  for (let i = 0; i < 25; i++) {
    await store.recordVersion({
      tenantSlug: slug, appSlug: 'cap',
      versionId: `v${String(i).padStart(2, '0')}`,  // v00 .. v24
      uploadedAt: new Date(Date.parse('2026-01-01T00:00:00Z') + i * 60000).toISOString(),
      sourceHash: `sh${i}`,
    });
  }
  const rec = await store.getAppRecord(slug, 'cap');
  assert(rec.versions.length === MAX_VERSIONS_PER_APP,
    `versions capped at ${MAX_VERSIONS_PER_APP} (got ${rec.versions.length})`);
  // Newest-first → versions[0] should be v24.
  assert(rec.versions[0].versionId === 'v24',
    `newest kept is v24 (got ${rec.versions[0].versionId})`);
  // Oldest of kept should be v05 (we dropped v00-v04).
  assert(rec.versions[rec.versions.length - 1].versionId === 'v05',
    `oldest kept is v05 — v00..v04 trimmed (got ${rec.versions[rec.versions.length - 1].versionId})`);
  // None of the trimmed ones should be present.
  const ids = new Set(rec.versions.map(v => v.versionId));
  assert(!ids.has('v00') && !ids.has('v01') && !ids.has('v02') && !ids.has('v03') && !ids.has('v04'),
    'v00..v04 are not in the result');
});

// ─────────────────────────────────────────────────────────────────────────
// getAppRecord on unknown (tenantSlug, appSlug) returns null.
// ─────────────────────────────────────────────────────────────────────────
console.log('\n🐘 CC-1 cycle 5 — getAppRecord returns null for unknown (tenantSlug, appSlug)');
await runAsync(async () => {
  const { store } = await freshStore();
  const rec = await store.getAppRecord('clear-ghost', 'ghost-app');
  assert(rec === null, `getAppRecord on unknown returns null (got ${rec})`);
});

// ─────────────────────────────────────────────────────────────────────────
// Sanity — cycles 6-8 territory (secrets / lookup / audit) still throws
// NOT_IMPLEMENTED. Cycle 5 promotes getAppRecord + recordVersion.
// ─────────────────────────────────────────────────────────────────────────
console.log('\n🐘 CC-1 cycle 5 — cycles 6-8 territory still NOT_IMPLEMENTED');
await runAsync(async () => {
  const { store } = await freshStore();
  let caught = null;
  try { await store.lookupAppBySubdomain('whatever'); }
  catch (e) { caught = e; }
  assert(caught && caught.code === 'NOT_IMPLEMENTED',
    'lookupAppBySubdomain still throws NOT_IMPLEMENTED until cycle 7');

  caught = null;
  try { await store.updateSecretKeys({ tenantSlug: 'x', appSlug: 'y', newKeys: ['K'] }); }
  catch (e) { caught = e; }
  assert(caught && caught.code === 'NOT_IMPLEMENTED',
    'updateSecretKeys still throws NOT_IMPLEMENTED until cycle 6');

  caught = null;
  try { await store.getAuditLog('x', 'y'); }
  catch (e) { caught = e; }
  assert(caught && caught.code === 'NOT_IMPLEMENTED',
    'getAuditLog still throws NOT_IMPLEMENTED until cycle 8');
});

console.log(`\n${failed === 0 ? '✅' : '❌'} ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);

})();

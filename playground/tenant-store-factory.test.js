// CC-1 cycle 9 — store factory + dual-write wrapper tests.

import { newDb } from 'pg-mem';
import path from 'path';
import { fileURLToPath } from 'url';
import { makeTenantStore } from './tenant-store-factory.js';
import { InMemoryTenantStore, PostgresTenantStore, DualWriteTenantStore } from './tenants.js';

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

function makePgMemPool() {
  const db = newDb();
  const { Pool } = db.adapters.createPg();
  return Pool;
}

(async () => {

console.log('\n🏭 makeTenantStore — DATABASE_URL unset returns in-memory');
await runAsync(async () => {
  const handle = await makeTenantStore({});
  assert(handle.store instanceof InMemoryTenantStore, 'returns InMemoryTenantStore');
  assert(handle.mode === 'in-memory', 'mode is in-memory');
  assert(handle.pool === null, 'pool is null');
});

console.log('\n🏭 makeTenantStore — DATABASE_URL set defaults to postgres mode');
await runAsync(async () => {
  const Pool = makePgMemPool();
  const handle = await makeTenantStore(
    { DATABASE_URL: 'postgresql://fake' },
    { Pool, migrationsDir: MIGRATIONS_DIR }
  );
  assert(handle.store instanceof PostgresTenantStore, 'returns PostgresTenantStore');
  assert(handle.mode === 'postgres', 'mode is postgres');
  assert(handle.pool, 'pool is set');
});

console.log('\n🏭 makeTenantStore — TENANT_STORE_PRIMARY=in-memory keeps in-memory primary');
await runAsync(async () => {
  const Pool = makePgMemPool();
  const handle = await makeTenantStore(
    { DATABASE_URL: 'postgresql://fake', TENANT_STORE_PRIMARY: 'in-memory' },
    { Pool, migrationsDir: MIGRATIONS_DIR }
  );
  assert(handle.store instanceof InMemoryTenantStore, 'returns InMemoryTenantStore');
  assert(handle.mode === 'in-memory', 'mode is in-memory');
});

console.log('\n🏭 makeTenantStore — TENANT_STORE_PRIMARY=dual-write returns wrapper');
await runAsync(async () => {
  const Pool = makePgMemPool();
  const handle = await makeTenantStore(
    { DATABASE_URL: 'postgresql://fake', TENANT_STORE_PRIMARY: 'dual-write' },
    { Pool, migrationsDir: MIGRATIONS_DIR }
  );
  assert(handle.store instanceof DualWriteTenantStore, 'returns DualWriteTenantStore');
  assert(handle.mode === 'dual-write', 'mode is dual-write');
});

console.log('\n🪞 DualWriteTenantStore — writes go to both stores');
await runAsync(async () => {
  const primary = new InMemoryTenantStore();
  const mirror = new InMemoryTenantStore();
  const dual = new DualWriteTenantStore({ primary, mirror });
  await dual.create({ slug: 'clear-x', stripeCustomerId: 'cus_1', plan: 'pro' });
  const p = await primary.get('clear-x');
  const m = await mirror.get('clear-x');
  assert(p && p.slug === 'clear-x', 'primary has the row');
  assert(m && m.slug === 'clear-x', 'mirror has the row');
});

console.log('\n🪞 DualWriteTenantStore — mirror failures are non-fatal');
await runAsync(async () => {
  const primary = new InMemoryTenantStore();
  // Mirror that always throws on writes
  const mirror = {
    create: async () => { throw new Error('mirror down'); },
    get: async () => null,
  };
  const dual = new DualWriteTenantStore({ primary, mirror });
  // Should NOT throw despite the mirror error
  const result = await dual.create({ slug: 'clear-y', stripeCustomerId: 'cus_2', plan: 'pro' });
  assert(result && result.slug === 'clear-y', 'create returns primary result despite mirror failure');
});

console.log('\n🪞 DualWriteTenantStore — read falls back to mirror when primary empty');
await runAsync(async () => {
  const primary = new InMemoryTenantStore();
  const mirror = new InMemoryTenantStore();
  // Seed only the mirror to simulate cutover gap
  await mirror.create({ slug: 'clear-z', stripeCustomerId: 'cus_3', plan: 'pro' });
  const dual = new DualWriteTenantStore({ primary, mirror });
  const r = await dual.get('clear-z');
  assert(r && r.slug === 'clear-z', 'falls back to mirror when primary is empty');
});

console.log('\n🪞 DualWriteTenantStore — primary read wins when both have data');
await runAsync(async () => {
  const primary = new InMemoryTenantStore();
  const mirror = new InMemoryTenantStore();
  await primary.create({ slug: 'clear-q', stripeCustomerId: 'cus_p', plan: 'pro' });
  await mirror.create({ slug: 'clear-q', stripeCustomerId: 'cus_m', plan: 'pro' });
  const dual = new DualWriteTenantStore({ primary, mirror });
  const r = await dual.get('clear-q');
  assert(r && r.stripe_customer_id === 'cus_p', 'primary wins on read when both have the slug');
});

console.log('\n🪞 DualWriteTenantStore — loadKnownApps unions both stores');
await runAsync(async () => {
  const primary = new InMemoryTenantStore();
  const mirror = new InMemoryTenantStore();
  await primary.create({ slug: 'clear-a', stripeCustomerId: 'cus_a', plan: 'pro' });
  await primary.markAppDeployed({ tenantSlug: 'clear-a', appSlug: 'app1', scriptName: 'pri-script', d1_database_id: 'd1-pri' });
  await mirror.create({ slug: 'clear-b', stripeCustomerId: 'cus_b', plan: 'pro' });
  await mirror.markAppDeployed({ tenantSlug: 'clear-b', appSlug: 'app2', scriptName: 'mir-script', d1_database_id: 'd1-mir' });
  const dual = new DualWriteTenantStore({ primary, mirror });
  const known = await dual.loadKnownApps();
  assert(known.scripts.has('pri-script'), 'union includes primary scripts');
  assert(known.scripts.has('mir-script'), 'union includes mirror scripts');
  assert(known.databases.has('d1-pri'), 'union includes primary databases');
  assert(known.databases.has('d1-mir'), 'union includes mirror databases');
});

console.log('\n🔑 makeTenantStore — CC-2 cloud-auth schema applied (users + sessions tables exist)');
await runAsync(async () => {
  const Pool = makePgMemPool();
  const handle = await makeTenantStore(
    { DATABASE_URL: 'postgresql://fake' },
    { Pool, migrationsDir: MIGRATIONS_DIR }
  );
  // Pool from pg-mem; query directly to confirm the auth tables exist.
  const c = await handle.pool.connect();
  try {
    // SELECT against an empty table should succeed if migration ran.
    const u = await c.query('SELECT count(*) AS n FROM users');
    assert(Number(u.rows[0].n) === 0, 'users table exists and is empty after migration');
    const s = await c.query('SELECT count(*) AS n FROM sessions');
    assert(Number(s.rows[0].n) === 0, 'sessions table exists and is empty after migration');
    // Insert a row to confirm columns are right (covers the cloud-auth helper SQL shape).
    await c.query(
      `INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3) RETURNING id`,
      ['marcus@example.com', '$2a$12$fakehashfake', 'Marcus']
    );
    const r = await c.query(`SELECT email, status, role FROM users WHERE email = $1`, ['marcus@example.com']);
    assert(r.rows[0]?.email === 'marcus@example.com', 'users insert + select round-trips');
    assert(r.rows[0]?.status === 'active', 'users.status defaults to active');
    assert(r.rows[0]?.role === 'member', 'users.role defaults to member');
  } finally {
    c.release();
  }
});

console.log(`\n${failed === 0 ? '✅' : '❌'} ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);

})();

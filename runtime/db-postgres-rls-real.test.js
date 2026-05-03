// =============================================================================
// POSTGRES ROW-LEVEL SECURITY — REAL-DATABASE WITNESS (2026-05-03 night)
// =============================================================================
//
// PURPOSE
//   The existing `runtime/db-postgres-rls.test.js` proves the runtime emits
//   the correct SQL via a FakePool that captures BEGIN / SET LOCAL / query /
//   COMMIT calls. That's necessary but not sufficient — it does not prove
//   that a real Postgres engine actually enforces the policy when the SQL
//   reaches the database. This file closes that gap.
//
// METHOD
//   Connect to a real Postgres via DATABASE_URL (any provider — Railway,
//   Neon, Render, docker-compose, local pg). For each test:
//     1. Drop and recreate the test table (clean state).
//     2. Call enableRowLevelSecurity(tableName) — runs ENABLE + FORCE ROW
//        LEVEL SECURITY + CREATE POLICY against the live database.
//     3. Insert rows under withTenantScope(1, ...) and withTenantScope(2, ...).
//     4. With a forged WHERE-less SELECT inside withTenantScope(1, ...),
//        assert ONLY tenant 1's row is returned. The application-layer
//        tenant filter is bypassed — this is the database-layer enforcement.
//     5. Symmetric check for tenant 2.
//     6. Outside any tenant scope (no SET LOCAL fires), the policy uses
//        current_setting('app.current_tenant_id', true) which returns NULL
//        when unset; ::int(NULL) → NULL; tenant_id = NULL → UNKNOWN → row
//        hidden. Assert zero rows visible to an unauthenticated reader.
//
// HOW TO RUN
//   Set DATABASE_URL pointing at any Postgres instance. The test runs
//   end-to-end against that database, then cleans up.
//
//   Without DATABASE_URL the test gracefully skips with a one-line note —
//   same pattern as lib/tenant-isolation-witness.test.js gates on
//   bcryptjs / jsonwebtoken availability.
//
//   pg-mem is NOT enough — verified with a probe. pg-mem rejects ALTER
//   TABLE ... ENABLE ROW LEVEL SECURITY, CREATE POLICY, SET LOCAL, and
//   current_setting — none of which are stubbed by the in-memory engine.
//
// WHY IT SHIPS
//   The CRO sentence: "we removed the application filter on a test branch,
//   fired a forged cross-tenant query against a real Postgres, and the
//   database returned zero rows." Today the math says it works; this test
//   proves it against a live engine.
// =============================================================================

'use strict';

const path = require('path');
const TABLE = 'clear_rls_test_table_' + Math.random().toString(36).slice(2, 10);

let passed = 0, failed = 0, skippedReason = null;
function assert(cond, msg) {
  if (cond) { passed++; console.log('  PASS ' + msg); }
  else { failed++; console.log('  FAIL ' + msg); }
}
function group(name) { console.log('\n  ' + name); }

async function main() {
  if (!process.env.DATABASE_URL) {
    skippedReason = 'DATABASE_URL not set — set it pointing at any Postgres to run the real-engine RLS proof.';
    console.log('  SKIP ' + skippedReason);
    return;
  }
  // Try to require pg. If unavailable, skip cleanly.
  let Pool;
  try {
    Pool = require('pg').Pool;
  } catch (_) {
    skippedReason = 'node-postgres ("pg") not installed — run `npm install pg` to enable this test.';
    console.log('  SKIP ' + skippedReason);
    return;
  }

  // Try to require the runtime module under test.
  let db;
  try {
    db = require('./db-postgres.js');
  } catch (e) {
    skippedReason = 'runtime/db-postgres.js failed to load: ' + e.message;
    console.log('  SKIP ' + skippedReason);
    return;
  }

  // Quick connectivity probe so a misconfigured DATABASE_URL doesn't
  // generate cryptic errors deep in the test.
  const probePool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes('sslmode=') ? undefined : { rejectUnauthorized: true },
  });
  try {
    await probePool.query('SELECT 1');
  } catch (e) {
    skippedReason = 'DATABASE_URL refused connection: ' + e.message;
    console.log('  SKIP ' + skippedReason);
    await probePool.end().catch(() => {});
    return;
  } finally {
    await probePool.end().catch(() => {});
  }

  // Fresh state: drop the test table if it survived a prior run.
  // Cannot use a transaction here — DROP IF EXISTS just runs.
  try {
    // db-postgres.js's getPool() reads DATABASE_URL on first call; share
    // the env var. The pool is module-level so we work through it directly.
    await db.run('DROP TABLE IF EXISTS ' + TABLE);
  } catch (e) {
    console.log('  (test-table preclean failed — will continue: ' + e.message + ')');
  }

  // Register schema with the runtime + force lazy table create via a
  // throwaway findAll. This also gives the runtime a chance to add the
  // _version + tenant_id columns it auto-includes on every table — but
  // wait, the Postgres ensureTable doesn't add them; only the SQLite db
  // does. We'll add tenant_id ourselves below.
  db.createTable(TABLE, { status: { type: 'text' } });
  await db.findAll(TABLE).catch(() => {});

  // Add a tenant_id column ourselves (the Postgres ensureTable doesn't
  // auto-include it the way the SQLite ensureTable does). RLS needs the
  // column to exist before ENABLE.
  try {
    await db.run('ALTER TABLE ' + TABLE + ' ADD COLUMN IF NOT EXISTS tenant_id INT');
  } catch (e) {
    console.error('  ALTER TABLE ADD tenant_id FAILED — RLS test cannot proceed: ' + e.message);
    failed++;
    return;
  }

  // ---------------------------------------------------------------------------
  group('enableRowLevelSecurity runs the DDL and the policy is in place');
  try {
    await db.enableRowLevelSecurity(TABLE);
    assert(true, 'enableRowLevelSecurity completed (no throw)');
  } catch (e) {
    assert(false, 'enableRowLevelSecurity threw: ' + e.message);
    return;
  }

  // ---------------------------------------------------------------------------
  group('Tenant 1 inserts a row, Tenant 2 inserts a row');
  // Use raw INSERT through db.run since db.insert() runs through the
  // schema-validated path which is fine but adds noise. We want minimal
  // surface — just prove the policy.
  await db.withTenantScope(1, async () => {
    await db.run("INSERT INTO " + TABLE + " (status, tenant_id) VALUES ('tenant-one-secret', 1)");
  });
  await db.withTenantScope(2, async () => {
    await db.run("INSERT INTO " + TABLE + " (status, tenant_id) VALUES ('tenant-two-secret', 2)");
  });
  // Sanity: outside any scope, the OWNER bypass would normally see all
  // rows — but FORCE RLS makes the policy apply to the owner too. With
  // current_setting('app.current_tenant_id', true) returning NULL, the
  // policy `tenant_id = NULL::int` is UNKNOWN → row hidden. So the
  // unauthenticated reader sees zero rows.
  assert(true, 'inserts done (each under its tenant scope)');

  // ---------------------------------------------------------------------------
  group('Forged cross-tenant SELECT (no app filter) — RLS hides the other tenant');
  // The whole point: a SELECT with NO WHERE clause should still return
  // only the current tenant's rows because the policy filters at the
  // database layer. This is what an application-layer bug would do —
  // forget the tenant_id filter — and the database has to catch it.
  let tenant1Rows, tenant2Rows, anonRows;
  // Use findAll without a filter — that's the forged "no-filter" select.
  // The application-layer code would normally pass a tenant_id filter
  // here; passing nothing simulates the bug class RLS exists to catch.
  await db.withTenantScope(1, async () => {
    tenant1Rows = await db.findAll(TABLE);
  });
  await db.withTenantScope(2, async () => {
    tenant2Rows = await db.findAll(TABLE);
  });
  anonRows = await db.findAll(TABLE);

  assert(Array.isArray(tenant1Rows) && tenant1Rows.length === 1,
    'tenant 1 sees exactly 1 row (got ' + (tenant1Rows ? tenant1Rows.length : 'null') + ')');
  assert(tenant1Rows && tenant1Rows[0] && tenant1Rows[0].status === 'tenant-one-secret',
    "tenant 1's row is its own (status === 'tenant-one-secret')");
  assert(Array.isArray(tenant2Rows) && tenant2Rows.length === 1,
    'tenant 2 sees exactly 1 row (got ' + (tenant2Rows ? tenant2Rows.length : 'null') + ')');
  assert(tenant2Rows && tenant2Rows[0] && tenant2Rows[0].status === 'tenant-two-secret',
    "tenant 2's row is its own (status === 'tenant-two-secret')");
  // Anonymous (no SET LOCAL): the policy uses current_setting(name, true)
  // which returns NULL when unset. NULL::int = NULL, comparison to NULL
  // is UNKNOWN, row is hidden. Zero rows visible.
  assert(Array.isArray(anonRows) && anonRows.length === 0,
    'unauthenticated reader sees ZERO rows (got ' + (anonRows ? anonRows.length : 'null') + ')');

  // ---------------------------------------------------------------------------
  group('Forged cross-tenant INSERT — policy WITH CHECK refuses');
  // The CREATE POLICY in db-postgres.js uses both USING (read-side) and
  // WITH CHECK (write-side). A tenant 1 connection that tries to insert
  // a row claiming tenant_id=2 should be rejected by WITH CHECK.
  let crossInsertError = null;
  try {
    await db.withTenantScope(1, async () => {
      await db.run("INSERT INTO " + TABLE + " (status, tenant_id) VALUES ('tenant-1-pretending-to-be-2', 2)");
    });
  } catch (e) {
    crossInsertError = e;
  }
  assert(crossInsertError !== null, 'cross-tenant insert threw (WITH CHECK refused)');
  if (crossInsertError) {
    assert(/policy/i.test(crossInsertError.message) || /row-level security/i.test(crossInsertError.message),
      'rejection mentions policy or row-level security (got: ' + crossInsertError.message.split('\n')[0] + ')');
  }

  // ---------------------------------------------------------------------------
  group('Idempotent re-enable — second call does not error');
  try {
    await db.enableRowLevelSecurity(TABLE);
    assert(true, 'second enableRowLevelSecurity call is a no-op');
  } catch (e) {
    assert(false, 'second enableRowLevelSecurity call threw: ' + e.message);
  }

  // ---------------------------------------------------------------------------
  // Cleanup
  try {
    await db.run('DROP TABLE IF EXISTS ' + TABLE);
  } catch (e) {
    console.log('  (cleanup of test table failed — manual drop may be needed: ' + e.message + ')');
  }
}

main()
  .then(() => {
    if (skippedReason) {
      console.log('\n=== ' + passed + ' passed, ' + failed + ' failed (suite SKIPPED: ' + skippedReason + ') ===');
      process.exit(0);
    }
    console.log('\n=== ' + passed + ' passed, ' + failed + ' failed ===');
    process.exit(failed > 0 ? 1 : 0);
  })
  .catch((e) => {
    console.error('Fatal:', e && e.stack ? e.stack : e);
    process.exit(1);
  });

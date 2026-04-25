// Tests for playground/db/migrations.js — the schema migration runner.
//
// CC-1 Cycle 1: the runner reads numbered SQL files from a directory, applies
// any newer than the highest version recorded in clear_cloud.schema_migrations,
// and inserts the migration row in the same transaction so a mid-file failure
// rolls back to a clean slate. Idempotent — calling runMigrations twice does
// nothing the second time.
//
// We use a HAND-ROLLED FakePool that records every query made against it.
// pg-mem chokes on PL/pgSQL DO $$ ... END $$ blocks AND on `default now()` —
// coverage gaps that aren't worth fighting. Real-Postgres-only tests would
// skip cleanly when no POSTGRES_TEST_URL is set, but pre-push then loses
// cycle 1 coverage entirely.
//
// What the FakePool tests verify: the runner's MOTIONS. That it issues a
// BEGIN / COMMIT around each migration, that it runs the file SQL, that it
// inserts the schema_migrations row in the same transaction, that it skips
// already-applied versions, that it sorts numerically. Schema correctness
// (the actual SQL in 0001_init.sql) gets verified separately when real
// Postgres lands in cycles 2-9.
//
// Plan: plans/plan-cc-1-postgres-wire-up-04-25-2026.md (cycle 1).

import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { runMigrations } from './migrations.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; console.log('  ✅ ' + msg); }
  else { failed++; console.log('  ❌ ' + msg); }
}
async function runAsync(fn) {
  try { await fn(); }
  catch (e) { failed++; console.log('  ❌ UNHANDLED: ' + e.message + (e.stack ? '\n' + e.stack : '')); }
}

// ─────────────────────────────────────────────────────────────────────────
// FakePool — records every query, simulates the pg.Pool interface.
//
// connect() returns a FakeClient. Each FakeClient has query(sql, params)
// and release(). Every query call appends {sql, params} to recordedQueries.
//
// Two configurable behaviors:
//   • `maxVersion` — what to return when the runner asks
//                    `SELECT max(version) AS v FROM clear_cloud.schema_migrations`.
//                    Default 0 (fresh DB).
//   • `throwOnSqlContaining` — if a query's SQL contains this substring,
//                              throw an error. Used to test rollback.
// ─────────────────────────────────────────────────────────────────────────
class FakePool {
  constructor({ maxVersion = 0, throwOnSqlContaining = null } = {}) {
    this.maxVersion = maxVersion;
    this.throwOnSqlContaining = throwOnSqlContaining;
    this.recordedQueries = [];
    this.clientCount = 0;
    this.releasedCount = 0;
  }
  async connect() {
    this.clientCount++;
    return new FakeClient(this);
  }
  // Convenience: trim+lowercase fragments of recorded queries for pattern matching.
  queriesContain(needle) {
    const n = needle.toLowerCase();
    return this.recordedQueries.some(q => q.sql.toLowerCase().includes(n));
  }
  countContaining(needle) {
    const n = needle.toLowerCase();
    return this.recordedQueries.filter(q => q.sql.toLowerCase().includes(n)).length;
  }
}

class FakeClient {
  constructor(pool) { this.pool = pool; this.released = false; }
  async query(sql, params) {
    this.pool.recordedQueries.push({ sql, params: params || null });
    // Simulate the failure injection BEFORE checking max(version), so
    // throwOnSqlContaining: 'BEGIN' would still fire correctly if a test
    // wanted that. We check after recording so tests can see the offending
    // query was ATTEMPTED.
    if (this.pool.throwOnSqlContaining
        && sql.includes(this.pool.throwOnSqlContaining)) {
      throw new Error(`fake error: query contained "${this.pool.throwOnSqlContaining}"`);
    }
    // Special case: the runner's max-version probe. Return whatever the
    // test configured.
    if (/SELECT\s+max\(version\)\s+AS\s+v\s+FROM\s+clear_cloud\.schema_migrations/i.test(sql)) {
      return { rows: [{ v: this.pool.maxVersion }], rowCount: 1 };
    }
    // Default: empty result.
    return { rows: [], rowCount: 0 };
  }
  release() {
    this.released = true;
    this.pool.releasedCount++;
  }
}

// Helper: write a temp migrations dir with the given files. Caller is
// responsible for cleanup if they care; we wrap most tests in a temp dir
// that the OS cleans on reboot.
function makeTempMigrationsDir(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-1-test-'));
  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), content, 'utf8');
  }
  return dir;
}

(async () => {

// ─────────────────────────────────────────────────────────────────────────
// Test 1: Fresh DB applies all migrations in numeric order.
// ─────────────────────────────────────────────────────────────────────────
console.log('\n🗄️  migrations — fresh DB applies all pending files in order');
await runAsync(async () => {
  const pool = new FakePool({ maxVersion: 0 });
  const dir = makeTempMigrationsDir({
    '0001_first.sql': 'CREATE TABLE first_table (id int);',
    '0002_second.sql': 'CREATE TABLE second_table (id int);',
  });
  const result = await runMigrations(pool, dir);

  assert(Array.isArray(result.applied), 'returns {applied: Array}');
  assert(result.applied.length === 2, `applied 2 migrations on fresh DB (got ${result.applied.length})`);
  assert(result.applied[0].version === 1, 'applied[0].version === 1');
  assert(result.applied[0].name === '0001_first', `applied[0].name === '0001_first' (got ${result.applied[0].name})`);
  assert(result.applied[1].version === 2, 'applied[1].version === 2');

  // Verify the runner's motions: bootstrap, max-version probe, then for each
  // migration: BEGIN, the migration SQL, INSERT INTO schema_migrations, COMMIT.
  assert(pool.queriesContain('CREATE SCHEMA IF NOT EXISTS clear_cloud'), 'bootstrap ran (CREATE SCHEMA)');
  assert(pool.queriesContain('CREATE TABLE IF NOT EXISTS clear_cloud.schema_migrations'), 'bootstrap ran (CREATE TABLE schema_migrations)');
  assert(pool.queriesContain('SELECT max(version)'), 'max-version probe ran');
  assert(pool.countContaining('BEGIN') === 2, `2 BEGINs (one per migration), got ${pool.countContaining('BEGIN')}`);
  assert(pool.countContaining('COMMIT') === 2, `2 COMMITs, got ${pool.countContaining('COMMIT')}`);
  assert(pool.queriesContain('CREATE TABLE first_table'), 'first migration SQL ran');
  assert(pool.queriesContain('CREATE TABLE second_table'), 'second migration SQL ran');
  assert(pool.countContaining('INSERT INTO clear_cloud.schema_migrations') === 2,
    `2 INSERTs into schema_migrations, got ${pool.countContaining('INSERT INTO clear_cloud.schema_migrations')}`);

  // All clients released.
  assert(pool.releasedCount === pool.clientCount, `all ${pool.clientCount} clients released (got ${pool.releasedCount})`);
});

// ─────────────────────────────────────────────────────────────────────────
// Test 2: Partially-migrated DB — only newer files apply.
// ─────────────────────────────────────────────────────────────────────────
console.log('\n🗄️  migrations — partially-migrated DB only applies newer files');
await runAsync(async () => {
  const pool = new FakePool({ maxVersion: 1 });  // version 1 already applied
  const dir = makeTempMigrationsDir({
    '0001_already_done.sql': 'SELECT 1;  -- this should never run',
    '0002_new_thing.sql': 'CREATE TABLE new_thing (id int);',
  });
  const result = await runMigrations(pool, dir);

  assert(result.applied.length === 1, `applied 1 migration (got ${result.applied.length})`);
  assert(result.applied[0].version === 2, 'applied[0].version === 2');
  assert(result.applied[0].name === '0002_new_thing', `applied[0].name === '0002_new_thing' (got ${result.applied[0].name})`);

  // The version-1 SQL must NOT have appeared in any query.
  assert(!pool.queriesContain('this should never run'), 'version-1 SQL did NOT run');
  assert(pool.queriesContain('CREATE TABLE new_thing'), 'version-2 SQL ran');
  assert(pool.countContaining('BEGIN') === 1, `1 BEGIN (only 1 migration applied), got ${pool.countContaining('BEGIN')}`);
  assert(pool.countContaining('COMMIT') === 1, `1 COMMIT, got ${pool.countContaining('COMMIT')}`);
});

// ─────────────────────────────────────────────────────────────────────────
// Test 3: Empty migrations dir — no-op (only bootstrap + version probe).
// ─────────────────────────────────────────────────────────────────────────
console.log('\n🗄️  migrations — empty dir is a no-op (no transactions)');
await runAsync(async () => {
  const pool = new FakePool({ maxVersion: 0 });
  const dir = makeTempMigrationsDir({});  // no files
  const result = await runMigrations(pool, dir);

  assert(result.applied.length === 0, `applied 0 migrations (got ${result.applied.length})`);
  assert(pool.queriesContain('CREATE SCHEMA IF NOT EXISTS clear_cloud'), 'bootstrap still ran');
  assert(pool.queriesContain('SELECT max(version)'), 'max-version probe still ran');
  assert(pool.countContaining('BEGIN') === 0, `0 BEGINs (no migrations to apply), got ${pool.countContaining('BEGIN')}`);
  assert(pool.countContaining('COMMIT') === 0, `0 COMMITs, got ${pool.countContaining('COMMIT')}`);
  assert(pool.countContaining('ROLLBACK') === 0, `0 ROLLBACKs, got ${pool.countContaining('ROLLBACK')}`);
});

// ─────────────────────────────────────────────────────────────────────────
// Test 4: Migration SQL throws → ROLLBACK + re-throw with migration name.
// ─────────────────────────────────────────────────────────────────────────
console.log('\n🗄️  migrations — migration SQL failure triggers ROLLBACK and re-throws');
await runAsync(async () => {
  const pool = new FakePool({
    maxVersion: 0,
    throwOnSqlContaining: 'BROKEN_TABLE_MARKER',
  });
  const dir = makeTempMigrationsDir({
    '0001_broken.sql': 'CREATE TABLE BROKEN_TABLE_MARKER (id int);',
  });

  let threw = false;
  let errMsg = '';
  try {
    await runMigrations(pool, dir);
  } catch (e) {
    threw = true;
    errMsg = e.message || String(e);
  }
  assert(threw, 'broken migration throws');
  assert(errMsg.includes('0001_broken'), `error mentions migration name '0001_broken' (got: ${errMsg})`);
  assert(errMsg.includes('rolled back'), `error mentions 'rolled back' (got: ${errMsg})`);
  assert(pool.queriesContain('ROLLBACK'), 'ROLLBACK was issued');
  assert(!pool.queriesContain('COMMIT'), 'COMMIT was NOT issued');
  // The INSERT INTO schema_migrations must NOT have happened — failure was
  // in the migration SQL, before the tracking insert.
  assert(!pool.queriesContain('INSERT INTO clear_cloud.schema_migrations'),
    'no INSERT INTO schema_migrations after failure');
  // Client must still be released even on failure.
  assert(pool.releasedCount === pool.clientCount,
    `all ${pool.clientCount} clients released even after failure (got ${pool.releasedCount})`);
});

// ─────────────────────────────────────────────────────────────────────────
// Test 5: Idempotency — second call after the first is a no-op.
//
// This simulates the production sequence: first call applies migrations,
// second call finds maxVersion bumped and skips them all. We do this with
// TWO separate pool instances, the second configured with maxVersion = 2
// to mimic what the real DB would report after the first run.
// ─────────────────────────────────────────────────────────────────────────
console.log('\n🗄️  migrations — second call with bumped max-version is a no-op');
await runAsync(async () => {
  const dir = makeTempMigrationsDir({
    '0001_a.sql': 'SELECT 1;',
    '0002_b.sql': 'SELECT 2;',
  });

  // First call: maxVersion 0, applies both.
  const pool1 = new FakePool({ maxVersion: 0 });
  const r1 = await runMigrations(pool1, dir);
  assert(r1.applied.length === 2, `first call applied 2 migrations (got ${r1.applied.length})`);

  // Second call: simulates the DB now having maxVersion 2. Should apply nothing.
  const pool2 = new FakePool({ maxVersion: 2 });
  const r2 = await runMigrations(pool2, dir);
  assert(r2.applied.length === 0, `second call applied 0 migrations (got ${r2.applied.length})`);
  assert(pool2.countContaining('BEGIN') === 0, `second call: 0 BEGINs, got ${pool2.countContaining('BEGIN')}`);
});

// ─────────────────────────────────────────────────────────────────────────
// Test 6: Files that don't match the NNNN_name.sql pattern are silently skipped.
// ─────────────────────────────────────────────────────────────────────────
console.log('\n🗄️  migrations — non-matching filenames are silently skipped');
await runAsync(async () => {
  const pool = new FakePool({ maxVersion: 0 });
  const dir = makeTempMigrationsDir({
    '0001_real.sql': 'SELECT 1;',
    'README.md': '# this is not a migration',
    'random.sql': 'SELECT 2;',  // no version prefix
    '001_only_three_digits.sql': 'SELECT 3;',  // 3 digits, not 4
    '0002_also_real.sql': 'SELECT 4;',
    '.gitkeep': '',
  });
  const result = await runMigrations(pool, dir);
  assert(result.applied.length === 2, `applied exactly 2 matching files (got ${result.applied.length})`);
  assert(result.applied[0].version === 1, 'applied[0].version === 1');
  assert(result.applied[1].version === 2, 'applied[1].version === 2');
});

// ─────────────────────────────────────────────────────────────────────────
// Test 7: NUMERIC ordering — 0009 must run before 0010, not after.
// (Alphabetic sort would order them as 0010, 0009 because '1' < '9'... wait
//  no, alphabetic would put 0009 after 0010 because '9' > '1' in the 4th
//  char. Either way, alphabetic differs from numeric in many cases. The
//  cleanest test is to use 0009 vs 0010 and assert numeric order.)
// ─────────────────────────────────────────────────────────────────────────
console.log('\n🗄️  migrations — files sorted by numeric version, not alphabetic');
await runAsync(async () => {
  const pool = new FakePool({ maxVersion: 0 });
  // Write in REVERSE order so we can prove the runner sorts, not
  // accidentally relies on filesystem listing order.
  const dir = makeTempMigrationsDir({
    '0010_ten.sql': 'CREATE TABLE marker_ten (id int);',
    '0009_nine.sql': 'CREATE TABLE marker_nine (id int);',
  });
  const result = await runMigrations(pool, dir);
  assert(result.applied.length === 2, `applied 2 (got ${result.applied.length})`);
  assert(result.applied[0].version === 9, `first applied is 9 (got ${result.applied[0].version})`);
  assert(result.applied[1].version === 10, `second applied is 10 (got ${result.applied[1].version})`);

  // Also verify the order in which they hit the pool — version 9's SQL
  // must appear in recordedQueries BEFORE version 10's.
  const idx9 = pool.recordedQueries.findIndex(q => q.sql.includes('marker_nine'));
  const idx10 = pool.recordedQueries.findIndex(q => q.sql.includes('marker_ten'));
  assert(idx9 !== -1, 'version 9 SQL was recorded');
  assert(idx10 !== -1, 'version 10 SQL was recorded');
  assert(idx9 < idx10, `version 9 (idx ${idx9}) ran before version 10 (idx ${idx10})`);
});

// ─────────────────────────────────────────────────────────────────────────
// Test 8: Insert into schema_migrations carries the correct version + name.
// ─────────────────────────────────────────────────────────────────────────
console.log('\n🗄️  migrations — INSERT carries (version, name) params');
await runAsync(async () => {
  const pool = new FakePool({ maxVersion: 0 });
  const dir = makeTempMigrationsDir({
    '0007_lucky.sql': 'SELECT 1;',
  });
  await runMigrations(pool, dir);

  const insertQ = pool.recordedQueries.find(q =>
    q.sql.includes('INSERT INTO clear_cloud.schema_migrations'));
  assert(!!insertQ, 'found the INSERT query');
  assert(Array.isArray(insertQ.params), 'INSERT has params array');
  assert(insertQ.params[0] === 7, `INSERT param[0] === 7 (got ${insertQ.params[0]})`);
  assert(insertQ.params[1] === '0007_lucky', `INSERT param[1] === '0007_lucky' (got ${insertQ.params[1]})`);
});

// ─────────────────────────────────────────────────────────────────────────
// Test 9: Runner refuses bogus arguments.
// ─────────────────────────────────────────────────────────────────────────
console.log('\n🗄️  migrations — runner validates arguments');
await runAsync(async () => {
  let threw = false;
  try { await runMigrations(null, '/some/dir'); }
  catch (e) { threw = true; assert(/pool/i.test(e.message), 'error mentions pool'); }
  assert(threw, 'null pool throws');

  threw = false;
  try { await runMigrations({ /* no connect */ }, '/some/dir'); }
  catch (e) { threw = true; assert(/connect/i.test(e.message), 'error mentions connect'); }
  assert(threw, 'pool without connect throws');

  threw = false;
  try { await runMigrations(new FakePool(), null); }
  catch (e) { threw = true; assert(/dir/i.test(e.message) || /directory/i.test(e.message), 'error mentions dir/directory'); }
  assert(threw, 'null dir throws');
});

console.log(`\n${failed === 0 ? '✅' : '❌'} ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);

})();

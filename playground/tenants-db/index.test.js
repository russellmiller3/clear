// =============================================================================
// CC-1a — Tenants DB Node client tests
// =============================================================================
// Tests for playground/tenants-db/index.js that don't require a real
// Postgres. Covers: error paths when DATABASE_URL / pg missing, migration
// file loader, and shape invariants. Real DB tests come when Phase 85a
// lands.
//
// Run: node playground/tenants-db/index.test.js
// =============================================================================

import { loadMigration001, loadMigration002, getPool, _resetPool } from './index.js';

let passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}`); }
}

console.log('\n📄 loadMigration001\n');

{
  const sql = loadMigration001();
  assert(typeof sql === 'string' && sql.length > 100,
    `returns the migration SQL as a string (${sql.length} bytes)`);
  assert(sql.toLowerCase().includes('create table if not exists tenants'),
    'loaded SQL contains the tenants CREATE TABLE');
  assert(sql.toLowerCase().includes('create table if not exists apps'),
    'loaded SQL contains the apps CREATE TABLE');
  assert(sql.toLowerCase().includes('create table if not exists deploys'),
    'loaded SQL contains the deploys CREATE TABLE');
  assert(sql.toLowerCase().includes('create table if not exists usage_rows'),
    'loaded SQL contains the usage_rows CREATE TABLE');
}

console.log('\n🔌 getPool — error paths\n');

// Missing DATABASE_URL → clear error naming the env var
{
  await _resetPool();
  const origUrl = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  try {
    await getPool();
    assert(false, 'expected throw when DATABASE_URL unset');
  } catch (err) {
    assert(err.message.includes('DATABASE_URL'),
      `error message names DATABASE_URL (got "${err.message.slice(0, 80)}")`);
    assert(err.message.toLowerCase().includes('tenants-db'),
      'error is scoped to tenants-db so it\'s grep-able in logs');
  }
  if (origUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = origUrl;
}

// Explicit databaseUrl override skips the env check
{
  await _resetPool();
  // Use a URL that pg will SYNTACTICALLY accept but won't connect to —
  // getPool just constructs the Pool; connection is lazy on first query.
  const origUrl = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  try {
    const pool = await getPool({ databaseUrl: 'postgres://never/localhost-test' });
    assert(pool && typeof pool.query === 'function',
      'databaseUrl override returns a Pool with .query (connection is lazy)');
    // Close it cleanly so the test exits
    await pool.end();
  } catch (err) {
    // pg not installed — skip but don't fail; this is scaffold
    if (err.message.includes('`pg` package not installed')) {
      assert(true, 'pg not installed yet (scaffold state); error message guides install');
      assert(err.message.toLowerCase().includes('npm install pg'),
        'missing-pg error names the install command');
    } else {
      assert(false, `unexpected error: ${err.message}`);
    }
  }
  if (origUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = origUrl;
  await _resetPool();
}

// =============================================================================
// CC-2d — Migration 002 adds apps.team_id for app ownership
// =============================================================================
// Each deployed Clear app belongs to a team (team_members → access control
// for deploy/edit/view operations). tenants.id is the BILLING boundary;
// team_id is the COLLABORATION boundary. Nullable at schema-add time so
// existing pre-launch rows don't break the migration — a future backfill
// + NOT NULL CHECK locks it down once CC-2d's app-layer enforcement ships.
console.log('\n📄 loadMigration002 (CC-2d — apps.team_id)\n');

{
  const sql = loadMigration002();
  assert(typeof sql === 'string' && sql.length > 50,
    `returns the migration SQL as a string (${sql.length} bytes)`);
  // Adds team_id column
  assert(/alter\s+table\s+(if\s+exists\s+)?apps\s+add\s+column\s+(if\s+not\s+exists\s+)?team_id/i.test(sql),
    'migration adds team_id column to apps table');
  // References teams(id) for FK — relies on cloud-teams migration having run
  assert(/references\s+teams\s*\(\s*id\s*\)/i.test(sql),
    'team_id is a foreign key referencing teams(id)');
  // Index for the common "apps I can access" query
  assert(/create\s+index\s+(if\s+not\s+exists\s+)?\S*team_id/i.test(sql),
    'migration creates an index on apps.team_id');
}

console.log(`\n${failed === 0 ? '✅' : '❌'} ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);

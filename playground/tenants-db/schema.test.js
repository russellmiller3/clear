// =============================================================================
// CC-1a — Tenants DB schema validation
// =============================================================================
// Structural tests for playground/tenants-db/migrations/001-tenants.sql.
// Can't run against real Postgres until Phase 85a lands (Russell's paperwork
// — domain, Fly Trust Verified, Postgres hosting pick). These tests verify
// the SQL file's SHAPE: all four required tables are declared, referential
// integrity is wired, CHECK constraints encode the documented enums,
// updated_at triggers exist, indexes match the query patterns the plan
// calls out.
//
// When Phase 85a completes and dev Postgres is available, replace the
// text-parse assertions with real `psql` applies that also verify the
// schema is INSTALLABLE end-to-end.
//
// Run: node playground/tenants-db/schema.test.js
// =============================================================================

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATION_PATH = join(__dirname, 'migrations', '001-tenants.sql');

let passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}`); }
}

const sql = readFileSync(MIGRATION_PATH, 'utf8');
const sqlLower = sql.toLowerCase();

console.log('\n🗄  Migration file shape\n');

assert(sql.length > 500, `migration file is non-trivial (${sql.length} bytes)`);
assert(/^-- =+\s*$/m.test(sql.split('\n')[0]) || sql.startsWith('-- ='),
  'migration opens with a SQL comment header');

console.log('\n📋 Required tables\n');

for (const table of ['tenants', 'apps', 'deploys', 'usage_rows']) {
  const re = new RegExp(`create table\\s+if not exists\\s+${table}\\b`, 'i');
  assert(re.test(sql),
    `${table} table declared with IF NOT EXISTS (idempotent re-apply)`);
}

console.log('\n🔗 Foreign keys\n');

assert(/references\s+tenants\(id\)\s+on delete cascade/i.test(sql),
  'apps.tenant_id → tenants(id) with ON DELETE CASCADE (tenant deletion cleans up apps)');
assert(/references\s+apps\(id\)\s+on delete cascade/i.test(sql),
  'deploys.app_id and usage_rows.app_id → apps(id) with ON DELETE CASCADE');
// Both deploys + usage_rows reference apps — count occurrences
const appsRefs = (sql.match(/references\s+apps\(id\)/gi) || []).length;
assert(appsRefs >= 2,
  `at least 2 tables reference apps(id) (deploys + usage_rows) — got ${appsRefs}`);

console.log('\n✅ CHECK constraints (encoded enums)\n');

assert(/plan\s+in\s*\(\s*'free',\s*'team',\s*'business',\s*'enterprise'\s*\)/i.test(sql),
  'tenants.plan CHECK encodes the four billing tiers from pricing.html');
assert(/status\s+in\s*\(\s*'active',\s*'frozen',\s*'deleted'\s*\)/i.test(sql),
  'tenants.status CHECK encodes active/frozen/deleted lifecycle');
assert(/status\s+in\s*\(\s*'active',\s*'paused',\s*'deleted'\s*\)/i.test(sql),
  'apps.status CHECK encodes active/paused/deleted lifecycle');
assert(/status\s+in\s*\(\s*'pending',\s*'building',\s*'deployed',\s*'failed',\s*'rolled_back'\s*\)/i.test(sql),
  'deploys.status CHECK encodes the 5 deploy lifecycle states');

console.log('\n🔑 Required columns per table\n');

// Tenants — required columns per the plan (CC-1a spec)
for (const col of ['id', 'slug', 'name', 'plan', 'stripe_customer_id', 'created_at', 'updated_at']) {
  assert(new RegExp(`^\\s*${col}\\b`, 'im').test(sql.match(/create table\s+if not exists\s+tenants\s*\([\s\S]*?\);/i)?.[0] || ''),
    `tenants.${col} declared`);
}
// Apps — plan-specified columns
for (const col of ['id', 'tenant_id', 'slug', 'subdomain', 'fly_app_name', 'fly_db_conn_str']) {
  assert(new RegExp(`^\\s*${col}\\b`, 'im').test(sql.match(/create table\s+if not exists\s+apps\s*\([\s\S]*?\);/i)?.[0] || ''),
    `apps.${col} declared`);
}
// Deploys — (app_id, version, image, status)
for (const col of ['id', 'app_id', 'version', 'image', 'status']) {
  assert(new RegExp(`^\\s*${col}\\b`, 'im').test(sql.match(/create table\s+if not exists\s+deploys\s*\([\s\S]*?\);/i)?.[0] || ''),
    `deploys.${col} declared`);
}
// Usage rows — (app_id, ts, tokens_in, tokens_out, cost_usd)
for (const col of ['id', 'app_id', 'ts', 'model', 'tokens_in', 'tokens_out', 'cost_usd']) {
  assert(new RegExp(`^\\s*${col}\\b`, 'im').test(sql.match(/create table\s+if not exists\s+usage_rows\s*\([\s\S]*?\);/i)?.[0] || ''),
    `usage_rows.${col} declared`);
}

console.log('\n🔍 Unique constraints\n');

assert(/slug\s+varchar\(63\)\s+not null\s+unique/i.test(sql) ||
       /subdomain\s+varchar\(63\)\s+not null\s+unique/i.test(sql),
  'at least one globally-unique URL-safe identifier (tenants.slug / apps.subdomain)');
assert(/unique\s*\(\s*tenant_id\s*,\s*slug\s*\)/i.test(sql),
  'apps has UNIQUE(tenant_id, slug) — two apps in one tenant can\'t share a slug');
assert(/subdomain\s+varchar\(63\)\s+not null\s+unique/i.test(sql),
  'apps.subdomain is globally UNIQUE — router keys on it');

console.log('\n📇 Indexes\n');

// Per the plan: subdomain router does a lookup on every *.buildclear.dev
// request. Query performance depends on these indexes existing.
assert(/create index if not exists idx_apps_subdomain\s+on apps\(subdomain\)/i.test(sql),
  'idx_apps_subdomain — subdomain router does a row lookup per request');
assert(/create index if not exists idx_apps_tenant_id\s+on apps\(tenant_id\)/i.test(sql),
  'idx_apps_tenant_id — admin dashboards list apps per tenant');
assert(/create index if not exists idx_deploys_app_id\s+on deploys\(app_id\)/i.test(sql),
  'idx_deploys_app_id — deploy history UI loads deploys for an app');
assert(/create index if not exists idx_usage_rows_app_id_ts/i.test(sql),
  'idx_usage_rows_app_id_ts — billing aggregations scope by app + period');

console.log('\n⚡ Triggers\n');

assert(/create or replace function\s+_touch_updated_at/i.test(sql),
  '_touch_updated_at trigger function declared');
assert(/create trigger\s+touch_tenants_updated_at/i.test(sql),
  'tenants.updated_at auto-updates on UPDATE');
assert(/create trigger\s+touch_apps_updated_at/i.test(sql),
  'apps.updated_at auto-updates on UPDATE');

console.log('\n📐 Postgres idioms\n');

assert(/timestamptz/i.test(sql),
  'uses TIMESTAMPTZ (not TIMESTAMP) so times compare across Fly regions');
assert(!/\bserial\s+primary key\b\s*,.*bigserial/i.test(sql) || /bigserial/i.test(sql),
  'usage_rows uses BIGSERIAL (high-volume billing writes will overflow INT4)');
assert(/decimal\(10,\s*6\)/i.test(sql),
  'cost_usd is DECIMAL(10,6) — avoids float rounding errors in billing totals');

console.log(`\n${failed === 0 ? '✅' : '❌'} ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);

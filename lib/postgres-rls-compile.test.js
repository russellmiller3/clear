// Compile-shape regression net for the Postgres RLS emit.
//
// The runtime layer (db-postgres.js) is unit-tested in
// runtime/db-postgres-rls.test.js. This file proves the compiler emits
// the right CALLS into the runtime — middleware + startup hook —
// strictly when both `shared with tenant scope` AND a Postgres backend
// are declared. Anything narrower or broader is a regression.

import { compileProgram } from '../index.js';

let passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; console.log('  PASS ' + msg); }
  else { failed++; console.log('  FAIL ' + msg); }
}
function group(name) { console.log('\n  ' + name); }

// ─────────────────────────────────────────────────────────────────────────
group('Postgres + shared scope: emits both the middleware and the startup hook');
{
  const src = `target: backend
database is postgres with tenant scope
requires login

create a Deal table:
  title is text
  amount is number

create a Lead table:
  email is text
`;
  const r = compileProgram(src);
  assert(r.errors.length === 0, 'compiles with no errors (' + r.errors.length + ' got)');
  const js = r.javascript;

  // Marker comments — quick visual signal in the compiled output
  assert(/postgres-rls: enabled/.test(js), 'header marker comment is present');
  assert(/postgres-rls: per-request tenant context/.test(js), 'middleware section is annotated');
  assert(/postgres-rls: enable row-level security on every shared-scope table/.test(js), 'startup section is annotated');

  // Middleware shape — it must wrap req.user.tenant_id in withTenantScope
  assert(/app\.use\(\(req, res, next\)/.test(js), 'middleware uses Express signature');
  assert(/db\.withTenantScope\(req\.user\.tenant_id/.test(js), 'middleware threads req.user.tenant_id into withTenantScope');
  assert(/req\.user && req\.user\.tenant_id !== undefined && req\.user\.tenant_id !== null/.test(js),
    'middleware guards against missing/null tenant_id (skips withTenantScope when not authenticated)');

  // Startup hook — one enableRowLevelSecurity call per data shape
  assert(/await db\.enableRowLevelSecurity\("deals"\)/.test(js), 'enableRowLevelSecurity called for deals');
  assert(/await db\.enableRowLevelSecurity\("leads"\)/.test(js), 'enableRowLevelSecurity called for leads');

  // Hook is async-fire-and-forget so it doesn't gate listen
  assert(/\(async \(\) => \{[\s\S]*?await db\.enableRowLevelSecurity[\s\S]*?\}\)\(\);/.test(js),
    'startup hook is an async IIFE (fire-and-forget so listen does not wait)');

  // Failure path: error caught, app filter still active
  assert(/\[clear:rls\] init failed \(app-layer filter still active\)/.test(js),
    'startup hook logs a clear failure mode that points at the surviving app-layer filter');
}

// ─────────────────────────────────────────────────────────────────────────
group('SQLite + shared scope: app-layer filter only — NO RLS emit');
{
  const src = `target: backend
database is shared with tenant scope
requires login

create a Deal table:
  title is text
`;
  const r = compileProgram(src);
  assert(r.errors.length === 0, 'compiles with no errors');
  const js = r.javascript;
  assert(!/postgres-rls/.test(js), 'no postgres-rls marker (SQLite path)');
  assert(!/withTenantScope/.test(js), 'no withTenantScope middleware (SQLite path)');
  assert(!/enableRowLevelSecurity/.test(js), 'no enableRowLevelSecurity startup hook (SQLite path)');
  // Phase 2 app-filter still active
  assert(/tenant-isolation: enabled/.test(js), 'tenant-isolation marker still present (app-layer filter active)');
}

// ─────────────────────────────────────────────────────────────────────────
group('Postgres without shared scope: regular Postgres app — NO RLS emit');
{
  const src = `target: backend
database is postgres

create a Deal table:
  title is text
`;
  const r = compileProgram(src);
  assert(r.errors.length === 0, 'compiles with no errors');
  const js = r.javascript;
  assert(!/postgres-rls/.test(js), 'no postgres-rls marker (no tenant scope)');
  assert(!/withTenantScope/.test(js), 'no withTenantScope middleware (no tenant scope)');
  assert(!/enableRowLevelSecurity/.test(js), 'no enableRowLevelSecurity (no tenant scope)');
}

// ─────────────────────────────────────────────────────────────────────────
group('Plain SQLite without tenant scope: smallest baseline — NO RLS, NO tenant filter');
{
  const src = `target: backend

create a Deal table:
  title is text
`;
  const r = compileProgram(src);
  assert(r.errors.length === 0, 'compiles with no errors');
  const js = r.javascript;
  assert(!/postgres-rls/.test(js), 'no postgres-rls marker');
  assert(!/withTenantScope/.test(js), 'no withTenantScope middleware');
  assert(!/enableRowLevelSecurity/.test(js), 'no enableRowLevelSecurity');
  assert(!/tenant-isolation: enabled/.test(js), 'no tenant-isolation marker either');
}

// ─────────────────────────────────────────────────────────────────────────
group('Postgres + shared scope but zero data shapes: middleware emits, startup hook does not');
{
  const src = `target: backend
database is postgres with tenant scope
requires login
`;
  const r = compileProgram(src);
  assert(r.errors.length === 0, 'compiles with no errors');
  const js = r.javascript;
  // Middleware should still emit (incoming requests with tenant_id need scope)
  assert(/db\.withTenantScope/.test(js), 'middleware emits even with zero data shapes (incoming JWT has tenant_id, downstream code may add tables)');
  // Startup hook should skip — no tables to enable RLS on
  assert(!/enableRowLevelSecurity/.test(js), 'startup hook skipped when no data shapes (nothing to enable RLS on)');
}

console.log('\n=== ' + passed + ' passed, ' + failed + ' failed ===');
process.exit(failed > 0 ? 1 : 0);

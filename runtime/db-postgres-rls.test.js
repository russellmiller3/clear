// Tests for the tenant-scoped row-level security layer in db-postgres.js.
//
// We don't need a real Postgres for these — we mock pg.Pool so the helpers
// emit their queries against a FakePool that captures them. Three things
// to prove:
//
//   1. `withTenantScope(id, fn)` threads the id through nested awaits so
//      every CRUD call inside `fn` sees the right tenant.
//   2. `enableRowLevelSecurity(table)` runs the right DDL: ALTER TABLE
//      ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY, DROP POLICY,
//      CREATE POLICY with the tenant_id check.
//   3. CRUD calls (findAll, insert, etc.) under tenant scope wrap their
//      query in BEGIN + SET LOCAL app.current_tenant_id + query + COMMIT.
//      CRUD calls outside tenant scope go straight to pool.query.
//
// Test substrate: a hand-rolled FakePool. pg-mem doesn't fully support
// RLS / current_setting / SET LOCAL semantics, so we inject a fake pool
// via require.cache surgery before requiring db-postgres.

'use strict';

// =============================================================================
// FAKE POOL — captures every query/connect for assertions
// =============================================================================

// Each Connection records its query log and the order of operations.
function makeFakeConnection(queryLog) {
  return {
    queries: [],
    released: false,
    async query(sql, params) {
      this.queries.push({ sql: sql, params: params || [] });
      queryLog.push({ via: 'connection', sql: sql, params: params || [] });
      // Fake the result shape pg returns.
      if (/^SELECT 1\b/i.test(sql)) return { rows: [], rowCount: 0 };
      if (/^INSERT/i.test(sql)) return { rows: [{ id: 1 }], rowCount: 1 };
      if (/^SELECT.*information_schema/i.test(sql)) return { rows: [], rowCount: 0 };
      if (/^SELECT/i.test(sql)) return { rows: [], rowCount: 0 };
      return { rows: [], rowCount: 0 };
    },
    release() {
      this.released = true;
    },
  };
}

// Top-level Pool.query goes here. Pool.connect() returns a Connection.
function makeFakePool() {
  var queryLog = [];
  var connections = [];
  var pool = {
    queryLog: queryLog,
    connections: connections,
    async query(sql, params) {
      queryLog.push({ via: 'pool', sql: sql, params: params || [] });
      if (/^SELECT.*information_schema/i.test(sql)) return { rows: [], rowCount: 0 };
      if (/^SELECT/i.test(sql)) return { rows: [], rowCount: 0 };
      return { rows: [], rowCount: 0 };
    },
    async connect() {
      var c = makeFakeConnection(queryLog);
      connections.push(c);
      return c;
    },
    end() {},
  };
  return pool;
}

// Inject the fake pool into the pg module BEFORE require('./db-postgres').
// require.cache surgery — replace the cached pg module with one that
// returns our FakePool from `new Pool(...)`.
var fakePool;
function installFakePg() {
  fakePool = makeFakePool();
  // Build a fake pg module that has a Pool constructor returning our fake.
  var fakePgModule = {
    Pool: function FakePool() { return fakePool; },
  };
  // Find the resolved path of pg in require.cache, replace its exports.
  var pgPath;
  try {
    pgPath = require.resolve('pg');
  } catch (e) {
    // pg isn't installed in node_modules. Fall back to monkey-patching the
    // module loader: prime require.cache with a fake entry under any path
    // that ends in /pg/, and prepend a hook to require so 'pg' resolves.
    pgPath = '__fake_pg__';
  }
  require.cache[pgPath] = {
    id: pgPath,
    filename: pgPath,
    loaded: true,
    exports: fakePgModule,
  };
  // Also prime the bare specifier 'pg' via Module._cache lookup. The
  // db-postgres module does `require('pg')`, which Node resolves by
  // walking up node_modules. If pg is missing entirely, we monkey-patch
  // Module._load to short-circuit the resolve.
  var Module = require('module');
  var origLoad = Module._load;
  Module._load = function(request, parent, isMain) {
    if (request === 'pg') return fakePgModule;
    return origLoad.apply(this, arguments);
  };
  // Set DATABASE_URL so getPool() doesn't throw.
  process.env.DATABASE_URL = 'postgres://fake@localhost:5432/fake';
}

// Run installFakePg BEFORE the require so the fake pg gets picked up.
installFakePg();

// Force a fresh require of db-postgres (not from any prior cache entry).
delete require.cache[require.resolve('./db-postgres.js')];
var db = require('./db-postgres.js');

// =============================================================================
// TEST RUNNER
// =============================================================================

var passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; console.log('  PASS ' + msg); }
  else { failed++; console.log('  FAIL ' + msg); }
}
async function runAsync(name, fn) {
  console.log('\n  ' + name);
  // Reset capture log between tests.
  fakePool.queryLog.length = 0;
  fakePool.connections.length = 0;
  try { await fn(); }
  catch (e) { failed++; console.log('  FAIL UNHANDLED: ' + (e.message || e) + (e.stack ? '\n' + e.stack : '')); }
}

// =============================================================================
// TESTS
// =============================================================================

(async function() {
  console.log('\n=== runtime/db-postgres.js — tenant-scoped RLS ===');

  // ---------------------------------------------------------------------------
  await runAsync('withTenantScope threads tenant id through nested awaits', async () => {
    db.createTable('deals', { name: { type: 'text' }, amount: { type: 'number' } });
    var seenInScope, seenAfter;
    await db.withTenantScope(42, async () => {
      // Inside the scope: a CRUD call should see tenant 42 and use a connection.
      await db.findAll('deals');
      seenInScope = fakePool.connections.length;
    });
    // Outside the scope: a CRUD call goes straight to pool.query.
    fakePool.queryLog.length = 0;
    fakePool.connections.length = 0;
    await db.findAll('deals');
    seenAfter = fakePool.connections.length;

    assert(seenInScope === 1, 'CRUD inside withTenantScope acquires one connection (got ' + seenInScope + ')');
    assert(seenAfter === 0, 'CRUD outside withTenantScope skips connect() entirely (got ' + seenAfter + ')');
  });

  // ---------------------------------------------------------------------------
  await runAsync('CRUD inside tenant scope wraps query in BEGIN + SET LOCAL + COMMIT', async () => {
    db.createTable('orders', { product: { type: 'text' } });
    await db.withTenantScope(7, async () => {
      await db.findAll('orders');
    });
    var conn = fakePool.connections[0];
    assert(conn !== undefined, 'a connection was acquired');
    var sqls = (conn.queries || []).map(function(q) { return q.sql.trim(); });
    assert(sqls[0] === 'BEGIN', 'first query is BEGIN (got ' + sqls[0] + ')');
    assert(/^SET LOCAL app\.current_tenant_id = 7$/.test(sqls[1]), 'second query sets the tenant id to 7 (got ' + sqls[1] + ')');
    assert(/^SELECT \* FROM orders/i.test(sqls[2]), 'third query is the actual SELECT (got ' + sqls[2] + ')');
    assert(sqls[3] === 'COMMIT', 'last query is COMMIT (got ' + sqls[3] + ')');
    assert(conn.released === true, 'connection is released back to the pool');
  });

  // ---------------------------------------------------------------------------
  await runAsync('SET LOCAL value comes from the tenant id, not from a literal', async () => {
    db.createTable('invoices', { amount: { type: 'number' } });
    await db.withTenantScope(99, async () => { await db.findAll('invoices'); });
    var firstConn = fakePool.connections[0];
    var setLocal = firstConn.queries.find(function(q) { return /SET LOCAL/i.test(q.sql); });
    assert(setLocal !== undefined, 'SET LOCAL was issued');
    assert(/= 99$/.test(setLocal.sql), 'tenant id 99 is interpolated (got ' + setLocal.sql + ')');
  });

  // ---------------------------------------------------------------------------
  await runAsync('withTenantScope rejects non-finite ids without leaking scope', async () => {
    db.createTable('tickets', { title: { type: 'text' } });
    var conns = 0;
    await db.withTenantScope(NaN, async () => {
      // NaN should be rejected — fn runs without scope, so CRUD goes to pool.
      await db.findAll('tickets');
      conns = fakePool.connections.length;
    });
    assert(conns === 0, 'NaN tenant id falls through to pool.query, no connect() (got ' + conns + ')');
  });

  // ---------------------------------------------------------------------------
  await runAsync('enableRowLevelSecurity issues ENABLE + FORCE + CREATE POLICY DDL', async () => {
    db.createTable('leads', { email: { type: 'text' } });
    await db.enableRowLevelSecurity('leads');
    var sqls = fakePool.queryLog.map(function(q) { return q.sql.trim(); });
    var hasEnable = sqls.some(function(s) { return /^ALTER TABLE leads ENABLE ROW LEVEL SECURITY$/.test(s); });
    var hasForce = sqls.some(function(s) { return /^ALTER TABLE leads FORCE ROW LEVEL SECURITY$/.test(s); });
    var hasDrop = sqls.some(function(s) { return /^DROP POLICY IF EXISTS clear_tenant_isolation ON leads$/.test(s); });
    var hasCreate = sqls.some(function(s) {
      return /^CREATE POLICY clear_tenant_isolation ON leads/.test(s) &&
             /current_setting\('app\.current_tenant_id', true\)::int/.test(s);
    });
    assert(hasEnable, 'ENABLE ROW LEVEL SECURITY was issued');
    assert(hasForce, 'FORCE ROW LEVEL SECURITY was issued (defense in depth — owner cannot bypass)');
    assert(hasDrop, 'DROP POLICY IF EXISTS clear_tenant_isolation was issued (idempotent recreate)');
    assert(hasCreate, 'CREATE POLICY references current_setting(app.current_tenant_id)');
  });

  // ---------------------------------------------------------------------------
  await runAsync('enableRowLevelSecurity is idempotent — second call skips DDL', async () => {
    db.createTable('contacts', { name: { type: 'text' } });
    await db.enableRowLevelSecurity('contacts');
    var firstCallCount = fakePool.queryLog.length;
    fakePool.queryLog.length = 0;
    await db.enableRowLevelSecurity('contacts');
    assert(fakePool.queryLog.length === 0, 'second enableRowLevelSecurity call is a no-op (got ' + fakePool.queryLog.length + ' queries)');
    assert(firstCallCount > 0, 'first call did issue queries (sanity)');
  });

  // ---------------------------------------------------------------------------
  await runAsync('enableRowLevelSecurity rejects malicious table names', async () => {
    var threw = false;
    try { await db.enableRowLevelSecurity('users; DROP TABLE leads--'); }
    catch (e) { threw = /Invalid table name/.test(e.message); }
    assert(threw, 'rejects table name with non-identifier characters');
  });

  // ---------------------------------------------------------------------------
  await runAsync('insert under tenant scope wraps INSERT in transaction', async () => {
    db.createTable('reports', { title: { type: 'text' } });
    await db.withTenantScope(13, async () => {
      try { await db.insert('reports', { title: 'Q1' }); } catch (_) {}
    });
    // The insert should have used a connection (transactional path), not pool.query.
    assert(fakePool.connections.length >= 1, 'insert under tenant scope acquires a connection');
    var conn = fakePool.connections[fakePool.connections.length - 1];
    var sqls = conn.queries.map(function(q) { return q.sql.trim(); });
    assert(sqls.some(function(s) { return s === 'BEGIN'; }), 'BEGIN issued for insert');
    assert(sqls.some(function(s) { return /^SET LOCAL app\.current_tenant_id = 13$/.test(s); }), 'SET LOCAL with tenant id 13');
    assert(sqls.some(function(s) { return /^INSERT INTO reports/i.test(s); }), 'INSERT issued via the same scoped connection');
  });

  // =============================================================================
  console.log('\n=== ' + passed + ' passed, ' + failed + ' failed ===');
  process.exit(failed > 0 ? 1 : 0);
})().catch(function(e) {
  console.error('Fatal:', e);
  process.exit(1);
});

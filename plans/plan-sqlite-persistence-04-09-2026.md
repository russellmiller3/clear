# Plan: SQLite Persistence (Phase 47)
_Date: 2026-04-09 | Branch: feature/sqlite-persistence_

---

## 🎯 THE PROBLEM

Clear apps use an in-memory store (`runtime/db.js`) backed by a debounced JSON file write.
Data can be lost if the process is killed within the 100ms debounce window, and JSON file
writes are non-atomic (crash mid-write corrupts the file). Apps feel unreliable.

Root cause: persistence layer designed for zero-dep simplicity, not durability.

---

## 🔧 THE FIX

Replace `runtime/db.js` with a `better-sqlite3` implementation that exposes the **exact
same public API**. Compiled server code doesn't change — it still calls
`require('./clear-runtime/db')` and uses the same method names.

```
Before:                           After:
  in-memory JS objects              SQLite file (clear-data.db)
  + debounced JSON backup           atomic writes, WAL mode
  clear-data.json                   clear-data.db
  non-atomic writes                 durable by default
  data loss on kill -9              survives kill -9
```

**Why better-sqlite3:** synchronous API matches the current db.js contract exactly.
No async refactor needed anywhere. Fast. Battle-tested.

**Module resolution:** `better-sqlite3` installed in Clear root `node_modules/`.
When playground runs from `.playground-build/`, Node walks up and finds it at
`[clear-root]/node_modules/better-sqlite3`. Same for `.clear-serve/`.
For `clear package` (Dockerfile), we add it to the generated `package.json`.

**Boolean coercion:** SQLite stores booleans as 0/1. New db.js coerces back to
`true`/`false` on read using the stored schema.

**Schema evolution:** If user adds a new field and restarts, `ALTER TABLE ADD COLUMN`
runs for columns in schema that are missing from the table.

---

## 📁 FILES INVOLVED

### Modified
| File | What changes |
|------|-------------|
| `runtime/db.js` | Full rewrite — better-sqlite3 backend, same API |
| `package.json` | Add `better-sqlite3` dependency |
| `cli/clear.js` | `packageCommand`: add better-sqlite3 to generated package.json + update .dockerignore |
| `compiler.js` | Update test-runner comment (clear-data.json → clear-data.db) |
| `.gitignore` | Add `clear-data.db` entries |

### Not changing
| File | Why |
|------|-----|
| `compiler.js` (db require lines) | `require('./clear-runtime/db')` stays identical |
| `playground/server.js` | Already copies `db.js` from `runtime/` |
| All test files | Tests check compiled output strings, not runtime behavior |

---

## 🚨 EDGE CASES

| Scenario | How we handle it |
|----------|-----------------|
| Old `clear-data.json` exists | Ignored — new impl opens/creates `.db` file |
| Schema adds new column after data exists | `ALTER TABLE ADD COLUMN` in `createTable` |
| Schema removes a column | Old column stays in DB, ignored in JS reads |
| `reset()` called | `DELETE FROM` each known table + reset sqlite_sequence |
| `save()` / `load()` called | No-ops — SQLite is always durable |
| Boolean fields read back | Coerce `0` → `false`, `1` → `true` via schema |
| `better-sqlite3` not found | Throws at server startup with clear message |
| Number("") = 0 bug | Already guarded in `enforceTypes` — preserved |

---

## 🔄 INTEGRATION NOTES

- `clear serve` works: module resolution finds better-sqlite3 at Clear root
- `clear package` works: generated package.json gets better-sqlite3
- Playground works: `.playground-build/` resolves up to root node_modules
- No compiler changes — `db.*` call sites in compiled output are unchanged
- `db.run(sql)` becomes real (was no-op). No breaking change.

---

## 📋 IMPLEMENTATION STEPS

### Always read first
| File | Why |
|------|-----|
| `runtime/db.js` | Full source before overwriting |
| `compiler.js` line ~781 | Exact text for the comment to change |
| `cli/clear.js` line ~871 | Exact text for packageCommand deps |
| `cli/clear.js` line ~886 | Exact text for .dockerignore template |

---

### Cycle 1 🔴🟢🔄 — Install + rewrite runtime/db.js

**RED** — write smoke test, run it, confirm it fails (module doesn't exist yet):
```js
// test-db-sqlite.cjs  — delete after this cycle
const db = require('./runtime/db.js');
db.createTable('items', {
  name: { type: 'text', required: true },
  done: { type: 'boolean', default: false }
});
db.insert('items', { name: 'hello' });
db.insert('items', { name: 'world', done: true });
const all = db.findAll('items');
console.assert(all.length === 2, 'findAll');
console.assert(all[0].done === false, 'boolean false coercion: ' + all[0].done);
console.assert(all[1].done === true, 'boolean true coercion: ' + all[1].done);
const one = db.findOne('items', { name: 'hello' });
console.assert(one.name === 'hello', 'findOne');
db.update('items', { id: 1 }, { done: true });
const updated = db.findOne('items', { id: 1 });
console.assert(updated.done === true, 'update');
db.remove('items', { id: 1 });
console.assert(db.findAll('items').length === 1, 'remove');
db.reset();
console.assert(db.findAll('items').length === 0, 'reset');
console.log('ALL SMOKE TESTS PASS');
```
Run: `node test-db-sqlite.cjs` → should fail with require error.

**GREEN:**

Step 1 — install better-sqlite3:
```bash
npm install better-sqlite3
```
better-sqlite3 ships prebuilt binaries for Node 20/22/24 on Windows x64 via
`@mapbox/node-pre-gyp` — no MSVC needed. If the prebuild download fails (network
issue), the fallback build requires `windows-build-tools`. On Node 24, prebuilds
are available as of v12.x. If install fails, check error: prebuild failure = network,
native build failure = missing MSVC.

Step 2 — overwrite `runtime/db.js` with this implementation:

```js
// =============================================================================
// CLEAR RUNTIME — DATABASE MODULE (better-sqlite3 backend)
// =============================================================================
//
// PURPOSE: Provides the `db` API that compiled Clear backend code calls.
// Backed by SQLite via better-sqlite3. Durable, atomic, zero data loss.
//
// API:
//   db.createTable(name, schema)          — CREATE TABLE IF NOT EXISTS
//   db.findAll(table, filter?)            — SELECT * with optional WHERE
//   db.findOne(table, filter)             — SELECT * WHERE ... LIMIT 1
//   db.insert(table, record)              — INSERT, returns record with id
//   db.update(table, filterOrRecord, data?) — UPDATE matching records
//   db.remove(table, filter?)             — DELETE matching records
//   db.run(sql)                           — execute raw SQL
//   db.execute(sql)                       — alias for db.run
//   db.save()                             — no-op (SQLite is always durable)
//   db.load()                             — no-op (db opens on require)
//   db.reset()                            — DELETE FROM all known tables
//
// File location: ./clear-data.db (next to the compiled server.js)
//
// =============================================================================

'use strict';

const Database = require('better-sqlite3');
const path = require('path');

const DATA_FILE = path.join(process.cwd(), 'clear-data.db');
const _db = new Database(DATA_FILE);

// WAL mode: better concurrent read performance, safe with crashes
_db.pragma('journal_mode = WAL');
_db.pragma('synchronous = NORMAL');

// In-memory schema registry for validation + boolean coercion on read
const _schemas = {};

// =============================================================================
// TYPE HELPERS
// =============================================================================

function toSQLiteType(config) {
  if (!config || !config.type) return 'TEXT';
  switch (config.type) {
    case 'number': return 'REAL';
    case 'boolean': return 'INTEGER';
    case 'fk': return 'INTEGER';
    case 'timestamp': return 'TEXT';
    default: return 'TEXT';
  }
}

// Coerce SQLite 0/1 back to JS booleans using schema
function coerceRecord(record, schema) {
  if (!record || !schema) return record;
  const result = Object.assign({}, record);
  for (const [field, config] of Object.entries(schema)) {
    if (config.type === 'boolean' && result[field] !== undefined && result[field] !== null) {
      result[field] = result[field] === 1 || result[field] === true;
    }
  }
  return result;
}

// Coerce JS booleans to SQLite integers for storage
function coerceForStorage(value) {
  if (typeof value === 'boolean') return value ? 1 : 0;
  return value;
}

// =============================================================================
// VALIDATION (application-level constraints — run before SQL)
// =============================================================================

function sanitizeRecord(record) {
  if (!record || typeof record !== 'object') return record;
  const result = {};
  for (const [key, value] of Object.entries(record)) {
    if (typeof value === 'string') {
      result[key] = value
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')
        .replace(/on\w+\s*=\s*[^\s>]*/gi, '')
        .replace(/javascript\s*:/gi, '');
    } else {
      result[key] = value;
    }
  }
  return result;
}

function enforceTypes(record, schema) {
  if (!schema) return;
  for (const [field, config] of Object.entries(schema)) {
    if (record[field] === undefined || record[field] === null) continue;
    if (config.type === 'number') {
      // Empty string -> null, not 0. Number("") === 0 is a silent data corruption bug.
      if (record[field] === '' || (typeof record[field] === 'string' && record[field].trim() === '')) {
        record[field] = null;
        continue;
      }
      const num = Number(record[field]);
      if (isNaN(num)) throw new Error(field + ' must be a number, got ' + JSON.stringify(record[field]));
      record[field] = num;
    }
    if (config.type === 'boolean' && typeof record[field] === 'string') {
      if (record[field] === 'true') record[field] = true;
      else if (record[field] === 'false') record[field] = false;
    }
  }
}

function applyDefaults(record, schema) {
  if (!schema) return record;
  const result = Object.assign({}, record);
  for (const [field, config] of Object.entries(schema)) {
    if (result[field] === undefined && config.default !== undefined) result[field] = config.default;
    if (result[field] === undefined && config.auto && config.type === 'timestamp') {
      result[field] = new Date().toISOString();
    }
  }
  return result;
}

function validateRequired(record, schema) {
  if (!schema) return null;
  for (const [field, config] of Object.entries(schema)) {
    if (config.required && (record[field] === undefined || record[field] === null || record[field] === '')) {
      return field + ' is required';
    }
  }
  return null;
}

function validateUnique(tableName, record, schema, excludeId) {
  if (!schema) return null;
  for (const [field, config] of Object.entries(schema)) {
    if (!config.unique || record[field] === undefined) continue;
    const val = coerceForStorage(record[field]);
    let row;
    if (excludeId !== undefined) {
      row = _db.prepare('SELECT 1 FROM ' + tableName + ' WHERE ' + field + ' = ? AND id != ? LIMIT 1').get(val, excludeId);
    } else {
      row = _db.prepare('SELECT 1 FROM ' + tableName + ' WHERE ' + field + ' = ? LIMIT 1').get(val);
    }
    if (row) return field + " must be unique -- '" + record[field] + "' already exists";
  }
  return null;
}

function validateForeignKeys(record, schema) {
  if (!schema) return;
  for (const [field, config] of Object.entries(schema)) {
    if (config.type !== 'fk') continue;
    const value = record[field];
    if (value === undefined || value === null || value === '') continue;
    let refTable;
    if (config.ref) {
      refTable = config.ref.toLowerCase();
      if (!refTable.endsWith('s')) refTable += 's';
    } else if (field.endsWith('_id')) {
      refTable = field.replace(/_id$/, '') + 's';
    } else continue;
    const tableExists = _db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(refTable);
    if (!tableExists) continue;
    const ref = _db.prepare('SELECT 1 FROM ' + refTable + ' WHERE id = ? LIMIT 1').get(value);
    if (!ref) throw new Error(field + ' references non-existent record (id ' + value + ' not found in ' + refTable + ')');
  }
}

// =============================================================================
// TABLE MANAGEMENT
// =============================================================================

function createTable(name, schema) {
  const tableName = name.toLowerCase();
  _schemas[tableName] = schema || {};

  const cols = ['id INTEGER PRIMARY KEY AUTOINCREMENT'];
  for (const [field, config] of Object.entries(schema || {})) {
    cols.push(field + ' ' + toSQLiteType(config));
  }
  _db.prepare('CREATE TABLE IF NOT EXISTS ' + tableName + ' (' + cols.join(', ') + ')').run();

  // Schema evolution: add columns present in schema but missing from the table
  const existing = new Set(_db.prepare('PRAGMA table_info(' + tableName + ')').all().map(function(c) { return c.name; }));
  for (const [field, config] of Object.entries(schema || {})) {
    if (!existing.has(field)) {
      _db.prepare('ALTER TABLE ' + tableName + ' ADD COLUMN ' + field + ' ' + toSQLiteType(config)).run();
    }
  }
}

// =============================================================================
// FILTER -> SQL WHERE
// =============================================================================

function buildWhere(filter) {
  if (!filter || Object.keys(filter).length === 0) return { clause: '', params: [] };
  const conditions = [];
  const params = [];
  for (const [key, value] of Object.entries(filter)) {
    conditions.push(key + ' = ?');
    params.push(coerceForStorage(value));
  }
  return { clause: 'WHERE ' + conditions.join(' AND '), params: params };
}

// =============================================================================
// CRUD OPERATIONS
// =============================================================================

function findAll(table, filter) {
  const tableName = table.toLowerCase();
  const schema = _schemas[tableName] || {};
  const w = buildWhere(filter);
  const rows = _db.prepare('SELECT * FROM ' + tableName + ' ' + w.clause).all(w.params);
  return rows.map(function(r) { return coerceRecord(r, schema); });
}

function findOne(table, filter) {
  const tableName = table.toLowerCase();
  const schema = _schemas[tableName] || {};
  const w = buildWhere(filter);
  const row = _db.prepare('SELECT * FROM ' + tableName + ' ' + w.clause + ' LIMIT 1').get(w.params);
  return row ? coerceRecord(row, schema) : null;
}

function insert(table, record) {
  const tableName = table.toLowerCase();
  const schema = _schemas[tableName] || {};

  record = sanitizeRecord(record);
  enforceTypes(record, schema);
  validateForeignKeys(record, schema);

  const reqErr = validateRequired(record, schema);
  if (reqErr) throw new Error(reqErr);

  const uniqErr = validateUnique(tableName, record, schema);
  if (uniqErr) throw new Error(uniqErr);

  const withDefaults = applyDefaults(record, schema);
  const fields = Object.keys(withDefaults).filter(function(k) { return k !== 'id'; });

  let result;
  if (fields.length === 0) {
    result = _db.prepare('INSERT INTO ' + tableName + ' DEFAULT VALUES').run();
  } else {
    const placeholders = fields.map(function() { return '?'; }).join(', ');
    const values = fields.map(function(f) { return coerceForStorage(withDefaults[f]); });
    result = _db.prepare('INSERT INTO ' + tableName + ' (' + fields.join(', ') + ') VALUES (' + placeholders + ')').run(values);
  }

  return coerceRecord(_db.prepare('SELECT * FROM ' + tableName + ' WHERE id = ?').get(result.lastInsertRowid), schema);
}

function update(table, filterOrRecord, data) {
  const tableName = table.toLowerCase();
  const schema = _schemas[tableName] || {};

  let filter, updateData;
  if (data === undefined) {
    const record = filterOrRecord;
    if (record.id !== undefined) {
      filter = { id: record.id };
      updateData = record;
    } else {
      return 0;
    }
  } else {
    filter = filterOrRecord;
    updateData = data;
  }

  updateData = sanitizeRecord(updateData);
  enforceTypes(updateData, schema);

  const w = buildWhere(filter);
  if (!w.clause) return 0;

  // Guard: throw 404 when updating by id but record doesn't exist
  if (filter.id !== undefined) {
    const exists = _db.prepare('SELECT 1 FROM ' + tableName + ' ' + w.clause + ' LIMIT 1').get(w.params);
    if (!exists) {
      const err = new Error('No record found with id ' + filter.id);
      err.status = 404;
      throw err;
    }
  }

  const setCols = Object.keys(updateData).filter(function(k) { return k !== 'id'; });
  if (setCols.length === 0) return 0;
  const setVals = setCols.map(function(k) { return coerceForStorage(updateData[k]); });

  const sql = 'UPDATE ' + tableName + ' SET ' + setCols.map(function(k) { return k + ' = ?'; }).join(', ') + ' ' + w.clause;
  const result = _db.prepare(sql).run(setVals.concat(w.params));
  return result.changes;
}

function remove(table, filter) {
  const tableName = table.toLowerCase();
  const w = buildWhere(filter);
  const result = _db.prepare('DELETE FROM ' + tableName + ' ' + w.clause).run(w.params);
  return result.changes;
}

// =============================================================================
// RAW SQL
// =============================================================================

function run(sql) {
  _db.exec(sql);
}

function execute(sql) {
  return run(sql);
}

// =============================================================================
// LIFECYCLE
// =============================================================================

function save() { /* no-op: SQLite writes are synchronous and durable */ }
function load() { /* no-op: db file is opened on require */ }

function reset() {
  for (const tableName of Object.keys(_schemas)) {
    _db.prepare('DELETE FROM ' + tableName).run();
    try { _db.prepare('DELETE FROM sqlite_sequence WHERE name = ?').run(tableName); } catch (e) { /* table may not have autoincrement yet */ }
  }
}

// =============================================================================
// PUBLIC API
// =============================================================================

module.exports = {
  createTable,
  findAll,
  findOne,
  insert,
  update,
  remove,
  run,
  execute,
  save,
  load,
  reset,
};
```

Step 3 — run smoke test: `node test-db-sqlite.cjs` → `ALL SMOKE TESTS PASS`

**REFACTOR:** delete `test-db-sqlite.cjs`, delete `clear-data.db` (created by smoke test).

---

### Cycle 2 🔴🟢🔄 — Ancillary updates + full test suite

**RED** — `node clear.test.js` → confirm baseline (should be ~1489 passing).

**GREEN** — 5 small edits:

**Edit 1: `package.json`** — add dependency:
```json
"dependencies": {
  "express": "^5.2.1",
  "better-sqlite3": "^12.8.0"
}
```

**Edit 2: `compiler.js` line ~781** — change the comment text:
```js
// BEFORE:
lines.push('// Note: for clean re-runs, delete clear-data.json before starting the server');
// AFTER:
lines.push('// Note: for clean re-runs, delete clear-data.db before starting the server');
```

**Edit 3: `cli/clear.js` line ~871** — add better-sqlite3 to generated package.json:
```js
// BEFORE:
dependencies: { express: '^4.18.0' },
// AFTER:
dependencies: { express: '^4.18.0', 'better-sqlite3': '^12.8.0' },
```

**Edit 4: `cli/clear.js` line ~886** — update .dockerignore template:
```js
// BEFORE:
writeFileSync(resolve(outDir, '.dockerignore'), 'node_modules\nclear-data.json\n');
// AFTER:
writeFileSync(resolve(outDir, '.dockerignore'), 'node_modules\nclear-data.db\n');
```

**Edit 5: `.gitignore`** — add .db entries after existing `clear-data.json` lines:
```
clear-data.db
apps/*/build/clear-data.db
```
Also add the WAL/SHM sidecar files SQLite creates in WAL mode:
```
clear-data.db-wal
clear-data.db-shm
```

Run `node clear.test.js` → all passing.

**REFACTOR:** sync `clear-runtime/db.js` — this file is git-tracked (it's the copy
that ships with packaged apps, distinct from `runtime/db.js` source). Must be updated:
```bash
cp runtime/db.js clear-runtime/db.js
```
Then `git add clear-runtime/db.js` — this file is tracked, not generated.

---

## 🧪 TESTING STRATEGY

Test commands:
```bash
node clear.test.js                  # 1489 compiler tests
node playground/server.test.js      # ~85 integration tests (need server running)
```

**Success criteria:**
- [ ] `node clear.test.js` — 1489 passing, 0 failing
- [ ] `clear-data.db` created on first server run, persists after restart
- [ ] Data present before restart is present after restart
- [ ] `clear-data.json` no longer created
- [ ] Boolean fields round-trip correctly (true/false not 1/0)

---

## Final step
Run `update-learnings` skill to capture lessons from this phase.

---

## 📎 RESUME PROMPT

Branch: `feature/sqlite-persistence`
Plan: `plans/plan-sqlite-persistence-04-09-2026.md`

Continue Phase 47: replace runtime/db.js in-memory store with better-sqlite3.
Same public API, durable SQLite storage, no compiler changes needed.
Cycle 1 = install + rewrite db.js. Cycle 2 = ancillary updates + test suite.

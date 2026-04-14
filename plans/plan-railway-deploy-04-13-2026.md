# Plan: Railway Deployment for Clear Apps

**Branch:** `feature/railway-deploy`
**Date:** 2026-04-13
**Scope:** Large (new runtime adapter + CLI command + compiler changes)

---

## 🎯 What We're Building

Two things that turn Clear from "cool demo" to "customer gets a URL":

1. **Postgres database adapter** (`runtime/db-postgres.js`) — same API as `db.js` (SQLite) but backed by PostgreSQL via the `pg` npm package. When `database is PostgreSQL`, the compiled server uses this adapter instead.

2. **`clear deploy` CLI command** — compiles, packages, and deploys to Railway in one step. Wraps `railway up` with Clear-specific setup (package.json, runtime files, env var guidance).

```
BEFORE:                              AFTER:
┌──────────┐   compile   ┌───────┐  ┌──────────┐  clear deploy  ┌──────────┐
│ app.clear │ ──────────► │ local │  │ app.clear │ ────────────► │ Railway  │
└──────────┘             │ only  │  └──────────┘               │ live URL │
                         └───────┘                             │ + Postgres│
                                                               └──────────┘
```

---

## 📐 Key Design Decisions

1. **Same API, different backend.** `db-postgres.js` exports the exact same functions as `db.js`: `createTable`, `findAll`, `findOne`, `insert`, `update`, `remove`, `run`, `reset`. Compiled code doesn't know which backend it's talking to. The `require('./clear-runtime/db')` path stays the same — the compiler copies the right file.

2. **Compiler picks the adapter.** When `database is PostgreSQL`, the compiler (in `compileToJSBackend`) sets a flag. The `clear package` / `clear deploy` command copies `db-postgres.js` as `db.js` into the deploy bundle instead of the SQLite one. No runtime detection, no config files — it's a compile-time decision.

3. **`DATABASE_URL` env var convention.** Railway auto-injects `DATABASE_URL` when you add Postgres. The adapter reads `process.env.DATABASE_URL`. No config needed from the user.

4. **Lazy table creation.** `db.createTable(name, schema)` is called at module load time (top-level, synchronous). The SQLite adapter handles this fine (better-sqlite3 is synchronous). But `pg` is async — can't await at top level in CJS. **Fix:** `createTable` stores the schema synchronously. On the first query to that table, the adapter runs `CREATE TABLE IF NOT EXISTS` and caches that it's done. Subsequent queries skip the check.

5. **`clear deploy` is thin.** It's `clear package` + `railway up`. No complex orchestration. If Railway CLI isn't installed, print instructions. If not logged in, print instructions. Don't try to be smart — just be clear about what's needed.

6. **`pg` is the only new dependency.** No ORM, no query builder, no Knex. Raw parameterized queries via `pg.Pool`, same pattern as the SQLite adapter.

7. **SQLite = on-prem, Postgres = cloud.** Same app, same Clear source, different `database is` line. SQLite needs zero infrastructure — no database server, no connection string, no setup. Postgres for cloud deploys where you need durability across redeploys. This is a selling point: "runs on a laptop or in the cloud, same code."

---

## 🏗️ Data Flow

### Compile + Deploy Flow
```
clear deploy app.clear
       │
       ▼
Compile app.clear → server.js + index.html
       │
       ▼
Detect database backend from AST (result.dbBackend)
  ├── 'local memory' or 'sqlite' → copy runtime/db.js (SQLite adapter)
  └── 'postgresql' → copy runtime/db-postgres.js as db.js (Postgres adapter)
       │
       ▼
Generate package.json with correct deps
  ├── SQLite: { "better-sqlite3": "^12.8.0" }
  └── Postgres: { "pg": "^8.13.0" }
       │
       ▼
Write to deploy/ directory
       │
       ▼
Run: railway up --detach
       │
       ▼
Print: "Deployed! URL: https://xxx.up.railway.app"
Print: env var guidance (DATABASE_URL, JWT_SECRET, ANTHROPIC_API_KEY)
```

### Runtime Data Flow (Postgres adapter)
```
Compiled server.js loads
       │
       ▼
const db = require('./clear-runtime/db')   ← this IS db-postgres.js
       │
       ▼
db.createTable('todos', schema)            ← stores schema only (sync)
       │
       ▼
app.listen(PORT)                           ← server starts immediately
       │
       ▼
First request → db.insert('todos', data)
       │
       ▼
Adapter checks: _tablesCreated.has('todos')?
  No → pool.query('CREATE TABLE IF NOT EXISTS ...')
       _tablesCreated.add('todos')
  Yes → skip
       │
       ▼
pool.query('INSERT INTO todos ... RETURNING *', params)
```

---

## 📁 Files Involved

### New Files

| File | What |
|------|------|
| `runtime/db-postgres.js` | Postgres adapter — same API as db.js, backed by `pg.Pool` |

### Modified Files

| File | What Changes |
|------|-------------|
| `cli/clear.js` | Add `deploy` command, update `packageCommand` to detect Postgres and copy correct adapter |
| `index.js` | Add `dbBackend` to `compileProgram()` return value (line ~113, before `return result`) |

---

## 🚨 Edge Cases

| Scenario | How We Handle It |
|----------|-----------------|
| `DATABASE_URL` not set | Adapter throws on pool creation: `"DATABASE_URL not set. Add Postgres in Railway dashboard."` |
| Railway CLI not installed | `clear deploy` checks `railway version`, prints: `"Install Railway CLI: npm install -g @railway/cli"` |
| Not logged into Railway | `clear deploy` checks `railway whoami`, prints: `"Run: railway login"` |
| No Railway project linked | Catch `railway up` error, print: `"Run: cd deploy && railway init"` |
| Table already exists | `CREATE TABLE IF NOT EXISTS` — no-op |
| Column added to schema | `ALTER TABLE ADD COLUMN IF NOT EXISTS` for missing columns |
| Boolean coercion | Postgres has native booleans — `coerceRecord` returns values as-is (no 0/1 mapping) |
| Connection pool exhaustion | Default pool size 10, `pg.Pool` queues waiting clients |
| Network errors to Postgres | `pool.query` throws, Express error handler catches → 500 |
| `database is local memory` + `clear deploy` | Deploy with SQLite. Warn: `"Using SQLite — data resets on redeploy. Use 'database is PostgreSQL' for persistence."` |
| App uses PostgreSQL but no DB provisioned | App crashes on first query. Post-deploy message warns. |
| `NULL` handling | Postgres returns `null`, same as SQLite. No conversion needed. |
| `id` column type | `SERIAL PRIMARY KEY` in Postgres (vs `INTEGER PRIMARY KEY AUTOINCREMENT` in SQLite) |
| Concurrent `createTable` | `IF NOT EXISTS` is safe for concurrent calls |
| `db.reset()` | `TRUNCATE TABLE` in Postgres (faster than `DELETE FROM`) |
| `db.run(sql)` | `pool.query(sql)` — runs raw SQL |

---

## 🔑 ENV VARS

| Var | Required | Source |
|-----|----------|--------|
| `DATABASE_URL` | Yes (for Postgres apps) | Railway auto-injects when Postgres is added |
| `PORT` | Yes | Railway auto-injects |
| `JWT_SECRET` | If auth used | User must set in Railway dashboard |
| `ANTHROPIC_API_KEY` | If agents used | User must set in Railway dashboard |

---

## 📋 Implementation Phases

### Phase 1: Postgres adapter (`runtime/db-postgres.js`)

**Read first:** `runtime/db.js` (full file — the API contract to match)

Create `runtime/db-postgres.js` — full implementation:

```js
// =============================================================================
// CLEAR RUNTIME — DATABASE MODULE (PostgreSQL backend)
// =============================================================================
// Same API as db.js (SQLite) — drop-in replacement for cloud deployments.
// Uses pg.Pool with DATABASE_URL from environment.
//
// API (matches db.js exactly):
//   db.createTable(name, schema)  — registers schema, lazy-creates on first query
//   db.findAll(table, filter?)    — SELECT * with optional WHERE
//   db.findOne(table, filter)     — SELECT * WHERE ... LIMIT 1
//   db.insert(table, record)      — INSERT ... RETURNING *
//   db.update(table, filter, data?)— UPDATE matching records
//   db.remove(table, filter?)     — DELETE matching records
//   db.run(sql)                   — execute raw SQL
//   db.execute(sql)               — alias for db.run
//   db.save()                     — no-op (Postgres is always durable)
//   db.load()                     — no-op
//   db.reset()                    — TRUNCATE all known tables
// =============================================================================

'use strict';

const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  console.error('[clear:db] DATABASE_URL not set. Add a Postgres database in your Railway dashboard.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

// Schema registry — populated synchronously by createTable(), used by lazy init
const _schemas = {};
// Track which tables have been created in Postgres
const _tablesCreated = new Set();

// =============================================================================
// TYPE HELPERS
// =============================================================================

function toPgType(config) {
  if (!config || !config.type) return 'TEXT';
  switch (config.type) {
    case 'number': return 'DOUBLE PRECISION';
    case 'boolean': return 'BOOLEAN';
    case 'fk': return 'INTEGER';
    case 'timestamp': return 'TIMESTAMPTZ';
    default: return 'TEXT';
  }
}

function toPgDefault(config) {
  if (config.default === undefined) return '';
  if (config.type === 'boolean') return ` DEFAULT ${config.default ? 'TRUE' : 'FALSE'}`;
  if (config.type === 'number') return ` DEFAULT ${config.default}`;
  return ` DEFAULT '${String(config.default).replace(/'/g, "''")}'`;
}

// =============================================================================
// VALIDATION (same as db.js — application-level constraints)
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

// =============================================================================
// LAZY TABLE CREATION
// =============================================================================

async function ensureTable(tableName) {
  if (_tablesCreated.has(tableName)) return;
  const schema = _schemas[tableName];
  if (!schema) { _tablesCreated.add(tableName); return; }

  const cols = ['id SERIAL PRIMARY KEY'];
  for (const [field, config] of Object.entries(schema)) {
    cols.push('"' + field + '" ' + toPgType(config) + toPgDefault(config));
  }
  await pool.query('CREATE TABLE IF NOT EXISTS ' + tableName + ' (' + cols.join(', ') + ')');

  // Schema evolution: add missing columns
  const { rows } = await pool.query(
    "SELECT column_name FROM information_schema.columns WHERE table_name = $1",
    [tableName]
  );
  const existing = new Set(rows.map(r => r.column_name));
  for (const [field, config] of Object.entries(schema)) {
    if (!existing.has(field)) {
      await pool.query('ALTER TABLE ' + tableName + ' ADD COLUMN IF NOT EXISTS "' + field + '" ' + toPgType(config) + toPgDefault(config));
    }
  }
  _tablesCreated.add(tableName);
}

// =============================================================================
// TABLE MANAGEMENT
// =============================================================================

function createTable(name, schema) {
  // Synchronous — just register the schema. Table created lazily on first query.
  const tableName = name.toLowerCase();
  _schemas[tableName] = schema || {};
}

// =============================================================================
// FILTER -> SQL WHERE
// =============================================================================

function buildWhere(filter) {
  if (!filter || Object.keys(filter).length === 0) return { clause: '', params: [], offset: 0 };
  const conditions = [];
  const params = [];
  let i = 1;
  for (const [key, value] of Object.entries(filter)) {
    conditions.push('"' + key + '" = $' + i);
    params.push(value);
    i++;
  }
  return { clause: 'WHERE ' + conditions.join(' AND '), params, offset: i - 1 };
}

// =============================================================================
// CRUD OPERATIONS
// =============================================================================

async function findAll(table, filter) {
  const tableName = table.toLowerCase();
  await ensureTable(tableName);
  const w = buildWhere(filter);
  const { rows } = await pool.query('SELECT * FROM ' + tableName + ' ' + w.clause, w.params);
  return rows;
}

async function findOne(table, filter) {
  const tableName = table.toLowerCase();
  await ensureTable(tableName);
  const w = buildWhere(filter);
  const { rows } = await pool.query('SELECT * FROM ' + tableName + ' ' + w.clause + ' LIMIT 1', w.params);
  return rows[0] || null;
}

async function insert(table, record) {
  const tableName = table.toLowerCase();
  const schema = _schemas[tableName] || {};
  await ensureTable(tableName);

  record = sanitizeRecord(record);
  enforceTypes(record, schema);

  const reqErr = validateRequired(record, schema);
  if (reqErr) throw new Error(reqErr);

  // Unique check
  for (const [field, config] of Object.entries(schema)) {
    if (!config.unique || record[field] === undefined) continue;
    const { rows } = await pool.query(
      'SELECT 1 FROM ' + tableName + ' WHERE "' + field + '" = $1 LIMIT 1', [record[field]]
    );
    if (rows.length > 0) throw new Error(field + " must be unique -- '" + record[field] + "' already exists");
  }

  // Foreign key check
  for (const [field, config] of Object.entries(schema)) {
    if (config.type !== 'fk') continue;
    const value = record[field];
    if (value === undefined || value === null || value === '') continue;
    let refTable = config.ref ? config.ref.toLowerCase() : (field.endsWith('_id') ? field.replace(/_id$/, '') + 's' : null);
    if (!refTable) continue;
    if (!refTable.endsWith('s')) refTable += 's';
    await ensureTable(refTable);
    const { rows } = await pool.query('SELECT 1 FROM ' + refTable + ' WHERE id = $1 LIMIT 1', [value]);
    if (rows.length === 0) throw new Error(field + ' references non-existent record (id ' + value + ' not found in ' + refTable + ')');
  }

  const withDefaults = applyDefaults(record, schema);
  const fields = Object.keys(withDefaults).filter(k => k !== 'id');

  if (fields.length === 0) {
    const { rows } = await pool.query('INSERT INTO ' + tableName + ' DEFAULT VALUES RETURNING *');
    return rows[0];
  }

  const placeholders = fields.map((_, i) => '$' + (i + 1));
  const values = fields.map(f => withDefaults[f]);
  const { rows } = await pool.query(
    'INSERT INTO ' + tableName + ' ("' + fields.join('", "') + '") VALUES (' + placeholders.join(', ') + ') RETURNING *',
    values
  );
  return rows[0];
}

async function update(table, filterOrRecord, data) {
  const tableName = table.toLowerCase();
  const schema = _schemas[tableName] || {};
  await ensureTable(tableName);

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
    const { rows } = await pool.query('SELECT 1 FROM ' + tableName + ' ' + w.clause + ' LIMIT 1', w.params);
    if (rows.length === 0) {
      const err = new Error('No record found with id ' + filter.id);
      err.status = 404;
      throw err;
    }
  }

  const setCols = Object.keys(updateData).filter(k => k !== 'id');
  if (setCols.length === 0) return 0;

  // Build SET clause with $N params continuing after WHERE params
  const setEntries = setCols.map((k, i) => '"' + k + '" = $' + (w.offset + i + 1));
  const setValues = setCols.map(k => updateData[k]);

  const sql = 'UPDATE ' + tableName + ' SET ' + setEntries.join(', ') + ' ' + w.clause;
  const result = await pool.query(sql, [...w.params, ...setValues]);
  return result.rowCount;
}

async function remove(table, filter) {
  const tableName = table.toLowerCase();
  await ensureTable(tableName);
  const w = buildWhere(filter);
  const result = await pool.query('DELETE FROM ' + tableName + ' ' + w.clause, w.params);
  return result.rowCount;
}

// =============================================================================
// RAW SQL
// =============================================================================

async function run(sql) {
  await pool.query(sql);
}

async function execute(sql) {
  return run(sql);
}

// =============================================================================
// LIFECYCLE
// =============================================================================

function save() { /* no-op: Postgres is always durable */ }
function load() { /* no-op */ }

async function reset() {
  for (const tableName of Object.keys(_schemas)) {
    await pool.query('TRUNCATE TABLE ' + tableName + ' RESTART IDENTITY CASCADE');
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

**Test gate:** `node -c runtime/db-postgres.js` (syntax check). Can't unit test without a running Postgres, but the adapter is a straight port of db.js with pg substituted for better-sqlite3.

---

### Phase 2: Compiler + CLI changes

**Read first:** `cli/clear.js` lines 841-922 (packageCommand), `index.js` lines 101-115 (compileProgram return)

**Step 2a: Expose `dbBackend` in `compileProgram()` result**

In `index.js`, before `return result` (line ~114), add:

```js
  // Expose database backend for CLI commands (package, deploy)
  result.dbBackend = ast.body.find(n => n.type === NodeType.DATABASE_DECL)?.backend || 'local memory';
```

Need to import `NodeType` — already imported via `parse`:
```js
// NodeType is already available from parser.js import at top of index.js
```

**Step 2b: Update `packageCommand` to handle Postgres** (cli/clear.js, inside packageCommand around line 873-903)

Replace the runtime copy block and package.json generation:

```js
  // Runtime — copy the correct db adapter based on database backend
  const runtimeDir = resolve(outDir, 'clear-runtime');
  mkdirSync(runtimeDir, { recursive: true });
  const runtimeSrc = resolve(__dirname, '..', 'runtime');
  const isPostgres = (result.dbBackend || '').includes('postgres');
  const isSQLite = !isPostgres; // default to SQLite for local memory, sqlite, or unspecified

  // Copy db adapter — Postgres gets db-postgres.js renamed to db.js
  if (isPostgres) {
    copyFileSync(resolve(runtimeSrc, 'db-postgres.js'), resolve(runtimeDir, 'db.js'));
  } else {
    copyFileSync(resolve(runtimeSrc, 'db.js'), resolve(runtimeDir, 'db.js'));
  }
  for (const f of ['auth.js', 'rateLimit.js']) {
    const src = resolve(runtimeSrc, f);
    if (existsSync(src)) copyFileSync(src, resolve(runtimeDir, f));
  }
  files.push('clear-runtime/');

  // package.json — correct deps based on db backend
  const npmDeps = {};
  // ... existing npm dep collection code stays the same ...
  const appName = basename(file, extname(file)).replace(/[^a-z0-9-]/g, '-');
  const dbDep = isPostgres ? { pg: '^8.13.0' } : { 'better-sqlite3': '^12.8.0' };
  const pkg = {
    name: `clear-${appName}`,
    version: '1.0.0',
    description: 'Built with Clear language',
    main: 'server.js',
    scripts: { start: 'node server.js', test: 'node test.js' },
    dependencies: { express: '^4.18.0', ...dbDep, ...npmDeps },
  };
```

Also update the Dockerfile to not use alpine when Postgres (better-sqlite3 needs native compilation on alpine, pg doesn't):

```js
  // Dockerfile — simpler for Postgres (no native deps)
  const dockerfile = isPostgres
    ? `FROM node:20-slim\nWORKDIR /app\nCOPY package.json .\nRUN npm install --production\nCOPY . .\nEXPOSE 3000\nCMD ["node", "server.js"]`
    : `FROM node:20-alpine\nWORKDIR /app\nCOPY package.json .\nRUN npm install --production\nCOPY . .\nEXPOSE 3000\nCMD ["node", "server.js"]`;
  writeFileSync(resolve(outDir, 'Dockerfile'), dockerfile);
```

**Step 2c: Add `deploy` command** (cli/clear.js, new function + switch case)

```js
async function deployCommand(args) {
  const flags = parseFlags(args);
  const file = flags.positional[0];
  if (!file) {
    output({ error: 'Usage: clear deploy <file.clear>\n\nDeploys to Railway. Requires: npm install -g @railway/cli' }, flags);
    process.exit(1);
  }

  // Check Railway CLI is installed
  try {
    execSync('railway version', { stdio: 'pipe', timeout: 5000 });
  } catch {
    console.log('\n  Railway CLI not found.\n');
    console.log('  Install it:  npm install -g @railway/cli');
    console.log('  Then login:  railway login');
    console.log('  Then init:   railway init\n');
    process.exit(1);
  }

  // Check logged in
  try {
    execSync('railway whoami', { stdio: 'pipe', timeout: 5000 });
  } catch {
    console.log('\n  Not logged into Railway.\n');
    console.log('  Run:  railway login\n');
    process.exit(1);
  }

  const deployDir = resolve(dirname(resolve(file)), 'deploy');

  // Package
  if (!flags.quiet) console.log('  Packaging...');
  await packageCommand([file, '--out', deployDir, '--quiet']);

  // Deploy
  if (!flags.quiet) console.log('  Deploying to Railway...');
  try {
    const stdout = execSync('railway up --detach', {
      cwd: deployDir,
      encoding: 'utf8',
      timeout: 120000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    console.log('  Deployed!');
    if (stdout.trim()) console.log('  ' + stdout.trim());
  } catch (err) {
    const msg = (err.stderr || err.stdout || err.message || '').trim();
    if (msg.includes('no project') || msg.includes('No project') || msg.includes('not linked')) {
      console.log('\n  No Railway project linked.\n');
      console.log('  Run:  cd ' + deployDir + ' && railway init\n');
      process.exit(1);
    }
    console.error('  Deploy failed: ' + msg.slice(0, 300));
    process.exit(2);
  }

  // Post-deploy guidance
  const loaded = loadSource(file);
  if (!loaded.error) {
    const { compileProgram } = await getCompiler();
    const result = compileProgram(loaded.source);
    const isPostgres = (result.dbBackend || '').includes('postgres');
    const hasAuth = loaded.source.includes('signup and login') || loaded.source.includes('requires login');
    const hasAgent = loaded.source.includes('ask claude') || loaded.source.includes('ask ai');
    const isSQLite = !isPostgres;

    console.log('');
    if (isSQLite) {
      console.log('  Note: Using SQLite. Data resets on redeploy.');
      console.log('  For persistent data, use: database is PostgreSQL');
    }
    if (isPostgres) {
      console.log('  Add Postgres in Railway dashboard. DATABASE_URL is set automatically.');
    }
    if (hasAuth) {
      console.log('  Set JWT_SECRET in Railway > Variables.');
    }
    if (hasAgent) {
      console.log('  Set ANTHROPIC_API_KEY in Railway > Variables.');
    }
    console.log('');
  }
}
```

Add to CLI switch (around line 981):
```js
case 'deploy':   await deployCommand(commandArgs); break;
```

Add to help text (around line 943):
```
  deploy <file>    Package and deploy to Railway
```

**Test gate:** `node clear.test.js` passes. `node -c cli/clear.js` passes. Manually verify: `node cli/clear.js package apps/todo-fullstack/main.clear --out /tmp/test-deploy` produces correct files.

---

### Phase 3: Tests + docs

**Read first:** `clear.test.js` (just the tail — add tests at end), `ROADMAP.md`, `SYNTAX.md`, `USER-GUIDE.md`

**Step 3a: Add compiler tests** (append to clear.test.js)

```js
describe('Database Backend Detection', () => {
  it('exposes dbBackend in compileProgram result', () => {
    const r = compileProgram("build for javascript backend\ndatabase is local memory\n");
    expect(r.dbBackend).toBe('local memory');
  });

  it('detects PostgreSQL backend', () => {
    const r = compileProgram("build for javascript backend\ndatabase is PostgreSQL\n");
    expect(r.dbBackend).toContain('postgres');
  });

  it('defaults to local memory when no database declaration', () => {
    const r = compileProgram("build for web\nx = 5\n");
    expect(r.dbBackend).toBe('local memory');
  });
});
```

**Step 3b: Syntax-check the Postgres adapter**

```bash
node -c runtime/db-postgres.js
```

**Step 3c: Update docs**

- `ROADMAP.md` — add to "Recently Completed": `| Railway deploy | \`clear deploy app.clear\` | Done — Postgres adapter + CLI |`
- `SYNTAX.md` — add `clear deploy <file>` to CLI reference section
- `USER-GUIDE.md` — add "Deploy your app" section with Railway walkthrough
- `AI-INSTRUCTIONS.md` — add note about `database is PostgreSQL` for cloud deploys

**Final step:** Run `update-learnings` skill.

---

## ✅ Success Criteria

- [ ] `runtime/db-postgres.js` implements same API as `db.js` (createTable, findAll, findOne, insert, update, remove, run, reset)
- [ ] `db-postgres.js` syntax-checks clean (`node -c`)
- [ ] Lazy table creation works (createTable is sync, tables created on first query)
- [ ] `compileProgram()` returns `dbBackend` field
- [ ] `clear package` with `database is PostgreSQL` copies db-postgres.js and uses `pg` dep
- [ ] `clear package` with `database is local memory` still copies db.js and uses `better-sqlite3` dep
- [ ] `clear deploy` checks Railway CLI, packages, runs `railway up`, prints env var guidance
- [ ] All existing compiler tests pass (1840+)
- [ ] 3 new tests for dbBackend detection
- [ ] Docs updated (ROADMAP, SYNTAX, USER-GUIDE, AI-INSTRUCTIONS)

---

## 📚 Learnings Hook

After completion: Run `update-learnings` skill to capture any lessons.

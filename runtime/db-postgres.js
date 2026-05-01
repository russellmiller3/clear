// =============================================================================
// CLEAR RUNTIME — DATABASE MODULE (PostgreSQL backend)
// =============================================================================
//
// Same API as db.js (SQLite) — drop-in replacement for cloud deployments.
// Uses pg.Pool with DATABASE_URL from environment.
//
// API (matches db.js exactly):
//   db.createTable(name, schema)  — registers schema, lazy-creates on first query
//   db.findAll(table, filter?, options?) — SELECT * with optional WHERE + LIMIT
//   db.findOne(table, filter)     — SELECT * WHERE ... LIMIT 1
//   db.aggregate(table, fn, field, filter?) — SELECT FN(col) ... with equality filter
//   db.insert(table, record)      — INSERT ... RETURNING *
//   db.update(table, filter, data?)— UPDATE matching records
//   db.remove(table, filter?)     — DELETE matching records
//   db.run(sql)                   — execute raw SQL
//   db.execute(sql)               — alias for db.run
//   db.save()                     — no-op (Postgres is always durable)
//   db.load()                     — no-op
//   db.reset()                    — TRUNCATE all known tables
//
// Key difference from db.js: all query functions are async.
// Compiled Clear code already uses `await` on all db calls, so this is safe.
// createTable() is synchronous (stores schema only) because it's called at
// module load time before any await is possible. Tables are created lazily
// on the first actual query via ensureTable().
//
// =============================================================================

'use strict';

const { Pool } = require('pg');

// Defer DATABASE_URL check to first query — don't crash on require() for health-check-only servers
var pool = null;
function getPool() {
  if (pool) return pool;
  if (!process.env.DATABASE_URL) {
    throw new Error('[clear:db] DATABASE_URL not set. Add a Postgres database in your Railway dashboard.');
  }
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    // SSL for cloud Postgres (Railway, Render, etc.)
    ssl: process.env.DATABASE_URL.includes('sslmode=') ? undefined : { rejectUnauthorized: true },
  });
  process.on('SIGTERM', function() { pool.end(); });
  return pool;
}

// Schema registry — populated synchronously by createTable(), used by lazy init
const _schemas = {};
// Track which tables have been created in Postgres (avoids re-running CREATE TABLE)
const _tablesCreated = new Set();
const IDENT_RE = /^[a-z_][a-z0-9_]*$/i;

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
  if (config.type === 'boolean') return ' DEFAULT ' + (config.default ? 'TRUE' : 'FALSE');
  if (config.type === 'number') return ' DEFAULT ' + config.default;
  return " DEFAULT '" + String(config.default).replace(/'/g, "''") + "'";
}

function stripHidden(row, schema) {
  if (!row || !schema) return row;
  var out = Object.assign({}, row);
  for (var field in schema) {
    if (!schema.hasOwnProperty(field)) continue;
    if (schema[field] && schema[field].hidden) delete out[field];
  }
  return out;
}

async function backfillRenamedFields(tableName, schema, existing) {
  if (!IDENT_RE.test(tableName) || !schema) return;
  for (var fromField in schema) {
    if (!schema.hasOwnProperty(fromField)) continue;
    var config = schema[fromField];
    var toField = config && config.renamedTo;
    if (!config || !config.hidden || !toField) continue;
    if (!IDENT_RE.test(fromField) || !IDENT_RE.test(toField)) continue;
    if (!existing.has(fromField) || !existing.has(toField)) continue;
    await getPool().query(
      'UPDATE ' + tableName +
      ' SET "' + toField + '" = "' + fromField + '"' +
      ' WHERE "' + toField + '" IS NULL AND "' + fromField + '" IS NOT NULL'
    );
  }
}

// =============================================================================
// VALIDATION (same as db.js — application-level constraints before SQL)
// =============================================================================

// Strip dangerous HTML patterns to prevent stored XSS
function sanitizeRecord(record) {
  if (!record || typeof record !== 'object') return record;
  var result = {};
  for (var key in record) {
    if (!record.hasOwnProperty(key)) continue;
    var value = record[key];
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

// Coerce string values to their declared types (number, boolean)
function enforceTypes(record, schema) {
  if (!schema) return;
  for (var field in schema) {
    if (!schema.hasOwnProperty(field)) continue;
    var config = schema[field];
    if (record[field] === undefined || record[field] === null) continue;
    if (config.type === 'number') {
      // Empty string -> null, not 0. Number("") === 0 is silent data corruption.
      if (record[field] === '' || (typeof record[field] === 'string' && record[field].trim() === '')) {
        record[field] = null;
        continue;
      }
      var num = Number(record[field]);
      if (isNaN(num)) throw new Error(field + ' must be a number, got ' + JSON.stringify(record[field]));
      record[field] = num;
    }
    if (config.type === 'boolean' && typeof record[field] === 'string') {
      if (record[field] === 'true') record[field] = true;
      else if (record[field] === 'false') record[field] = false;
    }
  }
}

// Fill in default values for fields not provided
function applyDefaults(record, schema) {
  if (!schema) return record;
  var result = Object.assign({}, record);
  for (var field in schema) {
    if (!schema.hasOwnProperty(field)) continue;
    var config = schema[field];
    if (result[field] === undefined && config.default !== undefined) result[field] = config.default;
    if (result[field] === undefined && config.auto && config.type === 'timestamp') {
      result[field] = new Date().toISOString();
    }
  }
  return result;
}

// Check that all required fields are present and non-empty
function validateRequired(record, schema) {
  if (!schema) return null;
  for (var field in schema) {
    if (!schema.hasOwnProperty(field)) continue;
    var config = schema[field];
    if (config.required && (record[field] === undefined || record[field] === null || record[field] === '')) {
      return field + ' is required';
    }
  }
  return null;
}

// =============================================================================
// LAZY TABLE CREATION
// =============================================================================

// Creates the table in Postgres on first use. Called before every query.
// createTable() just stores the schema; this does the actual DDL.
async function ensureTable(tableName) {
  if (_tablesCreated.has(tableName)) return;
  var schema = _schemas[tableName];
  if (!schema) { _tablesCreated.add(tableName); return; }

  // Build CREATE TABLE with all columns from schema
  var cols = ['id SERIAL PRIMARY KEY'];
  for (var field in schema) {
    if (!schema.hasOwnProperty(field)) continue;
    // Quote column names to handle Postgres reserved words (e.g. "order", "user")
    cols.push('"' + field + '" ' + toPgType(schema[field]) + toPgDefault(schema[field]));
  }
  await getPool().query('CREATE TABLE IF NOT EXISTS ' + tableName + ' (' + cols.join(', ') + ')');

  // Schema evolution: add columns that exist in schema but not in table
  var res = await getPool().query(
    "SELECT column_name FROM information_schema.columns WHERE table_name = $1",
    [tableName]
  );
  var existing = new Set(res.rows.map(function(r) { return r.column_name; }));
  for (var field2 in schema) {
    if (!schema.hasOwnProperty(field2)) continue;
    if (!existing.has(field2)) {
      await getPool().query('ALTER TABLE ' + tableName + ' ADD COLUMN IF NOT EXISTS "' + field2 + '" ' + toPgType(schema[field2]) + toPgDefault(schema[field2]));
      existing.add(field2);
    }
  }
  await backfillRenamedFields(tableName, schema, existing);
  _tablesCreated.add(tableName);
}

// =============================================================================
// TABLE MANAGEMENT
// =============================================================================

// Synchronous — just registers the schema. Called at module load time.
// Actual table creation happens lazily in ensureTable() on first query.
// Table name is sanitized to prevent SQL injection from malicious Clear source.
function createTable(name, schema) {
  var tableName = name.toLowerCase().replace(/[^a-z0-9_]/g, '');
  if (!tableName) throw new Error('Invalid table name: ' + name);
  _schemas[tableName] = schema || {};
}

// =============================================================================
// FILTER -> SQL WHERE
// =============================================================================

// Builds a parameterized WHERE clause from a filter object.
// Returns { clause, params, offset } where offset is the count of params used
// (so subsequent SET clauses can continue numbering from $offset+1).
function buildWhere(filter) {
  if (!filter || Object.keys(filter).length === 0) return { clause: '', params: [], offset: 0 };
  var conditions = [];
  var params = [];
  var i = 1;
  for (var key in filter) {
    if (!filter.hasOwnProperty(key)) continue;
    // Validate column name to prevent SQL injection via filter keys
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)) continue;
    conditions.push('"' + key + '" = $' + i);
    params.push(filter[key]);
    i++;
  }
  return { clause: 'WHERE ' + conditions.join(' AND '), params: params, offset: i - 1 };
}

// =============================================================================
// CRUD OPERATIONS
// =============================================================================

function parseLimit(n) {
  var v = parseInt(n, 10);
  return (v > 0 && v < 10000) ? v : null;
}

function parseOffset(n) {
  var v = parseInt(n, 10);
  return (v >= 0 && v < 1000000) ? v : null;
}

async function findAll(table, filter, options) {
  var tableName = table.toLowerCase();
  await ensureTable(tableName);
  var schema = _schemas[tableName] || {};
  var includeHidden = !!(options && options.includeHidden);
  var w = buildWhere(filter);
  var sql = 'SELECT * FROM ' + tableName + ' ' + w.clause;
  if (options && options.limit) {
    var lim = parseLimit(options.limit);
    if (lim) sql += ' LIMIT ' + lim;
  }
  if (options && options.offset) {
    var off = parseOffset(options.offset);
    if (off) sql += ' OFFSET ' + off;
  }
  var res = await getPool().query(sql, w.params);
  return includeHidden ? res.rows : res.rows.map(function(row) { return stripHidden(row, schema); });
}

async function findOne(table, filter, options) {
  var tableName = table.toLowerCase();
  await ensureTable(tableName);
  var schema = _schemas[tableName] || {};
  var includeHidden = !!(options && options.includeHidden);
  var w = buildWhere(filter);
  var res = await getPool().query('SELECT * FROM ' + tableName + ' ' + w.clause + ' LIMIT 1', w.params);
  if (!res.rows[0]) return null;
  return includeHidden ? res.rows[0] : stripHidden(res.rows[0], schema);
}

function validateAggregateArgs(fn, field) {
  var allowedFns = { SUM: 1, AVG: 1, MIN: 1, MAX: 1, COUNT: 1 };
  if (!allowedFns[fn]) throw new Error('Unsupported aggregate function: ' + fn);
  if (fn !== 'COUNT' && !/^[a-z_][a-z0-9_]*$/i.test(field)) {
    throw new Error('Invalid field name: ' + field);
  }
}

async function aggregate(table, fn, field, filter) {
  var tableName = table.toLowerCase();
  await ensureTable(tableName);
  validateAggregateArgs(fn, field);
  var w = buildWhere(filter);
  var col = fn === 'COUNT' ? '*' : field;
  var sql = 'SELECT ' + fn + '(' + col + ') as result FROM ' + tableName + ' ' + w.clause;
  try {
    var res = await getPool().query(sql, w.params);
    return res.rows[0] ? (res.rows[0].result || 0) : 0;
  } catch (e) {
    console.warn('[clear] db.aggregate failed:', e.message);
    return 0;
  }
}

async function insert(table, record) {
  var tableName = table.toLowerCase();
  var schema = _schemas[tableName] || {};
  await ensureTable(tableName);

  record = sanitizeRecord(record);
  enforceTypes(record, schema);

  var reqErr = validateRequired(record, schema);
  if (reqErr) throw new Error(reqErr);

  // Unique constraint check (application-level, before SQL)
  for (var field in schema) {
    if (!schema.hasOwnProperty(field)) continue;
    if (!schema[field].unique || record[field] === undefined) continue;
    var check = await getPool().query(
      'SELECT 1 FROM ' + tableName + ' WHERE "' + field + '" = $1 LIMIT 1', [record[field]]
    );
    if (check.rows.length > 0) throw new Error(field + " must be unique -- '" + record[field] + "' already exists");
  }

  // Foreign key check (application-level)
  for (var fkField in schema) {
    if (!schema.hasOwnProperty(fkField)) continue;
    if (schema[fkField].type !== 'fk') continue;
    var value = record[fkField];
    if (value === undefined || value === null || value === '') continue;
    var refTable = schema[fkField].ref ? schema[fkField].ref.toLowerCase() : (fkField.endsWith('_id') ? fkField.replace(/_id$/, '') + 's' : null);
    if (!refTable) continue;
    if (!refTable.endsWith('s')) refTable += 's';
    await ensureTable(refTable);
    var fkCheck = await getPool().query('SELECT 1 FROM ' + refTable + ' WHERE id = $1 LIMIT 1', [value]);
    if (fkCheck.rows.length === 0) throw new Error(fkField + ' references non-existent record (id ' + value + ' not found in ' + refTable + ')');
  }

  var withDefaults = applyDefaults(record, schema);
  var fields = Object.keys(withDefaults).filter(function(k) { return k !== 'id'; });

  if (fields.length === 0) {
    var res = await getPool().query('INSERT INTO ' + tableName + ' DEFAULT VALUES RETURNING *');
    return res.rows[0];
  }

  var placeholders = fields.map(function(_, idx) { return '$' + (idx + 1); });
  var values = fields.map(function(f) { return withDefaults[f]; });
  var quotedFields = fields.map(function(f) { return '"' + f + '"'; });
  var res2 = await getPool().query(
    'INSERT INTO ' + tableName + ' (' + quotedFields.join(', ') + ') VALUES (' + placeholders.join(', ') + ') RETURNING *',
    values
  );
  return res2.rows[0];
}

async function update(table, filterOrRecord, data) {
  var tableName = table.toLowerCase();
  var schema = _schemas[tableName] || {};
  await ensureTable(tableName);

  var filter, updateData;
  if (data === undefined) {
    // Convention 1: db.update('table', record) — update by record.id
    var record = filterOrRecord;
    if (record.id !== undefined) {
      filter = { id: record.id };
      updateData = record;
    } else {
      return 0;
    }
  } else {
    // Convention 2: db.update('table', filter, data)
    filter = filterOrRecord;
    updateData = data;
  }

  updateData = sanitizeRecord(updateData);
  enforceTypes(updateData, schema);

  var w = buildWhere(filter);
  if (!w.clause) return 0;

  // Guard: throw 404 when updating by id but record doesn't exist
  if (filter.id !== undefined) {
    var exists = await getPool().query('SELECT 1 FROM ' + tableName + ' ' + w.clause + ' LIMIT 1', w.params);
    if (exists.rows.length === 0) {
      var err = new Error('No record found with id ' + filter.id);
      err.status = 404;
      throw err;
    }
  }

  var setCols = Object.keys(updateData).filter(function(k) { return k !== 'id'; });
  if (setCols.length === 0) return 0;

  // SET params continue numbering after WHERE params
  var setEntries = setCols.map(function(k, i) { return '"' + k + '" = $' + (w.offset + i + 1); });
  var setValues = setCols.map(function(k) { return updateData[k]; });

  var sql = 'UPDATE ' + tableName + ' SET ' + setEntries.join(', ') + ' ' + w.clause;
  var result = await getPool().query(sql, w.params.concat(setValues));
  return result.rowCount;
}

async function remove(table, filter) {
  var tableName = table.toLowerCase();
  await ensureTable(tableName);
  var w = buildWhere(filter);
  var result = await getPool().query('DELETE FROM ' + tableName + ' ' + w.clause, w.params);
  return result.rowCount;
}

// =============================================================================
// RAW SQL
// =============================================================================

async function run(sql) {
  await getPool().query(sql);
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
  for (var tableName in _schemas) {
    if (!_schemas.hasOwnProperty(tableName)) continue;
    try {
      await getPool().query('TRUNCATE TABLE ' + tableName + ' RESTART IDENTITY CASCADE');
    } catch (e) {
      // Table might not exist yet — ignore
    }
  }
}

// =============================================================================
// PUBLIC API
// =============================================================================

module.exports = {
  createTable: createTable,
  findAll: findAll,
  findOne: findOne,
  insert: insert,
  update: update,
  remove: remove,
  aggregate: aggregate,
  run: run,
  execute: execute,
  save: save,
  load: load,
  reset: reset,
};

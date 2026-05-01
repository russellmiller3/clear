// =============================================================================
// CLEAR RUNTIME — DATABASE MODULE (better-sqlite3 backend)
// =============================================================================
//
// PURPOSE: Provides the `db` API that compiled Clear backend code calls.
// Backed by SQLite via better-sqlite3. Durable, atomic, zero data loss.
//
// API:
//   db.createTable(name, schema)          — CREATE TABLE IF NOT EXISTS
//   db.findAll(table, filter?, options?)  — SELECT * with optional WHERE + LIMIT
//   db.findOne(table, filter)             — SELECT * WHERE ... LIMIT 1
//   db.aggregate(table, fn, field, filter?) — SELECT FN(col) ... with equality filter
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

const DATA_FILE = process.env.CLEAR_DB_PATH || path.join(process.cwd(), 'clear-data.db');
const _db = new Database(DATA_FILE);

// WAL mode: better concurrent read performance, safe across crashes
_db.pragma('journal_mode = WAL');
_db.pragma('synchronous = NORMAL');

// In-memory schema registry for validation + boolean coercion on read
const _schemas = {};
const IDENT_RE = /^[a-z_][a-z0-9_]*$/i;

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

function isSafeIdentifier(name) {
  return typeof name === 'string' && IDENT_RE.test(name);
}

function backfillRenamedFields(tableName, schema, existing) {
  if (!isSafeIdentifier(tableName) || !schema) return;
  for (const [fromField, config] of Object.entries(schema)) {
    const toField = config && config.renamedTo;
    if (!config || !config.hidden || !toField) continue;
    if (!isSafeIdentifier(fromField) || !isSafeIdentifier(toField)) continue;
    if (!existing.has(fromField) || !existing.has(toField)) continue;
    _db.prepare(
      'UPDATE ' + tableName +
      ' SET ' + toField + ' = ' + fromField +
      ' WHERE ' + toField + ' IS NULL AND ' + fromField + ' IS NOT NULL'
    ).run();
  }
}

// =============================================================================
// VALIDATION (application-level constraints — run before SQL)
// =============================================================================

// Sanitize string values to prevent stored XSS.
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
      existing.add(field);
    }
  }
  backfillRenamedFields(tableName, schema, existing);
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

function parseLimit(n) {
  const v = parseInt(n, 10);
  return (v > 0 && v < 10000) ? v : null;
}

function parseOffset(n) {
  const v = parseInt(n, 10);
  return (v >= 0 && v < 1000000) ? v : null;
}

// Strip fields marked hidden:true in the schema. Used by default on every
// read path so API callers never see columns the app owner has hidden.
// Pass { includeHidden: true } when internal/admin code legitimately needs
// the full row.
function stripHidden(row, schema) {
  if (!row || !schema) return row;
  let hidden = null;
  for (const field in schema) {
    if (schema[field] && schema[field].hidden) {
      if (!hidden) hidden = [];
      hidden.push(field);
    }
  }
  if (!hidden) return row;
  const out = {};
  for (const k in row) {
    if (hidden.indexOf(k) === -1) out[k] = row[k];
  }
  return out;
}

function findAll(table, filter, options) {
  const tableName = table.toLowerCase();
  const schema = _schemas[tableName] || {};
  const includeHidden = !!(options && options.includeHidden);
  const w = buildWhere(filter);
  let sql = 'SELECT * FROM ' + tableName + ' ' + w.clause;
  if (options && options.limit) {
    const lim = parseLimit(options.limit);
    if (lim) sql += ' LIMIT ' + lim;
  }
  if (options && options.offset) {
    const off = parseOffset(options.offset);
    if (off) sql += ' OFFSET ' + off;
  }
  const rows = _db.prepare(sql).all(w.params);
  return rows.map(function(r) {
    const coerced = coerceRecord(r, schema);
    return includeHidden ? coerced : stripHidden(coerced, schema);
  });
}

function findOne(table, filter, options) {
  const tableName = table.toLowerCase();
  const schema = _schemas[tableName] || {};
  const includeHidden = !!(options && options.includeHidden);
  const w = buildWhere(filter);
  const row = _db.prepare('SELECT * FROM ' + tableName + ' ' + w.clause + ' LIMIT 1').get(w.params);
  if (!row) return null;
  const coerced = coerceRecord(row, schema);
  return includeHidden ? coerced : stripHidden(coerced, schema);
}

function validateAggregateArgs(fn, field) {
  const allowedFns = { SUM: 1, AVG: 1, MIN: 1, MAX: 1, COUNT: 1 };
  if (!allowedFns[fn]) throw new Error('Unsupported aggregate function: ' + fn);
  if (fn !== 'COUNT' && !/^[a-z_][a-z0-9_]*$/i.test(field)) {
    throw new Error('Invalid field name: ' + field);
  }
}

function aggregate(table, fn, field, filter) {
  const tableName = table.toLowerCase();
  validateAggregateArgs(fn, field);
  const w = buildWhere(filter);
  const col = fn === 'COUNT' ? '*' : field;
  const sql = 'SELECT ' + fn + '(' + col + ') as result FROM ' + tableName + ' ' + w.clause;
  try {
    const row = _db.prepare(sql).get(w.params);
    return row ? (row.result || 0) : 0;
  } catch (e) {
    console.warn('[clear] db.aggregate failed:', e.message);
    return 0;
  }
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
    // Convention 1: db.update('table', record) — update by record.id
    const record = filterOrRecord;
    if (record.id !== undefined) {
      filter = { id: record.id };
      updateData = record;
    } else {
      // Silent no-op (return 0) used to hide a common Meph mistake:
      //   initial = { value: 0 }
      //   save initial to Counters        ← compiler emits db.update
      // initial has no id, so the update matched nothing. Counters stayed
      // empty. Subsequent GET / POST endpoints crashed dereferencing the
      // non-existent first row. The original return-0 here made the bug
      // invisible: POST still returned 200, weak-signal tripped test_pass=1,
      // flywheel credited the attempt despite no state change.
      //
      // Throw instead — the Clear error wrapper catches and returns a 500
      // with the hint, `_clearTry` surfaces it to Meph, and the 2xx
      // weak-signal never fires. Honest failure signal beats silent no-op.
      const err = new Error(
        'Cannot update ' + table + ' without an id on the record — '
        + 'use "save ... as new ' + table + '" to insert a new row instead, '
        + 'or look up an existing row first and mutate it.'
      );
      err.status = 400;
      throw err;
    }
  } else {
    // Convention 2: db.update('table', filter, data)
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
    // Reset autoincrement counter (sqlite_sequence may not exist before first insert)
    try { _db.prepare('DELETE FROM sqlite_sequence WHERE name = ?').run(tableName); } catch (e) { /* ignore */ }
  }
}

function close() {
  _db.close();
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
  aggregate,
  run,
  execute,
  save,
  load,
  reset,
  close,
};

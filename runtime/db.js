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

// WAL mode: better concurrent read performance, safe across crashes
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
    // Convention 1: db.update('table', record) — update by record.id
    const record = filterOrRecord;
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

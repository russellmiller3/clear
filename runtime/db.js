// =============================================================================
// CLEAR RUNTIME — DATABASE MODULE
// =============================================================================
//
// PURPOSE: Provides the `db` API that compiled Clear backend code calls.
// Backed by an in-memory store with JSON file persistence.
// Zero external dependencies — ships as one file.
//
// API:
//   db.createTable(name, schema)     — register a table with its schema
//   db.findAll(table, filter?)       — look up records, optionally filtered
//   db.findOne(table, filter)        — look up a single record
//   db.insert(table, record)         — save a new record, returns it with id
//   db.update(table, filter, data)   — update matching records
//   db.remove(table, filter?)        — delete matching records
//   db.run(sql)                      — no-op placeholder for raw SQL (migrations)
//   db.execute(sql)                  — alias for db.run
//
// Filter objects: { field: value } — all conditions are AND-ed.
//   { published: true }             — where published is true
//   { id: 3 }                       — where id is 3
//   { role: 'admin', active: true } — where role is admin AND active is true
//
// Persistence: call db.save() to write to disk, db.load() to restore.
// File location: ./clear-data.json (next to the compiled server.js)
//
// =============================================================================

const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(process.cwd(), 'clear-data.json');

// In-memory store: { tableName: { schema: {...}, records: [...], nextId: N } }
const _tables = {};

// =============================================================================
// TABLE MANAGEMENT
// =============================================================================

function createTable(name, schema) {
  const tableName = name.toLowerCase();
  if (_tables[tableName]) {
    // Table already exists (loaded from disk) — always update schema to match
    // current source code. This prevents stale persisted schemas from shadowing
    // schema changes made in the .clear file.
    _tables[tableName].schema = schema || {};
    return;
  }
  _tables[tableName] = {
    schema: schema || {},
    records: [],
    nextId: 1,
  };
}

// =============================================================================
// QUERY HELPERS
// =============================================================================

function matchesFilter(record, filter) {
  if (!filter || typeof filter !== 'object') return true;
  for (const key of Object.keys(filter)) {
    const recordVal = record[key];
    const filterVal = filter[key];
    // Coerce numeric strings for id comparisons (req.params are always strings)
    if (typeof recordVal === 'number' && typeof filterVal === 'string') {
      if (recordVal !== Number(filterVal)) return false;
    } else if (typeof recordVal === 'string' && typeof filterVal === 'number') {
      if (Number(recordVal) !== filterVal) return false;
    } else {
      if (recordVal !== filterVal) return false;
    }
  }
  return true;
}

function applyDefaults(record, schema) {
  if (!schema || typeof schema !== 'object') return record;
  const result = { ...record };
  for (const [field, config] of Object.entries(schema)) {
    if (result[field] === undefined && config.default !== undefined) {
      result[field] = config.default;
    }
    if (result[field] === undefined && config.auto && config.type === 'timestamp') {
      result[field] = new Date().toISOString();
    }
  }
  return result;
}

// Sanitize string values to prevent stored XSS.
// Strips <script> tags, event handlers (onerror=, onclick=, etc.), and javascript: URLs.
// Defense-in-depth: the frontend also escapes via _esc(), but stored XSS should never happen.
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

function validateRequired(record, schema) {
  if (!schema || typeof schema !== 'object') return null;
  for (const [field, config] of Object.entries(schema)) {
    if (config.required && (record[field] === undefined || record[field] === null || record[field] === '')) {
      return `${field} is required`;
    }
  }
  return null;
}

function validateUnique(table, record, schema, excludeId) {
  if (!schema || typeof schema !== 'object') return null;
  const store = _tables[table];
  if (!store) return null;
  for (const [field, config] of Object.entries(schema)) {
    if (config.unique && record[field] !== undefined) {
      const existing = store.records.find(r =>
        r[field] === record[field] && (excludeId === undefined || r.id !== excludeId)
      );
      if (existing) {
        return `${field} must be unique -- '${record[field]}' already exists`;
      }
    }
  }
  return null;
}

// =============================================================================
// CRUD OPERATIONS
// =============================================================================

function findAll(table, filter) {
  const tableName = table.toLowerCase();
  ensureTable(tableName);
  const records = _tables[tableName].records;
  if (!filter) return [...records];
  return records.filter(r => matchesFilter(r, filter));
}

function findOne(table, filter) {
  const results = findAll(table, filter);
  return results[0] || null;
}

function insert(table, record) {
  const tableName = table.toLowerCase();
  ensureTable(tableName);
  const store = _tables[tableName];

  // Sanitize string values (defense-in-depth against stored XSS)
  record = sanitizeRecord(record);

  // Validate required fields
  const reqError = validateRequired(record, store.schema);
  if (reqError) throw new Error(reqError);

  // Validate unique constraints
  const uniqError = validateUnique(tableName, record, store.schema);
  if (uniqError) throw new Error(uniqError);

  const newRecord = applyDefaults({ ...record, id: store.nextId }, store.schema);
  store.nextId++;
  store.records.push(newRecord);
  return newRecord;
}

function update(table, filterOrRecord, data) {
  const tableName = table.toLowerCase();
  ensureTable(tableName);
  const records = _tables[tableName].records;

  // Two calling conventions:
  // 1. db.update('table', record)        — update by record.id
  // 2. db.update('table', filter, data)  — update matching records with data
  let filter, updateData;
  if (data === undefined) {
    // Convention 1: record with id
    const record = filterOrRecord;
    if (record.id !== undefined) {
      filter = { id: record.id };
      updateData = record;
    } else {
      // No id, no filter — can't update
      return 0;
    }
  } else {
    filter = filterOrRecord;
    updateData = data;
  }

  // Sanitize string values (defense-in-depth against stored XSS)
  updateData = sanitizeRecord(updateData);

  let count = 0;
  for (const record of records) {
    if (matchesFilter(record, filter)) {
      const preserveId = record.id;
      Object.assign(record, updateData);
      // Preserve the original numeric id (params may pass string ids)
      record.id = preserveId;
      count++;
    }
  }
  return count;
}

function remove(table, filter) {
  const tableName = table.toLowerCase();
  ensureTable(tableName);
  const store = _tables[tableName];
  const before = store.records.length;
  if (!filter) {
    store.records = [];
  } else {
    store.records = store.records.filter(r => !matchesFilter(r, filter));
  }
  return before - store.records.length;
}

// =============================================================================
// RAW SQL PLACEHOLDERS (for migrations, CREATE TABLE statements)
// =============================================================================

function run(sql) {
  // No-op for in-memory store. Migrations are handled by createTable.
  // Log for visibility during development.
  if (process.env.CLEAR_DEBUG) {
    console.log('[clear-db] SQL (no-op):', sql);
  }
}

function execute(sql) {
  return run(sql);
}

// =============================================================================
// PERSISTENCE
// =============================================================================

function save() {
  const data = JSON.stringify(_tables, null, 2);
  fs.writeFileSync(DATA_FILE, data, 'utf-8');
}

function load() {
  if (!fs.existsSync(DATA_FILE)) return;
  try {
    const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
    for (const [name, store] of Object.entries(data)) {
      _tables[name] = store;
    }
  } catch (err) {
    console.error('[clear-db] Failed to load data file:', err.message);
  }
}

// =============================================================================
// INTERNALS
// =============================================================================

function ensureTable(name) {
  if (!_tables[name]) {
    _tables[name] = { schema: {}, records: [], nextId: 1 };
  }
}

function reset() {
  for (const key of Object.keys(_tables)) {
    delete _tables[key];
  }
}

// =============================================================================
// PUBLIC API
// =============================================================================

// Auto-persistence: save to disk after every mutation (debounced)
let _saveTimer = null;
function _autoSave() {
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => {
    try { save(); } catch (e) { /* ignore save errors */ }
  }, 100); // debounce: save at most every 100ms
}

// Wrap mutations with auto-save
const _originalInsert = insert;
const _originalUpdate = update;
const _originalRemove = remove;

function insertWithSave(table, record) {
  const result = _originalInsert(table, record);
  _autoSave();
  return result;
}
function updateWithSave(table, filterOrRecord, data) {
  const result = _originalUpdate(table, filterOrRecord, data);
  _autoSave();
  return result;
}
function removeWithSave(table, filter) {
  const result = _originalRemove(table, filter);
  _autoSave();
  return result;
}

// Auto-load on first require
load();

const db = {
  createTable,
  findAll,
  findOne,
  insert: insertWithSave,
  update: updateWithSave,
  remove: removeWithSave,
  run,
  execute,
  save,
  load,
  reset,
};

module.exports = db;

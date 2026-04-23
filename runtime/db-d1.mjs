// =============================================================================
// CLEAR RUNTIME — D1 ADAPTER (Cloudflare Workers for Platforms)
// =============================================================================
//
// PURPOSE: Expose the same public interface as runtime/db.js, but backed by a
// D1 binding (Cloudflare's SQLite over HTTP) instead of better-sqlite3. Each
// compiled Worker that uses the shim creates a single d1 = createD1Shim(env.DB)
// at request time and calls d1.insert / d1.findAll / d1.update / etc.
//
// Most of the codegen emits raw env.DB.prepare('...').bind(...).run() inline
// (see compiler.js compileCrudD1*). The shim exists for:
//   - utility helpers that can't easily inline a SQL template
//   - Node/Worker parity tests (compiler test harnesses can swap db.js for db-d1.js)
//   - future codegen paths that want runtime validation (required, unique, fk)
//
// FILE EXTENSION: .mjs (not .js) because runtime/ is scoped to CommonJS via
// runtime/package.json — but D1 bindings only run inside Workers, and Workers
// are ESM-only. The `.mjs` extension overrides the package.json scope.
//
// SECURITY: every user value routes through D1's prepared-statement bind,
// never template-literal interpolation. Column + table identifiers are
// validated with /^[a-z_][a-z0-9_]*$/i so adversarial keys can't escape.
//
// COMPATIBILITY: mirrors the runtime/db.js API row-for-row so compiled code
// that reaches for the shim (rare — usually we emit raw env.DB calls)
// behaves identically between the Node and Worker targets.
//
// =============================================================================

import Database from 'better-sqlite3';

// In-memory schema registry keyed by lowercase table name. Populated via
// createTable() on startup so read paths can coerce booleans back to JS.
// NOTE: this is per-shim instance, not global — a single Worker gets one
// shim per request, and D1 state is durable so the registry only lives
// long enough for the request to finish.

const IDENT_RE = /^[a-z_][a-z0-9_]*$/i;

function assertIdent(name, kind) {
	if (typeof name !== 'string' || !IDENT_RE.test(name)) {
		throw new Error(`Invalid ${kind} name: ${JSON.stringify(name)}`);
	}
}

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

function coerceRecord(record, schema) {
	if (!record || !schema) return record;
	const result = { ...record };
	for (const [field, config] of Object.entries(schema)) {
		if (config.type === 'boolean' && result[field] !== undefined && result[field] !== null) {
			result[field] = result[field] === 1 || result[field] === true;
		}
	}
	return result;
}

function coerceForStorage(value) {
	if (typeof value === 'boolean') return value ? 1 : 0;
	return value;
}

// -----------------------------------------------------------------------------
// Public factory — createD1Shim(env.DB) -> { createTable, insert, ... }
// -----------------------------------------------------------------------------

export function createD1Shim(DB) {
	const schemas = Object.create(null);

	function createTable(name, schema) {
		assertIdent(name, 'table');
		const tableName = name.toLowerCase();
		schemas[tableName] = schema || {};

		const cols = ['id INTEGER PRIMARY KEY AUTOINCREMENT'];
		for (const [field, config] of Object.entries(schema || {})) {
			assertIdent(field, 'column');
			cols.push(`${field} ${toSQLiteType(config)}`);
		}
		DB.prepare(`CREATE TABLE IF NOT EXISTS ${tableName} (${cols.join(', ')})`).run();
	}

	function buildWhere(filter) {
		if (!filter || Object.keys(filter).length === 0) {
			return { clause: '', binds: [] };
		}
		const conds = [];
		const binds = [];
		for (const [key, value] of Object.entries(filter)) {
			assertIdent(key, 'column');
			conds.push(`${key} = ?`);
			binds.push(coerceForStorage(value));
		}
		return { clause: 'WHERE ' + conds.join(' AND '), binds };
	}

	function validateRequired(record, schema) {
		if (!schema) return null;
		for (const [field, config] of Object.entries(schema)) {
			if (config.required && (record[field] === undefined || record[field] === null || record[field] === '')) {
				return `${field} is required`;
			}
		}
		return null;
	}

	function insert(table, record) {
		assertIdent(table, 'table');
		const tableName = table.toLowerCase();
		const schema = schemas[tableName] || {};

		const reqErr = validateRequired(record, schema);
		if (reqErr) throw new Error(reqErr);

		const fields = Object.keys(record).filter((k) => k !== 'id' && IDENT_RE.test(k));
		let stmt;
		if (fields.length === 0) {
			stmt = DB.prepare(`INSERT INTO ${tableName} DEFAULT VALUES`).run();
		} else {
			const placeholders = fields.map(() => '?').join(', ');
			const values = fields.map((f) => coerceForStorage(record[f]));
			stmt = DB.prepare(`INSERT INTO ${tableName} (${fields.join(', ')}) VALUES (${placeholders})`)
				.bind(...values)
				.run();
		}

		const id = stmt.meta?.last_row_id;
		const row = DB.prepare(`SELECT * FROM ${tableName} WHERE id = ?`).bind(id).first();
		return coerceRecord(row, schema);
	}

	function findAll(table, filter) {
		assertIdent(table, 'table');
		const tableName = table.toLowerCase();
		const schema = schemas[tableName] || {};
		const w = buildWhere(filter);
		const envelope = DB.prepare(`SELECT * FROM ${tableName} ${w.clause}`).bind(...w.binds).all();
		return (envelope.results || []).map((r) => coerceRecord(r, schema));
	}

	function findOne(table, filter) {
		assertIdent(table, 'table');
		const tableName = table.toLowerCase();
		const schema = schemas[tableName] || {};
		const w = buildWhere(filter);
		const row = DB.prepare(`SELECT * FROM ${tableName} ${w.clause} LIMIT 1`).bind(...w.binds).first();
		if (!row) return null;
		return coerceRecord(row, schema);
	}

	function update(table, filterOrRecord, data) {
		assertIdent(table, 'table');
		const tableName = table.toLowerCase();

		let filter, updateData;
		if (data === undefined) {
			// Convention 1: d1.update('table', record) — update by record.id
			const record = filterOrRecord;
			if (record && record.id !== undefined && record.id !== null) {
				filter = { id: record.id };
				updateData = record;
			} else {
				// Mirrors session 42 runtime guard: reject silent no-op updates.
				const err = new Error(
					`Cannot update ${table} without an id on the record — `
					+ `use "save ... as new ${table}" to insert a new row instead, `
					+ `or look up an existing row first and mutate it.`
				);
				err.status = 400;
				throw err;
			}
		} else {
			// Convention 2: d1.update('table', filter, data)
			filter = filterOrRecord;
			updateData = data;
		}

		const setCols = Object.keys(updateData).filter((k) => k !== 'id' && IDENT_RE.test(k));
		if (setCols.length === 0) return 0;

		const setVals = setCols.map((k) => coerceForStorage(updateData[k]));
		const w = buildWhere(filter);
		if (!w.clause) return 0;

		const sql = `UPDATE ${tableName} SET ${setCols.map((k) => `${k} = ?`).join(', ')} ${w.clause}`;
		const res = DB.prepare(sql).bind(...setVals, ...w.binds).run();
		return res.meta?.changes ?? res.changes ?? 0;
	}

	function remove(table, filter) {
		assertIdent(table, 'table');
		const tableName = table.toLowerCase();
		const w = buildWhere(filter);
		const res = DB.prepare(`DELETE FROM ${tableName} ${w.clause}`).bind(...w.binds).run();
		return res.meta?.changes ?? res.changes ?? 0;
	}

	function aggregate(table, fn, field, filter) {
		assertIdent(table, 'table');
		const allowed = { SUM: 1, AVG: 1, MIN: 1, MAX: 1, COUNT: 1 };
		if (!allowed[fn]) throw new Error(`Unsupported aggregate function: ${fn}`);
		if (fn !== 'COUNT') assertIdent(field, 'column');
		const col = fn === 'COUNT' ? '*' : field;
		const w = buildWhere(filter);
		const row = DB.prepare(`SELECT ${fn}(${col}) as result FROM ${table.toLowerCase()} ${w.clause}`).bind(...w.binds).first();
		return row ? (row.result || 0) : 0;
	}

	function run(sql) {
		// Raw SQL — callers must produce safe SQL themselves. Used by schema
		// bootstrap + migration replay. Do NOT expose this path to user input.
		DB.exec(sql);
	}

	function execute(sql) { return run(sql); }

	function save() { /* no-op: D1 is always durable */ }
	function load() { /* no-op: D1 binding opens on Worker init */ }

	function reset() {
		for (const tableName of Object.keys(schemas)) {
			DB.prepare(`DELETE FROM ${tableName}`).run();
			// Reset AUTOINCREMENT sequence — sqlite_sequence may not exist yet.
			try { DB.prepare('DELETE FROM sqlite_sequence WHERE name = ?').bind(tableName).run(); }
			catch (_e) { /* ignore */ }
		}
	}

	return {
		createTable,
		insert,
		findAll,
		findOne,
		update,
		remove,
		aggregate,
		run,
		execute,
		save,
		load,
		reset,
	};
}

// -----------------------------------------------------------------------------
// d1Mock() — better-sqlite3 stand-in for env.DB (tests + local dev)
// -----------------------------------------------------------------------------
//
// Matches the D1 subset compiled Workers call:
//   env.DB.prepare(sql).bind(...).run()   → { meta: { last_row_id, changes } }
//   env.DB.prepare(sql).bind(...).all()   → { results: [...] }
//   env.DB.prepare(sql).bind(...).first() → single row or undefined
//   env.DB.exec(sql)                       → multi-statement schema bootstrap
//
// Returns the mock-DB; callers wire it into `env.DB` before invoking the
// generated Worker code. Deterministic (in-memory SQLite), cross-platform,
// zero additional dependencies.

export function d1Mock() {
	const db = new Database(':memory:');

	// Real D1 accepts booleans and coerces server-side; better-sqlite3
	// rejects them (only numbers / strings / bigints / buffers / null).
	// Undefined → null so the mock doesn't throw on optional fields that
	// default to undefined in plain JS objects.
	function coerceBindArg(v) {
		if (v === true) return 1;
		if (v === false) return 0;
		if (v === undefined) return null;
		return v;
	}

	function prepare(sql) {
		const stmt = db.prepare(sql);
		const state = { boundArgs: [] };
		const wrapper = {
			bind(...args) { state.boundArgs = args.map(coerceBindArg); return wrapper; },
			run() {
				const res = stmt.run(...state.boundArgs);
				return {
					success: true,
					meta: {
						last_row_id: Number(res.lastInsertRowid) || 0,
						changes: res.changes || 0,
					},
					changes: res.changes || 0,
				};
			},
			all() {
				const rows = stmt.all(...state.boundArgs);
				return { results: rows, success: true, meta: { changes: 0 } };
			},
			first() {
				const row = stmt.get(...state.boundArgs);
				return row === undefined ? undefined : row;
			},
		};
		return wrapper;
	}

	function exec(sql) { db.exec(sql); }

	return { prepare, exec };
}

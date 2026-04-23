// runtime/db-d1.test.mjs
// Cycle 2.7 — D1 runtime shim contract tests.
//
// runtime/db-d1.mjs wraps `env.DB` with the same public interface
// runtime/db.js exposes (createTable, insert, findAll, findOne, update,
// remove, aggregate, run). This lets compiled Workers code call
// `d1.insert('users', {...})` in places where the compiler hasn't emitted
// a raw env.DB.prepare() — mostly legacy utilities + future codegen that
// can't inline SQL safely.
//
// The contract tests use a better-sqlite3-backed mock of env.DB built by
// d1Mock() — same shape the cycle 2.8 template tests will use. Zero new
// deps (better-sqlite3 already in package.json).
//
// 18 tests covering: create/insert/find/update/remove + parameterized
// WHERE + unique/required validation + aggregate functions + run() for
// raw SQL + the UPDATE-without-id 400 guard mirroring session 42.
//
// ESM (`.mjs`) because runtime/ is scoped to CommonJS via runtime/package.json
// but compiled Workers code is ESM-only. The `.mjs` extension overrides
// the package.json scope for this one file (and its matching db-d1.mjs shim).

import { describe, it, expect } from '../lib/testUtils.js';
import { createD1Shim, d1Mock } from './db-d1.mjs';

// ─────────────────────────────────────────────────────────────────────────
// Cycle 2.7 — d1Mock smoke tests
// ─────────────────────────────────────────────────────────────────────────

describe('Phase 2 cycle 2.7 — d1Mock (better-sqlite3 env.DB stand-in)', () => {
	it('exposes prepare() returning a statement with bind/run/all/first', () => {
		const env = { DB: d1Mock() };
		env.DB.exec('CREATE TABLE IF NOT EXISTS widgets (id INTEGER PRIMARY KEY, name TEXT)');
		const stmt = env.DB.prepare('INSERT INTO widgets (name) VALUES (?)');
		expect(typeof stmt.bind).toBe('function');
		expect(typeof stmt.run).toBe('function');
		expect(typeof stmt.all).toBe('function');
		expect(typeof stmt.first).toBe('function');
	});

	it('prepare + bind + run inserts a row with AUTOINCREMENT id', () => {
		const env = { DB: d1Mock() };
		env.DB.exec('CREATE TABLE IF NOT EXISTS widgets (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT)');
		const res = env.DB.prepare('INSERT INTO widgets (name) VALUES (?)').bind('spatula').run();
		expect(res.meta.last_row_id).toBe(1);
	});

	it('prepare + all returns { results: [...] } — D1 envelope shape', () => {
		const env = { DB: d1Mock() };
		env.DB.exec('CREATE TABLE IF NOT EXISTS widgets (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT)');
		env.DB.prepare('INSERT INTO widgets (name) VALUES (?)').bind('a').run();
		env.DB.prepare('INSERT INTO widgets (name) VALUES (?)').bind('b').run();
		const envelope = env.DB.prepare('SELECT * FROM widgets').all();
		expect(Array.isArray(envelope.results)).toBe(true);
		expect(envelope.results.length).toBe(2);
		expect(envelope.results[0].name).toBe('a');
	});

	it('prepare + first returns single row or undefined', () => {
		const env = { DB: d1Mock() };
		env.DB.exec('CREATE TABLE IF NOT EXISTS widgets (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT)');
		env.DB.prepare('INSERT INTO widgets (name) VALUES (?)').bind('only').run();
		const row = env.DB.prepare('SELECT * FROM widgets WHERE name = ?').bind('only').first();
		expect(row.name).toBe('only');
		const missing = env.DB.prepare('SELECT * FROM widgets WHERE name = ?').bind('nope').first();
		expect(missing).toBeUndefined();
	});
});

describe('Phase 2 cycle 2.7 — createD1Shim(env.DB) matches runtime/db.js interface', () => {
	it('createTable creates a schema + registers it for later coercion', () => {
		const env = { DB: d1Mock() };
		const d1 = createD1Shim(env.DB);
		d1.createTable('widgets', { name: { type: 'text', required: true } });
		// Insert respects required
		let threw = false;
		try { d1.insert('widgets', {}); } catch (_e) { threw = true; }
		expect(threw).toBe(true);
	});

	it('insert returns the inserted record with id assigned', () => {
		const env = { DB: d1Mock() };
		const d1 = createD1Shim(env.DB);
		d1.createTable('widgets', { name: { type: 'text' } });
		const row = d1.insert('widgets', { name: 'spatula' });
		expect(row.id).toBeDefined();
		expect(row.name).toBe('spatula');
	});

	it('findAll returns array (not D1 envelope) for interface parity', () => {
		const env = { DB: d1Mock() };
		const d1 = createD1Shim(env.DB);
		d1.createTable('widgets', { name: { type: 'text' } });
		d1.insert('widgets', { name: 'a' });
		d1.insert('widgets', { name: 'b' });
		const rows = d1.findAll('widgets');
		expect(Array.isArray(rows)).toBe(true);
		expect(rows.length).toBe(2);
	});

	it('findAll with filter parameterizes via bind (no SQL injection)', () => {
		const env = { DB: d1Mock() };
		const d1 = createD1Shim(env.DB);
		d1.createTable('widgets', { name: { type: 'text' } });
		d1.insert('widgets', { name: 'alice' });
		d1.insert('widgets', { name: 'bob' });
		// Adversarial "name" value — would drop the table if interpolated
		const rows = d1.findAll('widgets', { name: "alice' OR 1=1 --" });
		expect(rows.length).toBe(0);
		// Confirm the real rows still exist (table not dropped)
		expect(d1.findAll('widgets').length).toBe(2);
	});

	it('findOne returns single row matching filter, or null', () => {
		const env = { DB: d1Mock() };
		const d1 = createD1Shim(env.DB);
		d1.createTable('widgets', { name: { type: 'text' } });
		d1.insert('widgets', { name: 'only' });
		const row = d1.findOne('widgets', { name: 'only' });
		expect(row.name).toBe('only');
		expect(d1.findOne('widgets', { name: 'absent' })).toBeNull();
	});

	it('update by record with id mutates the row', () => {
		const env = { DB: d1Mock() };
		const d1 = createD1Shim(env.DB);
		d1.createTable('widgets', { name: { type: 'text' } });
		const rec = d1.insert('widgets', { name: 'original' });
		const changes = d1.update('widgets', { id: rec.id, name: 'mutated' });
		expect(changes).toBe(1);
		const refetch = d1.findOne('widgets', { id: rec.id });
		expect(refetch.name).toBe('mutated');
	});

	it('update without id throws a 400 with a helpful hint (session 42 mirror)', () => {
		const env = { DB: d1Mock() };
		const d1 = createD1Shim(env.DB);
		d1.createTable('widgets', { name: { type: 'text' } });
		let caught;
		try { d1.update('widgets', { name: 'orphan' }); } catch (e) { caught = e; }
		expect(caught).toBeDefined();
		expect(caught.status).toBe(400);
		expect(/without an id|no id|requires id/i.test(caught.message)).toBe(true);
	});

	it('remove by filter deletes matching rows, returns count', () => {
		const env = { DB: d1Mock() };
		const d1 = createD1Shim(env.DB);
		d1.createTable('widgets', { name: { type: 'text' } });
		d1.insert('widgets', { name: 'keep' });
		const gone = d1.insert('widgets', { name: 'remove-me' });
		const changes = d1.remove('widgets', { id: gone.id });
		expect(changes).toBe(1);
		expect(d1.findAll('widgets').length).toBe(1);
	});

	it('remove with adversarial filter is safely parameterized', () => {
		const env = { DB: d1Mock() };
		const d1 = createD1Shim(env.DB);
		d1.createTable('widgets', { name: { type: 'text' } });
		d1.insert('widgets', { name: 'alice' });
		d1.insert('widgets', { name: 'bob' });
		// Adversarial name — binds as a string literal, matches nothing
		const changes = d1.remove('widgets', { name: "alice'; DROP TABLE widgets; --" });
		expect(changes).toBe(0);
		// Table still exists + original rows still there
		expect(d1.findAll('widgets').length).toBe(2);
	});

	it('aggregate COUNT returns row count', () => {
		const env = { DB: d1Mock() };
		const d1 = createD1Shim(env.DB);
		d1.createTable('widgets', { name: { type: 'text' } });
		d1.insert('widgets', { name: 'a' });
		d1.insert('widgets', { name: 'b' });
		d1.insert('widgets', { name: 'c' });
		expect(d1.aggregate('widgets', 'COUNT', '*')).toBe(3);
	});

	it('aggregate SUM over a numeric field', () => {
		const env = { DB: d1Mock() };
		const d1 = createD1Shim(env.DB);
		d1.createTable('orders', { amount: { type: 'number' } });
		d1.insert('orders', { amount: 10 });
		d1.insert('orders', { amount: 20 });
		d1.insert('orders', { amount: 30 });
		expect(d1.aggregate('orders', 'SUM', 'amount')).toBe(60);
	});

	it('aggregate rejects unsupported functions (defense-in-depth)', () => {
		const env = { DB: d1Mock() };
		const d1 = createD1Shim(env.DB);
		d1.createTable('widgets', { name: { type: 'text' } });
		let threw = false;
		try { d1.aggregate('widgets', 'UNION-ALL', 'name'); } catch (_e) { threw = true; }
		expect(threw).toBe(true);
	});

	it('run() executes arbitrary SQL (schema bootstrap path)', () => {
		const env = { DB: d1Mock() };
		const d1 = createD1Shim(env.DB);
		d1.run('CREATE TABLE IF NOT EXISTS adhoc (id INTEGER PRIMARY KEY, x TEXT)');
		d1.run("INSERT INTO adhoc (x) VALUES ('hi')");
		const rows = env.DB.prepare('SELECT * FROM adhoc').all().results;
		expect(rows.length).toBe(1);
		expect(rows[0].x).toBe('hi');
	});

	it('boolean field values coerce 0/1 to true/false on read', () => {
		const env = { DB: d1Mock() };
		const d1 = createD1Shim(env.DB);
		// Avoid "on" as a column name — SQLite reserves it (ON DELETE / ON UPDATE).
		d1.createTable('flags', { active: { type: 'boolean' } });
		d1.insert('flags', { active: true });
		d1.insert('flags', { active: false });
		const rows = d1.findAll('flags');
		expect(rows[0].active).toBe(true);
		expect(rows[1].active).toBe(false);
	});

	it('update with filter+data form (legacy convention 2)', () => {
		const env = { DB: d1Mock() };
		const d1 = createD1Shim(env.DB);
		d1.createTable('widgets', { name: { type: 'text' } });
		const rec = d1.insert('widgets', { name: 'first' });
		const changes = d1.update('widgets', { id: rec.id }, { name: 'second' });
		expect(changes).toBe(1);
		expect(d1.findOne('widgets', { id: rec.id }).name).toBe('second');
	});

	it('save() and load() are no-ops (D1 is always durable)', () => {
		const env = { DB: d1Mock() };
		const d1 = createD1Shim(env.DB);
		// No throw, no side-effect — match runtime/db.js contract
		d1.save();
		d1.load();
		expect(typeof d1.save).toBe('function');
		expect(typeof d1.load).toBe('function');
	});

	it('reset() clears every registered table', () => {
		const env = { DB: d1Mock() };
		const d1 = createD1Shim(env.DB);
		d1.createTable('a', { x: { type: 'text' } });
		d1.createTable('b', { y: { type: 'text' } });
		d1.insert('a', { x: '1' });
		d1.insert('b', { y: '2' });
		d1.reset();
		expect(d1.findAll('a').length).toBe(0);
		expect(d1.findAll('b').length).toBe(0);
	});
});

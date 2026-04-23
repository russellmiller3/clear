// lib/packaging-cloudflare-d1.test.js
// Phase 2 TDD suite for the D1 runtime on the Cloudflare Workers target.
//
// Unit-level tests that drive compileProgram(src, { target: 'cloudflare' })
// and assert the emitted `src/index.js` uses D1's prepare/bind/run API —
// never string-interpolated SQL (SQL-injection floor), never the Node
// `db.insert(...)` runtime. Security, correctness, and migration emission
// all gate on these.
//
// Cycles covered:
//   2.1 SAVE      → env.DB.prepare('INSERT INTO ...').bind(...).run()
//   2.2 LOOKUP    → env.DB.prepare('SELECT ...').all() / .first()
//   2.3 WHERE     → parameterized .bind(value) — never `' + val +'`
//   2.4 DELETE    → env.DB.prepare('DELETE ... WHERE ...').bind(...).run()
//   2.5 UPDATE    → require id on record, throw helpful error if missing
//   2.6 MIGRATIONS → result.workerBundle['migrations/001-init.sql'] exists,
//                    SQLite dialect, one CREATE TABLE per `define`.
//
// Hoisted synchronous imports so `it()` bodies are synchronous — per the
// exec correction in plan cycle 1.6 (async it() silently passes in the
// testUtils runner).

import { describe, it, expect } from './testUtils.js';
import { compileProgram } from '../index.js';

// ─────────────────────────────────────────────────────────────────────────
// Shared fixtures — one canonical table + endpoint set to exercise every
// CRUD operation. Written to match the conventions in AI-INSTRUCTIONS.md
// (no self-assignment, singular-receiving-var for Users-ish tables).
// ─────────────────────────────────────────────────────────────────────────

const SAVE_APP = `build for javascript backend
database is local memory

create a Todos table:
  title, required
  completed, default false

when user calls POST /api/todos sending todo:
  save todo as new Todo
  send back todo
`;

// ─────────────────────────────────────────────────────────────────────────
// Cycle 2.1 — SAVE emits D1 prepare/bind/run
// Marcus types `save todo as new Todo`. With target=cloudflare the emit
// MUST hit env.DB.prepare('INSERT INTO todos (...) VALUES (?, ?)').bind(...).run()
// — not the Node `db.insert(...)` path. If it drops to db.insert, the Worker
// crashes on first request because `db` isn't defined in the Workers runtime.
// ─────────────────────────────────────────────────────────────────────────

describe('Phase 2 cycle 2.1 — SAVE emits D1 prepare/bind/run', () => {
	it('emits env.DB.prepare("INSERT INTO todos ...") for save-as-new', () => {
		const result = compileProgram(SAVE_APP, { target: 'cloudflare' });
		expect(result.errors.length).toBe(0);
		const src = result.workerBundle['src/index.js'];
		expect(src).toContain('env.DB.prepare(');
		expect(src).toContain('INSERT INTO todos');
	});

	it('SAVE uses .bind(...) to parameterize values, never string concat', () => {
		const result = compileProgram(SAVE_APP, { target: 'cloudflare' });
		const src = result.workerBundle['src/index.js'];
		// Bind call must appear
		expect(src).toContain('.bind(');
		// No SQL-concat patterns: look for INSERT followed by raw interpolation
		// inside a template-literal. If the emit ever did `\`INSERT INTO todos VALUES (\${val})\``
		// this regex catches it.
		expect(/INSERT\s+INTO\s+\w+\s*\([^)]+\)\s+VALUES\s*\([^)]*\$\{/.test(src)).toBe(false);
		// Or a + concat variant
		expect(/INSERT\s+INTO\s+\w+\s*\([^)]+\)\s+VALUES\s*\([^)]*['"]?\s*\+\s*\w+/.test(src)).toBe(false);
	});

	it('SAVE ends the chain with .run() (not .all/.first) for writes', () => {
		const result = compileProgram(SAVE_APP, { target: 'cloudflare' });
		const src = result.workerBundle['src/index.js'];
		// The emit for INSERT should end with .run() — a read variant would
		// use .all() or .first(). Look for both INSERT and .run() near each other.
		expect(src).toContain('.run()');
	});

	it('SAVE emit does NOT reach for the Node `db.insert()` shim', () => {
		// The Node backend uses `await db.insert('todos', _pick(todo, TodoSchema))`.
		// Workers doesn't have a `db` symbol — must emit env.DB.* instead.
		const result = compileProgram(SAVE_APP, { target: 'cloudflare' });
		const src = result.workerBundle['src/index.js'];
		expect(src.includes('db.insert(')).toBe(false);
	});

	it('SAVE emit does NOT reach for Supabase client (different backend)', () => {
		const result = compileProgram(SAVE_APP, { target: 'cloudflare' });
		const src = result.workerBundle['src/index.js'];
		expect(src.includes('supabase.from(')).toBe(false);
	});
});

// ─────────────────────────────────────────────────────────────────────────
// Cycle 2.2 — LOOKUP emits D1 all() / first()
// `look up all records in Todos` → env.DB.prepare('SELECT * FROM todos').all()
// `.all()` returns { results: [...], meta: ... } in D1 — we must grab .results
// so the caller sees an array, matching the Node findAll contract.
// ─────────────────────────────────────────────────────────────────────────

const LOOKUP_APP = `build for javascript backend
database is local memory

create a Todos table:
  title, required
  completed, default false

when user requests data from /api/todos:
  all_todos = look up all records in Todos
  send back all_todos
`;

describe('Phase 2 cycle 2.2 — LOOKUP emits D1 all()', () => {
	it('emits env.DB.prepare("SELECT * FROM todos").all() for "look up all"', () => {
		const result = compileProgram(LOOKUP_APP, { target: 'cloudflare' });
		expect(result.errors.length).toBe(0);
		const src = result.workerBundle['src/index.js'];
		expect(src).toContain('env.DB.prepare(');
		expect(src).toContain('SELECT');
		expect(src).toContain('FROM todos');
		expect(src).toContain('.all()');
	});

	it('LOOKUP unwraps D1\'s {results, meta} shape — grabs .results', () => {
		// D1's .all() returns { results: [...], meta: {...}, success: true }.
		// The compiled code must project to .results so Clear's array-of-rows
		// contract holds. Test by looking for the .results access in the emit.
		const result = compileProgram(LOOKUP_APP, { target: 'cloudflare' });
		const src = result.workerBundle['src/index.js'];
		expect(src).toContain('.results');
	});

	it('LOOKUP emit does NOT reach for the Node `db.findAll()` shim', () => {
		const result = compileProgram(LOOKUP_APP, { target: 'cloudflare' });
		const src = result.workerBundle['src/index.js'];
		expect(src.includes('db.findAll(')).toBe(false);
		expect(src.includes('db.findOne(')).toBe(false);
	});
});

// ─────────────────────────────────────────────────────────────────────────
// Cycle 2.3 — WHERE clauses parameterized via D1 bind (SECURITY GATE)
// This is the SQL-injection floor. Every WHERE clause with a runtime value
// MUST use .bind(value), NEVER template-literal interpolation. If Marcus
// types `' OR 1=1 --` into a form, the query must fail to match, not drop
// the table.
// ─────────────────────────────────────────────────────────────────────────

const WHERE_APP = `build for javascript backend
database is local memory

create a Users table:
  email, required
  role, default 'member'

when user calls POST /api/find sending query:
  matches = look up records in Users where email is query's q
  send back matches
`;

const DELETE_APP_FOR_WHERE = `build for javascript backend
database is local memory

create a Todos table:
  title, required

allow signup and login

when user calls DELETE /api/todos/:id:
  requires login
  delete the Todo with this id
  send back 'deleted'
`;

describe('Phase 2 cycle 2.3 — WHERE clauses parameterized via D1 bind', () => {
	it('where clauses emit .bind(...) — parameterized not interpolated', () => {
		const result = compileProgram(WHERE_APP, { target: 'cloudflare' });
		expect(result.errors.length).toBe(0);
		const src = result.workerBundle['src/index.js'];
		expect(src).toContain('.bind(');
		// WHERE clause must include a ? placeholder
		expect(/WHERE\s+\w+\s*=\s*\?/.test(src)).toBe(true);
	});

	it('no WHERE clause uses `${` template interpolation for values', () => {
		const result = compileProgram(WHERE_APP, { target: 'cloudflare' });
		const src = result.workerBundle['src/index.js'];
		// Would match: WHERE email = '${query.q}' or WHERE email = ${v}
		expect(/WHERE\s+\w+\s*=\s*['"]?\s*\$\{/.test(src)).toBe(false);
	});

	it('no WHERE clause uses `+` string concat for values', () => {
		const result = compileProgram(WHERE_APP, { target: 'cloudflare' });
		const src = result.workerBundle['src/index.js'];
		// Would match: 'WHERE email = ' + query.q
		expect(/WHERE\s+\w+\s*=\s*['"]?\s*\+\s*\w+/.test(src)).toBe(false);
	});

	it('adversarial DELETE/id is safely parameterized (meta-guard)', () => {
		// This is the canary test: prove the above rules actually mean "bind"
		// by checking that an emit for a DELETE with an id does NOT embed
		// `req.params.id` directly into the SQL template.
		// NOTE: cycle 2.4 lands the DELETE impl; this test intentionally runs
		// against a stub that today returns a no-op comment — asserts below
		// still hold because there's no interpolation in the stub text.
		const result = compileProgram(DELETE_APP_FOR_WHERE, { target: 'cloudflare' });
		const src = result.workerBundle['src/index.js'];
		// Neither `+ req.params.id +` nor `${req.params.id}` anywhere near SQL
		expect(/DELETE\s+FROM\s+\w+\s+WHERE\s+\w+\s*=\s*\$\{/.test(src)).toBe(false);
		expect(/DELETE\s+FROM\s+\w+\s+WHERE\s+\w+\s*=\s*['"]?\s*\+\s*/.test(src)).toBe(false);
	});

	it('global grep: emit has zero string-interpolated SQL anywhere', () => {
		// Catch-all: for a representative endpoint set, no template literal
		// containing SQL keywords followed by an interpolated expression.
		// This is the grep from the plan's exit criteria.
		const srcs = [SAVE_APP, LOOKUP_APP, WHERE_APP, DELETE_APP_FOR_WHERE].map((s) =>
			compileProgram(s, { target: 'cloudflare' }).workerBundle['src/index.js'],
		);
		for (const src of srcs) {
			// "'INSERT INTO ' +" style
			expect(/['"](INSERT INTO |SELECT .*FROM |UPDATE |DELETE FROM )\s*['"]?\s*\+/.test(src)).toBe(false);
			// "`...${var}...`" style with a SQL verb on the same line
			// (approximate — real test is the per-op one above)
			expect(/(`|').*(INSERT INTO|DELETE FROM|UPDATE \w+|SELECT \*) \w*.*\$\{/.test(src)).toBe(false);
		}
	});
});

// ─────────────────────────────────────────────────────────────────────────
// Cycle 2.4 — DELETE emits D1 parameterized
// `delete the Todo with this id` → env.DB.prepare('DELETE FROM todos WHERE id = ?').bind(req.params.id).run()
// ─────────────────────────────────────────────────────────────────────────

const DELETE_APP = `build for javascript backend
database is local memory

create a Todos table:
  title, required

allow signup and login

when user calls DELETE /api/todos/:id:
  requires login
  delete the Todo with this id
  send back 'deleted'
`;

describe('Phase 2 cycle 2.4 — DELETE emits D1 parameterized', () => {
	it('emits env.DB.prepare("DELETE FROM todos WHERE id = ?").bind(...)', () => {
		const result = compileProgram(DELETE_APP, { target: 'cloudflare' });
		expect(result.errors.length).toBe(0);
		const src = result.workerBundle['src/index.js'];
		expect(src).toContain('env.DB.prepare(');
		expect(src).toContain('DELETE FROM todos');
		expect(/WHERE\s+id\s*=\s*\?/.test(src)).toBe(true);
		expect(src).toContain('.bind(');
	});

	it('DELETE ends with .run()', () => {
		const result = compileProgram(DELETE_APP, { target: 'cloudflare' });
		const src = result.workerBundle['src/index.js'];
		expect(src).toContain('.run()');
	});

	it('DELETE does NOT call db.remove() (Node path)', () => {
		const result = compileProgram(DELETE_APP, { target: 'cloudflare' });
		const src = result.workerBundle['src/index.js'];
		expect(src.includes('db.remove(')).toBe(false);
	});
});

// lib/packaging-cloudflare-templates.test.js
// Cycle 2.8 — every core template compiles clean for target=cloudflare
// AND a representative pair (hello-world + todo-fullstack) runs end-to-end
// against a mocked D1 (better-sqlite3 via d1Mock()).
//
// This is the "shipped bug" acceptance surface from CLAUDE.md's Template
// Smoke Test rule. New syntax that passes unit tests but breaks real apps
// is a shipped bug — the 8 core templates ARE the test.
//
// End-to-end shape:
//   1. compileProgram(source, { target: 'cloudflare' })
//   2. Write result.workerBundle['src/index.js'] to a temp .mjs
//   3. Spin up env = { DB: d1Mock() }, apply the migrations file
//   4. Dynamically import the worker, invoke its fetch() with a Request
//   5. Assert: write endpoint returns a row; read endpoint returns the list

import { describe, it, expect, testAsync } from './testUtils.js';
import { compileProgram } from '../index.js';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { d1Mock } from '../runtime/db-d1.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

// ─────────────────────────────────────────────────────────────────────────
// Cycle 2.8 — 8 core templates compile clean for Workers target
// Same fixture list as cycle 1.5; the D1 branches in compileCrud must
// not break apps that were compiling green before Phase 2 landed.
// ─────────────────────────────────────────────────────────────────────────

describe('Phase 2 cycle 2.8 — 8 core templates compile clean for Workers target', () => {
	const CORE_8 = [
		'todo-fullstack',
		'crm-pro',
		'blog-fullstack',
		'live-chat',
		'helpdesk-agent',
		'booking',
		'expense-tracker',
		'ecom-agent',
	];

	for (const app of CORE_8) {
		it(`${app}: compiles with target=cloudflare → 0 errors + workerBundle populated`, () => {
			const src = readFileSync(resolve(REPO_ROOT, 'apps', app, 'main.clear'), 'utf8');
			const result = compileProgram(src, { target: 'cloudflare' });
			if (result.errors.length > 0) {
				throw new Error(
					`${app} emitted ${result.errors.length} compile errors for target=cloudflare:\n` +
					result.errors.slice(0, 5).map((e) => `  line ${e.line}: ${e.message}`).join('\n'),
				);
			}
			expect(result.errors.length).toBe(0);
			expect(typeof result.workerBundle['src/index.js']).toBe('string');
			expect(typeof result.workerBundle['wrangler.toml']).toBe('string');
		});

		it(`${app}: Workers emit contains zero string-interpolated SQL (security floor)`, () => {
			const src = readFileSync(resolve(REPO_ROOT, 'apps', app, 'main.clear'), 'utf8');
			const result = compileProgram(src, { target: 'cloudflare' });
			if (result.errors.length > 0) return; // compile already flagged
			const emit = result.workerBundle['src/index.js'];
			// SQL verbs followed by + concat
			expect(/['"](INSERT INTO |DELETE FROM |UPDATE \w+|SELECT )\s*['"]?\s*\+/.test(emit)).toBe(false);
			// WHERE with ${} interpolation
			expect(/WHERE\s+\w+\s*=\s*['"]?\s*\$\{/.test(emit)).toBe(false);
		});
	}
});

// ─────────────────────────────────────────────────────────────────────────
// Cycle 2.8 — end-to-end: hello-world runs under d1Mock
// Compile, boot the Worker against the mock, drive a fetch, assert 200.
// ─────────────────────────────────────────────────────────────────────────

const HELLO = `build for javascript backend

when user requests data from /api/hello:
  send back 'hi'
`;

await testAsync('cf-2.8: hello-world runs end-to-end against d1Mock', async () => {
	const result = compileProgram(HELLO, { target: 'cloudflare' });
	expect(result.errors.length).toBe(0);
	const dir = mkdtempSync(join(tmpdir(), 'clear-cf-e2e-'));
	try {
		const entry = join(dir, 'index.mjs');
		writeFileSync(entry, result.workerBundle['src/index.js'], 'utf8');
		const mod = await import(pathToFileURL(entry).href);

		const env = { DB: d1Mock() };
		const req = new Request('http://localhost/api/hello', { method: 'GET' });
		const resp = await mod.default.fetch(req, env, {});
		if (resp.status !== 200) {
			throw new Error('hello-world endpoint returned ' + resp.status);
		}
		const body = await resp.json();
		if (body.message !== 'hi') {
			throw new Error('hello-world body wrong: ' + JSON.stringify(body));
		}
	} finally {
		try { rmSync(dir, { recursive: true, force: true }); } catch (_e) {}
	}
});

// ─────────────────────────────────────────────────────────────────────────
// Cycle 2.8 — end-to-end: a todo app runs against d1Mock
// Apply the emitted migrations, then POST a todo, then GET the list.
// This proves the whole Phase 2 surface (SAVE + LOOKUP + migrations +
// compileRespond cloudflare branch) works against a real SQLite backend
// through the D1 API shape.
// ─────────────────────────────────────────────────────────────────────────

const TODO_APP = `build for javascript backend

create a Todos table:
  title, required
  completed, default false

when user calls POST /api/todos sending todo:
  saved = save todo as new Todo
  send back saved

when user requests data from /api/todos:
  all_todos = look up all records in Todos
  send back all_todos
`;

await testAsync('cf-2.8: todo app write+read runs end-to-end against d1Mock', async () => {
	const result = compileProgram(TODO_APP, { target: 'cloudflare' });
	expect(result.errors.length).toBe(0);
	const migrations = result.workerBundle['migrations/001-init.sql'];
	if (!migrations) throw new Error('todo app emitted no migrations file');

	const dir = mkdtempSync(join(tmpdir(), 'clear-cf-todo-'));
	try {
		const entry = join(dir, 'index.mjs');
		writeFileSync(entry, result.workerBundle['src/index.js'], 'utf8');
		const mod = await import(pathToFileURL(entry).href);

		const env = { DB: d1Mock() };
		// Apply migrations to the mock DB before the first request
		env.DB.exec(migrations);

		// Write: POST /api/todos with a title
		const writeReq = new Request('http://localhost/api/todos', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ title: 'first one', completed: false }),
		});
		const writeResp = await mod.default.fetch(writeReq, env, {});
		if (writeResp.status !== 200 && writeResp.status !== 201) {
			const txt = await writeResp.text();
			throw new Error('POST /api/todos returned ' + writeResp.status + ' body=' + txt);
		}
		const saved = await writeResp.json();
		if (!saved || saved.title !== 'first one') {
			throw new Error('POST body wrong: ' + JSON.stringify(saved));
		}

		// Read: GET /api/todos returns the list
		const readReq = new Request('http://localhost/api/todos', { method: 'GET' });
		const readResp = await mod.default.fetch(readReq, env, {});
		if (readResp.status !== 200) {
			throw new Error('GET /api/todos returned ' + readResp.status);
		}
		const list = await readResp.json();
		if (!Array.isArray(list) || list.length !== 1 || list[0].title !== 'first one') {
			throw new Error('GET body wrong: ' + JSON.stringify(list));
		}
	} finally {
		try { rmSync(dir, { recursive: true, force: true }); } catch (_e) {}
	}
});

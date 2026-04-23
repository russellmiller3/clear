// lib/packaging-cloudflare.test.js
// Phase 1 TDD suite for the Cloudflare Workers target.
// Drives compileProgram(src, { target: 'cloudflare' }) and the new
// lib/packaging-cloudflare.js emitter. Real deploy never runs here —
// everything asserts on the emitted bundle files.

import { describe, it, expect } from './testUtils.js';
import { compileProgram } from '../index.js';
import { mkdtempSync, writeFileSync, rmSync, readFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve, dirname } from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

// ─────────────────────────────────────────────────────────────────────────
// Cycle 1.1 — target plumbing
// compileProgram(src, { target: 'cloudflare' }) returns a result object
// with `result.workerBundle` defined. This is the most minimal RED test:
// asking for a Workers target MUST give the caller a dedicated bundle
// slot on the result, separate from the default Node serverJS/html fields.
// ─────────────────────────────────────────────────────────────────────────

describe('Phase 1 cycle 1.1 — target=cloudflare plumbs through compileProgram', () => {
	const HELLO = `build for javascript backend

when user requests data from /api/hello:
  send back 'hi'
`;

	it('returns a result object with workerBundle defined when target=cloudflare', () => {
		const result = compileProgram(HELLO, { target: 'cloudflare' });
		expect(result.workerBundle).toBeDefined();
	});

	it('workerBundle is an object (not null, not undefined, not a string)', () => {
		const result = compileProgram(HELLO, { target: 'cloudflare' });
		expect(typeof result.workerBundle).toBe('object');
		expect(result.workerBundle).not.toBeNull();
	});

	it('does NOT emit workerBundle for the default (Node) target', () => {
		const result = compileProgram(HELLO);
		expect(result.workerBundle).toBeUndefined();
	});

	it('does NOT emit workerBundle for target=web', () => {
		const result = compileProgram(HELLO, { target: 'web' });
		expect(result.workerBundle).toBeUndefined();
	});
});

// ─────────────────────────────────────────────────────────────────────────
// Cycle 1.2 — fetch handler emission
// Hello-world app (one endpoint, no DB). workerBundle['src/index.js']
// exists and contains the ESM default-export fetch handler shape
// Workers-for-Platforms expects. Routes by URL.pathname.
// ─────────────────────────────────────────────────────────────────────────

describe('Phase 1 cycle 1.2 — emit fetch handler for Workers target', () => {
	const HELLO = `build for javascript backend

when user requests data from /api/hello:
  send back 'hi'
`;

	it('workerBundle has a src/index.js entry', () => {
		const result = compileProgram(HELLO, { target: 'cloudflare' });
		expect(typeof result.workerBundle['src/index.js']).toBe('string');
		expect(result.workerBundle['src/index.js'].length).toBeGreaterThan(0);
	});

	it('src/index.js is ESM export-default fetch handler shape', () => {
		const result = compileProgram(HELLO, { target: 'cloudflare' });
		const src = result.workerBundle['src/index.js'];
		// Canonical Workers entry point — Cloudflare Runtime API requires this shape
		expect(src).toContain('export default');
		expect(src).toContain('async fetch(request, env, ctx)');
	});

	it('src/index.js routes by URL.pathname', () => {
		const result = compileProgram(HELLO, { target: 'cloudflare' });
		const src = result.workerBundle['src/index.js'];
		// Must use URL.pathname (not req.path/req.url) — Workers uses the web Request API
		expect(src).toContain('new URL(request.url)');
	});

	it('hello-world endpoint appears in the routed output', () => {
		const result = compileProgram(HELLO, { target: 'cloudflare' });
		const src = result.workerBundle['src/index.js'];
		// The /api/hello path must be discoverable in the emitted source
		expect(src).toContain('/api/hello');
	});
});

// ─────────────────────────────────────────────────────────────────────────
// Cycle 1.3 — ESM-only + node --check
// Emitted src/index.js must (a) parse as a valid ES module and (b) never
// contain `require(`, `module.exports`, or `import ... require` patterns.
// Workers-for-Platforms rejects CJS at upload; esbuild can't bundle mixed
// modules cleanly. This test is the drift-guard.
// ─────────────────────────────────────────────────────────────────────────

describe('Phase 1 cycle 1.3 — Workers emit is ESM + passes node --check', () => {
	const HELLO = `build for javascript backend

when user requests data from /api/hello:
  send back 'hi'
`;

	function nodeCheckEsm(src) {
		// Write to a temp .mjs file + spawn `node --check`. The --check flag
		// parses syntax without executing, perfect for guarding generated code.
		const dir = mkdtempSync(join(tmpdir(), 'clear-cf-check-'));
		const file = join(dir, 'index.mjs');
		writeFileSync(file, src, 'utf8');
		try {
			execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
			return { ok: true };
		} catch (e) {
			return { ok: false, stderr: e.stderr?.toString() || String(e) };
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	}

	it('emitted src/index.js passes node --check as ESM', () => {
		const result = compileProgram(HELLO, { target: 'cloudflare' });
		const src = result.workerBundle['src/index.js'];
		const r = nodeCheckEsm(src);
		if (!r.ok) throw new Error('node --check rejected emit:\n' + r.stderr);
		expect(r.ok).toBe(true);
	});

	it('emitted src/index.js contains zero require( calls (ESM-only)', () => {
		const result = compileProgram(HELLO, { target: 'cloudflare' });
		const src = result.workerBundle['src/index.js'];
		expect(src.includes('require(')).toBe(false);
	});

	it('emitted src/index.js contains zero module.exports (ESM-only)', () => {
		const result = compileProgram(HELLO, { target: 'cloudflare' });
		const src = result.workerBundle['src/index.js'];
		expect(src.includes('module.exports')).toBe(false);
	});

	it('node --check correctly REJECTS a deliberately malformed source (meta-guard)', () => {
		// Prove the guard itself works — if we feed it broken JS, it must fail.
		// Otherwise future regressions could slip through a no-op checker.
		const broken = 'export default { async fetch(request, env, ctx { return new Response("bad"); } };';
		const r = nodeCheckEsm(broken);
		expect(r.ok).toBe(false);
	});
});

// ─────────────────────────────────────────────────────────────────────────
// Cycle 1.4 — wrangler.toml with pinned compat date + flags
// Single-source constants (CF_COMPAT_DATE + CF_COMPAT_FLAGS) so upgrades
// are a one-line edit. wranglerTomlTemplate() is a pure function for
// testing the format without compiling a full Clear program.
// ─────────────────────────────────────────────────────────────────────────

describe('Phase 1 cycle 1.4 — wrangler.toml pinned compat date + flags', () => {
	const HELLO = `build for javascript backend

when user requests data from /api/hello:
  send back 'hi'
`;

	it('workerBundle has a wrangler.toml entry', () => {
		const result = compileProgram(HELLO, { target: 'cloudflare' });
		expect(typeof result.workerBundle['wrangler.toml']).toBe('string');
		expect(result.workerBundle['wrangler.toml'].length).toBeGreaterThan(0);
	});

	it('wrangler.toml has a `name` line', () => {
		const result = compileProgram(HELLO, { target: 'cloudflare' });
		const toml = result.workerBundle['wrangler.toml'];
		expect(toml).toMatch(/^name\s*=\s*".+"$/m);
	});

	it('wrangler.toml sets main to "src/index.js"', () => {
		const result = compileProgram(HELLO, { target: 'cloudflare' });
		const toml = result.workerBundle['wrangler.toml'];
		expect(toml).toMatch(/^main\s*=\s*"src\/index\.js"$/m);
	});

	it('wrangler.toml pins compatibility_date = "2025-04-01"', () => {
		const result = compileProgram(HELLO, { target: 'cloudflare' });
		const toml = result.workerBundle['wrangler.toml'];
		expect(toml).toMatch(/^compatibility_date\s*=\s*"2025-04-01"$/m);
	});

	it('wrangler.toml pins compatibility_flags = ["nodejs_compat_v2"]', () => {
		const result = compileProgram(HELLO, { target: 'cloudflare' });
		const toml = result.workerBundle['wrangler.toml'];
		expect(toml).toMatch(/^compatibility_flags\s*=\s*\["nodejs_compat_v2"\]$/m);
	});

	it('wranglerTomlTemplate is a pure function exported from packaging-cloudflare', async () => {
		// Pure-function testability — can import + call without touching the compiler.
		const mod = await import('./packaging-cloudflare.js');
		expect(typeof mod.wranglerTomlTemplate).toBe('function');
		const toml = mod.wranglerTomlTemplate({ name: 'unit-test-app' });
		expect(toml).toContain('name = "unit-test-app"');
		expect(toml).toContain('compatibility_date = "2025-04-01"');
	});

	it('CF_COMPAT_DATE and CF_COMPAT_FLAGS are exported constants', async () => {
		const mod = await import('./packaging-cloudflare.js');
		expect(mod.CF_COMPAT_DATE).toBe('2025-04-01');
		expect(Array.isArray(mod.CF_COMPAT_FLAGS)).toBe(true);
		expect(mod.CF_COMPAT_FLAGS).toContain('nodejs_compat_v2');
	});
});

// ─────────────────────────────────────────────────────────────────────────
// Cycle 1.4b — data-clear-line preservation drift-guard
// Click-to-edit (future plan) keys off data-clear-line="N" attributes
// the compiler emits on every HTML element. Workers codegen must preserve
// those byte-for-byte inside any embedded HTML string. Regression guard:
// if someone ever runs the HTML through a minifier or strips attributes,
// this test screams.
// ─────────────────────────────────────────────────────────────────────────

describe('Phase 1 cycle 1.4b — data-clear-line attrs survive Workers emit', () => {
	const UI_APP = `build for web and javascript backend

page home:
  heading 'Hello'
  button labeled 'Click me' does:
    show toast 'hi'
`;

	it('compiled HTML has data-clear-line attrs (baseline check)', () => {
		const result = compileProgram(UI_APP);
		expect(result.html).toContain('data-clear-line=');
	});

	it('Workers src/index.js embeds HTML with data-clear-line attrs intact', () => {
		const result = compileProgram(UI_APP, { target: 'cloudflare' });
		const src = result.workerBundle['src/index.js'];
		// The emit wraps HTML in a JSON-stringified literal so escapes survive.
		// The literal substring 'data-clear-line=' must be discoverable.
		expect(src).toContain('data-clear-line=');
	});
});

// ─────────────────────────────────────────────────────────────────────────
// Cycle 1.5 — all 8 core templates compile for Workers target
// These apps are the acceptance surface for Clear. Each exercises a
// different feature slice (CRUD, charts, chat, agent, workflow, etc).
// A template compile error for target=cloudflare = shipped bug.
// ─────────────────────────────────────────────────────────────────────────

describe('Phase 1 cycle 1.5 — 8 core templates compile clean for Workers target', () => {
	// Core 8 per CLAUDE.md
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
	}

	it('every core-template workerBundle src/index.js passes node --check', () => {
		// Single test iterating all 8 so a single failure points to the offender.
		const failures = [];
		for (const app of CORE_8) {
			const src = readFileSync(resolve(REPO_ROOT, 'apps', app, 'main.clear'), 'utf8');
			const result = compileProgram(src, { target: 'cloudflare' });
			if (result.errors.length > 0) continue; // caught by per-app test above
			const dir = mkdtempSync(join(tmpdir(), 'clear-cf-tmpl-'));
			const file = join(dir, 'index.mjs');
			try {
				writeFileSync(file, result.workerBundle['src/index.js'], 'utf8');
				execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
			} catch (e) {
				failures.push({ app, err: e.stderr?.toString() || String(e) });
			} finally {
				rmSync(dir, { recursive: true, force: true });
			}
		}
		if (failures.length > 0) {
			throw new Error(
				'Workers emit failed node --check for:\n' +
				failures.map((f) => `  ${f.app}: ${f.err.split('\n').slice(0, 2).join(' | ')}`).join('\n'),
			);
		}
		expect(failures.length).toBe(0);
	});
});

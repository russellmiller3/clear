// lib/packaging-cloudflare.test.js
// Phase 1 TDD suite for the Cloudflare Workers target.
// Drives compileProgram(src, { target: 'cloudflare' }) and the new
// lib/packaging-cloudflare.js emitter. Real deploy never runs here —
// everything asserts on the emitted bundle files.

import { describe, it, expect } from './testUtils.js';
import { compileProgram } from '../index.js';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { execFileSync } from 'child_process';

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

// lib/packaging-cloudflare.test.js
// Phase 1 TDD suite for the Cloudflare Workers target.
// Drives compileProgram(src, { target: 'cloudflare' }) and the new
// lib/packaging-cloudflare.js emitter. Real deploy never runs here —
// everything asserts on the emitted bundle files.

import { describe, it, expect } from './testUtils.js';
import { compileProgram } from '../index.js';

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

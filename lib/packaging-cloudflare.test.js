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

// lib/packaging-cloudflare-cron.test.js
// Phase 5 TDD suite — scheduled agents + background blocks on Cloudflare.
//
// The Workers-for-Platforms runtime has no long-lived process, so `node-cron`
// and `setInterval` can't run periodic work. Cloudflare Cron Triggers fill
// the gap: wrangler.toml declares cron expressions, and the deployed script
// exposes a `scheduled(event, env, ctx)` handler that fires when the
// scheduler pings it.
//
// Phase 5 covers:
//   5.1  — node-cron / setInterval absent from Workers-target bundles
//   5.2  — scheduled() handler emitted alongside fetch() for Workers target
//   5.3  — wrangler.toml gets [triggers] crons = [...]
//   5.4  — duration phrases → cron expressions (translator table)
//   5.5  — scheduled() handler emitted unconditionally whenever any cron exists
//   5.6  — end-to-end: compile + invoke scheduled() handler in a harness
//   5.7  — learnings folded into the commit for 5.6

import { describe, it, expect, testAsync } from './testUtils.js';
import { compileProgram } from '../index.js';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { execFileSync } from 'child_process';

// ─────────────────────────────────────────────────────────────────────────
// Cycle 5.1 — RED: a background block with `runs every 1 hour` compiled
// with target=cloudflare must NOT emit node-cron or setInterval into the
// Workers bundle. The Node target path stays intact.
// ─────────────────────────────────────────────────────────────────────────

describe('Phase 5 cycle 5.1 — no node-cron / setInterval in Workers-target bundles', () => {
	const SRC = `build for javascript backend

background 'cleanup':
  runs every 1 hour
  remember count = 0
  count = count + 1
`;

	it('compiles clean with target=cloudflare', () => {
		const result = compileProgram(SRC, { target: 'cloudflare' });
		expect(result.errors.length).toBe(0);
	});

	it('Workers src/index.js contains no `require("node-cron")` call', () => {
		const result = compileProgram(SRC, { target: 'cloudflare' });
		const src = result.workerBundle['src/index.js'];
		expect(src.includes("require('node-cron')")).toBe(false);
		expect(src.includes('require("node-cron")')).toBe(false);
		expect(src.includes('node-cron')).toBe(false);
	});

	it('Workers src/index.js contains no setInterval call', () => {
		const result = compileProgram(SRC, { target: 'cloudflare' });
		const src = result.workerBundle['src/index.js'];
		expect(src.includes('setInterval')).toBe(false);
	});

	it('Node target (default) still emits node-cron OR setInterval for `runs every`', () => {
		// Pin the Node path so a future refactor can't silently drop the old
		// periodic-job emit and break existing Node deploys. `build for javascript
		// backend` puts the emit in result.javascript; `build for web and js
		// backend` puts it in result.serverJS. Check both so the invariant
		// holds regardless of which backend field the emitter chose.
		const result = compileProgram(SRC);
		expect(result.errors.length).toBe(0);
		const combined = (result.serverJS || '') + (result.javascript || '');
		const hasPeriodic = combined.includes('setInterval') || combined.includes('node-cron');
		expect(hasPeriodic).toBe(true);
	});
});

// ─────────────────────────────────────────────────────────────────────────
// Cycle 5.2 — the Workers bundle gets a scheduled(event, env, ctx) handler
// alongside its fetch(). One handler branches on event.cron to dispatch to
// the right background/cron block body.
// ─────────────────────────────────────────────────────────────────────────

describe('Phase 5 cycle 5.2 — scheduled() handler dispatches cron blocks', () => {
	const SRC_ONE = `build for javascript backend

background 'cleanup':
  runs every 1 hour
  remember count = 0
  count = count + 1
`;

	const SRC_TWO = `build for javascript backend

background 'cleanup':
  runs every 1 hour
  remember count = 0
  count = count + 1

background 'heartbeat':
  runs every 10 minutes
  remember beats = 0
  beats = beats + 1
`;

	it('src/index.js has a scheduled(event, env, ctx) handler when a cron block exists', () => {
		const result = compileProgram(SRC_ONE, { target: 'cloudflare' });
		const src = result.workerBundle['src/index.js'];
		// Canonical Workers scheduled handler signature — Cloudflare's API expects this shape
		expect(src).toContain('async scheduled(event, env, ctx)');
	});

	it('scheduled() handler is a peer of fetch() inside the single export default object', () => {
		const result = compileProgram(SRC_ONE, { target: 'cloudflare' });
		const src = result.workerBundle['src/index.js'];
		// Both handlers present in the same export default — Workers rejects a
		// scheduled() that isn't a method on the same object as fetch()
		expect(src).toContain('export default {');
		expect(src).toContain('async fetch(request, env, ctx)');
		expect(src).toContain('async scheduled(event, env, ctx)');
	});

	it('scheduled() branches on event.cron to route to the right body', () => {
		const result = compileProgram(SRC_TWO, { target: 'cloudflare' });
		const src = result.workerBundle['src/index.js'];
		// Must dispatch on event.cron so a 10-minute cron and a 1-hour cron
		// both land inside the same handler but execute different bodies
		expect(src).toContain('event.cron');
		// Each cron pattern string must appear verbatim inside the handler —
		// matching the pattern in wrangler.toml's crons array (5.3)
		expect(src).toContain('0 * * * *'); // every 1 hour
		expect(src).toContain('*/10 * * * *'); // every 10 minutes
	});

	it('scheduled() handler appears AFTER fetch() in the export default body (cosmetic but pinned)', () => {
		const result = compileProgram(SRC_ONE, { target: 'cloudflare' });
		const src = result.workerBundle['src/index.js'];
		const fetchIdx = src.indexOf('async fetch(request');
		const schedIdx = src.indexOf('async scheduled(event');
		expect(fetchIdx).toBeGreaterThan(0);
		expect(schedIdx).toBeGreaterThan(fetchIdx);
	});

	it('src/index.js parses clean under `node --check` with both handlers', () => {
		const result = compileProgram(SRC_TWO, { target: 'cloudflare' });
		const src = result.workerBundle['src/index.js'];
		const dir = mkdtempSync(join(tmpdir(), 'clear-cf52-check-'));
		const file = join(dir, 'index.mjs');
		writeFileSync(file, src, 'utf8');
		try {
			execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
		} catch (e) {
			throw new Error('node --check rejected src/index.js:\n' + (e.stderr?.toString() || String(e)));
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it('a program with NO cron blocks does NOT emit a scheduled() handler', () => {
		// scheduled() declared on the script but not matched by any wrangler
		// cron trigger wastes the handler; not declaring it for apps without
		// periodic work keeps the bundle small.
		const plainSrc = `build for javascript backend

when user requests data from /api/hello:
  send back 'hi'
`;
		const result = compileProgram(plainSrc, { target: 'cloudflare' });
		const src = result.workerBundle['src/index.js'];
		expect(src.includes('async scheduled(event, env, ctx)')).toBe(false);
	});
});

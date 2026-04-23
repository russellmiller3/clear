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

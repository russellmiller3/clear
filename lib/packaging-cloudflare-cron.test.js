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
import { _scheduleToCron } from '../compiler.js';
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

// ─────────────────────────────────────────────────────────────────────────
// Cycle 5.3 — wrangler.toml emits [triggers] crons = [...] with one entry
// per runs-every block, all coalesced into a single array. If you declare
// a scheduled() handler on the script but forget to list the crons in
// wrangler.toml, Cloudflare won't fire anything. Mirror is critical.
// ─────────────────────────────────────────────────────────────────────────

describe('Phase 5 cycle 5.3 — wrangler.toml emits [triggers] crons', () => {
	const SRC_ONE = `build for javascript backend

background 'cleanup':
  runs every 1 hour
  remember count = 0
  count = count + 1
`;

	const SRC_THREE = `build for javascript backend

background 'cleanup':
  runs every 1 hour
  remember count = 0
  count = count + 1

background 'heartbeat':
  runs every 10 minutes
  remember beats = 0
  beats = beats + 1

every day at 9am:
  remember greetings = 0
  greetings = greetings + 1
`;

	it('wrangler.toml gets a [triggers] section with crons = [...] for one cron block', () => {
		const result = compileProgram(SRC_ONE, { target: 'cloudflare' });
		const toml = result.workerBundle['wrangler.toml'];
		expect(toml).toContain('[triggers]');
		expect(toml).toContain('crons =');
		expect(toml).toContain('"0 * * * *"');
	});

	it('three cron blocks coalesce into a single crons array of three entries', () => {
		const result = compileProgram(SRC_THREE, { target: 'cloudflare' });
		const toml = result.workerBundle['wrangler.toml'];
		expect(toml).toContain('[triggers]');
		// All three cron patterns must be present in the same array
		expect(toml).toContain('"0 * * * *"'); // every 1 hour
		expect(toml).toContain('"*/10 * * * *"'); // every 10 minutes
		expect(toml).toContain('"0 9 * * *"'); // every day at 9am
		// And only one [triggers] section
		const triggerMatches = toml.match(/\[triggers\]/g) || [];
		expect(triggerMatches.length).toBe(1);
	});

	it('a program with NO cron blocks does NOT emit a [triggers] section', () => {
		const plainSrc = `build for javascript backend

when user requests data from /api/hello:
  send back 'hi'
`;
		const result = compileProgram(plainSrc, { target: 'cloudflare' });
		const toml = result.workerBundle['wrangler.toml'];
		expect(toml.includes('[triggers]')).toBe(false);
		expect(toml.includes('crons')).toBe(false);
	});

	it('crons array entries are deduped (two blocks on the same cadence produce ONE entry)', () => {
		// Two BACKGROUND blocks both running every hour → one cron trigger,
		// but TWO branches inside scheduled(). The array is a set; the
		// handler is a switch.
		const dupeSrc = `build for javascript backend

background 'one':
  runs every 1 hour
  remember a = 0
  a = a + 1

background 'two':
  runs every 1 hour
  remember b = 0
  b = b + 1
`;
		const result = compileProgram(dupeSrc, { target: 'cloudflare' });
		const toml = result.workerBundle['wrangler.toml'];
		const matches = toml.match(/"0 \* \* \* \*"/g) || [];
		expect(matches.length).toBe(1);
	});
});

// ─────────────────────────────────────────────────────────────────────────
// Cycle 5.4 — duration-phrase → cron expression translator table. Exhaustive
// unit tests on the pure _scheduleToCron(spec) helper. Drift in this table
// is expensive: a wrong cron expression doesn't throw — the job just fires
// on the wrong cadence, silently, for as long as the bundle is deployed.
// ─────────────────────────────────────────────────────────────────────────

describe('Phase 5 cycle 5.4 — _scheduleToCron translator', () => {
	// Minutes
	it('every 1 minute → * * * * *', () => {
		expect(_scheduleToCron({ value: 1, unit: 'minute' })).toBe('* * * * *');
	});
	it('every 5 minutes → */5 * * * *', () => {
		expect(_scheduleToCron({ value: 5, unit: 'minute' })).toBe('*/5 * * * *');
	});
	it('every 10 minutes → */10 * * * *', () => {
		expect(_scheduleToCron({ value: 10, unit: 'minute' })).toBe('*/10 * * * *');
	});
	it('every 30 minutes → */30 * * * *', () => {
		expect(_scheduleToCron({ value: 30, unit: 'minute' })).toBe('*/30 * * * *');
	});
	it('every 60+ minutes → rounds up to hourly', () => {
		// Once you hit 60 minutes the hour slot gives a cleaner cron expr
		expect(_scheduleToCron({ value: 60, unit: 'minute' })).toBe('0 * * * *');
		expect(_scheduleToCron({ value: 120, unit: 'minute' })).toBe('0 * * * *');
	});

	// Hours
	it('every 1 hour → 0 * * * *', () => {
		expect(_scheduleToCron({ value: 1, unit: 'hour' })).toBe('0 * * * *');
	});
	it('every 6 hours → 0 */6 * * *', () => {
		expect(_scheduleToCron({ value: 6, unit: 'hour' })).toBe('0 */6 * * *');
	});
	it('every 12 hours → 0 */12 * * *', () => {
		expect(_scheduleToCron({ value: 12, unit: 'hour' })).toBe('0 */12 * * *');
	});
	it('every 24+ hours → rounds to daily', () => {
		expect(_scheduleToCron({ value: 24, unit: 'hour' })).toBe('0 0 * * *');
	});

	// Days
	it('every 1 day → 0 0 * * *', () => {
		expect(_scheduleToCron({ value: 1, unit: 'day' })).toBe('0 0 * * *');
	});
	it('every 7 days → 0 0 */7 * *', () => {
		expect(_scheduleToCron({ value: 7, unit: 'day' })).toBe('0 0 */7 * *');
	});

	// Every day at HH:MM — both AGENT and CRON shapes
	it('every day at 9am (agent shape: at="9am") → 0 9 * * *', () => {
		expect(_scheduleToCron({ value: 1, unit: 'day', at: '9am' })).toBe('0 9 * * *');
	});
	it('every day at 2:30pm (agent shape: at="2:30pm") → 30 14 * * *', () => {
		expect(_scheduleToCron({ value: 1, unit: 'day', at: '2:30pm' })).toBe('30 14 * * *');
	});
	it('every day at 14:30 (agent shape, 24-hour) → 30 14 * * *', () => {
		expect(_scheduleToCron({ value: 1, unit: 'day', at: '14:30' })).toBe('30 14 * * *');
	});
	it('every day at 9am (cron mode=at shape) → 0 9 * * *', () => {
		expect(_scheduleToCron({ mode: 'at', hour: 9, minute: 0 })).toBe('0 9 * * *');
	});
	it('every day at 14:30 (cron mode=at shape) → 30 14 * * *', () => {
		expect(_scheduleToCron({ mode: 'at', hour: 14, minute: 30 })).toBe('30 14 * * *');
	});

	// Edge cases
	it('seconds round up to 1 minute (Cloudflare floor)', () => {
		expect(_scheduleToCron({ value: 30, unit: 'second' })).toBe('* * * * *');
		expect(_scheduleToCron({ value: 1, unit: 'second' })).toBe('* * * * *');
	});
	it('unit pluralization is tolerated (minutes, hours, days)', () => {
		expect(_scheduleToCron({ value: 5, unit: 'minutes' })).toBe('*/5 * * * *');
		expect(_scheduleToCron({ value: 2, unit: 'hours' })).toBe('0 */2 * * *');
		expect(_scheduleToCron({ value: 3, unit: 'days' })).toBe('0 0 */3 * *');
	});
	it('missing / malformed spec falls back to hourly (defensive, never throws)', () => {
		expect(_scheduleToCron(null)).toBe('0 * * * *');
		expect(_scheduleToCron(undefined)).toBe('0 * * * *');
		expect(_scheduleToCron({})).toBe('0 * * * *');
		expect(_scheduleToCron({ value: 5, unit: 'fortnight' })).toBe('0 * * * *');
	});
});

// ─────────────────────────────────────────────────────────────────────────
// Cycle 5.5 — scheduled() handler emitted unconditionally whenever ANY cron
// exists in wrangler.toml. CF rejects a deploy where wrangler declares
// [triggers] crons but the script has no scheduled() export. The invariant
// is the inverse of 5.3's "empty crons → no handler": a populated crons
// array MUST have a matching handler.
// ─────────────────────────────────────────────────────────────────────────

describe('Phase 5 cycle 5.5 — handler presence mirrors wrangler triggers', () => {
	// Every shape of schedulable block — the handler must appear for each.
	const SHAPES = [
		{
			label: 'BACKGROUND block',
			src: `build for javascript backend

background 'cleanup':
  runs every 1 hour
  remember c = 0
  c = c + 1
`,
		},
		{
			label: 'CRON block (every N minutes)',
			src: `build for javascript backend

every 5 minutes:
  remember ticks = 0
  ticks = ticks + 1
`,
		},
		{
			label: 'CRON block (every day at HH:MM)',
			src: `build for javascript backend

every day at 9am:
  remember greetings = 0
  greetings = greetings + 1
`,
		},
		{
			label: 'scheduled AGENT block',
			src: `build for javascript backend

agent 'poller' runs every 1 hour:
  remember polls = 0
  polls = polls + 1
`,
		},
	];

	for (const shape of SHAPES) {
		it(`${shape.label} — crons declared ↔ scheduled() emitted (mirror)`, () => {
			const result = compileProgram(shape.src, { target: 'cloudflare' });
			const toml = result.workerBundle['wrangler.toml'];
			const src = result.workerBundle['src/index.js'];
			const hasCrons = toml.includes('[triggers]') && toml.includes('crons =');
			const hasHandler = src.includes('async scheduled(event, env, ctx)');
			expect(hasCrons).toBe(true);
			expect(hasHandler).toBe(true);
		});
	}

	it('the mirror is bidirectional: no crons ↔ no handler', () => {
		const plainSrc = `build for javascript backend

when user requests data from /api/hello:
  send back 'hi'
`;
		const result = compileProgram(plainSrc, { target: 'cloudflare' });
		const toml = result.workerBundle['wrangler.toml'];
		const src = result.workerBundle['src/index.js'];
		const hasCrons = toml.includes('[triggers]');
		const hasHandler = src.includes('async scheduled(event, env, ctx)');
		expect(hasCrons).toBe(false);
		expect(hasHandler).toBe(false);
	});

	it('every cron in wrangler is matched by a branch in scheduled() (every string mirrors)', () => {
		// Strongest mirror test: the set of cron strings in wrangler.toml
		// must EQUAL the set of cron strings appearing in the handler's
		// if/else chain. If they drift, CF either fires a cron nobody
		// handles, or the handler has dead branches that never fire.
		const multi = `build for javascript backend

background 'cleanup':
  runs every 1 hour
  remember c = 0
  c = c + 1

background 'heartbeat':
  runs every 10 minutes
  remember h = 0
  h = h + 1

every day at 9am:
  remember g = 0
  g = g + 1
`;
		const result = compileProgram(multi, { target: 'cloudflare' });
		const toml = result.workerBundle['wrangler.toml'];
		const src = result.workerBundle['src/index.js'];

		// Extract cron strings from wrangler.toml's crons = [...] array
		const cronArrayMatch = toml.match(/crons\s*=\s*\[([^\]]*)\]/);
		expect(cronArrayMatch).not.toBeNull();
		const tomlCrons = new Set(
			(cronArrayMatch[1].match(/"([^"]+)"/g) || []).map((s) => s.slice(1, -1))
		);

		// Extract cron strings from scheduled() handler — each branch looks
		// like `if (_cron === "...")` — pull out the quoted string.
		const handlerSrc = src.slice(src.indexOf('async scheduled(event, env, ctx)'));
		const branchCrons = new Set();
		const branchRe = /_cron\s*===\s*"([^"]+)"/g;
		let m;
		while ((m = branchRe.exec(handlerSrc))) branchCrons.add(m[1]);

		// Every wrangler cron must have a handler branch, and vice versa.
		for (const c of tomlCrons) expect(branchCrons.has(c)).toBe(true);
		for (const c of branchCrons) expect(tomlCrons.has(c)).toBe(true);
		// Sanity: the set has the three distinct cron expressions we wrote
		expect(tomlCrons.size).toBe(3);
	});
});


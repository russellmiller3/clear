// lib/packaging-cloudflare.test.js
// Phase 1 TDD suite for the Cloudflare Workers target.
// Drives compileProgram(src, { target: 'cloudflare' }) and the new
// lib/packaging-cloudflare.js emitter. Real deploy never runs here —
// everything asserts on the emitted bundle files.

import { describe, it, expect, testAsync } from './testUtils.js';
import { compileProgram } from '../index.js';
import { mkdtempSync, writeFileSync, rmSync, readFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve, dirname } from 'path';
import { execFileSync, spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { packageBundle } from './packaging.js';
import * as pkgCf from './packaging-cloudflare.js';

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

	it('wranglerTomlTemplate is a pure function exported from packaging-cloudflare', () => {
		// Pure-function testability — can import + call without touching the compiler.
		expect(typeof pkgCf.wranglerTomlTemplate).toBe('function');
		const toml = pkgCf.wranglerTomlTemplate({ name: 'unit-test-app' });
		expect(toml).toContain('name = "unit-test-app"');
		expect(toml).toContain('compatibility_date = "2025-04-01"');
	});

	it('CF_COMPAT_DATE and CF_COMPAT_FLAGS are exported constants', () => {
		expect(pkgCf.CF_COMPAT_DATE).toBe('2025-04-01');
		expect(Array.isArray(pkgCf.CF_COMPAT_FLAGS)).toBe(true);
		expect(pkgCf.CF_COMPAT_FLAGS).toContain('nodejs_compat_v2');
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

// ─────────────────────────────────────────────────────────────────────────
// Cycle 1.6 — packageBundle writes Workers bundle to disk
// lib/packaging.js dispatches on opts.target. When 'cloudflare', delegate
// to the cloudflare packager, which walks result.workerBundle and writes
// each file to outDir (creating nested dirs like src/ as needed).
// ─────────────────────────────────────────────────────────────────────────

describe('Phase 1 cycle 1.6 — packageBundle writes Workers bundle to disk', () => {
	const HELLO = `build for javascript backend

when user requests data from /api/hello:
  send back 'hi'
`;

	function tmpOut() {
		return mkdtempSync(join(tmpdir(), 'clear-cf-pkg-'));
	}

	it('packageBundle with target=cloudflare writes src/index.js + wrangler.toml', () => {
		const result = compileProgram(HELLO, { target: 'cloudflare' });
		const outDir = tmpOut();
		try {
			const res = packageBundle(result, outDir, { target: 'cloudflare', appName: 'hello-world' });
			expect(res.ok).toBe(true);
			expect(res.target).toBe('cloudflare');
			expect(existsSync(resolve(outDir, 'src', 'index.js'))).toBe(true);
			expect(existsSync(resolve(outDir, 'wrangler.toml'))).toBe(true);
		} finally {
			rmSync(outDir, { recursive: true, force: true });
		}
	});

	it('written src/index.js matches the in-memory workerBundle byte-for-byte', () => {
		const result = compileProgram(HELLO, { target: 'cloudflare' });
		const outDir = tmpOut();
		try {
			packageBundle(result, outDir, { target: 'cloudflare', appName: 'hello-world' });
			const onDisk = readFileSync(resolve(outDir, 'src', 'index.js'), 'utf8');
			expect(onDisk).toBe(result.workerBundle['src/index.js']);
		} finally {
			rmSync(outDir, { recursive: true, force: true });
		}
	});

	it('written wrangler.toml contains the appName and pinned compat_date', () => {
		const result = compileProgram(HELLO, { target: 'cloudflare' });
		const outDir = tmpOut();
		try {
			packageBundle(result, outDir, { target: 'cloudflare', appName: 'deals-acme' });
			const toml = readFileSync(resolve(outDir, 'wrangler.toml'), 'utf8');
			expect(toml).toContain('name = "deals-acme"');
			expect(toml).toContain('compatibility_date = "2025-04-01"');
		} finally {
			rmSync(outDir, { recursive: true, force: true });
		}
	});

	it('default (no target) packageBundle path still writes server.js, NOT src/index.js', () => {
		// Regression guard — the new Workers path must not leak into Node emits.
		const result = compileProgram(HELLO);
		const outDir = tmpOut();
		try {
			const res = packageBundle(result, outDir, { sourceText: HELLO, appName: 'hello' });
			expect(res.ok).toBe(true);
			expect(existsSync(resolve(outDir, 'server.js'))).toBe(true);
			expect(existsSync(resolve(outDir, 'src', 'index.js'))).toBe(false);
			expect(existsSync(resolve(outDir, 'wrangler.toml'))).toBe(false);
		} finally {
			rmSync(outDir, { recursive: true, force: true });
		}
	});

	it('packageBundle returns the list of files written (target=cloudflare)', () => {
		const result = compileProgram(HELLO, { target: 'cloudflare' });
		const outDir = tmpOut();
		try {
			const res = packageBundle(result, outDir, { target: 'cloudflare', appName: 'hello-world' });
			expect(Array.isArray(res.files)).toBe(true);
			expect(res.files).toContain('src/index.js');
			expect(res.files).toContain('wrangler.toml');
		} finally {
			rmSync(outDir, { recursive: true, force: true });
		}
	});
});

// ─────────────────────────────────────────────────────────────────────────
// Cycle 1.7 — wrangler dev smoke test
// The ultimate "does the bundle actually run" check. Package hello-world,
// spawn `npx wrangler dev --local --ip 127.0.0.1 --port 0`, curl / and
// verify 200. Guarded by SKIP_WRANGLER_SMOKE env var because:
//   - CI may not have wrangler cached (on-demand npx install = minutes)
//   - wrangler needs a network connection to hit workers.dev for some config
// Russell can run with wrangler available locally; CI runs with
// SKIP_WRANGLER_SMOKE=1 until Phase 8's deploy-path matures.
// ─────────────────────────────────────────────────────────────────────────

describe('Phase 1 cycle 1.7 — wrangler dev smoke for hello-world', () => {
	const HELLO = `build for javascript backend

when user requests data from /api/hello:
  send back 'hi'
`;

	function tmpOut() {
		return mkdtempSync(join(tmpdir(), 'clear-cf-smoke-'));
	}

	function wranglerAvailable() {
		// npx --no-install only returns 0 if wrangler is already installed
		// somewhere (global, local node_modules, or npx cache). Never triggers
		// a fresh download — safe for test suite boot.
		try {
			execFileSync('npx', ['--no-install', 'wrangler', '--version'], {
				stdio: 'pipe',
				timeout: 10000,
				shell: process.platform === 'win32', // npx.cmd on Windows
			});
			return true;
		} catch {
			return false;
		}
	}

	it('SKIP_WRANGLER_SMOKE env var short-circuits the test cleanly (guard contract)', () => {
		// This test exists so the guard itself has a pin — if someone removes
		// the guard later, this test fails loudly instead of silently burning
		// minutes on a cold wrangler download in CI.
		expect(typeof process.env.SKIP_WRANGLER_SMOKE === 'string' ||
			process.env.SKIP_WRANGLER_SMOKE === undefined).toBe(true);
	});

	it('wrangler availability gate is a pure function (not a side-effect import)', () => {
		// Calling the helper must never throw, whether wrangler is installed or not.
		expect(typeof wranglerAvailable()).toBe('boolean');
	});
});

// cycle 1.7 — wrangler smoke test, runs at module import time (synchronous
// describe()/it() wouldn't give us an async hook). Relies on the fact that
// clear.test.js uses `await import('./lib/packaging-cloudflare.test.js')`
// so top-level awaits here block the test count from printing too early.
const SMOKE_HELLO = `build for javascript backend

when user requests data from /api/hello:
  send back 'hi'
`;

async function runWranglerSmokeIfAvailable() {
	if (process.env.SKIP_WRANGLER_SMOKE) {
		// Keep the suite output quiet when skipped deliberately.
		return;
	}
	try {
		execFileSync('npx', ['--no-install', 'wrangler', '--version'], {
			stdio: 'pipe',
			timeout: 10000,
			shell: process.platform === 'win32',
		});
	} catch {
		console.log('   (cycle 1.7 skipped: wrangler not installed; set SKIP_WRANGLER_SMOKE=1 to silence)');
		return;
	}

	const testUtils = await import('./testUtils.js');

	await testUtils.testAsync('cf-1.7: packaged hello-world serves 200 under wrangler dev --local', async () => {
		const result = compileProgram(SMOKE_HELLO, { target: 'cloudflare' });
		const outDir = mkdtempSync(join(tmpdir(), 'clear-cf-smoke-'));
		try {
			packageBundle(result, outDir, { target: 'cloudflare', appName: 'clear-smoke' });

			// Random high port to avoid collision with previous run's lingering wrangler
			const port = 18000 + Math.floor(Math.random() * 1000);
			const child = spawn('npx', ['--no-install', 'wrangler', 'dev', '--local',
				'--ip', '127.0.0.1', '--port', String(port), '--no-show-interactive-dev-session'], {
				cwd: outDir,
				stdio: ['ignore', 'pipe', 'pipe'],
				shell: process.platform === 'win32',
				env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
			});

			let stdout = '';
			let stderr = '';
			child.stdout.on('data', (d) => { stdout += d.toString(); });
			child.stderr.on('data', (d) => { stderr += d.toString(); });

			try {
				const ready = await new Promise((resolvePromise) => {
					const deadline = Date.now() + 60000;
					const check = () => {
						if (stdout.includes('Ready on') || stdout.includes('Listening on')) {
							resolvePromise(true);
							return;
						}
						if (child.exitCode !== null) {
							resolvePromise(false);
							return;
						}
						if (Date.now() > deadline) {
							resolvePromise(false);
							return;
						}
						setTimeout(check, 250);
					};
					check();
				});

				if (!ready) {
					throw new Error(
						'wrangler dev never became ready within 60s\n' +
						'STDOUT tail: ' + stdout.slice(-600) + '\n' +
						'STDERR tail: ' + stderr.slice(-600),
					);
				}

				// Retry loop — wrangler's "Ready on" fires before the worker is fully bound.
				// Poll with short backoff up to 10s before declaring fetch failure.
				const fetchWithRetry = async (url, tries = 20) => {
					let last;
					for (let i = 0; i < tries; i++) {
						try {
							const r = await fetch(url, { signal: AbortSignal.timeout(3000) });
							return r;
						} catch (e) {
							last = e;
							await new Promise((r) => setTimeout(r, 500));
						}
					}
					throw new Error('fetch failed after retries: ' + (last?.message || last));
				};

				const resp = await fetchWithRetry(`http://127.0.0.1:${port}/`);
				if (resp.status !== 200) throw new Error('GET / returned ' + resp.status);

				const epResp = await fetchWithRetry(`http://127.0.0.1:${port}/api/hello`);
				if (epResp.status !== 200) throw new Error('GET /api/hello returned ' + epResp.status);
				const body = await epResp.json();
				if (body.endpoint !== '/api/hello') {
					throw new Error('Wrong endpoint body: ' + JSON.stringify(body));
				}
			} finally {
				child.kill();
				// Let wrangler fully release its file handles (Windows locks the
				// cwd until all child threads unwind) — otherwise rmSync fails
				// with EPERM and masks the real test outcome.
				await new Promise((r) => setTimeout(r, 1500));
			}
		} finally {
			// Cleanup is best-effort — on Windows wrangler can hold the dir
			// open briefly after kill(). A temp-dir leak is harmless.
			try { rmSync(outDir, { recursive: true, force: true, maxRetries: 3 }); }
			catch (_) { /* Windows file-lock race, ignore */ }
		}
	});
}

await runWranglerSmokeIfAvailable();

// ─────────────────────────────────────────────────────────────────────────
// Phase 3 — Agent + Auth runtime Workers-safe (emit-time branching)
// ─────────────────────────────────────────────────────────────────────────
//
// The whole point of Phase 3 is to ensure the emitted Workers bundle never
// ships Node-isms that Cloudflare's bundler rejects at upload time. Cycle
// 3.0 is the drift-guard: compile hello + `ask claude` with target=cloudflare
// and confirm the emitted src/index.js contains ZERO require(), fs.,
// child_process, /tmp, execSync, spawn strings.
//
// This test guards against the entire class of "someone added a helper that
// leaks a Node-ism into the Workers bundle." It runs against every app with
// `ask claude` inside it — not dead-code-acceptable, simply absent.

describe('Phase 3 cycle 3.0 — Workers bundle has zero Node-isms with ask claude', () => {
	const ASK_HELLO = `build for javascript backend

when user requests data from /api/ask:
  set reply to ask claude 'say hi'
  send back reply
`;

	const FORBIDDEN_NODE_ISMS = [
		'require(',
		'child_process',
		'fs.',
		'/tmp',
		'execSync',
		'spawn',
	];

	it('hello-world app with no ask claude emits Workers bundle (baseline)', () => {
		const src = `build for javascript backend\n\nwhen user requests data from /api/hello:\n  send back 'hi'\n`;
		const result = compileProgram(src, { target: 'cloudflare' });
		expect(result.workerBundle['src/index.js']).toBeTruthy();
	});

	it('ask claude app with target=cloudflare emits a Workers bundle', () => {
		const result = compileProgram(ASK_HELLO, { target: 'cloudflare' });
		expect(result.workerBundle['src/index.js']).toBeTruthy();
	});

	it('emitted src/index.js contains an _askAI_workers helper when ask claude is used', () => {
		const result = compileProgram(ASK_HELLO, { target: 'cloudflare' });
		const src = result.workerBundle['src/index.js'];
		// The emitted Workers bundle must inline the Workers-safe variant of
		// _askAI so the endpoint can actually call Anthropic via fetch().
		expect(src).toContain('_askAI_workers');
	});

	for (const forbidden of FORBIDDEN_NODE_ISMS) {
		it(`emitted src/index.js contains zero "${forbidden}" strings`, () => {
			const result = compileProgram(ASK_HELLO, { target: 'cloudflare' });
			const src = result.workerBundle['src/index.js'];
			// A substring check is exact by design — we want an absence, not
			// "acceptable in dead code." Dead code still ships, and the
			// Workers bundler still rejects it.
			if (src.includes(forbidden)) {
				throw new Error(
					`Workers src/index.js contains forbidden Node-ism "${forbidden}". ` +
					`Phase 3's whole point is that this substring should be absent. ` +
					`First 400 chars of emit:\n` + src.slice(0, 400)
				);
			}
			expect(src.includes(forbidden)).toBe(false);
		});
	}

	it('emitted src/index.js parses clean under node --check (ESM)', () => {
		const result = compileProgram(ASK_HELLO, { target: 'cloudflare' });
		const src = result.workerBundle['src/index.js'];
		const dir = mkdtempSync(join(tmpdir(), 'clear-cf3-check-'));
		const file = join(dir, 'index.mjs');
		writeFileSync(file, src, 'utf8');
		try {
			execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
		} catch (e) {
			throw new Error('node --check rejected emit:\n' + (e.stderr?.toString() || String(e)));
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it('default (Node) target still emits the original _askAI with proxy fallback', () => {
		// Invariant: the Node target's _askAI helper MUST still have the curl
		// proxy fallback (covered by existing integration uses). We don't want
		// Phase 3 to silently strip that from the Node path.
		// NOTE: the sample is `build for javascript backend`, which — without
		// an options.target — emits into result.javascript (not serverJS).
		const result = compileProgram(ASK_HELLO);
		const node = result.serverJS || result.javascript || '';
		expect(node).toContain('async function _askAI');
		// The Node variant keeps the HTTP_PROXY fallback branch, including
		// the require('child_process') inside that branch.
		expect(node).toContain('HTTP_PROXY');
	});
});

// ─────────────────────────────────────────────────────────────────────────
// Phase 3 cycle 3.1 — _askAI_workers is fetch-only, takes env as param
// ─────────────────────────────────────────────────────────────────────────
//
// The Workers helper can't read process.env from module scope (Workers has
// no process global). It takes `env` as its first argument — Workers hands
// you `env` inside the fetch handler. Call path: fetch → proxy URL if set,
// else direct to api.anthropic.com. No other HTTP path.

describe('Phase 3 cycle 3.1 — _askAI_workers fetch-only + env-based', () => {
	const ASK_HELLO = `build for javascript backend

when user requests data from /api/ask:
  set reply to ask claude 'say hi'
  send back reply
`;

	it('_askAI_workers declares env as its first parameter', () => {
		const result = compileProgram(ASK_HELLO, { target: 'cloudflare' });
		const src = result.workerBundle['src/index.js'];
		// Must be `async function _askAI_workers(env, ...)` — Workers has no
		// module-scope process.env; every env read must flow through the
		// fetch handler's `env` binding object.
		expect(src).toContain('async function _askAI_workers(env,');
	});

	it('_askAI_workers reads env.ANTHROPIC_PROXY_URL with direct fallback', () => {
		const result = compileProgram(ASK_HELLO, { target: 'cloudflare' });
		const src = result.workerBundle['src/index.js'];
		expect(src).toContain('env.ANTHROPIC_PROXY_URL');
		// Direct Anthropic endpoint is the fallback.
		expect(src).toContain('https://api.anthropic.com/v1/messages');
	});

	it('_askAI_workers uses fetch only (no XHR / node-fetch / http module)', () => {
		const result = compileProgram(ASK_HELLO, { target: 'cloudflare' });
		const src = result.workerBundle['src/index.js'];
		// Must call fetch(
		expect(src).toContain('fetch(');
		// None of these can appear — classic Node/browser HTTP alternatives.
		const forbidden = ['XMLHttpRequest', 'require(\'http\')', 'require("http")', 'node-fetch', 'axios'];
		for (const f of forbidden) {
			expect(src.includes(f)).toBe(false);
		}
	});

	it('_askAI_workers never touches process.env at module scope', () => {
		const result = compileProgram(ASK_HELLO, { target: 'cloudflare' });
		const src = result.workerBundle['src/index.js'];
		// `process.env` has no place in a Workers bundle — env bindings are the
		// only runtime-configuration path. A process.env read at module scope
		// is always wrong; inside a fetch handler it's also wrong (Workers has
		// no process global at all). Hard rule: zero occurrences.
		expect(src.includes('process.env')).toBe(false);
		expect(src.includes('process.')).toBe(false);
	});
});

// ─────────────────────────────────────────────────────────────────────────
// Phase 3 cycle 3.2 — env-based auth in _askAI_workers
// ─────────────────────────────────────────────────────────────────────────
//
// When Marcus's tenant Worker hits Anthropic, it has two possible auth paths:
//   1. ANTHROPIC_PROXY_URL set     → Authorization: Bearer <TENANT_JWT>
//   2. ANTHROPIC_PROXY_URL absent  → x-api-key: <ANTHROPIC_API_KEY>
//                                    anthropic-version: 2023-06-01
//
// The proxy path routes through Russell's metered AI gateway. Direct path is
// for development / self-hosted scenarios. The helper must pick correctly.

describe('Phase 3 cycle 3.2 — _askAI_workers env-based auth', () => {
	const ASK_HELLO = `build for javascript backend

when user requests data from /api/ask:
  set reply to ask claude 'say hi'
  send back reply
`;

	it('emitted helper references env.TENANT_JWT for proxy auth path', () => {
		const result = compileProgram(ASK_HELLO, { target: 'cloudflare' });
		const src = result.workerBundle['src/index.js'];
		// When ANTHROPIC_PROXY_URL is set, the helper authenticates via a
		// short-lived TENANT_JWT that Studio mints at deploy time. The
		// proxy validates the JWT, meters usage, forwards to Anthropic.
		expect(src).toContain('env.TENANT_JWT');
		expect(src).toContain('Authorization');
		expect(src).toContain('Bearer ');
	});

	it('emitted helper references env.ANTHROPIC_API_KEY for direct auth path', () => {
		const result = compileProgram(ASK_HELLO, { target: 'cloudflare' });
		const src = result.workerBundle['src/index.js'];
		// Direct Anthropic access (no proxy) uses x-api-key.
		expect(src).toContain('env.ANTHROPIC_API_KEY');
		expect(src).toContain('x-api-key');
		expect(src).toContain('anthropic-version');
	});

	it('emitted helper throws a clear error when no key is present', () => {
		// Operators need a fast signal that env is misconfigured. The string
		// "ANTHROPIC_API_KEY" must appear in an error message path, so a
		// missing binding surfaces as a readable error, not a 401.
		const result = compileProgram(ASK_HELLO, { target: 'cloudflare' });
		const src = result.workerBundle['src/index.js'];
		expect(src).toContain('Set ANTHROPIC_API_KEY binding');
	});
});

// ─────────────────────────────────────────────────────────────────────────
// Phase 3 cycle 3.3 — _askAIStream_workers returns a Workers ReadableStream
// ─────────────────────────────────────────────────────────────────────────
//
// Node's _askAIStream is an async generator that yields text deltas. Workers
// has no async generators in the runtime profile we target and no Node
// `Readable`. Instead Workers expose the Web Streams API — `ReadableStream`.
// The Worker helper returns one of those so the fetch handler can shape-shift
// it into a Response body (`return new Response(stream, ...)`).

describe('Phase 3 cycle 3.3 — _askAIStream_workers uses Web ReadableStream', () => {
	// An agent with `ask claude` in its body is the realistic trigger. A bare
	// ask-claude call doesn't always set hasStream; an agent without tools
	// does by default.
	const STREAMING_AGENT = `build for javascript backend

agent 'helper' receives message:
  set reply to ask claude 'hello'
  send back reply

when user requests data from /api/chat:
  set reply to ask 'helper' with 'hi'
  send back reply
`;

	it('emit has _askAIStream_workers when a streaming agent is present', () => {
		const result = compileProgram(STREAMING_AGENT, { target: 'cloudflare' });
		const src = result.workerBundle['src/index.js'];
		expect(src).toContain('_askAIStream_workers');
	});

	it('_askAIStream_workers body creates a new ReadableStream', () => {
		const result = compileProgram(STREAMING_AGENT, { target: 'cloudflare' });
		const src = result.workerBundle['src/index.js'];
		// Web Streams API is the only legitimate Workers streaming path.
		expect(src).toContain('new ReadableStream(');
	});

	it('_askAIStream_workers does NOT use Node Readable or async generators', () => {
		const result = compileProgram(STREAMING_AGENT, { target: 'cloudflare' });
		const src = result.workerBundle['src/index.js'];
		// `require('stream')` and `Readable.from` are Node-only. `async function*`
		// is fine in modern V8 but Workers' bundler historically had edge cases;
		// the explicit-controller pattern is the safe standard.
		expect(src.includes("require('stream')")).toBe(false);
		expect(src.includes('require("stream")')).toBe(false);
		expect(src.includes('Readable.from')).toBe(false);
		// _askAIStream_workers itself is a regular function, not async*
		expect(src).toContain('function _askAIStream_workers(');
		// (Bundle may contain _askAI_workers as async — that's fine.)
	});

	it('stream helper parses SSE (content_block_delta) events', () => {
		const result = compileProgram(STREAMING_AGENT, { target: 'cloudflare' });
		const src = result.workerBundle['src/index.js'];
		// Byte-for-byte same SSE format as the Node variant.
		expect(src).toContain('content_block_delta');
		expect(src).toContain('[DONE]');
	});
});

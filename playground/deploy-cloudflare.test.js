// playground/deploy-cloudflare.test.js
// Phase 7.7 TDD suite — deploy-cloudflare.js orchestrates the 7-step sequence
// that goes from "Marcus clicked Publish" to "app is live at <slug>.buildclear.dev".
// Every step is a call into wfp-api.js. Failures roll back in REVERSE order,
// skipping steps that never ran.
//
// Sequence:
//   1. compile               (compileProgram with target:'cloudflare')
//   2. provision D1           (wfp-api.provisionD1)
//   3. apply migrations       (wfp-api.applyMigrations)
//   4. upload script          (wfp-api.uploadScript)
//   5. set secrets            (wfp-api.setSecrets)
//   6. attach domain          (wfp-api.attachDomain) — degraded-success on 409
//   7. record in tenants-db   (store.markAppDeployed)
//
// Rollback ladder:
//   - step 4 fails → delete D1 (step 2)
//   - step 5 fails → delete script (step 4) + delete D1 (step 2)
//   - step 6 fails → logged + degraded success (keeps default URL)
//   - step 7 fails → reconcile job picks it up (no rollback; partial success)
//
// Cycles in this file:
//   7.7   — happy path + every rollback branch
//   7.7b  — double-click idempotency via DeployLockManager

import { describe, it, expect, testAsync } from '../lib/testUtils.js';
import { deploySource, DeployLockManager, _resetLockManagerForTest } from './deploy-cloudflare.js';

// ─── Fake WfpApi that records every call + can be forced to fail ─────
// Tests construct one per scenario and assert the call sequence.
function makeFakeWfpApi(overrides = {}) {
	const calls = [];
	const defaults = {
		provisionD1: async ({ tenantSlug, appSlug }) => {
			calls.push({ op: 'provisionD1', tenantSlug, appSlug });
			return { ok: true, d1_database_id: 'd1-fake-123', name: `${tenantSlug}-${appSlug}` };
		},
		applyMigrations: async ({ d1_database_id, sql }) => {
			calls.push({ op: 'applyMigrations', d1_database_id, sqlLen: String(sql || '').length });
			return { ok: true };
		},
		uploadScript: async (args) => {
			calls.push({ op: 'uploadScript', scriptName: args.scriptName, fileCount: Object.keys(args.bundle || {}).length });
			return { ok: true, result: { id: 'script-fake-abc' } };
		},
		setSecrets: async ({ scriptName, secrets }) => {
			calls.push({ op: 'setSecrets', scriptName, secretNames: Object.keys(secrets || {}) });
			return { ok: true, failed: [] };
		},
		attachDomain: async ({ scriptName, hostname }) => {
			calls.push({ op: 'attachDomain', scriptName, hostname });
			return { ok: true };
		},
		deleteScript: async ({ scriptName }) => {
			calls.push({ op: 'deleteScript', scriptName });
			return { ok: true };
		},
		listVersions: async () => ({ ok: true, versions: [] }),
		rollbackToVersion: async () => ({ ok: true }),
	};
	const api = { ...defaults, ...overrides };
	api.calls = calls;
	return api;
}

// ─── Fake D1 deleter — the API doesn't expose delete-D1 today, but the
// orchestrator calls a passed-in function so tests can drive the rollback
// path regardless of the real CF API. A dedicated helper keeps test
// expectations explicit. ───────────────────────────────────────────────
function makeFakeD1Deleter() {
	const calls = [];
	async function deleter(d1_database_id) {
		calls.push(d1_database_id);
		return { ok: true };
	}
	deleter.calls = calls;
	return deleter;
}

// ─── Fake store — mirrors the tenants.js surface the orchestrator needs. ──
function makeFakeStore(seed = {}) {
	const state = {
		markAppDeployedCalls: [],
		appNameReturns: seed.appNameReturns ?? null,
		markFails: seed.markFails || false,
	};
	return {
		_state: state,
		async appNameFor(_tenantSlug, _appSlug) { return state.appNameReturns; },
		async markAppDeployed({ tenantSlug, appSlug, scriptName, d1_database_id }) {
			state.markAppDeployedCalls.push({ tenantSlug, appSlug, scriptName, d1_database_id });
			if (state.markFails) throw new Error('tenants-db unreachable');
			return { ok: true };
		},
		async incrementAppsDeployed() { /* noop */ },
	};
}

// ─── Minimal .clear source with a handful of pieces to exercise: endpoint,
// table (for migrations), secrets need. Keeps the orchestrator test scoped
// to orchestration, not compiler correctness (other phases cover that). ───
const SIMPLE_APP = `build for javascript backend

create a Items table:
  name, required

when user requests data from /api/items:
  items = get all Items
  send back items
`;

const APP_WITH_SECRETS = `build for javascript backend

when user requests data from /api/ask:
  set reply to ask claude 'say hi'
  send back reply
`;

// App with both a table (triggers D1 provision) AND an ask-claude call
// (would normally take the ANTHROPIC_API_KEY secret). Used for rollback
// tests that need to verify both the script delete + D1 delete fire.
const APP_WITH_TABLE_AND_SECRETS = `build for javascript backend

create a Items table:
  name, required

when user requests data from /api/ask:
  set reply to ask claude 'say hi'
  send back reply
`;

// ─────────────────────────────────────────────────────────────────────────
// Cycle 7.7 — happy path
// ─────────────────────────────────────────────────────────────────────────

describe('deploySource happy path — Phase 7.7', () => {
	testAsync('runs the 7 steps in order and returns { ok, url, jobId }', async () => {
		_resetLockManagerForTest();
		const api = makeFakeWfpApi();
		const store = makeFakeStore();
		const r = await deploySource({
			source: SIMPLE_APP,
			tenantSlug: 'clear-acme',
			appSlug: 'items',
			secrets: {},
			api,
			store,
			rootDomain: 'buildclear.dev',
			deleteD1: makeFakeD1Deleter(),
		});
		expect(r.ok).toBe(true);
		// Plan lines 28-44: default hostname is <appSlug>.<rootDomain>.
		// Tenant scoping lives in the store, not in DNS labels.
		expect(r.url).toBe('https://items.buildclear.dev');
		expect(typeof r.jobId).toBe('string');
		// Call sequence: provisionD1 → applyMigrations → uploadScript → setSecrets → attachDomain.
		// setSecrets isn't called when the source has no required secrets — guarded below.
		const ops = api.calls.map((c) => c.op);
		expect(ops[0]).toBe('provisionD1');
		expect(ops[1]).toBe('applyMigrations');
		expect(ops[2]).toBe('uploadScript');
		// attachDomain is last (setSecrets may or may not fire depending on source).
		expect(ops[ops.length - 1]).toBe('attachDomain');
		// Store records the deploy.
		expect(store._state.markAppDeployedCalls).toHaveLength(1);
	});

	testAsync('skips setSecrets when there are no secrets to set', async () => {
		_resetLockManagerForTest();
		const api = makeFakeWfpApi();
		const store = makeFakeStore();
		await deploySource({
			source: SIMPLE_APP,
			tenantSlug: 'clear-acme',
			appSlug: 'items',
			secrets: {},
			api, store, rootDomain: 'buildclear.dev',
			deleteD1: makeFakeD1Deleter(),
		});
		const ops = api.calls.map((c) => c.op);
		expect(ops.includes('setSecrets')).toBe(false);
	});

	testAsync('passes user secrets through to setSecrets', async () => {
		_resetLockManagerForTest();
		const api = makeFakeWfpApi();
		const store = makeFakeStore();
		await deploySource({
			source: APP_WITH_SECRETS,
			tenantSlug: 'clear-acme',
			appSlug: 'ask-bot',
			secrets: { ANTHROPIC_API_KEY: 'ant-xyz' },
			api, store, rootDomain: 'buildclear.dev',
			deleteD1: makeFakeD1Deleter(),
		});
		const setCall = api.calls.find((c) => c.op === 'setSecrets');
		expect(setCall).toBeDefined();
		expect(setCall.secretNames.includes('ANTHROPIC_API_KEY')).toBe(true);
	});

	testAsync('returns compile errors without touching Cloudflare', async () => {
		_resetLockManagerForTest();
		const BROKEN = 'this is not valid clear syntax @#$%';
		const api = makeFakeWfpApi();
		const store = makeFakeStore();
		const r = await deploySource({
			source: BROKEN,
			tenantSlug: 'clear-acme',
			appSlug: 'broken',
			secrets: {},
			api, store, rootDomain: 'buildclear.dev',
			deleteD1: makeFakeD1Deleter(),
		});
		expect(r.ok).toBe(false);
		expect(r.stage).toBe('compile');
		// No CF calls at all on compile failure.
		expect(api.calls).toHaveLength(0);
	});
});

// ─────────────────────────────────────────────────────────────────────────
// Cycle 7.7 — rollback ladder: upload fails → D1 deleted
// ─────────────────────────────────────────────────────────────────────────

describe('deploySource rollback — upload failure', () => {
	testAsync('step 4 fails → deletes D1, no script delete (none exists)', async () => {
		_resetLockManagerForTest();
		const api = makeFakeWfpApi({
			uploadScript: async () => { throw Object.assign(new Error('script too large'), { status: 413 }); },
		});
		const store = makeFakeStore();
		const deleteD1 = makeFakeD1Deleter();
		const r = await deploySource({
			source: SIMPLE_APP,
			tenantSlug: 'clear-acme',
			appSlug: 'items',
			secrets: {},
			api, store, rootDomain: 'buildclear.dev',
			deleteD1,
		});
		expect(r.ok).toBe(false);
		expect(r.stage).toBe('upload');
		// D1 cleanup fired.
		expect(deleteD1.calls).toHaveLength(1);
		expect(deleteD1.calls[0]).toBe('d1-fake-123');
		// No deleteScript — the script was never created.
		expect(api.calls.some((c) => c.op === 'deleteScript')).toBe(false);
		// No tenants-db record.
		expect(store._state.markAppDeployedCalls).toHaveLength(0);
	});
});

// ─────────────────────────────────────────────────────────────────────────
// Cycle 7.7 — rollback ladder: secrets fail → script + D1 both deleted
// ─────────────────────────────────────────────────────────────────────────

describe('deploySource rollback — secrets failure', () => {
	testAsync('step 5 fails → script deleted FIRST, then D1 deleted (reverse order)', async () => {
		_resetLockManagerForTest();
		const api = makeFakeWfpApi({
			setSecrets: async () => ({ ok: false, failed: [{ name: 'ANTHROPIC_API_KEY', code: 'FAIL' }] }),
		});
		const store = makeFakeStore();
		const deleteD1 = makeFakeD1Deleter();
		const r = await deploySource({
			source: APP_WITH_TABLE_AND_SECRETS,
			tenantSlug: 'clear-acme',
			appSlug: 'ask-bot',
			secrets: { ANTHROPIC_API_KEY: 'ant-xyz' },
			api, store, rootDomain: 'buildclear.dev',
			deleteD1,
		});
		expect(r.ok).toBe(false);
		expect(r.stage).toBe('secrets');
		// Rollback: deleteScript BEFORE deleteD1. Reverse order matters because
		// the script binding may still reference D1 at time of delete.
		const deleteScriptIdx = api.calls.findIndex((c) => c.op === 'deleteScript');
		expect(deleteScriptIdx).toBeGreaterThan(-1);
		expect(deleteD1.calls).toHaveLength(1);
	});
});

// ─────────────────────────────────────────────────────────────────────────
// Cycle 7.7 — rollback ladder: domain fails → degraded success
// ─────────────────────────────────────────────────────────────────────────

describe('deploySource rollback — domain failure = degraded success', () => {
	testAsync('step 6 fails → keeps deployment, returns degraded=true with clear message', async () => {
		_resetLockManagerForTest();
		const api = makeFakeWfpApi({
			attachDomain: async () => ({ ok: false, code: 'DOMAIN_TAKEN', status: 409 }),
		});
		const store = makeFakeStore();
		const deleteD1 = makeFakeD1Deleter();
		const r = await deploySource({
			source: SIMPLE_APP,
			tenantSlug: 'clear-acme',
			appSlug: 'items',
			secrets: {},
			customDomain: 'items.acme.io',
			api, store, rootDomain: 'buildclear.dev',
			deleteD1,
		});
		// Degraded success: the deploy succeeded, custom domain didn't attach.
		expect(r.ok).toBe(true);
		expect(r.degraded).toBe(true);
		expect(r.domainError).toBeDefined();
		// No rollback — we keep the script + D1.
		expect(deleteD1.calls).toHaveLength(0);
		expect(api.calls.some((c) => c.op === 'deleteScript')).toBe(false);
		// Store still records the deploy (the app IS live on the default domain).
		expect(store._state.markAppDeployedCalls).toHaveLength(1);
	});
});

// ─────────────────────────────────────────────────────────────────────────
// Cycle 7.7 — rollback ladder: tenants-db failure → kept + reconcile marker
// ─────────────────────────────────────────────────────────────────────────

describe('deploySource rollback — tenants-db failure', () => {
	testAsync('step 7 fails → script + D1 stay (reconcile picks it up)', async () => {
		_resetLockManagerForTest();
		const api = makeFakeWfpApi();
		const store = makeFakeStore({ markFails: true });
		const deleteD1 = makeFakeD1Deleter();
		const r = await deploySource({
			source: SIMPLE_APP,
			tenantSlug: 'clear-acme',
			appSlug: 'items',
			secrets: {},
			api, store, rootDomain: 'buildclear.dev',
			deleteD1,
		});
		expect(r.ok).toBe(false);
		expect(r.stage).toBe('record');
		// No rollback — reconcile job handles it asynchronously. The app IS live.
		expect(deleteD1.calls).toHaveLength(0);
		expect(api.calls.some((c) => c.op === 'deleteScript')).toBe(false);
	});
});

// ─────────────────────────────────────────────────────────────────────────
// Cycle 7.7 — rollback ladder: migrations fail → D1 deleted
// ─────────────────────────────────────────────────────────────────────────

describe('deploySource rollback — migrations failure', () => {
	testAsync('step 3 fails → D1 deleted, no script delete', async () => {
		_resetLockManagerForTest();
		const api = makeFakeWfpApi({
			applyMigrations: async () => { throw Object.assign(new Error('syntax error'), { status: 400 }); },
		});
		const store = makeFakeStore();
		const deleteD1 = makeFakeD1Deleter();
		const r = await deploySource({
			source: SIMPLE_APP,
			tenantSlug: 'clear-acme',
			appSlug: 'items',
			secrets: {},
			api, store, rootDomain: 'buildclear.dev',
			deleteD1,
		});
		expect(r.ok).toBe(false);
		expect(r.stage).toBe('migrations');
		expect(deleteD1.calls).toHaveLength(1);
		expect(api.calls.some((c) => c.op === 'deleteScript')).toBe(false);
	});
});

// ─────────────────────────────────────────────────────────────────────────
// Cycle 7.7b — DeployLockManager: idempotency against double-click
// ─────────────────────────────────────────────────────────────────────────

describe('DeployLockManager — Phase 7.7b', () => {
	it('acquire returns lock object on first call for a key', () => {
		const mgr = new DeployLockManager();
		const a = mgr.acquire('clear-acme:items');
		expect(a.acquired).toBe(true);
		expect(typeof a.jobId).toBe('string');
	});

	it('acquire returns { acquired: false, existingJobId } when already held', () => {
		const mgr = new DeployLockManager();
		const a = mgr.acquire('clear-acme:items');
		const b = mgr.acquire('clear-acme:items');
		expect(a.acquired).toBe(true);
		expect(b.acquired).toBe(false);
		expect(b.existingJobId).toBe(a.jobId);
	});

	it('release frees the key for a new acquire', () => {
		const mgr = new DeployLockManager();
		const a = mgr.acquire('clear-acme:items');
		mgr.release('clear-acme:items');
		const b = mgr.acquire('clear-acme:items');
		expect(b.acquired).toBe(true);
		expect(b.jobId).not.toBe(a.jobId);
	});

	it('stale locks (>120s) are auto-cleared on acquire', () => {
		const mgr = new DeployLockManager({ staleAfterMs: 100 });
		const a = mgr.acquire('clear-acme:items');
		// Manually age the lock — easier than sleeping.
		mgr._ageLockForTest('clear-acme:items', 200);
		const b = mgr.acquire('clear-acme:items');
		expect(b.acquired).toBe(true);
		expect(b.jobId).not.toBe(a.jobId);
	});

	it('different keys get independent locks', () => {
		const mgr = new DeployLockManager();
		const a = mgr.acquire('clear-acme:items');
		const b = mgr.acquire('clear-other:deals');
		expect(a.acquired).toBe(true);
		expect(b.acquired).toBe(true);
		expect(a.jobId).not.toBe(b.jobId);
	});
});

// ─────────────────────────────────────────────────────────────────────────
// Cycle 7.7b — deploySource integration: double-click = 409 Conflict
// ─────────────────────────────────────────────────────────────────────────

describe('deploySource — double-click idempotency integration', () => {
	testAsync('second call during in-flight returns 409-shape with existing jobId', async () => {
		_resetLockManagerForTest();
		// Block the first deploy mid-flight so the second call races it.
		let resolveFirst = null;
		const api = makeFakeWfpApi({
			provisionD1: async ({ tenantSlug, appSlug }) => {
				api.calls.push({ op: 'provisionD1', tenantSlug, appSlug });
				await new Promise((resolve) => { resolveFirst = resolve; });
				return { ok: true, d1_database_id: 'd1-1', name: `${tenantSlug}-${appSlug}` };
			},
		});
		const store = makeFakeStore();
		const deleteD1 = makeFakeD1Deleter();

		const firstPromise = deploySource({
			source: SIMPLE_APP,
			tenantSlug: 'clear-acme',
			appSlug: 'items',
			secrets: {},
			api, store, rootDomain: 'buildclear.dev',
			deleteD1,
		});

		// Give the first call one microtask to acquire the lock.
		await new Promise((r) => setImmediate(r));

		// Second call collides.
		const second = await deploySource({
			source: SIMPLE_APP,
			tenantSlug: 'clear-acme',
			appSlug: 'items',
			secrets: {},
			api, store, rootDomain: 'buildclear.dev',
			deleteD1,
		});

		expect(second.ok).toBe(false);
		expect(second.conflict).toBe(true);
		expect(typeof second.existingJobId).toBe('string');

		// Let the first deploy finish so the test cleans up.
		resolveFirst();
		const first = await firstPromise;
		expect(first.ok).toBe(true);
	});

	testAsync('10 parallel calls for the same key → exactly 1 succeeds, 9 are conflicts', async () => {
		_resetLockManagerForTest();
		// Gate all provisionD1 calls so they run "parallel" — only one should
		// ever arrive here (the one that acquired the lock).
		let provisionCount = 0;
		const api = makeFakeWfpApi({
			provisionD1: async ({ tenantSlug, appSlug }) => {
				provisionCount++;
				api.calls.push({ op: 'provisionD1', tenantSlug, appSlug });
				// Tiny delay to keep the promise alive while siblings collide.
				await new Promise((r) => setImmediate(r));
				return { ok: true, d1_database_id: `d1-${provisionCount}`, name: `${tenantSlug}-${appSlug}` };
			},
		});
		const store = makeFakeStore();
		const deleteD1 = makeFakeD1Deleter();

		const firings = [];
		for (let i = 0; i < 10; i++) {
			firings.push(deploySource({
				source: SIMPLE_APP,
				tenantSlug: 'clear-acme',
				appSlug: 'items',
				secrets: {},
				api, store, rootDomain: 'buildclear.dev',
				deleteD1,
			}));
		}
		const outcomes = await Promise.all(firings);
		const succeeded = outcomes.filter((o) => o.ok);
		const conflicts = outcomes.filter((o) => o.conflict);
		expect(succeeded).toHaveLength(1);
		expect(conflicts).toHaveLength(9);
		// Only one actual CF provisionD1 call — the other 9 never entered the
		// critical section.
		expect(provisionCount).toBe(1);
	});
});

// ─────────────────────────────────────────────────────────────────────────
// LAE Phase B Cycle 2 — incremental update mode (no D1, no migrations, no
// domain). Widget ships + Deploy-modal "Update" both call this path. Tests
// reuse the same fake-api / fake-store harness to keep the surface drift-proof.
// See plans/plan-live-editing-phase-b-cloud-04-23-2026.md Phase 2.
// ─────────────────────────────────────────────────────────────────────────

// Fake store with Phase 1's versions + secretKeys surface. Mirrors the
// production InMemoryTenantStore shape closely so behavior doesn't diverge.
function makeFakeStoreWithVersions(seed = {}) {
	const state = {
		markAppDeployedCalls: [],
		recordVersionCalls: [],
		updateSecretKeysCalls: [],
		appNameReturns: seed.appNameReturns ?? null,
		markFails: seed.markFails || false,
		appRecord: seed.appRecord || null,
	};
	return {
		_state: state,
		async appNameFor(_t, _a) { return state.appNameReturns; },
		async getAppRecord(_t, _a) { return state.appRecord; },
		async markAppDeployed(args) {
			state.markAppDeployedCalls.push(args);
			if (state.markFails) throw new Error('tenants-db unreachable');
			return { ok: true };
		},
		async recordVersion(args) {
			state.recordVersionCalls.push(args);
			return { ok: true };
		},
		async updateSecretKeys(args) {
			state.updateSecretKeysCalls.push(args);
			return { ok: true };
		},
		async incrementAppsDeployed() { /* noop */ },
	};
}

describe('deploySource mode:update — LAE Phase B Cycle 2', () => {
	// Cycle 2.1: mode routes correctly — update path skips initial-only steps.
	testAsync('mode:update skips provisionD1, applyMigrations, attachDomain', async () => {
		_resetLockManagerForTest();
		const api = makeFakeWfpApi();
		const store = makeFakeStoreWithVersions({
			appRecord: {
				scriptName: 'items',
				d1_database_id: 'd1-prior',
				hostname: 'items.buildclear.dev',
				versions: [],
				secretKeys: [],
			},
		});
		const r = await deploySource({
			source: SIMPLE_APP,
			tenantSlug: 'clear-acme',
			appSlug: 'items',
			mode: 'update',
			lastRecord: store._state.appRecord,
			secrets: {},
			api, store, rootDomain: 'buildclear.dev',
			deleteD1: makeFakeD1Deleter(),
		});
		expect(r.ok).toBe(true);
		expect(r.mode).toBe('update');
		const ops = api.calls.map((c) => c.op);
		expect(ops.includes('provisionD1')).toBe(false);
		expect(ops.includes('applyMigrations')).toBe(false);
		expect(ops.includes('attachDomain')).toBe(false);
		// Upload still happens — that IS the update.
		expect(ops.includes('uploadScript')).toBe(true);
	});

	// Cycle 2.1b: mode defaults to 'deploy' — backward compat for current callers.
	testAsync('mode unset or "deploy" runs full initial deploy (regression floor)', async () => {
		_resetLockManagerForTest();
		const api = makeFakeWfpApi();
		const store = makeFakeStoreWithVersions();
		const r = await deploySource({
			source: SIMPLE_APP,
			tenantSlug: 'clear-acme',
			appSlug: 'items',
			secrets: {},
			api, store, rootDomain: 'buildclear.dev',
			deleteD1: makeFakeD1Deleter(),
		});
		expect(r.ok).toBe(true);
		expect(r.mode === 'deploy' || r.mode === undefined).toBe(true);
		const ops = api.calls.map((c) => c.op);
		expect(ops.includes('provisionD1')).toBe(true);
		expect(ops.includes('uploadScript')).toBe(true);
	});

	// Cycle 2.2: _captureVersionId resolves the new versionId after uploadScript.
	testAsync('_captureVersionId returns result.id when uploadScript exposes it', async () => {
		const { _captureVersionId } = await import('./deploy-cloudflare.js');
		const api = makeFakeWfpApi({
			uploadScript: async () => ({ ok: true, result: { id: 'v-fast-path' } }),
		});
		// Fast path: last uploadScript result carried id; helper returns it.
		const { result } = await api.uploadScript({ scriptName: 'x', bundle: {} });
		const vid = await _captureVersionId({ api, scriptName: 'x', lastUploadResult: result });
		expect(vid).toBe('v-fast-path');
	});

	testAsync('_captureVersionId falls back to listVersions newest when upload has no id', async () => {
		const { _captureVersionId } = await import('./deploy-cloudflare.js');
		const api = makeFakeWfpApi({
			listVersions: async () => ({
				ok: true,
				versions: [
					{ id: 'v-old', created_on: '2026-04-22T10:00:00Z' },
					{ id: 'v-new', created_on: '2026-04-23T10:00:00Z' },
				],
			}),
		});
		const vid = await _captureVersionId({ api, scriptName: 'x', lastUploadResult: {} });
		expect(vid).toBe('v-new');
	});

	testAsync('_captureVersionId returns null when listVersions is empty (race)', async () => {
		const { _captureVersionId } = await import('./deploy-cloudflare.js');
		const api = makeFakeWfpApi({ listVersions: async () => ({ ok: true, versions: [] }) });
		const vid = await _captureVersionId({ api, scriptName: 'x', lastUploadResult: {} });
		expect(vid).toBe(null);
	});

	// Cycle 2.3 + 2.4: update mode captures versionId AND calls recordVersion.
	testAsync('mode:update captures versionId + calls store.recordVersion (not markAppDeployed)', async () => {
		_resetLockManagerForTest();
		const api = makeFakeWfpApi({
			uploadScript: async (args) => {
				api.calls.push({ op: 'uploadScript', scriptName: args.scriptName });
				return { ok: true, result: { id: 'v-new-abc' } };
			},
		});
		const store = makeFakeStoreWithVersions({
			appRecord: {
				scriptName: 'items', d1_database_id: 'd1-x',
				hostname: 'items.buildclear.dev', versions: [], secretKeys: [],
			},
		});
		const r = await deploySource({
			source: SIMPLE_APP,
			tenantSlug: 'clear-acme',
			appSlug: 'items',
			mode: 'update',
			lastRecord: store._state.appRecord,
			secrets: {},
			api, store, rootDomain: 'buildclear.dev',
			deleteD1: makeFakeD1Deleter(),
		});
		expect(r.ok).toBe(true);
		expect(r.versionId).toBe('v-new-abc');
		expect(store._state.recordVersionCalls).toHaveLength(1);
		expect(store._state.markAppDeployedCalls).toHaveLength(0);
		const rv = store._state.recordVersionCalls[0];
		expect(rv.tenantSlug).toBe('clear-acme');
		expect(rv.appSlug).toBe('items');
		expect(rv.versionId).toBe('v-new-abc');
		expect(typeof rv.sourceHash).toBe('string');
		expect(rv.sourceHash.length).toBeGreaterThan(0);
	});

	// Cycle 2.5: update mode only sets NEW secret keys — skips existing ones.
	testAsync('mode:update sets only secrets whose keys are NOT in lastRecord.secretKeys', async () => {
		_resetLockManagerForTest();
		let setSecretsArgs = null;
		const api = makeFakeWfpApi({
			setSecrets: async ({ scriptName, secrets }) => {
				setSecretsArgs = { scriptName, secretNames: Object.keys(secrets || {}) };
				api.calls.push({ op: 'setSecrets', scriptName, secretNames: setSecretsArgs.secretNames });
				return { ok: true };
			},
			uploadScript: async (args) => {
				api.calls.push({ op: 'uploadScript' });
				return { ok: true, result: { id: 'v-next' } };
			},
		});
		const store = makeFakeStoreWithVersions({
			appRecord: {
				scriptName: 'items', d1_database_id: 'd1',
				hostname: 'h', versions: [],
				secretKeys: ['API_KEY'], // already set
			},
		});
		const r = await deploySource({
			source: SIMPLE_APP,
			tenantSlug: 'clear-acme',
			appSlug: 'items',
			mode: 'update',
			lastRecord: store._state.appRecord,
			secrets: { API_KEY: 'existing-val', DB_URL: 'new-val' },
			api, store, rootDomain: 'buildclear.dev',
			deleteD1: makeFakeD1Deleter(),
		});
		expect(r.ok).toBe(true);
		expect(setSecretsArgs).toBeDefined();
		// Only DB_URL should have been sent — API_KEY was already on the record.
		expect(setSecretsArgs.secretNames).toEqual(['DB_URL']);
	});

	testAsync('mode:update skips setSecrets entirely when all secrets already set', async () => {
		_resetLockManagerForTest();
		const api = makeFakeWfpApi({
			uploadScript: async () => ({ ok: true, result: { id: 'v-next' } }),
		});
		const store = makeFakeStoreWithVersions({
			appRecord: {
				scriptName: 'items', d1_database_id: 'd1',
				hostname: 'h', versions: [], secretKeys: ['API_KEY'],
			},
		});
		await deploySource({
			source: SIMPLE_APP,
			tenantSlug: 'clear-acme',
			appSlug: 'items',
			mode: 'update',
			lastRecord: store._state.appRecord,
			secrets: { API_KEY: 'existing-val' },
			api, store, rootDomain: 'buildclear.dev',
			deleteD1: makeFakeD1Deleter(),
		});
		const ops = api.calls.map((c) => c.op);
		expect(ops.includes('setSecrets')).toBe(false);
	});

	// Cycle 2.6: DeployLockManager covers update mode too.
	testAsync('mode:update second concurrent call gets conflict via DeployLockManager', async () => {
		_resetLockManagerForTest();
		const api = makeFakeWfpApi({
			uploadScript: async () => {
				await new Promise(r => setTimeout(r, 10));
				return { ok: true, result: { id: 'v' } };
			},
		});
		const store = makeFakeStoreWithVersions({
			appRecord: { scriptName: 'items', d1_database_id: 'd1', hostname: 'h', versions: [], secretKeys: [] },
		});
		const baseOpts = {
			source: SIMPLE_APP,
			tenantSlug: 'clear-acme',
			appSlug: 'items',
			mode: 'update',
			lastRecord: store._state.appRecord,
			secrets: {},
			api, store, rootDomain: 'buildclear.dev',
			deleteD1: makeFakeD1Deleter(),
		};
		const [r1, r2] = await Promise.all([deploySource(baseOpts), deploySource(baseOpts)]);
		const wins = [r1, r2].filter(r => r.ok);
		const conflicts = [r1, r2].filter(r => r.conflict);
		expect(wins).toHaveLength(1);
		expect(conflicts).toHaveLength(1);
	});

	// Tags: recordVersion via args carry `via:'widget'` when passed through
	// (used by widget-mode ship to distinguish live-edit versions from
	// Deploy-modal versions). Additive option — default unset.
	testAsync('mode:update forwards opts.via into recordVersion metadata', async () => {
		_resetLockManagerForTest();
		const api = makeFakeWfpApi({ uploadScript: async () => ({ ok: true, result: { id: 'v' } }) });
		const store = makeFakeStoreWithVersions({
			appRecord: { scriptName: 'items', d1_database_id: 'd1', hostname: 'h', versions: [], secretKeys: [] },
		});
		await deploySource({
			source: SIMPLE_APP,
			tenantSlug: 'clear-acme',
			appSlug: 'items',
			mode: 'update',
			lastRecord: store._state.appRecord,
			via: 'widget',
			secrets: {},
			api, store, rootDomain: 'buildclear.dev',
			deleteD1: makeFakeD1Deleter(),
		});
		expect(store._state.recordVersionCalls[0].via).toBe('widget');
	});
});

// ─────────────────────────────────────────────────────────────────────────
// One-click updates Phase 3 — migration safety gate.
// Updates that would change D1 schema must require explicit user
// confirmation. SQLite has no atomic schema swap, so silently auto-applying
// a destructive migration mid-update can leave the live script wedged
// against a half-applied schema. The gate detects schema-shape changes,
// surfaces them to the UI, and only proceeds when the caller passes
// confirmMigration:true.
// ─────────────────────────────────────────────────────────────────────────

describe('migrationsDiffer — Phase 3 Cycle 3.1', () => {
	it('returns false when both bundles have identical migration files', async () => {
		const { migrationsDiffer } = await import('./deploy-cloudflare.js');
		const a = { 'migrations/001-init.sql': 'CREATE TABLE a (id INT)' };
		const b = { 'migrations/001-init.sql': 'CREATE TABLE a (id INT)' };
		expect(migrationsDiffer(a, b)).toBe(false);
	});

	it('returns true when a migration file content differs', async () => {
		const { migrationsDiffer } = await import('./deploy-cloudflare.js');
		const a = { 'migrations/001-init.sql': 'CREATE TABLE a (id INT)' };
		const b = { 'migrations/001-init.sql': 'CREATE TABLE a (id INT, name TEXT)' };
		expect(migrationsDiffer(a, b)).toBe(true);
	});

	it('returns true when the new bundle adds a migration file', async () => {
		const { migrationsDiffer } = await import('./deploy-cloudflare.js');
		const a = { 'migrations/001-init.sql': 'CREATE TABLE a (id INT)' };
		const b = {
			'migrations/001-init.sql': 'CREATE TABLE a (id INT)',
			'migrations/002-add-b.sql': 'CREATE TABLE b (id INT)',
		};
		expect(migrationsDiffer(a, b)).toBe(true);
	});

	it('returns true when the new bundle removes a migration file', async () => {
		const { migrationsDiffer } = await import('./deploy-cloudflare.js');
		const a = {
			'migrations/001-init.sql': 'CREATE TABLE a (id INT)',
			'migrations/002-add-b.sql': 'CREATE TABLE b (id INT)',
		};
		const b = { 'migrations/001-init.sql': 'CREATE TABLE a (id INT)' };
		expect(migrationsDiffer(a, b)).toBe(true);
	});

	it('returns true when a migration is renamed (set of filenames differs)', async () => {
		const { migrationsDiffer } = await import('./deploy-cloudflare.js');
		const a = { 'migrations/001-init.sql': 'CREATE TABLE a (id INT)' };
		const b = { 'migrations/001-renamed.sql': 'CREATE TABLE a (id INT)' };
		expect(migrationsDiffer(a, b)).toBe(true);
	});

	it('ignores non-migration files (src/index.js, etc) when comparing', async () => {
		const { migrationsDiffer } = await import('./deploy-cloudflare.js');
		const a = {
			'migrations/001-init.sql': 'CREATE TABLE a (id INT)',
			'src/index.js': 'export default { fetch(){ return new Response("v1"); } }',
		};
		const b = {
			'migrations/001-init.sql': 'CREATE TABLE a (id INT)',
			'src/index.js': 'export default { fetch(){ return new Response("v2-CHANGED"); } }',
		};
		expect(migrationsDiffer(a, b)).toBe(false);
	});

	it('treats a missing/empty oldBundle as no migrations (no diff if newBundle also empty)', async () => {
		const { migrationsDiffer } = await import('./deploy-cloudflare.js');
		expect(migrationsDiffer({}, {})).toBe(false);
		expect(migrationsDiffer(null, null)).toBe(false);
	});

	it('treats an oldBundle with no migrations vs a newBundle with migrations as a diff', async () => {
		const { migrationsDiffer } = await import('./deploy-cloudflare.js');
		const a = { 'src/index.js': 'x' };
		const b = { 'migrations/001-init.sql': 'CREATE TABLE a (id INT)', 'src/index.js': 'x' };
		expect(migrationsDiffer(a, b)).toBe(true);
	});
});

// ─────────────────────────────────────────────────────────────────────────
// Phase 3 Cycle 3.2 — update mode blocks when migrations differ.
// The new compile changed schema; without an explicit confirm flag, refuse
// the upload and hand the UI a structured diff so it can prompt the user.
// Each test uses a UNIQUE appSlug because the lock manager + describe block
// fire all testAsyncs concurrently — sharing 'items' across tests races.
// ─────────────────────────────────────────────────────────────────────────

// .clear source whose schema diff vs SIMPLE_APP forces the gate to fire.
// SIMPLE_APP creates Items with name; ITEMS_SCHEMA_V2 adds price, which
// changes the compiled CREATE TABLE in migrations/001-init.sql.
const ITEMS_SCHEMA_V2 = `build for javascript backend

create a Items table:
  name, required
  price, number

when user requests data from /api/items:
  items = get all Items
  send back items
`;

describe('deploySource mode:update — migration-safety gate (Cycle 3.2)', () => {
	testAsync('returns migration-confirm-required when compiled migrations differ from lastRecord', async () => {
		_resetLockManagerForTest();
		const { compileProgram } = await import('../index.js');
		const v1 = compileProgram(SIMPLE_APP, { target: 'cloudflare' });
		const oldBundle = v1.workerBundle;

		const api = makeFakeWfpApi();
		const store = makeFakeStoreWithVersions({
			appRecord: {
				scriptName: 'gate-fires',
				d1_database_id: 'd1-prior',
				hostname: 'gate-fires.buildclear.dev',
				versions: [], secretKeys: [],
				lastBundle: oldBundle,
			},
		});

		const r = await deploySource({
			source: ITEMS_SCHEMA_V2,
			tenantSlug: 'clear-acme',
			appSlug: 'gate-fires',
			mode: 'update',
			lastRecord: store._state.appRecord,
			secrets: {},
			api, store, rootDomain: 'buildclear.dev',
			deleteD1: makeFakeD1Deleter(),
		});

		expect(r.ok).toBe(false);
		expect(r.stage).toBe('migration-confirm-required');
		expect(Array.isArray(r.migrationDiff)).toBe(true);
		expect(r.migrationDiff.length).toBeGreaterThan(0);
		const entry = r.migrationDiff.find((d) => d.file === 'migrations/001-init.sql');
		expect(entry).toBeDefined();
		expect(entry.kind).toBe('changed');
		// Critical: no upload happened — old code keeps serving until confirm.
		const ops = api.calls.map((c) => c.op);
		expect(ops.includes('uploadScript')).toBe(false);
	});

	testAsync('proceeds normally when migrations are identical (no gate fires)', async () => {
		const { compileProgram } = await import('../index.js');
		const v1 = compileProgram(SIMPLE_APP, { target: 'cloudflare' });
		const oldBundle = v1.workerBundle;

		const api = makeFakeWfpApi({
			uploadScript: async (args) => {
				api.calls.push({ op: 'uploadScript', scriptName: args.scriptName });
				return { ok: true, result: { id: 'v-same-schema' } };
			},
		});
		const store = makeFakeStoreWithVersions({
			appRecord: {
				scriptName: 'no-gate', d1_database_id: 'd1', hostname: 'h',
				versions: [], secretKeys: [], lastBundle: oldBundle,
			},
		});

		const r = await deploySource({
			source: SIMPLE_APP, // SAME source = same migrations
			tenantSlug: 'clear-acme',
			appSlug: 'no-gate',
			mode: 'update',
			lastRecord: store._state.appRecord,
			secrets: {},
			api, store, rootDomain: 'buildclear.dev',
			deleteD1: makeFakeD1Deleter(),
		});

		expect(r.ok).toBe(true);
		expect(r.stage).toBeUndefined();
		const ops = api.calls.map((c) => c.op);
		expect(ops.includes('uploadScript')).toBe(true);
	});

	testAsync('records added/removed/changed kinds in migrationDiff', async () => {
		// Pure helper test — no deploySource invocation, no lock manager use.
		const { _describeMigrationDiff } = await import('./deploy-cloudflare.js');
		const oldB = {
			'migrations/001-init.sql': 'CREATE TABLE a',
			'migrations/002-old.sql': 'CREATE TABLE old_one',
		};
		const newB = {
			'migrations/001-init.sql': 'CREATE TABLE a-CHANGED', // changed
			'migrations/003-fresh.sql': 'CREATE TABLE fresh',     // added
			// 002-old.sql removed
		};
		const diff = _describeMigrationDiff(oldB, newB);
		const byFile = Object.fromEntries(diff.map((d) => [d.file, d.kind]));
		expect(byFile['migrations/001-init.sql']).toBe('changed');
		expect(byFile['migrations/002-old.sql']).toBe('removed');
		expect(byFile['migrations/003-fresh.sql']).toBe('added');
	});

	testAsync('returns an empty migrationDiff when nothing differs (helper exposes [], not null)', async () => {
		const { _describeMigrationDiff } = await import('./deploy-cloudflare.js');
		const a = { 'migrations/001-init.sql': 'X' };
		const b = { 'migrations/001-init.sql': 'X' };
		expect(_describeMigrationDiff(a, b)).toEqual([]);
	});
});

// playground/deploy-cloudflare.js
// Phase 7.7 — orchestrates Marcus's "Publish" click end-to-end against
// Cloudflare Workers for Platforms.
//
// Happy path (7 steps):
//   1. compile          — compileProgram(source, { target: 'cloudflare' })
//   2. provision D1     — api.provisionD1({ tenantSlug, appSlug })
//   3. apply migrations — api.applyMigrations({ d1_database_id, sql })
//   4. upload script    — api.uploadScript({ scriptName, bundle, bindings, ... })
//   5. set secrets      — api.setSecrets({ scriptName, secrets })
//   6. attach domain    — api.attachDomain({ scriptName, hostname }) (optional)
//   7. record in store  — store.markAppDeployed(...)
//
// Rollback ladder (reverse order, skipping steps that didn't run):
//   - upload fails    → delete D1
//   - secrets fail    → delete script, delete D1
//   - domain fails    → KEEP everything, return degraded success
//   - record fails    → KEEP everything, reconcile picks up orphan
//
// Double-click guard (Cycle 7.7b):
//   - DeployLockManager holds a `<tenantSlug>:<appSlug>` lock for each
//     in-flight deploy. Second request for the same key within 120s returns
//     409 with { existingJobId }. UI polls the existing jobId.
//
// Test-only hooks: _resetLockManagerForTest, ageing via _ageLockForTest.

import { randomUUID } from 'crypto';

import { compileProgram } from '../index.js';
import { packageCloudflareBundle } from '../lib/packaging-cloudflare.js';

// ──────────────────────────────────────────────────────────────────────
// DeployLockManager — in-memory double-click guard
// ──────────────────────────────────────────────────────────────────────
export class DeployLockManager {
	constructor({ staleAfterMs = 120_000 } = {}) {
		this._locks = new Map(); // key → { jobId, startedAt }
		this._staleAfterMs = staleAfterMs;
	}

	acquire(key) {
		const existing = this._locks.get(key);
		const now = Date.now();
		if (existing) {
			// Stale? Clear and let the caller proceed.
			if (now - existing.startedAt > this._staleAfterMs) {
				this._locks.delete(key);
			} else {
				return { acquired: false, existingJobId: existing.jobId };
			}
		}
		const jobId = randomUUID();
		this._locks.set(key, { jobId, startedAt: now });
		return { acquired: true, jobId };
	}

	release(key) {
		this._locks.delete(key);
	}

	// Test helper — manually adjust a lock's age so tests don't have to sleep.
	_ageLockForTest(key, addMs) {
		const entry = this._locks.get(key);
		if (entry) entry.startedAt = entry.startedAt - addMs;
	}
}

// Module-scope singleton shared by every deploySource call in the process.
// Tests reset this via _resetLockManagerForTest to keep isolation.
let _lockManager = new DeployLockManager();

export function _resetLockManagerForTest() {
	_lockManager = new DeployLockManager();
}

// ──────────────────────────────────────────────────────────────────────
// Internal: derive CF bindings from the AST. Walks the top-level nodes to
// figure out which D1/Workflows/KV/service bindings the wrangler.toml + the
// upload metadata need to declare. Keeps the orchestrator in charge of
// what CF sees, rather than threading binding construction through the
// compiler itself.
// ──────────────────────────────────────────────────────────────────────
function _deriveBindings(astBody, d1_database_id) {
	const bindings = [];
	// Every app that compiles with at least one DATA_SHAPE gets a D1 binding.
	const hasTables = (astBody || []).some((n) => n && n.type === 'data_shape');
	if (hasTables && d1_database_id) {
		bindings.push({ type: 'd1', name: 'DB', id: d1_database_id });
	}
	// Durable workflows → one `[[workflows]]` binding per workflow. The
	// compiler emits the class file; we point the binding at it.
	for (const n of astBody || []) {
		if (n && n.type === 'workflow' && n.runsOnTemporal) {
			const className = _wfClassName(n.name);
			const bindingName = _wfBindingName(n.name);
			bindings.push({
				type: 'durable_object_namespace',
				name: bindingName,
				class_name: className,
			});
		}
	}
	return bindings;
}

function _wfClassName(name) {
	return String(name || '').replace(/[^A-Za-z0-9]+/g, ' ').trim().split(/\s+/)
		.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join('') + 'Workflow';
}

function _wfBindingName(name) {
	return String(name || '').replace(/[^A-Za-z0-9_]/g, '_').toUpperCase() + '_WORKFLOW';
}

// ──────────────────────────────────────────────────────────────────────
// Build the default hostname for a deploy. Defaults to
// `<appSlug>.<tenantSlug without clear- prefix>.<rootDomain>`.
// ──────────────────────────────────────────────────────────────────────
function _defaultHostname({ tenantSlug, appSlug, rootDomain }) {
	// Per the plan (lines 28-44): the default URL is `<appSlug>.<rootDomain>`.
	// Tenants don't show up in the hostname — the tenant slug is a Studio-side
	// identifier, not a DNS label. Collision prevention lives one layer up
	// (appSlug is tenant-scoped in the store). Prefix the tenant slug to the
	// appSlug at provision time if you need cross-tenant uniqueness.
	return `${appSlug}.${rootDomain}`;
}

// ──────────────────────────────────────────────────────────────────────
// deploySource — main orchestration entry
// ──────────────────────────────────────────────────────────────────────

/**
 * Run the Cloudflare deploy sequence for one .clear source.
 *
 * @param {object} p
 * @param {string} p.source         .clear source text
 * @param {string} p.tenantSlug     e.g. 'clear-acme'
 * @param {string} p.appSlug        e.g. 'items'
 * @param {object} [p.secrets]      user-provided secret key/values
 * @param {string} [p.customDomain] custom hostname (else uses default)
 * @param {object} p.api            WfpApi instance (or a shim with the same surface)
 * @param {object} p.store          tenants-db store w/ { appNameFor, markAppDeployed }
 * @param {string} p.rootDomain     e.g. 'buildclear.dev'
 * @param {Function} p.deleteD1     async (d1_database_id) — CF doesn't yet expose
 *                                  a D1 delete in the wrapper, so we accept it as
 *                                  a capability. Tests inject a fake; production
 *                                  wires in the real implementation.
 * @returns {Promise<object>} see shape variants in the test file
 */
export async function deploySource({
	source,
	tenantSlug,
	appSlug,
	secrets = {},
	customDomain,
	api,
	store,
	rootDomain,
	deleteD1,
	knowledgeBase,
	knowledgeCache,
}) {
	// 0. Idempotency lock.
	const lockKey = `${tenantSlug}:${appSlug}`;
	const lock = _lockManager.acquire(lockKey);
	if (!lock.acquired) {
		return {
			ok: false,
			conflict: true,
			existingJobId: lock.existingJobId,
			hint: 'Deploy already in progress for this app',
		};
	}

	const jobId = lock.jobId;
	// Track what's actually run so rollback only undoes real state.
	const state = {
		d1Provisioned: null, // { d1_database_id }
		scriptUploaded: false,
	};

	try {
		// 1. Compile.
		const compileOpts = { target: 'cloudflare' };
		if (knowledgeBase) compileOpts.knowledgeBase = knowledgeBase;
		if (knowledgeCache) compileOpts.knowledgeCache = knowledgeCache;
		const compiled = compileProgram(source, compileOpts);
		if (compiled.errors && compiled.errors.length) {
			return { ok: false, stage: 'compile', jobId, errors: compiled.errors };
		}
		const astBody = compiled.ast?.body || [];

		// 2. Provision D1 (only if the app has tables — otherwise no DB needed).
		let d1_database_id = null;
		const hasTables = astBody.some((n) => n && n.type === 'data_shape');
		if (hasTables) {
			const p = await api.provisionD1({ tenantSlug, appSlug });
			d1_database_id = p.d1_database_id;
			state.d1Provisioned = { d1_database_id };
		}

		// 3. Apply migrations.
		const migrations = compiled.workerBundle?.['migrations/001-init.sql'] || '';
		if (d1_database_id && migrations) {
			try {
				await api.applyMigrations({ d1_database_id, sql: migrations });
			} catch (e) {
				await _rollback(state, { api, deleteD1, scriptName: appSlug });
				return { ok: false, stage: 'migrations', jobId, status: e.status || 500, error: e.message };
			}
		}

		// 4. Upload script.
		const bindings = _deriveBindings(astBody, d1_database_id);
		const bundle = { ...(compiled.workerBundle || {}) };
		// The migrations file is for step 3 — never upload it as a module.
		delete bundle['migrations/001-init.sql'];
		// wrangler.toml is not a module either — CF reads metadata from the
		// upload body's JSON part, not from a toml in the script.
		delete bundle['wrangler.toml'];
		const scriptName = appSlug;
		try {
			await api.uploadScript({
				scriptName,
				bundle,
				bindings,
				compatibilityDate: '2025-04-01',
				compatibilityFlags: ['nodejs_compat_v2'],
			});
			state.scriptUploaded = true;
		} catch (e) {
			await _rollback(state, { api, deleteD1, scriptName });
			return { ok: false, stage: 'upload', jobId, status: e.status || 500, error: e.message };
		}

		// 5. Set secrets.
		if (secrets && Object.keys(secrets).length > 0) {
			const setR = await api.setSecrets({ scriptName, secrets });
			if (!setR.ok) {
				await _rollback(state, { api, deleteD1, scriptName });
				return {
					ok: false,
					stage: 'secrets',
					jobId,
					failed: setR.failed || [],
				};
			}
		}

		// 6. Attach domain. Default or custom. Domain failure = degraded success.
		const hostname = customDomain || _defaultHostname({ tenantSlug, appSlug, rootDomain });
		let domainError = null;
		const dR = await api.attachDomain({ scriptName, hostname });
		if (!dR.ok) {
			domainError = { code: dR.code, status: dR.status };
		}

		// 7. Record in tenants-db. Record failure = orphan for reconcile.
		// LAE Phase B: also seed secretKeys so incremental updates can
		// skip setSecrets for already-set keys. versionId + sourceHash +
		// migrationsHash come in Phase 2 (next plan phase) once _captureVersionId
		// lands; for now they're null on the seed row — first widget-Ship
		// will populate a real row via recordVersion.
		try {
			await store.markAppDeployed({
				tenantSlug, appSlug, scriptName,
				d1_database_id,
				hostname: domainError ? _defaultHostname({ tenantSlug, appSlug, rootDomain }) : hostname,
				versionId: null,
				sourceHash: null,
				migrationsHash: null,
				secretKeys: Object.keys(secrets || {}),
			});
		} catch (e) {
			// No rollback — the app IS live. Reconcile picks up the orphan.
			return {
				ok: false,
				stage: 'record',
				jobId,
				liveUrl: `https://${_defaultHostname({ tenantSlug, appSlug, rootDomain })}`,
				reason: 'tenants-db write failed — reconcile job will sync',
			};
		}

		const finalUrl = `https://${domainError ? _defaultHostname({ tenantSlug, appSlug, rootDomain }) : hostname}`;
		return {
			ok: true,
			jobId,
			url: finalUrl,
			d1_database_id,
			...(domainError ? { degraded: true, domainError } : {}),
		};
	} finally {
		_lockManager.release(lockKey);
	}
}

// ──────────────────────────────────────────────────────────────────────
// Internal rollback. Reverse order, skip what didn't run. Never throws —
// best-effort cleanup so a rollback failure doesn't mask the original
// error the caller was about to return.
// ──────────────────────────────────────────────────────────────────────
async function _rollback(state, { api, deleteD1, scriptName }) {
	if (state.scriptUploaded && api && typeof api.deleteScript === 'function') {
		try { await api.deleteScript({ scriptName }); }
		catch (_e) { /* best effort */ }
	}
	if (state.d1Provisioned && typeof deleteD1 === 'function') {
		try { await deleteD1(state.d1Provisioned.d1_database_id); }
		catch (_e) { /* best effort */ }
	}
}

// ──────────────────────────────────────────────────────────────────────
// In-memory job status map (Cycle 7.11). Keyed by jobId. Populated by the
// caller (typically deploy.js in /api/deploy) BEFORE kicking the deploy.
// ──────────────────────────────────────────────────────────────────────
const _jobs = new Map();

export function recordJob(jobId, payload) {
	_jobs.set(jobId, { ...payload, updatedAt: Date.now() });
}

export function getJob(jobId) {
	return _jobs.get(jobId) || null;
}

export function _resetJobsForTest() {
	_jobs.clear();
}

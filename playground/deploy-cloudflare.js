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

import { randomUUID, createHash } from 'crypto';

import { compileProgram } from '../index.js';
import { packageCloudflareBundle } from '../lib/packaging-cloudflare.js';

// ──────────────────────────────────────────────────────────────────────
// LAE Phase B / one-click-updates — helpers for the incremental-update path
// ──────────────────────────────────────────────────────────────────────

/**
 * Resolve the versionId of the script version we just uploaded. Cloudflare's
 * PUT /scripts/<name> USUALLY returns { result: { id: '<version-id>' } }, but
 * the exact shape varies by CF version family. This helper tries the fast
 * path first and falls back to listVersions + newest-by-created_on.
 *
 * Returns null if everything fails (CF hasn't indexed the version yet — rare
 * race). Callers tolerate null by logging and using null in the version row;
 * a subsequent listVersions fetch from UI can fill it in.
 *
 * Exported for unit tests.
 */
export async function _captureVersionId({ api, scriptName, lastUploadResult }) {
	// Fast path: upload response had `result.id`.
	if (lastUploadResult && typeof lastUploadResult.id === 'string' && lastUploadResult.id.length > 0) {
		return lastUploadResult.id;
	}
	// Slow path: ask CF for the version list.
	try {
		const lv = await api.listVersions({ scriptName });
		if (!lv || !lv.ok) return null;
		const versions = Array.isArray(lv.versions) ? [...lv.versions] : [];
		if (versions.length === 0) return null;
		versions.sort((a, b) => {
			const ta = Date.parse(a.created_on || '') || 0;
			const tb = Date.parse(b.created_on || '') || 0;
			return tb - ta;
		});
		return versions[0].id || null;
	} catch {
		return null;
	}
}

function _hashSource(source) {
	return createHash('sha256').update(String(source || '')).digest('hex');
}

function _hashMigrations(bundle) {
	const migKeys = Object.keys(bundle || {}).filter((k) => k.startsWith('migrations/')).sort();
	if (migKeys.length === 0) return null;
	const h = createHash('sha256');
	for (const k of migKeys) {
		h.update(k);
		h.update('\x00');
		h.update(String(bundle[k] || ''));
		h.update('\x00');
	}
	return h.digest('hex');
}

/**
 * migrationsDiffer — byte-precise schema-change detector.
 *
 * Compares the "schema-shaped" files in two compiled worker bundles:
 *   - any file whose path starts with `migrations/`
 *
 * Returns true when:
 *   - the SET of migration filenames differs (added, removed, renamed), OR
 *   - any same-named migration file's content differs by even one byte.
 *
 * The compare is intentionally dumb (string equality, not SQL semantics).
 * A false positive — two semantically identical migrations written
 * differently — costs Marcus one extra confirm click. A false negative —
 * letting a destructive schema change slip through silently — could wedge
 * a live D1 against a half-applied schema. Safe default = strict.
 *
 * Exported for unit tests + reuse by the /api/deploy handler in Phase 4.
 */
export function migrationsDiffer(oldBundle, newBundle) {
	const oldKeys = _migrationKeys(oldBundle);
	const newKeys = _migrationKeys(newBundle);
	if (oldKeys.length !== newKeys.length) return true;
	for (let i = 0; i < oldKeys.length; i++) {
		if (oldKeys[i] !== newKeys[i]) return true;
	}
	for (const k of oldKeys) {
		if (String(oldBundle[k] || '') !== String(newBundle[k] || '')) return true;
	}
	return false;
}

function _migrationKeys(bundle) {
	if (!bundle || typeof bundle !== 'object') return [];
	return Object.keys(bundle).filter((k) => k.startsWith('migrations/')).sort();
}

/**
 * _describeMigrationDiff — structured diff for the UI gate.
 *
 * Returns an array of { file, kind } where kind is 'added' | 'removed' | 'changed'.
 * Only enumerates migration files (mirrors migrationsDiffer's scope). Used by
 * _deployUpdate to populate the migration-confirm-required response so the
 * Studio modal can show Marcus what's changing before he confirms.
 *
 * Empty array on no diff. Exported for unit tests + reuse by handlers.
 */
export function _describeMigrationDiff(oldBundle, newBundle) {
	const oldKeys = new Set(_migrationKeys(oldBundle));
	const newKeys = new Set(_migrationKeys(newBundle));
	const out = [];
	// Added: in new but not in old.
	for (const k of newKeys) {
		if (!oldKeys.has(k)) out.push({ file: k, kind: 'added' });
	}
	// Removed: in old but not in new.
	for (const k of oldKeys) {
		if (!newKeys.has(k)) out.push({ file: k, kind: 'removed' });
	}
	// Changed: in both, content differs.
	for (const k of oldKeys) {
		if (!newKeys.has(k)) continue;
		if (String(oldBundle[k] || '') !== String(newBundle[k] || '')) {
			out.push({ file: k, kind: 'changed' });
		}
	}
	return out;
}

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
	mode = 'deploy',
	lastRecord = null,
	via,
	confirmMigration,
}) {
	// 0. Idempotency lock — covers both deploy and update modes.
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

	// LAE Phase B: route to the incremental path when the caller has signaled
	// "app already exists, just push the new bundle." Skips provisionD1,
	// applyMigrations, attachDomain — all three are permanent setup from the
	// first deploy. Keeps uploadScript (that IS the update) and the secrets
	// step, but filters secrets to keys not already set. Records the new
	// version via store.recordVersion, not markAppDeployed (which would
	// clobber the history).
	if (mode === 'update') {
		try {
			return await _deployUpdate({
				source, tenantSlug, appSlug, secrets,
				api, store, rootDomain,
				lastRecord, via, jobId,
				knowledgeBase, knowledgeCache,
				confirmMigration,
			});
		} finally {
			_lockManager.release(lockKey);
		}
	}
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
// LAE Phase B — incremental update path. Called from deploySource when
// mode === 'update'. Caller holds the lock + will release it; we return
// the outcome unchanged.
//
// Steps (fewer than initial deploy):
//   1. compile                      — same as initial
//   2. filter secrets               — only keys NOT in lastRecord.secretKeys
//   3. setSecrets (skip if no new)  — only the filtered subset
//   4. uploadScript                 — upsert; CF creates a new version
//   5. _captureVersionId            — fast-path or listVersions fallback
//   6. store.recordVersion          — append to versions[]; NOT markAppDeployed
//   7. store.updateSecretKeys       — append any newly-set keys
// Returns { ok, mode, versionId, url, jobId } on success; { ok:false, stage }
// with the failing step on any error. No rollback ladder in update mode —
// Cloudflare keeps the previous version live on any failure; we just don't
// promote the new one.
// ──────────────────────────────────────────────────────────────────────
async function _deployUpdate({
	source, tenantSlug, appSlug, secrets,
	api, store, rootDomain,
	lastRecord, via, jobId,
	knowledgeBase, knowledgeCache,
	confirmMigration,
}) {
	// 1. Compile.
	const compileOpts = { target: 'cloudflare' };
	if (knowledgeBase) compileOpts.knowledgeBase = knowledgeBase;
	if (knowledgeCache) compileOpts.knowledgeCache = knowledgeCache;
	const compiled = compileProgram(source, compileOpts);
	if (compiled.errors && compiled.errors.length) {
		return { ok: false, stage: 'compile', jobId, errors: compiled.errors, mode: 'update' };
	}

	// 1b. Migration safety gate (Phase 3 Cycle 3.2). If the new compile changed
	// any migrations/* file vs the bundle stored on lastRecord, refuse to upload
	// until the caller passes confirmMigration:true. This blocks silent
	// destructive schema changes — SQLite has no atomic schema swap, so a
	// half-applied migration mid-update can wedge a live D1.
	const oldBundleForGate = (lastRecord && lastRecord.lastBundle) || null;
	const newBundleForGate = compiled.workerBundle || {};
	if (oldBundleForGate && migrationsDiffer(oldBundleForGate, newBundleForGate) && confirmMigration !== true) {
		return {
			ok: false,
			stage: 'migration-confirm-required',
			jobId,
			mode: 'update',
			migrationDiff: _describeMigrationDiff(oldBundleForGate, newBundleForGate),
		};
	}

	// 2. Filter secrets — only set keys that aren't already on the record.
	const existingKeys = new Set((lastRecord && Array.isArray(lastRecord.secretKeys)) ? lastRecord.secretKeys : []);
	const newSecretEntries = Object.entries(secrets || {}).filter(([k]) => !existingKeys.has(k));
	const newSecrets = Object.fromEntries(newSecretEntries);
	const newKeys = Object.keys(newSecrets);

	// 3. setSecrets only when there's something new. Skipping entirely avoids
	// an unnecessary CF API call on a pure source-only update.
	if (newKeys.length > 0) {
		try {
			const setR = await api.setSecrets({ scriptName: appSlug, secrets: newSecrets });
			if (!setR.ok) {
				return { ok: false, stage: 'secrets', jobId, mode: 'update', failed: setR.failed || [] };
			}
		} catch (e) {
			return { ok: false, stage: 'secrets', jobId, mode: 'update', error: e.message };
		}
	}

	// 4. Upload script — upsert. CF creates a new version automatically.
	const bundle = { ...(compiled.workerBundle || {}) };
	delete bundle['migrations/001-init.sql'];
	delete bundle['wrangler.toml'];
	const astBody = compiled.ast?.body || [];
	const bindings = _deriveBindings(astBody, lastRecord && lastRecord.d1_database_id);
	const scriptName = appSlug;
	let uploadResult;
	try {
		const r = await api.uploadScript({
			scriptName,
			bundle,
			bindings,
			compatibilityDate: '2025-04-01',
			compatibilityFlags: ['nodejs_compat_v2'],
		});
		uploadResult = r && r.result ? r.result : {};
	} catch (e) {
		return { ok: false, stage: 'upload', jobId, mode: 'update', status: e.status || 500, error: e.message };
	}

	// 5. Resolve versionId. null is tolerated — UI can backfill from listVersions.
	const versionId = await _captureVersionId({ api, scriptName, lastUploadResult: uploadResult });
	if (versionId === null) {
		console.warn('[update] versionId-missing — CF listVersions returned no entries; recordVersion with null');
	}

	// 6. Append to versions[].
	const uploadedAt = new Date().toISOString();
	try {
		await store.recordVersion({
			tenantSlug, appSlug, versionId,
			uploadedAt,
			sourceHash: _hashSource(source),
			migrationsHash: _hashMigrations(bundle),
			...(via ? { via } : {}),
		});
	} catch (e) {
		return {
			ok: false,
			stage: 'record',
			jobId,
			mode: 'update',
			versionId,
			reason: 'tenants-db recordVersion failed — CF has the new version but we lost the history entry',
		};
	}

	// 7. Track newly-set secret key names. Best-effort; failure here doesn't fail the update.
	if (newKeys.length > 0 && store && typeof store.updateSecretKeys === 'function') {
		try {
			await store.updateSecretKeys({ tenantSlug, appSlug, newKeys });
		} catch (_e) { /* non-fatal */ }
	}

	const hostname = (lastRecord && lastRecord.hostname)
		? lastRecord.hostname
		: _defaultHostname({ tenantSlug, appSlug, rootDomain });
	return {
		ok: true,
		mode: 'update',
		versionId,
		url: `https://${hostname}`,
		jobId,
	};
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

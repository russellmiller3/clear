// playground/deploy.js
// Studio-side of the deploy flow. Takes compiled Clear source, packages it
// into a bundle (lib/packaging.js), tars the bundle in memory, POSTs the
// tarball to the builder. Also wires the supporting endpoints: status
// polling, custom domains, release history, rollback, secrets rotation,
// tenant info, Stripe checkout + webhook.
//
// This file does NOT own tenant persistence or Stripe orchestration — it
// holds the HTTP plumbing and delegates to tenants.js and billing.js.

import { createHash, randomBytes } from 'crypto';
import { mkdtempSync, rmSync, readdirSync, readFileSync, statSync } from 'fs';
import { tmpdir } from 'os';
import { join, relative } from 'path';

import { compileProgram } from '../index.js';
import { packageBundle } from '../lib/packaging.js';
import { InMemoryTenantStore, canDeploy, newTenantSlug, overQuota } from './tenants.js';
import {
	createCheckoutSession, verifyStripeWebhook, handleWebhookEvent, setStripeFetchForTest,
} from './billing.js';
import { signTenantJwt, verifyTenantJwt } from './ai-proxy/auth.js';
import { sanitizeAppName, sanitizeAppSlug, sanitizeDomain, assertOwnership, ValidationError, errorCode } from './sanitize.js';
// Phase 7 — Cloudflare Workers for Platforms path. Lazy-import WfpApi so
// tests that never hit CF don't pay the cost and envless setups stay clean.
import { deploySource as deploySourceCloudflare, recordJob, getJob } from './deploy-cloudflare.js';
import { WfpApi } from './wfp-api.js';

// -------- config (read lazily so tests can set env before import chain resolves) --------
function builderUrl() { return process.env.BUILDER_URL || ''; }
function builderSecret() { return process.env.BUILDER_SHARED_SECRET || ''; }
function proxyUrl() { return process.env.PROXY_URL || ''; }
function tenantJwtSecret() { return process.env.TENANT_JWT_SECRET || 'dev-tenant-jwt-secret'; }
// Phase 7 — which backend ships user apps. 'cloudflare' = direct CF API
// path; anything else = legacy Fly builder. Default stays on Fly during
// Phase 7 so existing deploy.test.js mocks keep working. Phase 8 flips
// the default once the real-CF smoke passes.
function deployTarget() { return (process.env.CLEAR_DEPLOY_TARGET || 'fly').toLowerCase(); }

// CC-4 cycle 1 — request-level deploy target switch. The Studio modal
// (cycle 4) lets users pick where to ship per-Publish; ops can still pin
// a default with CLEAR_DEPLOY_TARGET. Body-level switching is the
// "modal exposes a target picker" foundation. Recognized inputs:
//   'cloudflare', 'clear-cloud' → 'cloudflare'
//   'fly', 'fly.io'             → 'fly'
// Anything else throws a ValidationError the route turns into 400 so
// the modal can show "unknown deploy target" instead of routing through
// a default the caller didn't ask for.
const _DEPLOY_TARGET_ALIASES = {
	'cloudflare': 'cloudflare',
	'clear-cloud': 'cloudflare',
	'fly': 'fly',
	'fly.io': 'fly',
};
export function pickDeployTarget(reqBodyOrQuery, env) {
	const raw = reqBodyOrQuery && typeof reqBodyOrQuery === 'object' ? reqBodyOrQuery.target : null;
	if (raw && typeof raw === 'string' && raw.length > 0) {
		const canonical = _DEPLOY_TARGET_ALIASES[raw.toLowerCase()];
		if (canonical) return canonical;
		// Override the default ValidationError message so the route can echo
		// "unknown deploy target: <input>" verbatim into the 400 response.
		const err = new ValidationError('UNKNOWN_TARGET', raw);
		err.message = `unknown deploy target: ${raw}`;
		throw err;
	}
	// Fall back to the env reader. We accept the env directly so this
	// helper stays pure and trivially testable; the route passes
	// process.env so production behavior matches deployTarget().
	const envTarget = (env && env.CLEAR_DEPLOY_TARGET) || 'fly';
	return envTarget.toLowerCase() === 'cloudflare' ? 'cloudflare' : 'fly';
}
function cloudflareRootDomain() { return process.env.CLEAR_CLOUD_ROOT_DOMAIN || 'buildclear.dev'; }
function cloudflareAccountId() { return process.env.CLOUDFLARE_ACCOUNT_ID || ''; }
function cloudflareApiToken() { return process.env.CLOUDFLARE_API_TOKEN || ''; }
function cloudflareNamespace() { return process.env.CLOUDFLARE_DISPATCH_NAMESPACE || 'clear-apps'; }

// Singleton WfpApi. Built lazily the first time the CF dispatch path fires.
// Module-scope cache so multiple deploys in the same process share one
// wrapper (and the same fetch impl).
let _wfpApi = null;
function getWfpApi() {
	if (_wfpApi) return _wfpApi;
	if (!cloudflareApiToken() || !cloudflareAccountId()) {
		throw new Error('Cloudflare target requires CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID');
	}
	_wfpApi = new WfpApi({
		apiToken: cloudflareApiToken(),
		accountId: cloudflareAccountId(),
		namespace: cloudflareNamespace(),
	});
	return _wfpApi;
}
// Test hook — lets deploy-cloudflare integration tests swap in a fake api
// + wipe the singleton between runs.
export function _setWfpApiForTest(api) {
	_wfpApi = api;
}

// -------- tarball packing (pure Node, matches the builder's tar parser) --------
function posixTarBlock(name, body, typeflag = '0') {
	const block = Buffer.alloc(512);
	Buffer.from(name).copy(block, 0, 0, Math.min(name.length, 100));
	const mode = '0000755\0';
	Buffer.from(mode).copy(block, 100);
	const uid = '0000000\0', gid = '0000000\0';
	Buffer.from(uid).copy(block, 108);
	Buffer.from(gid).copy(block, 116);
	const size = (Buffer.isBuffer(body) ? body.length : Buffer.byteLength(body)).toString(8).padStart(11, '0') + '\0';
	Buffer.from(size).copy(block, 124);
	const mtime = Math.floor(Date.now() / 1000).toString(8).padStart(11, '0') + '\0';
	Buffer.from(mtime).copy(block, 136);
	Buffer.from('        ').copy(block, 148); // checksum placeholder
	Buffer.from(typeflag).copy(block, 156, 0, 1);
	Buffer.from('ustar\0').copy(block, 257);
	Buffer.from('00').copy(block, 263);
	// checksum fixup
	let sum = 0;
	for (let i = 0; i < 512; i++) sum += block[i];
	const cksum = sum.toString(8).padStart(6, '0') + '\0 ';
	Buffer.from(cksum).copy(block, 148);
	return block;
}

export function tarDir(dirPath) {
	const parts = [];
	function walk(base) {
		for (const entry of readdirSync(base)) {
			const full = join(base, entry);
			const rel = relative(dirPath, full).split('\\').join('/');
			const st = statSync(full);
			if (st.isDirectory()) { walk(full); continue; }
			const body = readFileSync(full);
			parts.push(posixTarBlock(rel, body, '0'));
			parts.push(body);
			const pad = (512 - (body.length % 512)) % 512;
			if (pad) parts.push(Buffer.alloc(pad));
		}
	}
	walk(dirPath);
	parts.push(Buffer.alloc(1024));
	return Buffer.concat(parts);
}

export function hashSource(source) {
	return createHash('sha256').update(source).digest('hex').slice(0, 8);
}

// -------- tenant session (cookie-based JWT) --------
function readTenantCookie(req) {
	const cookie = req.headers.cookie || '';
	const m = cookie.match(/(?:^|;\s*)clear_tenant=([^;]+)/);
	if (!m) return null;
	const v = verifyTenantJwt(decodeURIComponent(m[1]), tenantJwtSecret());
	return v.ok ? v.payload.sub : null;
}

function setTenantCookie(res, slug) {
	const tok = signTenantJwt(slug, tenantJwtSecret(), 24 * 3600);
	res.setHeader('Set-Cookie', `clear_tenant=${tok}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`);
}

// -------- builder HTTP calls --------
async function postToBuilder(path, method, headers, body) {
	const url = builderUrl();
	if (!url) return { ok: false, status: 503, error: 'BUILDER_URL not configured' };
	const fullUrl = url.replace(/\/$/, '') + path;
	let attempt = 0;
	let lastErr = null;
	while (attempt < 3) {
		attempt++;
		try {
			const res = await fetch(fullUrl, {
				method,
				headers: {
					'Authorization': `Bearer ${builderSecret()}`,
					...(body ? { 'Content-Length': String(body.length) } : {}),
					...(headers || {}),
				},
				body,
			});
			const text = await res.text();
			let json = null;
			try { json = JSON.parse(text); } catch { json = { raw: text }; }
			if (res.status >= 500 && attempt < 3) { lastErr = { status: res.status, json }; continue; }
			return { ok: res.status < 400, status: res.status, json };
		} catch (e) {
			lastErr = e;
			if (attempt >= 3) break;
		}
	}
	return { ok: false, status: 503, error: lastErr?.message || 'builder unreachable' };
}

// -------- public helper: build + post tarball for a source + tenant --------
export async function deploySource({ source, tenantSlug, appSlug, secrets = {}, region = 'iad', useAIProxy = true, existingAppName = null }) {
	const result = compileProgram(source);
	if (result.errors && result.errors.length) return { ok: false, stage: 'compile', errors: result.errors };

	const tempDir = mkdtempSync(join(tmpdir(), 'studio-pkg-'));
	let tar;
	let pkgRes;
	try {
		pkgRes = packageBundle(result, tempDir, { sourceText: source, useAIProxy, appName: appSlug });
		tar = tarDir(tempDir);
	} finally {
		rmSync(tempDir, { recursive: true, force: true });
	}

	if (tar.length > 50 * 1024 * 1024) return { ok: false, stage: 'package', reason: 'bundle > 50MB' };

	const autoSecrets = { ...secrets };
	if (useAIProxy && pkgRes.aiCallsDetected) {
		autoSecrets.CLEAR_AI_URL = `${proxyUrl()}/claude`;
		autoSecrets.CLEAR_AI_TENANT_JWT = signTenantJwt(tenantSlug, tenantJwtSecret(), 90 * 24 * 3600);
	}

	const builderRes = await postToBuilder('/build', 'POST', {
		'Content-Type': 'application/octet-stream',
		'x-tenant-slug': tenantSlug,
		'x-app-slug': appSlug,
		'x-db-backend': pkgRes.dbBackend,
		'x-region': region,
		'x-secrets': Buffer.from(JSON.stringify(autoSecrets)).toString('base64'),
		...(existingAppName ? { 'x-app-name': existingAppName } : {}),
	}, tar);

	if (!builderRes.ok) return { ok: false, stage: 'builder', status: builderRes.status, error: builderRes.json?.reason || builderRes.error };
	return { ok: true, jobId: builderRes.json?.jobId, needsSecrets: pkgRes.needsSecrets, aiCallsDetected: pkgRes.aiCallsDetected };
}

// -------- shared deploy deps (for sibling modules that need the same
// store + CF API the /api/deploy route uses). Populated by wireDeploy.
// Used by the Live App Editing widget's cloud-ship path so it doesn't
// construct a second InMemoryTenantStore with an empty cfDeploys map. --
let _sharedStore = null;
let _sharedRootDomain = null;
export function getDeployDeps() {
	if (!_sharedStore) return null;
	return {
		store: _sharedStore,
		api: getWfpApi(),
		rootDomain: _sharedRootDomain || cloudflareRootDomain(),
	};
}

// -------- wire endpoints into an Express app --------
export function wireDeploy(app, opts = {}) {
	const store = opts.store || new InMemoryTenantStore();
	const priceId = opts.priceId || process.env.STRIPE_PRICE_PRO_99 || 'price_pro_99';
	// Record the store + root domain into module-scope so getDeployDeps can
	// surface them to sibling modules (LAE widget, etc.) without any of the
	// parties constructing their own duplicate.
	_sharedStore = store;
	_sharedRootDomain = cloudflareRootDomain();

	async function requireTenant(req, res) {
		const slug = readTenantCookie(req);
		if (!slug) { res.status(401).json({ ok: false, error: 'no tenant session' }); return null; }
		const t = await store.get(slug);
		if (!t) { res.status(401).json({ ok: false, error: 'unknown tenant' }); return null; }
		return t;
	}

	// For tests: allow seeding tenants directly.
	app.post('/api/_test/seed-tenant', async (req, res) => {
		if (process.env.NODE_ENV !== 'test' && !process.env.CLEAR_ALLOW_SEED) return res.status(404).end();
		const { slug, plan = 'pro' } = req.body;
		await store.upsert(slug, { slug, plan, apps_deployed: 0, ai_spent_cents: 0, ai_credit_cents: 1000 });
		setTenantCookie(res, slug);
		res.json({ ok: true, slug });
	});

	// CC-4 cycle 5 — test-only endpoint to install a built-in fake WfpApi
	// inside this running server's _wfpApi singleton. Without this the deploy
	// path tries to talk to real Cloudflare and 503s when the API token is
	// missing. Body {reset:true} clears the singleton back to the real lazy
	// getter; otherwise the default fake walks the orchestrator pipeline
	// (provisionD1 → applyMigrations → uploadScript → setSecrets →
	// attachDomain) and returns the same shape the real wrapper does. The
	// fake is HARD-CODED here on purpose — accepting arbitrary fake bodies
	// over the wire would let any caller in test mode redirect deploys to
	// arbitrary code. Mirrors makeFakeWfpApiForDeployTest in deploy.test.js.
	app.post('/api/_test/inject-wfp-api', async (req, res) => {
		if (process.env.NODE_ENV !== 'test' && !process.env.CLEAR_ALLOW_SEED) return res.status(404).end();
		if (req.body && req.body.reset === true) {
			_setWfpApiForTest(null);
			return res.json({ ok: true, reset: true });
		}
		const calls = [];
		const fake = {
			calls,
			provisionD1: async (p) => { calls.push({ op: 'provisionD1', tenantSlug: p.tenantSlug, appSlug: p.appSlug }); return { ok: true, d1_database_id: 'd1-test', name: `${p.tenantSlug}-${p.appSlug}` }; },
			applyMigrations: async () => { calls.push({ op: 'applyMigrations' }); return { ok: true }; },
			uploadScript: async (p) => { calls.push({ op: 'uploadScript', scriptName: p.scriptName }); return { ok: true, result: { id: 'script-id' } }; },
			setSecrets: async () => { calls.push({ op: 'setSecrets' }); return { ok: true, failed: [] }; },
			attachDomain: async (p) => { calls.push({ op: 'attachDomain', hostname: p.hostname }); return { ok: true }; },
			deleteScript: async () => ({ ok: true }),
			listVersions: async () => ({ ok: true, versions: [] }),
			rollbackToVersion: async () => ({ ok: true }),
		};
		_setWfpApiForTest(fake);
		res.json({ ok: true, injected: true });
	});

	// CC-4 cycle 5 — test-only endpoint to read the multi-tenant subdomain
	// binding the orchestrator wrote during deploy. Returns the same JSON
	// the dev-mode subdomain router would resolve against, so the smoke test
	// can assert the binding landed without reaching into module state.
	app.get('/api/_test/lookup-subdomain/:sub', async (req, res) => {
		if (process.env.NODE_ENV !== 'test' && !process.env.CLEAR_ALLOW_SEED) return res.status(404).end();
		const row = await store.lookupAppBySubdomain(req.params.sub);
		res.json(row);
	});

	// Deploy
	app.post('/api/deploy', async (req, res) => {
		const tenant = await requireTenant(req, res);
		if (!tenant) return;
		const check = canDeploy(tenant);
		if (!check.ok) return res.status(402).json({ ok: false, error: check.reason });

		const { source, appSlug, secrets, domain } = req.body || {};
		if (!source || !appSlug) return res.status(400).json({ ok: false, error: 'missing source or appSlug' });

		try { sanitizeAppSlug(appSlug); }
		catch (e) { return res.status(400).json({ ok: false, code: errorCode(e), input: e.input }); }
		if (domain) {
			try { sanitizeDomain(domain); }
			catch (e) { return res.status(400).json({ ok: false, code: errorCode(e), input: e.input }); }
		}

		// CC-4 cycle 1 — body.target wins over env so the Studio modal can
		// pick per-Publish; ops still pin the default with CLEAR_DEPLOY_TARGET.
		// Unknown body.target → 400 with "unknown deploy target".
		let resolvedTarget;
		try { resolvedTarget = pickDeployTarget(req.body, process.env); }
		catch (e) {
			if (e.code === 'UNKNOWN_TARGET') {
				return res.status(400).json({ ok: false, error: `unknown deploy target: ${e.input}`, code: errorCode(e) });
			}
			throw e;
		}

		// Phase 7.10 — dispatch on resolved target. Cloudflare Workers for
		// Platforms path uses direct CF API calls and native workflows; the
		// Fly path (legacy) tars the bundle and POSTs to the builder machine.
		// Response shape stays identical so the UI never notices.
		if (resolvedTarget === 'cloudflare') {
			let api;
			try { api = getWfpApi(); }
			catch (e) { return res.status(503).json({ ok: false, error: e.message }); }
			const r = await deploySourceCloudflare({
				source,
				tenantSlug: tenant.slug,
				appSlug,
				secrets: secrets || {},
				customDomain: domain || null,
				api,
				store,
				rootDomain: cloudflareRootDomain(),
				// CF doesn't expose D1 delete via the wrapper today — pass a
				// no-op so the rollback ladder still runs without throwing.
				// Real delete is tracked in reconcile-wfp.js meanwhile.
				deleteD1: async () => ({ ok: true, skipped: true }),
			});
			// Stash the job snapshot so /api/deploy-status can serve it.
			if (r.jobId) {
				recordJob(r.jobId, r.ok
					? { status: 'ok', url: r.url, degraded: r.degraded || false }
					: { status: 'failed', stage: r.stage, error: r.error || r.errors || null });
			}
			if (!r.ok) {
				if (r.conflict) return res.status(409).json({ ok: false, existingJobId: r.existingJobId, hint: r.hint });
				if (r.stage === 'compile') return res.status(400).json({ ok: false, stage: 'compile', errors: r.errors });
				if (r.stage === 'record') {
					// Partial success — app IS live, just not recorded yet. UI shows
					// the URL and tells user to refresh after reconcile catches up.
					return res.status(500).json({ ok: false, stage: 'record', liveUrl: r.liveUrl, reason: r.reason });
				}
				return res.status(502).json({ ok: false, stage: r.stage, error: r.error || 'Cloudflare deploy failed' });
			}
			await store.incrementAppsDeployed(tenant.slug);
			// CC-4 cycle 2 — one-line tail for the smoke runbook. The orchestrator
			// already wrote the cfDeploys row via markAppDeployed; this log is the
			// "yes, the multi-tenant subdomain binding landed" breadcrumb. grep
			// for `[cc-4] bound` in Studio's stdout to confirm the binding step
			// fired before the response goes out.
			try {
				const boundHost = (r.url || '').replace(/^https?:\/\//, '');
				console.log(`[cc-4] bound ${tenant.slug}/${appSlug} -> ${boundHost}`);
			} catch { /* logging never breaks the response */ }
			return res.json({ ok: true, jobId: r.jobId, url: r.url, degraded: r.degraded || false });
		}

		// Legacy Fly builder path.
		const existingAppName = await store.appNameFor(tenant.slug, appSlug);
		const r = await deploySource({
			source, tenantSlug: tenant.slug, appSlug,
			secrets: secrets || {}, existingAppName, useAIProxy: true,
		});
		if (!r.ok && r.needsSecrets?.length && !req.body.secrets) {
			return res.status(400).json({ ok: false, needsSecrets: r.needsSecrets });
		}
		if (!r.ok) {
			if (r.stage === 'builder' && r.status === 503) return res.status(503).json({ ok: false, error: 'Deploy service down — try again in a minute.' });
			if (r.stage === 'package' && /50MB/.test(r.reason || '')) return res.status(413).json({ ok: false, error: r.reason });
			return res.status(400).json({ ok: false, ...r });
		}
		await store.incrementAppsDeployed(tenant.slug);
		res.json({ ok: true, jobId: r.jobId });
	});

	app.get('/api/deploy-status/:jobId', async (req, res) => {
		const tenant = await requireTenant(req, res);
		if (!tenant) return;
		// CC-4 cycle 1 — symmetrical with POST /api/deploy: read target from
		// query string (`?target=cloudflare`), fall back to env. The modal
		// can stamp the same target on the polling URL it picked at submit.
		let resolvedTarget;
		try { resolvedTarget = pickDeployTarget(req.query, process.env); }
		catch (e) {
			if (e.code === 'UNKNOWN_TARGET') {
				return res.status(400).json({ ok: false, error: `unknown deploy target: ${e.input}`, code: errorCode(e) });
			}
			throw e;
		}
		// Phase 7.11 — CF path reads job status from the in-memory map that
		// /api/deploy populated. Jobs are short-lived (deploy is ~5-8s sync)
		// so no persistent store — if the process restarts mid-deploy, the
		// client re-polls once and the jobId won't exist; they'd have seen
		// the URL in the original POST response anyway.
		if (resolvedTarget === 'cloudflare') {
			const job = getJob(req.params.jobId);
			if (!job) return res.status(404).json({ ok: false, error: 'Unknown jobId' });
			return res.json({ ok: true, ...job });
		}
		const r = await postToBuilder(`/status/${encodeURIComponent(req.params.jobId)}`, 'GET');
		res.status(r.status || 200).json(r.json || { ok: false });
	});

	app.post('/api/custom-domain', async (req, res) => {
		const tenant = await requireTenant(req, res);
		if (!tenant) return;
		const { appName, domain } = req.body || {};
		if (!appName || !domain) return res.status(400).json({ ok: false, error: 'missing fields' });
		try {
			sanitizeAppName(appName);
			sanitizeDomain(domain);
			assertOwnership(tenant.slug, appName);
		} catch (e) { return res.status(e.code === 'CROSS_TENANT' ? 403 : 400).json({ ok: false, code: errorCode(e) }); }
		// Phase 7.13 — CF path attaches the domain via the script domains
		// endpoint. 409 surfaces as DOMAIN_TAKEN; non-409 as DOMAIN_ATTACH_FAILED.
		if (deployTarget() === 'cloudflare') {
			let api;
			try { api = getWfpApi(); }
			catch (e) { return res.status(503).json({ ok: false, error: e.message }); }
			const r = await api.attachDomain({ scriptName: appName, hostname: domain });
			if (!r.ok) return res.status(r.code === 'DOMAIN_TAKEN' ? 409 : 502).json({ ok: false, code: r.code });
			return res.json({ ok: true, hostname: domain });
		}
		const body = Buffer.from(JSON.stringify({ appName, domain, tenantSlug: tenant.slug }));
		const r = await postToBuilder('/cert', 'POST', { 'Content-Type': 'application/json' }, body);
		res.status(r.status || 200).json(r.json || { ok: false });
	});

	app.get('/api/deploy-history/:app', async (req, res) => {
		const tenant = await requireTenant(req, res);
		if (!tenant) return;
		const appName = req.params.app;
		try { sanitizeAppName(appName); assertOwnership(tenant.slug, appName); }
		catch (e) { return res.status(e.code === 'CROSS_TENANT' ? 403 : 400).json({ ok: false, code: errorCode(e) }); }
		const r = await postToBuilder(`/releases/${encodeURIComponent(appName)}`, 'GET', {
			'x-tenant-slug': tenant.slug,
		});
		res.status(r.status || 200).json(r.json || { ok: false });
	});

	app.post('/api/rollback', async (req, res) => {
		const tenant = await requireTenant(req, res);
		if (!tenant) return;
		const { appName, version } = req.body || {};
		if (!appName || !version) return res.status(400).json({ ok: false, error: 'missing fields' });
		try { sanitizeAppName(appName); assertOwnership(tenant.slug, appName); }
		catch (e) { return res.status(e.code === 'CROSS_TENANT' ? 403 : 400).json({ ok: false, code: errorCode(e) }); }
		// Phase 7.12 — CF path uses the dispatch namespace script-versions API
		// to promote a previous version to 100%.
		if (deployTarget() === 'cloudflare') {
			let api;
			try { api = getWfpApi(); }
			catch (e) { return res.status(503).json({ ok: false, error: e.message }); }
			try {
				await api.rollbackToVersion({ scriptName: appName, versionId: version });
				return res.json({ ok: true });
			} catch (e) {
				return res.status(e.status || 500).json({ ok: false, error: e.message });
			}
		}
		const body = Buffer.from(JSON.stringify({ appName, version, tenantSlug: tenant.slug }));
		const r = await postToBuilder('/rollback', 'POST', { 'Content-Type': 'application/json' }, body);
		res.status(r.status || 200).json(r.json || { ok: false });
	});

	app.post('/api/secrets', async (req, res) => {
		const tenant = await requireTenant(req, res);
		if (!tenant) return;
		return res.status(501).json({ ok: false, error: 'secrets rotation: re-deploy to pick up rotated secrets (v1)' });
	});

	// Tenant info for UI badge
	app.get('/api/tenant', async (req, res) => {
		const tenant = await requireTenant(req, res);
		if (!tenant) return;
		res.json({
			ok: true,
			slug: tenant.slug,
			plan: tenant.plan,
			apps_deployed: tenant.apps_deployed || 0,
			ai_spent_cents: tenant.ai_spent_cents || 0,
			ai_credit_cents: tenant.ai_credit_cents || 0,
			grace_expires_at: tenant.grace_expires_at || null,
		});
	});

	// Stripe checkout + webhook
	app.post('/api/checkout-session', async (req, res) => {
		const { email } = req.body || {};
		const origin = req.headers.origin || `http://localhost:${process.env.PORT || 3456}`;
		const r = await createCheckoutSession({
			priceId,
			successUrl: `${origin}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
			cancelUrl: `${origin}/?checkout=cancelled`,
			customerEmail: email,
		});
		if (!r.ok) return res.status(502).json(r);
		res.json({ ok: true, url: r.url });
	});

	// Stripe webhook — must accept raw body for signature verification.
	// Caller should mount this endpoint BEFORE express.json() or use a raw
	// middleware. For now we re-serialize because the existing server uses
	// express.json globally; signature verify still works because we sign
	// the canonical JSON we get back from req.body.
	app.post('/api/stripe-webhook', async (req, res) => {
		const raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
		const sig = req.headers['stripe-signature'];
		const v = verifyStripeWebhook(raw, sig);
		if (!v.ok) return res.status(400).json({ ok: false, error: v.reason });
		const r = await handleWebhookEvent(v.event, store);
		if (r.ok && r.slug && r.plan !== 'cancelled') setTenantCookie(res, r.slug);
		res.json(r);
	});

	return { store, setStripeFetchForTest };
}

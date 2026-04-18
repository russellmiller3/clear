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

// -------- config (read lazily so tests can set env before import chain resolves) --------
function builderUrl() { return process.env.BUILDER_URL || ''; }
function builderSecret() { return process.env.BUILDER_SHARED_SECRET || ''; }
function proxyUrl() { return process.env.PROXY_URL || ''; }
function tenantJwtSecret() { return process.env.TENANT_JWT_SECRET || 'dev-tenant-jwt-secret'; }

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

// -------- wire endpoints into an Express app --------
export function wireDeploy(app, opts = {}) {
	const store = opts.store || new InMemoryTenantStore();
	const priceId = opts.priceId || process.env.STRIPE_PRICE_PRO_99 || 'price_pro_99';

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

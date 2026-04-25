// playground/tenants.js
// Tenant model — one row per paying customer. Studio is stateless today;
// this file introduces the first persistent record. The store interface
// lets tests run with an in-memory map, while production uses Postgres.
//
// Slug format: `clear-<6-random-hex>`. Never customer-chosen — we control
// it because it becomes part of every deployed-app hostname.

import { randomBytes } from 'crypto';
import { PLANS, planFor } from './plans.js';

// Cap the versions[] array per app at this many entries. Full history still
// lives on Cloudflare's side (CF keeps versions until explicitly deleted) —
// we just don't offer UI rollback past 20. Simpler schema, fits a single
// in-memory object, easy to serialize when tenant store gets persisted.
export const MAX_VERSIONS_PER_APP = 20;

export class InMemoryTenantStore {
	constructor() {
		this.tenants = new Map();
		this.appsByTenant = new Map();
		this.stripeEvents = new Set();
	}
	async create({ slug, stripeCustomerId, plan = 'pro' }) {
		const p = planFor(plan);
		const row = {
			slug,
			stripe_customer_id: stripeCustomerId,
			plan,
			apps_deployed: 0,
			ai_spent_cents: 0,
			ai_credit_cents: p.aiCreditCents,
			created_at: new Date().toISOString(),
			grace_expires_at: null,
		};
		this.tenants.set(slug, row);
		return row;
	}
	async upsert(slug, patch) {
		const existing = this.tenants.get(slug) || {};
		const merged = { ...existing, ...patch, slug };
		this.tenants.set(slug, merged);
		return merged;
	}
	async get(slug) { return this.tenants.get(slug) || null; }
	async getByStripeCustomer(id) {
		for (const t of this.tenants.values()) if (t.stripe_customer_id === id) return t;
		return null;
	}
	async incrementAppsDeployed(slug) {
		const t = this.tenants.get(slug);
		if (!t) return null;
		t.apps_deployed = (t.apps_deployed || 0) + 1;
		return t;
	}
	async setPlan(slug, plan, graceExpiresAt = null) {
		const t = this.tenants.get(slug);
		if (!t) return null;
		t.plan = plan;
		t.grace_expires_at = graceExpiresAt;
		return t;
	}
	async recordApp(slug, appSlug, appName) {
		const key = `${slug}/${appSlug}`;
		this.appsByTenant.set(key, appName);
		return appName;
	}
	async appNameFor(slug, appSlug) {
		return this.appsByTenant.get(`${slug}/${appSlug}`) || null;
	}
	// Private key builder — used by markAppDeployed, getAppRecord,
	// recordVersion, updateSecretKeys. All per-app state lives under
	// `<tenantSlug>/<appSlug>` in cfDeploys.
	_appKey(tenantSlug, appSlug) {
		return `${tenantSlug}/${appSlug}`;
	}

	// Phase 7.7 — after a successful CF deploy, record script name + d1 id +
	// hostname so we can cross-reference against CF in the reconcile job.
	//
	// LAE Phase B extension: optionally accept `versionId`, `sourceHash`,
	// `migrationsHash` to seed the `versions[]` array with the initial
	// deploy's version, and `secretKeys: string[]` to track which secret
	// KEY NAMES (never values) have been set. All five are optional for
	// backward compat with the Phase 7 call sites; new code paths pass them.
	async markAppDeployed({
		tenantSlug, appSlug, scriptName, d1_database_id, hostname,
		versionId = null, sourceHash = null, migrationsHash = null, secretKeys = null,
	}) {
		if (!this.cfDeploys) this.cfDeploys = new Map();
		const key = this._appKey(tenantSlug, appSlug);
		const row = {
			tenantSlug, appSlug, scriptName, d1_database_id, hostname,
			deployedAt: new Date().toISOString(),
			versions: [],
			secretKeys: Array.isArray(secretKeys) ? [...secretKeys] : [],
		};
		if (versionId) {
			row.versions.push({
				versionId,
				uploadedAt: row.deployedAt,
				sourceHash,
				migrationsHash,
			});
		}
		this.cfDeploys.set(key, row);
		// Keep appNameFor working by dual-writing the scriptName there too.
		this.appsByTenant.set(key, scriptName);
		return { ok: true };
	}

	// LAE Phase B — lookup the full per-app state row. Returns a shallow
	// copy with `versions` sorted newest-first (by uploadedAt) so callers
	// can treat versions[0] as "the most recent version" without sorting.
	// Original storage remains insertion-order so recordVersion's append +
	// cap logic stays simple. Returns null for unknown (tenantSlug, appSlug).
	async getAppRecord(tenantSlug, appSlug) {
		if (!this.cfDeploys) return null;
		const key = this._appKey(tenantSlug, appSlug);
		const raw = this.cfDeploys.get(key);
		if (!raw) return null;
		const versions = Array.isArray(raw.versions) ? [...raw.versions] : [];
		versions.sort((a, b) => {
			const ta = Date.parse(a.uploadedAt || '') || 0;
			const tb = Date.parse(b.uploadedAt || '') || 0;
			return tb - ta; // descending = newest first
		});
		return {
			...raw,
			versions,
			secretKeys: Array.isArray(raw.secretKeys) ? [...raw.secretKeys] : [],
		};
	}

	// LAE Phase B — append a new version to the app's versions[]. Trims
	// oldest entries once the array exceeds MAX_VERSIONS_PER_APP. Rejects
	// with APP_NOT_FOUND if markAppDeployed was never called for this
	// (tenantSlug, appSlug) — forces the happy-path sequencing.
	async recordVersion({ tenantSlug, appSlug, versionId, uploadedAt, sourceHash, migrationsHash, note, via }) {
		if (!this.cfDeploys) return { ok: false, code: 'APP_NOT_FOUND' };
		const key = this._appKey(tenantSlug, appSlug);
		const row = this.cfDeploys.get(key);
		if (!row) return { ok: false, code: 'APP_NOT_FOUND' };
		if (!Array.isArray(row.versions)) row.versions = [];
		row.versions.push({
			versionId,
			uploadedAt: uploadedAt || new Date().toISOString(),
			sourceHash: sourceHash || null,
			migrationsHash: migrationsHash || null,
			...(note ? { note } : {}),
			...(via ? { via } : {}),
		});
		if (row.versions.length > MAX_VERSIONS_PER_APP) {
			// Sort by uploadedAt ascending, keep the newest MAX_VERSIONS_PER_APP.
			row.versions.sort((a, b) => {
				const ta = Date.parse(a.uploadedAt || '') || 0;
				const tb = Date.parse(b.uploadedAt || '') || 0;
				return ta - tb;
			});
			row.versions.splice(0, row.versions.length - MAX_VERSIONS_PER_APP);
		}
		return { ok: true };
	}

	// LAE Phase B — append new secret KEY NAMES to the app's secretKeys
	// list. Dedupes — existing keys stay in their original position, new
	// keys append. SECURITY: this function only ever stores key NAMES;
	// actual secret values flow through setSecrets on CF and never touch
	// tenants-db.
	async updateSecretKeys({ tenantSlug, appSlug, newKeys }) {
		if (!this.cfDeploys) return { ok: false, code: 'APP_NOT_FOUND' };
		const key = this._appKey(tenantSlug, appSlug);
		const row = this.cfDeploys.get(key);
		if (!row) return { ok: false, code: 'APP_NOT_FOUND' };
		if (!Array.isArray(row.secretKeys)) row.secretKeys = [];
		const existing = new Set(row.secretKeys);
		for (const k of (newKeys || [])) {
			if (typeof k === 'string' && !existing.has(k)) {
				row.secretKeys.push(k);
				existing.add(k);
			}
		}
		return { ok: true };
	}
	// CC-1 — multi-tenant subdomain routing. Given the subdomain extracted
	// from a Host header (e.g. `acme-deals` from `acme-deals.buildclear.dev`),
	// return the deployed-app row that owns it. The hostname field is set by
	// markAppDeployed at deploy time, so this is an O(N) scan of cfDeploys
	// keyed on the leading label of the stored hostname. In production the
	// scan moves to a Postgres index on hostname; the in-memory store is the
	// dev path.
	//
	// Returns the full row (script + d1 + tenantSlug + appSlug + hostname +
	// versions[] + secretKeys[]) or null when nothing matches.
	async lookupAppBySubdomain(subdomain) {
		if (!subdomain || !this.cfDeploys) return null;
		const target = subdomain.toLowerCase();
		for (const row of this.cfDeploys.values()) {
			const host = (row.hostname || '').toLowerCase();
			const dot = host.indexOf('.');
			const head = dot === -1 ? host : host.slice(0, dot);
			if (head === target) return { ...row };
		}
		return null;
	}

	// Phase 7.7c — reconcile job calls this to get the full known-apps view.
	// Returns two sets so the caller can diff against CF listings.
	async loadKnownApps() {
		const scripts = new Set();
		const databases = new Set();
		if (this.cfDeploys) {
			for (const row of this.cfDeploys.values()) {
				if (row.scriptName) scripts.add(row.scriptName);
				if (row.d1_database_id) databases.add(row.d1_database_id);
			}
		}
		return { scripts, databases };
	}
	async seenStripeEvent(eventId) {
		return this.stripeEvents.has(eventId);
	}
	async recordStripeEvent(eventId) {
		this.stripeEvents.add(eventId);
	}
}

export function newTenantSlug() {
	return `clear-${randomBytes(3).toString('hex')}`;
}

export function overQuota(tenant) {
	const limit = planFor(tenant.plan).appsLimit;
	return (tenant.apps_deployed || 0) >= limit;
}

export function canDeploy(tenant) {
	if (!tenant) return { ok: false, reason: 'no tenant' };
	if (tenant.plan === 'cancelled') return { ok: false, reason: 'subscription cancelled' };
	if (tenant.plan === 'past_due') {
		const grace = tenant.grace_expires_at ? new Date(tenant.grace_expires_at).getTime() : 0;
		if (Date.now() > grace) return { ok: false, reason: 'payment past due' };
	}
	if (overQuota(tenant)) return { ok: false, reason: 'plan limit reached' };
	return { ok: true };
}

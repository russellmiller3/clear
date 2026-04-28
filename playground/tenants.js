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

// LAE Phase C — cap the audit log per app. Real apps see ~10 destructive
// ships ever; 200 is 20× the realistic ceiling. 1000 would cost ~50 KB/app
// for no benefit. Trim happens on append (oldest first); mark NEVER trims
// because a pending row in flight must never disappear before the ship
// outcome is recorded. (Locked-in decision #2 in plans/plan-lae-phase-c.)
export const MAX_AUDIT_PER_APP = 200;

function _bundleParam(lastBundle) {
	if (lastBundle === undefined || lastBundle === null) return null;
	return JSON.stringify(lastBundle);
}

function _bundleValue(value) {
	if (value === undefined || value === null) return null;
	if (typeof value === 'string') {
		try { return JSON.parse(value); }
		catch { return null; }
	}
	return value;
}

// CC-1 cycle 8 — map DB row → in-memory audit shape. The in-memory store
// stores camelCase keys (auditId, sourceHashBefore, etc.) and only emits
// optional fields when they were provided (so tests can use deep-equal on
// minimal inputs). Mirror that shape exactly.
function _mapAuditRow(row) {
	const out = {
		auditId: String(row.id),
		ts: row.ts instanceof Date ? row.ts.toISOString() : row.ts,
		actor: row.actor,
		action: row.action,
		verdict: row.verdict,
		sourceHashBefore: row.source_hash_before,
		sourceHashAfter: row.source_hash_after,
		status: row.status,
	};
	if (row.note !== null && row.note !== undefined) out.note = row.note;
	if (row.kind !== null && row.kind !== undefined) out.kind = row.kind;
	if (row.before !== null && row.before !== undefined) out.before = row.before;
	if (row.after !== null && row.after !== undefined) out.after = row.after;
	if (row.reason !== null && row.reason !== undefined) out.reason = row.reason;
	if (row.ip !== null && row.ip !== undefined) out.ip = row.ip;
	if (row.user_agent !== null && row.user_agent !== undefined) out.userAgent = row.user_agent;
	if (row.version_id !== null && row.version_id !== undefined) out.versionId = row.version_id;
	if (row.error !== null && row.error !== undefined) out.error = row.error;
	return out;
}

export class InMemoryTenantStore {
	constructor() {
		this.tenants = new Map();
		this.appsByTenant = new Map();
		this.stripeEvents = new Set();
		// Monotonic counter for auditId uniqueness — combined with Date.now()
		// in appendAuditEntry. The counter handles the case where two appends
		// land in the same millisecond (rare in production, common in tight
		// test loops). In-memory only — Postgres will use a SERIAL column.
		this._auditCounter = 0;
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
		lastBundle = null,
	}) {
		if (!this.cfDeploys) this.cfDeploys = new Map();
		const key = this._appKey(tenantSlug, appSlug);
		const row = {
			tenantSlug, appSlug, scriptName, d1_database_id, hostname,
			deployedAt: new Date().toISOString(),
			versions: [],
			secretKeys: Array.isArray(secretKeys) ? [...secretKeys] : [],
			lastBundle: lastBundle || null,
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
	async recordVersion({ tenantSlug, appSlug, versionId, uploadedAt, sourceHash, migrationsHash, note, via, lastBundle }) {
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
		if (lastBundle !== undefined) row.lastBundle = lastBundle || null;
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

	// LAE-8 — audit log per app. Every widget Ship writes a row here; Phase
	// C destructive flows write rows that double as the GDPR/CCPA/HIPAA
	// accountability surface (no data snapshot — this row IS the receipt).
	//
	// LAE Phase C cycle 3 — capped at MAX_AUDIT_PER_APP=200 (real apps see
	// ~10 destructive ships ever; 200 is 20× the realistic ceiling). Trim
	// happens on append only — markAuditEntry NEVER trims, because that
	// could lose a `pending` row mid-flight before the ship outcome is
	// recorded. getAuditLog returns rows newest-first so widget renders
	// most-recent first without sorting.
	async getAuditLog(tenantSlug, appSlug) {
		if (!this.cfDeploys) return [];
		const key = this._appKey(tenantSlug, appSlug);
		const row = this.cfDeploys.get(key);
		if (!row || !Array.isArray(row.auditLog)) return [];
		// Shallow copy + sort newest-first by ts. Storage stays insertion-
		// order; this matches the getAppRecord(versions) pattern.
		// Secondary sort on the auditId counter suffix breaks ties when
		// many rows land in the same millisecond (tight loops, batched
		// destructive ships) — without this, the sort is non-deterministic
		// for same-ts rows and the "newest-first" guarantee leaks.
		const rows = row.auditLog.map(e => ({ ...e }));
		const counterOf = (id) => {
			if (typeof id !== 'string') return 0;
			const dash = id.lastIndexOf('-');
			if (dash === -1) return 0;
			const n = Number(id.slice(dash + 1));
			return Number.isFinite(n) ? n : 0;
		};
		rows.sort((a, b) => {
			const ta = Date.parse(a.ts || '') || 0;
			const tb = Date.parse(b.ts || '') || 0;
			if (tb !== ta) return tb - ta; // primary: newest ts first
			return counterOf(b.auditId) - counterOf(a.auditId); // tie: higher counter wins
		});
		return rows;
	}

	// Build a deterministic-ish auditId. Timestamp + monotonic counter is
	// enough for in-memory uniqueness; Postgres will use a SERIAL column.
	// The format `aud-<ts>-<n>` is grep-friendly in test output and logs.
	_nextAuditId() {
		this._auditCounter = (this._auditCounter || 0) + 1;
		return `aud-${Date.now()}-${this._auditCounter}`;
	}

	// LAE Phase C cycle 3 — extended schema. New optional fields:
	//   kind        — classifier change kind ('remove_field', 'drop_endpoint', etc.)
	//   before/after — TINY diff hunks only (never full source — keeps row bounded)
	//   reason      — owner's typed reason for the destructive change
	//   ip          — owner's IP at ship time
	//   userAgent   — owner's UA at ship time
	//   status      — 'pending' | 'shipped' | 'ship-failed' (defaults to 'shipped')
	//
	// Defaulting status to 'shipped' keeps Phase D non-destructive callers
	// unchanged. Destructive callers pass status:'pending' explicitly, then
	// markAuditEntry flips it to 'shipped' or 'ship-failed' after the ship
	// attempt. This is the audit-first ordering locked-in decision #4.
	//
	// Returns {ok:true, auditId} so the caller can update the row later.
	// Trims oldest entries past MAX_AUDIT_PER_APP — never trims pending
	// rows specifically (FIFO trim, no status awareness), but the cap is
	// 20× realistic ceiling so the only way you hit it is malicious load.
	async appendAuditEntry({
		tenantSlug, appSlug,
		actor, action, verdict,
		sourceHashBefore, sourceHashAfter, note,
		kind, before, after, reason, ip, userAgent, status,
	}) {
		if (!this.cfDeploys) return { ok: false, code: 'APP_NOT_FOUND' };
		const key = this._appKey(tenantSlug, appSlug);
		const row = this.cfDeploys.get(key);
		if (!row) return { ok: false, code: 'APP_NOT_FOUND' };
		if (!Array.isArray(row.auditLog)) row.auditLog = [];
		const auditId = this._nextAuditId();
		const entry = {
			auditId,
			ts: new Date().toISOString(),
			actor: actor || 'unknown',
			action: action || 'unknown',
			verdict: verdict || null,
			sourceHashBefore: sourceHashBefore || null,
			sourceHashAfter: sourceHashAfter || null,
			status: status || 'shipped',
			...(note !== undefined && note !== null ? { note } : {}),
			...(kind !== undefined && kind !== null ? { kind } : {}),
			...(before !== undefined && before !== null ? { before } : {}),
			...(after !== undefined && after !== null ? { after } : {}),
			...(reason !== undefined && reason !== null ? { reason } : {}),
			...(ip !== undefined && ip !== null ? { ip } : {}),
			...(userAgent !== undefined && userAgent !== null ? { userAgent } : {}),
		};
		row.auditLog.push(entry);
		// Trim oldest if we exceed the cap. FIFO — first-in is the oldest
		// because the array is insertion-order. Cap only applies on append
		// (never on mark), so a pending row in flight can't disappear.
		if (row.auditLog.length > MAX_AUDIT_PER_APP) {
			row.auditLog.splice(0, row.auditLog.length - MAX_AUDIT_PER_APP);
		}
		return { ok: true, auditId };
	}

	// LAE Phase C cycle 3 — in-place update for an existing audit row. Used
	// by the destructive ship endpoint to flip 'pending' → 'shipped' (with
	// versionId) on success, or → 'ship-failed' (with error) on failure.
	// Find by auditId; merge the explicit fields; leave the rest. Never
	// trims (the trim story is "append-only" from the cap's perspective —
	// marks update an existing row in place, they don't add a new one).
	//
	// Returns {ok:true} on success or {ok:false, code:'AUDIT_NOT_FOUND'}
	// when the auditId doesn't match any row in this app's log.
	async markAuditEntry({ auditId, status, versionId, error }) {
		if (!this.cfDeploys) return { ok: false, code: 'AUDIT_NOT_FOUND' };
		// Scan every app's auditLog for a row with this auditId. In production
		// this would be a single index lookup; in-memory is O(N apps × M rows)
		// which is fine since both are tiny.
		for (const row of this.cfDeploys.values()) {
			if (!Array.isArray(row.auditLog)) continue;
			const target = row.auditLog.find(e => e.auditId === auditId);
			if (target) {
				if (status !== undefined && status !== null) target.status = status;
				if (versionId !== undefined && versionId !== null) target.versionId = versionId;
				if (error !== undefined && error !== null) target.error = error;
				return { ok: true };
			}
		}
		return { ok: false, code: 'AUDIT_NOT_FOUND' };
	}
}

/**
 * CC-1 (Postgres path) — production tenant store skeleton.
 *
 * Mirrors the in-memory store's surface so callers can swap backends with
 * zero code-site changes. Every method here throws `NOT_IMPLEMENTED` with
 * the SQL the production version will run, so a future session has a 1:1
 * shopping list rather than re-deriving the schema from `cfDeploys` shape.
 *
 * Wiring contract (the surface every backend must implement):
 *   - create({ slug, stripeCustomerId, plan })       → row
 *   - upsert(slug, patch)                            → row
 *   - get(slug)                                      → row | null
 *   - getByStripeCustomer(id)                        → row | null
 *   - incrementAppsDeployed(slug)                    → row | null
 *   - setPlan(slug, plan, graceExpiresAt)            → row | null
 *   - recordApp(slug, appSlug, appName)              → appName
 *   - appNameFor(slug, appSlug)                      → appName | null
 *   - markAppDeployed({ tenantSlug, appSlug, ... })  → { ok }
 *   - getAppRecord(tenantSlug, appSlug)              → row | null
 *   - recordVersion({ tenantSlug, appSlug, ... })    → { ok, code? }
 *   - updateSecretKeys({ tenantSlug, appSlug, newKeys }) → { ok, code? }
 *   - lookupAppBySubdomain(subdomain)                → row | null
 *   - loadKnownApps()                                → { scripts:Set, databases:Set }
 *   - seenStripeEvent(eventId)                       → boolean
 *   - recordStripeEvent(eventId)                     → void
 *
 * Why this is a stub and not a real wire-up: Phase 85a registers the
 * Postgres database. Until that paperwork is done, the store has nothing
 * to talk to. Filed as a separate PR once Russell completes Phase 85a.
 */
// Whitelist of columns `upsert` is allowed to patch. Anything outside this
// set is silently ignored — defensive, because patch keys come from internal
// callers but nothing stops a future caller from accidentally including a
// `slug` field (which must NEVER change). Keeping the list explicit here also
// means the SQL we build is always safe to interpolate without further
// escaping (column names are static identifiers, never user input).
const POSTGRES_UPSERT_PATCHABLE_COLUMNS = new Set([
	'stripe_customer_id',
	'plan',
	'apps_deployed',
	'ai_spent_cents',
	'ai_credit_cents',
	'grace_expires_at',
]);

export class PostgresTenantStore {
	constructor({ pool } = {}) {
		this._pool = pool || null;
		this._notImpl = (op, sql) => {
			const err = new Error(`PostgresTenantStore.${op} — not yet wired (Phase 85a). SQL: ${sql || 'TBD'}`);
			err.code = 'NOT_IMPLEMENTED';
			throw err;
		};
	}

	// CC-1 cycle 2 — INSERT a fresh tenant. Plan defaults to 'pro' (mirrors
	// InMemoryTenantStore.create). ai_credit_cents seeds from planFor(plan)
	// so a new pro tenant gets the $10 credit baked in at signup. The DB's
	// own DEFAULT for ai_credit_cents is 0 (see 0001_init.sql) — we override
	// it explicitly because the in-memory store does, and the contract is
	// "Postgres returns the same shape with the same values".
	async create({ slug, stripeCustomerId, plan = 'pro' }) {
		const p = planFor(plan);
		const client = await this._pool.connect();
		try {
			const r = await client.query(
				`INSERT INTO clear_cloud.tenants
				   (slug, stripe_customer_id, plan, ai_credit_cents)
				 VALUES ($1, $2, $3, $4)
				 RETURNING slug, stripe_customer_id, plan, apps_deployed,
				           ai_spent_cents, ai_credit_cents, created_at, grace_expires_at`,
				[slug, stripeCustomerId ?? null, plan, p.aiCreditCents]
			);
			return r.rows[0];
		} finally {
			client.release();
		}
	}

	// CC-1 cycle 2 — shallow-merge upsert. Mirrors the in-memory `Map.set +
	// spread` semantics: known slug → update the patched columns, unknown
	// slug → INSERT a new row with whatever the patch carries. The whole
	// thing runs as a single `INSERT ... ON CONFLICT (slug) DO UPDATE`
	// statement so two concurrent upserts can't clobber each other's
	// columns via a stale-read race.
	async upsert(slug, patch = {}) {
		// Pull the patchable fields out, ignoring anything else (including a
		// rogue `slug` — the slug NEVER changes after create).
		const cols = [];
		const vals = [];
		for (const [k, v] of Object.entries(patch || {})) {
			if (POSTGRES_UPSERT_PATCHABLE_COLUMNS.has(k)) {
				cols.push(k);
				vals.push(v);
			}
		}

		const client = await this._pool.connect();
		try {
			// On INSERT we also seed ai_credit_cents from planFor(plan) when
			// plan is in the patch — same logic as `create`. If plan isn't
			// patched, the DB DEFAULT (0) carries.
			let insertCols = ['slug', ...cols];
			let insertVals = [slug, ...vals];
			let placeholders = insertCols.map((_, i) => `$${i + 1}`);

			// Build the DO UPDATE clause from the patch. EXCLUDED is the row
			// the INSERT *tried* to insert — perfect for shallow-merge.
			let updateClause;
			if (cols.length === 0) {
				// Empty patch → the conflict is a no-op. Use `slug = slug` to
				// keep ON CONFLICT happy (DO NOTHING wouldn't return the row).
				updateClause = 'slug = clear_cloud.tenants.slug';
			} else {
				updateClause = cols.map(c => `${c} = EXCLUDED.${c}`).join(', ');
			}

			const sql = `
				INSERT INTO clear_cloud.tenants (${insertCols.join(', ')})
				VALUES (${placeholders.join(', ')})
				ON CONFLICT (slug) DO UPDATE SET ${updateClause}
				RETURNING slug, stripe_customer_id, plan, apps_deployed,
				          ai_spent_cents, ai_credit_cents, created_at, grace_expires_at
			`;
			const r = await client.query(sql, insertVals);
			return r.rows[0];
		} finally {
			client.release();
		}
	}

	// CC-1 cycle 2 — single-row read by slug. Returns null on miss to match
	// the in-memory shape exactly.
	async get(slug) {
		const client = await this._pool.connect();
		try {
			const r = await client.query(
				`SELECT slug, stripe_customer_id, plan, apps_deployed,
				        ai_spent_cents, ai_credit_cents, created_at, grace_expires_at
				 FROM clear_cloud.tenants
				 WHERE slug = $1`,
				[slug]
			);
			return r.rows[0] || null;
		} finally {
			client.release();
		}
	}

	// CC-1 cycle 2 — reverse lookup by Stripe customer id. Used by the
	// billing webhook handler to find the tenant whose subscription just
	// changed. Short-circuits on null/empty input — partial unique on
	// stripe_customer_id allows multiple null tenants, and a SELECT WHERE
	// stripe_customer_id IS NULL would match the first anonymous tenant
	// (catastrophic — that's not a "match", it's a wildcard).
	async getByStripeCustomer(stripeCustomerId) {
		if (!stripeCustomerId) return null;
		const client = await this._pool.connect();
		try {
			const r = await client.query(
				`SELECT slug, stripe_customer_id, plan, apps_deployed,
				        ai_spent_cents, ai_credit_cents, created_at, grace_expires_at
				 FROM clear_cloud.tenants
				 WHERE stripe_customer_id = $1`,
				[stripeCustomerId]
			);
			return r.rows[0] || null;
		} finally {
			client.release();
		}
	}
	// CC-1 cycle 3 — atomic counter bump. The SQL adds 1 in a single UPDATE,
	// so two concurrent calls can't read-then-write past each other (no
	// lost-update race). RETURNING * gives us the post-update row in the
	// same shape as `get` / `create` — caller doesn't need a follow-up SELECT.
	// Returns null when the slug doesn't exist (mirrors in-memory which
	// returns null when `tenants.get(slug)` misses).
	async incrementAppsDeployed(slug) {
		const client = await this._pool.connect();
		try {
			const r = await client.query(
				`UPDATE clear_cloud.tenants
				 SET apps_deployed = apps_deployed + 1
				 WHERE slug = $1
				 RETURNING slug, stripe_customer_id, plan, apps_deployed,
				           ai_spent_cents, ai_credit_cents, created_at, grace_expires_at`,
				[slug]
			);
			return r.rows[0] || null;
		} finally {
			client.release();
		}
	}

	// CC-1 cycle 3 — flip plan + grace_expires_at in one statement. Used by
	// the billing webhook handler when a subscription transitions between
	// states (active → past_due → cancelled). graceExpiresAt defaults to null
	// to match the in-memory signature `setPlan(slug, plan, graceExpiresAt = null)`
	// — passing only `slug, plan` clears any previous grace window.
	async setPlan(slug, plan, graceExpiresAt = null) {
		const client = await this._pool.connect();
		try {
			const r = await client.query(
				`UPDATE clear_cloud.tenants
				 SET plan = $2, grace_expires_at = $3
				 WHERE slug = $1
				 RETURNING slug, stripe_customer_id, plan, apps_deployed,
				           ai_spent_cents, ai_credit_cents, created_at, grace_expires_at`,
				[slug, plan, graceExpiresAt]
			);
			return r.rows[0] || null;
		} finally {
			client.release();
		}
	}

	// CC-1 cycle 4 — UPSERT the {tenant_slug, app_slug, app_name} row in
	// the apps table. ON CONFLICT keys on the (tenant_slug, app_slug) UNIQUE
	// index defined in 0001_init.sql; a second call with the same key but a
	// different appName UPDATEs in place. Returns the app_name from the
	// RETURNING clause (post-update, so the caller always sees the wire row's
	// name, not the one they passed in — they're equal here, but keeping the
	// pattern consistent makes future per-row server defaults safe).
	async recordApp(slug, appSlug, appName) {
		const client = await this._pool.connect();
		try {
			const r = await client.query(
				`INSERT INTO clear_cloud.apps (tenant_slug, app_slug, app_name)
				 VALUES ($1, $2, $3)
				 ON CONFLICT (tenant_slug, app_slug)
				   DO UPDATE SET app_name = EXCLUDED.app_name
				 RETURNING app_name`,
				[slug, appSlug, appName]
			);
			return r.rows[0]?.app_name ?? null;
		} finally {
			client.release();
		}
	}

	// CC-1 cycle 4 — single-row read on (tenant_slug, app_slug). Returns the
	// app_name string or null on miss to mirror in-memory's
	// `Map.get(key) || null`.
	async appNameFor(slug, appSlug) {
		const client = await this._pool.connect();
		try {
			const r = await client.query(
				`SELECT app_name FROM clear_cloud.apps
				 WHERE tenant_slug = $1 AND app_slug = $2`,
				[slug, appSlug]
			);
			return r.rows[0]?.app_name ?? null;
		} finally {
			client.release();
		}
	}

	// CC-1 cycle 4 — record a successful Cloudflare deploy. Mirrors
	// InMemoryTenantStore.markAppDeployed (line 86-110): writes to cf_deploys
	// AND mirrors the script_name into apps so a subsequent appNameFor returns
	// it. Both INSERTs share one transaction — a failure on either side
	// rolls back BOTH rows, so the two tables can never disagree about
	// whether this app exists.
	//
	// Cycle 4 deliberately ignores `versionId`, `sourceHash`, `migrationsHash`,
	// and `secretKeys` even when passed: the app_versions and app_secret_keys
	// seeding lands in cycles 5-6. Accepting the params now (rather than
	// throwing) means callers in deploy-cloudflare.js can keep passing them
	// across the cycle 4-6 transition without code changes — they just sit
	// idle in this cycle.
	//
	// UPSERT semantics (ON CONFLICT (tenant_slug, app_slug) DO UPDATE) on
	// BOTH tables means a redeploy of the same app updates the existing
	// rows in place — no duplicate cf_deploys rows, no orphan apps rows.
	// deployed_at is refreshed to now() on every UPSERT (a redeploy IS a
	// new deploy timestamp, even if the script is unchanged).
	async markAppDeployed({
		tenantSlug, appSlug, scriptName, d1_database_id, hostname,
		versionId = null, sourceHash = null, migrationsHash = null,
		lastBundle = null,
		// secretKeys — accepted but ignored in cycle 5 (cycle 6 wires the seed).
	}) {
		const client = await this._pool.connect();
		try {
			await client.query('BEGIN');
			// cf_deploys — UPSERT the deploy row. deployed_at refreshes to
			// now() on every write, including the UPDATE branch (a redeploy
			// IS a new deploy event).
			await client.query(
				`INSERT INTO clear_cloud.cf_deploys
				   (tenant_slug, app_slug, script_name, d1_database_id, hostname, last_bundle, deployed_at)
				 VALUES ($1, $2, $3, $4, $5, $6::jsonb, now())
				 ON CONFLICT (tenant_slug, app_slug) DO UPDATE
				   SET script_name = EXCLUDED.script_name,
				       d1_database_id = EXCLUDED.d1_database_id,
				       hostname = EXCLUDED.hostname,
				       last_bundle = EXCLUDED.last_bundle,
				       deployed_at = now()`,
				[tenantSlug, appSlug, scriptName, d1_database_id ?? null, hostname ?? null, _bundleParam(lastBundle)]
			);
			// apps — mirror the scriptName into the apps table so appNameFor
			// returns it. Same UPSERT key as recordApp (tenant_slug, app_slug).
			await client.query(
				`INSERT INTO clear_cloud.apps (tenant_slug, app_slug, app_name)
				 VALUES ($1, $2, $3)
				 ON CONFLICT (tenant_slug, app_slug)
				   DO UPDATE SET app_name = EXCLUDED.app_name`,
				[tenantSlug, appSlug, scriptName]
			);
			// CC-1 cycle 5 — seed an initial app_versions row when versionId
			// is non-null. Mirrors InMemoryTenantStore.markAppDeployed line 110:
			// only seed when the caller passed a versionId. Existing rows are
			// untouched by this UPSERT (the FK on (tenant_slug, app_slug)
			// points at cf_deploys, not at cf_deploys.id, so re-deploys keep
			// the version history intact). Plain INSERT — never an UPSERT —
			// because every recordVersion call is also a plain INSERT, and
			// duplicate version rows are allowed in the in-memory store too
			// (the cap is the only de-dupe).
			if (versionId) {
				await client.query(
					`INSERT INTO clear_cloud.app_versions
					   (tenant_slug, app_slug, version_id, uploaded_at, source_hash, migrations_hash)
					 VALUES ($1, $2, $3, now(), $4, $5)`,
					[tenantSlug, appSlug, versionId, sourceHash ?? null, migrationsHash ?? null]
				);
			}
			await client.query('COMMIT');
			return { ok: true };
		} catch (err) {
			try { await client.query('ROLLBACK'); } catch { /* swallow secondary error */ }
			throw err;
		} finally {
			client.release();
		}
	}

	// CC-1 cycle 5 — read the full per-app record. Mirrors
	// InMemoryTenantStore.getAppRecord (line 129): returns the cf_deploys row
	// merged with versions[] (newest-first by uploaded_at) and secretKeys[]
	// (cycle 5 leaves this empty; cycle 6 wires the seed + dedupe append).
	//
	// SQL shape: three plain SELECTs assembled in JS, NOT a single mega-JOIN
	// with json_agg. pg-mem ignores ORDER BY inside aggregate functions
	// (json_agg / array_agg) — it returns insertion order regardless of the
	// ORDER BY clause. Three SELECTs with plain top-level ORDER BY work
	// identically in pg-mem and real Postgres, and the per-app row counts are
	// tiny (max 20 versions, ~5-10 keys), so the extra round-trips are noise.
	//
	// Returns null when (tenant_slug, app_slug) doesn't exist in cf_deploys.
	// Returned shape uses camelCase for fields the in-memory store camelCases
	// (scriptName, deployedAt, secretKeys) and snake_case where it does
	// (d1_database_id) — strict shape parity with the in-memory store.
	async getAppRecord(tenantSlug, appSlug) {
		const client = await this._pool.connect();
		try {
			const cf = await client.query(
				`SELECT script_name, d1_database_id, hostname, last_bundle, deployed_at
				 FROM clear_cloud.cf_deploys
				 WHERE tenant_slug = $1 AND app_slug = $2`,
				[tenantSlug, appSlug]
			);
			if (cf.rows.length === 0) return null;
			const row = cf.rows[0];

			const versions = await client.query(
				`SELECT version_id, uploaded_at, source_hash, migrations_hash, note, via
				 FROM clear_cloud.app_versions
				 WHERE tenant_slug = $1 AND app_slug = $2
				 ORDER BY uploaded_at DESC`,
				[tenantSlug, appSlug]
			);

			const secrets = await client.query(
				`SELECT key_name FROM clear_cloud.app_secret_keys
				 WHERE tenant_slug = $1 AND app_slug = $2
				 ORDER BY set_at`,
				[tenantSlug, appSlug]
			);

			// Map snake_case columns to the camelCase fields the in-memory
			// shape uses. note/via are conditionally included — the in-memory
			// store uses spread-with-conditionals for these so they're absent
			// (not null) when the caller didn't pass them.
			const versionsCamel = versions.rows.map(v => {
				const out = {
					versionId: v.version_id,
					uploadedAt: v.uploaded_at instanceof Date
						? v.uploaded_at.toISOString()
						: v.uploaded_at,
					sourceHash: v.source_hash,
					migrationsHash: v.migrations_hash,
				};
				if (v.note !== null && v.note !== undefined) out.note = v.note;
				if (v.via !== null && v.via !== undefined) out.via = v.via;
				return out;
			});

			return {
				tenantSlug,
				appSlug,
				scriptName: row.script_name,
				d1_database_id: row.d1_database_id,
				hostname: row.hostname,
				lastBundle: _bundleValue(row.last_bundle),
				deployedAt: row.deployed_at instanceof Date
					? row.deployed_at.toISOString()
					: row.deployed_at,
				versions: versionsCamel,
				secretKeys: secrets.rows.map(r => r.key_name),
			};
		} finally {
			client.release();
		}
	}

	// CC-1 cycle 5 — append a new version row, then trim if over the cap.
	// Mirrors InMemoryTenantStore.recordVersion (line 151): returns
	// {ok:true} on success or {ok:false, code:'APP_NOT_FOUND'} when the
	// (tenant_slug, app_slug) doesn't exist in cf_deploys. Both the existence
	// check, the INSERT, and the cap trim run inside one transaction so the
	// row never lives in an over-capped state and a concurrent reader never
	// sees the un-trimmed window.
	//
	// Trim shape: DELETE every row whose id falls beyond the newest
	// MAX_VERSIONS_PER_APP, ordered by uploaded_at ASC then OFFSET 20. The
	// OFFSET-in-subquery pattern is portable to pg-mem AND real Postgres;
	// window functions (ROW_NUMBER OVER) would be cleaner but pg-mem coverage
	// of window functions is patchy and the OFFSET subquery is just as fast
	// at our row counts (max 25 in-flight, almost always under 20).
	async recordVersion({
		tenantSlug, appSlug, versionId, uploadedAt, sourceHash, migrationsHash, note, via, lastBundle,
	}) {
		const client = await this._pool.connect();
		try {
			await client.query('BEGIN');
			// APP_NOT_FOUND check — mirrors the in-memory store's
			// `if (!cfDeploys.has(key)) return APP_NOT_FOUND`. SELECT 1 keeps
			// the round trip cheap; the row itself isn't read.
			const exists = await client.query(
				`SELECT 1 FROM clear_cloud.cf_deploys
				 WHERE tenant_slug = $1 AND app_slug = $2`,
				[tenantSlug, appSlug]
			);
			if (exists.rowCount === 0) {
				await client.query('ROLLBACK');
				return { ok: false, code: 'APP_NOT_FOUND' };
			}

			await client.query(
				`INSERT INTO clear_cloud.app_versions
				   (tenant_slug, app_slug, version_id, uploaded_at, source_hash, migrations_hash, note, via)
				 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
				[
					tenantSlug, appSlug, versionId,
					uploadedAt || new Date().toISOString(),
					sourceHash ?? null,
					migrationsHash ?? null,
					note ?? null,
					via ?? null,
				]
			);

			// Trim oldest beyond MAX_VERSIONS_PER_APP. ORDER BY uploaded_at
			// DESC + OFFSET 20 selects everything PAST the newest 20 — i.e.
			// the oldest rows that need deleting. (ASC + OFFSET 20 would
			// select the NEWEST past 20, which is the inverse of what we
			// want.) The MAX_VERSIONS_PER_APP interpolation is safe — it's a
			// module constant (number literal in source), never user input.
			await client.query(
				`DELETE FROM clear_cloud.app_versions
				 WHERE id IN (
				   SELECT id FROM clear_cloud.app_versions
				   WHERE tenant_slug = $1 AND app_slug = $2
				   ORDER BY uploaded_at DESC
				   OFFSET ${MAX_VERSIONS_PER_APP}
				 )`,
				[tenantSlug, appSlug]
			);

			if (lastBundle !== undefined) {
				await client.query(
					`UPDATE clear_cloud.cf_deploys
					 SET last_bundle = $3::jsonb
					 WHERE tenant_slug = $1 AND app_slug = $2`,
					[tenantSlug, appSlug, _bundleParam(lastBundle)]
				);
			}

			await client.query('COMMIT');
			return { ok: true };
		} catch (err) {
			try { await client.query('ROLLBACK'); } catch { /* swallow secondary error */ }
			throw err;
		} finally {
			client.release();
		}
	}

	// CC-1 cycle 6 — dedupe-append secret-key NAMES (never values). Mirrors
	// InMemoryTenantStore.updateSecretKeys. Confirms the app exists via the
	// cf_deploys table, then runs one INSERT per key with ON CONFLICT DO
	// NOTHING so re-setting the same key name is a silent no-op. Whole thing
	// runs in one transaction so two concurrent calls can't half-write.
	async updateSecretKeys({ tenantSlug, appSlug, newKeys }) {
		const client = await this._pool.connect();
		try {
			const exists = await client.query(
				`SELECT 1 FROM clear_cloud.cf_deploys WHERE tenant_slug = $1 AND app_slug = $2`,
				[tenantSlug, appSlug]
			);
			if (exists.rowCount === 0) return { ok: false, code: 'APP_NOT_FOUND' };
			if (!Array.isArray(newKeys) || newKeys.length === 0) return { ok: true };
			await client.query('BEGIN');
			try {
				for (const k of newKeys) {
					if (typeof k !== 'string' || !k) continue;
					await client.query(
						`INSERT INTO clear_cloud.app_secret_keys (tenant_slug, app_slug, key_name)
						 VALUES ($1, $2, $3)
						 ON CONFLICT (tenant_slug, app_slug, key_name) DO NOTHING`,
						[tenantSlug, appSlug, k]
					);
				}
				await client.query('COMMIT');
			} catch (err) {
				await client.query('ROLLBACK');
				throw err;
			}
			return { ok: true };
		} finally {
			client.release();
		}
	}

	// CC-1 cycle 7 — subdomain routing. Given the leading hostname label
	// (e.g. `acme-deals` from `acme-deals.buildclear.dev`), return the full
	// deployed-app row that owns it (with versions[] + secretKeys[]) or null.
	// Uses the cf_deploys_subdomain_idx functional index for sub-millisecond
	// lookup at low row counts.
	async lookupAppBySubdomain(subdomain) {
		if (!subdomain || typeof subdomain !== 'string') return null;
		const target = subdomain.toLowerCase();
		const client = await this._pool.connect();
		try {
			const r = await client.query(
				`SELECT cd.tenant_slug, cd.app_slug, cd.script_name, cd.d1_database_id,
				        cd.hostname, cd.last_bundle, cd.deployed_at
				 FROM clear_cloud.cf_deploys cd
				 WHERE lower(cd.hostname) LIKE $1
				 LIMIT 1`,
				[target + '.%']
			);
			if (r.rowCount === 0) return null;
			const row = r.rows[0];
			// Hydrate versions[] + secretKeys[] using the cycle 5 join shape
			const versionsR = await client.query(
				`SELECT version_id AS "versionId", uploaded_at AS "uploadedAt",
				        source_hash AS "sourceHash", migrations_hash AS "migrationsHash",
				        note, via
				 FROM clear_cloud.app_versions
				 WHERE tenant_slug = $1 AND app_slug = $2
				 ORDER BY uploaded_at DESC`,
				[row.tenant_slug, row.app_slug]
			);
			const secretsR = await client.query(
				`SELECT key_name FROM clear_cloud.app_secret_keys
				 WHERE tenant_slug = $1 AND app_slug = $2
				 ORDER BY set_at`,
				[row.tenant_slug, row.app_slug]
			);
			return {
				tenantSlug: row.tenant_slug,
				appSlug: row.app_slug,
				scriptName: row.script_name,
				d1_database_id: row.d1_database_id,
				hostname: row.hostname,
				lastBundle: _bundleValue(row.last_bundle),
				deployedAt: row.deployed_at instanceof Date ? row.deployed_at.toISOString() : row.deployed_at,
				versions: versionsR.rows,
				secretKeys: secretsR.rows.map(r => r.key_name),
			};
		} finally {
			client.release();
		}
	}

	// CC-1 cycle 7 — reconcile job. Returns the two known-set views the
	// reconcile job diffs against the live Cloudflare listing. Cross-tenant
	// scan is by design here; this is the only method on the surface that
	// queries every tenant's apps.
	async loadKnownApps() {
		const client = await this._pool.connect();
		try {
			const r = await client.query(
				`SELECT script_name, d1_database_id FROM clear_cloud.cf_deploys`
			);
			const scripts = new Set();
			const databases = new Set();
			for (const row of r.rows) {
				if (row.script_name) scripts.add(row.script_name);
				if (row.d1_database_id) databases.add(row.d1_database_id);
			}
			return { scripts, databases };
		} finally {
			client.release();
		}
	}

	// CC-1 cycle 3 — Stripe webhook deduplication. seenStripeEvent is the
	// gate the billing handler runs BEFORE processing each webhook event;
	// recordStripeEvent is what the handler runs AFTER successful processing.
	// The pair makes redelivery safe: Stripe retries failed webhooks for up
	// to 3 days, and we MUST NOT double-process a payment.
	async seenStripeEvent(eventId) {
		const client = await this._pool.connect();
		try {
			const r = await client.query(
				`SELECT 1 FROM clear_cloud.stripe_events WHERE event_id = $1`,
				[eventId]
			);
			return r.rowCount > 0;
		} finally {
			client.release();
		}
	}

	// CC-1 cycle 3 — record the event id so subsequent seenStripeEvent calls
	// return true. ON CONFLICT DO NOTHING means a duplicate insert (e.g. two
	// webhook deliveries racing through the handler) is a silent no-op rather
	// than a primary-key violation. Returns void/undefined to match the
	// in-memory signature.
	async recordStripeEvent(eventId) {
		const client = await this._pool.connect();
		try {
			await client.query(
				`INSERT INTO clear_cloud.stripe_events (event_id)
				 VALUES ($1)
				 ON CONFLICT (event_id) DO NOTHING`,
				[eventId]
			);
		} finally {
			client.release();
		}
	}
	// CC-1 cycle 8 — audit log read. Returns rows newest-first to match the
	// in-memory shape. Maps DB columns to camelCase JS shape (auditId,
	// sourceHashBefore, etc.) — the audit log is one of the few places we
	// camelize on the way out, mirroring the in-memory store's existing
	// shape that callers already depend on.
	async getAuditLog(tenantSlug, appSlug) {
		const client = await this._pool.connect();
		try {
			const r = await client.query(
				`SELECT id, tenant_slug, app_slug, ts, actor, action, verdict,
				        source_hash_before, source_hash_after, note,
				        kind, "before", "after", reason, ip, user_agent,
				        status, version_id, error
				 FROM clear_cloud.app_audit_log
				 WHERE tenant_slug = $1 AND app_slug = $2
				 ORDER BY ts DESC, id DESC`,
				[tenantSlug, appSlug]
			);
			return r.rows.map(_mapAuditRow);
		} finally {
			client.release();
		}
	}

	// CC-1 cycle 8 — audit log append. Mirrors InMemoryTenantStore.appendAuditEntry.
	// Uses INSERT … SELECT … WHERE EXISTS so an unknown app returns
	// APP_NOT_FOUND without leaking an FK error. Trims oldest rows past
	// MAX_AUDIT_PER_APP=200 in the same transaction so the cap can't drift
	// under concurrent appends. Returns the row's id (stringified) as auditId.
	async appendAuditEntry({
		tenantSlug, appSlug,
		actor, action, verdict,
		sourceHashBefore, sourceHashAfter, note,
		kind, before, after, reason, ip, userAgent, status,
	}) {
		const client = await this._pool.connect();
		try {
			await client.query('BEGIN');
			try {
				const ins = await client.query(
					`INSERT INTO clear_cloud.app_audit_log
					   (tenant_slug, app_slug, actor, action, verdict,
					    source_hash_before, source_hash_after, note,
					    kind, "before", "after", reason, ip, user_agent, status)
					 SELECT $1, $2, COALESCE($3, 'unknown'), COALESCE($4, 'unknown'), $5,
					        $6, $7, $8, $9, $10, $11, $12, $13, $14, COALESCE($15, 'shipped')
					 WHERE EXISTS (
					   SELECT 1 FROM clear_cloud.cf_deploys
					   WHERE tenant_slug = $1 AND app_slug = $2
					 )
					 RETURNING id`,
					[
						tenantSlug, appSlug,
						actor || null, action || null, verdict || null,
						sourceHashBefore || null, sourceHashAfter || null, note || null,
						kind || null, before || null, after || null,
						reason || null, ip || null, userAgent || null, status || null,
					]
				);
				if (ins.rowCount === 0) {
					await client.query('ROLLBACK');
					return { ok: false, code: 'APP_NOT_FOUND' };
				}
				const auditId = String(ins.rows[0].id);
				// Trim past cap. Oldest first by ts then id; never lose pending rows
				// is not enforced here because trim is FIFO across all statuses —
				// the cap is 20× realistic so a pending row mid-flight is safe.
				await client.query(
					`DELETE FROM clear_cloud.app_audit_log
					 WHERE id IN (
					   SELECT id FROM clear_cloud.app_audit_log
					   WHERE tenant_slug = $1 AND app_slug = $2
					   ORDER BY ts ASC, id ASC
					   OFFSET $3
					 )`,
					[tenantSlug, appSlug, MAX_AUDIT_PER_APP]
				);
				await client.query('COMMIT');
				return { ok: true, auditId };
			} catch (err) {
				await client.query('ROLLBACK');
				throw err;
			}
		} finally {
			client.release();
		}
	}
	// LAE Phase C cycle 3 — destructive ship audit-row update. Postgres
	// version will look up by audit_id (UUID PK) and update status/version_id/
	// error in a single statement. The in-memory equivalent is in
	// InMemoryTenantStore.markAuditEntry — same surface, same semantics.
	// CC-1 cycle 8 — flip a pending audit row to shipped/ship-failed and
	// optionally record the versionId or error. COALESCE keeps unchanged
	// fields untouched. Returns AUDIT_NOT_FOUND when the id doesn't exist.
	async markAuditEntry({ auditId, status, versionId, error }) {
		const idNum = Number(auditId);
		if (!Number.isFinite(idNum)) return { ok: false, code: 'AUDIT_NOT_FOUND' };
		const client = await this._pool.connect();
		try {
			const r = await client.query(
				`UPDATE clear_cloud.app_audit_log
				 SET status = COALESCE($2, status),
				     version_id = COALESCE($3, version_id),
				     error = COALESCE($4, error)
				 WHERE id = $1
				 RETURNING id`,
				[idNum, status || null, versionId || null, error || null]
			);
			if (r.rowCount === 0) return { ok: false, code: 'AUDIT_NOT_FOUND' };
			return { ok: true };
		} finally {
			client.release();
		}
	}
}

export function newTenantSlug() {
	return `clear-${randomBytes(3).toString('hex')}`;
}

/**
 * CC-1 cycle 9 — DualWriteTenantStore. Wraps two stores (primary + mirror).
 * Every write goes to BOTH. Reads come from primary first; if primary returns
 * null/empty AND mirror has data, mirror's data is returned (read-through
 * fallback). Mirror failures are logged via console.error but never raise
 * to the caller — the primary's result is what callers see.
 *
 * Used during the in-memory → Postgres cutover. Once Postgres is fully
 * populated and stable for 24h+, drop this wrapper entirely.
 */
export class DualWriteTenantStore {
	constructor({ primary, mirror }) {
		if (!primary) throw new Error('DualWriteTenantStore: primary is required');
		if (!mirror) throw new Error('DualWriteTenantStore: mirror is required');
		this._primary = primary;
		this._mirror = mirror;
	}

	async _mirrorCall(method, args) {
		try {
			return await this._mirror[method](...args);
		} catch (err) {
			console.error(`[DualWriteTenantStore] mirror.${method} failed (non-fatal):`, err.message || err);
			return undefined;
		}
	}

	// Mutating methods — primary first (must succeed), then mirror best-effort.
	async create(input) {
		const result = await this._primary.create(input);
		await this._mirrorCall('create', [input]);
		return result;
	}
	async upsert(slug, patch) {
		const result = await this._primary.upsert(slug, patch);
		await this._mirrorCall('upsert', [slug, patch]);
		return result;
	}
	async incrementAppsDeployed(slug) {
		const result = await this._primary.incrementAppsDeployed(slug);
		await this._mirrorCall('incrementAppsDeployed', [slug]);
		return result;
	}
	async setPlan(slug, plan, graceExpiresAt) {
		const result = await this._primary.setPlan(slug, plan, graceExpiresAt);
		await this._mirrorCall('setPlan', [slug, plan, graceExpiresAt]);
		return result;
	}
	async recordApp(slug, appSlug, appName) {
		const result = await this._primary.recordApp(slug, appSlug, appName);
		await this._mirrorCall('recordApp', [slug, appSlug, appName]);
		return result;
	}
	async markAppDeployed(input) {
		const result = await this._primary.markAppDeployed(input);
		await this._mirrorCall('markAppDeployed', [input]);
		return result;
	}
	async recordVersion(input) {
		const result = await this._primary.recordVersion(input);
		await this._mirrorCall('recordVersion', [input]);
		return result;
	}
	async updateSecretKeys(input) {
		const result = await this._primary.updateSecretKeys(input);
		await this._mirrorCall('updateSecretKeys', [input]);
		return result;
	}
	async recordStripeEvent(eventId) {
		const result = await this._primary.recordStripeEvent(eventId);
		await this._mirrorCall('recordStripeEvent', [eventId]);
		return result;
	}
	async appendAuditEntry(input) {
		const result = await this._primary.appendAuditEntry(input);
		await this._mirrorCall('appendAuditEntry', [input]);
		return result;
	}
	async markAuditEntry(input) {
		const result = await this._primary.markAuditEntry(input);
		await this._mirrorCall('markAuditEntry', [input]);
		return result;
	}

	// Read methods — primary first; fall back to mirror if primary returns
	// null/empty and mirror has data. This makes the read path tolerant of
	// the cutover gap where Postgres is still being populated.
	async get(slug) {
		const r = await this._primary.get(slug);
		if (r) return r;
		return await this._mirrorCall('get', [slug]) || null;
	}
	async getByStripeCustomer(id) {
		const r = await this._primary.getByStripeCustomer(id);
		if (r) return r;
		return await this._mirrorCall('getByStripeCustomer', [id]) || null;
	}
	async appNameFor(slug, appSlug) {
		const r = await this._primary.appNameFor(slug, appSlug);
		if (r) return r;
		return await this._mirrorCall('appNameFor', [slug, appSlug]) || null;
	}
	async getAppRecord(tenantSlug, appSlug) {
		const r = await this._primary.getAppRecord(tenantSlug, appSlug);
		if (r) return r;
		return await this._mirrorCall('getAppRecord', [tenantSlug, appSlug]) || null;
	}
	async lookupAppBySubdomain(subdomain) {
		const r = await this._primary.lookupAppBySubdomain(subdomain);
		if (r) return r;
		return await this._mirrorCall('lookupAppBySubdomain', [subdomain]) || null;
	}
	async loadKnownApps() {
		// Union of both — reconcile job needs the full picture during cutover.
		const p = await this._primary.loadKnownApps();
		const m = (await this._mirrorCall('loadKnownApps', [])) || { scripts: new Set(), databases: new Set() };
		const scripts = new Set([...(p?.scripts || []), ...(m.scripts || [])]);
		const databases = new Set([...(p?.databases || []), ...(m.databases || [])]);
		return { scripts, databases };
	}
	async seenStripeEvent(eventId) {
		// True if EITHER store has seen it — safer for idempotency.
		const p = await this._primary.seenStripeEvent(eventId);
		if (p) return true;
		return Boolean(await this._mirrorCall('seenStripeEvent', [eventId]));
	}
	async getAuditLog(tenantSlug, appSlug) {
		// Primary's log wins — audit is append-only and primary is the source
		// of truth post-cutover. Empty primary falls through to mirror.
		const p = await this._primary.getAuditLog(tenantSlug, appSlug);
		if (Array.isArray(p) && p.length > 0) return p;
		const m = await this._mirrorCall('getAuditLog', [tenantSlug, appSlug]);
		return Array.isArray(m) ? m : (Array.isArray(p) ? p : []);
	}
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

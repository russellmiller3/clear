// playground/ai-proxy/usage.js
// Tenant quota + spend tracking. Abstracted behind a simple interface so
// tests can swap in an in-memory store and production uses Postgres. The
// increment is intended to be atomic at the DB level; the in-memory one
// is atomic-enough because Node is single-threaded.

export class InMemoryStore {
	constructor(initial = {}) {
		this.tenants = new Map();
		for (const [slug, row] of Object.entries(initial)) {
			this.tenants.set(slug, { ...row });
		}
		this.calls = [];
	}
	async getTenant(slug) {
		return this.tenants.get(slug) || null;
	}
	async incrementSpend(slug, cents, meta) {
		const t = this.tenants.get(slug);
		if (!t) return { ok: false };
		t.ai_spent_cents = (t.ai_spent_cents || 0) + cents;
		this.calls.push({ slug, cents, ...meta, at: Date.now() });
		return { ok: true, total: t.ai_spent_cents };
	}
	async usageFor(slug, days = 30) {
		const cutoff = Date.now() - days * 86400_000;
		const rows = this.calls.filter(c => c.slug === slug && c.at >= cutoff);
		const byDay = {};
		for (const r of rows) {
			const d = new Date(r.at).toISOString().slice(0, 10);
			byDay[d] = (byDay[d] || 0) + r.cents;
		}
		return { byDay, totalCents: rows.reduce((a, b) => a + b.cents, 0) };
	}
}

export function quotaExceeded(tenant, overageAllowanceCents = 2000) {
	const spent = tenant.ai_spent_cents || 0;
	const credit = tenant.ai_credit_cents || 0;
	return spent > credit + overageAllowanceCents;
}

// Token-bucket-ish sliding window: per-tenant 60 req/min default.
export class RateLimiter {
	constructor(limit = 60, windowMs = 60_000) {
		this.limit = limit;
		this.windowMs = windowMs;
		this.buckets = new Map();
	}
	allow(key) {
		const now = Date.now();
		const arr = this.buckets.get(key) || [];
		const fresh = arr.filter(t => now - t < this.windowMs);
		if (fresh.length >= this.limit) {
			this.buckets.set(key, fresh);
			return false;
		}
		fresh.push(now);
		this.buckets.set(key, fresh);
		return true;
	}
}

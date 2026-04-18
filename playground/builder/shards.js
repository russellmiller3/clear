// playground/builder/shards.js
// Tenants are hashed onto one of three Fly orgs. Same tenant always goes to
// the same shard (hash is deterministic), so repeat deploys of the same app
// land next to the tenant's other apps. This makes per-tenant queries, cost
// reporting, and "destroy this customer" operations a single-org problem.
//
// Failover: if the primary shard is at its Fly quota, the builder walks
// forward through the list until one accepts the deploy. We page ops only
// when ALL shards are full — a single shard at capacity isn't news.

import { createHash } from 'crypto';

export const SHARDS = [
	{ index: 0, slug: 'clear-apps-01', token: process.env.FLY_API_TOKEN_01 || process.env.FLY_API_TOKEN },
	{ index: 1, slug: 'clear-apps-02', token: process.env.FLY_API_TOKEN_02 || process.env.FLY_API_TOKEN },
	{ index: 2, slug: 'clear-apps-03', token: process.env.FLY_API_TOKEN_03 || process.env.FLY_API_TOKEN },
];

export function shardFor(tenantSlug) {
	if (!tenantSlug || typeof tenantSlug !== 'string') {
		throw new Error('shardFor requires a non-empty tenantSlug');
	}
	const h = createHash('sha256').update(tenantSlug).digest();
	const idx = h.readUInt32BE(0) % SHARDS.length;
	return SHARDS[idx];
}

export function shardByIndex(idx) {
	return SHARDS[idx % SHARDS.length];
}

// deployWithFailover: caller supplies a deploy fn that takes a shard and
// returns { ok, url?, code? }. We start at the tenant's primary shard, then
// walk forward only on FLY_QUOTA_HIT. Any other failure is terminal —
// quota is the one error we can route around; a bad Dockerfile is a bad
// Dockerfile on every shard.
export async function deployWithFailover(tenantSlug, deployFn, opsNotifier = null) {
	const primary = shardFor(tenantSlug);
	const order = [primary];
	for (const s of SHARDS) {
		if (s.index !== primary.index) order.push(s);
	}

	let lastErr = null;
	for (const shard of order) {
		const res = await deployFn(shard);
		if (res.ok) {
			return { ok: true, ...res, shard: shard.slug };
		}
		if (res.code === 'FLY_QUOTA_HIT') {
			lastErr = res;
			continue;
		}
		return { ...res, shard: shard.slug };
	}

	if (opsNotifier) {
		try { await opsNotifier({ event: 'ALL_SHARDS_FULL', tenantSlug }); } catch (_) {}
	}
	return { ok: false, code: 'ALL_SHARDS_FULL', lastErr };
}

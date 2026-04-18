// playground/ai-proxy/server.test.js
// Covers: JWT gate, rate limiter, fail-closed on DB outage, quota gate,
// metering, and usage aggregation. Anthropic is mocked via setAnthropicFetchForTest.

import { describe, it, expect, testAsync } from '../../lib/testUtils.js';
import http from 'http';
import { makeServer, setStoreForTest, setAnthropicFetchForTest } from './server.js';
import { signTenantJwt, verifyTenantJwt } from './auth.js';
import { priceFor } from './pricing.js';
import { InMemoryStore, RateLimiter, quotaExceeded } from './usage.js';

describe('pricing', () => {
	it('Sonnet 1M in + 1M out = $18 (ceil)', () => {
		expect(priceFor('claude-sonnet-4-6', 1_000_000, 1_000_000)).toBe(1800);
	});
	it('unknown model falls back to Opus rates', () => {
		const unknown = priceFor('claude-no-such-model', 1000, 1000);
		const opus = priceFor('claude-opus-4-7', 1000, 1000);
		expect(unknown).toBe(opus);
	});
});

describe('JWT verify', () => {
	it('round-trips a signed token', () => {
		const tok = signTenantJwt('acme', 'secret-abc', 3600);
		const v = verifyTenantJwt(tok, 'secret-abc');
		expect(v.ok).toBe(true);
		expect(v.payload.sub).toBe('acme');
	});
	it('rejects wrong secret', () => {
		const tok = signTenantJwt('acme', 'secret-abc', 3600);
		const v = verifyTenantJwt(tok, 'secret-xyz');
		expect(v.ok).toBe(false);
	});
	it('rejects expired token', () => {
		const tok = signTenantJwt('acme', 's', -10);
		const v = verifyTenantJwt(tok, 's');
		expect(v.ok).toBe(false);
		expect(v.reason).toBe('expired');
	});
});

describe('quotaExceeded + RateLimiter', () => {
	it('not exceeded when spent < credit + grace', () => {
		expect(quotaExceeded({ ai_spent_cents: 100, ai_credit_cents: 1000 })).toBe(false);
	});
	it('exceeded when spent > credit + grace', () => {
		expect(quotaExceeded({ ai_spent_cents: 5000, ai_credit_cents: 1000 }, 500)).toBe(true);
	});
	it('rate limiter allows up to limit then blocks', () => {
		const rl = new RateLimiter(3, 60_000);
		expect(rl.allow('a')).toBe(true);
		expect(rl.allow('a')).toBe(true);
		expect(rl.allow('a')).toBe(true);
		expect(rl.allow('a')).toBe(false);
		expect(rl.allow('b')).toBe(true);
	});
});

async function startServer() {
	process.env.TENANT_JWT_SECRET = 'proxy-test-secret';
	process.env.ANTHROPIC_API_KEY = 'sk-test';
	process.env.PROXY_SHARED_SECRET = 'proxy-shared';
	const server = makeServer();
	await new Promise(r => server.listen(0, r));
	return { server, port: server.address().port, close: () => new Promise(r => server.close(r)) };
}

function req(port, path, opts = {}) {
	return new Promise((res, rej) => {
		const r = http.request({ hostname: '127.0.0.1', port, path, method: opts.method || 'GET', headers: opts.headers || {} }, (resp) => {
			const chunks = [];
			resp.on('data', c => chunks.push(c));
			resp.on('end', () => {
				const body = Buffer.concat(chunks).toString('utf8');
				try { res({ status: resp.statusCode, body: JSON.parse(body) }); }
				catch { res({ status: resp.statusCode, body }); }
			});
		});
		r.on('error', rej);
		if (opts.body) r.write(opts.body);
		r.end();
	});
}

// Tests share module-level proxy state (store + anthropicFetch). Run
// sequentially so one test's mocks don't leak into another's fetch call.
async function runSeq(label, fn) {
	try { await fn(); console.log(`✅ ${label}`); }
	catch (e) { console.log(`❌ ${label}\n   ${e.message}`); }
}

await (async () => {
	await runSeq('/claude — 401 without valid JWT (test 3.1)', async () => {
		const { port, close } = await startServer();
		try {
			const r = await req(port, '/claude', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': 2 }, body: '{}' });
			expect(r.status).toBe(401);
		} finally { await close(); }
	});

	await runSeq('/claude — forwards + meters (test 3.2)', async () => {
		const { port, close } = await startServer();
		const tok = signTenantJwt('acme', 'proxy-test-secret', 3600);
		const s = new InMemoryStore({ acme: { plan: 'pro', ai_spent_cents: 0, ai_credit_cents: 10000 } });
		setStoreForTest(s);
		setAnthropicFetchForTest(async () => ({
			ok: true,
			status: 200,
			json: async () => ({ content: [{ type: 'text', text: 'hi' }], usage: { input_tokens: 100, output_tokens: 200 } }),
			text: async () => '',
		}));
		try {
			const body = JSON.stringify({ model: 'claude-sonnet-4-6', messages: [{ role: 'user', content: 'hi' }] });
			const r = await req(port, '/claude', {
				method: 'POST',
				headers: { 'Authorization': `Bearer ${tok}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
				body,
			});
			expect(r.status).toBe(200);
			const t = await s.getTenant('acme');
			expect(t.ai_spent_cents).toBeGreaterThan(0);
		} finally { await close(); }
	});

	await runSeq('/claude — 402 when quota exceeded (test 3.3)', async () => {
		const { port, close } = await startServer();
		const tok = signTenantJwt('acme', 'proxy-test-secret', 3600);
		setStoreForTest(new InMemoryStore({ acme: { plan: 'pro', ai_spent_cents: 100000, ai_credit_cents: 1000 } }));
		// reset anthropic mock so a quota 402 doesn't fall through to a real fetch
		setAnthropicFetchForTest(async () => ({ ok: false, status: 500, text: async () => 'should not hit' }));
		try {
			const body = JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] });
			const r = await req(port, '/claude', {
				method: 'POST',
				headers: { 'Authorization': `Bearer ${tok}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
				body,
			});
			expect(r.status).toBe(402);
		} finally { await close(); }
	});

	await runSeq('/claude — 503 fail-closed when DB throws (test 3.3b)', async () => {
		const { port, close } = await startServer();
		const tok = signTenantJwt('acme', 'proxy-test-secret', 3600);
		setStoreForTest({
			getTenant: async () => { throw new Error('db down'); },
			incrementSpend: async () => { throw new Error('db down'); },
			usageFor: async () => { throw new Error('db down'); },
		});
		setAnthropicFetchForTest(async () => {
			throw new Error('should NOT have been called when DB is down');
		});
		try {
			const body = JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] });
			const r = await req(port, '/claude', {
				method: 'POST',
				headers: { 'Authorization': `Bearer ${tok}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
				body,
			});
			expect(r.status).toBe(503);
		} finally { await close(); }
	});

	await runSeq('/usage/:tenant — 401 without shared secret', async () => {
		const { port, close } = await startServer();
		try {
			const r = await req(port, '/usage/acme');
			expect(r.status).toBe(401);
		} finally { await close(); }
	});

	await runSeq('/usage/:tenant — returns spend + byDay (test 3.4)', async () => {
		const { port, close } = await startServer();
		const s = new InMemoryStore({ acme: { plan: 'pro', ai_spent_cents: 4200, ai_credit_cents: 10000 } });
		setStoreForTest(s);
		try {
			const r = await req(port, '/usage/acme', { headers: { 'Authorization': 'Bearer proxy-shared' } });
			expect(r.status).toBe(200);
			expect(r.body.ok).toBe(true);
			expect(r.body.spent_cents).toBe(4200);
			expect(r.body.credit_cents).toBe(10000);
			expect(typeof r.body.byDay).toBe('object');
		} finally { await close(); }
	});

	await runSeq('/health — 200', async () => {
		const { port, close } = await startServer();
		try {
			const r = await req(port, '/health');
			expect(r.status).toBe(200);
			expect(r.body.hasAnthropicKey).toBe(true);
		} finally { await close(); }
	});
})();

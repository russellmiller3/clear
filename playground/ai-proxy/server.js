// playground/ai-proxy/server.js
// The AI proxy: one always-on machine that holds the only Anthropic key
// for deployed Clear apps. Every `ask claude` from a deployed app lands
// here with a tenant JWT; we verify, check quota, forward to Anthropic,
// meter input + output tokens, increment the tenant's spend.
//
// Fail-closed: if we can't read the tenant record or can't meter, we do
// NOT forward. Free inference is the one failure mode we can't afford —
// one leaky proxy costs more than an hour of downtime for the affected
// tenant. The deployed app surfaces "AI service temporarily unavailable"
// and the customer retries.

import http from 'http';
import { verifyTenantJwt } from './auth.js';
import { priceFor } from './pricing.js';
import { InMemoryStore, quotaExceeded, RateLimiter } from './usage.js';

const PORT = parseInt(process.env.PORT || '8081', 10);
function jwtSecret() { return process.env.TENANT_JWT_SECRET || ''; }
function anthropicKey() { return process.env.ANTHROPIC_API_KEY || ''; }
function anthropicBase() { return process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com'; }

let store = new InMemoryStore();
const limiter = new RateLimiter(60, 60_000);

export function setStoreForTest(s) { store = s; }
let anthropicFetch = globalThis.fetch;
export function setAnthropicFetchForTest(f) { anthropicFetch = f; }

function send(res, status, body) {
	const buf = Buffer.from(JSON.stringify(body));
	res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': buf.length });
	res.end(buf);
}

async function readJson(req, max = 2 * 1024 * 1024) {
	return new Promise((res, rej) => {
		const chunks = [];
		let size = 0;
		req.on('data', c => {
			size += c.length;
			if (size > max) { req.destroy(); return rej(new Error('too large')); }
			chunks.push(c);
		});
		req.on('end', () => {
			try { res(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
			catch (e) { rej(e); }
		});
		req.on('error', rej);
	});
}

function bearer(req) {
	const h = req.headers.authorization || '';
	return h.startsWith('Bearer ') ? h.slice(7) : null;
}

export async function handleClaude(req, res) {
	const token = bearer(req);
	const v = verifyTenantJwt(token, jwtSecret());
	if (!v.ok) return send(res, 401, { error: `invalid tenant token: ${v.reason}` });
	const slug = v.payload.sub;

	if (!limiter.allow(slug)) {
		return send(res, 429, { error: 'rate limit: 60 req/min per tenant' });
	}

	let tenant;
	try {
		tenant = await store.getTenant(slug);
	} catch (e) {
		console.error('[PROXY_DB_FAIL]', e.message);
		return send(res, 503, { error: 'AI service temporarily unavailable' });
	}
	if (!tenant) return send(res, 401, { error: 'unknown tenant' });
	if (tenant.plan === 'cancelled') return send(res, 402, { error: 'subscription cancelled' });
	if (quotaExceeded(tenant)) return send(res, 402, { error: 'Upgrade or top up' });

	let body;
	try { body = await readJson(req); } catch { return send(res, 400, { error: 'bad body' }); }
	const { model = 'claude-sonnet-4-6', messages, max_tokens = 1024, system } = body || {};
	if (!Array.isArray(messages)) return send(res, 400, { error: 'messages must be an array' });

	let anthropicRes;
	try {
		anthropicRes = await anthropicFetch(`${anthropicBase()}/v1/messages`, {
			method: 'POST',
			headers: {
				'x-api-key': anthropicKey(),
				'anthropic-version': '2023-06-01',
				'content-type': 'application/json',
			},
			body: JSON.stringify({ model, messages, max_tokens, ...(system ? { system } : {}) }),
		});
	} catch (e) {
		if (process.env.PROXY_DEBUG) console.error('[PROXY_DEBUG] fetch threw:', e.message);
		return send(res, 502, { error: 'Anthropic upstream unreachable' });
	}

	if (!anthropicRes.ok) {
		const text = await anthropicRes.text();
		return send(res, anthropicRes.status, { error: 'anthropic error', detail: text });
	}

	const payload = await anthropicRes.json();
	const inTokens = payload.usage?.input_tokens || 0;
	const outTokens = payload.usage?.output_tokens || 0;
	const costCents = priceFor(model, inTokens, outTokens);

	try {
		await store.incrementSpend(slug, costCents, { model, inTokens, outTokens });
	} catch (e) {
		console.error('[METERING_FAIL]', e.message);
		// We already forwarded — we can't undo the Claude call. Log loudly so
		// ops can reconcile later, but return the answer to the customer.
	}

	return send(res, 200, payload);
}

export async function handleUsage(req, res, slug) {
	const auth = bearer(req);
	if (!auth || auth !== process.env.PROXY_SHARED_SECRET) {
		return send(res, 401, { ok: false });
	}
	try {
		const t = await store.getTenant(slug);
		if (!t) return send(res, 404, { ok: false });
		const u = await store.usageFor(slug, 30);
		return send(res, 200, { ok: true, slug, spent_cents: t.ai_spent_cents || 0, credit_cents: t.ai_credit_cents || 0, byDay: u.byDay });
	} catch (e) {
		return send(res, 503, { ok: false, reason: 'db unavailable' });
	}
}

export async function handleHealth(req, res) {
	return send(res, 200, { ok: true, version: 'proxy-1.0', hasAnthropicKey: !!anthropicKey() });
}

export function makeServer() {
	return http.createServer(async (req, res) => {
		try {
			const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
			const path = url.pathname;
			if (req.method === 'GET' && path === '/health') return handleHealth(req, res);
			if (req.method === 'POST' && path === '/claude') return handleClaude(req, res);
			if (req.method === 'GET' && path.startsWith('/usage/')) {
				return handleUsage(req, res, decodeURIComponent(path.slice('/usage/'.length)));
			}
			return send(res, 404, { ok: false });
		} catch (e) {
			return send(res, 500, { error: e.message });
		}
	});
}

const isMain = import.meta.url === `file://${process.argv[1]}`.replace(/\\/g, '/');
if (isMain) {
	const server = makeServer();
	server.listen(PORT, () => console.log(`[ai-proxy] listening on :${PORT}`));
}

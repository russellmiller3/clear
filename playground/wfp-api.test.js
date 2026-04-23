// playground/wfp-api.test.js
// Phase 7 TDD suite — playground/wfp-api.js wraps the Cloudflare Workers for
// Platforms REST surface. Every test mocks fetch; zero tests hit the real
// Cloudflare API. The wrapper is the ONLY place in the codebase that knows
// the URL shapes, headers, multipart semantics, and error mapping — so if
// Cloudflare changes their endpoint, we change one file.
//
// Constructor takes `{ apiToken, accountId, namespace, fetchImpl }`. Defaulting
// fetchImpl to globalThis.fetch is for production; every test injects its own.
//
// Cycles covered:
//   7.1  uploadScript  — multipart PUT with metadata + module files
//   7.2  provisionD1   — POST new DB with tenant-prefixed name + 409 retry
//   7.2b listD1        — list by prefix (for rollback/cleanup detection)
//   7.3  applyMigrations — POST SQL via D1 query endpoint
//   7.4  setSecrets    — one PUT per secret (CF has no batch endpoint)
//   7.5  attachDomain  — POST hostname to the script's domains endpoint
//   7.6  deleteScript  — DELETE the script (rollback path)

import { describe, it, expect, testAsync } from '../lib/testUtils.js';
import { WfpApi } from './wfp-api.js';

// Mini fetch stub. Returns a Response-like object with json()/text() so code
// under test can read the body like a real Response. Each call records its
// args so tests can assert URL/method/headers/body shape without any network
// going out. Never returns a rejected promise unless the test asks it to.
function makeFetchStub(responses = []) {
	const calls = [];
	let queue = Array.isArray(responses) ? [...responses] : [responses];
	async function fetchImpl(url, init) {
		calls.push({ url: String(url), init });
		const next = queue.shift();
		if (!next) {
			return new MockResponse(200, { success: true, result: {} });
		}
		if (typeof next === 'function') {
			return next(url, init);
		}
		return next;
	}
	fetchImpl.calls = calls;
	return fetchImpl;
}

// Minimal Response-ish value. Real Response works too, but this avoids
// pulling in a fake that tests can't introspect.
class MockResponse {
	constructor(status, body) {
		this.status = status;
		this.ok = status >= 200 && status < 300;
		this._body = body;
	}
	async json() {
		return this._body;
	}
	async text() {
		return typeof this._body === 'string' ? this._body : JSON.stringify(this._body);
	}
}

// ─────────────────────────────────────────────────────────────────────────
// Cycle 7.1 — uploadScript: multipart PUT with metadata + module files
// Canonical CF shape per docs.cloudflare.com/cloudflare-one (workers-for-platforms):
//   PUT /accounts/{id}/workers/dispatch/namespaces/{ns}/scripts/{slug}
//   Content-Type: multipart/form-data
//   Parts:
//     - metadata: JSON with { main_module, bindings, compatibility_date, ... }
//     - one part per module file, each with Content-Type: application/javascript+module
// ─────────────────────────────────────────────────────────────────────────

describe('WfpApi.uploadScript — Phase 7.1', () => {
	const baseOpts = {
		apiToken: 'test-token',
		accountId: 'acct-123',
		namespace: 'clear-apps',
	};

	it('PUTs to the correct dispatch namespace script URL', async () => {
		const fetchImpl = makeFetchStub([new MockResponse(200, { success: true })]);
		const api = new WfpApi({ ...baseOpts, fetchImpl });
		await api.uploadScript({
			scriptName: 'deals-acme',
			bundle: { 'src/index.js': 'export default { async fetch() { return new Response("hi"); } }' },
			bindings: [],
			compatibilityDate: '2025-04-01',
		});
		expect(fetchImpl.calls).toHaveLength(1);
		const { url, init } = fetchImpl.calls[0];
		expect(url).toBe('https://api.cloudflare.com/client/v4/accounts/acct-123/workers/dispatch/namespaces/clear-apps/scripts/deals-acme');
		expect(init.method).toBe('PUT');
	});

	it('sends Authorization: Bearer header with apiToken', async () => {
		const fetchImpl = makeFetchStub([new MockResponse(200, { success: true })]);
		const api = new WfpApi({ ...baseOpts, fetchImpl });
		await api.uploadScript({
			scriptName: 'deals-acme',
			bundle: { 'src/index.js': 'export default {};' },
			bindings: [],
			compatibilityDate: '2025-04-01',
		});
		const { init } = fetchImpl.calls[0];
		const headers = init.headers || {};
		// Headers may be a Headers object, Map, or plain object — normalize.
		const authValue = headers.Authorization || headers.authorization
			|| (typeof headers.get === 'function' ? headers.get('authorization') : null);
		expect(String(authValue)).toBe('Bearer test-token');
	});

	it('request body is FormData with a metadata part', async () => {
		const fetchImpl = makeFetchStub([new MockResponse(200, { success: true })]);
		const api = new WfpApi({ ...baseOpts, fetchImpl });
		await api.uploadScript({
			scriptName: 'deals-acme',
			bundle: { 'src/index.js': 'export default {};' },
			bindings: [{ type: 'd1', name: 'DB', id: 'd1-xyz' }],
			compatibilityDate: '2025-04-01',
		});
		const { init } = fetchImpl.calls[0];
		expect(init.body).toBeDefined();
		// Should be a FormData (Node 20+ native). Check via constructor name.
		expect(init.body.constructor.name).toBe('FormData');
	});

	it('metadata part contains main_module, bindings, compatibility_date', async () => {
		const fetchImpl = makeFetchStub([new MockResponse(200, { success: true })]);
		const api = new WfpApi({ ...baseOpts, fetchImpl });
		await api.uploadScript({
			scriptName: 'deals-acme',
			bundle: { 'src/index.js': 'export default {};' },
			bindings: [{ type: 'd1', name: 'DB', id: 'd1-xyz' }],
			compatibilityDate: '2025-04-01',
		});
		const { init } = fetchImpl.calls[0];
		const form = init.body;
		const metadataBlob = form.get('metadata');
		expect(metadataBlob).toBeDefined();
		const metadataText = typeof metadataBlob === 'string' ? metadataBlob : await metadataBlob.text();
		const metadata = JSON.parse(metadataText);
		expect(metadata.main_module).toBe('src/index.js');
		expect(metadata.compatibility_date).toBe('2025-04-01');
		expect(Array.isArray(metadata.bindings)).toBe(true);
		expect(metadata.bindings).toHaveLength(1);
		expect(metadata.bindings[0].name).toBe('DB');
	});

	it('every bundle file becomes a form part with application/javascript+module content-type', async () => {
		const fetchImpl = makeFetchStub([new MockResponse(200, { success: true })]);
		const api = new WfpApi({ ...baseOpts, fetchImpl });
		await api.uploadScript({
			scriptName: 'deals-acme',
			bundle: {
				'src/index.js': 'export default {};',
				'src/agents.js': 'export async function agent_x() {}',
				'src/workflows/onboarding.js': 'export class Onboard {}',
			},
			bindings: [],
			compatibilityDate: '2025-04-01',
		});
		const { init } = fetchImpl.calls[0];
		const form = init.body;
		const indexBlob = form.get('src/index.js');
		const agentsBlob = form.get('src/agents.js');
		const workflowBlob = form.get('src/workflows/onboarding.js');
		expect(indexBlob).toBeDefined();
		expect(agentsBlob).toBeDefined();
		expect(workflowBlob).toBeDefined();
		// The type should be application/javascript+module — FormData preserves it.
		expect(indexBlob.type).toBe('application/javascript+module');
	});

	it('throws a sanitized error on non-2xx response (no token leak)', async () => {
		const fetchImpl = makeFetchStub([new MockResponse(401, { success: false, errors: [{ message: 'invalid token' }] })]);
		const api = new WfpApi({ ...baseOpts, fetchImpl });
		let caught = null;
		try {
			await api.uploadScript({
				scriptName: 'deals-acme',
				bundle: { 'src/index.js': 'export default {};' },
				bindings: [],
				compatibilityDate: '2025-04-01',
			});
		} catch (e) {
			caught = e;
		}
		expect(caught).not.toBeNull();
		// Message must not leak the token under any circumstance — the caller
		// bubbles these errors through API responses that land in logs.
		expect(String(caught.message).includes('test-token')).toBe(false);
		expect(caught.status).toBe(401);
	});

	it('script name is encodeURIComponent-encoded so user slugs can never break the URL', async () => {
		const fetchImpl = makeFetchStub([new MockResponse(200, { success: true })]);
		const api = new WfpApi({ ...baseOpts, fetchImpl });
		// Slugs have sanitize guards upstream but defense-in-depth — the wrapper
		// must not trust its callers. A slug like 'a/b' should produce 'a%2Fb',
		// never 'a/b' in the URL path.
		await api.uploadScript({
			scriptName: 'weird/slug',
			bundle: { 'src/index.js': 'export default {};' },
			bindings: [],
			compatibilityDate: '2025-04-01',
		});
		const { url } = fetchImpl.calls[0];
		expect(url.endsWith('/scripts/weird%2Fslug')).toBe(true);
	});

	it('returns { ok: true, result } on success', async () => {
		const fetchImpl = makeFetchStub([new MockResponse(200, {
			success: true,
			result: { id: 'script-abc' },
		})]);
		const api = new WfpApi({ ...baseOpts, fetchImpl });
		const r = await api.uploadScript({
			scriptName: 'deals-acme',
			bundle: { 'src/index.js': 'export default {};' },
			bindings: [],
			compatibilityDate: '2025-04-01',
		});
		expect(r.ok).toBe(true);
		expect(r.result?.id).toBe('script-abc');
	});
});

// ─────────────────────────────────────────────────────────────────────────
// Cycle 7.2 — provisionD1: tenant-prefixed DB name + 409 retry
// CF: POST /accounts/{id}/d1/database with { name }. If 409 (name taken),
// append a short random hex suffix and retry up to 3 times. Happens after a
// soft-delete + re-deploy within CF's deletion grace window.
// ─────────────────────────────────────────────────────────────────────────

describe('WfpApi.provisionD1 — Phase 7.2', () => {
	const baseOpts = {
		apiToken: 'test-token',
		accountId: 'acct-123',
		namespace: 'clear-apps',
	};

	it('POSTs to the correct D1 creation URL', async () => {
		const fetchImpl = makeFetchStub([new MockResponse(200, {
			success: true,
			result: { uuid: 'd1-uuid-1' },
		})]);
		const api = new WfpApi({ ...baseOpts, fetchImpl });
		await api.provisionD1({ tenantSlug: 'clear-acme', appSlug: 'crm' });
		const { url, init } = fetchImpl.calls[0];
		expect(url).toBe('https://api.cloudflare.com/client/v4/accounts/acct-123/d1/database');
		expect(init.method).toBe('POST');
	});

	it('builds db name as tenant-app (tenant-prefixed — avoids cross-tenant collisions)', async () => {
		const fetchImpl = makeFetchStub([new MockResponse(200, {
			success: true,
			result: { uuid: 'd1-uuid-1' },
		})]);
		const api = new WfpApi({ ...baseOpts, fetchImpl });
		await api.provisionD1({ tenantSlug: 'clear-acme', appSlug: 'crm' });
		const { init } = fetchImpl.calls[0];
		const body = JSON.parse(init.body);
		// `clear-acme` + `crm` → `clear-acme-crm`. The tenant prefix means two
		// tenants both deploying "crm" never collide in the shared namespace.
		expect(body.name).toBe('clear-acme-crm');
	});

	it('returns { d1_database_id } from the CF response uuid field', async () => {
		const fetchImpl = makeFetchStub([new MockResponse(200, {
			success: true,
			result: { uuid: 'd1-abcdef', name: 'clear-acme-crm' },
		})]);
		const api = new WfpApi({ ...baseOpts, fetchImpl });
		const r = await api.provisionD1({ tenantSlug: 'clear-acme', appSlug: 'crm' });
		expect(r.ok).toBe(true);
		expect(r.d1_database_id).toBe('d1-abcdef');
	});

	it('on 409 (name taken) retries with a 4-hex suffix appended', async () => {
		// First call: 409 "name already exists". Second call: 200 with new uuid.
		const fetchImpl = makeFetchStub([
			new MockResponse(409, { success: false, errors: [{ code: 7511, message: 'name already exists' }] }),
			new MockResponse(200, { success: true, result: { uuid: 'd1-uuid-retry-1' } }),
		]);
		const api = new WfpApi({ ...baseOpts, fetchImpl });
		const r = await api.provisionD1({ tenantSlug: 'clear-acme', appSlug: 'crm' });
		expect(r.ok).toBe(true);
		expect(fetchImpl.calls).toHaveLength(2);
		// Second call body has the suffix-mangled name.
		const retryBody = JSON.parse(fetchImpl.calls[1].init.body);
		expect(/^clear-acme-crm-[0-9a-f]{4}$/.test(retryBody.name)).toBe(true);
	});

	it('gives up after 3 retries with a structured error', async () => {
		// Four 409s in a row — the wrapper should surface a specific error.
		const fetchImpl = makeFetchStub([
			new MockResponse(409, { success: false, errors: [{ code: 7511, message: 'name already exists' }] }),
			new MockResponse(409, { success: false, errors: [{ code: 7511, message: 'name already exists' }] }),
			new MockResponse(409, { success: false, errors: [{ code: 7511, message: 'name already exists' }] }),
			new MockResponse(409, { success: false, errors: [{ code: 7511, message: 'name already exists' }] }),
		]);
		const api = new WfpApi({ ...baseOpts, fetchImpl });
		let caught = null;
		try {
			await api.provisionD1({ tenantSlug: 'clear-acme', appSlug: 'crm' });
		} catch (e) { caught = e; }
		expect(caught).not.toBeNull();
		expect(caught.code).toBe('D1_NAME_COLLISION');
		// Should not have retried more than 3 times (1 original + 3 retries = 4 total).
		expect(fetchImpl.calls.length).toBe(4);
	});

	it('d1NameFor is exported as a pure function for downstream callers', async () => {
		const { d1NameFor } = await import('./wfp-api.js');
		expect(d1NameFor('clear-acme', 'crm')).toBe('clear-acme-crm');
		// Handles already-prefixed slugs gracefully (common when tenant slug is stored
		// with the "clear-" prefix already).
		expect(d1NameFor('clear-acme', 'deals')).toBe('clear-acme-deals');
	});
});

// ─────────────────────────────────────────────────────────────────────────
// Cycle 7.2b — listD1: list databases by prefix
// Used by rollback/cleanup to detect orphaned D1s. The CF endpoint supports
// ?name=<prefix>; the wrapper filters the returned array.
// ─────────────────────────────────────────────────────────────────────────

describe('WfpApi.listD1 — Phase 7.2b', () => {
	const baseOpts = {
		apiToken: 'test-token',
		accountId: 'acct-123',
		namespace: 'clear-apps',
	};

	it('GETs the D1 list endpoint', async () => {
		const fetchImpl = makeFetchStub([new MockResponse(200, {
			success: true,
			result: [
				{ uuid: 'd1-1', name: 'clear-acme-crm' },
				{ uuid: 'd1-2', name: 'clear-acme-deals' },
			],
		})]);
		const api = new WfpApi({ ...baseOpts, fetchImpl });
		await api.listD1({ namePrefix: 'clear-acme' });
		const { url, init } = fetchImpl.calls[0];
		expect(url.startsWith('https://api.cloudflare.com/client/v4/accounts/acct-123/d1/database')).toBe(true);
		expect(init.method).toBe('GET');
	});

	it('returns databases whose name starts with namePrefix', async () => {
		const fetchImpl = makeFetchStub([new MockResponse(200, {
			success: true,
			result: [
				{ uuid: 'd1-1', name: 'clear-acme-crm' },
				{ uuid: 'd1-2', name: 'clear-acme-deals' },
				{ uuid: 'd1-3', name: 'clear-other-crm' },
			],
		})]);
		const api = new WfpApi({ ...baseOpts, fetchImpl });
		const r = await api.listD1({ namePrefix: 'clear-acme' });
		expect(r.ok).toBe(true);
		expect(r.databases).toHaveLength(2);
		expect(r.databases[0].name).toBe('clear-acme-crm');
		expect(r.databases[1].name).toBe('clear-acme-deals');
	});

	it('returns empty array when nothing matches', async () => {
		const fetchImpl = makeFetchStub([new MockResponse(200, { success: true, result: [] })]);
		const api = new WfpApi({ ...baseOpts, fetchImpl });
		const r = await api.listD1({ namePrefix: 'unused-prefix' });
		expect(r.ok).toBe(true);
		expect(r.databases).toHaveLength(0);
	});
});

// ─────────────────────────────────────────────────────────────────────────
// Cycle 7.3 — applyMigrations: POST SQL to the D1 query endpoint
// POST /accounts/{id}/d1/database/{db_id}/query with { sql }. Migrations are
// joined with ';\n' (D1 parses multi-statement SQL).
// ─────────────────────────────────────────────────────────────────────────

describe('WfpApi.applyMigrations — Phase 7.3', () => {
	const baseOpts = {
		apiToken: 'test-token',
		accountId: 'acct-123',
		namespace: 'clear-apps',
	};

	it('POSTs to the correct D1 query URL', async () => {
		const fetchImpl = makeFetchStub([new MockResponse(200, { success: true, result: [] })]);
		const api = new WfpApi({ ...baseOpts, fetchImpl });
		await api.applyMigrations({ d1_database_id: 'db-xyz', sql: 'CREATE TABLE x(id INTEGER);' });
		const { url, init } = fetchImpl.calls[0];
		expect(url).toBe('https://api.cloudflare.com/client/v4/accounts/acct-123/d1/database/db-xyz/query');
		expect(init.method).toBe('POST');
	});

	it('sends sql in the JSON body', async () => {
		const fetchImpl = makeFetchStub([new MockResponse(200, { success: true, result: [] })]);
		const api = new WfpApi({ ...baseOpts, fetchImpl });
		await api.applyMigrations({ d1_database_id: 'db-xyz', sql: 'CREATE TABLE a(id INTEGER);\nCREATE TABLE b(id INTEGER);' });
		const body = JSON.parse(fetchImpl.calls[0].init.body);
		expect(body.sql).toContain('CREATE TABLE a');
		expect(body.sql).toContain('CREATE TABLE b');
	});

	it('surfaces SQL errors as a structured failure', async () => {
		const fetchImpl = makeFetchStub([new MockResponse(400, {
			success: false,
			errors: [{ code: 7500, message: 'syntax error near "WHERES"' }],
		})]);
		const api = new WfpApi({ ...baseOpts, fetchImpl });
		let caught = null;
		try {
			await api.applyMigrations({ d1_database_id: 'db-xyz', sql: 'WHERES 1=1' });
		} catch (e) { caught = e; }
		expect(caught).not.toBeNull();
		expect(caught.status).toBe(400);
		expect(String(caught.message)).toContain('syntax error');
	});

	it('d1_database_id is encodeURIComponent-encoded', async () => {
		const fetchImpl = makeFetchStub([new MockResponse(200, { success: true, result: [] })]);
		const api = new WfpApi({ ...baseOpts, fetchImpl });
		await api.applyMigrations({ d1_database_id: 'a/b/c', sql: 'SELECT 1' });
		expect(fetchImpl.calls[0].url).toContain('/database/a%2Fb%2Fc/query');
	});
});

// ─────────────────────────────────────────────────────────────────────────
// Cycle 7.4 — setSecrets: one PUT per secret (CF has no batch endpoint)
// PUT /accounts/{id}/workers/dispatch/namespaces/{ns}/scripts/{slug}/secrets
// Body: { name, text, type: 'secret_text' }. Run up to 3 concurrently so
// a 10-secret upload takes one round-trip, not ten.
// ─────────────────────────────────────────────────────────────────────────

describe('WfpApi.setSecrets — Phase 7.4', () => {
	const baseOpts = {
		apiToken: 'test-token',
		accountId: 'acct-123',
		namespace: 'clear-apps',
	};

	it('PUTs once per secret', async () => {
		const fetchImpl = makeFetchStub([
			new MockResponse(200, { success: true }),
			new MockResponse(200, { success: true }),
			new MockResponse(200, { success: true }),
		]);
		const api = new WfpApi({ ...baseOpts, fetchImpl });
		await api.setSecrets({
			scriptName: 'deals-acme',
			secrets: { STRIPE_KEY: 'sk_123', ANTHROPIC_API_KEY: 'ant_xyz', TENANT_JWT: 'tjwt_abc' },
		});
		expect(fetchImpl.calls).toHaveLength(3);
		for (const c of fetchImpl.calls) {
			expect(c.init.method).toBe('PUT');
			expect(c.url).toContain('/scripts/deals-acme/secrets');
		}
	});

	it('each PUT body has name + text + type=secret_text', async () => {
		const fetchImpl = makeFetchStub([new MockResponse(200, { success: true })]);
		const api = new WfpApi({ ...baseOpts, fetchImpl });
		await api.setSecrets({ scriptName: 'deals-acme', secrets: { STRIPE_KEY: 'sk_123' } });
		const body = JSON.parse(fetchImpl.calls[0].init.body);
		expect(body.name).toBe('STRIPE_KEY');
		expect(body.text).toBe('sk_123');
		expect(body.type).toBe('secret_text');
	});

	it('returns ok=false with error list when any secret upload fails', async () => {
		const fetchImpl = makeFetchStub([
			new MockResponse(200, { success: true }),
			new MockResponse(400, { success: false, errors: [{ message: 'secret too large' }] }),
			new MockResponse(200, { success: true }),
		]);
		const api = new WfpApi({ ...baseOpts, fetchImpl });
		const r = await api.setSecrets({
			scriptName: 'deals-acme',
			secrets: { A: '1', B: '2', C: '3' },
		});
		expect(r.ok).toBe(false);
		expect(r.failed).toHaveLength(1);
	});

	it('secret values never appear in error messages', async () => {
		const fetchImpl = makeFetchStub([new MockResponse(400, {
			success: false, errors: [{ message: 'invalid' }],
		})]);
		const api = new WfpApi({ ...baseOpts, fetchImpl });
		const r = await api.setSecrets({
			scriptName: 'deals-acme',
			secrets: { STRIPE_KEY: 'sk_live_reallylongsensitivekey' },
		});
		const joined = JSON.stringify(r);
		expect(joined.includes('sk_live_reallylongsensitivekey')).toBe(false);
	});

	it('empty secrets object is a no-op (no PUTs)', async () => {
		const fetchImpl = makeFetchStub([]);
		const api = new WfpApi({ ...baseOpts, fetchImpl });
		const r = await api.setSecrets({ scriptName: 'deals-acme', secrets: {} });
		expect(r.ok).toBe(true);
		expect(fetchImpl.calls).toHaveLength(0);
	});
});

// ─────────────────────────────────────────────────────────────────────────
// Cycle 7.5 — attachDomain: POST hostname to the script's domains endpoint
// POST /accounts/{id}/workers/dispatch/namespaces/{ns}/scripts/{slug}/domains
// with { hostname }. 200 on success, 409 on taken.
// ─────────────────────────────────────────────────────────────────────────

describe('WfpApi.attachDomain — Phase 7.5', () => {
	const baseOpts = {
		apiToken: 'test-token',
		accountId: 'acct-123',
		namespace: 'clear-apps',
	};

	it('POSTs to the script domains endpoint', async () => {
		const fetchImpl = makeFetchStub([new MockResponse(200, { success: true })]);
		const api = new WfpApi({ ...baseOpts, fetchImpl });
		await api.attachDomain({ scriptName: 'deals-acme', hostname: 'deals.acme.io' });
		const { url, init } = fetchImpl.calls[0];
		expect(url).toBe('https://api.cloudflare.com/client/v4/accounts/acct-123/workers/dispatch/namespaces/clear-apps/scripts/deals-acme/domains');
		expect(init.method).toBe('POST');
	});

	it('body contains the hostname', async () => {
		const fetchImpl = makeFetchStub([new MockResponse(200, { success: true })]);
		const api = new WfpApi({ ...baseOpts, fetchImpl });
		await api.attachDomain({ scriptName: 'deals-acme', hostname: 'deals.acme.io' });
		const body = JSON.parse(fetchImpl.calls[0].init.body);
		expect(body.hostname).toBe('deals.acme.io');
	});

	it('409 surfaces as code=DOMAIN_TAKEN', async () => {
		const fetchImpl = makeFetchStub([new MockResponse(409, {
			success: false,
			errors: [{ message: 'hostname already attached' }],
		})]);
		const api = new WfpApi({ ...baseOpts, fetchImpl });
		const r = await api.attachDomain({ scriptName: 'deals-acme', hostname: 'taken.example.com' });
		expect(r.ok).toBe(false);
		expect(r.code).toBe('DOMAIN_TAKEN');
	});

	it('generic non-2xx surfaces as code=DOMAIN_ATTACH_FAILED', async () => {
		const fetchImpl = makeFetchStub([new MockResponse(500, { success: false, errors: [{ message: 'boom' }] })]);
		const api = new WfpApi({ ...baseOpts, fetchImpl });
		const r = await api.attachDomain({ scriptName: 'deals-acme', hostname: 'd.example.com' });
		expect(r.ok).toBe(false);
		expect(r.code).toBe('DOMAIN_ATTACH_FAILED');
	});
});

// ─────────────────────────────────────────────────────────────────────────
// Cycle 7.6 — deleteScript: DELETE the script (rollback path)
// DELETE /accounts/{id}/workers/dispatch/namespaces/{ns}/scripts/{slug}
// Used by deploy-cloudflare.js rollback ladder when a later step fails.
// ─────────────────────────────────────────────────────────────────────────

describe('WfpApi.deleteScript — Phase 7.6', () => {
	const baseOpts = {
		apiToken: 'test-token',
		accountId: 'acct-123',
		namespace: 'clear-apps',
	};

	it('DELETEs the script URL', async () => {
		const fetchImpl = makeFetchStub([new MockResponse(200, { success: true })]);
		const api = new WfpApi({ ...baseOpts, fetchImpl });
		await api.deleteScript({ scriptName: 'deals-acme' });
		const { url, init } = fetchImpl.calls[0];
		expect(url).toBe('https://api.cloudflare.com/client/v4/accounts/acct-123/workers/dispatch/namespaces/clear-apps/scripts/deals-acme');
		expect(init.method).toBe('DELETE');
	});

	it('returns ok=true on 200', async () => {
		const fetchImpl = makeFetchStub([new MockResponse(200, { success: true })]);
		const api = new WfpApi({ ...baseOpts, fetchImpl });
		const r = await api.deleteScript({ scriptName: 'deals-acme' });
		expect(r.ok).toBe(true);
	});

	it('idempotent — returns ok=true on 404 (already gone)', async () => {
		const fetchImpl = makeFetchStub([new MockResponse(404, {
			success: false, errors: [{ message: 'not found' }],
		})]);
		const api = new WfpApi({ ...baseOpts, fetchImpl });
		const r = await api.deleteScript({ scriptName: 'gone-already' });
		expect(r.ok).toBe(true);
		expect(r.alreadyDeleted).toBe(true);
	});

	it('surfaces non-404 error codes', async () => {
		const fetchImpl = makeFetchStub([new MockResponse(500, { success: false, errors: [{ message: 'boom' }] })]);
		const api = new WfpApi({ ...baseOpts, fetchImpl });
		let caught = null;
		try {
			await api.deleteScript({ scriptName: 'deals-acme' });
		} catch (e) { caught = e; }
		expect(caught).not.toBeNull();
		expect(caught.status).toBe(500);
	});
});

// ─────────────────────────────────────────────────────────────────────────
// Cross-cutting: constructor defaults + token-safety
// ─────────────────────────────────────────────────────────────────────────

describe('WfpApi constructor — shared invariants', () => {
	it('defaults fetchImpl to globalThis.fetch when not provided', () => {
		const api = new WfpApi({ apiToken: 't', accountId: 'a', namespace: 'n' });
		// The stored impl ref should equal globalThis.fetch.
		expect(typeof api._fetchImpl).toBe('function');
	});

	it('throws when apiToken is missing', () => {
		let caught = null;
		try {
			new WfpApi({ accountId: 'a', namespace: 'n' });
		} catch (e) { caught = e; }
		expect(caught).not.toBeNull();
		expect(String(caught.message)).toContain('apiToken');
	});

	it('throws when accountId is missing', () => {
		let caught = null;
		try {
			new WfpApi({ apiToken: 't', namespace: 'n' });
		} catch (e) { caught = e; }
		expect(caught).not.toBeNull();
		expect(String(caught.message)).toContain('accountId');
	});

	it('throws when namespace is missing', () => {
		let caught = null;
		try {
			new WfpApi({ apiToken: 't', accountId: 'a' });
		} catch (e) { caught = e; }
		expect(caught).not.toBeNull();
		expect(String(caught.message)).toContain('namespace');
	});

	it('does not expose the apiToken on the instance', () => {
		const api = new WfpApi({ apiToken: 'super-secret-token', accountId: 'a', namespace: 'n' });
		// Easy mode: a naive serialization of the instance should not contain the token.
		const serialized = JSON.stringify(api, (k, v) => (typeof v === 'function' ? undefined : v));
		expect(serialized.includes('super-secret-token')).toBe(false);
	});
});

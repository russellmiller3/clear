// playground/security.test.js
// Cross-cutting security tests: sanitizer contracts, cross-tenant denial,
// and end-to-end 403/400 responses when the Studio deploy endpoints are
// hit with hostile input.

import { describe, it, expect, testAsync } from '../lib/testUtils.js';
import express from 'express';
import http from 'http';

import {
	sanitizeAppName, sanitizeAppSlug, sanitizeDomain, sanitizeTenantSlug,
	assertOwnership, ValidationError,
} from './sanitize.js';
import { wireDeploy } from './deploy.js';
import { InMemoryTenantStore } from './tenants.js';
import { signTenantJwt } from './ai-proxy/auth.js';

describe('sanitizeAppName', () => {
	it('accepts a normal fly app name', () => {
		expect(sanitizeAppName('clear-acme-todos-ab12cd')).toBe('clear-acme-todos-ab12cd');
	});
	it('rejects shell metacharacters', () => {
		try { sanitizeAppName('todos; rm -rf /'); throw new Error('should have thrown'); }
		catch (e) { expect(e.code).toBe('INVALID_APP_NAME'); }
	});
	it('rejects uppercase', () => {
		try { sanitizeAppName('ClearApp'); throw new Error('should have thrown'); }
		catch (e) { expect(e.code).toBe('INVALID_APP_NAME'); }
	});
	it('rejects leading hyphen', () => {
		try { sanitizeAppName('-bad'); throw new Error('should have thrown'); }
		catch (e) { expect(e.code).toBe('INVALID_APP_NAME'); }
	});
});

describe('sanitizeAppSlug', () => {
	it('accepts lowercase alphanumeric', () => {
		expect(sanitizeAppSlug('todos')).toBe('todos');
		expect(sanitizeAppSlug('my-app-1')).toBe('my-app-1');
	});
	it('rejects semicolons and shell chars (test 7.5)', () => {
		try { sanitizeAppSlug('todos; rm -rf /'); throw new Error('should have thrown'); }
		catch (e) { expect(e.code).toBe('INVALID_APP_SLUG'); }
	});
});

describe('sanitizeDomain', () => {
	it('accepts a normal domain', () => {
		expect(sanitizeDomain('deals.acme.com')).toBe('deals.acme.com');
	});
	it('accepts a lowercased+trimmed domain', () => {
		expect(sanitizeDomain('  Deals.Acme.COM  ')).toBe('deals.acme.com');
	});
	it('rejects spaces', () => {
		try { sanitizeDomain('foo bar.com'); throw new Error('should have thrown'); }
		catch (e) { expect(e.code).toBe('INVALID_DOMAIN'); }
	});
});

describe('assertOwnership (test 7.6)', () => {
	it('passes when app name starts with clear-<tenantSlug>-', () => {
		expect(assertOwnership('clear-acme', 'clear-acme-todos-ab12cd')).toBe(true);
	});
	it('throws CROSS_TENANT when app belongs to another tenant', () => {
		try { assertOwnership('clear-acme', 'clear-globex-todos-ab12cd'); throw new Error('should have thrown'); }
		catch (e) { expect(e.code).toBe('CROSS_TENANT'); }
	});
	it('handles tenant slug without the clear- prefix', () => {
		expect(assertOwnership('acme', 'clear-acme-todos-ab12cd')).toBe(true);
	});
});

async function startStudio() {
	process.env.BUILDER_URL = 'http://fake-builder';
	process.env.BUILDER_SHARED_SECRET = 'fake';
	process.env.TENANT_JWT_SECRET = 'sec-security-test';
	const app = express();
	app.use(express.json({ limit: '2mb' }));
	const { store } = wireDeploy(app, { store: new InMemoryTenantStore() });
	await store.upsert('clear-a', { slug: 'clear-a', plan: 'pro', apps_deployed: 0, ai_spent_cents: 0, ai_credit_cents: 1000 });
	await store.upsert('clear-b', { slug: 'clear-b', plan: 'pro', apps_deployed: 0, ai_spent_cents: 0, ai_credit_cents: 1000 });
	const server = app.listen(0);
	await new Promise(r => server.on('listening', r));
	const port = server.address().port;
	const cookieFor = slug => `clear_tenant=${encodeURIComponent(signTenantJwt(slug, 'sec-security-test', 3600))}`;
	return { port, cookieFor, store, close: () => new Promise(r => server.close(r)) };
}

function req(port, path, opts = {}) {
	return new Promise((res, rej) => {
		const b = opts.body ? Buffer.from(JSON.stringify(opts.body)) : null;
		const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
		if (b) headers['Content-Length'] = b.length;
		const r = http.request({ hostname: '127.0.0.1', port, path, method: opts.method || 'GET', headers }, (resp) => {
			const chunks = [];
			resp.on('data', c => chunks.push(c));
			resp.on('end', () => {
				try { res({ status: resp.statusCode, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) }); }
				catch { res({ status: resp.statusCode, body: Buffer.concat(chunks).toString('utf8') }); }
			});
		});
		r.on('error', rej);
		if (b) r.write(b);
		r.end();
	});
}

async function runSeq(label, fn) {
	try { await fn(); console.log(`✅ ${label}`); }
	catch (e) { console.log(`❌ ${label}\n   ${e.message}`); }
}

await (async () => {
	await runSeq('/api/deploy rejects appSlug with shell metachars (test 7.5)', async () => {
		const { port, cookieFor, close } = await startStudio();
		try {
			const r = await req(port, '/api/deploy', {
				method: 'POST',
				headers: { Cookie: cookieFor('clear-a') },
				body: { source: 'build for javascript backend\n\nwhen user requests data from /api/x:\n  send back 1\n', appSlug: 'todos; rm -rf /' },
			});
			expect(r.status).toBe(400);
			expect(r.body.code).toBe('INVALID_APP_SLUG');
		} finally { await close(); }
	});

	await runSeq('/api/rollback blocks cross-tenant (test 7.6)', async () => {
		const { port, cookieFor, close } = await startStudio();
		try {
			const r = await req(port, '/api/rollback', {
				method: 'POST',
				headers: { Cookie: cookieFor('clear-a') },
				body: { appName: 'clear-b-todos-ab1234', version: '1' },
			});
			expect(r.status).toBe(403);
			expect(r.body.code).toBe('CROSS_TENANT');
		} finally { await close(); }
	});

	await runSeq('/api/custom-domain blocks cross-tenant', async () => {
		const { port, cookieFor, close } = await startStudio();
		try {
			const r = await req(port, '/api/custom-domain', {
				method: 'POST',
				headers: { Cookie: cookieFor('clear-a') },
				body: { appName: 'clear-b-todos-ab1234', domain: 'x.example.com' },
			});
			expect(r.status).toBe(403);
			expect(r.body.code).toBe('CROSS_TENANT');
		} finally { await close(); }
	});

	await runSeq('/api/deploy-history/:app blocks cross-tenant', async () => {
		const { port, cookieFor, close } = await startStudio();
		try {
			const r = await req(port, '/api/deploy-history/clear-b-todos-ab1234', {
				headers: { Cookie: cookieFor('clear-a') },
			});
			expect(r.status).toBe(403);
			expect(r.body.code).toBe('CROSS_TENANT');
		} finally { await close(); }
	});

	await runSeq('/api/deploy rejects bad domain', async () => {
		const { port, cookieFor, close } = await startStudio();
		try {
			const r = await req(port, '/api/deploy', {
				method: 'POST',
				headers: { Cookie: cookieFor('clear-a') },
				body: { source: 'build for javascript backend\n\nwhen user requests data from /api/x:\n  send back 1\n', appSlug: 'ok', domain: 'no spaces allowed.com' },
			});
			expect(r.status).toBe(400);
			expect(r.body.code).toBe('INVALID_DOMAIN');
		} finally { await close(); }
	});
})();

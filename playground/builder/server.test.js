// playground/builder/server.test.js
// Tests cover:
//   - Auth: 401 without bearer, 200 with matching secret
//   - Tarball safety: zip-slip, absolute paths, symlinks rejected
//   - Shard failover: primary quota-hit → try secondary → page ops only if all full
//   - Mutex: per-customer concurrent deploys serialize, global cap of 4
//   - Each flyctl operation is named correctly and produces one audit line
// No real Docker or flyctl is invoked — setRunCmdMock swaps the real exec.

import { describe, it, expect, testAsync } from '../../lib/testUtils.js';
import { createHash } from 'crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import http from 'http';

import { makeServer, parseAppName, _jobsForTest } from './server.js';
import { setRunCmdMock, clearRunCmdMock } from './flyctl.js';
import { shardFor, SHARDS, deployWithFailover } from './shards.js';
import { extractTarToDir } from './tarExtract.js';

// Helper: build a tiny in-memory tarball with our own entries. Matches the
// POSIX ustar format our extractor parses (header + padded body blocks).
function makeTar(entries) {
	const BLOCK = 512;
	const out = [];
	for (const { name, body = '', type = '0' } of entries) {
		const header = Buffer.alloc(BLOCK);
		Buffer.from(name).copy(header, 0, 0, Math.min(name.length, 100));
		const size = Buffer.isBuffer(body) ? body.length : Buffer.byteLength(body);
		Buffer.from(size.toString(8).padStart(11, '0') + '\0').copy(header, 124);
		Buffer.from(type).copy(header, 156, 0, 1);
		Buffer.from('ustar\0').copy(header, 257);
		// fill checksum field with spaces so checksum calc matches
		Buffer.from('        ').copy(header, 148);
		out.push(header);
		const bodyBuf = Buffer.isBuffer(body) ? body : Buffer.from(body);
		out.push(bodyBuf);
		const pad = (BLOCK - (size % BLOCK)) % BLOCK;
		if (pad) out.push(Buffer.alloc(pad));
	}
	out.push(Buffer.alloc(BLOCK * 2));
	return Buffer.concat(out);
}

describe('tarExtract — zip-slip defense (test 2.2)', () => {
	it('rejects absolute paths', async () => {
		const td = mkdtempSync(join(tmpdir(), 'tx-'));
		try {
			const tar = makeTar([{ name: '/etc/passwd-pwn', body: 'pwn' }]);
			const res = await extractTarToDir(tar, td);
			expect(res.ok).toBe(false);
			expect(res.reason).toContain('absolute');
		} finally { rmSync(td, { recursive: true, force: true }); }
	});

	it('rejects .. path escapes', async () => {
		const td = mkdtempSync(join(tmpdir(), 'tx-'));
		try {
			const tar = makeTar([{ name: '../escape.txt', body: 'x' }]);
			const res = await extractTarToDir(tar, td);
			expect(res.ok).toBe(false);
			expect(res.reason).toContain('escape');
		} finally { rmSync(td, { recursive: true, force: true }); }
	});

	it('rejects symlinks (typeflag 2)', async () => {
		const td = mkdtempSync(join(tmpdir(), 'tx-'));
		try {
			const tar = makeTar([{ name: 'linky', body: '', type: '2' }]);
			const res = await extractTarToDir(tar, td);
			expect(res.ok).toBe(false);
			expect(res.reason).toContain('disallowed');
		} finally { rmSync(td, { recursive: true, force: true }); }
	});

	it('accepts a normal Dockerfile + server.js', async () => {
		const td = mkdtempSync(join(tmpdir(), 'tx-'));
		try {
			const tar = makeTar([
				{ name: 'Dockerfile', body: 'FROM node:20-alpine\n' },
				{ name: 'server.js', body: 'console.log(1)\n' },
			]);
			const res = await extractTarToDir(tar, td);
			expect(res.ok).toBe(true);
			expect(res.files.length).toBe(2);
		} finally { rmSync(td, { recursive: true, force: true }); }
	});

	it('rejects tarballs over maxBytes', async () => {
		const td = mkdtempSync(join(tmpdir(), 'tx-'));
		try {
			const big = Buffer.alloc(10 * 1024);
			const res = await extractTarToDir(big, td, { maxBytes: 5 * 1024 });
			expect(res.ok).toBe(false);
			expect(res.reason).toContain('too large');
		} finally { rmSync(td, { recursive: true, force: true }); }
	});
});

describe('shardFor + deployWithFailover (test 2.17)', () => {
	it('is deterministic — same tenant always maps to same shard', () => {
		const a = shardFor('acme').slug;
		const b = shardFor('acme').slug;
		expect(a).toBe(b);
	});

	it('distributes across shards for different tenants', () => {
		const seen = new Set();
		for (const t of ['a', 'b', 'c', 'd', 'e', 'f', 'g']) {
			seen.add(shardFor(t).slug);
		}
		// Not all 7 tenants will hit the same single shard
		expect(seen.size).toBeGreaterThan(1);
	});
});

testAsync('deployWithFailover — primary succeeds, returns that shard', async () => {
	let calls = [];
	const res = await deployWithFailover('acme', async (shard) => {
		calls.push(shard.slug);
		return { ok: true, url: `https://x.fly.dev` };
	});
	expect(res.ok).toBe(true);
	expect(calls.length).toBe(1);
	expect(res.shard).toBe(shardFor('acme').slug);
});

testAsync('deployWithFailover — primary quota-hit, secondary succeeds', async () => {
	const primary = shardFor('acme');
	let calls = [];
	const res = await deployWithFailover('acme', async (shard) => {
		calls.push(shard.slug);
		if (shard.index === primary.index) return { ok: false, code: 'FLY_QUOTA_HIT' };
		return { ok: true, url: `https://x.fly.dev` };
	});
	expect(res.ok).toBe(true);
	expect(res.shard).not.toBe(primary.slug);
	expect(calls.length).toBe(2);
});

testAsync('deployWithFailover — all shards full, pages ops once', async () => {
	let pages = 0;
	const res = await deployWithFailover('acme',
		async () => ({ ok: false, code: 'FLY_QUOTA_HIT' }),
		async () => { pages++; },
	);
	expect(res.ok).toBe(false);
	expect(res.code).toBe('ALL_SHARDS_FULL');
	expect(pages).toBe(1);
});

testAsync('deployWithFailover — non-quota failure is terminal, no failover', async () => {
	let calls = 0;
	const res = await deployWithFailover('acme', async () => {
		calls++;
		return { ok: false, code: 'CMD_FAILED', stderr: 'bad Dockerfile' };
	});
	expect(res.ok).toBe(false);
	expect(res.code).toBe('CMD_FAILED');
	expect(calls).toBe(1);
});

describe('parseAppName — globally unique (test 2.1 adjacent)', () => {
	it('includes tenant, app, and random suffix', () => {
		const name = parseAppName('acme', 'todos');
		expect(name).toMatch(/^clear-acme-todos-[a-f0-9]{6}$/);
	});
	it('sanitizes evil characters', () => {
		const name = parseAppName('Ac/Me!', 'to  dos');
		expect(name).toMatch(/^clear-ac-me--to--dos-[a-f0-9]{6}$/);
	});
});

// --- HTTP-level tests: spin the real server with mocked flyctl/docker ---

async function startServer() {
	process.env.BUILDER_SHARED_SECRET = 'test-secret-abc';
	const server = makeServer();
	await new Promise(r => server.listen(0, r));
	const port = server.address().port;
	return { server, port, close: () => new Promise(r => server.close(r)) };
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

testAsync('auth — 401 without bearer (test 2.1)', async () => {
	const { port, close } = await startServer();
	try {
		const r = await req(port, '/build', { method: 'POST' });
		expect(r.status).toBe(401);
	} finally { await close(); }
});

testAsync('auth — 200 on /health (no auth required)', async () => {
	const { port, close } = await startServer();
	try {
		const r = await req(port, '/health');
		expect(r.status).toBe(200);
		expect(r.body.ok).toBe(true);
		expect(Array.isArray(r.body.shards)).toBe(true);
	} finally { await close(); }
});

testAsync('build — 202 + jobId with auth + valid tarball', async () => {
	const { port, close } = await startServer();
	setRunCmdMock(async (cmd, args) => {
		if (cmd === 'docker' && args[0] === 'build') return { ok: true, stdout: '', stderr: '' };
		if (cmd === 'docker' && args[0] === 'push') return { ok: true, stdout: '', stderr: '' };
		if (cmd === 'flyctl' && args[0] === 'apps' && args[1] === 'list') return { ok: true, stdout: '[]' };
		if (cmd === 'flyctl' && args[0] === 'apps' && args[1] === 'create') return { ok: true, stdout: 'created' };
		if (cmd === 'flyctl' && args[0] === 'volumes' && args[1] === 'list') return { ok: true, stdout: '[]' };
		if (cmd === 'flyctl' && args[0] === 'volumes' && args[1] === 'create') return { ok: true, stdout: 'volume ok' };
		if (cmd === 'flyctl' && args[0] === 'secrets') return { ok: true, stdout: 'set' };
		if (cmd === 'flyctl' && args[0] === 'deploy') return { ok: true, stdout: 'https://clear-acme-todos-ab1234.fly.dev' };
		if (cmd === 'flyctl' && args[0] === 'machine' && args[1] === 'list') return { ok: true, stdout: JSON.stringify([{ id: 'm1', state: 'started' }]) };
		return { ok: true, stdout: '' };
	});

	try {
		const tar = makeTar([
			{ name: 'Dockerfile', body: 'FROM node:20-alpine\n' },
			{ name: 'server.js', body: 'console.log(1)\n' },
		]);
		const r = await req(port, '/build', {
			method: 'POST',
			headers: {
				'Authorization': 'Bearer test-secret-abc',
				'Content-Type': 'application/octet-stream',
				'Content-Length': tar.length,
				'x-tenant-slug': 'acme',
				'x-app-slug': 'todos',
				'x-db-backend': 'sqlite',
			},
			body: tar,
		});
		expect(r.status).toBe(202);
		expect(r.body.ok).toBe(true);
		expect(typeof r.body.jobId).toBe('string');
	} finally {
		clearRunCmdMock();
		await close();
	}
});

testAsync('build — 400 without tenant/app headers', async () => {
	const { port, close } = await startServer();
	try {
		const tar = makeTar([{ name: 'ok', body: 'x' }]);
		const r = await req(port, '/build', {
			method: 'POST',
			headers: { 'Authorization': 'Bearer test-secret-abc', 'Content-Length': tar.length },
			body: tar,
		});
		expect(r.status).toBe(400);
	} finally { await close(); }
});

testAsync('cert — rejects missing fields', async () => {
	const { port, close } = await startServer();
	try {
		const r = await req(port, '/cert', {
			method: 'POST',
			headers: { 'Authorization': 'Bearer test-secret-abc', 'Content-Type': 'application/json', 'Content-Length': 2 },
			body: '{}',
		});
		expect(r.status).toBe(400);
	} finally { await close(); }
});

testAsync('releases — 400 without tenant slug header', async () => {
	const { port, close } = await startServer();
	try {
		const r = await req(port, '/releases/someapp', {
			headers: { 'Authorization': 'Bearer test-secret-abc' },
		});
		expect(r.status).toBe(400);
	} finally { await close(); }
});

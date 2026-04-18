// playground/builder/server.js
// The builder: one always-on Fly machine that sits inside the Fly network
// so it can reach registry.fly.io and the Machines API with zero vpn setup.
// Studio POSTs a tarball + metadata; we validate, unpack, docker build,
// docker push, then flyctl deploy. Each phase can fail — we report the
// stage back so Studio can surface a precise error to the customer.
//
// Security posture: bearer token on every endpoint, tarball extraction is
// path-safe (see tarExtract.js), per-customer mutex to serialize concurrent
// deploys from the same tenant, global semaphore to cap total concurrency.
// Every flyctl invocation runs under a 5-minute timeout and produces one
// audit line — no silent retries on build, one retry on push.

import http from 'http';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { resolve, join } from 'path';
import { createHash, randomBytes } from 'crypto';

import { extractTarToDir } from './tarExtract.js';
import { SHARDS, shardFor, deployWithFailover } from './shards.js';
import {
	dockerBuild, dockerPush,
	listApps, createApp, setSecrets,
	createVolume, listVolumes, deployApp,
	listMachines, destroyMachine, waitForStarted,
	issueCert, rollbackApp, listReleases, destroyApp,
	createPostgres, attachPostgres,
} from './flyctl.js';

const PORT = parseInt(process.env.PORT || '8080', 10);
function sharedSecret() { return process.env.BUILDER_SHARED_SECRET || ''; }
const MAX_CONCURRENT = 4;
const MAX_TARBALL = 50 * 1024 * 1024;

const inflightByCustomer = new Map();
let globalInflight = 0;
const globalWaiters = [];
const jobs = new Map();

function acquireGlobalSlot() {
	if (globalInflight < MAX_CONCURRENT) {
		globalInflight++;
		return Promise.resolve();
	}
	return new Promise(res => {
		globalWaiters.push(() => { globalInflight++; res(); });
	});
}
function releaseGlobalSlot() {
	globalInflight--;
	const next = globalWaiters.shift();
	if (next) next();
}

async function withCustomerMutex(customerKey, fn) {
	const prev = inflightByCustomer.get(customerKey) || Promise.resolve();
	let done;
	const curr = new Promise(res => { done = res; });
	inflightByCustomer.set(customerKey, prev.then(() => curr));
	await prev.catch(() => {});
	await acquireGlobalSlot();
	try { return await fn(); }
	finally {
		releaseGlobalSlot();
		done();
		if (inflightByCustomer.get(customerKey) === curr) inflightByCustomer.delete(customerKey);
	}
}

function send(res, status, body) {
	const buf = Buffer.from(JSON.stringify(body));
	res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': buf.length });
	res.end(buf);
}

function authorized(req) {
	const h = req.headers.authorization || '';
	if (!h.startsWith('Bearer ')) return false;
	const given = h.slice(7);
	const secret = sharedSecret();
	if (!secret || given.length !== secret.length) return false;
	let diff = 0;
	for (let i = 0; i < given.length; i++) diff |= given.charCodeAt(i) ^ secret.charCodeAt(i);
	return diff === 0;
}

async function readJson(req, maxBytes = 2 * 1024 * 1024) {
	return new Promise((res, rej) => {
		const chunks = [];
		let size = 0;
		req.on('data', c => {
			size += c.length;
			if (size > maxBytes) { req.destroy(); return rej(new Error('body too large')); }
			chunks.push(c);
		});
		req.on('end', () => {
			try { res(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
			catch (e) { rej(e); }
		});
		req.on('error', rej);
	});
}

async function readBody(req, maxBytes) {
	return new Promise((res, rej) => {
		const chunks = [];
		let size = 0;
		req.on('data', c => {
			size += c.length;
			if (size > maxBytes) { req.destroy(); return rej(new Error('body too large')); }
			chunks.push(c);
		});
		req.on('end', () => res(Buffer.concat(chunks)));
		req.on('error', rej);
	});
}

function auditLog(event, details) {
	const line = JSON.stringify({ ts: new Date().toISOString(), event, ...details });
	console.log('[audit]', line);
}

function genFlyToml(appName, opts) {
	const { needsVolume, region = 'iad' } = opts;
	const mounts = needsVolume
		? `\n[mounts]\n  source = "clear_data"\n  destination = "/data"\n`
		: '';
	return `app = "${appName}"\nprimary_region = "${region}"\n\n[http_service]\n  internal_port = 3000\n  force_https = true\n  auto_stop_machines = "stop"\n  auto_start_machines = true\n  min_machines_running = 0\n\n[[vm]]\n  size = "shared-cpu-1x"\n  memory = "256mb"\n${mounts}`;
}

export function parseAppName(tenantSlug, appSlug) {
	const clean = s => (s || '').toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 32);
	const rand = randomBytes(3).toString('hex');
	return `clear-${clean(tenantSlug)}-${clean(appSlug)}-${rand}`;
}

async function doBuildAndDeploy({ tenantSlug, appSlug, existingAppName, tarball, secrets = {}, region = 'iad', dbBackend = 'sqlite' }) {
	const tempDir = mkdtempSync(join(tmpdir(), 'clear-build-'));
	try {
		const ext = await extractTarToDir(tarball, tempDir, { maxBytes: MAX_TARBALL });
		if (!ext.ok) {
			auditLog('extract_failed', { tenantSlug, reason: ext.reason });
			return { ok: false, stage: 'extract', reason: ext.reason };
		}

		const appName = existingAppName || parseAppName(tenantSlug, appSlug);
		const sha = createHash('sha256').update(tarball).digest('hex').slice(0, 12);
		const imageTag = `registry.fly.io/${appName}:${sha}`;

		const build = await dockerBuild(imageTag, tempDir, 300_000);
		if (!build.ok) {
			auditLog('build_failed', { tenantSlug, appName, code: build.code, stderr: lastLines(build.stderr, 20) });
			return { ok: false, stage: 'build', reason: build.code === 'TIMEOUT' ? 'timeout' : 'docker build failed', stderr: lastLines(build.stderr, 20) };
		}

		const push = await dockerPush(imageTag);
		if (!push.ok) {
			auditLog('push_failed', { tenantSlug, appName, stderr: lastLines(push.stderr, 20) });
			return { ok: false, stage: 'push', reason: 'docker push failed', stderr: lastLines(push.stderr, 20) };
		}

		const deployRes = await deployWithFailover(tenantSlug, async (shard) => {
			const token = shard.token;
			const appsRes = await listApps(token);
			if (!appsRes.ok) return appsRes;
			const found = Array.isArray(appsRes.apps) && appsRes.apps.some(a => a.Name === appName || a.name === appName);
			if (!found) {
				const cr = await createApp(appName, shard.slug, token);
				if (!cr.ok) return cr;
			}

			const needsVolume = dbBackend === 'sqlite';
			if (needsVolume) {
				const vols = await listVolumes(appName, token);
				const hasVolume = vols.ok && Array.isArray(vols.volumes) && vols.volumes.some(v => v.name === 'clear_data');
				if (!hasVolume) {
					const cv = await createVolume(appName, 'clear_data', 1, region, token);
					if (!cv.ok) return cv;
				}
			}

			if (dbBackend === 'postgresql') {
				const dbName = `clear-${tenantSlug}-db`.toLowerCase().replace(/[^a-z0-9-]/g, '-');
				const pgCreate = await createPostgres(dbName, region, token);
				// idempotent: ignore "already exists" type errors, proceed to attach
				const pgAttach = await attachPostgres(dbName, appName, token);
				if (!pgAttach.ok && !/already attached/i.test(pgAttach.stderr || '')) return pgAttach;
			}

			const secretSet = await setSecrets(appName, { JWT_SECRET: randomBytes(32).toString('hex'), ...secrets }, token);
			if (!secretSet.ok) return secretSet;

			writeFileSync(join(tempDir, 'fly.toml'), genFlyToml(appName, { needsVolume, region }));

			const dep = await deployApp(appName, imageTag, token);
			if (!dep.ok) return dep;

			const healthy = await waitForStarted(appName, token, { maxAttempts: 3, backoffMs: 4000 });
			if (!healthy.ok) {
				if (healthy.machine) await destroyMachine(healthy.machine.id, appName, token);
				return { ok: false, code: 'NEVER_HEALTHY', stderr: 'machine never reached started state' };
			}

			const url = extractUrl(dep.stdout) || `https://${appName}.fly.dev`;
			return { ok: true, url, appName };
		}, global.__opsNotifier);

		if (!deployRes.ok) {
			auditLog('deploy_failed', { tenantSlug, appName, code: deployRes.code });
			return { ok: false, stage: 'deploy', reason: deployRes.code || 'deploy failed', ...deployRes };
		}

		auditLog('deploy_ok', { tenantSlug, appName, shard: deployRes.shard, url: deployRes.url });
		return { ok: true, url: deployRes.url, appName, shard: deployRes.shard };
	} finally {
		rmSync(tempDir, { recursive: true, force: true });
	}
}

function extractUrl(stdout) {
	if (!stdout) return null;
	const m = stdout.match(/https:\/\/[a-z0-9-]+\.fly\.dev/i);
	return m ? m[0] : null;
}
function lastLines(s, n) {
	if (!s) return '';
	const lines = s.split('\n');
	return lines.slice(-n).join('\n');
}

export async function handleBuild(req, res) {
	if (!authorized(req)) return send(res, 401, { ok: false, reason: 'unauthorized' });

	const tenantSlug = req.headers['x-tenant-slug'];
	const appSlug = req.headers['x-app-slug'];
	const existingAppName = req.headers['x-app-name'] || null;
	const dbBackend = req.headers['x-db-backend'] || 'sqlite';
	const region = req.headers['x-region'] || 'iad';
	const secretsHeader = req.headers['x-secrets'];
	let secrets = {};
	if (secretsHeader) {
		try { secrets = JSON.parse(Buffer.from(secretsHeader, 'base64').toString('utf8')); }
		catch { return send(res, 400, { ok: false, reason: 'bad x-secrets header' }); }
	}
	if (!tenantSlug || !appSlug) return send(res, 400, { ok: false, reason: 'missing tenant/app slug' });

	let tarball;
	try { tarball = await readBody(req, MAX_TARBALL); }
	catch { return send(res, 413, { ok: false, reason: 'tarball too large' }); }

	const jobId = randomBytes(8).toString('hex');
	jobs.set(jobId, { status: 'queued', startedAt: Date.now() });

	// Kick off work; respond immediately with jobId so Studio can poll.
	withCustomerMutex(`${tenantSlug}/${appSlug}`, async () => {
		jobs.set(jobId, { ...jobs.get(jobId), status: 'running' });
		try {
			const result = await doBuildAndDeploy({ tenantSlug, appSlug, existingAppName, tarball, secrets, region, dbBackend });
			jobs.set(jobId, { ...jobs.get(jobId), status: result.ok ? 'ok' : 'failed', result, finishedAt: Date.now() });
		} catch (e) {
			jobs.set(jobId, { ...jobs.get(jobId), status: 'failed', result: { ok: false, reason: e.message }, finishedAt: Date.now() });
		}
	});

	return send(res, 202, { ok: true, jobId });
}

export function handleStatus(req, res, jobId) {
	if (!authorized(req)) return send(res, 401, { ok: false });
	const j = jobs.get(jobId);
	if (!j) return send(res, 404, { ok: false, reason: 'job not found' });
	return send(res, 200, { ok: true, ...j });
}

export async function handleCert(req, res) {
	if (!authorized(req)) return send(res, 401, { ok: false });
	let body;
	try { body = await readJson(req); } catch { return send(res, 400, { ok: false }); }
	const { domain, appName, tenantSlug } = body;
	if (!domain || !appName || !tenantSlug) return send(res, 400, { ok: false, reason: 'missing fields' });
	const shard = shardFor(tenantSlug);
	const r = await issueCert(domain, appName, shard.token);
	if (!r.ok) return send(res, 502, r);
	auditLog('cert_issued', { tenantSlug, appName, domain });
	return send(res, 200, { ok: true, stdout: r.stdout });
}

export async function handleRollback(req, res) {
	if (!authorized(req)) return send(res, 401, { ok: false });
	let body;
	try { body = await readJson(req); } catch { return send(res, 400, { ok: false }); }
	const { appName, version, tenantSlug } = body;
	if (!appName || !version || !tenantSlug) return send(res, 400, { ok: false });
	const shard = shardFor(tenantSlug);
	const r = await rollbackApp(version, appName, shard.token);
	auditLog('rollback', { tenantSlug, appName, version, ok: r.ok });
	return send(res, r.ok ? 200 : 502, r);
}

export async function handleReleases(req, res, appName, tenantSlug) {
	if (!authorized(req)) return send(res, 401, { ok: false });
	if (!tenantSlug) return send(res, 400, { ok: false, reason: 'missing x-tenant-slug' });
	const shard = shardFor(tenantSlug);
	const r = await listReleases(appName, shard.token);
	if (!r.ok) return send(res, 502, r);
	const releases = (r.releases || []).slice(0, 10).map(x => ({
		version: x.version ?? x.Version,
		created_at: x.created_at ?? x.CreatedAt,
		status: x.status ?? x.Status,
	}));
	return send(res, 200, { ok: true, releases });
}

export async function handleDestroy(req, res) {
	if (!authorized(req)) return send(res, 401, { ok: false });
	let body;
	try { body = await readJson(req); } catch { return send(res, 400, { ok: false }); }
	const { appName, tenantSlug } = body;
	if (!appName || !tenantSlug) return send(res, 400, { ok: false });
	const shard = shardFor(tenantSlug);
	const r = await destroyApp(appName, shard.token);
	auditLog('destroy', { tenantSlug, appName, ok: r.ok });
	return send(res, r.ok ? 200 : 502, r);
}

export async function handleHealth(req, res) {
	return send(res, 200, {
		ok: true,
		version: 'builder-1.0',
		inflight: globalInflight,
		waiters: globalWaiters.length,
		shards: SHARDS.map(s => s.slug),
	});
}

export function makeServer() {
	return http.createServer(async (req, res) => {
		try {
			const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
			const path = url.pathname;
			if (req.method === 'GET' && path === '/health') return handleHealth(req, res);
			if (req.method === 'POST' && path === '/build') return handleBuild(req, res);
			if (req.method === 'GET' && path.startsWith('/status/')) return handleStatus(req, res, path.slice('/status/'.length));
			if (req.method === 'POST' && path === '/cert') return handleCert(req, res);
			if (req.method === 'POST' && path === '/rollback') return handleRollback(req, res);
			if (req.method === 'POST' && path === '/destroy') return handleDestroy(req, res);
			if (req.method === 'GET' && path.startsWith('/releases/')) {
				return handleReleases(req, res, path.slice('/releases/'.length), req.headers['x-tenant-slug']);
			}
			return send(res, 404, { ok: false });
		} catch (e) {
			return send(res, 500, { ok: false, reason: e.message });
		}
	});
}

export { jobs as _jobsForTest };

const isMain = import.meta.url === `file://${process.argv[1]}`.replace(/\\/g, '/');
if (isMain) {
	const server = makeServer();
	server.listen(PORT, () => console.log(`[builder] listening on :${PORT}`));
}

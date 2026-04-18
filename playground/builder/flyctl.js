// playground/builder/flyctl.js
// Thin wrapper around flyctl and docker CLI invocations. Every command
// goes through runCmd so we can enforce one timeout, one audit-log line,
// and one place to swap in a mock during tests. Each named function
// returns { ok, stdout?, stderr?, code? } — we never let a child_process
// exception leak to callers, so the server can translate failures into
// HTTP responses instead of crashing.
//
// The mock seam is deliberately simple: tests call setRunCmdMock(fn) and
// the wrapper calls that function instead of spawning real processes.

import { execFile as execFileCb } from 'child_process';
import { promisify } from 'util';

const execFile = promisify(execFileCb);
const DEFAULT_TIMEOUT_MS = 300_000;

let _mock = null;
export function setRunCmdMock(fn) { _mock = fn; }
export function clearRunCmdMock() { _mock = null; }

export async function runCmd(cmd, args, opts = {}) {
	if (_mock) return _mock(cmd, args, opts);
	try {
		const { stdout, stderr } = await execFile(cmd, args, {
			cwd: opts.cwd,
			env: { ...process.env, ...(opts.env || {}) },
			timeout: opts.timeout || DEFAULT_TIMEOUT_MS,
			maxBuffer: 32 * 1024 * 1024,
		});
		return { ok: true, stdout, stderr };
	} catch (e) {
		if (e.killed && e.signal === 'SIGTERM') {
			return { ok: false, code: 'TIMEOUT', stderr: e.stderr || '' };
		}
		const stderr = e.stderr || '';
		if (/quota|exceeded|limit reached|max.*machines/i.test(stderr)) {
			return { ok: false, code: 'FLY_QUOTA_HIT', stderr };
		}
		return { ok: false, code: 'CMD_FAILED', stderr, stdout: e.stdout || '' };
	}
}

export async function dockerBuild(tag, cwd, timeoutMs = 300_000) {
	return runCmd('docker', [
		'build',
		'--cpu-quota', '100000',
		'--memory', '512m',
		'--network', 'bridge',
		'-t', tag,
		'.',
	], { cwd, timeout: timeoutMs });
}

export async function dockerPush(tag) {
	const first = await runCmd('docker', ['push', tag]);
	if (first.ok) return first;
	if (/5\d\d|timeout|network/i.test(first.stderr || '')) {
		return runCmd('docker', ['push', tag]);
	}
	return first;
}

export async function listApps(token) {
	const res = await runCmd('flyctl', ['apps', 'list', '--json'], { env: { FLY_API_TOKEN: token } });
	if (!res.ok) return res;
	try { return { ok: true, apps: JSON.parse(res.stdout) }; }
	catch { return { ok: false, code: 'BAD_JSON', stderr: res.stdout }; }
}

export async function createApp(appName, org, token) {
	return runCmd('flyctl', ['apps', 'create', appName, '--org', org], {
		env: { FLY_API_TOKEN: token },
	});
}

export async function setSecrets(appName, secrets, token) {
	const pairs = Object.entries(secrets).map(([k, v]) => `${k}=${v}`);
	return runCmd('flyctl', ['secrets', 'set', ...pairs, '--app', appName, '--stage'], {
		env: { FLY_API_TOKEN: token },
	});
}

export async function createVolume(appName, volumeName, sizeGB, region, token) {
	return runCmd('flyctl', [
		'volumes', 'create', volumeName,
		'--app', appName,
		'--region', region,
		'--size', String(sizeGB),
		'--yes',
	], { env: { FLY_API_TOKEN: token } });
}

export async function listVolumes(appName, token) {
	const res = await runCmd('flyctl', ['volumes', 'list', '--app', appName, '--json'], {
		env: { FLY_API_TOKEN: token },
	});
	if (!res.ok) return res;
	try { return { ok: true, volumes: JSON.parse(res.stdout) }; }
	catch { return { ok: false, code: 'BAD_JSON' }; }
}

export async function deployApp(appName, imageTag, token) {
	return runCmd('flyctl', ['deploy', '--image', imageTag, '--app', appName, '--yes'], {
		env: { FLY_API_TOKEN: token },
		timeout: 600_000,
	});
}

export async function listMachines(appName, token) {
	const res = await runCmd('flyctl', ['machine', 'list', '--app', appName, '--json'], {
		env: { FLY_API_TOKEN: token },
	});
	if (!res.ok) return res;
	try { return { ok: true, machines: JSON.parse(res.stdout) }; }
	catch { return { ok: false, code: 'BAD_JSON' }; }
}

export async function destroyMachine(machineId, appName, token) {
	return runCmd('flyctl', ['machine', 'destroy', machineId, '--app', appName, '--force'], {
		env: { FLY_API_TOKEN: token },
	});
}

export async function issueCert(domain, appName, token) {
	return runCmd('flyctl', ['certs', 'create', domain, '--app', appName], {
		env: { FLY_API_TOKEN: token },
	});
}

export async function rollbackApp(version, appName, token) {
	return runCmd('flyctl', ['releases', 'rollback', String(version), '--app', appName, '--yes'], {
		env: { FLY_API_TOKEN: token },
	});
}

export async function listReleases(appName, token) {
	const res = await runCmd('flyctl', ['releases', '--app', appName, '--json'], {
		env: { FLY_API_TOKEN: token },
	});
	if (!res.ok) return res;
	try { return { ok: true, releases: JSON.parse(res.stdout) }; }
	catch { return { ok: false, code: 'BAD_JSON' }; }
}

export async function destroyApp(appName, token) {
	return runCmd('flyctl', ['apps', 'destroy', appName, '--yes'], {
		env: { FLY_API_TOKEN: token },
	});
}

export async function createPostgres(dbName, region, token) {
	return runCmd('flyctl', [
		'postgres', 'create', '--name', dbName, '--region', region,
		'--vm-size', 'shared-cpu-1x', '--volume-size', '1', '--initial-cluster-size', '1',
	], { env: { FLY_API_TOKEN: token } });
}

export async function attachPostgres(dbName, appName, token) {
	return runCmd('flyctl', ['postgres', 'attach', dbName, '--app', appName, '--yes'], {
		env: { FLY_API_TOKEN: token },
	});
}

export async function waitForStarted(appName, token, opts = {}) {
	const maxAttempts = opts.maxAttempts ?? 3;
	const backoffMs = opts.backoffMs ?? 4000;
	for (let i = 0; i < maxAttempts; i++) {
		const res = await listMachines(appName, token);
		if (res.ok && Array.isArray(res.machines)) {
			const started = res.machines.find(m => m.state === 'started');
			if (started) return { ok: true, machine: started };
		}
		await new Promise(r => setTimeout(r, backoffMs * (i + 1)));
	}
	return { ok: false, code: 'NEVER_HEALTHY' };
}

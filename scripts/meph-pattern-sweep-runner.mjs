import { spawn } from 'child_process';
import { createWriteStream, existsSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const DEFAULT_PATTERN_PROBE_PORT = '3478';
const LAUNCHING_LOCK_TTL_MS = 60_000;

export function parseRunnerArgs(argv = process.argv.slice(2)) {
  const out = {
    backend: 'anthropic',
    model: 'claude-haiku-4-5-20251001',
    suite: 'broadFunctionalApps',
    timeoutMs: '600000',
    ab: '1',
    tag: 'broad',
    port: DEFAULT_PATTERN_PROBE_PORT,
    runId: null,
    detach: false,
    supervisor: false,
  };
  for (const arg of argv) {
    if (arg === '--detach') out.detach = true;
    else if (arg === '--supervisor') out.supervisor = true;
    else if (arg.startsWith('--backend=')) out.backend = arg.slice('--backend='.length);
    else if (arg.startsWith('--model=')) out.model = arg.slice('--model='.length);
    else if (arg.startsWith('--suite=')) out.suite = arg.slice('--suite='.length);
    else if (arg.startsWith('--timeout-ms=')) out.timeoutMs = arg.slice('--timeout-ms='.length);
    else if (arg.startsWith('--ab=')) out.ab = arg.slice('--ab='.length);
    else if (arg.startsWith('--tag=')) out.tag = arg.slice('--tag='.length).replace(/[^a-z0-9_-]/gi, '-');
    else if (arg.startsWith('--port=')) out.port = arg.slice('--port='.length).replace(/[^0-9]/g, '');
    else if (arg.startsWith('--run-id=')) out.runId = arg.slice('--run-id='.length).replace(/[^a-z0-9_.-]/gi, '-');
    else if (arg === '--help') out.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return out;
}

export function buildProbeEnv(baseEnv = process.env, opts = {}) {
  return {
    ...baseEnv,
    MEPH_PATTERN_PROBE_BACKEND: opts.backend || 'anthropic',
    MEPH_PATTERN_PROBE_MODEL: opts.model || 'claude-haiku-4-5-20251001',
    MEPH_PATTERN_PROBE_AB: opts.ab || '1',
    MEPH_PATTERN_PROBE_SUITE: opts.suite || 'broadFunctionalApps',
    MEPH_PATTERN_PROBE_TIMEOUT_MS: opts.timeoutMs || '600000',
    MEPH_PATTERN_PROBE_PORT: opts.port || DEFAULT_PATTERN_PROBE_PORT,
  };
}

export function defaultSweepPaths({
  tag = 'broad',
  runId = new Date().toISOString().replace(/[:.]/g, '-'),
  tempDir = tmpdir(),
} = {}) {
  const prefix = `clear-meph-pattern-${tag}-${runId}`;
  return {
    runId,
    out: join(tempDir, `${prefix}.out.log`),
    err: join(tempDir, `${prefix}.err.log`),
    exit: join(tempDir, `${prefix}.exit.txt`),
    pid: join(tempDir, `${prefix}.pid.txt`),
    lock: defaultSweepLockPath({ tempDir }),
  };
}

export function defaultSweepLockPath({ tempDir = tmpdir() } = {}) {
  return join(tempDir, 'clear-meph-pattern-sweep.lock.json');
}

function processExists(pid) {
  const n = Number(pid);
  if (!Number.isFinite(n) || n <= 0) return false;
  try {
    process.kill(n, 0);
    return true;
  } catch (err) {
    return err && err.code === 'EPERM';
  }
}

export function readSweepLock(lockPath = defaultSweepLockPath()) {
  if (!existsSync(lockPath)) return null;
  try {
    return JSON.parse(readFileSync(lockPath, 'utf8'));
  } catch {
    return { status: 'unreadable', lockPath };
  }
}

export function activeSweepLockReason(lock, {
  nowMs = Date.now(),
  isProcessAlive = processExists,
} = {}) {
  if (!lock) return '';
  for (const field of ['childPid', 'supervisorPid', 'pid']) {
    if (lock[field] && isProcessAlive(lock[field])) {
      return `${field} ${lock[field]} is still alive`;
    }
  }
  const ageMs = nowMs - Number(lock.createdAtMs || 0);
  if (lock.status === 'launching' && ageMs >= 0 && ageMs < LAUNCHING_LOCK_TTL_MS) {
    return `launch lock is only ${ageMs}ms old`;
  }
  if (lock.status === 'unreadable') {
    return 'lock file is unreadable';
  }
  return '';
}

export function acquireSweepLock({
  lockPath = defaultSweepLockPath(),
  runId = new Date().toISOString(),
  nowMs = Date.now(),
  isProcessAlive = processExists,
} = {}) {
  const existing = readSweepLock(lockPath);
  const reason = activeSweepLockReason(existing, { nowMs, isProcessAlive });
  if (reason) {
    throw new Error(`Meph pattern sweep already running: ${reason}. Lock: ${lockPath}`);
  }
  if (existing) rmSync(lockPath, { force: true });
  const lock = {
    runId,
    status: 'launching',
    pid: process.pid,
    createdAtMs: nowMs,
    updatedAtMs: nowMs,
  };
  try {
    writeFileSync(lockPath, JSON.stringify(lock, null, 2), { flag: 'wx' });
  } catch (err) {
    if (err && err.code === 'EEXIST') {
      const raced = readSweepLock(lockPath);
      const racedReason = activeSweepLockReason(raced, { nowMs, isProcessAlive }) || 'lock appeared during launch';
      throw new Error(`Meph pattern sweep already running: ${racedReason}. Lock: ${lockPath}`);
    }
    throw err;
  }
  return lock;
}

export function updateSweepLock(lockPath, patch, nowMs = Date.now()) {
  const existing = readSweepLock(lockPath) || {};
  const next = { ...existing, ...patch, updatedAtMs: nowMs };
  writeFileSync(lockPath, JSON.stringify(next, null, 2));
  return next;
}

export function releaseSweepLock(lockPath, runId) {
  const existing = readSweepLock(lockPath);
  if (!existing || (runId && existing.runId !== runId)) return false;
  rmSync(lockPath, { force: true });
  return true;
}

export function buildSupervisorArgs(opts, paths) {
  return [
    __filename,
    '--supervisor',
    `--backend=${opts.backend}`,
    `--model=${opts.model}`,
    `--suite=${opts.suite}`,
    `--timeout-ms=${opts.timeoutMs}`,
    `--ab=${opts.ab}`,
    `--tag=${opts.tag}`,
    `--port=${opts.port}`,
    `--run-id=${paths.runId}`,
  ];
}

export function isCliEntrypoint(argvPath = process.argv[1], modulePath = __filename) {
  return Boolean(argvPath) && resolve(argvPath) === resolve(modulePath);
}

function printHelp() {
  console.log(`Usage: node scripts/meph-pattern-sweep-runner.mjs [--detach] [--suite=name] [--model=name] [--timeout-ms=ms] [--tag=name]

Defaults:
  backend: anthropic
  model:   claude-haiku-4-5-20251001
  suite:   broadFunctionalApps
  ab:      1
`);
}

export function formatLaunchSummary({ child, paths }) {
  return [
    `RUN_ID=${paths.runId}`,
    `PID=${child.pid || ''}`,
    `OUT=${paths.out}`,
    `ERR=${paths.err}`,
    `EXIT=${paths.exit}`,
    `LOCK=${paths.lock}`,
    '',
  ].join('\n');
}

export function startSweep({ opts = parseRunnerArgs(), paths = defaultSweepPaths({ tag: opts.tag }) } = {}) {
  const lockPath = paths.lock || defaultSweepLockPath();
  if (opts.supervisor) {
    const existing = readSweepLock(lockPath);
    if (!existing || existing.runId !== paths.runId) {
      acquireSweepLock({ lockPath, runId: paths.runId });
    }
  } else {
    acquireSweepLock({ lockPath, runId: paths.runId });
  }

  for (const file of [paths.out, paths.err, paths.exit, paths.pid]) {
    try { rmSync(file, { force: true }); } catch {}
  }
  writeFileSync(paths.out, '', { flag: 'w' });
  writeFileSync(paths.err, '', { flag: 'w' });

  if (opts.detach && !opts.supervisor) {
    const supervisor = spawn(process.execPath, buildSupervisorArgs(opts, paths), {
      cwd: repoRoot,
      env: process.env,
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    writeFileSync(paths.pid, `supervisor=${supervisor.pid || ''}`);
    updateSweepLock(lockPath, {
      status: 'supervising',
      supervisorPid: supervisor.pid || null,
      out: paths.out,
      err: paths.err,
      exit: paths.exit,
      pidFile: paths.pid,
    });
    supervisor.unref();
    return { child: supervisor, paths, done: Promise.resolve(null), lockPath };
  }

  const out = createWriteStream(paths.out, { flags: 'a' });
  const err = createWriteStream(paths.err, { flags: 'a' });

  const child = spawn(process.execPath, ['scripts/meph-pattern-live-probe.mjs'], {
    cwd: repoRoot,
    env: buildProbeEnv(process.env, opts),
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  writeFileSync(paths.pid, String(child.pid || ''));
  updateSweepLock(lockPath, {
    status: 'running',
    childPid: child.pid || null,
    out: paths.out,
    err: paths.err,
    exit: paths.exit,
    pidFile: paths.pid,
  });
  child.stdout.pipe(out);
  child.stderr.pipe(err);
  const done = new Promise(resolve => {
    child.on('error', error => {
      writeFileSync(paths.exit, `spawn-error:${error.message}`);
      releaseSweepLock(lockPath, paths.runId);
      resolve(1);
    });
    child.on('exit', code => {
      writeFileSync(paths.exit, String(code ?? 'null'));
      releaseSweepLock(lockPath, paths.runId);
      resolve(code ?? 1);
    });
  });
  return { child, paths, done, lockPath };
}

async function main() {
  const opts = parseRunnerArgs();
  if (opts.help) {
    printHelp();
    return;
  }
  const paths = defaultSweepPaths({ tag: opts.tag, runId: opts.runId || undefined });
  const { child, done } = startSweep({ opts, paths });
  await new Promise(resolve => {
    process.stdout.write(formatLaunchSummary({ child, paths }), resolve);
  });
  if (!opts.detach || opts.supervisor) {
    process.exitCode = await done;
  }
}

if (isCliEntrypoint()) {
  main().catch(err => {
    console.error(err.stack || err.message);
    process.exitCode = 1;
  });
}

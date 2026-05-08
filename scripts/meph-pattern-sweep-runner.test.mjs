import { describe, it, expect, run } from '../lib/testUtils.js';
import {
  acquireSweepLock,
  activeSweepLockReason,
  buildSupervisorArgs,
  buildProbeEnv,
  defaultSweepPaths,
  defaultSweepLockPath,
  formatLaunchSummary,
  isCliEntrypoint,
  parseRunnerArgs,
  readSweepLock,
  releaseSweepLock,
} from './meph-pattern-sweep-runner.mjs';
import { mkdtempSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('meph pattern sweep runner', () => {
  it('defaults to the broad Haiku A/B sweep without Sonnet or OpenRouter', () => {
    const env = buildProbeEnv({}, {});

    expect(env.MEPH_PATTERN_PROBE_BACKEND).toEqual('anthropic');
    expect(env.MEPH_PATTERN_PROBE_MODEL).toEqual('claude-haiku-4-5-20251001');
    expect(env.MEPH_PATTERN_PROBE_AB).toEqual('1');
    expect(env.MEPH_PATTERN_PROBE_SUITE).toEqual('broadFunctionalApps');
    expect(env.MEPH_PATTERN_PROBE_TIMEOUT_MS).toEqual('600000');
    expect(env.MEPH_PATTERN_PROBE_PORT).toEqual('3478');
  });

  it('accepts explicit suite/model overrides without shell quoting', () => {
    const args = parseRunnerArgs([
      '--suite=narrowApprovalQueue',
      '--model=claude-haiku-4-5-20251001',
      '--timeout-ms=12345',
      '--tag=retry',
      '--port=3499',
      '--run-id=abc123',
    ]);

    expect(args.suite).toEqual('narrowApprovalQueue');
    expect(args.model).toEqual('claude-haiku-4-5-20251001');
    expect(args.timeoutMs).toEqual('12345');
    expect(args.tag).toEqual('retry');
    expect(args.port).toEqual('3499');
    expect(args.runId).toEqual('abc123');
  });

  it('uses one stable run id for out/err/exit/pid paths', () => {
    const paths = defaultSweepPaths({ tag: 'broad', runId: 'abc123', tempDir: 'C:/tmp' });

    expect(paths.out).toContain('clear-meph-pattern-broad-abc123.out.log');
    expect(paths.err).toContain('clear-meph-pattern-broad-abc123.err.log');
    expect(paths.exit).toContain('clear-meph-pattern-broad-abc123.exit.txt');
    expect(paths.pid).toContain('clear-meph-pattern-broad-abc123.pid.txt');
    expect(paths.lock).toContain('clear-meph-pattern-sweep.lock.json');
  });

  it('builds detached supervisor args without shell command strings', () => {
    const opts = parseRunnerArgs(['--detach', '--tag=broad']);
    const paths = defaultSweepPaths({ tag: 'broad', runId: 'abc123', tempDir: 'C:/tmp' });
    const args = buildSupervisorArgs(opts, paths);
    const joined = args.join(' ');

    expect(args).toContain('--supervisor');
    expect(args).toContain('--run-id=abc123');
    expect(args).toContain('--port=3478');
    expect(joined).not.toContain('Start-Process');
    expect(joined).not.toContain('-Command');
  });

  it('recognizes relative Windows-style CLI entry paths', () => {
    const modulePath = join(process.cwd(), 'scripts', 'meph-pattern-sweep-runner.mjs');

    expect(isCliEntrypoint('scripts/meph-pattern-sweep-runner.mjs', modulePath)).toEqual(true);
  });

  it('formats a complete launch summary for detached runs', () => {
    const summary = formatLaunchSummary({
      child: { pid: 12345 },
      paths: {
        runId: 'run-1',
        out: 'C:/tmp/out.log',
        err: 'C:/tmp/err.log',
        exit: 'C:/tmp/exit.txt',
        lock: 'C:/tmp/lock.json',
      },
    });

    expect(summary).toContain('RUN_ID=run-1');
    expect(summary).toContain('PID=12345');
    expect(summary).toContain('OUT=C:/tmp/out.log');
    expect(summary).toContain('LOCK=C:/tmp/lock.json');
  });

  it('blocks a second sweep while a live lock exists', () => {
    const dir = mkdtempSync(join(tmpdir(), 'clear-sweep-lock-'));
    const lockPath = defaultSweepLockPath({ tempDir: dir });
    acquireSweepLock({
      lockPath,
      runId: 'first',
      nowMs: 1000,
      isProcessAlive: () => false,
    });

    let message = '';
    try {
      acquireSweepLock({
        lockPath,
        runId: 'second',
        nowMs: 2000,
        isProcessAlive: () => true,
      });
    } catch (err) {
      message = err.message;
    }

    expect(message).toContain('already running');
    expect(readSweepLock(lockPath).runId).toEqual('first');
    releaseSweepLock(lockPath, 'first');
  });

  it('removes stale sweep locks before acquiring a new one', () => {
    const dir = mkdtempSync(join(tmpdir(), 'clear-stale-sweep-lock-'));
    const lockPath = defaultSweepLockPath({ tempDir: dir });
    writeFileSync(lockPath, JSON.stringify({
      runId: 'old',
      status: 'running',
      childPid: 123456,
      createdAtMs: 1,
      updatedAtMs: 1,
    }));

    const lock = acquireSweepLock({
      lockPath,
      runId: 'new',
      nowMs: 120000,
      isProcessAlive: () => false,
    });

    expect(lock.runId).toEqual('new');
    expect(readSweepLock(lockPath).runId).toEqual('new');
    releaseSweepLock(lockPath, 'new');
  });

  it('treats a fresh launching lock as active even before child pid exists', () => {
    const reason = activeSweepLockReason({
      runId: 'launching',
      status: 'launching',
      createdAtMs: 1000,
    }, {
      nowMs: 1500,
      isProcessAlive: () => false,
    });

    expect(reason).toContain('launch lock');
  });
});

run();

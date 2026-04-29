import { describe, it, testAsync, expect, run } from '../../lib/testUtils.js';
import {
  partitionTasks,
  buildPrompt,
  runSweep,
  validateSweepPreconditions,
  computeTaskOutcome,
  gradeAbortedRun,
  detectInfraFailure,
  isWorkerDeathError,
  processBucket,
  buildPerLevelStats,
  formatPerLevelStats,
} from './curriculum-sweep.js';

describe('partitionTasks', () => {
  it('splits evenly when divisible', () => {
    const items = [1, 2, 3, 4, 5, 6];
    const buckets = partitionTasks(items, 3);
    expect(buckets.length).toEqual(3);
    expect(buckets[0]).toEqual([1, 4]);
    expect(buckets[1]).toEqual([2, 5]);
    expect(buckets[2]).toEqual([3, 6]);
  });

  it('handles remainder gracefully', () => {
    const items = [1, 2, 3, 4, 5, 6, 7];
    const buckets = partitionTasks(items, 3);
    expect(buckets[0].length).toEqual(3); // 1, 4, 7
    expect(buckets[1].length).toEqual(2); // 2, 5
    expect(buckets[2].length).toEqual(2); // 3, 6
  });

  it('handles fewer items than buckets', () => {
    const buckets = partitionTasks([1, 2], 5);
    expect(buckets.length).toEqual(5);
    expect(buckets[0]).toEqual([1]);
    expect(buckets[1]).toEqual([2]);
    expect(buckets[2]).toEqual([]);
  });

  it('handles empty input', () => {
    const buckets = partitionTasks([], 3);
    expect(buckets.length).toEqual(3);
    expect(buckets.every(b => b.length === 0)).toEqual(true);
  });
});

describe('buildPrompt', () => {
  it('includes task title, level, and description', () => {
    const task = {
      id: 'hello-world',
      level: 1,
      title: 'Hello World API',
      description: 'GET /api/hello returns { message: "hello" }',
      skeleton: 'build for javascript backend\n',
      tests: [{ method: 'GET', path: '/api/hello', expect: { status: 200 } }],
    };
    const prompt = buildPrompt(task);
    expect(prompt.includes('Hello World API')).toEqual(true);
    expect(prompt.includes('Level 1')).toEqual(true);
    expect(prompt.includes('GET /api/hello')).toEqual(true);
    expect(prompt.includes('TASK COMPLETE')).toEqual(true);
    expect(prompt.includes('STUCK:')).toEqual(true);
  });

  it('handles tasks with no skeleton', () => {
    const task = {
      id: 't', level: 1, title: 'T', description: 'desc',
      tests: [{ method: 'GET', path: '/' }],
    };
    const prompt = buildPrompt(task);
    expect(prompt.includes('# empty')).toEqual(true);
  });

  it('formats test expectations readably', () => {
    const task = {
      id: 't', level: 2, title: 'T', description: 'desc',
      skeleton: '',
      tests: [
        { method: 'POST', path: '/api/x', body: { name: 'Alice' }, expect: { status: 201 } },
        { method: 'GET', path: '/api/x', expect: { status: 200 } },
      ],
    };
    const prompt = buildPrompt(task);
    expect(prompt.includes('POST /api/x')).toEqual(true);
    expect(prompt.includes('"name":"Alice"')).toEqual(true);
    expect(prompt.includes('status":201')).toEqual(true);
  });
});

console.log('\nrunSweep dry-run\n');

await testAsync('runSweep dry-run: returns plan without spawning workers or hitting API', async () => {
  const result = await runSweep({
    workers: 2,
    taskFilter: ['hello-world', 'greeting'],
    dryRun: true,
  });
  expect(result.dryRun).toEqual(true);
  expect(result.tasksRun).toEqual(0);
});

await testAsync('runSweep dry-run: returns zero when taskFilter matches nothing', async () => {
  const result = await runSweep({ taskFilter: ['does-not-exist'], dryRun: true });
  expect(result.tasksRun).toEqual(0);
  expect(result.rowsAdded).toEqual(0);
});

describe('validateSweepPreconditions', () => {
  // GM-6 (2026-04-25): default flipped from "real Anthropic" to "cc-agent".
  // Reason: the production-Anthropic path costs money and Russell uses
  // cc-agent for everything overnight. Sweeps still ROUTE through real
  // Anthropic — the caller passes opts.real=true (CLI flag --real) to
  // explicitly opt into spend.
  it('defaults to cc-agent when neither MEPH_BRAIN nor opts.real is set', () => {
    const result = validateSweepPreconditions({ /* no env */ });
    expect(result.ok).toEqual(true);
    expect(result.needsApiPreflight).toEqual(false);
    expect(result.backend).toEqual('cc-agent');
    expect(result.defaulted).toEqual(true);
  });

  it('requires ANTHROPIC_API_KEY when opts.real is true', () => {
    const result = validateSweepPreconditions({ /* no key */ }, { real: true });
    expect(result.ok).toEqual(false);
    expect(result.reason.includes('ANTHROPIC_API_KEY')).toEqual(true);
  });

  it('accepts ANTHROPIC_API_KEY when opts.real is true', () => {
    const result = validateSweepPreconditions({ ANTHROPIC_API_KEY: 'sk-ant-test' }, { real: true });
    expect(result.ok).toEqual(true);
    expect(result.needsApiPreflight).toEqual(true);
  });

  it('opts.real with no key fails even if MEPH_BRAIN is set — explicit beats inferred', () => {
    // Russell explicitly asked for production via --real; we don't silently
    // route around the missing key just because MEPH_BRAIN happens to be
    // exported in his shell. Surface the misconfiguration clearly.
    const result = validateSweepPreconditions({ MEPH_BRAIN: 'cc-agent' }, { real: true });
    expect(result.ok).toEqual(false);
    expect(result.reason.includes('ANTHROPIC_API_KEY')).toEqual(true);
  });

  it('bypasses API key requirement when MEPH_BRAIN=cc-agent', () => {
    // cc-agent uses the `claude` CLI subscription, not a direct API call.
    // Preflight hits api.anthropic.com with the key — if the key is maxed out
    // (monthly cap) the sweep aborts even though cc-agent would have worked.
    // That's the exact scenario cc-agent was built for. Skip both checks.
    const result = validateSweepPreconditions({ MEPH_BRAIN: 'cc-agent' });
    expect(result.ok).toEqual(true);
    expect(result.needsApiPreflight).toEqual(false);
  });

  it('bypasses API key requirement for any non-empty MEPH_BRAIN', () => {
    // Not just cc-agent — ollama:qwen, openrouter:kimi-k2, etc. all route
    // around the Anthropic API. If someone sets MEPH_BRAIN, they've opted
    // out of the Anthropic path, period.
    for (const brain of ['ollama:qwen', 'openrouter:kimi-k2', 'haiku-dev']) {
      const result = validateSweepPreconditions({ MEPH_BRAIN: brain });
      expect(result.ok).toEqual(true);
      expect(result.needsApiPreflight).toEqual(false);
    }
  });

  it('treats empty MEPH_BRAIN like unset (post-GM-6: defaults to cc-agent)', () => {
    const result = validateSweepPreconditions({ MEPH_BRAIN: '' });
    expect(result.ok).toEqual(true);
    expect(result.backend).toEqual('cc-agent');
    expect(result.defaulted).toEqual(true);
  });

  it('treats whitespace-only MEPH_BRAIN like unset', () => {
    const result = validateSweepPreconditions({ MEPH_BRAIN: '   ' });
    expect(result.ok).toEqual(true);
    expect(result.backend).toEqual('cc-agent');
  });
});

describe('computeTaskOutcome', () => {
  // Default (loose) mode: EITHER saidTaskComplete OR dbPassed counts as ok.
  // This is the legacy behavior — preserved so sweeps run before today's
  // change still produce the same graded results.
  it('loose mode: dbPassed alone → ok', () => {
    const r = computeTaskOutcome({ dbPassed: true, saidTaskComplete: false });
    expect(r.ok).toEqual(true);
  });

  it('loose mode: saidTaskComplete alone → ok', () => {
    const r = computeTaskOutcome({ dbPassed: false, saidTaskComplete: true });
    expect(r.ok).toEqual(true);
  });

  it('loose mode: neither signal → not ok', () => {
    const r = computeTaskOutcome({ dbPassed: false, saidTaskComplete: false });
    expect(r.ok).toEqual(false);
  });

  // Strict mode: requires dbPassed (test_pass=1 row written).
  // saidTaskComplete alone is NOT enough — Meph can say "TASK COMPLETE"
  // without actually writing + running a test that passes. For filling
  // Factor DB with reliable training data, strict is the honest grade.
  it('strict mode: dbPassed + saidTaskComplete → ok', () => {
    const r = computeTaskOutcome({ dbPassed: true, saidTaskComplete: true, strict: true });
    expect(r.ok).toEqual(true);
  });

  it('strict mode: dbPassed alone → ok', () => {
    const r = computeTaskOutcome({ dbPassed: true, saidTaskComplete: false, strict: true });
    expect(r.ok).toEqual(true);
  });

  it('strict mode: saidTaskComplete alone → NOT ok (loophole closed)', () => {
    // The honeypot: Meph signals "TASK COMPLETE" without producing passing
    // tests. In loose mode this gets graded ✅ and poisons the training
    // data. Strict mode refuses.
    const r = computeTaskOutcome({ dbPassed: false, saidTaskComplete: true, strict: true });
    expect(r.ok).toEqual(false);
    expect(r.reason && r.reason.includes('TASK COMPLETE')).toEqual(true);
  });

  it('strict mode: neither signal → not ok', () => {
    const r = computeTaskOutcome({ dbPassed: false, saidTaskComplete: false, strict: true });
    expect(r.ok).toEqual(false);
  });
});

describe('gradeAbortedRun', () => {
  // When the sweep's per-task timeout aborts mid-stream, the original
  // grader returned ok:false without checking the Factor DB. But Meph
  // often completes the task (writing a test_pass=1 row) and simply
  // doesn't finish saying "TASK COMPLETE" before the abort. Those are
  // real passes that were getting graded as timeouts — ~7/38 rows on
  // the 04-23 sweep. gradeAbortedRun closes the gap: DB truth beats
  // wall-clock budget.

  function fakeDbWithPass() {
    return { _db: { prepare: () => ({ get: () => ({ '1': 1 }) }) } };
  }
  function fakeDbNoPass() {
    return { _db: { prepare: () => ({ get: () => undefined }) }, };
  }
  function fakeDbThatThrows() {
    return { _db: { prepare: () => { throw new Error('sqlite is sad'); } } };
  }

  it('returns ok=true + timedOut=false when a passing row exists after startMs', () => {
    const r = gradeAbortedRun(fakeDbWithPass(), 100);
    expect(r.ok).toEqual(true);
    expect(r.timedOut).toEqual(false);
    expect(r.dbPassed).toEqual(true);
  });

  it('returns ok=false + timedOut=true when no passing row exists', () => {
    const r = gradeAbortedRun(fakeDbNoPass(), 100);
    expect(r.ok).toEqual(false);
    expect(r.timedOut).toEqual(true);
    expect(r.dbPassed).toEqual(false);
  });

  it('returns timedOut=true when factorDB is null (no way to check)', () => {
    const r = gradeAbortedRun(null, 100);
    expect(r.ok).toEqual(false);
    expect(r.timedOut).toEqual(true);
    expect(r.dbPassed).toEqual(false);
  });

  it('swallows sqlite errors and treats as no pass (timedOut=true)', () => {
    const r = gradeAbortedRun(fakeDbThatThrows(), 100);
    expect(r.ok).toEqual(false);
    expect(r.timedOut).toEqual(true);
    expect(r.dbPassed).toEqual(false);
  });
});

describe('detectInfraFailure', () => {
  // The "no Meph activity" pattern: chat handler returned 200 OK with an
  // empty SSE stream — no compile rows, no TASK COMPLETE, no STUCK signal,
  // sub-5s elapsed. This is infrastructure failure (cc-agent dead, MCP
  // server broken, worker silently falling through), NOT a Meph task
  // failure. Don't pollute pass-rate data with these. The 04-29 hint
  // sweep ran 30 such trials before this guard existed.

  it('flags a sub-5s trial with zero activity as infra failure', () => {
    const flagged = detectInfraFailure({
      elapsedMs: 2300,
      dbPassed: false,
      saidTaskComplete: false,
      stuck: false,
      rowsInWindow: 0,
    });
    expect(flagged).toEqual(true);
  });

  it('does NOT flag a slow trial with zero activity (Meph timed out trying)', () => {
    const flagged = detectInfraFailure({
      elapsedMs: 30000,
      dbPassed: false,
      saidTaskComplete: false,
      stuck: false,
      rowsInWindow: 0,
    });
    expect(flagged).toEqual(false);
  });

  it('does NOT flag a fast trial that passed (rare but possible)', () => {
    const flagged = detectInfraFailure({
      elapsedMs: 2300,
      dbPassed: true,
      saidTaskComplete: false,
      stuck: false,
      rowsInWindow: 5,
    });
    expect(flagged).toEqual(false);
  });

  it('does NOT flag a fast trial where Meph at least compiled', () => {
    const flagged = detectInfraFailure({
      elapsedMs: 2300,
      dbPassed: false,
      saidTaskComplete: false,
      stuck: false,
      rowsInWindow: 1,
    });
    expect(flagged).toEqual(false);
  });

  it('does NOT flag a fast STUCK exit (Meph honestly gave up)', () => {
    const flagged = detectInfraFailure({
      elapsedMs: 2300,
      dbPassed: false,
      saidTaskComplete: false,
      stuck: true,
      rowsInWindow: 0,
    });
    expect(flagged).toEqual(false);
  });

  it('does NOT flag a fast TASK COMPLETE (Meph claimed done)', () => {
    const flagged = detectInfraFailure({
      elapsedMs: 2300,
      dbPassed: false,
      saidTaskComplete: true,
      stuck: false,
      rowsInWindow: 0,
    });
    expect(flagged).toEqual(false);
  });

  it('boundary: exactly 5000ms is NOT flagged (slow enough that Meph likely tried)', () => {
    const flagged = detectInfraFailure({
      elapsedMs: 5000,
      dbPassed: false,
      saidTaskComplete: false,
      stuck: false,
      rowsInWindow: 0,
    });
    expect(flagged).toEqual(false);
  });
});

describe('worker death detection', () => {
  it('recognizes ECONNRESET-style fetch failures as worker death', () => {
    const err = Object.assign(new TypeError('fetch failed'), {
      cause: Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' }),
    });
    expect(isWorkerDeathError(err)).toEqual(true);
    expect(isWorkerDeathError(new Error('HTTP 500'))).toEqual(false);
  });
});

await testAsync('processBucket: worker death skips remaining tasks without retrying the dead worker', async () => {
  const tasks = [
    { id: 'l7-hard-one', level: 7, title: 'Hard One', description: '', tests: [] },
    { id: 'l8-hard-two', level: 8, title: 'Hard Two', description: '', tests: [] },
    { id: 'l9-hard-three', level: 9, title: 'Hard Three', description: '', tests: [] },
  ];
  const attempts = [];
  const reported = [];

  const results = await processBucket(3499, tasks, 5000, (task, result) => {
    reported.push({ task: task.id, status: result.status, skipped: !!result.skipped });
  }, null, {
    driveTask: async (_port, prompt) => {
      attempts.push(prompt);
      return {
        ok: false,
        stuck: false,
        timedOut: false,
        workerDied: true,
        status: 'worker-died',
        error: 'read ECONNRESET',
      };
    },
  });

  expect(attempts.length).toEqual(1);
  expect(results.length).toEqual(3);
  expect(results.map(r => r.task)).toEqual(['l7-hard-one', 'l8-hard-two', 'l9-hard-three']);
  expect(results.every(r => r.status === 'worker-died')).toEqual(true);
  expect(results[0].skipped).toEqual(false);
  expect(results[1].skipped).toEqual(true);
  expect(results[2].skipped).toEqual(true);
  expect(reported.map(r => `${r.task}:${r.status}:${r.skipped}`)).toEqual([
    'l7-hard-one:worker-died:false',
    'l8-hard-two:worker-died:true',
    'l9-hard-three:worker-died:true',
  ]);
});

describe('per-level stats', () => {
  it('groups completed, timeout, worker-died, stuck, and failed results by curriculum level', () => {
    const stats = buildPerLevelStats([
      { task: 'l1-a', level: 1, ok: true },
      { task: 'l1-b', level: 1, timedOut: true },
      { task: 'l7-a', level: 7, workerDied: true, skipped: true },
      { task: 'l7-b', level: 7, stuck: true },
      { task: 'l10-a', level: 10, error: 'boom' },
    ]);

    expect(stats).toEqual([
      { level: 1, total: 2, completed: 1, stuck: 0, timedOut: 1, workerDied: 0, failed: 0, skipped: 0, passRate: 0.5 },
      { level: 7, total: 2, completed: 0, stuck: 1, timedOut: 0, workerDied: 1, failed: 0, skipped: 1, passRate: 0 },
      { level: 10, total: 1, completed: 0, stuck: 0, timedOut: 0, workerDied: 0, failed: 1, skipped: 0, passRate: 0 },
    ]);
  });

  it('formats per-level stats as a compact sweep table', () => {
    const table = formatPerLevelStats([
      { level: 1, total: 2, completed: 1, stuck: 0, timedOut: 1, workerDied: 0, failed: 0, skipped: 0, passRate: 0.5 },
      { level: 7, total: 2, completed: 0, stuck: 1, timedOut: 0, workerDied: 1, failed: 0, skipped: 1, passRate: 0 },
    ]);

    expect(table.includes('L1')).toEqual(true);
    expect(table.includes('1/2')).toEqual(true);
    expect(table.includes('50%')).toEqual(true);
    expect(table.includes('worker-died')).toEqual(true);
  });
});

run();

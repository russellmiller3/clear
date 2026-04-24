// AB Hint Sweep — measures whether the re-ranker's hints actually lift
// Meph's live pass rate (Session 44 Track 1.3).
//
// Passive observational data is confounded by selection bias: hints fire
// when Meph is struggling, so "with-hints passes less" is uninterpretable.
// This runner flips the script by CONTROLLING the hint variable via env
// flag (CLEAR_HINT_DISABLE=1) and comparing pass rate across interleaved
// trials of the same tasks.
//
// Design:
//   - Pick 2 middle-difficulty tasks where Meph's pass rate is near 50%
//     (counter L3, todo-crud L4). If hints move the needle, we'll see it.
//   - 10 trials per condition per task = 40 trials total.
//   - Runs in TWO passes: (1) hint_on condition — workers spawned with
//     CLEAR_HINT_DISABLE unset, (2) hint_off — CLEAR_HINT_DISABLE=1.
//     Workers inherit env from this parent process, so we mutate
//     process.env between passes.
//   - Each trial's pass/fail comes from the Factor DB row-window grader
//     (the same one used by curriculum-sweep).
//
// Usage:
//   MEPH_BRAIN=cc-agent GHOST_MEPH_CC_TOOLS=1 \
//     node playground/supervisor/ab-hint-sweep.js \
//       --tasks=counter,todo-crud --trials=10 --workers=1 --strict
//
// Wall-clock estimate (workers=1, 40 trials × ~100s avg): ~70 min.
// Wall-clock estimate (workers=2): ~35 min (some parallel grader over-count
// risk — interpret cautiously or re-run serial to confirm).
// Cost: $0 on Russell's Claude subscription via cc-agent.

import { SessionRegistry } from './registry.js';
import { WorkerSpawner } from './spawner.js';
import { FactorDB } from './factor-db.js';
import { tasks as allTasks } from '../../curriculum/index.js';
import { buildPrompt, driveTaskOnWorker, partitionTasks, validateSweepPreconditions } from './curriculum-sweep.js';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, writeFileSync, unlinkSync, realpathSync, existsSync, mkdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

// Load .env (same convention as curriculum-sweep)
const _envPath = join(ROOT, '.env');
if (existsSync(_envPath)) {
  readFileSync(_envPath, 'utf8').split('\n').forEach(rawLine => {
    const line = rawLine.replace(/\r$/, '');
    const eq = line.indexOf('=');
    if (eq > 0 && !line.startsWith('#')) {
      const k = line.slice(0, eq).trim();
      if (!process.env[k]) process.env[k] = line.slice(eq + 1).trim();
    }
  });
}

const FACTOR_DB_PATH = join(__dirname, '..', 'factor-db.sqlite');
const AB_REGISTRY_PATH = process.env.CLEAR_AB_REGISTRY || '/tmp/ab-sweep-registry.db';
const WORKER_BASE_PORT = Number(process.env.CLEAR_AB_PORT_BASE) || 3500;

function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

async function waitForWorkerReady(port, maxMs = 15000) {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`http://localhost:${port}/api/worker-heartbeat`, {
        signal: AbortSignal.timeout(500),
      });
      if (r.ok) return true;
    } catch { /* not ready yet */ }
    await wait(250);
  }
  return false;
}

/**
 * Expand a task-id list into a flat trial list: trialsPerCondition
 * repetitions per task, tagged with the condition label. Pure.
 */
export function expandTrials(taskIds, trialsPerCondition, condition) {
  const out = [];
  for (const taskId of taskIds) {
    for (let i = 0; i < trialsPerCondition; i++) {
      out.push({ taskId, trialIdx: i, condition });
    }
  }
  return out;
}

/**
 * Aggregate trial results into {taskId → {hint_on, hint_off, lift}} buckets.
 * Each bucket has { trials, passes, passRate }. Lift is the signed delta
 * (hint_on − hint_off) pass rate.
 *
 * Pure. Tolerates empty input.
 */
export function summarizeAbResults(results) {
  const byTask = {};
  for (const r of results) {
    if (!byTask[r.taskId]) byTask[r.taskId] = { hint_on: null, hint_off: null };
    const cond = r.condition;
    if (!byTask[r.taskId][cond]) byTask[r.taskId][cond] = { trials: 0, passes: 0, timedOut: 0, elapsedMsTotal: 0 };
    byTask[r.taskId][cond].trials += 1;
    if (r.ok) byTask[r.taskId][cond].passes += 1;
    if (r.timedOut) byTask[r.taskId][cond].timedOut += 1;
    byTask[r.taskId][cond].elapsedMsTotal += (r.elapsedMs || 0);
  }
  for (const taskId of Object.keys(byTask)) {
    for (const cond of ['hint_on', 'hint_off']) {
      const b = byTask[taskId][cond];
      if (b) {
        b.passRate = b.trials > 0 ? b.passes / b.trials : 0;
        b.avgElapsedMs = b.trials > 0 ? b.elapsedMsTotal / b.trials : 0;
      }
    }
    const on = byTask[taskId].hint_on;
    const off = byTask[taskId].hint_off;
    if (on && off) {
      byTask[taskId].lift = on.passRate - off.passRate;
    } else {
      byTask[taskId].lift = null;
    }
  }
  return byTask;
}

/**
 * Render a short ASCII table from summarizeAbResults output. Pure.
 */
export function formatSummaryTable(summary) {
  const rows = [];
  rows.push('| task         | hint_on    | hint_off   | lift    | avg_on  | avg_off |');
  rows.push('|--------------|------------|------------|---------|---------|---------|');
  for (const taskId of Object.keys(summary)) {
    const on = summary[taskId].hint_on || { passes: 0, trials: 0, passRate: 0, avgElapsedMs: 0 };
    const off = summary[taskId].hint_off || { passes: 0, trials: 0, passRate: 0, avgElapsedMs: 0 };
    const lift = summary[taskId].lift;
    const liftStr = lift === null
      ? '   —   '
      : (lift >= 0 ? `+${(lift * 100).toFixed(1)}%` : `${(lift * 100).toFixed(1)}%`).padStart(7);
    rows.push(
      `| ${taskId.padEnd(12)} | ${(on.passes + '/' + on.trials + ' (' + (on.passRate * 100).toFixed(0) + '%)').padEnd(10)} | ` +
      `${(off.passes + '/' + off.trials + ' (' + (off.passRate * 100).toFixed(0) + '%)').padEnd(10)} | ` +
      `${liftStr} | ${(on.avgElapsedMs / 1000).toFixed(0)}s`.padEnd(10) +
      ` | ${(off.avgElapsedMs / 1000).toFixed(0)}s`.padEnd(10) + '|'
    );
  }
  return rows.join('\n');
}

/**
 * Run one condition's trials across `workers` workers spawned with the
 * appropriate env. Returns array of trial results {taskId, trialIdx,
 * condition, ok, timedOut, elapsedMs, ...}.
 */
async function runCondition({ trials, workers, timeoutMs, hintsDisabled, strict, factorDB }) {
  // Mutate process.env so WorkerSpawner's `env: { ...process.env }` picks
  // up the right flag. Restored in finally{}.
  const origDisable = process.env.CLEAR_HINT_DISABLE;
  if (hintsDisabled) process.env.CLEAR_HINT_DISABLE = '1';
  else delete process.env.CLEAR_HINT_DISABLE;

  // Fresh registry file per condition so PIDs from a crashed run don't
  // confuse the spawn.
  try { unlinkSync(AB_REGISTRY_PATH); } catch {}
  const registry = new SessionRegistry(AB_REGISTRY_PATH);
  const spawner = new WorkerSpawner(registry);

  const results = [];
  try {
    console.log(`\n  Spawning ${workers} workers (CLEAR_HINT_DISABLE=${hintsDisabled ? '1' : 'unset'})...`);
    await spawner.spawnAll(workers, WORKER_BASE_PORT);
    const readyChecks = await Promise.all(
      Array.from({ length: workers }, (_, i) => waitForWorkerReady(WORKER_BASE_PORT + i))
    );
    const notReady = readyChecks.map((ok, i) => ok ? null : `worker-${i + 1}`).filter(Boolean);
    if (notReady.length > 0) {
      throw new Error(`Workers not ready after 15s: ${notReady.join(', ')}`);
    }
    console.log(`  ${workers} worker(s) ready. Running ${trials.length} trials...`);

    const buckets = partitionTasks(trials, workers);

    // One async task per worker bucket. Each bucket processes its trials
    // sequentially on its assigned port.
    const bucketPromises = buckets.map(async (bucket, workerIdx) => {
      const port = WORKER_BASE_PORT + workerIdx;
      const bucketResults = [];
      for (const trial of bucket) {
        const task = allTasks.find(t => t.id === trial.taskId);
        if (!task) {
          bucketResults.push({ ...trial, ok: false, error: 'unknown task', elapsedMs: 0 });
          continue;
        }
        const prompt = buildPrompt(task);
        const t0 = Date.now();
        const r = await driveTaskOnWorker(port, prompt, timeoutMs, task.steps, factorDB, t0, { strict });
        const elapsed = Date.now() - t0;
        const status = r.ok ? '✅' : r.timedOut ? '⏱️' : r.stuck ? '🔶' : '❌';
        const whyOk = r.ok
          ? (r.saidTaskComplete && r.dbPassed ? ' (TC+DB)'
            : r.saidTaskComplete ? ' (TC)'
              : r.dbPassed ? ' (DB)' : '')
          : '';
        console.log(`  [${status}] ${trial.condition} #${trial.trialIdx + 1} ${trial.taskId} — ${(elapsed / 1000).toFixed(1)}s${whyOk}`);
        bucketResults.push({
          ...trial,
          ok: r.ok,
          timedOut: !!r.timedOut,
          stuck: !!r.stuck,
          dbPassed: !!r.dbPassed,
          saidTaskComplete: !!r.saidTaskComplete,
          elapsedMs: elapsed,
          error: r.error || null,
        });
      }
      return bucketResults;
    });

    const buckedOut = await Promise.all(bucketPromises);
    for (const b of buckedOut) results.push(...b);
  } finally {
    await spawner.killAll();
    registry.close();
    try { unlinkSync(AB_REGISTRY_PATH); } catch {}
    if (origDisable === undefined) delete process.env.CLEAR_HINT_DISABLE;
    else process.env.CLEAR_HINT_DISABLE = origDisable;
  }

  return results;
}

/**
 * Top-level A/B entry. Runs `trialsPerCondition` trials × 2 conditions × N
 * tasks, prints the summary, returns the raw trial results + summary.
 */
export async function runAbSweep({
  taskIds = ['counter', 'todo-crud'],
  trialsPerCondition = 10,
  workers = 1,
  timeoutMs = 180_000,
  strict = true,
  dryRun = false,
} = {}) {
  // Validate tasks exist
  const unknown = taskIds.filter(id => !allTasks.find(t => t.id === id));
  if (unknown.length > 0) throw new Error(`unknown task ids: ${unknown.join(', ')}`);

  const pre = validateSweepPreconditions(process.env);
  if (!pre.ok) throw new Error(pre.reason);

  console.log('\n=== AB Hint Sweep ===');
  console.log(`  Tasks: ${taskIds.join(', ')}`);
  console.log(`  Trials per condition per task: ${trialsPerCondition}`);
  console.log(`  Workers: ${workers}`);
  console.log(`  Timeout/trial: ${timeoutMs / 1000}s`);
  console.log(`  Strict grading: ${strict}`);
  console.log(`  Backend: ${pre.backend || 'anthropic-api'}`);
  console.log(`  Total trials: ${taskIds.length * trialsPerCondition * 2}`);

  if (dryRun) {
    const onTrials = expandTrials(taskIds, trialsPerCondition, 'hint_on');
    const offTrials = expandTrials(taskIds, trialsPerCondition, 'hint_off');
    console.log(`\n[DRY RUN] Would run ${onTrials.length} + ${offTrials.length} trials.`);
    return { dryRun: true, trials: [] };
  }

  const factorDB = new FactorDB(FACTOR_DB_PATH);
  const startStats = factorDB.stats();
  const sweepStart = Date.now();
  console.log(`\nFactor DB at start: ${startStats.total} rows (${startStats.passing} passing)`);

  let allResults = [];
  try {
    // Condition 1: hint_on
    console.log('\n── Condition: hint_on (CLEAR_HINT_DISABLE unset) ──');
    const onResults = await runCondition({
      trials: expandTrials(taskIds, trialsPerCondition, 'hint_on'),
      workers,
      timeoutMs,
      hintsDisabled: false,
      strict,
      factorDB,
    });
    allResults = allResults.concat(onResults);

    // Condition 2: hint_off
    console.log('\n── Condition: hint_off (CLEAR_HINT_DISABLE=1) ──');
    const offResults = await runCondition({
      trials: expandTrials(taskIds, trialsPerCondition, 'hint_off'),
      workers,
      timeoutMs,
      hintsDisabled: true,
      strict,
      factorDB,
    });
    allResults = allResults.concat(offResults);
  } finally {
    const endStats = factorDB.stats();
    const elapsedMs = Date.now() - sweepStart;
    const summary = summarizeAbResults(allResults);

    console.log('\n=== AB Sweep Summary ===');
    console.log(`  Wall clock: ${(elapsedMs / 1000).toFixed(1)}s (${(elapsedMs / 60000).toFixed(1)} min)`);
    console.log(`  Trials: ${allResults.length}`);
    console.log(`  Factor DB: ${startStats.total} → ${endStats.total} rows (+${endStats.total - startStats.total})`);
    console.log(`  Passing rows: ${startStats.passing} → ${endStats.passing} (+${endStats.passing - startStats.passing})`);
    console.log('\n' + formatSummaryTable(summary) + '\n');

    // Persist the raw trial results + summary to a session-dated JSON so
    // later replay / analysis can work against a fixed artifact.
    try {
      const outDir = join(ROOT, 'playground', 'sessions');
      mkdirSync(outDir, { recursive: true });
      const stamp = new Date(sweepStart).toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const outPath = join(outDir, `ab-hint-sweep-${stamp}.json`);
      writeFileSync(outPath, JSON.stringify({
        startedAt: new Date(sweepStart).toISOString(),
        elapsedMs,
        taskIds,
        trialsPerCondition,
        workers,
        timeoutMs,
        strict,
        backend: pre.backend || 'anthropic-api',
        factorDb: {
          before: startStats,
          after: endStats,
          rowsAdded: endStats.total - startStats.total,
          passingAdded: endStats.passing - startStats.passing,
        },
        summary,
        trials: allResults,
      }, null, 2), 'utf8');
      console.log(`  → wrote ${outPath}`);
    } catch (err) {
      console.warn(`  (failed to write artifact: ${err.message})`);
    }

    factorDB.close();
  }

  return {
    trials: allResults,
    summary: summarizeAbResults(allResults),
  };
}

// CLI entry
const _thisFile = fileURLToPath(import.meta.url);
let _entryFile = '';
try { _entryFile = process.argv[1] ? realpathSync(process.argv[1]) : ''; } catch {}
if (_thisFile === _entryFile) {
  const argv = process.argv.slice(2);
  const tasksArg = argv.find(a => a.startsWith('--tasks='));
  const trialsArg = argv.find(a => a.startsWith('--trials='));
  const workersArg = argv.find(a => a.startsWith('--workers='));
  const timeoutArg = argv.find(a => a.startsWith('--timeout='));
  const strict = argv.includes('--strict') || !argv.includes('--loose');
  const dryRun = argv.includes('--dry-run');

  const opts = {
    taskIds: tasksArg ? tasksArg.split('=')[1].split(',') : ['counter', 'todo-crud'],
    trialsPerCondition: trialsArg ? parseInt(trialsArg.split('=')[1]) : 10,
    workers: workersArg ? parseInt(workersArg.split('=')[1]) : 1,
    timeoutMs: timeoutArg ? parseInt(timeoutArg.split('=')[1]) * 1000 : 180_000,
    strict,
    dryRun,
  };

  runAbSweep(opts)
    .then(() => process.exit(0))
    .catch(err => {
      console.error('AB sweep failed:', err.message);
      process.exit(1);
    });
}

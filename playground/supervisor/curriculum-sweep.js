// Curriculum Sweep — accelerate Factor DB accumulation.
//
// Spawns N workers, partitions the 20 curriculum tasks across them,
// drives each task through a real Meph session via /api/chat.
//
// Every compile+test cycle auto-logs to Factor DB (the hook in /api/chat
// is already wired). Sweep finishes → count rows added.
//
// Usage:
//   node playground/supervisor/curriculum-sweep.js                  (default: 3 workers, all tasks)
//   node playground/supervisor/curriculum-sweep.js --workers=2
//   node playground/supervisor/curriculum-sweep.js --tasks=hello-world,echo,calculator
//   node playground/supervisor/curriculum-sweep.js --dry-run        (no API calls — prints plan)
//   node playground/supervisor/curriculum-sweep.js --timeout=300    (seconds per task)
//
// Requires ANTHROPIC_API_KEY in env (unless --dry-run).
// Rough cost: $0.01–0.05 per task, $0.20–1.00 per full sweep.

import { SessionRegistry } from './registry.js';
import { WorkerSpawner } from './spawner.js';
import { FactorDB } from './factor-db.js';
import { tasks as allTasks } from '../../curriculum/index.js';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, unlinkSync, realpathSync, existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

// Load .env so ANTHROPIC_API_KEY is available (workers load it too via server.js)
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
const SWEEP_REGISTRY_PATH = '/tmp/sweep-registry.db';
const WORKER_BASE_PORT = 3490;

function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

// Poll a worker's heartbeat until it responds or we time out.
// Replaces fixed-duration sleep (unreliable on slow startup).
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

// Split an array into N roughly-equal chunks
export function partitionTasks(items, n) {
  const buckets = Array.from({ length: n }, () => []);
  items.forEach((item, i) => buckets[i % n].push(item));
  return buckets;
}

// Build the prompt Meph will receive for a single curriculum task.
// Kept short — Meph's system prompt already covers how to use tools.
export function buildPrompt(task) {
  const tests = task.tests.map(t => {
    const body = t.body ? ` with body ${JSON.stringify(t.body)}` : '';
    const expect = t.expect ? ` → expect ${JSON.stringify(t.expect)}` : '';
    return `  - ${t.method} ${t.path}${body}${expect}`;
  }).join('\n');

  return `Build this app in Clear:

**${task.title}** (Level ${task.level})

${task.description}

Starting skeleton:
\`\`\`clear
${task.skeleton || '# empty\n'}
\`\`\`

The app must pass these HTTP tests:
${tests}

Steps:
1. Use edit_code to write the complete Clear source
2. Use compile to verify it compiles without errors
3. Use run_app to start it, then http_request to check the endpoints
4. Fix any errors and retry

When all tests pass, end your response with "TASK COMPLETE".
If you get stuck on the same error 3+ times, end with "STUCK: <reason>".`;
}

// POST a task to a worker's /api/chat and consume the SSE stream until done OR timeout.
// We don't need to parse the stream — just drain it. The Factor DB hook inside /api/chat
// writes rows as Meph works; we collect them from the DB after the stream ends.
export async function driveTaskOnWorker(port, prompt, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`http://localhost:${port}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: prompt }],
        editorContent: '', // fresh editor per task
      }),
      signal: controller.signal,
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let taskComplete = false;
    let stuck = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      if (chunk.includes('TASK COMPLETE')) taskComplete = true;
      if (chunk.includes('STUCK:')) stuck = true;
    }

    clearTimeout(timeoutId);
    return { ok: taskComplete, stuck, timedOut: false };
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') return { ok: false, stuck: false, timedOut: true };
    return { ok: false, stuck: false, timedOut: false, error: err.message };
  }
}

async function processBucket(port, bucketTasks, timeoutMs, onTaskDone) {
  const results = [];
  for (const task of bucketTasks) {
    const prompt = buildPrompt(task);
    const t0 = Date.now();
    const result = await driveTaskOnWorker(port, prompt, timeoutMs);
    const elapsed = Date.now() - t0;
    results.push({ task: task.id, level: task.level, ...result, elapsedMs: elapsed });
    if (onTaskDone) onTaskDone(task, result, elapsed);
  }
  return results;
}

export async function runSweep({
  workers = 3,
  taskFilter = null,
  timeoutPerTaskMs = 180_000,
  dryRun = false,
} = {}) {
  const filtered = taskFilter
    ? allTasks.filter(t => taskFilter.includes(t.id))
    : allTasks;

  if (filtered.length === 0) {
    console.log('No tasks match the filter.');
    return { tasksRun: 0, rowsAdded: 0 };
  }

  const buckets = partitionTasks(filtered, workers);

  console.log(`\n=== Curriculum Sweep ===`);
  console.log(`  Tasks: ${filtered.length}`);
  console.log(`  Workers: ${workers}`);
  console.log(`  Timeout per task: ${timeoutPerTaskMs / 1000}s`);
  console.log(`  Dry run: ${dryRun}`);
  console.log();
  buckets.forEach((bucket, i) => {
    console.log(`  worker-${i + 1} (port ${WORKER_BASE_PORT + i}): ${bucket.map(t => t.id).join(', ') || '—'}`);
  });

  if (dryRun) {
    console.log('\n[DRY RUN] Would process above. Exiting.');
    return { tasksRun: 0, rowsAdded: 0, dryRun: true };
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY not set — required for real sweep. Use --dry-run to preview.');
  }

  // Count rows before the sweep so we can report delta
  const factorDB = new FactorDB(FACTOR_DB_PATH);
  const startStats = factorDB.stats();
  console.log(`\nStarting Factor DB: ${startStats.total} rows (${startStats.passing} passing)\n`);

  // Fresh sweep registry (ephemeral)
  try { unlinkSync(SWEEP_REGISTRY_PATH); } catch {}
  const registry = new SessionRegistry(SWEEP_REGISTRY_PATH);
  const spawner = new WorkerSpawner(registry);

  try {
    console.log(`Spawning ${workers} workers...`);
    await spawner.spawnAll(workers, WORKER_BASE_PORT);
    console.log(`Waiting for workers to be ready...`);
    const readyChecks = await Promise.all(
      Array.from({ length: workers }, (_, i) => waitForWorkerReady(WORKER_BASE_PORT + i))
    );
    const notReady = readyChecks.map((ok, i) => ok ? null : `worker-${i + 1}`).filter(Boolean);
    if (notReady.length > 0) {
      throw new Error(`Workers not ready after 15s: ${notReady.join(', ')}`);
    }
    console.log(`All ${workers} workers ready.`);

    const t0 = Date.now();

    // Launch all buckets in parallel
    const allResults = await Promise.all(buckets.map((bucket, i) => {
      const port = WORKER_BASE_PORT + i;
      return processBucket(port, bucket, timeoutPerTaskMs, (task, result, elapsed) => {
        const status = result.ok ? '✅'
          : result.stuck ? '🔶 STUCK'
            : result.timedOut ? '⏱️  TIMEOUT'
              : '❌';
        const detail = result.error ? ` — ${result.error.slice(0, 120)}` : '';
        console.log(`  [${status}] L${task.level} ${task.id} — ${(elapsed / 1000).toFixed(1)}s${detail}`);
      });
    }));

    const elapsedTotal = Date.now() - t0;
    const flatResults = allResults.flat();
    const endStats = factorDB.stats();

    console.log(`\n=== Sweep Summary ===`);
    console.log(`  Wall clock: ${(elapsedTotal / 1000).toFixed(1)}s`);
    console.log(`  Tasks run: ${flatResults.length}`);
    console.log(`  Completed: ${flatResults.filter(r => r.ok).length}`);
    console.log(`  Stuck: ${flatResults.filter(r => r.stuck).length}`);
    console.log(`  Timed out: ${flatResults.filter(r => r.timedOut).length}`);
    console.log(`  Factor DB: ${startStats.total} → ${endStats.total} rows (+${endStats.total - startStats.total})`);
    console.log(`  Passing rows: ${startStats.passing} → ${endStats.passing} (+${endStats.passing - startStats.passing})`);

    return {
      tasksRun: flatResults.length,
      rowsAdded: endStats.total - startStats.total,
      passingAdded: endStats.passing - startStats.passing,
      results: flatResults,
      elapsedMs: elapsedTotal,
    };
  } finally {
    await spawner.killAll();
    factorDB.close();
    registry.close();
    try { unlinkSync(SWEEP_REGISTRY_PATH); } catch {}
  }
}

// CLI entry — detect "was this file invoked directly" portably on Windows + Unix
const _thisFile = fileURLToPath(import.meta.url);
let _entryFile = '';
try { _entryFile = process.argv[1] ? realpathSync(process.argv[1]) : ''; } catch {}
if (_thisFile === _entryFile) {
  const argv = process.argv.slice(2);
  const workersArg = argv.find(a => a.startsWith('--workers='));
  const tasksArg = argv.find(a => a.startsWith('--tasks='));
  const timeoutArg = argv.find(a => a.startsWith('--timeout='));
  const dryRun = argv.includes('--dry-run');

  const opts = {
    workers: workersArg ? parseInt(workersArg.split('=')[1]) : 3,
    taskFilter: tasksArg ? tasksArg.split('=')[1].split(',') : null,
    timeoutPerTaskMs: timeoutArg ? parseInt(timeoutArg.split('=')[1]) * 1000 : 180_000,
    dryRun,
  };

  runSweep(opts)
    .then(r => {
      if (r.passingAdded > 0) {
        const needed = 200 - r.passingAdded;
        console.log(`\nFlywheel progress: ${r.passingAdded} new passing rows. Re-ranker threshold: ${Math.max(0, needed)} rows to go.`);
      }
      process.exit(0);
    })
    .catch(err => {
      console.error('Sweep failed:', err.message);
      process.exit(1);
    });
}

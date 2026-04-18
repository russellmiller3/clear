// =============================================================================
// EVAL REPLICATED — run the full Meph eval N times in parallel
// =============================================================================
// Spawns N workers. Each worker runs ALL 16 scenarios in full (preserving
// the write → compile → run_app → use-app dependency chain). Aggregates
// pass rates across trials.
//
// Why replicated instead of partitioned:
//   • No dependency bugs — each worker runs the full chain itself
//   • Reveals sampling variance (Claude is stochastic) — one pass/fail tells
//     you nothing; three tells you whether a scenario is flaky or broken
//   • Same wall clock as 1 worker (~90s), ~3x API cost — still <$1/run
//
// Per-scenario grading: counts passes across trials. Flake detection:
// 2/3 pass = flaky, 0/3 = broken, 3/3 = solid.
//
// Usage:
//   node playground/eval-replicated.js                    (3 trials, all scenarios)
//   node playground/eval-replicated.js --trials=5
//   node playground/eval-replicated.js --dry-run
//
// Requires ANTHROPIC_API_KEY.
// =============================================================================

import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, realpathSync, unlinkSync, existsSync } from 'fs';

import { SessionRegistry } from './supervisor/registry.js';
import { WorkerSpawner } from './supervisor/spawner.js';
import { SCENARIOS, DEMO_SOURCE } from './eval-scenarios.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env
const _envPath = join(__dirname, '..', '.env');
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
const REGISTRY_PATH = '/tmp/eval-replicated-registry.db';
const WORKER_BASE_PORT = 3495;

function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

// Same preflight as curriculum-sweep — catch API exhaustion before spawning workers
async function preflightApiCheck(apiKey) {
  if (!apiKey) return 'ANTHROPIC_API_KEY not set';
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        'x-api-key': apiKey,
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 5,
        messages: [{ role: 'user', content: 'hi' }],
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (r.ok) return null;
    const body = await r.text();
    return `API pre-flight failed: HTTP ${r.status} — ${body.slice(0, 200)}`;
  } catch (err) {
    return `API pre-flight errored: ${err.message}`;
  }
}

async function waitForWorkerReady(port, maxMs = 15000) {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`http://localhost:${port}/api/worker-heartbeat`, {
        signal: AbortSignal.timeout(500),
      });
      if (r.ok) return true;
    } catch {}
    await wait(250);
  }
  return false;
}

// Drive one scenario on a specific worker. Returns { ok, graded, calls, selfReport, elapsedMs }
async function runScenarioOnWorker(port, scenario, apiKey, timeoutMs) {
  const fullPrompt = `${scenario.prompt}

After the tool has run and you see the result, finish your response with one more line in this exact format:

SELF-REPORT: <one sentence on whether the ${scenario.expectTool} tool worked correctly, returned useful data, or felt broken in any way.>`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const t0 = Date.now();

  try {
    const r = await fetch(`http://localhost:${port}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: fullPrompt }],
        apiKey,
        personality: '',
        editorContent: DEMO_SOURCE,
        errors: [],
        webTools: false,
      }),
      signal: controller.signal,
    });

    if (!r.ok) {
      clearTimeout(timeout);
      return { ok: false, graded: false, error: `HTTP ${r.status}`, elapsedMs: Date.now() - t0 };
    }

    const toolCalls = [];
    let finalText = '';
    const reader = r.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;
        let ev;
        try { ev = JSON.parse(payload); } catch { continue; }
        if (ev.type === 'tool_start' && ev.name) {
          if (!toolCalls.length || toolCalls[toolCalls.length - 1].name !== ev.name || ev.summary) {
            toolCalls.push({ name: ev.name, summary: ev.summary || null });
          }
        } else if (ev.type === 'text' && typeof ev.delta === 'string') {
          finalText += ev.delta;
        }
      }
    }

    clearTimeout(timeout);
    const graded = scenario.grade(toolCalls, finalText);
    const m = finalText.match(/SELF-REPORT:\s*([^\n]+)/i);
    return {
      ok: true,
      graded,
      calls: toolCalls,
      selfReport: m ? m[1].trim() : '(no self-report)',
      elapsedMs: Date.now() - t0,
    };
  } catch (err) {
    clearTimeout(timeout);
    return {
      ok: false,
      graded: false,
      error: err.name === 'AbortError' ? 'timeout' : err.message,
      elapsedMs: Date.now() - t0,
    };
  }
}

// One worker runs the full 16-scenario sequence in order.
async function runOneTrial(trialIdx, port, apiKey, timeoutMs, onScenarioDone) {
  const results = [];
  for (const scenario of SCENARIOS) {
    const result = await runScenarioOnWorker(port, scenario, apiKey, timeoutMs);
    results.push({ scenarioName: scenario.name, ...result });
    if (onScenarioDone) onScenarioDone(trialIdx, scenario, result);
  }
  return results;
}

// Summarize across trials: per-scenario pass rate, overall stats, flake detection.
export function aggregateTrials(trialResults) {
  // trialResults: array of trial results, each is [{ scenarioName, graded, ... }, ...]
  const scenarioStats = {};
  for (const scenario of SCENARIOS) {
    scenarioStats[scenario.name] = { passed: 0, total: 0 };
  }
  for (const trial of trialResults) {
    for (const row of trial) {
      const s = scenarioStats[row.scenarioName];
      if (!s) continue;
      s.total++;
      if (row.graded) s.passed++;
    }
  }
  const perScenario = SCENARIOS.map(scn => {
    const s = scenarioStats[scn.name];
    const passRate = s.total > 0 ? s.passed / s.total : 0;
    let verdict;
    if (passRate === 1) verdict = 'SOLID';
    else if (passRate === 0) verdict = 'BROKEN';
    else verdict = 'FLAKY';
    return { name: scn.name, passed: s.passed, total: s.total, passRate, verdict };
  });
  const totalRuns = perScenario.reduce((sum, s) => sum + s.total, 0);
  const totalPasses = perScenario.reduce((sum, s) => sum + s.passed, 0);
  return {
    perScenario,
    solid: perScenario.filter(s => s.verdict === 'SOLID').length,
    flaky: perScenario.filter(s => s.verdict === 'FLAKY').length,
    broken: perScenario.filter(s => s.verdict === 'BROKEN').length,
    overallPassRate: totalRuns > 0 ? totalPasses / totalRuns : 0,
  };
}

export async function runReplicatedEval({
  trials = 3,
  timeoutPerScenarioMs = 60_000,
  dryRun = false,
  apiKey = process.env.ANTHROPIC_API_KEY,
} = {}) {
  console.log(`\n=== Meph Eval (replicated) ===`);
  console.log(`  Scenarios: ${SCENARIOS.length}`);
  console.log(`  Trials (parallel workers): ${trials}`);
  console.log(`  Timeout per scenario: ${timeoutPerScenarioMs / 1000}s`);
  console.log(`  Dry run: ${dryRun}`);
  console.log(`  Total scenario runs: ${SCENARIOS.length * trials}`);

  if (dryRun) {
    console.log('\n[DRY RUN] Would run full 16-scenario suite on each of', trials, 'parallel workers.');
    console.log('Wall clock: ~90s. API cost: ~$0.30–0.90.');
    return { trialsRun: 0, dryRun: true };
  }

  if (!apiKey) throw new Error('ANTHROPIC_API_KEY required (or --dry-run).');

  console.log('\nPre-flight API check...');
  const preflightError = await preflightApiCheck(apiKey);
  if (preflightError) {
    console.error(`\n❌ ${preflightError}`);
    console.error('Eval aborted — all trials would fail.');
    throw new Error('Pre-flight API check failed');
  }
  console.log('API reachable ✓');

  try { unlinkSync(REGISTRY_PATH); } catch {}
  const registry = new SessionRegistry(REGISTRY_PATH);
  const spawner = new WorkerSpawner(registry);

  try {
    console.log(`\nSpawning ${trials} workers...`);
    await spawner.spawnAll(trials, WORKER_BASE_PORT);
    const readyChecks = await Promise.all(
      Array.from({ length: trials }, (_, i) => waitForWorkerReady(WORKER_BASE_PORT + i))
    );
    const notReady = readyChecks.map((ok, i) => ok ? null : `worker-${i + 1}`).filter(Boolean);
    if (notReady.length > 0) throw new Error(`Workers not ready after 15s: ${notReady.join(', ')}`);
    console.log(`All ${trials} workers ready.`);

    const t0 = Date.now();
    console.log(`Running ${trials} parallel trials of ${SCENARIOS.length} scenarios each...\n`);

    const trialResults = await Promise.all(Array.from({ length: trials }, (_, i) => {
      const port = WORKER_BASE_PORT + i;
      return runOneTrial(i + 1, port, apiKey, timeoutPerScenarioMs, (trial, scn, result) => {
        const icon = result.graded ? '✅' : result.ok ? '❌' : '💥';
        const detail = result.ok ? '' : ` (${result.error || 'failed'})`;
        console.log(`  [trial ${trial}] ${icon} ${scn.name}${detail}`);
      });
    }));

    const elapsed = Date.now() - t0;
    const summary = aggregateTrials(trialResults);

    console.log(`\n=== Results ===`);
    console.log(`  Wall clock: ${(elapsed / 1000).toFixed(1)}s`);
    console.log(`  Overall pass rate: ${(summary.overallPassRate * 100).toFixed(1)}%`);
    console.log(`  Scenarios: ${summary.solid} SOLID / ${summary.flaky} FLAKY / ${summary.broken} BROKEN`);
    console.log(`\n  Per-scenario (pass / total):`);
    for (const s of summary.perScenario) {
      const bar = '█'.repeat(s.passed) + '·'.repeat(s.total - s.passed);
      const verdict = s.verdict === 'SOLID' ? '✅' : s.verdict === 'FLAKY' ? '🟡' : '❌';
      console.log(`    ${verdict} ${s.name.padEnd(24)} ${bar} ${s.passed}/${s.total}`);
    }

    return { trialsRun: trials, elapsedMs: elapsed, summary, results: trialResults };
  } finally {
    await spawner.killAll();
    registry.close();
    try { unlinkSync(REGISTRY_PATH); } catch {}
  }
}

// CLI entry
const _thisFile = fileURLToPath(import.meta.url);
let _entryFile = '';
try { _entryFile = process.argv[1] ? realpathSync(process.argv[1]) : ''; } catch {}
if (_thisFile === _entryFile) {
  const argv = process.argv.slice(2);
  const trialsArg = argv.find(a => a.startsWith('--trials='));
  const timeoutArg = argv.find(a => a.startsWith('--timeout='));
  const dryRun = argv.includes('--dry-run');

  runReplicatedEval({
    trials: trialsArg ? parseInt(trialsArg.split('=')[1]) : 3,
    timeoutPerScenarioMs: timeoutArg ? parseInt(timeoutArg.split('=')[1]) * 1000 : 60_000,
    dryRun,
  })
    .then(r => process.exit(r.dryRun || (r.summary && r.summary.broken === 0) ? 0 : 1))
    .catch(err => { console.error('Eval failed:', err.message); process.exit(1); });
}

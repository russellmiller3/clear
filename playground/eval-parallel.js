// =============================================================================
// EVAL PARALLEL — 3x faster Meph eval via supervisor workers
// =============================================================================
// Runs eval-meph's 16 scenarios across N parallel worker servers. Partitions
// scenarios into contiguous slices (preserves editor-state dependencies within
// each slice), runs slices in parallel, aggregates results.
//
// Typical speedup: 3 workers → ~30s (vs ~90s sequential). Same cost.
//
// Usage:
//   node playground/eval-parallel.js                       (3 workers, all scenarios)
//   node playground/eval-parallel.js --workers=2
//   node playground/eval-parallel.js --dry-run             (print plan, no API calls)
//
// Requires ANTHROPIC_API_KEY.
// =============================================================================

import { spawn } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { realpathSync, unlinkSync } from 'fs';

import { SessionRegistry } from './supervisor/registry.js';
import { WorkerSpawner } from './supervisor/spawner.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REGISTRY_PATH = '/tmp/eval-parallel-registry.db';
const WORKER_BASE_PORT = 3495;

// Reuse scenario definitions from eval-meph so there's one source of truth
// for what we're testing. Dynamic import because it has a top-level exit
// guard that we don't want triggering in this process.
async function loadScenarios() {
  // eval-meph.js has a top-level SKIP_MEPH_EVAL check and keyless-skip check
  // that would call process.exit(0) on import. Work around by setting a flag
  // before import. We only need the scenarios array.
  // Actually — the cleanest way is to factor scenarios into their own module
  // if this becomes permanent. For now, re-declare the scenarios here
  // (truncated: 16 scenarios is manageable, and we grade by tool name only).
  const { SCENARIOS } = await import('./eval-scenarios.js');
  return SCENARIOS;
}

// Split a list into N contiguous chunks (preserves ordering and dependencies).
// Unlike curriculum-sweep.partitionTasks (round-robin), contiguous slicing
// keeps editor-state dependencies intact within each worker.
export function contiguousSlice(items, n) {
  const result = Array.from({ length: n }, () => []);
  const base = Math.floor(items.length / n);
  const remainder = items.length % n;
  let idx = 0;
  for (let i = 0; i < n; i++) {
    const size = base + (i < remainder ? 1 : 0);
    result[i] = items.slice(idx, idx + size);
    idx += size;
  }
  return result;
}

// Drive one scenario through /api/chat on a specific worker. Simplified from
// eval-meph.chatTurn: we consume the SSE stream, track tool_start events,
// return tool call list + final text.
async function runScenarioOnWorker(port, scenario, apiKey, demoSource, timeoutMs) {
  const fullPrompt = `${scenario.prompt}

After the tool has run and you see the result, finish your response with one more line in this exact format:

SELF-REPORT: <one sentence on whether the ${scenario.expectTool} tool worked correctly, returned useful data, or felt broken in any way. Be honest — if it returned an error, said "Unknown tool", gave garbage, or was empty, say so specifically.>`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const r = await fetch(`http://localhost:${port}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: fullPrompt }],
        apiKey,
        personality: '',
        editorContent: demoSource,
        errors: [],
        webTools: false,
      }),
      signal: controller.signal,
    });

    if (!r.ok) {
      const text = await r.text();
      return { ok: false, error: `HTTP ${r.status}: ${text.slice(0, 200)}`, calls: [], final: '' };
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
    const m = finalText.match(/SELF-REPORT:\s*([^\n]+)/i);
    return {
      ok: true,
      calls: toolCalls,
      final: finalText,
      selfReport: m ? m[1].trim() : '(no self-report)',
    };
  } catch (err) {
    clearTimeout(timeout);
    return { ok: false, error: err.name === 'AbortError' ? 'timeout' : err.message, calls: [], final: '' };
  }
}

async function processSlice(port, scenarios, apiKey, demoSource, timeoutMs, onScenarioDone) {
  const results = [];
  for (let i = 0; i < scenarios.length; i++) {
    const scn = scenarios[i];
    const t0 = Date.now();
    const result = await runScenarioOnWorker(port, scn, apiKey, demoSource, timeoutMs);
    const elapsed = Date.now() - t0;
    const graded = result.ok ? scn.grade(result.calls, result.final) : false;
    const row = { ...scn, result, graded, elapsedMs: elapsed };
    results.push(row);
    if (onScenarioDone) onScenarioDone(scn, result, graded, elapsed);
  }
  return results;
}

function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

export async function runParallelEval({
  workers = 3,
  timeoutPerScenarioMs = 60_000,
  dryRun = false,
  apiKey = process.env.ANTHROPIC_API_KEY,
  demoSource = '',
} = {}) {
  const scenarios = await loadScenarios();
  const slices = contiguousSlice(scenarios, workers);

  console.log(`\n=== Meph Eval (parallel) ===`);
  console.log(`  Scenarios: ${scenarios.length}`);
  console.log(`  Workers: ${workers}`);
  console.log(`  Timeout per scenario: ${timeoutPerScenarioMs / 1000}s`);
  console.log(`  Dry run: ${dryRun}`);
  console.log();
  slices.forEach((slice, i) => {
    console.log(`  worker-${i + 1} (port ${WORKER_BASE_PORT + i}): ${slice.map(s => s.name).join(' | ')}`);
  });

  if (dryRun) {
    console.log('\n[DRY RUN] Would process above. Exiting.');
    return { scenariosRun: 0, passed: 0, dryRun: true };
  }

  if (!apiKey) throw new Error('ANTHROPIC_API_KEY required (or --dry-run).');

  try { unlinkSync(REGISTRY_PATH); } catch {}
  const registry = new SessionRegistry(REGISTRY_PATH);
  const spawner = new WorkerSpawner(registry);

  try {
    console.log(`\nSpawning ${workers} workers...`);
    await spawner.spawnAll(workers, WORKER_BASE_PORT);
    console.log(`Waiting for workers to bind...`);
    await wait(3500);

    const t0 = Date.now();

    const allResults = await Promise.all(slices.map((slice, i) => {
      const port = WORKER_BASE_PORT + i;
      return processSlice(port, slice, apiKey, demoSource, timeoutPerScenarioMs,
        (scn, result, graded) => {
          const icon = graded ? '✅' : result.ok ? '❌' : '💥';
          const detail = result.ok ? scn.expectTool : (result.error || 'error').slice(0, 60);
          console.log(`  [${icon}] ${scn.name.padEnd(24)} ${detail}`);
        });
    }));

    const elapsedTotal = Date.now() - t0;
    const flat = allResults.flat();
    const passed = flat.filter(r => r.graded).length;

    console.log(`\n=== Results ===`);
    console.log(`  Wall clock: ${(elapsedTotal / 1000).toFixed(1)}s`);
    console.log(`  Passed: ${passed} / ${flat.length}`);
    console.log(`  (Sequential baseline: ~${flat.length * 6}s estimated; speedup: ${((flat.length * 6000) / elapsedTotal).toFixed(1)}x)`);

    return {
      scenariosRun: flat.length,
      passed,
      results: flat,
      elapsedMs: elapsedTotal,
    };
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
  const workersArg = argv.find(a => a.startsWith('--workers='));
  const timeoutArg = argv.find(a => a.startsWith('--timeout='));
  const dryRun = argv.includes('--dry-run');

  const opts = {
    workers: workersArg ? parseInt(workersArg.split('=')[1]) : 3,
    timeoutPerScenarioMs: timeoutArg ? parseInt(timeoutArg.split('=')[1]) * 1000 : 60_000,
    dryRun,
  };

  runParallelEval(opts)
    .then(r => { process.exit(r.passed === r.scenariosRun || r.dryRun ? 0 : 1); })
    .catch(err => { console.error('Eval failed:', err.message); process.exit(1); });
}

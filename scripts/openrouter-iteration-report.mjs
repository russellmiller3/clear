#!/usr/bin/env node
import Database from 'better-sqlite3';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export function summarizeRuns(payload) {
  const runs = payload.runs || [];
  const byModel = new Map();
  const byMode = new Map();
  const byTask = new Map();

  for (const run of runs) {
    addSummary(byModel, run.model, run);
    addSummary(byMode, run.modeLabel || run.mode, run);
    addSummary(byTask, run.taskTitle || run.taskId, run);
  }

  return {
    totals: {
      runs: runs.length,
      successes: runs.filter((run) => run.success).length,
      failures: runs.filter((run) => !run.success).length,
      totalSpend: Number(runs.reduce((sum, run) => sum + Number(run.totalCost || 0), 0).toFixed(6)),
      totalAttempts: runs.reduce((sum, run) => sum + (run.attempts?.length || 0), 0),
    },
    byModel: sortSummaries([...byModel.values()]),
    byMode: sortSummaries([...byMode.values()]),
    byTask: sortSummaries([...byTask.values()]),
    failures: runs
      .filter((run) => !run.success)
      .map((run) => ({
        model: run.model,
        task: run.taskTitle || run.taskId,
        mode: run.modeLabel || run.mode,
        failedChecks: (run.finalFailedChecks || []).map((item) => item.id),
      })),
  };
}

function addSummary(map, key, run) {
  const row = map.get(key) || {
    label: key,
    runs: 0,
    successes: 0,
    attempts: 0,
    cost: 0,
    latencyMs: 0,
  };
  row.runs += 1;
  row.successes += run.success ? 1 : 0;
  row.attempts += run.attempts?.length || 0;
  row.cost += Number(run.totalCost || 0);
  row.latencyMs += Number(run.totalLatencyMs || 0);
  map.set(key, row);
}

function sortSummaries(rows) {
  return rows
    .map((row) => ({
      ...row,
      failures: row.runs - row.successes,
      successRate: row.runs ? row.successes / row.runs : 0,
      avgAttempts: row.runs ? row.attempts / row.runs : 0,
      avgLatencySeconds: row.runs ? (row.latencyMs / row.runs) / 1000 : 0,
      cost: Number(row.cost.toFixed(6)),
    }))
    .sort((a, b) => b.successRate - a.successRate || a.avgAttempts - b.avgAttempts || a.cost - b.cost);
}

export function readToolCallCounts(dbPath, outputPath) {
  const db = new Database(dbPath, { readonly: true });
  try {
    return {
      total: db.prepare(`
        SELECT COUNT(*) AS count
        FROM model_benchmark_tool_calls tc
        JOIN model_benchmark_runs r ON r.run_id = tc.run_id
        WHERE r.output_path = ?
      `).get(outputPath)?.count || 0,
      byTool: db.prepare(`
        SELECT COALESCE(tool_name, '(unnamed)') AS tool_name, COUNT(*) AS count
        FROM model_benchmark_tool_calls tc
        JOIN model_benchmark_runs r ON r.run_id = tc.run_id
        WHERE r.output_path = ?
        GROUP BY COALESCE(tool_name, '(unnamed)')
        ORDER BY count DESC, tool_name ASC
      `).all(outputPath),
    };
  } finally {
    db.close();
  }
}

export function renderHtml({ payload, summary, toolCalls = { total: 0, byTool: [] } }) {
  const generatedAt = new Date().toISOString();
  const topModel = summary.byModel[0];
  const totalSpend = money(summary.totals.totalSpend);
  const passRate = percent(summary.totals.runs ? summary.totals.successes / summary.totals.runs : 0);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>OpenRouter Iteration Benchmark - Clear</title>
  <style>
    :root {
      --ink: #182132;
      --muted: #637083;
      --line: #d9e1ec;
      --paper: #f6f8fb;
      --panel: #ffffff;
      --blue: #4169e1;
      --teal: #0b8f83;
      --gold: #b87916;
      --red: #b83b42;
      --green: #21845b;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--paper);
      color: var(--ink);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      line-height: 1.45;
    }
    .shell { max-width: 1180px; margin: 0 auto; padding: 32px 20px 56px; }
    header, section { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 24px; margin-bottom: 18px; }
    .eyebrow { color: var(--blue); font-size: 13px; font-weight: 800; text-transform: uppercase; }
    h1, h2, h3 { margin: 0; line-height: 1.1; letter-spacing: 0; }
    h1 { font-size: clamp(32px, 5vw, 52px); margin-top: 8px; max-width: 900px; }
    h2 { font-size: 24px; margin-bottom: 14px; }
    h3 { font-size: 15px; margin-bottom: 8px; }
    p { color: var(--muted); margin: 10px 0 0; max-width: 820px; }
    .metrics { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-top: 18px; }
    .metric { border: 1px solid var(--line); border-radius: 8px; padding: 16px; background: #fbfcfe; }
    .value { display: block; font-size: 28px; font-weight: 850; white-space: nowrap; }
    .label { color: var(--muted); font-size: 13px; }
    .grid { display: grid; grid-template-columns: 1.2fr 0.8fr; gap: 18px; }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    th, td { border-bottom: 1px solid var(--line); padding: 10px 8px; text-align: left; vertical-align: top; }
    th { color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: 0; }
    .bar { height: 10px; background: #e8edf6; border-radius: 999px; overflow: hidden; min-width: 120px; }
    .fill { height: 100%; background: var(--teal); border-radius: inherit; }
    .fail .fill { background: var(--red); }
    .money { font-variant-numeric: tabular-nums; }
    .pill { display: inline-block; border-radius: 999px; padding: 3px 8px; background: #eaf5f3; color: var(--teal); font-weight: 700; font-size: 12px; }
    .warn { background: #fff6df; color: var(--gold); }
    .bad { background: #fbe9eb; color: var(--red); }
    @media (max-width: 820px) {
      .metrics, .grid { grid-template-columns: 1fr; }
      .shell { padding: 20px 12px 40px; }
      table { font-size: 13px; }
    }
  </style>
</head>
<body>
  <main class="shell">
    <header>
      <div class="eyebrow">Clear model benchmark</div>
      <h1>Iteration Benchmark: Can the model recover after requirements fail?</h1>
      <p>This run compares OpenRouter models on hard app builds. Each model must emit checkable requirements and Clear source, receive feedback, then try again.</p>
      <div class="metrics">
        <div class="metric"><span class="value">${summary.totals.successes}/${summary.totals.runs}</span><span class="label">successful runs</span></div>
        <div class="metric"><span class="value">${passRate}</span><span class="label">pass rate</span></div>
        <div class="metric"><span class="value">${totalSpend}</span><span class="label">logged spend</span></div>
        <div class="metric"><span class="value">${toolCalls.total}</span><span class="label">tool calls captured</span></div>
      </div>
      <p><strong>Best current model:</strong> ${escapeHtml(topModel?.label || 'none yet')} at ${percent(topModel?.successRate || 0)} pass rate. Generated ${escapeHtml(generatedAt)}.</p>
    </header>

    <div class="grid">
      <section>
        <h2>Model Results</h2>
        ${summaryTable(summary.byModel, 'model')}
      </section>
      <section>
        <h2>Feedback Modes</h2>
        ${summaryTable(summary.byMode, 'mode')}
      </section>
    </div>

    <section>
      <h2>Task Results</h2>
      ${summaryTable(summary.byTask, 'task')}
    </section>

    <section>
      <h2>Tasks Tested</h2>
      <table>
        <thead><tr><th>Task</th><th>Family</th><th>What It Tests</th></tr></thead>
        <tbody>
          ${(payload.tasks || []).map((task) => `<tr><td>${escapeHtml(task.title || task.id)}</td><td>${escapeHtml(task.family)}</td><td>${escapeHtml(task.userAsk || '').slice(0, 420)}${(task.userAsk || '').length > 420 ? '...' : ''}</td></tr>`).join('\n')}
        </tbody>
      </table>
    </section>

    <section>
      <h2>Tool Calls</h2>
      <p>Tool-call rows are logged separately from chat messages. This run will show zero if no tools were exposed or no provider emitted tool-call metadata.</p>
      ${toolCalls.byTool.length ? `<table><thead><tr><th>Tool</th><th>Calls</th></tr></thead><tbody>${toolCalls.byTool.map((row) => `<tr><td>${escapeHtml(row.tool_name)}</td><td>${row.count}</td></tr>`).join('\n')}</tbody></table>` : '<p><span class="pill warn">No tool calls captured in this artifact.</span></p>'}
    </section>

    <section>
      <h2>Failure Appendix</h2>
      <table>
        <thead><tr><th>Model</th><th>Task</th><th>Mode</th><th>Failed Checks</th></tr></thead>
        <tbody>
          ${summary.failures.map((row) => `<tr><td>${escapeHtml(row.model)}</td><td>${escapeHtml(row.task)}</td><td>${escapeHtml(row.mode)}</td><td>${escapeHtml(row.failedChecks.join(', ') || 'none recorded')}</td></tr>`).join('\n')}
        </tbody>
      </table>
    </section>
  </main>
</body>
</html>`;
}

function summaryTable(rows, noun) {
  return `<table>
    <thead><tr><th>${escapeHtml(noun)}</th><th>Pass Rate</th><th>Runs</th><th>Avg Tries</th><th>Cost</th></tr></thead>
    <tbody>
      ${rows.map((row) => `<tr>
        <td>${escapeHtml(row.label)}</td>
        <td><div class="bar ${row.successRate ? '' : 'fail'}"><div class="fill" style="width: ${Math.round(row.successRate * 100)}%"></div></div>${percent(row.successRate)}</td>
        <td>${row.successes}/${row.runs}</td>
        <td>${row.avgAttempts.toFixed(1)}</td>
        <td class="money">${money(row.cost)}</td>
      </tr>`).join('\n')}
    </tbody>
  </table>`;
}

function percent(value) {
  return `${Math.round((Number(value) || 0) * 100)}%`;
}

function money(value) {
  return `$${Number(value || 0).toFixed(4)}`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const payload = JSON.parse(await fs.readFile(args.input, 'utf8'));
  const summary = summarizeRuns(payload);
  const outputPath = path.resolve(args.input);
  let toolCalls = { total: 0, byTool: [] };
  if (args.db) {
    try {
      toolCalls = readToolCallCounts(args.db, outputPath);
    } catch {
      toolCalls = { total: 0, byTool: [] };
    }
  }
  const html = renderHtml({ payload, summary, toolCalls });
  await fs.mkdir(path.dirname(args.out), { recursive: true });
  await fs.writeFile(args.out, html);
  console.log(JSON.stringify({ out: args.out, runs: summary.totals.runs, successes: summary.totals.successes, spend: summary.totals.totalSpend }, null, 2));
}

function parseArgs(argv) {
  const args = {
    input: path.join(process.cwd(), '.tmp', 'openrouter-iteration-benchmark-toolcalls-2026-05-12.json'),
    out: path.join(process.cwd(), 'docs', 'openrouter-iteration-benchmark-2026-05-12.html'),
    db: path.join(process.cwd(), 'studio', 'factor-db.sqlite'),
  };
  for (const arg of argv) {
    if (arg.startsWith('--input=')) args.input = path.resolve(arg.slice('--input='.length));
    else if (arg.startsWith('--out=')) args.out = path.resolve(arg.slice('--out='.length));
    else if (arg.startsWith('--db=')) args.db = path.resolve(arg.slice('--db='.length));
    else if (arg === '--no-db') args.db = null;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((error) => {
    console.error(error.stack || error.message || error);
    process.exit(1);
  });
}

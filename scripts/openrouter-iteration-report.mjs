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
  const modelMeta = new Map();

  for (const model of payload.models || []) {
    if (model.label) modelMeta.set(model.label, model);
  }

  for (const run of runs) {
    run.providerBlocked = isProviderBlocked(run);
    addSummary(byModel, run.model, run);
    addSummary(byMode, run.modeLabel || run.mode, run);
    addSummary(byTask, run.taskTitle || run.taskId, run);
  }

  const byModelRows = sortSummaries([...byModel.values()])
    .map((row) => ({
      ...row,
      tier: row.tier || modelMeta.get(row.label)?.tier || inferModelTier(row.label),
    }));
  const rankings = rankModels(byModelRows);
  const cheapRankings = rankModels(byModelRows.filter((row) => row.tier === 'cheap'));

  return {
    totals: {
      runs: runs.length,
      successes: runs.filter((run) => run.success).length,
      failures: runs.filter((run) => !run.success).length,
      blocked: runs.filter((run) => run.providerBlocked).length,
      totalSpend: Number(runs.reduce((sum, run) => sum + Number(run.totalCost || 0), 0).toFixed(6)),
      totalAttempts: runs.reduce((sum, run) => sum + (run.attempts?.length || 0), 0),
      timeouts: runs.filter((run) => run.timedOut).length,
    },
    byModel: byModelRows,
    byMode: sortSummaries([...byMode.values()]),
    byTask: sortSummaries([...byTask.values()]),
    rankings,
    cheapRankings,
    failures: runs
      .filter((run) => !run.success && !run.providerBlocked)
      .map((run) => ({
        model: run.model,
        task: run.taskTitle || run.taskId,
        mode: run.modeLabel || run.mode,
        failedChecks: (run.finalFailedChecks || []).map((item) => item.id),
      })),
    blocked: runs
      .filter((run) => run.providerBlocked)
      .map((run) => ({
        model: run.model,
        task: run.taskTitle || run.taskId,
        mode: run.modeLabel || run.mode,
        reason: run.finalError || 'Provider request failed before scoring.',
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
    durationMs: 0,
    successDurationMs: 0,
    timedOut: 0,
    blocked: 0,
    bestScore: 0,
    scoreSum: 0,
    initialGaps: 0,
    finalGaps: 0,
    gapsClosed: 0,
    tier: run.modelTier,
  };
  const score = scoreRun(run);
  row.runs += 1;
  row.successes += run.success ? 1 : 0;
  row.attempts += run.attempts?.length || 0;
  row.cost += Number(run.totalCost || 0);
  row.latencyMs += Number(run.totalLatencyMs || 0);
  row.durationMs += Number(run.durationMs || run.totalLatencyMs || 0);
  row.successDurationMs += run.success ? Number(run.durationMs || run.totalLatencyMs || 0) : 0;
  row.timedOut += run.timedOut ? 1 : 0;
  row.blocked += run.providerBlocked ? 1 : 0;
  row.bestScore = Math.max(row.bestScore || 0, score.score);
  row.scoreSum += score.score;
  row.initialGaps += score.initialGaps;
  row.finalGaps += score.finalGaps;
  row.gapsClosed += score.gapsClosed;
  row.tier = row.tier || run.modelTier;
  map.set(key, row);
}

function sortSummaries(rows) {
  return rows
    .map((row) => ({
      ...row,
      scoredRuns: row.runs - row.blocked,
      failures: row.runs - row.successes,
      successRate: row.runs - row.blocked ? row.successes / (row.runs - row.blocked) : 0,
      avgAttempts: row.runs - row.blocked ? row.attempts / (row.runs - row.blocked) : 0,
      avgLatencySeconds: row.runs - row.blocked ? (row.latencyMs / (row.runs - row.blocked)) / 1000 : 0,
      avgDurationSeconds: row.runs - row.blocked ? (row.durationMs / (row.runs - row.blocked)) / 1000 : 0,
      avgSuccessSeconds: row.successes ? (row.successDurationMs / row.successes) / 1000 : null,
      costPerSuccess: row.successes ? row.cost / row.successes : null,
      avgScore: row.runs - row.blocked ? row.scoreSum / (row.runs - row.blocked) : 0,
      bestScore: row.bestScore || 0,
      avgGapsClosed: row.runs - row.blocked ? row.gapsClosed / (row.runs - row.blocked) : 0,
      costPerGapClosed: row.gapsClosed > 0 ? row.cost / row.gapsClosed : null,
      cost: Number(row.cost.toFixed(6)),
    }))
    .sort((a, b) => b.successRate - a.successRate || b.avgScore - a.avgScore || b.bestScore - a.bestScore || a.avgAttempts - b.avgAttempts || a.cost - b.cost);
}

function rankModels(rows) {
  return [...rows]
    .filter((row) => row.scoredRuns > 0)
    .sort((a, b) =>
      b.successRate - a.successRate ||
      b.avgScore - a.avgScore ||
      b.bestScore - a.bestScore ||
      nullLast(a.costPerGapClosed, b.costPerGapClosed) ||
      nullLast(a.costPerSuccess, b.costPerSuccess) ||
      nullLast(a.avgSuccessSeconds, b.avgSuccessSeconds) ||
      a.cost - b.cost ||
      a.label.localeCompare(b.label)
    );
}

function nullLast(a, b) {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return a - b;
}

function inferModelTier(label = '') {
  return /opus|sonnet|gpt-5\.5|claude/i.test(label) ? 'premium' : 'cheap';
}

function isProviderBlocked(run = {}) {
  const reason = String(run.finalError || '');
  return /insufficient credits|fetch failed|terminated|provider|quota|rate limit|unauthorized|forbidden/i.test(reason);
}

function scoreRun(run = {}) {
  if (run.providerBlocked) {
    return { score: 0, initialGaps: 0, finalGaps: 0, gapsClosed: 0 };
  }
  const evals = (run.attempts || []).map((attempt) => attempt.evaluation).filter(Boolean);
  const first = evals[0];
  const last = evals[evals.length - 1];
  const totalChecks = Math.max(1, first?.checks?.length || last?.checks?.length || 1);
  const initialGaps = first ? first.failedCount : totalChecks;
  const finalGaps = run.success ? 0 : (last ? last.failedCount : initialGaps);
  const gapsClosed = Math.max(0, initialGaps - finalGaps);
  const score = run.success
    ? 100
    : Math.max(0, Math.min(99, Math.round(((totalChecks - finalGaps) / totalChecks) * 100)));
  return { score, initialGaps, finalGaps, gapsClosed };
}

export function readToolCallCounts(dbPath, outputPath) {
  return readToolCallCountsForPaths(dbPath, [outputPath]);
}

export function readToolCallCountsForPaths(dbPath, outputPaths) {
  const paths = [...new Set((outputPaths || []).filter(Boolean).map((outputPath) => path.resolve(outputPath)))];
  if (!paths.length) return { total: 0, byTool: [] };
  const db = new Database(dbPath, { readonly: true });
  const placeholders = paths.map(() => '?').join(', ');
  try {
    return {
      total: db.prepare(`
        SELECT COUNT(*) AS count
        FROM model_benchmark_tool_calls tc
        JOIN model_benchmark_runs r ON r.run_id = tc.run_id
        WHERE r.output_path IN (${placeholders})
      `).get(...paths)?.count || 0,
      byTool: db.prepare(`
        SELECT COALESCE(tool_name, '(unnamed)') AS tool_name, COUNT(*) AS count
        FROM model_benchmark_tool_calls tc
        JOIN model_benchmark_runs r ON r.run_id = tc.run_id
        WHERE r.output_path IN (${placeholders})
        GROUP BY COALESCE(tool_name, '(unnamed)')
        ORDER BY count DESC, tool_name ASC
      `).all(...paths),
    };
  } finally {
    db.close();
  }
}

export function analyzeRuns(payload, summary = summarizeRuns(payload)) {
  const runs = payload.runs || [];
  return {
    frontier: buildFrontier(summary.byModel),
    ralph: analyzeRalphMovement(runs),
    chat: analyzeChatResponses(runs),
    failures: analyzeFailures(runs),
    compiler: analyzeCompilerErrors(runs),
    taskDifficulty: analyzeTaskDifficulty(runs),
    contenders: pickFiveMinuteContenders(summary.byModel),
  };
}

function buildFrontier(modelRows) {
  const points = modelRows
    .filter((row) => row.scoredRuns > 0)
    .map((row) => {
      const costPerRun = row.cost / Math.max(1, row.scoredRuns);
      return {
        label: row.label,
        tier: row.tier || inferModelTier(row.label),
        cost: row.cost,
        costPerRun,
        avgScore: row.avgScore || 0,
        bestScore: row.bestScore || 0,
        successRate: row.successRate || 0,
        costPerGapClosed: row.costPerGapClosed,
        scoredRuns: row.scoredRuns,
      };
    })
    .sort((a, b) => a.costPerRun - b.costPerRun || b.avgScore - a.avgScore);

  for (const point of points) {
    point.frontier = !points.some((other) =>
      other !== point
      && other.costPerRun <= point.costPerRun
      && other.avgScore >= point.avgScore
      && (other.costPerRun < point.costPerRun || other.avgScore > point.avgScore)
    );
  }

  return {
    points,
    frontier: points.filter((point) => point.frontier).sort((a, b) => a.costPerRun - b.costPerRun),
  };
}

function analyzeRalphMovement(runs) {
  const scoredRuns = runs.filter((run) => !isProviderBlocked(run));
  const singles = new Map();
  for (const run of scoredRuns) {
    if (run.variant === 'single_shot' || run.mode === 'single_shot') {
      singles.set(`${run.modelId || run.model}::${run.taskId}`, run);
    }
  }

  const loopRuns = scoredRuns.filter((run) => run.variant !== 'single_shot' && run.mode !== 'single_shot');
  const pairDeltas = [];
  let improvedPairs = 0;
  let worsenedPairs = 0;
  let tiedPairs = 0;
  let improvedWithinRun = 0;
  let regressedWithinRun = 0;
  let stalledWithinRun = 0;
  let totalGapsClosed = 0;

  for (const run of loopRuns) {
    const score = scoreRun(run);
    totalGapsClosed += score.gapsClosed;
    if (score.finalGaps < score.initialGaps) improvedWithinRun += 1;
    else if (score.finalGaps > score.initialGaps) regressedWithinRun += 1;
    else stalledWithinRun += 1;

    const single = singles.get(`${run.modelId || run.model}::${run.taskId}`);
    if (!single) continue;
    const singleScore = scoreRun(single).score;
    const loopScore = score.score;
    const delta = loopScore - singleScore;
    pairDeltas.push(delta);
    if (delta > 0) improvedPairs += 1;
    else if (delta < 0) worsenedPairs += 1;
    else tiedPairs += 1;
  }

  return {
    loopRuns: loopRuns.length,
    matchedPairs: pairDeltas.length,
    improvedPairs,
    worsenedPairs,
    tiedPairs,
    avgScoreDelta: average(pairDeltas),
    improvedWithinRun,
    regressedWithinRun,
    stalledWithinRun,
    avgGapsClosed: loopRuns.length ? totalGapsClosed / loopRuns.length : 0,
  };
}

function analyzeChatResponses(runs) {
  const totals = {
    totalResponses: 0,
    totalChars: 0,
    clearSourceResponses: 0,
    requirementResponses: 0,
    compilerMentions: 0,
    patternMentions: 0,
    toolCalls: 0,
  };
  const byModel = new Map();
  const byTool = new Map();

  for (const run of runs) {
    const row = byModel.get(run.model) || { label: run.model, responses: 0, chars: 0, clearSourceResponses: 0, toolCalls: 0, compilerMentions: 0, patternMentions: 0 };
    for (const attempt of run.attempts || []) {
      const content = String(attempt.content || attempt.rawResponse || '');
      if (!content && !(attempt.toolCalls || []).length) continue;
      const toolCount = (attempt.toolCalls || []).length;
      for (const call of attempt.toolCalls || []) {
        increment(byTool, call.function?.name || call.tool_name || call.name || '(unknown)');
      }
      totals.totalResponses += 1;
      totals.totalChars += content.length;
      totals.toolCalls += toolCount;
      row.responses += 1;
      row.chars += content.length;
      row.toolCalls += toolCount;
      if (/CLEAR_SOURCE\s*:/i.test(content)) {
        totals.clearSourceResponses += 1;
        row.clearSourceResponses += 1;
      }
      if (/REQUIREMENTS\s*:/i.test(content)) totals.requirementResponses += 1;
      if (/compiler|compile|error|line\s+\d+/i.test(content)) {
        totals.compilerMentions += 1;
        row.compilerMentions += 1;
      }
      if (/pattern|example|similar|retrieval|database/i.test(content)) {
        totals.patternMentions += 1;
        row.patternMentions += 1;
      }
    }
    byModel.set(run.model, row);
  }

  return {
    ...totals,
    avgChars: totals.totalResponses ? totals.totalChars / totals.totalResponses : 0,
    clearSourceRate: totals.totalResponses ? totals.clearSourceResponses / totals.totalResponses : 0,
    requirementRate: totals.totalResponses ? totals.requirementResponses / totals.totalResponses : 0,
    byTool: topCounts(byTool, 12).map(([tool, count]) => ({ tool, count })),
    byModel: [...byModel.values()]
      .map((row) => ({
        ...row,
        avgChars: row.responses ? row.chars / row.responses : 0,
        clearSourceRate: row.responses ? row.clearSourceResponses / row.responses : 0,
      }))
      .sort((a, b) => b.responses - a.responses || b.avgChars - a.avgChars),
  };
}

function analyzeFailures(runs) {
  const checkCounts = new Map();
  const categoryCounts = new Map();
  for (const run of runs) {
    if (isProviderBlocked(run)) continue;
    for (const failed of run.finalFailedChecks || []) {
      const id = String(failed.id || failed.label || 'unknown');
      increment(checkCounts, id);
      increment(categoryCounts, categorizeFailedCheck(id));
    }
  }
  return {
    topFailedChecks: topCounts(checkCounts, 12).map(([id, count]) => ({ id, count })),
    topCategories: topCounts(categoryCounts, 8).map(([category, count]) => ({ category, count })),
  };
}

function analyzeCompilerErrors(runs) {
  const categoryCounts = new Map();
  const messageCounts = new Map();
  let totalErrors = 0;
  let attemptsWithErrors = 0;
  for (const run of runs) {
    for (const attempt of run.attempts || []) {
      const errors = attempt.evaluation?.compileErrors || [];
      if (errors.length) attemptsWithErrors += 1;
      for (const error of errors) {
        const message = String(error.message || error || '').trim();
        if (!message) continue;
        totalErrors += 1;
        increment(categoryCounts, categorizeCompilerError(message));
        increment(messageCounts, message.replace(/\s+/g, ' ').slice(0, 180));
      }
    }
  }
  return {
    totalErrors,
    attemptsWithErrors,
    topCategories: topCounts(categoryCounts, 8).map(([category, count]) => ({ category, count })),
    topMessages: topCounts(messageCounts, 8).map(([message, count]) => ({ message, count })),
  };
}

function pickFiveMinuteContenders(modelRows) {
  const rows = modelRows
    .filter((row) => row.scoredRuns > 0)
    .map((row) => ({
      label: row.label,
      tier: row.tier || inferModelTier(row.label),
      avgScore: row.avgScore || 0,
      bestScore: row.bestScore || 0,
      costPerRun: row.cost / Math.max(1, row.scoredRuns),
      costPerGapClosed: row.costPerGapClosed,
      scoredRuns: row.scoredRuns,
    }));
  const keep = [];
  const cut = [];
  for (const row of rows) {
    const strong = row.bestScore >= 70 || row.avgScore >= 35;
    const cheapProgress = row.bestScore >= 55 && row.costPerGapClosed != null && row.costPerGapClosed <= 0.1;
    const decision = strong || cheapProgress ? keep : cut;
    decision.push({
      ...row,
      reason: strong
        ? 'kept: enough completion signal'
        : cheapProgress
          ? 'kept: cheap gap-closing signal'
          : 'cut: low score signal in 2m lane',
    });
  }
  return {
    keep: keep.sort((a, b) => b.avgScore - a.avgScore || b.bestScore - a.bestScore || a.costPerRun - b.costPerRun),
    cut: cut.sort((a, b) => b.bestScore - a.bestScore || b.avgScore - a.avgScore),
  };
}

function analyzeTaskDifficulty(runs) {
  const byTask = new Map();
  for (const run of runs) {
    if (isProviderBlocked(run)) continue;
    const key = run.taskTitle || run.taskId || 'unknown task';
    const row = byTask.get(key) || {
      label: key,
      taskId: run.taskId,
      runs: 0,
      successes: 0,
      attempts: 0,
      cost: 0,
      scoreSum: 0,
      bestScore: 0,
      finalGaps: 0,
      gapsClosed: 0,
      timeouts: 0,
    };
    const score = scoreRun(run);
    row.runs += 1;
    row.successes += run.success ? 1 : 0;
    row.attempts += run.attempts?.length || 0;
    row.cost += Number(run.totalCost || 0);
    row.scoreSum += score.score;
    row.bestScore = Math.max(row.bestScore, score.score);
    row.finalGaps += score.finalGaps;
    row.gapsClosed += score.gapsClosed;
    row.timeouts += run.timedOut ? 1 : 0;
    byTask.set(key, row);
  }
  return [...byTask.values()]
    .map((row) => ({
      ...row,
      avgScore: row.runs ? row.scoreSum / row.runs : 0,
      passRate: row.runs ? row.successes / row.runs : 0,
      avgAttempts: row.runs ? row.attempts / row.runs : 0,
      avgFinalGaps: row.runs ? row.finalGaps / row.runs : 0,
      costPerGapClosed: row.gapsClosed > 0 ? row.cost / row.gapsClosed : null,
      cost: Number(row.cost.toFixed(6)),
    }))
    .sort((a, b) =>
      a.passRate - b.passRate ||
      a.avgScore - b.avgScore ||
      b.avgFinalGaps - a.avgFinalGaps ||
      b.timeouts - a.timeouts ||
      a.label.localeCompare(b.label)
    );
}

function categorizeFailedCheck(id) {
  if (/sched|cron|every|minute|hour/i.test(id)) return 'scheduler';
  if (/twitter|stripe|external|api|bearer|sync|outgoing/i.test(id)) return 'external api';
  if (/ui|page|form|table|chart|button|display|frontend/i.test(id)) return 'frontend';
  if (/deal|approval|risk|score|status|submit|cancel|workflow/i.test(id)) return 'workflow rules';
  if (/table|schema|field|crud|endpoint|list|get|post|delete/i.test(id)) return 'data and endpoints';
  return 'other';
}

function categorizeCompilerError(message) {
  if (/allowlist|outgoing request|not allowed/i.test(message)) return 'outgoing allowlist';
  if (/line\s+\d+|parse|expected|unexpected|syntax/i.test(message)) return 'syntax and parse';
  if (/endpoint|route|\/api\//i.test(message)) return 'endpoint wiring';
  if (/table|field|column|record/i.test(message)) return 'data model';
  if (/page|button|display|html|frontend/i.test(message)) return 'frontend wiring';
  if (/role|permission|auth|creator/i.test(message)) return 'permissions';
  return 'other';
}

function increment(map, key, amount = 1) {
  map.set(key, (map.get(key) || 0) + amount);
}

function topCounts(map, limit) {
  return [...map.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]))).slice(0, limit);
}

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

export function renderHtml({ payload, summary, analysis = analyzeRuns(payload, summary), toolCalls = { total: 0, byTool: [] } }) {
  const generatedAt = new Date().toISOString();
  const topModel = summary.byModel[0];
  const topCheap = summary.cheapRankings[0];
  const totalSpend = money(summary.totals.totalSpend);
  const passRate = percent(summary.totals.runs ? summary.totals.successes / summary.totals.runs : 0);
  const creditSummary = summarizeCreditSnapshots(payload.costSnapshots || []);

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
    .chart-wrap { border: 1px solid var(--line); border-radius: 8px; background: #fbfcfe; padding: 12px; overflow-x: auto; }
    svg.frontier { min-width: 860px; width: 100%; height: auto; display: block; }
    .axis { stroke: #98a6b8; stroke-width: 1; }
    .grid-line { stroke: #e3e9f2; stroke-width: 1; }
    .frontier-line { fill: none; stroke: var(--teal); stroke-width: 3; }
    .dot { stroke: #fff; stroke-width: 2; }
    .dot.frontier-dot { stroke: var(--teal); stroke-width: 3; }
    .chart-label { fill: var(--ink); font-size: 12px; font-weight: 750; }
    .axis-label { fill: var(--muted); font-size: 12px; }
    .note-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-top: 14px; }
    .note { border: 1px solid var(--line); border-radius: 8px; padding: 14px; background: #fbfcfe; }
    .note strong { display: block; margin-bottom: 4px; }
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
        <div class="metric"><span class="value">${summary.totals.blocked}</span><span class="label">provider-blocked runs</span></div>
      </div>
      <p><strong>Best cheap model:</strong> ${escapeHtml(topCheap?.label || 'none yet')} at ${percent(topCheap?.successRate || 0)} pass rate. <strong>Best overall:</strong> ${escapeHtml(topModel?.label || 'none yet')} at ${percent(topModel?.successRate || 0)} pass rate. Generated ${escapeHtml(generatedAt)}.</p>
    </header>

    <section>
      <h2>Recommended Rankings</h2>
      <p>Rankings sort first by full success, then partial-credit score, then best single run, then cost per requirement gap closed.</p>
      <div class="grid">
        <div>
          <h3>Cheap Models</h3>
          ${rankingTable(summary.cheapRankings)}
        </div>
        <div>
          <h3>Overall</h3>
          ${rankingTable(summary.rankings)}
        </div>
      </div>
    </section>

    <section>
      <h2>What We Learn So Far</h2>
      <div class="note-grid">
        ${insightCards(summary, analysis)}
      </div>
    </section>

    <section>
      <h2>Price vs Completion Frontier</h2>
      <p>Each dot is one model. Higher is better completion. Further right costs more per scored run. Frontier dots are the non-dominated choices: no cheaper model scored as well or better.</p>
      <div class="chart-wrap">${frontierChart(analysis.frontier)}</div>
      ${frontierTable(analysis.frontier.points)}
    </section>

    <section>
      <h2>What Ralph Changed</h2>
      <div class="metrics">
        <div class="metric"><span class="value">${analysis.ralph.improvedWithinRun}/${analysis.ralph.loopRuns}</span><span class="label">loop runs improved while retrying</span></div>
        <div class="metric"><span class="value">${analysis.ralph.matchedPairs}</span><span class="label">single-shot vs Ralph pairs</span></div>
        <div class="metric"><span class="value">${signedNumber(analysis.ralph.avgScoreDelta)} pts</span><span class="label">average Ralph score delta</span></div>
        <div class="metric"><span class="value">${analysis.ralph.avgGapsClosed.toFixed(1)}</span><span class="label">avg requirement gaps closed</span></div>
      </div>
      <p>Ralph is counted as useful only when the failed-check count or score moves. This keeps the analysis from rewarding models for simply talking longer.</p>
    </section>

    <section>
      <h2>Chat and Tool Behavior</h2>
      <div class="metrics">
        <div class="metric"><span class="value">${analysis.chat.totalResponses}</span><span class="label">model responses analyzed</span></div>
        <div class="metric"><span class="value">${Math.round(analysis.chat.avgChars)}</span><span class="label">avg response chars</span></div>
        <div class="metric"><span class="value">${percent(analysis.chat.clearSourceRate)}</span><span class="label">responses with Clear source</span></div>
        <div class="metric"><span class="value">${analysis.chat.toolCalls}</span><span class="label">tool calls found in chat logs</span></div>
      </div>
      ${chatModelTable(analysis.chat.byModel)}
    </section>

    <section>
      <h2>Failure and Compiler Signals</h2>
      <div class="grid">
        <div>
          <h3>Requirement Gaps</h3>
          ${countTable(analysis.failures.topFailedChecks, 'Check', 'id')}
        </div>
        <div>
          <h3>Compiler Error Buckets</h3>
          ${countTable(analysis.compiler.topCategories, 'Category', 'category')}
        </div>
      </div>
      <p>Total compiler errors in analyzed chats: ${analysis.compiler.totalErrors}. Attempts with compiler errors: ${analysis.compiler.attemptsWithErrors}.</p>
      <h3>Top Raw Compiler Messages</h3>
      ${countTable(analysis.compiler.topMessages, 'Message', 'message')}
    </section>

    <section>
      <h2>Task Difficulty</h2>
      <p>Harder tasks have lower average completion, more gaps left, more timeouts, and worse cost per gap closed.</p>
      ${taskDifficultyTable(analysis.taskDifficulty)}
    </section>

    <section>
      <h2>5m Contenders</h2>
      <p>Poor 2m performers should not get expensive 5m reruns. Keep models with strong completion signal or unusually cheap gap-closing signal.</p>
      <div class="grid">
        <div>
          <h3>Keep</h3>
          ${contenderTable(analysis.contenders.keep)}
        </div>
        <div>
          <h3>Cut For Now</h3>
          ${contenderTable(analysis.contenders.cut)}
        </div>
      </div>
    </section>

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
      <p>Tool calls are counted from attempt logs and, when available, from the benchmark database. Combined reports may have database rows under the original run file but still retain per-attempt tool-call evidence.</p>
      <p><strong>Attempt-log tool calls:</strong> ${analysis.chat.toolCalls}. <strong>Database-filtered tool calls:</strong> ${toolCalls.total}.</p>
      ${analysis.chat.byTool.length ? `<table><thead><tr><th>Attempt-Log Tool</th><th>Calls</th></tr></thead><tbody>${analysis.chat.byTool.map((row) => `<tr><td>${escapeHtml(row.tool)}</td><td>${row.count}</td></tr>`).join('\n')}</tbody></table>` : ''}
      ${toolCalls.byTool.length ? `<table><thead><tr><th>Tool</th><th>Calls</th></tr></thead><tbody>${toolCalls.byTool.map((row) => `<tr><td>${escapeHtml(row.tool_name)}</td><td>${row.count}</td></tr>`).join('\n')}</tbody></table>` : '<p><span class="pill warn">No tool calls captured in this artifact.</span></p>'}
    </section>

    <section>
      <h2>OpenRouter Cost Log</h2>
      <p>Credits come from OpenRouter's credits endpoint. Per-call costs are also logged in the benchmark database when a generation id is available.</p>
      <div class="metrics">
        <div class="metric"><span class="value">${creditSummary.startUsage == null ? 'n/a' : money(creditSummary.startUsage)}</span><span class="label">usage at start</span></div>
        <div class="metric"><span class="value">${creditSummary.endUsage == null ? 'n/a' : money(creditSummary.endUsage)}</span><span class="label">usage at end</span></div>
        <div class="metric"><span class="value">${creditSummary.usageDelta == null ? 'n/a' : money(creditSummary.usageDelta)}</span><span class="label">usage delta</span></div>
        <div class="metric"><span class="value">${payload.costSnapshots?.length || 0}</span><span class="label">credit snapshots</span></div>
      </div>
      ${costSnapshotTable(payload.costSnapshots || [])}
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

    <section>
      <h2>Provider-Blocked Appendix</h2>
      <p>These runs did not test model quality. They failed before a scored answer could be evaluated.</p>
      <table>
        <thead><tr><th>Model</th><th>Task</th><th>Mode</th><th>Reason</th></tr></thead>
        <tbody>
          ${summary.blocked.map((row) => `<tr><td>${escapeHtml(row.model)}</td><td>${escapeHtml(row.task)}</td><td>${escapeHtml(row.mode)}</td><td>${escapeHtml(row.reason)}</td></tr>`).join('\n')}
        </tbody>
      </table>
    </section>
  </main>
</body>
</html>`;
}

function summaryTable(rows, noun) {
  return `<table>
    <thead><tr><th>${escapeHtml(noun)}</th><th>Pass Rate</th><th>Score</th><th>Best</th><th>Scored</th><th>Blocked</th><th>Avg Tries</th><th>Cost</th><th>Cost / Gap</th></tr></thead>
    <tbody>
      ${rows.map((row) => `<tr>
        <td>${escapeHtml(row.label)}</td>
        <td><div class="bar ${row.successRate ? '' : 'fail'}"><div class="fill" style="width: ${Math.round(row.successRate * 100)}%"></div></div>${percent(row.successRate)}</td>
        <td>${Math.round(row.avgScore)}%</td>
        <td>${Math.round(row.bestScore)}%</td>
        <td>${row.successes}/${row.scoredRuns}</td>
        <td>${row.blocked}</td>
        <td>${row.avgAttempts.toFixed(1)}</td>
        <td class="money">${money(row.cost)}</td>
        <td class="money">${row.costPerGapClosed == null ? 'n/a' : money(row.costPerGapClosed)}</td>
      </tr>`).join('\n')}
    </tbody>
  </table>`;
}

function rankingTable(rows) {
  if (!rows.length) return '<p><span class="pill warn">No runs yet.</span></p>';
  return `<table>
    <thead><tr><th>Rank</th><th>Model</th><th>Pass</th><th>Avg Score</th><th>Best</th><th>Cost / Gap</th></tr></thead>
    <tbody>
      ${rows.map((row, index) => `<tr>
        <td>${index + 1}</td>
        <td>${escapeHtml(row.label)} <span class="pill ${row.tier === 'premium' ? 'warn' : ''}">${escapeHtml(row.tier || 'cheap')}</span></td>
        <td>${row.successes}/${row.scoredRuns} (${percent(row.successRate)})</td>
        <td>${Math.round(row.avgScore)}%</td>
        <td>${Math.round(row.bestScore)}%</td>
        <td class="money">${row.costPerGapClosed == null ? 'n/a' : money(row.costPerGapClosed)}</td>
      </tr>`).join('\n')}
    </tbody>
  </table>`;
}

function frontierChart(frontier) {
  const points = frontier.points || [];
  if (!points.length) return '<p><span class="pill warn">No scored model runs yet.</span></p>';
  const width = 900;
  const height = 420;
  const pad = { left: 70, right: 34, top: 28, bottom: 62 };
  const minCost = 0.001;
  const costs = points.map((point) => Math.max(minCost, point.costPerRun || 0));
  const minXRaw = Math.log10(Math.min(...costs));
  const maxXRaw = Math.log10(Math.max(...costs) * 1.2);
  const minScore = Math.max(0, Math.min(...points.map((point) => point.avgScore)) - 8);
  const maxScore = Math.min(100, Math.max(...points.map((point) => point.avgScore)) + 8);
  const x = (cost) => {
    const raw = Math.log10(Math.max(minCost, cost || 0));
    const t = maxXRaw === minXRaw ? 0.5 : (raw - minXRaw) / (maxXRaw - minXRaw);
    return pad.left + t * (width - pad.left - pad.right);
  };
  const y = (score) => {
    const t = maxScore === minScore ? 0.5 : (score - minScore) / (maxScore - minScore);
    return height - pad.bottom - t * (height - pad.top - pad.bottom);
  };
  const frontierLine = (frontier.frontier || [])
    .map((point) => `${x(point.costPerRun).toFixed(1)},${y(point.avgScore).toFixed(1)}`)
    .join(' ');
  const guideScores = [25, 50, 75, 100].filter((score) => score >= minScore && score <= maxScore);
  const labels = [...points]
    .sort((a, b) => (b.frontier ? 1 : 0) - (a.frontier ? 1 : 0) || b.avgScore - a.avgScore)
    .slice(0, 10);
  return `<svg class="frontier" viewBox="0 0 ${width} ${height}" role="img" aria-label="Price versus completion frontier">
    ${guideScores.map((score) => `<line class="grid-line" x1="${pad.left}" y1="${y(score).toFixed(1)}" x2="${width - pad.right}" y2="${y(score).toFixed(1)}"></line><text class="axis-label" x="16" y="${(y(score) + 4).toFixed(1)}">${score}%</text>`).join('\n')}
    <line class="axis" x1="${pad.left}" y1="${height - pad.bottom}" x2="${width - pad.right}" y2="${height - pad.bottom}"></line>
    <line class="axis" x1="${pad.left}" y1="${pad.top}" x2="${pad.left}" y2="${height - pad.bottom}"></line>
    ${frontierLine ? `<polyline class="frontier-line" points="${frontierLine}"></polyline>` : ''}
    ${points.map((point) => `<circle class="dot ${point.frontier ? 'frontier-dot' : ''}" cx="${x(point.costPerRun).toFixed(1)}" cy="${y(point.avgScore).toFixed(1)}" r="${point.frontier ? 8 : 6}" fill="${point.tier === 'premium' ? '#b87916' : '#4169e1'}"><title>${escapeHtml(point.label)}: ${Math.round(point.avgScore)}% avg score, ${money(point.costPerRun)} per run</title></circle>`).join('\n')}
    ${labels.map((point, index) => `<text class="chart-label" x="${(x(point.costPerRun) + 10).toFixed(1)}" y="${(y(point.avgScore) + (index % 2 ? 18 : -10)).toFixed(1)}">${escapeHtml(shortModelLabel(point.label))}</text>`).join('\n')}
    <text class="axis-label" x="${width / 2 - 82}" y="${height - 18}">cost per scored run, log scale</text>
    <text class="axis-label" transform="translate(18 ${height / 2 + 70}) rotate(-90)">average completion score</text>
  </svg>`;
}

function insightCards(summary, analysis) {
  const frontierWinner = [...(analysis.frontier.frontier || [])].sort((a, b) => b.avgScore - a.avgScore || a.costPerRun - b.costPerRun)[0];
  const topOverall = summary.rankings[0];
  const hardestTask = analysis.taskDifficulty[0];
  const topCompiler = analysis.compiler.topCategories[0];
  const kept = analysis.contenders.keep.slice(0, 5).map((row) => row.label).join(', ') || 'none yet';
  const ralphUseful = analysis.ralph.loopRuns
    ? `${analysis.ralph.improvedWithinRun}/${analysis.ralph.loopRuns} loop runs improved while retrying`
    : 'no loop runs were scored';
  const pairText = analysis.ralph.matchedPairs
    ? `${analysis.ralph.improvedPairs}/${analysis.ralph.matchedPairs} matched single-shot pairs improved, average ${signedNumber(analysis.ralph.avgScoreDelta)} points`
    : 'no matched single-shot pairs in this artifact';
  const cards = [
    {
      title: 'Best buy',
      body: frontierWinner
        ? `${frontierWinner.label} is on the price/completion frontier at ${Math.round(frontierWinner.avgScore)}% average score and ${money(frontierWinner.costPerRun)} per scored run.`
        : 'No frontier winner yet.',
    },
    {
      title: 'Smartest overall',
      body: topOverall
        ? `${topOverall.label} ranks first by the scoring rule: ${Math.round(topOverall.avgScore)}% average score, ${Math.round(topOverall.bestScore)}% best run.`
        : 'No scored model yet.',
    },
    {
      title: 'Ralph effect',
      body: `${ralphUseful}. Against single-shot baselines: ${pairText}.`,
    },
    {
      title: 'Hardest task',
      body: hardestTask
        ? `${hardestTask.label} is hardest by average score: ${Math.round(hardestTask.avgScore)}%, with ${hardestTask.avgFinalGaps.toFixed(1)} gaps left on average.`
        : 'No task difficulty data yet.',
    },
    {
      title: 'Compiler signal',
      body: topCompiler
        ? `${topCompiler.category} dominates compiler failures with ${topCompiler.count} counted errors. This is the first compiler-improvement bucket to inspect.`
        : 'No compiler errors captured.',
    },
    {
      title: '5m keep list',
      body: `Do not rerun the whole field. Keep: ${kept}. Cut the low-signal models until the task or prompt changes.`,
    },
  ];
  return cards.map((card) => `<div class="note"><strong>${escapeHtml(card.title)}</strong><span>${escapeHtml(card.body)}</span></div>`).join('\n');
}

function frontierTable(points) {
  return `<table>
    <thead><tr><th>Model</th><th>Tier</th><th>Avg Score</th><th>Best</th><th>Cost / Run</th><th>Frontier</th></tr></thead>
    <tbody>
      ${points.map((point) => `<tr>
        <td>${escapeHtml(point.label)}</td>
        <td><span class="pill ${point.tier === 'premium' ? 'warn' : ''}">${escapeHtml(point.tier)}</span></td>
        <td>${Math.round(point.avgScore)}%</td>
        <td>${Math.round(point.bestScore)}%</td>
        <td class="money">${money(point.costPerRun)}</td>
        <td>${point.frontier ? '<span class="pill">yes</span>' : '<span class="pill warn">no</span>'}</td>
      </tr>`).join('\n')}
    </tbody>
  </table>`;
}

function chatModelTable(rows) {
  if (!rows.length) return '<p><span class="pill warn">No chat responses captured.</span></p>';
  return `<table>
    <thead><tr><th>Model</th><th>Responses</th><th>Avg Chars</th><th>Clear Source Rate</th><th>Compiler Mentions</th><th>Pattern Mentions</th><th>Tool Calls</th></tr></thead>
    <tbody>
      ${rows.map((row) => `<tr>
        <td>${escapeHtml(row.label)}</td>
        <td>${row.responses}</td>
        <td>${Math.round(row.avgChars)}</td>
        <td>${percent(row.clearSourceRate)}</td>
        <td>${row.compilerMentions}</td>
        <td>${row.patternMentions}</td>
        <td>${row.toolCalls}</td>
      </tr>`).join('\n')}
    </tbody>
  </table>`;
}

function countTable(rows, noun, key) {
  if (!rows.length) return '<p><span class="pill warn">No rows captured.</span></p>';
  return `<table>
    <thead><tr><th>${escapeHtml(noun)}</th><th>Count</th></tr></thead>
    <tbody>
      ${rows.map((row) => `<tr><td>${escapeHtml(row[key])}</td><td>${row.count}</td></tr>`).join('\n')}
    </tbody>
  </table>`;
}

function contenderTable(rows) {
  if (!rows.length) return '<p><span class="pill warn">No models in this bucket.</span></p>';
  return `<table>
    <thead><tr><th>Model</th><th>Avg</th><th>Best</th><th>Cost / Run</th><th>Reason</th></tr></thead>
    <tbody>
      ${rows.map((row) => `<tr>
        <td>${escapeHtml(row.label)}</td>
        <td>${Math.round(row.avgScore)}%</td>
        <td>${Math.round(row.bestScore)}%</td>
        <td class="money">${money(row.costPerRun)}</td>
        <td>${escapeHtml(row.reason)}</td>
      </tr>`).join('\n')}
    </tbody>
  </table>`;
}

function taskDifficultyTable(rows) {
  if (!rows.length) return '<p><span class="pill warn">No task runs captured.</span></p>';
  return `<table>
    <thead><tr><th>Hardness Rank</th><th>Task</th><th>Pass</th><th>Avg Score</th><th>Best</th><th>Avg Gaps Left</th><th>Timeouts</th><th>Cost / Gap</th></tr></thead>
    <tbody>
      ${rows.map((row, index) => `<tr>
        <td>${index + 1}</td>
        <td>${escapeHtml(row.label)}</td>
        <td>${row.successes}/${row.runs} (${percent(row.passRate)})</td>
        <td>${Math.round(row.avgScore)}%</td>
        <td>${Math.round(row.bestScore)}%</td>
        <td>${row.avgFinalGaps.toFixed(1)}</td>
        <td>${row.timeouts}</td>
        <td class="money">${row.costPerGapClosed == null ? 'n/a' : money(row.costPerGapClosed)}</td>
      </tr>`).join('\n')}
    </tbody>
  </table>`;
}

function shortModelLabel(label) {
  return String(label || '')
    .replace(/^Claude\s+/i, '')
    .replace(/\s+Preview$/i, '')
    .replace(/\s+4\.[67]$/i, '')
    .replace(/\s+2\.6\s+1T/i, '')
    .slice(0, 22);
}

function signedNumber(value) {
  const rounded = Math.round(Number(value || 0));
  return rounded > 0 ? `+${rounded}` : String(rounded);
}

function summarizeCreditSnapshots(snapshots) {
  const start = snapshots.find((item) => item.label === 'start' && item.ok);
  const end = [...snapshots].reverse().find((item) => item.label === 'end' && item.ok);
  const startUsage = start?.totalUsage ?? null;
  const endUsage = end?.totalUsage ?? null;
  return {
    startUsage,
    endUsage,
    usageDelta: startUsage != null && endUsage != null ? Math.max(0, endUsage - startUsage) : null,
  };
}

function costSnapshotTable(snapshots) {
  if (!snapshots.length) return '<p><span class="pill warn">No credit snapshots captured.</span></p>';
  return `<table>
    <thead><tr><th>Label</th><th>Captured</th><th>Total Credits</th><th>Total Usage</th><th>Status</th></tr></thead>
    <tbody>
      ${snapshots.map((row) => `<tr>
        <td>${escapeHtml(row.label)}</td>
        <td>${escapeHtml(row.capturedAt)}</td>
        <td class="money">${row.totalCredits == null ? 'n/a' : money(row.totalCredits)}</td>
        <td class="money">${row.totalUsage == null ? 'n/a' : money(row.totalUsage)}</td>
        <td>${row.ok ? '<span class="pill">ok</span>' : `<span class="pill bad">${escapeHtml(row.error || 'failed')}</span>`}</td>
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
      toolCalls = readToolCallCountsForPaths(args.db, toolCallOutputPaths(payload, outputPath));
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

function toolCallOutputPaths(payload, fallbackPath) {
  const artifacts = Array.isArray(payload.sourceArtifacts) ? payload.sourceArtifacts : [];
  const paths = artifacts
    .map((artifact) => {
      if (typeof artifact === 'string') return artifact;
      return artifact?.outputPath || artifact?.path || artifact?.input;
    })
    .filter(Boolean);
  return paths.length ? paths : [fallbackPath];
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((error) => {
    console.error(error.stack || error.message || error);
    process.exit(1);
  });
}

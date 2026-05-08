#!/usr/bin/env node
import { spawn } from 'child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const repoRoot = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const nodeBin = process.execPath;
const DEFAULT_PORT = '3488';
const DEFAULT_MODEL = 'google/gemini-3-flash-preview';
const CHAT_TIMEOUT_MS = Number(process.env.MEPH_REQUIREMENTS_SMOKE_TIMEOUT_MS || 600_000);
const COST_LEDGER_PATH = join(repoRoot, 'studio', 'sessions', 'openrouter-cost-ledger.jsonl');

export const APPROVAL_QUEUE_PROMPT = 'Build me a deal approval app for a sales team.';

const BUILD_INSTRUCTION = [
  'Live smoke instruction: after requirements are approved, build the app in the Clear editor.',
  'Call edit_code with the complete .clear source before your final answer.',
  'Use the approved requirements and retrieved patterns.',
  'Do not answer with only an explanation.',
].join('\n');

export function resolveSmokeModel(env = process.env) {
  return env.MEPH_REQUIREMENTS_SMOKE_MODEL || env.MEPH_PATTERN_PROBE_MODEL || env.OPENROUTER_MODEL || DEFAULT_MODEL;
}

export function resolveSmokePort(env = process.env) {
  return String(env.MEPH_REQUIREMENTS_SMOKE_PORT || DEFAULT_PORT);
}

export function buildRequirementsChatBody({ prompt = APPROVAL_QUEUE_PROMPT } = {}) {
  return {
    messages: [{ role: 'user', content: `${prompt}\n\n${BUILD_INSTRUCTION}` }],
    apiKey: '',
    personality: '',
    editorContent: '',
    errors: [],
    webTools: false,
    patternPreflight: 'full',
    requirementsMode: 'auto',
  };
}

export function buildApprovedChatBody({
  prompt = APPROVAL_QUEUE_PROMPT,
  assistantText = '',
  requirements = [],
  requirementsId,
} = {}) {
  return {
    messages: [
      { role: 'user', content: `${prompt}\n\n${BUILD_INSTRUCTION}` },
      { role: 'assistant', content: assistantText || `requirements:\n${requirements.map(item => `  ${item}`).join('\n')}` },
      { role: 'user', content: 'Approved. Build the app now from the approved requirements.' },
    ],
    apiKey: '',
    personality: '',
    editorContent: '',
    errors: [],
    webTools: false,
    patternPreflight: 'full',
    requirementsMode: 'auto',
    approvedRequirements: requirements,
    approvedRequirementsId: requirementsId,
  };
}

export function summarizeSmoke({
  model,
  requirementsRun,
  buildRun,
  compileResult,
} = {}) {
  const review = requirementsRun?.requirementsReview || {};
  const audit = buildRun?.requirementsAudit || null;
  const items = Array.isArray(audit?.items) ? audit.items : [];
  const usage = summarizeModelUsage([
    ...(requirementsRun?.modelUsageEvents || []),
    ...(buildRun?.modelUsageEvents || []),
  ]);
  return {
    model,
    requirementsCount: Array.isArray(review.requirements) ? review.requirements.length : 0,
    requirementsId: review.requirementsId || null,
    firstTurnPatterns: requirementsRun?.patternPreflight?.pattern_count || 0,
    buildTurnPatterns: buildRun?.patternPreflight?.pattern_count || 0,
    firstTurnTools: requirementsRun?.toolNames || [],
    buildTurnTools: buildRun?.toolNames || [],
    sourceChars: String(buildRun?.source || '').length,
    compileErrors: Array.isArray(compileResult?.errors) ? compileResult.errors.length : null,
    compileWarnings: Array.isArray(compileResult?.warnings) ? compileResult.warnings.length : null,
    modelInputTokens: usage.inputTokens,
    modelOutputTokens: usage.outputTokens,
    openRouterCostCredits: usage.openRouterCostCredits,
    openRouterGenerationIds: usage.openRouterGenerationIds,
    costAccountingReady: usage.eventCount > 0,
    ralphRan: !!audit,
    ralphSummary: audit?.summary || '',
    ralphPassed: items.filter(item => item.status === 'passed').length,
    ralphUnverified: items.filter(item => item.status === 'unverified').length,
    ralphFailed: items.filter(item => item.status === 'failed').length,
    ralphRetries: Array.isArray(buildRun?.requirementsRetryEvents) ? buildRun.requirementsRetryEvents.length : 0,
    ralphBlocked: !!buildRun?.requirementsBlocked,
    done: !!buildRun?.done,
  };
}

export function summarizeModelUsage(events = []) {
  const out = {
    inputTokens: 0,
    outputTokens: 0,
    openRouterCostCredits: 0,
    openRouterGenerationIds: [],
    eventCount: 0,
  };
  for (const event of events || []) {
    const usage = event?.usage || event || {};
    out.eventCount++;
    out.inputTokens += Number(usage.input_tokens ?? usage.prompt_tokens ?? 0) || 0;
    out.outputTokens += Number(usage.output_tokens ?? usage.completion_tokens ?? 0) || 0;
    out.openRouterCostCredits += Number(usage.openrouter_cost ?? usage.cost ?? 0) || 0;
    const id = usage.openrouter_generation_id || usage.generation_id || null;
    if (id && !out.openRouterGenerationIds.includes(id)) out.openRouterGenerationIds.push(id);
  }
  out.openRouterCostCredits = Number(out.openRouterCostCredits.toFixed(6));
  return out;
}

export function formatCostDollars(value = 0) {
  return `$${(Number(value) || 0).toFixed(2)}`;
}

export function formatCostReport({ currentCostCredits = 0, totalCostCredits = 0 } = {}) {
  return `Cost: current run ${formatCostDollars(currentCostCredits)}, total: ${formatCostDollars(totalCostCredits)}.`;
}

export function requireValidRequirementsReview(review) {
  if (!review || !Array.isArray(review.requirements) || review.requirements.length === 0) {
    throw new Error('First turn did not produce requirements_review');
  }
  if (review.valid !== true) {
    const errors = Array.isArray(review.errors) && review.errors.length > 0
      ? review.errors.join('; ')
      : 'no validation errors provided';
    throw new Error(`Requirements review was invalid. Not auto-approving. ${errors}`);
  }
  return review;
}

export function createUsageLedgerRecorder({ model = null, path = COST_LEDGER_PATH } = {}) {
  const seenGenerationIds = new Set();
  let currentCostCredits = 0;

  function record(event = {}) {
    const usage = event?.usage || event || {};
    const cost = Number(usage.openrouter_cost ?? usage.cost ?? 0) || 0;
    const generationId = usage.openrouter_generation_id || usage.generation_id || null;
    if (generationId && seenGenerationIds.has(generationId)) {
      return { recorded: false, duplicate: true, currentCostCredits, totalCostCredits: readCostLedgerTotal(path) };
    }
    if (generationId) seenGenerationIds.add(generationId);
    if (!cost && !generationId) {
      return { recorded: false, currentCostCredits, totalCostCredits: readCostLedgerTotal(path) };
    }

    currentCostCredits = Number((currentCostCredits + cost).toFixed(6));
    mkdirSync(dirname(path), { recursive: true });
    appendFileSync(path, JSON.stringify({
      at: new Date().toISOString(),
      source: 'usage_event',
      model,
      cost_credits: cost,
      input_tokens: Number(usage.input_tokens ?? usage.prompt_tokens ?? 0) || 0,
      output_tokens: Number(usage.output_tokens ?? usage.completion_tokens ?? 0) || 0,
      generation_id: generationId,
    }) + '\n');
    return { recorded: true, currentCostCredits, totalCostCredits: readCostLedgerTotal(path) };
  }

  function totals() {
    return { currentCostCredits, totalCostCredits: readCostLedgerTotal(path) };
  }

  return { record, totals };
}

function readCostLedgerTotal(path = COST_LEDGER_PATH) {
  if (!existsSync(path)) return 0;
  let total = 0;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const row = JSON.parse(line);
      total += Number(row.cost_credits || 0) || 0;
    } catch {}
  }
  return Number(total.toFixed(6));
}

function appendCostLedger(summary, path = COST_LEDGER_PATH) {
  const current = Number(summary?.openRouterCostCredits || 0) || 0;
  if (!summary?.costAccountingReady) {
    return { currentCostCredits: current, totalCostCredits: readCostLedgerTotal(path) };
  }
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, JSON.stringify({
    at: new Date().toISOString(),
    model: summary.model || null,
    cost_credits: current,
    input_tokens: summary.modelInputTokens || 0,
    output_tokens: summary.modelOutputTokens || 0,
    generation_ids: summary.openRouterGenerationIds || [],
  }) + '\n');
  return {
    currentCostCredits: current,
    totalCostCredits: Number((readCostLedgerTotal(path)).toFixed(6)),
  };
}

export function smokePassed(summary = {}) {
  return !!summary.done &&
    summary.compileErrors === 0 &&
    summary.costAccountingReady === true &&
    summary.ralphRan === true &&
    summary.ralphBlocked !== true &&
    Number(summary.ralphUnverified || 0) === 0 &&
    Number(summary.ralphFailed || 0) === 0;
}

export function formatAuditItem(item = {}) {
  const status = item.status || 'unknown';
  const text = item.text || item.requirement || 'Unnamed requirement';
  const reason = item.reason || item.summary || 'no reason';
  return `- ${status}: ${text} (${reason})`;
}

function loadEnvFile() {
  const envPath = join(repoRoot, '.env');
  if (!existsSync(envPath)) return {};
  const out = {};
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function buildServerEnv({ envFromFile, model, port }) {
  return {
    ...process.env,
    ...envFromFile,
    PORT: port,
    CLEAR_ALLOW_SEED: '1',
    CLEAR_CLOUD_ROOT_DOMAIN: 'buildclear.dev',
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY || envFromFile.OPENROUTER_API_KEY,
    OPENROUTER_MODEL: model,
    MEPH_MODEL: model,
    MEPH_BRAIN: 'openrouter',
    MEPH_RALPH_MAX_RETRIES: process.env.MEPH_RALPH_MAX_RETRIES || '1',
  };
}

async function waitForServer(base) {
  const start = Date.now();
  while (Date.now() - start < 20_000) {
    try {
      const res = await fetch(`${base}/api/config`, { signal: AbortSignal.timeout(500) });
      if (res.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error(`Studio did not start at ${base}`);
}

async function runChat(base, body, { onModelUsage } = {}) {
  const res = await fetch(`${base}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(CHAT_TIMEOUT_MS),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`/api/chat ${res.status}: ${text.slice(0, 500)}`);
  }

  const out = {
    text: '',
    source: '',
    events: [],
    toolNames: [],
    patternPreflight: null,
    requirementsReview: null,
    requirementsAudit: null,
    requirementsRetryEvents: [],
    requirementsBlocked: null,
    modelUsageEvents: [],
    done: false,
  };
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() || '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const raw = line.slice(6).trim();
      if (!raw || raw === '[DONE]') continue;
      let event;
      try { event = JSON.parse(raw); } catch { continue; }
      out.events.push(event);
      if (event.type === 'text') out.text += event.delta || '';
      if (event.type === 'tool_start' && event.name) out.toolNames.push(event.name);
      if (event.type === 'pattern_preflight') out.patternPreflight = event;
      if (event.type === 'requirements_review') out.requirementsReview = event;
      if (event.type === 'requirements_audit') out.requirementsAudit = event.audit || event;
      if (event.type === 'requirements_retry') out.requirementsRetryEvents.push(event);
      if (event.type === 'requirements_blocked') out.requirementsBlocked = event;
      if ((event.type === 'message_delta' || event.type === 'model_usage') && event.usage) {
        out.modelUsageEvents.push(event);
        if (typeof onModelUsage === 'function') onModelUsage(event);
      }
      if (event.type === 'code_update' && typeof event.code === 'string') out.source = event.code;
      if (event.type === 'done') {
        out.done = true;
        if (typeof event.source === 'string') out.source = event.source;
      }
      if (event.type === 'error') throw new Error(event.message || 'Studio emitted an error');
    }
  }
  return out;
}

async function compileSource(base, source) {
  const res = await fetch(`${base}/api/compile`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    return { errors: [{ message: `/api/compile ${res.status}: ${text.slice(0, 300)}` }], warnings: [] };
  }
  return res.json();
}

async function main() {
  const model = resolveSmokeModel();
  const port = resolveSmokePort();
  const base = `http://127.0.0.1:${port}`;
  const envFromFile = loadEnvFile();
  const openRouterKey = process.env.OPENROUTER_API_KEY || envFromFile.OPENROUTER_API_KEY;
  if (!openRouterKey) throw new Error('OPENROUTER_API_KEY missing from environment and .env');
  const usageLedger = createUsageLedgerRecorder({ model });

  const child = spawn(nodeBin, ['studio/server.js'], {
    cwd: repoRoot,
    env: buildServerEnv({ envFromFile, model, port }),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const serverLog = [];
  child.stdout.on('data', chunk => serverLog.push(chunk.toString()));
  child.stderr.on('data', chunk => serverLog.push(chunk.toString()));

  try {
    await waitForServer(base);
    console.log(`meph-requirements-live-smoke: server=${base} model=${model}`);

    const requirementsRun = await runChat(base, buildRequirementsChatBody(), { onModelUsage: usageLedger.record });
    const review = requireValidRequirementsReview(requirementsRun.requirementsReview);

    const buildRun = await runChat(base, buildApprovedChatBody({
      assistantText: requirementsRun.text,
      requirements: review.requirements,
      requirementsId: review.requirementsId,
    }), { onModelUsage: usageLedger.record });
    const compileResult = await compileSource(base, buildRun.source || '');
    const summary = summarizeSmoke({ model, requirementsRun, buildRun, compileResult });
    const costTotals = usageLedger.totals().currentCostCredits > 0
      ? usageLedger.totals()
      : appendCostLedger(summary);
    summary.openRouterSessionTotalCredits = costTotals.totalCostCredits;
    summary.costReport = formatCostReport(costTotals);

    console.log(JSON.stringify(summary, null, 2));
    console.log(`\n${summary.costReport}`);
    if (review.requirements?.length) {
      console.log('\nAPPROVED REQUIREMENTS');
      for (const item of review.requirements) console.log(`- ${item}`);
    }
    if (buildRun.requirementsAudit?.items?.length) {
      console.log('\nRALPH ITEMS');
      for (const item of buildRun.requirementsAudit.items) {
        console.log(formatAuditItem(item));
      }
    }
    if (compileResult.errors?.length) {
      console.log('\nCOMPILE ERRORS');
      for (const err of compileResult.errors.slice(0, 5)) console.log(`- ${err.message || String(err)}`);
    }
    if (!smokePassed(summary)) {
      process.exitCode = 1;
    }
  } finally {
    child.kill('SIGTERM');
    await new Promise(resolve => child.once('exit', resolve));
    const interestingLog = serverLog.join('').split(/\r?\n/)
      .filter(line => /\[FACTOR_DB\]|\[chat\]|\[meph\]|\[hints\]|\[ralph-layer\]|Clear Playground|openrouter/i.test(line))
      .slice(-80);
    if (interestingLog.length > 0) {
      console.log('\nSERVER SIGNAL');
      for (const line of interestingLog) console.log(line);
    }
  }
}

const entryPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (entryPath === fileURLToPath(import.meta.url)) {
  main().catch(err => {
    console.error(err?.stack || err?.message || String(err));
    process.exit(1);
  });
}

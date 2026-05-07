#!/usr/bin/env node
import { spawn } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';

const repoRoot = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const nodeBin = process.execPath;
const port = process.env.PORT || '3462';
const base = `http://127.0.0.1:${port}`;
const CHEAP_DEFAULT_OPENROUTER_MODEL = 'deepseek/deepseek-v4-flash';
export function resolveProbeModel(env = process.env) {
  return env.MEPH_PATTERN_PROBE_MODEL || env.OPENROUTER_MODEL || CHEAP_DEFAULT_OPENROUTER_MODEL;
}
export function isExpensiveProbeModel(modelName) {
  return /\banthropic\/claude-(?:sonnet|opus)\b|claude-sonnet|claude-opus/i.test(String(modelName || ''));
}
const model = resolveProbeModel();
const chatTimeoutMs = Number(process.env.MEPH_PATTERN_PROBE_TIMEOUT_MS || 600_000);
const TRIAL_BUILD_INSTRUCTION = [
  'Trial instruction: build the app in the Clear editor.',
  'Call edit_code with the complete .clear source before your final answer.',
  'Use the provided context in this request before reaching for more files.',
  'Do not answer with only an explanation.',
].join('\n');

const baselineApprovalQueueProbes = [
  {
    id: 'approval-routing-shape',
    prompt: 'What is the Clear shape for modifying an approval queue so requests route to different approvers by deal size? Answer with the smallest relevant snippet shape.',
    expectKinds: ['queue', 'routing', 'policy', 'rule'],
    expectTerms: ['route', 'approval'],
  },
  {
    id: 'approval-row-actions',
    prompt: 'What is the Clear shape for adding approve and reject actions to each row in an approval queue?',
    expectKinds: ['row_action', 'button_action', 'endpoint'],
    expectTerms: ['approve', 'reject'],
  },
  {
    id: 'queue-auth-guard',
    prompt: 'What is the Clear shape for requiring login before someone can see approval queue items?',
    expectKinds: ['auth_guard', 'endpoint', 'page'],
    expectTerms: ['requires login'],
  },
  {
    id: 'approval-double-processing',
    prompt: 'What is the Clear shape for avoiding double-processing when two people approve the same request at the same time?',
    expectKinds: ['concurrency', 'validation', 'rule', 'endpoint', 'policy'],
    expectTerms: ['optimistic', 'safe to retry', 'status'],
  },
  {
    id: 'selected-row-detail',
    prompt: 'What is the Clear shape for showing the details of the selected row in an approval queue?',
    expectKinds: ['detail_panel', 'display_table', 'page'],
    expectTerms: ['detail', 'selected'],
  },
];

const narrowApprovalQueueProbes = [
  {
    id: 'threshold-routing-change',
    prompt: 'In an approval queue, requests under 50000 should go to a manager and requests 50000 or above should go to a VP. What Clear feature shape changes that routing?',
    expectKinds: ['routing', 'queue', 'policy', 'rule'],
    expectTerms: ['route', 'manager', 'vp'],
  },
  {
    id: 'only-my-pending-items',
    prompt: 'In an approval queue, the current approver should only see pending requests assigned to them. What Clear shape filters those rows?',
    expectKinds: ['queue', 'display_table', 'page', 'auth_guard'],
    expectTerms: ['current user', 'pending', 'approver'],
  },
  {
    id: 'row-approve-reject-endpoints',
    prompt: 'In an approval queue table, each row needs approve and reject buttons that call the backend for that request. What feature shape should I copy?',
    expectKinds: ['row_action', 'button_action', 'endpoint'],
    expectTerms: ['approve', 'reject'],
  },
  {
    id: 'stale-approval-submit',
    prompt: 'In an approval queue, if two approvers open the same pending request and both click approve, what Clear shape stops the second submit from changing it twice?',
    expectKinds: ['concurrency', 'validation', 'rule', 'endpoint'],
    expectTerms: ['optimistic', 'pending', 'status'],
  },
  {
    id: 'legal-review-escalation',
    prompt: 'Some approval requests need legal review before final approval when the contract flag is true. What Clear shape adds that branch?',
    expectKinds: ['routing', 'rule', 'policy', 'queue'],
    expectTerms: ['legal', 'review', 'contract'],
  },
  {
    id: 'selected-request-detail-panel',
    prompt: 'In an approval queue, clicking a row should show that request amount, owner, and notes beside the table. What Clear shape handles that selected-row detail?',
    expectKinds: ['detail_panel', 'display_table', 'page'],
    expectTerms: ['selected', 'detail'],
  },
  {
    id: 'approval-manager-gate',
    prompt: 'Only approval managers should load the approval queue screen. What Clear shape guards that page?',
    expectKinds: ['auth_guard', 'page', 'endpoint', 'rule'],
    expectTerms: ['requires login', 'manager', 'approval'],
  },
];

const approvalQueueFullAppProbes = [
  {
    id: 'threshold-routing-app',
    prompt: 'Build a complete Clear app for an approval queue where requests under 50000 go to a manager and requests 50000 or above go to a VP. Include the queue screen, request data, routing behavior, and approve/reject actions.',
    requiredSourceTerms: ['approval', '50000', 'manager', 'vp', 'approve', 'reject'],
    optionalSourceTerms: ['route', 'display', 'table', 'endpoint'],
  },
  {
    id: 'my-pending-queue-app',
    prompt: 'Build a complete Clear app for an approval queue where the current approver only sees pending requests assigned to them. Include login protection, pending filtering, and row actions.',
    requiredSourceTerms: ['approval', 'pending', 'approver', 'requires login', 'approve', 'reject'],
    optionalSourceTerms: ['current user', 'display', 'table', 'endpoint'],
  },
  {
    id: 'row-actions-app',
    prompt: 'Build a complete Clear app for an approval queue table where each row has approve and reject actions that update that request through the backend. Include seed request data and a visible queue screen.',
    requiredSourceTerms: ['approval', 'approve', 'reject', 'request', 'table', 'endpoint'],
    optionalSourceTerms: ['with actions', 'status', 'pending'],
  },
  {
    id: 'stale-submit-app',
    prompt: 'Build a complete Clear app for an approval queue that prevents double-processing when two approvers click approve on the same pending request. Include the concurrency protection in the backend update path.',
    requiredSourceTerms: ['approval', 'pending', 'approve', 'status', 'with optimistic lock'],
    optionalSourceTerms: ['409', 'reject', 'request'],
  },
  {
    id: 'legal-review-app',
    prompt: 'Build a complete Clear app for an approval queue where requests with a contract flag go to legal review before final approval. Include routing, queue visibility, and approve/reject actions.',
    requiredSourceTerms: ['approval', 'contract', 'legal', 'review', 'approve', 'reject'],
    optionalSourceTerms: ['route', 'pending', 'table'],
  },
  {
    id: 'selected-detail-app',
    prompt: 'Build a complete Clear app for an approval queue where clicking a row shows that request amount, owner, and notes beside the table. Include approve/reject actions for the selected request.',
    requiredSourceTerms: ['approval', 'selected', 'amount', 'owner', 'notes', 'approve', 'reject'],
    optionalSourceTerms: ['detail', 'table', 'request'],
  },
  {
    id: 'manager-gated-app',
    prompt: 'Build a complete Clear app for an approval queue where only approval managers can load the queue screen. Include login protection, manager-only access, and approve/reject actions.',
    requiredSourceTerms: ['approval', 'manager', 'requires login', 'approve', 'reject'],
    optionalSourceTerms: ['role', 'guard', 'page'],
  },
];

export const probeSuites = {
  baselineApprovalQueue: baselineApprovalQueueProbes,
  narrowApprovalQueue: narrowApprovalQueueProbes,
  approvalQueueFullApps: approvalQueueFullAppProbes,
};

export function selectProbes({ suiteName = 'approvalQueueFullApps', only = '' } = {}) {
  const suite = probeSuites[suiteName];
  if (!suite) {
    throw new Error(`Unknown probe suite "${suiteName}". Choose one of: ${Object.keys(probeSuites).join(', ')}`);
  }
  const onlyIds = new Set(
    String(only || '')
    .split(',')
    .map(id => id.trim())
    .filter(Boolean)
  );
  return onlyIds.size
    ? suite.filter(probe => onlyIds.has(probe.id))
    : suite;
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

async function waitForServer() {
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

export function buildChatBody(prompt, {
  patternPreflight = true,
  disablePatternSearchPromptGuard = false,
  disablePatternSearchTool = false,
} = {}) {
  const content = `${prompt}\n\n${TRIAL_BUILD_INSTRUCTION}`;
  return {
    messages: [{ role: 'user', content }],
    apiKey: '',
    personality: '',
    editorContent: '',
    errors: [],
    webTools: false,
    patternPreflight,
    disablePatternSearchPromptGuard,
    disablePatternSearchTool,
  };
}

async function runChat(prompt, options = {}) {
  const body = buildChatBody(prompt, options);
  const res = await fetch(`${base}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(chatTimeoutMs),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`/api/chat ${res.status}: ${text.slice(0, 500)}`);
  }

  const events = [];
  const toolNames = [];
  let preflight = null;
  let source = '';
  let text = '';
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
      events.push(event);
      if (event.type === 'text') text += event.delta || '';
      if (event.type === 'tool_start' && event.name) toolNames.push(event.name);
      if (event.type === 'pattern_preflight') preflight = event;
      if (event.type === 'code_update' && typeof event.code === 'string') source = event.code;
      if (event.type === 'done' && typeof event.source === 'string') source = event.source;
      if (event.type === 'error') throw new Error(event.message || 'Studio emitted an error');
    }
  }
  return { text, toolNames, preflight, source, events };
}

export function scoreProbe(probe, result) {
  const lower = result.text.toLowerCase();
  const usedToolSearch = result.toolNames.includes('browse_templates');
  const usedPreflightSearch = !!result.preflight?.required && Number(result.preflight?.pattern_count || 0) > 0;
  const usedSearch = usedToolSearch || usedPreflightSearch;
  const mentionedPrimitive =
    /primitive|snippet|pattern db|browse_templates|canonical_primitive/i.test(result.text);
  const foundExpectedKind = probe.expectKinds.some(kind =>
    lower.includes(kind.replace(/_/g, ' ')) || lower.includes(kind)
  );
  const foundExpectedTerm = probe.expectTerms.some(term => lower.includes(term.toLowerCase()));
  return {
    usedSearch,
    usedToolSearch,
    usedPreflightSearch,
    mentionedPrimitive,
    foundExpectedKind,
    foundExpectedTerm,
    pass: usedSearch && foundExpectedKind && foundExpectedTerm,
  };
}

async function compileSource(source) {
  if (!String(source || '').trim()) {
    return { errors: [{ message: 'No source produced' }], warnings: [] };
  }
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

export function scoreGeneratedApp(probe, result) {
  const source = String(result.source || '');
  const lower = source.toLowerCase();
  const compileErrors = Array.isArray(result.compile?.errors) ? result.compile.errors : [];
  const requiredTerms = probe.requiredSourceTerms || [];
  const optionalTerms = probe.optionalSourceTerms || [];
  const missingRequired = requiredTerms.filter(term => !lower.includes(String(term).toLowerCase()));
  const optionalHits = optionalTerms.filter(term => lower.includes(String(term).toLowerCase()));
  const usedEditor = result.toolNames.includes('edit_code') || source.trim().length > 0;
  const compiles = compileErrors.length === 0;
  return {
    usedEditor,
    compiles,
    missingRequired,
    optionalHits,
    pass: usedEditor && compiles && missingRequired.length === 0,
  };
}

export function isProviderQuotaError(message) {
  return /key limit exceeded|insufficient credits|quota exceeded|credit limit|billing limit/i.test(String(message || ''));
}

export function summarizeRows(rows, { abMode = false } = {}) {
  const blockedRows = rows.filter(row => row.result?.blocked);
  const completedRows = rows.filter(row => !row.result?.blocked);
  const passed = completedRows.filter(row => row.score.pass).length;
  const summary = {
    rows,
    completedRows,
    blockedRows,
    passed,
    total: completedRows.length,
    aborted: blockedRows.length > 0,
    ab: null,
  };
  if (abMode) {
    const byVariant = {};
    for (const label of ['docs_only', 'full_hook']) {
      const variantRows = completedRows.filter(row => row.variant === label);
      byVariant[label] = {
        passed: variantRows.filter(row => row.score.pass).length,
        total: variantRows.length,
      };
    }
    byVariant.delta = byVariant.full_hook.passed - byVariant.docs_only.passed;
    summary.ab = byVariant;
  }
  return summary;
}

async function main() {
  const selectedProbes = selectProbes({
    suiteName: process.env.MEPH_PATTERN_PROBE_SUITE || 'approvalQueueFullApps',
    only: process.env.MEPH_PATTERN_PROBE_ONLY || '',
  });
  const envFromFile = loadEnvFile();
  const openRouterKey = process.env.OPENROUTER_API_KEY || envFromFile.OPENROUTER_API_KEY;
  if (!openRouterKey) {
    throw new Error('OPENROUTER_API_KEY missing from environment and .env');
  }
  if (isExpensiveProbeModel(model) && process.env.MEPH_PATTERN_PROBE_ALLOW_EXPENSIVE !== '1') {
    throw new Error(`Refusing expensive probe model "${model}". Set MEPH_PATTERN_PROBE_MODEL=${CHEAP_DEFAULT_OPENROUTER_MODEL} or MEPH_PATTERN_PROBE_ALLOW_EXPENSIVE=1.`);
  }

  const child = spawn(nodeBin, ['studio/server.js'], {
    cwd: repoRoot,
    env: {
      ...process.env,
      ...envFromFile,
      OPENROUTER_API_KEY: openRouterKey,
      OPENROUTER_MODEL: model,
      MEPH_BRAIN: 'openrouter',
      PORT: port,
      CLEAR_ALLOW_SEED: '1',
      CLEAR_CLOUD_ROOT_DOMAIN: 'buildclear.dev',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const serverLog = [];
  child.stdout.on('data', chunk => serverLog.push(chunk.toString()));
  child.stderr.on('data', chunk => serverLog.push(chunk.toString()));

  try {
    await waitForServer();
    console.log(`meph-pattern-live-probe: server=${base} model=${model}`);
    const rows = [];
    const abMode = process.env.MEPH_PATTERN_PROBE_AB === '1';
    const variants = abMode
      ? [
        { label: 'docs_only', options: { patternPreflight: 'docs', disablePatternSearchPromptGuard: true, disablePatternSearchTool: true } },
        { label: 'full_hook', options: { patternPreflight: 'full', disablePatternSearchPromptGuard: true, disablePatternSearchTool: false } },
      ]
      : [{ label: 'default', options: { patternPreflight: 'full', disablePatternSearchPromptGuard: false, disablePatternSearchTool: false } }];

    for (const probe of selectedProbes) {
      let abortProbe = false;
      for (const variant of variants) {
        if (abortProbe) break;
        console.log(`\n=== ${probe.id} :: ${variant.label} ===`);
        let result;
        let score;
        try {
          result = await runChat(probe.prompt, variant.options);
          if (probe.requiredSourceTerms) {
            result.compile = await compileSource(result.source);
          }
          score = probe.requiredSourceTerms
            ? scoreGeneratedApp(probe, result)
            : scoreProbe(probe, result);
        } catch (err) {
          const message = err?.message || String(err);
          const blocked = isProviderQuotaError(message);
          result = {
            text: '',
            toolNames: [],
            preflight: null,
            source: '',
            error: message,
            blocked,
            compile: { errors: [{ message }] },
          };
          score = probe.requiredSourceTerms
            ? scoreGeneratedApp(probe, result)
            : { pass: false, usedSearch: false, usedToolSearch: false, usedPreflightSearch: false, foundExpectedKind: false, foundExpectedTerm: false };
          if (blocked) abortProbe = true;
        }
        rows.push({ probe, variant: variant.label, result, score });
        console.log(`tools: ${result.toolNames.join(', ') || '(none)'}`);
        if (result.error) console.log(`error: ${result.error}`);
        console.log(`preflight: mode=${result.preflight?.mode || 'unknown'} required=${result.preflight?.required ? 'yes' : 'no'} patterns=${result.preflight?.pattern_count ?? 0}`);
        if (probe.requiredSourceTerms) {
          console.log(`pass: ${score.pass ? 'yes' : 'no'} edited=${score.usedEditor ? 'yes' : 'no'} compiles=${score.compiles ? 'yes' : 'no'} missing=${score.missingRequired.join('|') || 'none'} optional=${score.optionalHits.join('|') || 'none'}`);
        } else {
          console.log(`pass: ${score.pass ? 'yes' : 'no'} search=${score.usedSearch ? 'yes' : 'no'} tool=${score.usedToolSearch ? 'yes' : 'no'} preflight=${score.usedPreflightSearch ? 'yes' : 'no'} kind=${score.foundExpectedKind ? 'yes' : 'no'} term=${score.foundExpectedTerm ? 'yes' : 'no'}`);
        }
        console.log(result.text.replace(/\s+/g, ' ').slice(0, 700));
        if (result.source) console.log(result.source.replace(/\s+/g, ' ').slice(0, 700));
      }
      if (abortProbe) break;
    }

    const summary = summarizeRows(rows, { abMode });
    console.log(`\nSUMMARY ${summary.passed}/${summary.total} completed trials passed`);
    if (summary.blockedRows.length) {
      console.log(`ABORTED provider quota blocked ${summary.blockedRows.length} trial(s): ${summary.blockedRows[0].result.error}`);
    }
    for (const row of rows) {
      const detail = row.probe.requiredSourceTerms
        ? `compiles=${row.score.compiles ? 'yes' : 'no'} missing=${row.score.missingRequired.join('|') || 'none'}`
        : `tools=${row.result.toolNames.join('|') || 'none'} preflight=${row.score.usedPreflightSearch ? 'yes' : 'no'}`;
      const label = row.result.blocked ? 'BLOCKED' : (row.score.pass ? 'PASS' : 'FAIL');
      console.log(`- ${row.probe.id} ${row.variant}: ${label} ${detail}`);
    }
    if (summary.ab) {
      console.log(`\nAB SUMMARY docs_only=${summary.ab.docs_only.passed}/${summary.ab.docs_only.total} full_hook=${summary.ab.full_hook.passed}/${summary.ab.full_hook.total} delta=${summary.ab.delta}`);
    }
    if (summary.aborted) process.exitCode = 2;
    else if (summary.passed !== summary.total) process.exitCode = 1;
  } finally {
    child.kill('SIGTERM');
    await new Promise(resolve => child.once('exit', resolve));
    const interestingLog = serverLog.join('').split(/\r?\n/)
      .filter(line => /\[FACTOR_DB\]|\[chat\]|\[meph\]|\[hints\]|Clear Playground/.test(line))
      .slice(-80);
    if (interestingLog.length > 0) {
      console.log('\nSERVER SIGNAL');
      for (const line of interestingLog) console.log(line);
    }
  }
}

const thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === thisFile) {
  main().catch(err => {
    console.error(`meph-pattern-live-probe failed: ${err.message}`);
    process.exit(1);
  });
}

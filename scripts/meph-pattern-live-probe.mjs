#!/usr/bin/env node
import { spawn } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';

const repoRoot = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const nodeBin = process.execPath;
const port = process.env.PORT || '3462';
const base = `http://127.0.0.1:${port}`;
const model = process.env.MEPH_PATTERN_PROBE_MODEL || process.env.OPENROUTER_MODEL || '~anthropic/claude-sonnet-latest';

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

export const probeSuites = {
  baselineApprovalQueue: baselineApprovalQueueProbes,
  narrowApprovalQueue: narrowApprovalQueueProbes,
};

export function selectProbes({ suiteName = 'narrowApprovalQueue', only = '' } = {}) {
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
} = {}) {
  return {
    messages: [{ role: 'user', content: prompt }],
    apiKey: '',
    personality: '',
    editorContent: '',
    errors: [],
    webTools: false,
    patternPreflight,
    disablePatternSearchPromptGuard,
  };
}

async function runChat(prompt, options = {}) {
  const body = buildChatBody(prompt, options);
  const res = await fetch(`${base}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(240_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`/api/chat ${res.status}: ${text.slice(0, 500)}`);
  }

  const events = [];
  const toolNames = [];
  let preflight = null;
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
      if (event.type === 'error') throw new Error(event.message || 'Studio emitted an error');
    }
  }
  return { text, toolNames, preflight, events };
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

async function main() {
  const selectedProbes = selectProbes({
    suiteName: process.env.MEPH_PATTERN_PROBE_SUITE || 'narrowApprovalQueue',
    only: process.env.MEPH_PATTERN_PROBE_ONLY || '',
  });
  const envFromFile = loadEnvFile();
  const openRouterKey = process.env.OPENROUTER_API_KEY || envFromFile.OPENROUTER_API_KEY;
  if (!openRouterKey) {
    throw new Error('OPENROUTER_API_KEY missing from environment and .env');
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
        { label: 'hook_off', options: { patternPreflight: false, disablePatternSearchPromptGuard: true } },
        { label: 'hook_on', options: { patternPreflight: true, disablePatternSearchPromptGuard: true } },
      ]
      : [{ label: 'default', options: { patternPreflight: true, disablePatternSearchPromptGuard: false } }];

    for (const probe of selectedProbes) {
      for (const variant of variants) {
        console.log(`\n=== ${probe.id} :: ${variant.label} ===`);
        const result = await runChat(probe.prompt, variant.options);
        const score = scoreProbe(probe, result);
        rows.push({ probe, variant: variant.label, result, score });
        console.log(`tools: ${result.toolNames.join(', ') || '(none)'}`);
        console.log(`preflight: required=${result.preflight?.required ? 'yes' : 'no'} patterns=${result.preflight?.pattern_count ?? 0}`);
        console.log(`pass: ${score.pass ? 'yes' : 'no'} search=${score.usedSearch ? 'yes' : 'no'} tool=${score.usedToolSearch ? 'yes' : 'no'} preflight=${score.usedPreflightSearch ? 'yes' : 'no'} kind=${score.foundExpectedKind ? 'yes' : 'no'} term=${score.foundExpectedTerm ? 'yes' : 'no'}`);
        console.log(result.text.replace(/\s+/g, ' ').slice(0, 700));
      }
    }

    const passed = rows.filter(row => row.score.pass).length;
    console.log(`\nSUMMARY ${passed}/${rows.length} passed`);
    for (const row of rows) {
      console.log(`- ${row.probe.id} ${row.variant}: ${row.score.pass ? 'PASS' : 'FAIL'} tools=${row.result.toolNames.join('|') || 'none'} preflight=${row.score.usedPreflightSearch ? 'yes' : 'no'}`);
    }
    if (abMode) {
      const offRows = rows.filter(row => row.variant === 'hook_off');
      const onRows = rows.filter(row => row.variant === 'hook_on');
      const offPassed = offRows.filter(row => row.score.pass).length;
      const onPassed = onRows.filter(row => row.score.pass).length;
      console.log(`\nAB SUMMARY hook_off=${offPassed}/${offRows.length} hook_on=${onPassed}/${onRows.length} delta=${onPassed - offPassed}`);
    }
    if (passed !== rows.length) process.exitCode = 1;
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

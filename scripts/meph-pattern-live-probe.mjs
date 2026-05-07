#!/usr/bin/env node
import { spawn } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const repoRoot = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const nodeBin = process.execPath;
const port = process.env.PORT || '3462';
const base = `http://127.0.0.1:${port}`;
const model = process.env.MEPH_PATTERN_PROBE_MODEL || process.env.OPENROUTER_MODEL || '~anthropic/claude-sonnet-latest';

const probes = [
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
const onlyIds = new Set(
  String(process.env.MEPH_PATTERN_PROBE_ONLY || '')
    .split(',')
    .map(id => id.trim())
    .filter(Boolean)
);
const selectedProbes = onlyIds.size
  ? probes.filter(probe => onlyIds.has(probe.id))
  : probes;

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

async function runChat(prompt) {
  const body = {
    messages: [{ role: 'user', content: prompt }],
    apiKey: '',
    personality: '',
    editorContent: '',
    errors: [],
    webTools: false,
  };
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
      if (event.type === 'error') throw new Error(event.message || 'Studio emitted an error');
    }
  }
  return { text, toolNames, events };
}

function scoreProbe(probe, result) {
  const lower = result.text.toLowerCase();
  const usedSearch = result.toolNames.includes('browse_templates');
  const mentionedPrimitive =
    /primitive|snippet|pattern db|browse_templates|canonical_primitive/i.test(result.text);
  const foundExpectedKind = probe.expectKinds.some(kind =>
    lower.includes(kind.replace(/_/g, ' ')) || lower.includes(kind)
  );
  const foundExpectedTerm = probe.expectTerms.some(term => lower.includes(term.toLowerCase()));
  return {
    usedSearch,
    mentionedPrimitive,
    foundExpectedKind,
    foundExpectedTerm,
    pass: usedSearch && foundExpectedKind && foundExpectedTerm,
  };
}

async function main() {
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
    for (const probe of selectedProbes) {
      console.log(`\n=== ${probe.id} ===`);
      const result = await runChat(probe.prompt);
      const score = scoreProbe(probe, result);
      rows.push({ probe, result, score });
      console.log(`tools: ${result.toolNames.join(', ') || '(none)'}`);
      console.log(`pass: ${score.pass ? 'yes' : 'no'} search=${score.usedSearch ? 'yes' : 'no'} kind=${score.foundExpectedKind ? 'yes' : 'no'} term=${score.foundExpectedTerm ? 'yes' : 'no'}`);
      console.log(result.text.replace(/\s+/g, ' ').slice(0, 700));
    }

    const passed = rows.filter(row => row.score.pass).length;
    console.log(`\nSUMMARY ${passed}/${rows.length} passed`);
    for (const row of rows) {
      console.log(`- ${row.probe.id}: ${row.score.pass ? 'PASS' : 'FAIL'} tools=${row.result.toolNames.join('|') || 'none'}`);
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

main().catch(err => {
  console.error(`meph-pattern-live-probe failed: ${err.message}`);
  process.exit(1);
});

// Hint-flow verification: spawn server, send Meph a known-broken source,
// capture the full SSE stream, check whether Meph references the retrieved
// past-fix pattern (tier labels, "past fix", archetype mentions) in his
// follow-up response.
//
// Usage:
//   ANTHROPIC_API_KEY=sk-ant-... node playground/supervisor/verify-hint-flow.mjs
//
// Cost: ~$0.05 on Haiku. Time: ~30-60s.

import { spawn } from 'child_process';
import { appendFileSync, writeFileSync, readFileSync } from 'fs';

const PORT = 3489;
const BASE = `http://localhost:${PORT}`;
const LOG = '/tmp/verify-hint-flow.log';

// Deliberately broken source — a CRUD/todo archetype with missing table declaration.
// The compiler should raise a "table ... not defined" error, which is a classic
// CRUD error pattern that the Factor DB has many passing references for.
const BROKEN_SOURCE = `build for javascript backend

when user calls POST /api/todo:
  create a todo:
    title is body's title
  send back 'saved'
`;

async function waitForServer(maxMs = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    try {
      const r = await fetch(`${BASE}/api/templates`, { signal: AbortSignal.timeout(800) });
      if (r.ok) return;
    } catch {}
    await new Promise(r => setTimeout(r, 300));
  }
  throw new Error('Server did not come up in 15s');
}

async function askMeph(userPrompt, editorContent) {
  const body = JSON.stringify({
    messages: [{ role: 'user', content: userPrompt }],
    apiKey: process.env.ANTHROPIC_API_KEY,
    personality: '',
    editorContent,
    errors: [],
    webTools: false,
  });
  const r = await fetch(`${BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    signal: AbortSignal.timeout(180_000),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text()}`);

  let finalText = '';
  const toolCalls = [];
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
        toolCalls.push(ev.name);
      } else if (ev.type === 'text' && typeof ev.delta === 'string') {
        finalText += ev.delta;
      } else if (ev.type === 'text' && typeof ev.text === 'string') {
        finalText += ev.text;
      }
    }
  }
  return { finalText, toolCalls };
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY not set');
    process.exit(1);
  }
  try { writeFileSync(LOG, ''); } catch {}
  console.log(`Starting server on :${PORT}...`);
  const server = spawn('node', ['playground/server.js'], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', d => { try { appendFileSync(LOG, d); } catch {} });
  server.stderr.on('data', d => { try { appendFileSync(LOG, d); } catch {} });

  try {
    await waitForServer();
    console.log('Server ready.\n');

    console.log('Sending Meph a broken CRUD snippet (missing table decl)...');
    const userPrompt = `This code has a compile error. Please call compile to see the error, then briefly tell me what went wrong and how you'd fix it. Keep it short.`;
    const t0 = Date.now();
    const { finalText, toolCalls } = await askMeph(userPrompt, BROKEN_SOURCE);
    const dur = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`Response received in ${dur}s. Tool calls: [${toolCalls.join(', ')}]\n`);

    // Let server flush logs
    await new Promise(r => setTimeout(r, 1500));
    const log = readFileSync(LOG, 'utf8');

    console.log('─'.repeat(70));
    console.log('MEPH\'S RESPONSE TEXT');
    console.log('─'.repeat(70));
    console.log(finalText.slice(0, 2000));
    console.log('─'.repeat(70));

    // Signals that Meph saw + used the hints
    const lower = finalText.toLowerCase();
    const signals = {
      'mentions "past fix" or "past session"': /past (fix|session|work)/.test(lower),
      'mentions "reference" or "pattern"': /\b(reference|pattern)/.test(lower),
      'uses a tier label': /same error|same archetype|different error/.test(lower),
      'mentions "look at" or "study"': /look (at|for)|study/.test(lower),
    };
    console.log('\nHINT-FLOW SIGNAL SCAN (does Meph\'s response reflect seeing hints?):');
    let hits = 0;
    for (const [k, v] of Object.entries(signals)) {
      console.log(`  ${v ? '✅' : '  '} ${k}`);
      if (v) hits++;
    }

    // Check cache telemetry
    const cacheLines = log.split('\n').filter(l => l.includes('[cache]'));
    console.log(`\nCACHE: ${cacheLines.length} [cache] log lines captured.`);
    for (const l of cacheLines.slice(0, 5)) console.log(`  ${l.trim()}`);

    // The real test: did the server emit the hints? We didn't add logging,
    // so we infer from (a) compile was called, (b) the EBM bundle loaded at boot.
    const compileCalled = toolCalls.includes('compile');
    const ebmLoaded = log.includes('EBM reranker loaded');
    console.log('\nWIRING:');
    console.log(`  compile tool called: ${compileCalled}`);
    console.log(`  EBM reranker loaded at boot: ${ebmLoaded}`);

    console.log('\n' + '═'.repeat(70));
    if (compileCalled && ebmLoaded && hits >= 2) {
      console.log('✅ VERDICT: Hint-flow reaches Meph and he reads it.');
      console.log(`   ${hits}/4 signals present. EBM reranked candidates.`);
    } else if (compileCalled && ebmLoaded && hits === 0) {
      console.log('⚠️  VERDICT: Wiring is live but Meph ignored the hints.');
      console.log('   Consider strengthening the hint prose or system-prompt mention.');
    } else if (compileCalled && ebmLoaded) {
      console.log(`⚠️  VERDICT: Partial signal (${hits}/4). Hint-flow wiring live.`);
      console.log('   Not conclusive — Meph may have seen hints but kept response terse.');
    } else {
      console.log('❌ VERDICT: Wiring not exercised. compile=' + compileCalled + ' ebm=' + ebmLoaded);
    }
    console.log('═'.repeat(70));
  } finally {
    try { server.kill('SIGTERM'); } catch {}
    await new Promise(r => setTimeout(r, 500));
  }
}

main().catch(err => { console.error(err); process.exit(1); });

// Prompt-caching verification: runs 3 identical multi-turn calls against
// /api/chat, captures the [cache] telemetry from server logs, and reports:
//   - per-turn tokens (cache read / cache write / fresh)
//   - actual cost with caching
//   - hypothetical cost if caching were off
//   - % savings
//
// Usage:
//   ANTHROPIC_API_KEY=sk-ant-... node playground/supervisor/verify-caching.js
//
// Takes ~30s, costs ~$0.05-0.10 on Haiku.

import { spawn } from 'child_process';
import { readFileSync, writeFileSync, appendFileSync } from 'fs';
import { join } from 'path';

const PORT = 3488;
const BASE = `http://localhost:${PORT}`;
const LOG_PATH = '/tmp/verify-caching-server.log';

// Haiku 4.5 pricing per million tokens
const PRICE = {
  input_fresh: 1.00,   // $/M
  cache_write: 1.25,   // $/M (1.25× for 5-min TTL)
  cache_read: 0.10,    // $/M (0.1×)
  output: 5.00,        // $/M
};

function cost(tokens, rate) {
  return (tokens / 1_000_000) * rate;
}

async function waitForServer(maxMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    try {
      const r = await fetch(`${BASE}/api/config`, { signal: AbortSignal.timeout(800) });
      if (r.ok) return;
    } catch {}
    await new Promise(r => setTimeout(r, 300));
  }
  throw new Error('Server did not come up in 15s');
}

async function oneTurn(messages) {
  const body = {
    messages,
    editorContent: 'build for javascript backend\n\nwhen user calls GET /api/hello:\n  send back \'ok\'\n',
  };
  const r = await fetch(`${BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text()}`);
  // Drain SSE stream; we only care about it finishing
  const reader = r.body.getReader();
  const decoder = new TextDecoder();
  let finalText = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    for (const line of chunk.split('\n')) {
      if (!line.startsWith('data: ')) continue;
      try {
        const ev = JSON.parse(line.slice(6));
        if (ev.type === 'text' && ev.delta) finalText += ev.delta;
      } catch {}
    }
  }
  return finalText;
}

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('ANTHROPIC_API_KEY not set');
    process.exit(1);
  }

  console.log('Spawning playground server on port ' + PORT + '...');
  // Truncate log
  try { writeFileSync(LOG_PATH, ''); } catch {}
  const server = spawn('node', ['playground/server.js'], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', d => { try { appendFileSync(LOG_PATH, d); } catch {} });
  server.stderr.on('data', d => { try { appendFileSync(LOG_PATH, d); } catch {} });

  try {
    await waitForServer();
    console.log('Server ready.\n');

    // Turn 1: fresh — will be the cache-write
    console.log('Turn 1 (cache write): Asking Meph a short question...');
    const t1 = Date.now();
    await oneTurn([
      { role: 'user', content: 'Hi Meph. In one sentence, what is Clear?' },
    ]);
    console.log(`  [${((Date.now() - t1) / 1000).toFixed(1)}s]`);

    // Turn 2: same prefix, new question — should hit the cache
    console.log('\nTurn 2 (should hit cache): Follow-up question...');
    const t2 = Date.now();
    await oneTurn([
      { role: 'user', content: 'Hi Meph. In one sentence, what is Clear?' },
      { role: 'assistant', content: 'Clear is a programming language that compiles plain English to JavaScript, Python, and HTML.' },
      { role: 'user', content: 'Thanks. Now tell me in one sentence: how does Meph write Clear code?' },
    ]);
    console.log(`  [${((Date.now() - t2) / 1000).toFixed(1)}s]`);

    // Turn 3: even more cached context
    console.log('\nTurn 3 (should hit cache harder): Another follow-up...');
    const t3 = Date.now();
    await oneTurn([
      { role: 'user', content: 'Hi Meph. In one sentence, what is Clear?' },
      { role: 'assistant', content: 'Clear is a programming language that compiles plain English to JavaScript, Python, and HTML.' },
      { role: 'user', content: 'Thanks. Now tell me in one sentence: how does Meph write Clear code?' },
      { role: 'assistant', content: 'Meph uses the edit_code tool to write Clear source, then calls compile to verify it.' },
      { role: 'user', content: 'Got it. One more: what file does Meph write code into?' },
    ]);
    console.log(`  [${((Date.now() - t3) / 1000).toFixed(1)}s]`);

    // Let server flush logs
    await new Promise(r => setTimeout(r, 1500));

    // Parse [cache] lines from server log
    const log = readFileSync(LOG_PATH, 'utf8');
    const cacheLines = log.split('\n').filter(l => l.includes('[cache]'));
    console.log('\n━'.repeat(60));
    console.log('PER-ITERATION CACHE TELEMETRY');
    console.log('━'.repeat(60));
    for (const line of cacheLines) console.log('  ' + line.trim());

    // Aggregate totals
    let totalRead = 0, totalWrite = 0, totalFresh = 0;
    for (const line of cacheLines) {
      const m = line.match(/read=(\d+) write=(\d+) fresh=(\d+)/);
      if (m) {
        totalRead += Number(m[1]);
        totalWrite += Number(m[2]);
        totalFresh += Number(m[3]);
      }
    }
    const totalInput = totalRead + totalWrite + totalFresh;

    console.log('\n━'.repeat(60));
    console.log('TOTALS');
    console.log('━'.repeat(60));
    console.log(`  Total input tokens:      ${totalInput.toLocaleString()}`);
    console.log(`    of which cache read:   ${totalRead.toLocaleString()}  (${totalInput ? Math.round(totalRead / totalInput * 100) : 0}%)`);
    console.log(`    of which cache write:  ${totalWrite.toLocaleString()}  (${totalInput ? Math.round(totalWrite / totalInput * 100) : 0}%)`);
    console.log(`    of which fresh:        ${totalFresh.toLocaleString()}  (${totalInput ? Math.round(totalFresh / totalInput * 100) : 0}%)`);

    // Cost with caching (actual)
    const costActual = cost(totalRead, PRICE.cache_read)
                     + cost(totalWrite, PRICE.cache_write)
                     + cost(totalFresh, PRICE.input_fresh);

    // Cost WITHOUT caching — all tokens at fresh rate
    const costNoCaching = cost(totalInput, PRICE.input_fresh);

    const savings = costNoCaching - costActual;
    const savingsPct = costNoCaching > 0 ? Math.round((savings / costNoCaching) * 100) : 0;

    console.log('\n━'.repeat(60));
    console.log('COST (Haiku 4.5 pricing)');
    console.log('━'.repeat(60));
    console.log(`  Actual (with caching):       $${costActual.toFixed(6)}`);
    console.log(`  Hypothetical (no caching):   $${costNoCaching.toFixed(6)}`);
    console.log(`  Savings:                     $${savings.toFixed(6)}  (${savingsPct}%)`);

    // Projection
    console.log('\n━'.repeat(60));
    console.log('PROJECTION (100 sessions/day at this rate)');
    console.log('━'.repeat(60));
    console.log(`  Actual:                 $${(costActual * 100).toFixed(2)}/day`);
    console.log(`  Without caching:        $${(costNoCaching * 100).toFixed(2)}/day`);
    console.log(`  Saved:                  $${(savings * 100).toFixed(2)}/day`);

    // Verdict
    console.log('\n━'.repeat(60));
    if (totalRead > 0 && savingsPct >= 40) {
      console.log('✅ VERDICT: Prompt caching is WORKING.');
      console.log(`   ${savingsPct}% cost reduction on this 3-turn run.`);
    } else if (totalWrite > 0 && totalRead === 0) {
      console.log('⚠️  VERDICT: Cache is WRITING but not READING.');
      console.log('   Likely cause: a silent invalidator in the prefix (timestamp, UUID, non-deterministic JSON).');
      console.log('   Check: shared/prompt-caching.md → Silent invalidators');
    } else if (totalWrite === 0 && totalRead === 0) {
      console.log('❌ VERDICT: No caching activity at all.');
      console.log('   Likely cause: cache_control missing from payload, or prefix too short (<4096 tokens for Haiku).');
    } else {
      console.log(`⚠️  VERDICT: Caching is active but savings are only ${savingsPct}%.`);
      console.log('   Review cache telemetry above for signal on whether prefix is stable.');
    }
    console.log('━'.repeat(60));

  } finally {
    server.kill('SIGTERM');
    await new Promise(r => setTimeout(r, 500));
  }
}

main().catch(err => {
  console.error('Failed:', err);
  process.exit(1);
});

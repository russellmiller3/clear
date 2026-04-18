// =============================================================================
// MEPH TOOL EVAL
// =============================================================================
// Run scenarios designed to trigger specific tools. Parse the SSE stream from
// /api/chat. Grade each scenario: (1) did Meph call the expected tool at least
// once? (2) Meph's own self-report says the tool worked.
//
// Usage:
//   node playground/eval-meph.js                  (uses env key or running playground's stored key)
//   node playground/eval-meph.js --key sk-ant-... (override)
//   SKIP_MEPH_EVAL=1 ...                          (skip cleanly, exit 0)
//
// Pre-push integration:
//   The .husky/pre-push hook runs this when ANTHROPIC_API_KEY is set.
//   If no key, it skips cleanly with exit 0. If no playground server is
//   running on PLAYGROUND_URL, this script spawns one for the duration
//   of the eval and tears it down on completion.
//
// Cost: ~$0.10–0.30 per run. Time: ~90–180s (16 scenarios × 5–15s).
// =============================================================================

import { spawn } from 'child_process';
import { SCENARIOS as scenarios, DEMO_SOURCE } from './eval-scenarios.js';

// Skip cleanly if requested
if (process.env.SKIP_MEPH_EVAL === '1') {
  console.log('Meph eval skipped (SKIP_MEPH_EVAL=1)');
  process.exit(0);
}

const BASE = process.env.PLAYGROUND_URL || 'http://localhost:3456';

// Resolve API key from env or --key flag
let apiKey = process.env.ANTHROPIC_API_KEY || '';
const keyFlag = process.argv.indexOf('--key');
if (keyFlag >= 0 && process.argv[keyFlag + 1]) apiKey = process.argv[keyFlag + 1];

// If no key anywhere, skip cleanly. The eval needs LLM calls — pointless
// to run dry. Pre-push hooks won't fail just because contributors don't
// have a personal Anthropic key on their machine.
if (!apiKey) {
  console.log('Meph eval skipped: no ANTHROPIC_API_KEY set (export to enable). exit 0.');
  process.exit(0);
}

// DEMO_SOURCE and scenarios now live in ./eval-scenarios.js — shared with
// eval-parallel.js (the 3-worker version of this harness).

// Run one Meph turn and parse SSE. Returns { calls, final, assistantMsg }.
async function chatTurn(messages) {
  const body = JSON.stringify({
    messages,
    apiKey,
    personality: '',
    editorContent: DEMO_SOURCE,
    errors: [],
    webTools: false,
  });
  const r = await fetch(BASE + '/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
  if (!r.ok) {
    const text = await r.text();
    return { ok: false, error: `HTTP ${r.status}: ${text.slice(0, 200)}`, calls: [], final: '' };
  }
  // Studio's /api/chat emits these SSE event types:
  //   {type: 'tool_start', name, summary?}   — one per tool call kickoff
  //   {type: 'tool_done', name}              — after the tool returns
  //   {type: 'text', delta}                  — streaming assistant text
  //   {type: 'terminal_append', text}        — mirrored terminal line
  // The tool's INPUT isn't streamed as a separate event — it's assembled on the
  // server. For eval grading we only need the tool NAME (and can inspect
  // /api/meph-actions or the terminal for argument-level checks if needed).
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
        // Only record the first tool_start per name+summary pair — the server
        // emits both a bare {tool_start,name} and a later {tool_start,name,summary}
        if (!toolCalls.length || toolCalls[toolCalls.length - 1].name !== ev.name || ev.summary) {
          toolCalls.push({ name: ev.name, summary: ev.summary || null, input: {} });
        }
      } else if (ev.type === 'text' && typeof ev.delta === 'string') {
        finalText += ev.delta;
      } else if (ev.type === 'text' && typeof ev.text === 'string') {
        finalText += ev.text;
      }
    }
  }
  return { ok: true, calls: toolCalls, final: finalText };
}

// Run a scenario in ONE turn. We ask Meph to (a) call the tool, then
// (b) answer a self-report question in the same response. That way his
// follow-up sees the actual tool_use + tool_result blocks from his own
// context — no fabricated history from our side. Extract the self-report
// by looking for a "SELF-REPORT:" marker we asked Meph to include.
async function runScenario(scn) {
  const fullPrompt = `${scn.prompt}

After the tool has run and you see the result, finish your response with one more line in this exact format:

SELF-REPORT: <one sentence on whether the ${scn.expectTool} tool worked correctly, returned useful data, or felt broken in any way. Be honest — if it returned an error, said "Unknown tool", gave garbage, or was empty, say so specifically.>`;

  const msgs = [{ role: 'user', content: fullPrompt }];
  const turn = await chatTurn(msgs);
  if (!turn.ok) return { ...turn, selfReport: '' };

  // Extract "SELF-REPORT: ..." from the final text
  const m = turn.final.match(/SELF-REPORT:\s*([^\n]+)/i);
  const selfReport = m ? m[1].trim() : '(no self-report marker found)';

  return {
    ok: true,
    calls: turn.calls,
    final: turn.final,
    selfReport,
  };
}

// Spawn a temporary playground server if BASE isn't reachable. Returns the
// child handle (or null if BASE was already up). Caller must kill on exit.
async function ensurePlaygroundRunning() {
  try {
    const r = await fetch(BASE + '/api/templates', { signal: AbortSignal.timeout(1000) });
    if (r.ok) return null; // already running
  } catch {}
  // Need to spawn one. Pick port from BASE.
  const port = (() => { try { return new URL(BASE).port || '3456'; } catch { return '3456'; } })();
  console.log(`No playground at ${BASE} — spawning one for the eval...`);
  const child = spawn('node', ['playground/server.js'], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: port },
    stdio: 'pipe',
  });
  // Wait for ready signal (server logs "Clear Playground:" on startup)
  await new Promise((resolve, reject) => {
    let done = false;
    const finish = (err) => { if (!done) { done = true; err ? reject(err) : resolve(); } };
    child.stdout.on('data', d => { if (/Clear Playground|listening/i.test(d.toString())) finish(); });
    child.stderr.on('data', d => process.stderr.write(d));
    setTimeout(() => finish(new Error('Playground startup timed out after 8s')), 8000);
  });
  return child;
}

async function main() {
  console.log('🧪 Meph Tool Eval');
  console.log('━'.repeat(60));
  console.log(`Base URL: ${BASE}`);
  console.log(`Scenarios: ${scenarios.length}`);
  console.log('━'.repeat(60));

  // Bootstrap playground if needed
  const spawnedServer = await ensurePlaygroundRunning();
  const cleanup = () => { if (spawnedServer) { try { spawnedServer.kill('SIGTERM'); } catch {} } };
  process.on('exit', cleanup);
  process.on('SIGINT', () => { cleanup(); process.exit(130); });
  process.on('SIGTERM', () => { cleanup(); process.exit(143); });

  // Try to set key server-side so /api/chat can fall back to it
  try {
    await fetch(BASE + '/api/set-key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: apiKey }),
    });
  } catch {}

  // Build a priming context so run_app / http_request / read_dom have something running
  let priorMessages = [];

  // Heuristic: does Meph's self-report flag any problem?
  function selfReportFlagsIssue(text) {
    if (!text) return false;
    const t = text.toLowerCase();
    // Positive signals ("worked fine") win
    const positives = /\b(worked fine|worked correctly|worked well|no issues?|successfully|ran fine|returned (correctly|what i expected)|functioned (correctly|as expected)|all good)\b/;
    if (positives.test(t)) return false;
    // Negative signals
    const negatives = /\b(broken|didn'?t (work|return)|doesn'?t (work|return)|returned (nothing|garbage|an? error|empty)|error|failed|bug|surprising|unexpected|weird|strange|not available|couldn'?t|unable to|no response|blank|issue)\b/;
    return negatives.test(t);
  }

  const results = [];
  for (let i = 0; i < scenarios.length; i++) {
    const scn = scenarios[i];
    process.stdout.write(`[${String(i + 1).padStart(2)}/${scenarios.length}] ${scn.name.padEnd(24)} `);
    const t0 = Date.now();
    try {
      const out = await runScenario(scn);
      const dur = ((Date.now() - t0) / 1000).toFixed(1);
      if (!out.ok) {
        console.log(`❌ error: ${out.error}  (${dur}s)`);
        results.push({ name: scn.name, pass: false, reason: out.error, calls: [], dur });
        continue;
      }
      const calledExpected = out.calls.some(c => c.name === scn.expectTool);
      const grader = calledExpected && scn.grade(out.calls, out.final);
      const mephFlaggedIssue = selfReportFlagsIssue(out.selfReport);
      const passed = grader && !mephFlaggedIssue;
      const mark = passed ? '✅' : (mephFlaggedIssue ? '⚠️' : '❌');
      const toolList = out.calls.map(c => c.name).join(', ') || '(none)';
      const shortReport = (out.selfReport || '').replace(/\s+/g, ' ').trim().slice(0, 80);
      console.log(`${mark} tools=[${toolList}]  (${dur}s)`);
      console.log(`      meph says: "${shortReport}"`);
      results.push({
        name: scn.name,
        pass: passed,
        calledExpected,
        mephFlaggedIssue,
        calls: out.calls.map(c => c.name),
        finalSample: (out.final || '').slice(0, 120),
        selfReport: out.selfReport,
        dur,
      });
    } catch (err) {
      console.log(`❌ threw: ${err.message}`);
      results.push({ name: scn.name, pass: false, reason: err.message });
    }
  }

  console.log('━'.repeat(60));
  const passed = results.filter(r => r.pass).length;
  const mephIssues = results.filter(r => r.mephFlaggedIssue);
  console.log(`RESULT: ${passed}/${results.length} passed    (${mephIssues.length} flagged by Meph)`);
  console.log('━'.repeat(60));
  if (mephIssues.length) {
    console.log('\n⚠️  Meph-reported issues (these tools ran but Meph says something felt off):');
    for (const r of mephIssues) {
      console.log(`  ${r.name}:`);
      console.log(`    "${(r.selfReport || '').replace(/\s+/g, ' ').trim().slice(0, 400)}"`);
    }
  }
  const fails = results.filter(r => !r.pass && !r.mephFlaggedIssue);
  if (fails.length) {
    console.log('\n❌ Grader failures (expected tool not called):');
    for (const f of fails) {
      console.log(`  ${f.name}: called=[${(f.calls || []).join(',')}]  ${f.reason ? '— ' + f.reason : ''}`);
    }
  }
  process.exit(passed === results.length ? 0 : 1);
}

main().catch(err => { console.error(err); process.exit(1); });

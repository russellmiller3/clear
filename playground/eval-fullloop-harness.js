// Drives Meph through the eval feature end-to-end via /api/chat SSE.
// Proves: (a) Meph can invoke list_evals + run_evals, (b) the tool blocks
// until the grader finishes, (c) Meph reads the structured result and can
// report on it. Also surfaces any visibility gaps during the long wait.
//
// Usage: node playground/eval-fullloop-harness.js [template]
//
// Prints every tool call + result and every text block to stderr in real
// time so a human (or an outer agent) can watch the loop unfold.

import fs from 'fs';
import path from 'path';

const TEMPLATE = process.argv[2] || 'helpdesk-agent';
const SOURCE_PATH = path.resolve(`apps/${TEMPLATE}/main.clear`);
const BASE = 'http://localhost:3456';

if (!fs.existsSync(SOURCE_PATH)) {
  console.error(`Template not found: ${SOURCE_PATH}`);
  process.exit(2);
}
const source = fs.readFileSync(SOURCE_PATH, 'utf8');
const lineCount = source.split('\n').length;
console.error(`[harness] loaded ${TEMPLATE} (${lineCount} lines)`);

const message = {
  role: 'user',
  content: [
    {
      type: 'text',
      text:
        'Two-step task:\n' +
        '1. Call list_evals and tell me how many specs the suite has and what kinds.\n' +
        '2. Call run_evals to run the whole suite. When it completes, give me a two-sentence summary: pass/fail counts, total cost, and the single worst failure (if any).\n' +
        'Do NOT edit the code. Do NOT run the app separately. Do NOT call http_request. Just list_evals, then run_evals, then summarize.'
    }
  ]
};

const body = JSON.stringify({
  messages: [message],
  editorContent: source,
  errors: [],
  testResults: null,
  webTools: false
});

const startedAt = Date.now();
const events = { text: 0, tool_use: 0, tool_result: 0, other: 0 };
const toolCalls = [];
let fullText = '';

const res = await fetch(BASE + '/api/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body
});

if (!res.ok) {
  console.error(`[harness] POST /api/chat failed: ${res.status}`);
  console.error(await res.text());
  process.exit(3);
}

console.error('[harness] streaming SSE...');
const reader = res.body.getReader();
const decoder = new TextDecoder();
let buf = '';
let lastEventAt = Date.now();

while (true) {
  const { value, done } = await reader.read();
  if (done) break;
  buf += decoder.decode(value, { stream: true });
  const lines = buf.split('\n');
  buf = lines.pop();
  for (const line of lines) {
    if (!line.startsWith('data: ')) continue;
    const payload = line.slice(6).trim();
    if (!payload) continue;
    let obj;
    try { obj = JSON.parse(payload); } catch { continue; }
    const t = Date.now() - startedAt;
    const gap = Date.now() - lastEventAt;
    lastEventAt = Date.now();
    if (obj.type === 'text') {
      events.text++;
      const chunk = obj.delta || obj.text || '';
      fullText += chunk;
      process.stderr.write(chunk);
    } else if (obj.type === 'thinking') {
      // quiet — just note it
      events.other++;
    } else if (obj.type === 'tool_start') {
      events.tool_use++;
      const name = obj.name || '?';
      toolCalls.push({ at: t, name, summary: obj.summary || '' });
      console.error(`\n[+${(t / 1000).toFixed(1)}s gap=${gap}ms] TOOL_START ${name} ${obj.summary || ''}`);
    } else if (obj.type === 'tool_done') {
      events.tool_result++;
      const last = toolCalls[toolCalls.length - 1];
      if (last && !last.resultAt) last.resultAt = t;
      const duration = last?.resultAt && last.at ? last.resultAt - last.at : null;
      console.error(`[+${(t / 1000).toFixed(1)}s ${duration ? `took ${(duration / 1000).toFixed(1)}s` : ''}] TOOL_DONE ${obj.name || ''}`);
    } else if (obj.type === 'eval_results') {
      const passed = obj.passed || 0;
      const failed = obj.failed || 0;
      const skipped = obj.skipped || 0;
      const cost = obj.total_cost_usd || 0;
      console.error(`\n[+${(t / 1000).toFixed(1)}s] EVAL_RESULTS — passed=${passed} failed=${failed} skipped=${skipped} cost=$${cost.toFixed(4)}`);
      if (Array.isArray(obj.results)) {
        for (const r of obj.results) {
          console.error(`    ${r.status.padEnd(5)} ${r.id} — ${(r.feedback || '').slice(0, 120)}`);
        }
      }
    } else if (obj.type === 'eval_row') {
      console.error(`[+${(t / 1000).toFixed(1)}s] EVAL_ROW ${obj.id || '?'} → ${obj.status || '?'}`);
    } else if (obj.type === 'error') {
      console.error(`\n[!] ERROR ${JSON.stringify(obj)}`);
    } else if (obj.type === 'done') {
      console.error(`\n[+${(t / 1000).toFixed(1)}s] DONE`);
    } else if (obj.type === 'switch_tab' || obj.type === 'thinking_start' || obj.type === 'code_update' || obj.type === 'context_usage' || obj.type === 'todo_update' || obj.type === 'test_results' || obj.type === 'terminal_append' || obj.type === 'highlight' || obj.type === 'undo') {
      events.other++;
    } else {
      events.other++;
      console.error(`[+${(t / 1000).toFixed(1)}s] UNKNOWN ${obj.type} ${JSON.stringify(obj).slice(0, 160)}`);
    }
  }
}

const total = ((Date.now() - startedAt) / 1000).toFixed(1);
console.error(`\n[harness] stream closed after ${total}s`);
console.error(`[harness] events: ${JSON.stringify(events)}`);
console.error(`[harness] tool calls: ${toolCalls.map(c => c.name).join(' → ')}`);
console.log(JSON.stringify({ ok: true, total_seconds: total, events, toolCalls: toolCalls.map(c => ({ name: c.name, atS: +(c.at / 1000).toFixed(1), tookS: c.resultAt ? +((c.resultAt - c.at) / 1000).toFixed(1) : null })), text: fullText }, null, 2));

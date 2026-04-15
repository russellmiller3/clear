// Drive Meph through a "fix the failing evals" loop end-to-end.
// Loads a template, sends Meph a prompt that tells him to iterate:
// list_evals → run_evals → read failures → edit_code → run_evals → repeat
// until either everything passes or he reports stuck.
//
// Outputs:
//   stderr = live tool trace (every tool_start / row / results / text chunk)
//   stdout = final JSON summary { template, final_pass, final_fail,
//            initial_pass, initial_fail, tools_used, stuck_reason, text }
//
// Usage: node playground/eval-fix-harness.js <template> [turns]

import fs from 'fs';
import path from 'path';

const TEMPLATE = process.argv[2] || 'helpdesk-agent';
const SOURCE_PATH = path.resolve(`apps/${TEMPLATE}/main.clear`);
const BASE = 'http://localhost:3456';

if (!fs.existsSync(SOURCE_PATH)) {
  console.error(`template not found: ${SOURCE_PATH}`);
  process.exit(2);
}
const source = fs.readFileSync(SOURCE_PATH, 'utf8');
console.error(`[fix-harness] ${TEMPLATE} — ${source.split('\n').length} lines`);

const message = {
  role: 'user',
  content: [{
    type: 'text',
    text:
`The eval suite for this Clear app is failing. Your goal: get as many evals passing as possible.

RULES:
1. Call list_evals to see the suite shape.
2. Call run_evals to see which fail and why.
3. For each BEHAVIOR failure (agent didn't follow its stated purpose, wrong tone, off-topic), fix by editing the agent definition in the .clear source via edit_code action=write. Re-run run_evals to confirm the fix.
4. For each INFRASTRUCTURE failure (probe input shape mismatch, endpoint 400/500 that's NOT the agent's fault, missing table, server crash), STOP and report it as a separate issue — do NOT hack around it in the agent prompt.
5. After each run_evals, if any specs still fail, decide: behavior or infrastructure? Fix behavior. Flag infrastructure.
6. Stop when either: (a) all specs pass, or (b) remaining fails are all infrastructure, or (c) you've tried 3 iterations without improvement.

At the end, give me a tight 3-bullet summary:
- Started: N pass / M fail
- Ended: N pass / M fail
- Unfixable (infrastructure issues to send back to me): bulleted list, one per issue, with the eval id, root cause in plain English, and what needs to change.

Do NOT modify anything other than the .clear source. Do not run http_request. Do not call run_app or run_tests. Only: list_evals, run_evals, edit_code, compile.`
  }]
};

const startedAt = Date.now();
const events = { text: 0, tool_use: 0, tool_result: 0, other: 0 };
const toolCalls = [];
const evalResults = []; // each entry = { at, passed, failed, skipped, cost }
let fullText = '';

const res = await fetch(BASE + '/api/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    messages: [message],
    editorContent: source,
    errors: [],
    testResults: null,
    webTools: false,
  }),
});

if (!res.ok) {
  console.error(`POST /api/chat failed: ${res.status}`);
  console.error(await res.text());
  process.exit(3);
}

console.error('[fix-harness] streaming SSE...');
const reader = res.body.getReader();
const decoder = new TextDecoder();
let buf = '';

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
    const t = ((Date.now() - startedAt) / 1000).toFixed(1);
    if (obj.type === 'text') {
      events.text++;
      const chunk = obj.delta || obj.text || '';
      fullText += chunk;
      process.stderr.write(chunk);
    } else if (obj.type === 'tool_start') {
      events.tool_use++;
      toolCalls.push({ at: t, name: obj.name || '?' });
      console.error(`\n[+${t}s] TOOL_START ${obj.name} ${obj.summary || ''}`);
    } else if (obj.type === 'tool_done') {
      events.tool_result++;
      console.error(`[+${t}s] TOOL_DONE ${obj.name || ''}`);
    } else if (obj.type === 'eval_results') {
      const row = { at: t, passed: obj.passed || 0, failed: obj.failed || 0, skipped: obj.skipped || 0, cost: obj.total_cost_usd || 0 };
      evalResults.push(row);
      console.error(`\n[+${t}s] EVAL_RESULTS passed=${row.passed} failed=${row.failed} skipped=${row.skipped} cost=$${row.cost.toFixed(4)}`);
    } else if (obj.type === 'error') {
      console.error(`\n[!] ERROR ${JSON.stringify(obj)}`);
    } else if (obj.type === 'done') {
      console.error(`\n[+${t}s] DONE`);
    } else {
      events.other++;
    }
  }
}

const initial = evalResults[0] || { passed: 0, failed: 0, skipped: 0, cost: 0 };
const final = evalResults[evalResults.length - 1] || initial;
const summary = {
  template: TEMPLATE,
  turns: evalResults.length,
  initial: { passed: initial.passed, failed: initial.failed, skipped: initial.skipped },
  final: { passed: final.passed, failed: final.failed, skipped: final.skipped },
  total_cost_usd: evalResults.reduce((s, r) => s + r.cost, 0).toFixed(4),
  total_seconds: ((Date.now() - startedAt) / 1000).toFixed(1),
  tools: toolCalls.map(c => c.name),
  events,
  text_length: fullText.length,
};
console.error(`\n[fix-harness] summary:`, JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ ...summary, text: fullText }, null, 2));

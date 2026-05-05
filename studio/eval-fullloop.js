// =============================================================================
// MEPH FULL-LOOP EVAL
// =============================================================================
// Not a unit test of individual tools — a scenario test: can Meph build an
// app end-to-end? Compile, run, test, debug if anything fails.
// =============================================================================

const BASE = process.env.PLAYGROUND_URL || 'http://localhost:3456';
let apiKey = process.env.ANTHROPIC_API_KEY || '';
const keyFlag = process.argv.indexOf('--key');
if (keyFlag >= 0 && process.argv[keyFlag + 1]) apiKey = process.argv[keyFlag + 1];

// Force Meph to do everything in ONE conversation so he carries context.
// Intentionally ambiguous prompt so he has to ask/assume — tests reasoning as
// much as tool routing.
const TASK = `Build a 'kudos board' app from scratch in Clear. Requirements:

- A Kudos table with: sender (required), recipient (required), message (required, max 200 chars).
- GET /api/kudos returns all kudos.
- POST /api/kudos creates a new one; validate all three fields.
- A page 'Kudos Board' with a heading, an input form (sender, recipient, message), a submit button, and a list of recent kudos displayed as cards.
- Add a user-written test that posts a kudo and verifies it appears in the list.

Steps:
1. Start by writing the Clear source in the editor (use edit_code action=write).
2. Compile it (you'll see the result).
3. If there are compile errors, fix them.
4. Run the app.
5. Run the tests with run_tests.
6. If any test fails, read the error, fix the source, re-run until green.
7. When done, tell me the final pass/fail count and any notes.

Work through this fully. Don't ask me for input — use your judgment on details.`;

async function chatStream(messages) {
  const body = JSON.stringify({
    messages, apiKey, personality: '', editorContent: '', errors: [], webTools: false,
  });
  const r = await fetch(BASE + '/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`HTTP ${r.status}: ${text.slice(0, 200)}`);
  }
  const toolCalls = [];
  const badJsonBlocks = [];
  const schemaErrors = [];
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
        if (!toolCalls.length || toolCalls[toolCalls.length - 1].name !== ev.name || ev.summary) {
          toolCalls.push({ name: ev.name, summary: ev.summary || null });
        }
      } else if (ev.type === 'text' && typeof ev.delta === 'string') {
        finalText += ev.delta;
      } else if (ev.type === 'terminal_append' && ev.text) {
        // Detect the schema-error marker we emit in validateToolInput
        if (/\[meph\] ✗ schema error:/.test(ev.text)) schemaErrors.push(ev.text);
      }
    }
  }

  // Scan finalText for ```json blocks and validate each
  const jsonFenceRe = /```(?:json|jsonc)\n([\s\S]*?)```/g;
  let m;
  while ((m = jsonFenceRe.exec(finalText)) !== null) {
    try { JSON.parse(m[1]); } catch (e) { badJsonBlocks.push({ content: m[1].slice(0, 120), error: e.message }); }
  }

  return { toolCalls, finalText, badJsonBlocks, schemaErrors };
}

async function main() {
  console.log('🧪 Meph Full-Loop Eval — build a kudos board from scratch');
  console.log('━'.repeat(62));
  const t0 = Date.now();

  const result = await chatStream([{ role: 'user', content: TASK }]);
  const duration = ((Date.now() - t0) / 1000).toFixed(1);

  const toolNames = result.toolCalls.map(c => c.name);
  const uniqueTools = [...new Set(toolNames)];
  const toolCounts = uniqueTools.map(n => ({ n, c: toolNames.filter(x => x === n).length }));

  console.log(`Duration: ${duration}s`);
  console.log(`Total tool calls: ${toolNames.length}`);
  console.log(`Unique tools used: ${uniqueTools.length}`);
  console.log('\nTool frequency:');
  for (const { n, c } of toolCounts.sort((a, b) => b.c - a.c)) {
    console.log(`  ${String(c).padStart(3)}  ${n}`);
  }

  console.log('\n━'.repeat(31));
  console.log('HEALTH CHECKS');
  console.log('━'.repeat(62));

  const checks = [
    { name: 'Used edit_code to write source', pass: toolNames.includes('edit_code') },
    { name: 'Used compile', pass: toolNames.includes('compile') },
    { name: 'Used run_app', pass: toolNames.includes('run_app') },
    { name: 'Used run_tests', pass: toolNames.includes('run_tests') },
    { name: 'Final response mentions pass/fail counts', pass: /\d+\s+pass(ed)?|pass.*\d+|fail.*\d+/i.test(result.finalText) },
    { name: 'No malformed JSON blocks in response', pass: result.badJsonBlocks.length === 0 },
    { name: 'No tool-input schema errors', pass: result.schemaErrors.length === 0 },
  ];

  let allPass = true;
  for (const c of checks) {
    console.log(`  ${c.pass ? '✅' : '❌'} ${c.name}`);
    if (!c.pass) allPass = false;
  }

  if (result.badJsonBlocks.length) {
    console.log('\n⚠️  Malformed JSON in response:');
    for (const b of result.badJsonBlocks) {
      console.log(`  - ${b.error}`);
      console.log(`    ${b.content}`);
    }
  }
  if (result.schemaErrors.length) {
    console.log('\n⚠️  Tool-input schema errors (validator caught these):');
    for (const e of result.schemaErrors) console.log(`  ${e}`);
  }

  console.log('\n━'.repeat(62));
  console.log('Final response (first 600 chars):');
  console.log(result.finalText.slice(0, 600));
  console.log('━'.repeat(62));
  console.log(allPass ? '✅ FULL LOOP PASSED' : '❌ FULL LOOP HAD ISSUES');

  process.exit(allPass ? 0 : 1);
}

main().catch(err => { console.error(err); process.exit(1); });

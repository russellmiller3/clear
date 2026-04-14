// =============================================================================
// MEPH FULL-LOOP SUITE — three apps, end-to-end, real Studio chat path
// =============================================================================
// Drives Meph through three different builds via /api/chat (same handler the
// Studio UI uses — same SSE stream, same tool-execution closure, same idle
// watchdog). Each scenario starts with a clean slate and asks for a complete
// build → compile → test → debug-if-needed loop.
//
// Per-scenario report:
//   - Wall-clock duration
//   - Tool calls (frequency)
//   - Schema-error count
//   - Malformed-JSON-block count
//   - Final source line count + does it contain expected keywords
//
// Aggregate report:
//   - Tool coverage (which of the ~20 tools never got used)
//   - Total bugs found
// =============================================================================

const BASE = process.env.PLAYGROUND_URL || 'http://localhost:3456';
let apiKey = process.env.ANTHROPIC_API_KEY || '';
const keyFlag = process.argv.indexOf('--key');
if (keyFlag >= 0 && process.argv[keyFlag + 1]) apiKey = process.argv[keyFlag + 1];

const SCENARIOS = [
  {
    name: 'Inventory tracker',
    prompt: `Build an inventory tracker app in Clear, end-to-end. Don't ask me questions — pick reasonable defaults.

Requirements:
- Suppliers table: name (required, unique), contact_email (required, must be email)
- Items table: name (required, max 100), quantity (number, default 0, min 0), supplier_id (number, references Suppliers)
- GET /api/items returns all items
- GET /api/items/low returns items where quantity is less than 5
- POST /api/items creates an item; validate everything; requires login
- DELETE /api/items/:id removes; requires admin role
- A page 'Inventory' with heading, search input filtering items by name, items table, and an add-item form
- One test that creates an item and verifies it appears in /api/items.

Workflow: write source, compile, fix any errors, run app, run_tests, fix until green, summarize.`,
    expectKeywords: ['Suppliers', 'Items', '/api/items', 'requires login'],
    expectTools: ['edit_code', 'compile', 'run_tests'],
  },
  {
    name: 'Support agent',
    prompt: `Build a customer-support AI agent app in Clear, end-to-end. Don't ask me questions.

Requirements:
- A FAQs table: question (required), answer (required), category
- An Orders table: customer_email (required), order_number (required, unique), status
- agent 'Support' that:
  - knows about: FAQs, Orders
  - can use: look_up_order (a function defined in the app that finds an Order by order_number)
  - must not: delete Orders
  - blocks arguments matching 'drop|truncate|delete from'
  - remembers conversation context
- POST /api/support receives a question, sends it to the Support agent, returns the answer
- A page 'Help' with a chat-style input bound to the /api/support endpoint
- One test that asks the agent a question and verifies it gets a response.

Workflow: write source, compile, fix errors, run app, run_tests, fix until green, summarize.`,
    expectKeywords: ['agent', 'Support', 'must not', 'block arguments', 'knows about'],
    expectTools: ['edit_code', 'compile', 'run_tests'],
  },
  {
    name: 'Realtime dashboard',
    prompt: `Build a real-time orders dashboard in Clear, end-to-end. Don't ask me questions.

Requirements:
- Orders table: customer (required), product (required), amount (number, required, min 0), status (default 'pending')
- POST /api/orders creates an order, validates fields, broadcasts the new order to all connected clients
- GET /api/orders returns all orders
- GET /api/orders/total returns the sum of amounts grouped by status
- A page 'Live Orders' with:
  - A heading
  - A bar chart showing total amount per status
  - A live-updating table that subscribes to new-order broadcasts
  - An add-order form
- One test that creates an order and verifies it appears in /api/orders.

Workflow: write source, compile, fix errors, run app, run_tests, fix until green, summarize.`,
    expectKeywords: ['broadcast', 'subscribe', 'chart', 'Orders'],
    expectTools: ['edit_code', 'compile', 'run_tests'],
  },
];

async function chatStream(messages) {
  const body = JSON.stringify({ messages, apiKey, personality: '', editorContent: '', errors: [], webTools: false });
  const r = await fetch(BASE + '/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);

  const toolCalls = [];
  const badJsonBlocks = [];
  const schemaErrors = [];
  const apiErrors = [];
  let finalText = '';
  let firstTokenAt = null;
  let lastChunkAt = Date.now();
  const reader = r.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!firstTokenAt) firstTokenAt = Date.now();
    lastChunkAt = Date.now();
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
        if (/\[meph\] ✗ schema error:/.test(ev.text)) schemaErrors.push(ev.text);
      } else if (ev.type === 'error') {
        apiErrors.push(ev.message);
      }
    }
  }

  const jsonFenceRe = /```(?:json|jsonc)\n([\s\S]*?)```/g;
  let m;
  while ((m = jsonFenceRe.exec(finalText)) !== null) {
    try { JSON.parse(m[1]); } catch (e) { badJsonBlocks.push({ content: m[1].slice(0, 100), error: e.message }); }
  }

  return { toolCalls, finalText, badJsonBlocks, schemaErrors, apiErrors, firstTokenAt, lastChunkAt };
}

async function runScenario(scn) {
  console.log('━'.repeat(72));
  console.log(`▶ ${scn.name}`);
  console.log('━'.repeat(72));
  const t0 = Date.now();
  let result;
  try {
    result = await chatStream([{ role: 'user', content: scn.prompt }]);
  } catch (err) {
    console.log(`  ❌ Stream failed: ${err.message}`);
    return { name: scn.name, ok: false, error: err.message };
  }
  const wall = ((Date.now() - t0) / 1000).toFixed(1);
  const ttft = result.firstTokenAt ? ((result.firstTokenAt - t0) / 1000).toFixed(1) : 'n/a';
  const toolNames = result.toolCalls.map(c => c.name);
  const toolFreq = toolNames.reduce((m, n) => (m[n] = (m[n] || 0) + 1, m), {});

  // Pull the editor source via /api/chat? No — the source lives only in the
  // chat closure. Best signal we have is finalText + tool counts.
  const hasKeywords = scn.expectKeywords.every(k => new RegExp(k, 'i').test(result.finalText) || toolNames.some(t => result.finalText.toLowerCase().includes(k.toLowerCase())));
  const hasExpectedTools = scn.expectTools.every(t => toolNames.includes(t));

  console.log(`  duration: ${wall}s   first-token: ${ttft}s   tool calls: ${toolNames.length}`);
  console.log(`  tool freq: ${Object.entries(toolFreq).sort((a,b)=>b[1]-a[1]).map(([n,c])=>`${n}×${c}`).join(', ')}`);
  console.log(`  expected tools used: ${hasExpectedTools ? '✓' : '✗'}`);
  console.log(`  expected keywords in response: ${hasKeywords ? '✓' : '✗'}`);
  console.log(`  malformed-JSON blocks in response: ${result.badJsonBlocks.length === 0 ? '✓ 0' : '✗ ' + result.badJsonBlocks.length}`);
  console.log(`  schema errors (validator caught): ${result.schemaErrors.length === 0 ? '✓ 0' : '⚠ ' + result.schemaErrors.length}`);
  console.log(`  api errors: ${result.apiErrors.length === 0 ? '✓ 0' : '✗ ' + result.apiErrors.length + ' — ' + result.apiErrors[0]?.slice(0, 80)}`);

  const tail = result.finalText.slice(-400).replace(/\n+/g, ' / ');
  console.log(`  final 400 chars: ${tail}`);

  return {
    name: scn.name,
    ok: hasExpectedTools && hasKeywords && result.badJsonBlocks.length === 0 && result.apiErrors.length === 0,
    durationSec: parseFloat(wall),
    toolCalls: toolNames.length,
    toolFreq,
    badJson: result.badJsonBlocks.length,
    schemaErrors: result.schemaErrors.length,
    apiErrors: result.apiErrors,
  };
}

async function main() {
  console.log('🧪 Meph Full-Loop Suite — 3 complex apps end to end');
  console.log(`base: ${BASE}\n`);

  const results = [];
  for (const scn of SCENARIOS) {
    results.push(await runScenario(scn));
  }

  // Aggregate tool coverage
  const allToolsSeen = new Set();
  for (const r of results) {
    if (r.toolFreq) Object.keys(r.toolFreq).forEach(n => allToolsSeen.add(n));
  }
  const KNOWN_TOOLS = ['edit_code','read_file','write_file','run_command','compile','run_app','stop_app','http_request','read_terminal','screenshot_output','highlight_code','browse_templates','source_map','run_tests','click_element','fill_input','read_network','inspect_element','read_storage','websocket_log','db_inspect','read_actions','read_dom','todo','patch_code'];
  const unused = KNOWN_TOOLS.filter(t => !allToolsSeen.has(t));

  console.log('\n' + '═'.repeat(72));
  console.log('AGGREGATE');
  console.log('═'.repeat(72));
  console.log(`Apps passed: ${results.filter(r => r.ok).length}/${results.length}`);
  console.log(`Tool coverage: ${allToolsSeen.size}/${KNOWN_TOOLS.length} tools used`);
  console.log(`  used:   ${[...allToolsSeen].sort().join(', ')}`);
  console.log(`  unused: ${unused.length === 0 ? '(none — full coverage)' : unused.join(', ')}`);
  const totalBadJson = results.reduce((s, r) => s + (r.badJson || 0), 0);
  const totalSchemaErrs = results.reduce((s, r) => s + (r.schemaErrors || 0), 0);
  const totalApiErrs = results.reduce((s, r) => s + (r.apiErrors?.length || 0), 0);
  console.log(`Bugs:`);
  console.log(`  malformed JSON blocks across all apps: ${totalBadJson}`);
  console.log(`  schema-error events (validator caught): ${totalSchemaErrs}`);
  console.log(`  API errors: ${totalApiErrs}`);
  process.exit(results.every(r => r.ok) ? 0 : 1);
}

main().catch(err => { console.error(err); process.exit(1); });

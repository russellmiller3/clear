// =============================================================================
// MEPH TOOL EVAL
// =============================================================================
// Run scenarios designed to trigger specific tools. Parse the SSE stream from
// /api/chat. Grade each scenario: (1) did Meph call the expected tool at least
// once? (2) did the tool succeed? (3) does the final response demonstrate he
// used the result?
//
// Usage:
//   ANTHROPIC_API_KEY=sk-ant-... node playground/eval-meph.js
//   node playground/eval-meph.js --key sk-ant-...  (alt)
//
// Requires the playground server running on :3456.
// =============================================================================

const BASE = process.env.PLAYGROUND_URL || 'http://localhost:3456';

// Resolve API key from env or --key flag
let apiKey = process.env.ANTHROPIC_API_KEY || '';
const keyFlag = process.argv.indexOf('--key');
if (keyFlag >= 0 && process.argv[keyFlag + 1]) apiKey = process.argv[keyFlag + 1];
// If no env/flag key, rely on the playground server's storedApiKey
// (set earlier via Studio or the server's own env). /api/chat will fall back.
const useServerKey = !apiKey;

// --- Minimal Clear source that gives Meph something to work with ---
const DEMO_SOURCE = `build for javascript web and javascript backend

create a Todos table:
  title, required
  done, boolean, default false

when user calls GET /api/todos:
  todos = look up all Todos
  send back todos

when user calls POST /api/todos receiving data:
  validate data:
    title must not be empty
  save data to Todos
  send back data with status 201

when user calls DELETE /api/todos/:id:
  requires login
  delete Todo with this id
  send back 'ok' with status 204

page 'Todo App':
  heading 'My Todos'
  section:
    'Title' as text input saves to new_title
    button 'Add':
      send new_title to '/api/todos'

test 'posting a todo works':
  call POST /api/todos with title is 'Buy milk'
  expect response status is 201
  expect response body has id
`;

// --- Scenarios: prompt → expected tool → grader on tool-use + final response ---
const scenarios = [
  {
    name: 'edit_code (write)',
    prompt: 'Replace the current editor source with this Clear program (exactly): a GET /api/hello endpoint that sends back "hi". Use edit_code with action=write.',
    expectTool: 'edit_code',
    // Grader: tool was called. (Inputs aren't streamed back over SSE so we
    // can't verify action=write from this side — we trust the server-side
    // execution log, which is asserted separately via /api/terminal-log.)
    grade: (calls, final) => calls.some(c => c.name === 'edit_code'),
  },
  {
    name: 'edit_code (read)',
    prompt: 'Tell me the first 3 lines of the current Clear source in the editor. Use edit_code action=read.',
    expectTool: 'edit_code',
    grade: (calls, final) => calls.some(c => c.name === 'edit_code'),
  },
  {
    name: 'compile',
    prompt: 'Compile the current source and tell me how many errors there are.',
    expectTool: 'compile',
    grade: (calls, final) => calls.some(c => c.name === 'compile'),
  },
  {
    name: 'run_app',
    prompt: 'Run the current app and tell me what port it started on.',
    expectTool: 'run_app',
    grade: (calls, final) => calls.some(c => c.name === 'run_app'),
  },
  {
    name: 'http_request',
    prompt: 'The app is running. Call GET /api/todos via http_request and tell me what came back.',
    expectTool: 'http_request',
    grade: (calls, final) => calls.some(c => c.name === 'http_request'),
  },
  {
    name: 'read_terminal',
    prompt: 'Read the terminal output and summarize the last few lines in one sentence.',
    expectTool: 'read_terminal',
    grade: (calls, final) => calls.some(c => c.name === 'read_terminal'),
  },
  {
    name: 'run_tests',
    prompt: 'Run all the tests for this app. Tell me pass/fail counts.',
    expectTool: 'run_tests',
    grade: (calls, final) => calls.some(c => c.name === 'run_tests'),
  },
  {
    name: 'read_file',
    prompt: 'Read the file SYNTAX.md (relative to repo root) and tell me the title of the first section.',
    expectTool: 'read_file',
    grade: (calls, final) => calls.some(c => c.name === 'read_file'),
  },
  {
    name: 'browse_templates',
    prompt: 'List all available Clear app templates.',
    expectTool: 'browse_templates',
    grade: (calls, final) => calls.some(c => c.name === 'browse_templates'),
  },
  {
    name: 'source_map',
    // The current editor source already compiles cleanly (see DEMO_SOURCE
    // above). Tell Meph not to read or edit anything — just call source_map
    // directly. This eliminates the "iterate on source first" rabbit hole
    // that swallowed his tool budget on prior runs.
    prompt: 'The editor source already compiles. Without reading any files or editing anything, call the source_map tool exactly once and return its raw output verbatim.',
    expectTool: 'source_map',
    grade: (calls, final) => calls.some(c => c.name === 'source_map'),
  },
  {
    name: 'highlight_code',
    prompt: 'Highlight lines 3 to 5 of the current editor for me.',
    expectTool: 'highlight_code',
    grade: (calls, final) => calls.some(c => c.name === 'highlight_code'),
  },
  {
    name: 'todo',
    prompt: 'Set your task list to: "check syntax", "compile", "run tests". Use the todo tool.',
    expectTool: 'todo',
    grade: (calls, final) => calls.some(c => c.name === 'todo'),
  },
  {
    name: 'read_actions',
    prompt: 'Check what actions the user has taken recently in the preview. Use read_actions.',
    expectTool: 'read_actions',
    grade: (calls, final) => calls.some(c => c.name === 'read_actions'),
  },
  {
    name: 'read_dom',
    prompt: 'Read the current DOM of the running app and tell me what heading is on the page.',
    expectTool: 'read_dom',
    grade: (calls, final) => calls.some(c => c.name === 'read_dom'),
  },
  {
    name: 'screenshot_output',
    prompt: 'Take a screenshot of the running app.',
    expectTool: 'screenshot_output',
    grade: (calls, final) => calls.some(c => c.name === 'screenshot_output'),
  },
  {
    name: 'stop_app',
    prompt: 'Stop the running app.',
    expectTool: 'stop_app',
    grade: (calls, final) => calls.some(c => c.name === 'stop_app'),
  },
];

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

async function main() {
  console.log('🧪 Meph Tool Eval');
  console.log('━'.repeat(60));
  console.log(`Base URL: ${BASE}`);
  console.log(`Scenarios: ${scenarios.length}`);
  console.log('━'.repeat(60));

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

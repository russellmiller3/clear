// =============================================================================
// PLAYGROUND SERVER — TEST SUITE
// =============================================================================
// Run: node playground/server.test.js
// Starts the server, runs all tests, kills server, reports results.
// =============================================================================

import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
let passed = 0, failed = 0, total = 0;
const BASE = 'http://localhost:3457'; // Different port so it doesn't collide

function assert(condition, msg) {
  total++;
  if (condition) { passed++; console.log(`  ✅ ${msg}`); }
  else { failed++; console.log(`  ❌ ${msg}`); }
}

async function post(path, body) {
  const r = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  // SSE responses (text/event-stream) happen on successful /api/chat.
  // Validation errors return JSON 400s. Detect and handle both.
  const ct = r.headers.get('content-type') || '';
  if (ct.includes('text/event-stream')) {
    const text = await r.text();
    const m = text.match(/^data:\s*(\{[\s\S]*?\})\s*$/m);
    return { status: r.status, data: m ? JSON.parse(m[1]) : { raw: text } };
  }
  const text = await r.text();
  try { return { status: r.status, data: JSON.parse(text) }; }
  catch { return { status: r.status, data: { raw: text } }; }
}

async function get(path) {
  const r = await fetch(BASE + path);
  return { status: r.status, text: await r.text() };
}

async function getJson(path) {
  const r = await fetch(BASE + path);
  return { status: r.status, data: await r.json() };
}

// =============================================================================
// START SERVER
// =============================================================================
console.log('Starting playground server on port 3457...');
const server = spawn('node', ['playground/server.js'], {
  cwd: join(__dirname, '..'),
  env: { ...process.env, PORT: '3457' },
  stdio: 'pipe',
});

let serverReady = false;
server.stdout.on('data', (d) => {
  if (d.toString().includes('localhost:')) serverReady = true;
});
server.stderr.on('data', (d) => process.stderr.write(d));

// Wait for server
await new Promise((resolve) => {
  const check = setInterval(() => {
    if (serverReady) { clearInterval(check); resolve(); }
  }, 100);
  setTimeout(() => { clearInterval(check); resolve(); }, 5000);
});

console.log('Server ready. Running tests...\n');

try {
  // =========================================================================
  // COMPILE ENDPOINT
  // =========================================================================
  console.log('📦 POST /api/compile');

  {
    const { status, data } = await post('/api/compile', { source: "show 42" });
    assert(status === 200, 'compiles simple program');
    assert(data.errors.length === 0, 'no errors on valid source');
    assert(data.javascript !== null, 'returns javascript');
  }

  {
    const { status, data } = await post('/api/compile', { source: "build for web\npage 'App' at '/':\n  heading 'Hello'" });
    assert(data.errors.length === 0, 'compiles web app');
    assert(data.html !== null, 'returns html for web target');
  }

  {
    const { status, data } = await post('/api/compile', { source: "build for javascript backend\nwhen user calls GET /api/test:\n  send back 'ok'" });
    assert(data.errors.length === 0, 'compiles backend app');
    assert(data.serverJS !== null || data.javascript !== null, 'returns server JS');
  }

  {
    const { status, data } = await post('/api/compile', { source: "" });
    assert(status === 200, 'handles empty source without crash');
    assert(Array.isArray(data.errors), 'returns errors array for empty source');
  }

  {
    const { status, data } = await post('/api/compile', {});
    assert(status === 400, 'rejects missing source');
    assert(data.error === 'Missing source', 'correct error message');
  }

  {
    const { status, data } = await post('/api/compile', { source: "this is not valid clear at all !!!!" });
    assert(status === 200, 'does not crash on invalid syntax');
    assert(Array.isArray(data.errors), 'returns errors array');
  }

  {
    const { status, data } = await post('/api/compile', { source: "show '<script>alert(1)</script>'" });
    assert(data.errors.length === 0, 'compiles XSS attempt without error');
  }

  {
    const { status, data } = await post('/api/compile', { source: "build for web and javascript backend\ndatabase is local memory\ncreate a Users table:\n  name, required\nwhen user calls GET /api/users:\n  users = get all Users\n  send back users\nwhen user calls POST /api/users sending data:\n  requires auth\n  saved = save data to Users\n  send back saved\npage 'App' at '/':\n  on page load get users from '/api/users'\n  display users as table" });
    assert(data.errors.length === 0, 'compiles full-stack app');
    assert(data.html !== null, 'full-stack has html');
    assert(data.serverJS !== null, 'full-stack has serverJS');
    assert(data.browserServer !== null, 'full-stack has browserServer');
  }

  // =========================================================================
  // TEMPLATES ENDPOINT
  // =========================================================================
  console.log('\n📦 GET /api/templates');

  {
    const { status, data } = await getJson('/api/templates');
    assert(status === 200, 'returns 200');
    assert(Array.isArray(data), 'returns array');
    assert(data.length >= 40, `has ${data.length} templates (expected 40+)`);
    assert(data[0].name !== undefined, 'templates have name');
  }

  // =========================================================================
  // TEMPLATE FILE ENDPOINT
  // =========================================================================
  console.log('\n📦 GET /api/template/:name');

  {
    const { status, text } = await get('/api/template/todo-fullstack');
    assert(status === 200, 'loads todo-fullstack template');
    assert(text.includes('build for'), 'template has build target');
  }

  {
    const { status } = await get('/api/template/nonexistent-app');
    assert(status === 404, 'returns 404 for missing template');
  }

  {
    const { status } = await get('/api/template/../../etc/passwd');
    assert(status === 404 || status === 400 || status === 200, 'path traversal does not crash server');
  }

  // =========================================================================
  // EXEC ENDPOINT — SECURITY
  // =========================================================================
  console.log('\n📦 POST /api/exec — security');

  {
    const { status, data } = await post('/api/exec', { command: 'rm -rf /' });
    assert(status === 403, 'blocks rm command');
    assert(data.error.includes('not allowed'), 'correct rejection message');
  }

  {
    const { status, data } = await post('/api/exec', { command: 'node -e "1" && rm -rf /' });
    assert(status === 403, 'blocks command chaining with &&');
  }

  {
    const { status, data } = await post('/api/exec', { command: 'node -e "1" ; rm -rf /' });
    assert(status === 403, 'blocks command chaining with ;');
  }

  {
    const { status, data } = await post('/api/exec', { command: 'node -e "1" | cat /etc/passwd' });
    assert(status === 403, 'blocks pipe injection');
  }

  {
    const { status, data } = await post('/api/exec', { command: 'node -e "$(cat /etc/passwd)"' });
    assert(status === 403, 'blocks $() injection');
  }

  {
    const { status, data } = await post('/api/exec', { command: 'python3 -c "import os; os.system(\'rm -rf /\')"' });
    assert(status === 403, 'blocks python command');
  }

  {
    const { status, data } = await post('/api/exec', {});
    assert(status === 400, 'rejects missing command');
  }

  // =========================================================================
  // EXEC ENDPOINT — ALLOWED COMMANDS
  // =========================================================================
  console.log('\n📦 POST /api/exec — allowed commands');

  {
    const { status, data } = await post('/api/exec', { command: 'node -e "console.log(42)"' });
    assert(status === 200, 'allows node command');
    assert(data.stdout.includes('42'), 'node produces output');
    assert(data.exitCode === 0, 'node exits cleanly');
  }

  {
    const { status, data } = await post('/api/exec', { command: 'ls playground/' });
    assert(status === 200, 'allows ls command');
    assert(data.stdout.includes('ide.html'), 'ls shows ide.html');
  }

  {
    const { status, data } = await post('/api/exec', { command: 'node cli/clear.js check apps/todo-fullstack/main.clear --json' });
    assert(status === 200, 'allows clear CLI check');
    assert(data.exitCode === 0, 'CLI check succeeds');
  }

  // =========================================================================
  // RUN / STOP ENDPOINTS
  // =========================================================================
  console.log('\n📦 POST /api/run + /api/stop');

  {
    const { status, data } = await post('/api/run', {});
    assert(status === 400, 'rejects run with no serverJS');
    assert(data.error.includes('No server code'), 'correct error');
  }

  {
    const { status, data } = await post('/api/stop', {});
    assert(status === 200, 'stop succeeds when nothing running');
    assert(data.stopped === true, 'returns stopped: true');
  }

  // Compile a real app and run it
  {
    const compileResult = await post('/api/compile', {
      source: "build for web and javascript backend\ndatabase is local memory\ncreate a Items table:\n  name, required\nwhen user calls GET /api/items:\n  items = get all Items\n  send back items\nwhen user calls GET /api/health:\n  send back 'ok'\npage 'App' at '/':\n  heading 'Test'"
    });
    const serverCode = compileResult.data.serverJS || compileResult.data.javascript;
    assert(!!serverCode, 'compiled app has server code');

    const { status, data } = await post('/api/run', {
      serverJS: serverCode,
      html: compileResult.data.html,
      css: compileResult.data.css,
    });
    assert(status === 200, 'starts compiled app');
    assert(data.port !== undefined, 'returns port number');

    // Wait for server to be ready
    await new Promise(r => setTimeout(r, 2000));

    // Test fetch proxy
    const fetchResult = await post('/api/fetch', { method: 'GET', path: '/api/health' });
    assert(fetchResult.status === 200, 'fetch proxy reaches running app');
    assert(fetchResult.data.data === 'ok' || JSON.stringify(fetchResult.data.data).includes('ok'), 'app responds correctly');

    // Test POST
    const postResult = await post('/api/fetch', { method: 'POST', path: '/api/items', body: { name: 'test item' } });
    assert(postResult.status === 200, 'POST to running app works');

    // Stop
    const stopResult = await post('/api/stop', {});
    assert(stopResult.data.stopped === true, 'stops running app');

    // Verify app is stopped
    const fetchAfterStop = await post('/api/fetch', { method: 'GET', path: '/api/health' });
    assert(fetchAfterStop.status === 400 || fetchAfterStop.status === 500, 'fetch fails after stop');
  }

  // =========================================================================
  // FETCH ENDPOINT
  // =========================================================================
  console.log('\n📦 POST /api/fetch');

  {
    const { status, data } = await post('/api/fetch', { method: 'GET', path: '/api/test' });
    assert(status === 400, 'rejects fetch when no app running');
    assert(data.error.includes('No app running'), 'correct error');
  }

  // =========================================================================
  // CHAT ENDPOINT
  // =========================================================================
  console.log('\n📦 POST /api/chat — validation');

  // If the test env has ANTHROPIC_API_KEY set, the server uses it and the
  // "no API key" case doesn't apply. Only test validation when no key is set.
  {
    const { status, data } = await post('/api/chat', { apiKey: 'sk-test' });
    // Either 400 (missing messages) or streams — both are valid responses
    assert(status === 400 || status === 200, 'chat with no messages returns 400 or streams');
    if (status === 400) assert((data.error || '').includes('No messages'), 'correct error when missing messages');
  }

  {
    const { status } = await post('/api/chat', { apiKey: 'sk-test', messages: [] });
    assert(status === 400 || status === 200, 'chat with empty messages returns 400 or streams');
  }

  // =========================================================================
  // SAVE ENDPOINT
  // =========================================================================
  console.log('\n📦 POST /api/save');

  {
    const { status, data } = await post('/api/save', { source: "show 'hello'", filename: 'test-save' });
    assert(status === 200, 'saves Clear source');
    assert(data.saved === true, 'returns saved: true');
    assert(data.path.includes('test-save'), 'returns path with filename');
  }

  {
    const { status, data } = await post('/api/save', {
      source: "build for web\npage 'App' at '/':\n  heading 'Test'",
      filename: 'test-save-compiled',
      compiled: { html: '<html>test</html>', css: 'body{}' },
    });
    assert(status === 200, 'saves with compiled output');
    assert(data.saved === true, 'saves compiled files');
  }

  {
    const { status, data } = await post('/api/save', {});
    assert(status === 400, 'rejects save with no source');
  }

  // =========================================================================
  // COMPILE ERROR PATHS
  // =========================================================================
  console.log('\n📦 Compile error scenarios');

  {
    const { data } = await post('/api/compile', { source: "build for javascript backend\nresult = call 'NonExistent' with data" });
    assert(data.errors.length > 0, 'catches undefined agent call');
    assert(data.errors.some(e => e.message.includes('not defined')), 'error says agent not defined');
  }

  {
    const { data } = await post('/api/compile', { source: "build for javascript backend\nwhen user calls DELETE /api/items/:id:\n  remove from Items with this id\n  send back 'deleted'" });
    assert(data.errors.length > 0, 'catches DELETE without auth');
    assert(data.errors.some(e => e.message.includes('auth')), 'error mentions auth');
  }

  {
    const { data } = await post('/api/compile', { source: "build for web and javascript backend\ndatabase is local memory\ncreate a Items table:\n  name, required\nwhen user calls GET /api/items:\n  items = get all Items\n  send back items\npage 'App' at '/':\n  button 'Go':\n    send data to '/api/missing'" });
    assert(data.errors.length > 0, 'catches orphan endpoint URL');
    assert(data.errors.some(e => e.message && e.message.includes('no backend endpoint')), 'error says no endpoint');
  }

  {
    const { data } = await post('/api/compile', { source: "build for javascript backend\nprice = 9.99\nname = price's label" });
    assert(data.warnings.length > 0, 'warns on field access on number');
  }

  // =========================================================================
  // EXEC — CLI INTEGRATION
  // =========================================================================
  console.log('\n📦 CLI integration via exec');

  {
    const { data } = await post('/api/exec', { command: "node cli/clear.js build apps/todo-fullstack/main.clear --stdout" });
    assert(data.exitCode === 0, 'clear build succeeds');
    assert(data.stdout.length > 100, 'build produces output');
  }

  {
    const { data } = await post('/api/exec', { command: "node cli/clear.js lint apps/content-pipeline/main.clear --json" });
    assert(data.exitCode === 0, 'clear lint succeeds');
  }

  // =========================================================================
  // SYNTAX ENDPOINT
  // =========================================================================
  console.log('\n📦 GET /api/syntax/:topic');

  {
    const { status, text } = await get('/api/syntax/workflows');
    assert(status === 200, 'finds workflows section');
    assert(text.includes('workflow'), 'contains workflow content');
  }

  {
    const { status, text } = await get('/api/syntax/agents');
    assert(status === 200, 'finds agents section');
  }

  {
    const { status } = await get('/api/syntax/nonexistent-topic-xyz');
    assert(status === 404, 'returns 404 for unknown topic');
  }

  // =========================================================================
  // STATIC FILES
  // =========================================================================
  console.log('\n📦 Static files');

  {
    const { status, text } = await get('/');
    assert(status === 200, 'serves ide.html at /');
    assert(text.includes('Clear'), 'ide.html contains Clear');
    assert(text.includes('CodeMirror') || text.includes('codemirror'), 'ide.html references CodeMirror');
  }

  {
    const { status } = await get('/codemirror.bundle.js');
    assert(status === 200, 'serves CodeMirror bundle');
  }

  {
    const { status } = await get('/system-prompt.md');
    assert(status === 200, 'serves system prompt');
  }

  // =========================================================================
  // CONTEXT METER — must not vanish
  // =========================================================================
  console.log('\n🔋 Context meter');

  {
    // Frontend: ide.html must have the context-meter element + JS function
    const { text } = await get('/ide');
    assert(text.includes('id="context-meter"'), 'ide.html has context-meter element');
    assert(text.includes('id="context-bar"'), 'ide.html has context-bar progress bar');
    assert(text.includes('id="context-label"'), 'ide.html has context-label span');
    assert(text.includes('updateContextMeter'), 'ide.html has updateContextMeter function');
    assert(text.includes("'context_usage'"), 'ide.html handles context_usage event');

    // Verify the CSS bug fix: context-meter should NOT have duplicate display properties
    const meterMatch = text.match(/id="context-meter"[^>]*style="([^"]*)"/);
    if (meterMatch) {
      const styleStr = meterMatch[1];
      const displayCount = (styleStr.match(/display\s*:/g) || []).length;
      assert(displayCount === 1, 'context-meter has exactly one display property (no duplicate)');
    }
  }

  {
    // Backend: server.js must have estimateContextUsage function
    const fs = await import('fs');
    const serverSrc = fs.readFileSync(join(__dirname, 'server.js'), 'utf8');
    assert(serverSrc.includes('estimateContextUsage'), 'server.js has estimateContextUsage function');
    assert(serverSrc.includes("type: 'context_usage'"), 'server.js sends context_usage event');
  }

  // =========================================================================
  // SOURCE MAP — click-to-highlight infrastructure
  // =========================================================================
  console.log('\n🗺️  Source map');

  {
    const { text } = await get('/ide');
    assert(text.includes('function buildSourceMap'), 'ide.html has buildSourceMap function');
    assert(text.includes('sourceMapData'), 'ide.html has sourceMapData variable');
    assert(text.includes('sourceMapData = buildSourceMap'), 'autoCompile wires buildSourceMap');
    assert(text.includes('handleEditorClick'), 'ide.html has editor click handler');
    assert(text.includes('highlightCompiledLines'), 'ide.html has highlightCompiledLines function');
    assert(text.includes('handleCompiledClick'), 'ide.html has compiled view click handler');
    assert(text.includes('cm-source-map-highlight'), 'ide.html has source map highlight CSS');
    assert(text.includes('cm-source-map-active'), 'ide.html has source map active CSS');
  }

  {
    const fs = await import('fs');
    const serverSrc = fs.readFileSync(join(__dirname, 'server.js'), 'utf8');
    assert(serverSrc.includes("name: 'source_map'"), 'server.js has source_map tool definition');
    assert(serverSrc.includes('sourceMap: true'), 'server.js passes sourceMap option to compiler');
    assert(serverSrc.includes("case 'source_map'"), 'server.js has source_map dispatch handler');
  }

  {
    // Verify backend compile has markers
    const { data } = await post('/api/compile', {
      source: "build for javascript backend\n\nwhen user calls GET /test:\n  send back 'ok'"
    });
    const output = data.serverJS || data.javascript;
    assert(output && output.includes('// clear:'), 'compiled backend has source map markers');
  }

  {
    // Verify HTML compile has data-clear-line attributes
    const { data } = await post('/api/compile', {
      source: "build for web\n\npage 'Test' at '/':\n  section 'Hero':\n    heading 'Hello'\n  button 'Click':\n    show 'hi'"
    });
    assert(data.html && data.html.includes('data-clear-line='), 'compiled HTML has data-clear-line markers');
    assert(data.html.includes('data-clear-line="4"'), 'section on line 4 is marked');
  }

  {
    // Verify IDE has preview→source message listener
    const { text } = await get('/ide');
    assert(text.includes('clear-source-line'), 'ide.html handles clear-source-line messages from preview');
    assert(text.includes('Compiler boilerplate'), 'ide.html shows boilerplate toast for unmapped compiled lines');
  }

  // =========================================================================
  // BROWSE TEMPLATES — Meph can read template library
  // =========================================================================
  console.log('\n📚 Browse templates');

  {
    const fs = await import('fs');
    const serverSrc = fs.readFileSync(join(__dirname, 'server.js'), 'utf8');
    assert(serverSrc.includes("name: 'browse_templates'"), 'server.js has browse_templates tool');
    assert(serverSrc.includes("case 'browse_templates'"), 'server.js has browse_templates dispatch');
  }

  // =============================================================================
  // TEST RUNNER ENDPOINT
  // =============================================================================
  console.log('\n--- Test Runner ---');

  // Test: run-tests with no source
  {
    const { data } = await post('/api/run-tests', {});
    assert(data.ok === false && data.error, 'run-tests with no source returns error');
  }

  // Test: run-tests with source that has test blocks
  {
    const source = "build for web\nx = 5\ntest 'x is five':\n  expect x is 5\n";
    const { data } = await post('/api/run-tests', { source });
    assert(typeof data.passed === 'number', 'app tests with test blocks return passed count');
    assert(typeof data.duration === 'number', 'app tests return duration');
  }

  // Test: run-tests with source that has no test blocks
  {
    const source = "build for web\nx = 5\n";
    const { data } = await post('/api/run-tests', { source });
    assert(data.passed === 0 && data.failed === 0, 'app tests with no test blocks returns 0/0');
  }

  // =========================================================================
  // STUDIO BRIDGE — shared iframe session with Meph
  // =========================================================================
  console.log('\n--- Studio Bridge ---');

  // Compiled HTML includes the bridge script
  {
    const { data } = await post('/api/compile', { source: "build for web\npage 'App' at '/':\n  heading 'Hello'" });
    assert(data.html.includes('CLEAR STUDIO BRIDGE'), 'compiled HTML includes bridge marker');
    assert(data.html.includes('clear-bridge=1'), 'bridge gated on query param');
    assert(data.html.includes("'user-action'"), 'bridge captures user actions');
    assert(data.html.includes("'bridge-ready'"), 'bridge posts ready signal');
  }

  // Bridge is inert without iframe + query param — check early returns exist
  {
    const { data } = await post('/api/compile', { source: "build for web\npage 'X' at '/':\n  heading 'Hi'" });
    assert(data.html.includes('window === window.parent'), 'bridge early-returns outside iframe');
  }

  // Action recorder endpoint accepts actions
  {
    const { status, data } = await post('/api/meph-actions', { action: 'click', selector: '#save-btn', ts: Date.now() });
    assert(status === 200, 'POST /api/meph-actions returns 200');
    assert(data.ok === true, 'action recorded');
  }

  // GET /api/meph-actions returns buffer
  {
    await post('/api/meph-actions', { action: 'input', selector: '#title', value: 'Buy milk', ts: Date.now() });
    const { status, data } = await getJson('/api/meph-actions');
    assert(status === 200, 'GET /api/meph-actions returns 200');
    assert(Array.isArray(data.actions), 'returns actions array');
    assert(data.actions.length >= 1, 'buffer contains recorded actions');
  }

  // Clear actions buffer
  {
    const { data } = await post('/api/meph-actions/clear', {});
    assert(data.ok === true, 'clear endpoint works');
    const { data: after } = await getJson('/api/meph-actions');
    assert(after.actions.length === 0, 'buffer empty after clear');
  }

  // ----- Eval suite endpoint --------------------------------------------
  // /api/eval-suite returns the structured eval list for a Clear source.
  // Does NOT spin up any child — pure compile + extract. Fast test.
  console.log('\n🧪 Eval suite endpoint');
  const agentSrc = [
    "build for javascript backend",
    "agent 'Rater' receives item:",
    "  n = ask claude 'Rate 1-10' with item",
    "  send back n",
    "agent 'Top' receives input:",
    "  x = call 'Rater' with input",
    "  send back x",
    "when user calls POST /api/run sending data:",
    "  out = call 'Top' with data's input",
    "  send back out",
  ].join('\n');
  {
    const { status, data } = await post('/api/eval-suite', { source: agentSrc });
    assert(status === 200, 'POST /api/eval-suite returns 200');
    assert(data.ok === true, 'returns ok:true');
    assert(Array.isArray(data.suite), 'returns a suite array');
    const kinds = data.suite.map(e => e.kind).sort();
    assert(kinds.includes('e2e'), 'suite includes at least one E2E eval');
    assert(kinds.filter(k => k === 'role').length === 2, 'suite has role eval per agent (2)');
    assert(kinds.filter(k => k === 'format').length === 2, 'suite has format eval per agent (2)');
    const raterRole = data.suite.find(e => e.id === 'role-rater');
    assert(raterRole && raterRole.synthetic === true, 'internal agent (Rater) uses synthetic endpoint');
    assert(raterRole && raterRole.endpointPath === '/_eval/agent_rater', 'synthetic endpoint path is /_eval/agent_<name>');
    const topRole = data.suite.find(e => e.id === 'role-top');
    assert(topRole && topRole.synthetic === false, 'endpoint-exposed agent (Top) uses real endpoint');
    assert(topRole && topRole.endpointPath === '/api/run', 'real endpoint path matches source');
    assert(typeof raterRole.rubric === 'string' && raterRole.rubric.includes('Rate 1-10'), 'rubric quotes the agent\'s ask-claude prompt');
  }

  {
    // No agents in source → empty suite
    const { status, data } = await post('/api/eval-suite', { source: 'build for javascript backend\nwhen user requests data from /api/ping:\n  send back \'pong\'' });
    assert(status === 200, 'empty-agent source returns 200');
    assert(data.ok === true && Array.isArray(data.suite) && data.suite.length === 0, 'no agents → empty suite');
  }

  {
    // Compile-error source → ok:false with errors
    const { status, data } = await post('/api/eval-suite', { source: 'totally not valid clear code %%%' });
    assert(status === 200, 'bad source returns 200 (with ok:false body)');
    assert(data.ok === false, 'bad source returns ok:false');
    assert(typeof data.error === 'string', 'includes error message');
  }

  // ----- Unknown-id handling on /api/run-eval ---------------------------
  // Doesn't require the eval child to start — guard fires first.
  {
    const { status, data } = await post('/api/run-eval', { source: agentSrc, id: 'definitely-not-an-eval' });
    assert(status === 200, 'unknown id returns 200');
    assert(data.ok === false, 'unknown id returns ok:false');
    assert(/Unknown eval id/.test(data.error || ''), 'error message mentions unknown id');
  }

  // ----- Concurrent run-eval calls serialize via the mutex --------------
  // Two unknown-id calls fired at once should both complete (not crash,
  // not interleave). The mutex serializes them. This also verifies the
  // mutex chain handles the "previous promise rejected" case cleanly.
  console.log('\n🔒 Eval runner mutex');
  {
    const p1 = post('/api/run-eval', { source: agentSrc, id: 'nope-1' });
    const p2 = post('/api/run-eval', { source: agentSrc, id: 'nope-2' });
    const [r1, r2] = await Promise.all([p1, p2]);
    assert(r1.status === 200 && r2.status === 200, 'both concurrent calls return 200');
    assert(r1.data.ok === false && r2.data.ok === false, 'both get ok:false (unknown ids)');
    // Order and atomicity — mutex should have serialized them; both should have proper errors
    assert(/Unknown eval id/.test(r1.data.error || ''), 'first call has unknown-id error');
    assert(/Unknown eval id/.test(r2.data.error || ''), 'second call has unknown-id error');
  }

  // ----- Cost estimate endpoint -----------------------------------------
  // /api/eval-suite-estimate compiles source and returns a pre-run estimate
  // so the UI can show a modal like "This run calls Claude N times (~$X)".
  console.log('\n💰 Cost estimate endpoint');
  {
    const { status, data } = await post('/api/eval-suite-estimate', { source: agentSrc });
    assert(status === 200, 'POST /api/eval-suite-estimate returns 200');
    assert(data.ok === true, 'returns ok:true for valid source');
    assert(typeof data.suite_size === 'number' && data.suite_size > 0, 'returns suite_size');
    assert(typeof data.evals_to_grade === 'number', 'returns evals_to_grade count');
    assert(typeof data.estimated_cost_usd === 'number' && data.estimated_cost_usd >= 0, 'returns estimated_cost_usd');
    assert(typeof data.estimated_duration_seconds === 'number', 'returns estimated_duration_seconds');
    // Sanity — role + e2e specs grade; format specs don't. For this source:
    // 1 E2E + 2 role + 2 format = 5 total, 3 gradeable (e2e + 2 role).
    assert(data.evals_to_grade === 3, `expected 3 gradeable specs, got ${data.evals_to_grade}`);
    // Cost is per-gradeable × ~0.003 USD — should be well under a dollar
    assert(data.estimated_cost_usd < 1, 'estimated cost is under $1 for a small suite');
    // Provider + model surfaced
    assert(typeof data.provider === 'string', 'returns provider name');
    assert(typeof data.model === 'string', 'returns model id');
  }

  {
    // Source with no agents → 0 suite, 0 to grade, 0 cost
    const { data } = await post('/api/eval-suite-estimate', { source: 'build for javascript backend\nwhen user requests data from /api/p:\n  send back \'ok\'' });
    assert(data.ok === true && data.suite_size === 0, 'empty-agent source: suite_size=0');
    assert(data.evals_to_grade === 0 && data.estimated_cost_usd === 0, 'no gradeable evals, zero cost');
  }

  {
    // Bad source — surfaces the compile error
    const { data } = await post('/api/eval-suite-estimate', { source: 'not valid %%%' });
    assert(data.ok === false, 'bad source returns ok:false');
  }

} catch (err) {
  console.error('\n💥 Test crash:', err.message);
  failed++;
}

// =============================================================================
// CLEANUP
// =============================================================================
server.kill('SIGTERM');

console.log(`\n========================================`);
console.log(`✅ Passed: ${passed}`);
if (failed > 0) console.log(`❌ Failed: ${failed}`);
console.log(`========================================`);

process.exit(failed > 0 ? 1 : 0);

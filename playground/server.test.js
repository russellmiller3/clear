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
  return { status: r.status, data: await r.json() };
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

  {
    const { status, data } = await post('/api/chat', { messages: [{ role: 'user', content: 'hi' }] });
    assert(status === 400, 'rejects chat with no API key');
    assert(data.error.includes('API key'), 'correct error');
  }

  {
    const { status, data } = await post('/api/chat', { apiKey: 'sk-test' });
    assert(status === 400, 'rejects chat with no messages');
    assert(data.error.includes('No messages'), 'correct error');
  }

  {
    const { status, data } = await post('/api/chat', { apiKey: 'sk-test', messages: [] });
    assert(status === 400, 'rejects chat with empty messages');
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

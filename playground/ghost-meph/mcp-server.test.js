// =============================================================================
// MCP SERVER — UNIT + INTEGRATION TESTS
// =============================================================================
// Verifies GM-2 step 1: the MCP server skeleton speaks JSON-RPC 2.0
// correctly, exposes Meph's tool definitions, and dispatches calls to
// handlers.
//
// Phase 1-3: pure-protocol unit tests against dispatch() — fast, no
// subprocess.
// Phase 4: subprocess integration test that spawns the real index.js
// over stdio and runs an initialize → tools/list → tools/call flow.
//
// Run: node playground/ghost-meph/mcp-server.test.js
// =============================================================================

import { spawn } from 'child_process';
import { dispatch, ERROR_CODES } from './mcp-server/protocol.js';
import { buildToolRegistry, _resetMcpState } from './mcp-server/tools.js';

let passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}`); }
}

(async () => {
  const registry = buildToolRegistry();

  // =========================================================================
  // PHASE 1 — initialize handshake
  // =========================================================================
  console.log('\n🤝 Phase 1 — initialize handshake');

  const init = await dispatch({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '0' } },
  }, registry);
  assert(init.jsonrpc === '2.0', 'initialize response has jsonrpc 2.0');
  assert(init.id === 1, 'initialize response echoes request id');
  assert(init.result.protocolVersion === '2024-11-05', 'initialize echoes requested protocol version');
  assert(init.result.serverInfo.name === 'meph-tools', 'serverInfo.name is "meph-tools"');
  assert(init.result.capabilities.tools !== undefined, 'capabilities.tools advertised');

  // notifications/initialized — fire-and-forget, no response
  const initNotif = await dispatch({
    jsonrpc: '2.0',
    method: 'notifications/initialized',
  }, registry);
  assert(initNotif === null, 'notifications/initialized returns no response');

  // =========================================================================
  // PHASE 2 — tools/list
  // =========================================================================
  console.log('\n📋 Phase 2 — tools/list');

  const list = await dispatch({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, registry);
  assert(list.result.tools.length >= 2, 'tools/list returns at least the 2 stub tools');
  const names = list.result.tools.map(t => t.name);
  assert(names.includes('meph_read_file'), 'meph_read_file present in tools list');
  assert(names.includes('meph_compile'), 'meph_compile present in tools list');
  for (const t of list.result.tools) {
    assert(typeof t.description === 'string' && t.description.length > 10,
      `${t.name} has a non-trivial description`);
    assert(t.inputSchema && t.inputSchema.type === 'object',
      `${t.name} inputSchema is type=object`);
  }

  // =========================================================================
  // PHASE 3 — tools/call dispatch
  // =========================================================================
  console.log('\n🔧 Phase 3 — tools/call dispatch');

  // Valid call — README.md isn't in the readable allowlist, expect that error
  const call1 = await dispatch({
    jsonrpc: '2.0', id: 3, method: 'tools/call',
    params: { name: 'meph_read_file', arguments: { filename: 'README.md' } },
  }, registry);
  assert(call1.result.content !== undefined, 'tools/call returns content array');
  assert(Array.isArray(call1.result.content) && call1.result.content[0].type === 'text',
    'content[0] is text type');
  // GM-2 step 3a: meph_read_file is now wired to the real readFileTool
  // implementation. README.md is NOT in the allowlist, so we expect an error.
  const text1 = call1.result.content[0].text;
  assert(text1.includes('Can only read'),
    'meph_read_file rejects non-allowlisted filename with the same error /api/chat would return');

  // Real allowed read — SYNTAX.md is in the allowlist
  const call1b = await dispatch({
    jsonrpc: '2.0', id: 31, method: 'tools/call',
    params: { name: 'meph_read_file', arguments: { filename: 'SYNTAX.md' } },
  }, registry);
  const text1b = call1b.result.content[0].text;
  // Result is the JSON-stringified tool output — parse and inspect
  const parsed = JSON.parse(text1b);
  assert(parsed.filename === 'SYNTAX.md',
    'meph_read_file returns filename for an allowed file');
  assert(typeof parsed.totalLines === 'number' && parsed.totalLines > 0,
    `meph_read_file returns totalLines (got ${parsed.totalLines})`);
  // SYNTAX.md is large → expect TOC mode rather than full content
  assert(parsed.mode === 'toc' || typeof parsed.content === 'string',
    'meph_read_file returns either toc mode or content string depending on file size');

  // Invalid args (missing required field)
  const call2 = await dispatch({
    jsonrpc: '2.0', id: 4, method: 'tools/call',
    params: { name: 'meph_read_file', arguments: {} },
  }, registry);
  assert(call2.result.isError === true, 'invalid args produces isError=true result');
  assert(call2.result.content[0].text.includes('filename'),
    'error names the missing field');

  // Unknown tool
  const call3 = await dispatch({
    jsonrpc: '2.0', id: 5, method: 'tools/call',
    params: { name: 'meph_does_not_exist', arguments: {} },
  }, registry);
  assert(call3.error && call3.error.code === ERROR_CODES.METHOD_NOT_FOUND,
    'unknown tool returns -32601 (method not found)');
  assert(call3.error.message.includes('Tool not found'),
    'error message names "Tool not found"');

  // Method we don't implement
  const noImpl = await dispatch({
    jsonrpc: '2.0', id: 6, method: 'resources/list',
  }, registry);
  assert(noImpl.error.code === ERROR_CODES.METHOD_NOT_FOUND,
    'unimplemented method returns -32601');

  // Bad envelope
  const bad = await dispatch({ jsonrpc: '1.0', id: 7, method: 'initialize' }, registry);
  assert(bad.error.code === ERROR_CODES.INVALID_REQUEST,
    'wrong jsonrpc version returns -32600 (invalid request)');

  // =========================================================================
  // PHASE 4 — subprocess integration
  // Spawns the real MCP server and pipes JSON-RPC over stdio. Verifies
  // initialize + tools/list + tools/call all round-trip cleanly.
  // =========================================================================
  console.log('\n🔌 Phase 4 — subprocess integration (real stdio loop)');

  const result = await runSubprocessExchange();
  assert(result.error === null, `subprocess ran without error (${result.error || 'ok'})`);
  assert(result.responses.length === 3, `received 3 responses (got ${result.responses.length})`);
  if (result.responses.length === 3) {
    const [r1, r2, r3] = result.responses;
    assert(r1.id === 1 && r1.result.serverInfo.name === 'meph-tools',
      'subprocess initialize response correct');
    assert(r2.id === 2 && Array.isArray(r2.result.tools) && r2.result.tools.length >= 2,
      'subprocess tools/list response correct');
    // r3 is the meph_read_file call with README.md (not in allowlist) — should
    // come back with the allowlist error from the now-real handler.
    assert(r3.id === 3 && r3.result.content[0].text.includes('Can only read'),
      'subprocess tools/call response correct (real readFileTool, README.md rejected)');
  }

  // =========================================================================
  // PHASE 5 — GM-2 step 2a: all 28 tools exposed, real dispatch through
  //           meph-tools.js. Verifies the handler-registration loop wires
  //           up the full Meph surface and that stateful tools (edit_code,
  //           compile, todo) actually mutate + read back the MCP server's
  //           module-level state.
  // =========================================================================
  console.log('\n🔗 Phase 5 — GM-2 step 2a: full Meph tool surface via MCP');

  _resetMcpState();
  const fullList = await dispatch({ jsonrpc: '2.0', id: 100, method: 'tools/list' }, registry);
  assert(fullList.result.tools.length === 28,
    `tools/list exposes all 28 Meph tools (got ${fullList.result.tools.length})`);
  const allNames = fullList.result.tools.map(t => t.name);
  for (const expected of ['meph_edit_code', 'meph_compile', 'meph_patch_code', 'meph_source_map', 'meph_highlight_code', 'meph_todo', 'meph_browse_templates']) {
    assert(allNames.includes(expected), `meph_${expected.slice(5)} registered`);
  }

  // Happy path: edit_code write → stores source in module state
  const write = await dispatch({
    jsonrpc: '2.0', id: 101, method: 'tools/call',
    params: { name: 'meph_edit_code', arguments: { action: 'write', code: "on GET '/':\n  send 'hi'\n" } },
  }, registry);
  const writeParsed = JSON.parse(write.result.content[0].text);
  assert(writeParsed.applied === true,
    `meph_edit_code write returns applied=true (got ${JSON.stringify(writeParsed).slice(0, 120)})`);

  // edit_code read → reads back what was written (module state works)
  const read = await dispatch({
    jsonrpc: '2.0', id: 102, method: 'tools/call',
    params: { name: 'meph_edit_code', arguments: { action: 'read' } },
  }, registry);
  const readText = read.result.content[0].text;
  assert(readText.includes("send 'hi'"),
    `meph_edit_code read returns what write stored (module-level state works) (got ${readText.slice(0, 120)})`);

  // compile → exercises real compileProgram against the stored source
  const compile = await dispatch({
    jsonrpc: '2.0', id: 103, method: 'tools/call',
    params: { name: 'meph_compile', arguments: {} },
  }, registry);
  const compileParsed = JSON.parse(compile.result.content[0].text);
  assert(Array.isArray(compileParsed.errors) && compileParsed.errors.length === 0,
    `meph_compile runs against stored source and returns errors=[] (got ${JSON.stringify(compileParsed.errors || 'missing')})`);
  assert(compileParsed.hasHTML === true && compileParsed.hasJavascript === true,
    `meph_compile surfaces shape flags (hasHTML=${compileParsed.hasHTML}, hasJavascript=${compileParsed.hasJavascript})`);

  // Schema error path: edit_code with missing code on write still rejects
  const schemaRej = await dispatch({
    jsonrpc: '2.0', id: 104, method: 'tools/call',
    params: { name: 'meph_edit_code', arguments: { action: 'write' } },  // no code
  }, registry);
  assert(schemaRej.result.isError === true,
    `meph_edit_code schema error → isError=true (got ${JSON.stringify(schemaRej.result).slice(0, 150)})`);
  assert(schemaRej.result.content[0].text.includes('"code" string'),
    'schema error surfaces missing-field detail');

  // todo tool round-trip: set → get returns the stored todos
  await dispatch({
    jsonrpc: '2.0', id: 105, method: 'tools/call',
    params: { name: 'meph_todo', arguments: { action: 'set', todos: [{ content: 'build it', status: 'pending', activeForm: 'building it' }] } },
  }, registry);
  const todoGet = await dispatch({
    jsonrpc: '2.0', id: 106, method: 'tools/call',
    params: { name: 'meph_todo', arguments: { action: 'get' } },
  }, registry);
  const todoParsed = JSON.parse(todoGet.result.content[0].text);
  assert(Array.isArray(todoParsed.todos) && todoParsed.todos.length === 1,
    `meph_todo round-trip stores + returns todos (got ${JSON.stringify(todoParsed.todos || 'missing')})`);
  assert(todoParsed.todos[0].content === 'build it',
    'meph_todo preserves content field across set+get');

  // Tools that need live infrastructure (no running child, no Factor DB)
  // should fail cleanly with a structured error rather than crashing.
  const noApp = await dispatch({
    jsonrpc: '2.0', id: 107, method: 'tools/call',
    params: { name: 'meph_http_request', arguments: { method: 'GET', path: '/api/x' } },
  }, registry);
  const noAppText = noApp.result.content[0].text;
  assert(noAppText.includes('No app running'),
    `meph_http_request fails clean when no child app ("No app running" — got ${noAppText.slice(0, 120)})`);

  console.log(`\n${failed === 0 ? '✅' : '❌'} ${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
})();

/** Spawn the MCP server as a subprocess, pipe initialize + tools/list +
 *  tools/call requests, collect responses. */
function runSubprocessExchange() {
  return new Promise((resolve) => {
    const child = spawn('node', ['playground/ghost-meph/mcp-server/index.js'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', d => { stdout += d.toString('utf8'); });
    child.stderr.on('data', d => { stderr += d.toString('utf8'); });

    const timer = setTimeout(() => {
      try { child.kill('SIGTERM'); } catch {}
      resolve({ error: 'timeout', responses: [], stderr });
    }, 5000);

    child.on('close', () => {
      clearTimeout(timer);
      const responses = [];
      for (const line of stdout.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try { responses.push(JSON.parse(trimmed)); }
        catch { /* skip non-JSON */ }
      }
      resolve({ error: null, responses, stderr });
    });
    child.on('error', err => {
      clearTimeout(timer);
      resolve({ error: err.message, responses: [], stderr });
    });

    // Send three requests, then close stdin to let the server exit.
    const requests = [
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '0' } } },
      { jsonrpc: '2.0', id: 2, method: 'tools/list' },
      { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'meph_read_file', arguments: { filename: 'README.md' } } },
    ];
    for (const req of requests) child.stdin.write(JSON.stringify(req) + '\n');
    child.stdin.end();
  });
}

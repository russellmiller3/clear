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
import { buildToolRegistry, _resetMcpState, _testBuildMephContext, _resetFactorDbCache } from './mcp-server/tools.js';

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

  // Drift guard — every MEPH_TOOLS entry must pass dispatchTool's
  // validateToolInput without "Unknown tool". If someone adds a tool name to
  // MEPH_TOOLS that dispatchTool's switch doesn't handle, the MCP server
  // would expose a tool that always fails. This catches the drift.
  const { validateToolInput: validate } = await import('../meph-tools.js');
  for (const t of fullList.result.tools) {
    const bareName = t.name.replace(/^meph_/, '');
    // We call validate with an empty object — it may complain about
    // missing fields, but should NOT complain about "Unknown tool" if the
    // tool name is in dispatchTool's switch.
    const err = validate(bareName, {});
    const recognized = err === null || !err.includes('Unknown tool');
    assert(recognized,
      `MEPH_TOOLS.${t.name} — dispatchTool recognizes the bare name "${bareName}" (got "${err?.slice(0, 80)}")`);
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

  // meph_list_evals was stubbed until compileForEval extracted — verify it
  // now runs the real impl. Empty source → structured "No source code" error
  // from compileForEval; any source without backends → "no backend" error.
  // We use the edit_code/write source we stored earlier (small frontend app)
  // which should produce the "no backend" path cleanly.
  const listEvals = await dispatch({
    jsonrpc: '2.0', id: 108, method: 'tools/call',
    params: { name: 'meph_list_evals', arguments: {} },
  }, registry);
  const listText = listEvals.result.content[0].text;
  const listParsed = JSON.parse(listText);
  // Before compileForEval was extracted this threw with "helpers.compileForEval
  // is not a function"; now it returns a real structured result. The source
  // currently stored has no evals, so we expect { ok: true, suite: [], count: 0 }.
  assert(typeof listParsed === 'object' && !listParsed.schemaError,
    `meph_list_evals returns structured result (not undefined-helper throw) — got ${listText.slice(0, 120)}`);
  assert(listParsed.ok === true && Array.isArray(listParsed.suite),
    `meph_list_evals via real compileForEval returns {ok, suite} shape (got ${listText.slice(0, 120)})`);

  // meph_run_tests with empty source → "No source code" from the real
  // runTestsTool (the subprocess branch never fires; guard rail catches first).
  _resetMcpState();
  const runTests = await dispatch({
    jsonrpc: '2.0', id: 109, method: 'tools/call',
    params: { name: 'meph_run_tests', arguments: {} },
  }, registry);
  const runTestsText = runTests.result.content[0].text;
  const runTestsParsed = JSON.parse(runTestsText);
  assert(runTestsParsed.ok === false && runTestsParsed.error?.includes('No source code'),
    `meph_run_tests returns structured "No source code" error on empty source (got ${runTestsText.slice(0, 120)})`);

  // =========================================================================
  // PHASE 6 — runEvalSuite HTTP proxy (cc-agent follow-up to GM-2 step 2d)
  // Verifies the MCP server proxies run_evals / run_eval back to Studio's
  // /api/run-eval endpoint when STUDIO_URL is set. Without STUDIO_URL (the
  // standalone case) a clean error surfaces. With STUDIO_URL we exercise a
  // local HTTP mock to avoid depending on a real Studio process.
  // =========================================================================
  console.log('\n📡 Phase 6 — runEvalSuite HTTP proxy to Studio');

  // --- 6a. Without STUDIO_URL: clear "standalone mode" error
  delete process.env.STUDIO_URL;
  _resetMcpState();
  // Store source first so the tool doesn't short-circuit on empty-source
  await dispatch({
    jsonrpc: '2.0', id: 600, method: 'tools/call',
    params: { name: 'meph_edit_code', arguments: { action: 'write', code: "on GET '/':\n  send 'hi'\n" } },
  }, registry);
  const standaloneEvals = await dispatch({
    jsonrpc: '2.0', id: 601, method: 'tools/call',
    params: { name: 'meph_run_evals', arguments: {} },
  }, registry);
  const standaloneText = standaloneEvals.result.content[0].text;
  const standaloneParsed = JSON.parse(standaloneText);
  assert(standaloneParsed.ok === false && standaloneParsed.error?.includes('STUDIO_URL'),
    `meph_run_evals without STUDIO_URL returns clear error naming the missing env var (got ${standaloneText.slice(0, 150)})`);

  // --- 6b. With STUDIO_URL pointing at a mock server: proxy round-trips
  const { createServer } = await import('http');
  let lastProxyRequest = null;
  const mockStudio = createServer((req, res) => {
    // Only serve /api/run-eval for this test; everything else is 404.
    if (req.method !== 'POST' || req.url !== '/api/run-eval') {
      res.writeHead(404); res.end(); return;
    }
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        lastProxyRequest = JSON.parse(body);
      } catch {
        lastProxyRequest = { parse_error: body };
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        ok: true,
        results: [
          { id: 'spec-one', status: 'pass', feedback: 'mocked' },
        ],
        passed: 1,
        failed: 0,
        duration: 123,
      }));
    });
  });
  await new Promise(r => mockStudio.listen(0, '127.0.0.1', r));
  const mockPort = mockStudio.address().port;
  process.env.STUDIO_URL = `http://127.0.0.1:${mockPort}`;

  const proxied = await dispatch({
    jsonrpc: '2.0', id: 602, method: 'tools/call',
    params: { name: 'meph_run_evals', arguments: {} },
  }, registry);
  const proxiedText = proxied.result.content[0].text;
  const proxiedParsed = JSON.parse(proxiedText);
  assert(proxiedParsed.ok === true && proxiedParsed.passed === 1,
    `meph_run_evals with STUDIO_URL round-trips the mock's response (got ${proxiedText.slice(0, 150)})`);
  assert(lastProxyRequest && typeof lastProxyRequest.source === 'string',
    `meph_run_evals forwards source to Studio /api/run-eval (got keys: ${lastProxyRequest ? Object.keys(lastProxyRequest).join(',') : 'no request'})`);
  assert(lastProxyRequest.source.includes("send 'hi'"),
    'source in the proxied request matches MCP module state from the prior meph_edit_code write');
  assert(lastProxyRequest.id === undefined,
    'meph_run_evals (full suite) does NOT send an id field');

  // --- 6c. meph_run_eval (single spec) forwards the id
  const proxiedOne = await dispatch({
    jsonrpc: '2.0', id: 603, method: 'tools/call',
    params: { name: 'meph_run_eval', arguments: { id: 'spec-one' } },
  }, registry);
  const proxiedOneText = proxiedOne.result.content[0].text;
  const proxiedOneParsed = JSON.parse(proxiedOneText);
  assert(proxiedOneParsed.ok === true,
    `meph_run_eval single-spec via proxy returns ok=true (got ${proxiedOneText.slice(0, 120)})`);
  assert(lastProxyRequest.id === 'spec-one',
    `meph_run_eval forwards the id field to Studio (got ${lastProxyRequest.id})`);

  // --- 6d. Studio returns 500 → graceful error surface
  await new Promise(r => mockStudio.close(r));
  const errServer = createServer((req, res) => {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('evalChild crashed');
  });
  await new Promise(r => errServer.listen(0, '127.0.0.1', r));
  const errPort = errServer.address().port;
  process.env.STUDIO_URL = `http://127.0.0.1:${errPort}`;
  const errResp = await dispatch({
    jsonrpc: '2.0', id: 604, method: 'tools/call',
    params: { name: 'meph_run_evals', arguments: {} },
  }, registry);
  const errText = errResp.result.content[0].text;
  const errParsed = JSON.parse(errText);
  assert(errParsed.ok === false && errParsed.error?.includes('500'),
    `meph_run_evals surfaces Studio 5xx errors as {ok:false, error} (got ${errText.slice(0, 150)})`);
  await new Promise(r => errServer.close(r));

  // --- 6e. Studio unreachable → clean proxy-failed error
  process.env.STUDIO_URL = 'http://127.0.0.1:1';  // reserved port → connection refused
  const unreach = await dispatch({
    jsonrpc: '2.0', id: 605, method: 'tools/call',
    params: { name: 'meph_run_evals', arguments: {} },
  }, registry);
  const unreachText = unreach.result.content[0].text;
  const unreachParsed = JSON.parse(unreachText);
  assert(unreachParsed.ok === false && unreachParsed.error?.includes('proxy failed'),
    `meph_run_evals surfaces unreachable Studio as "Studio proxy failed" (got ${unreachText.slice(0, 150)})`);

  // Cleanup
  delete process.env.STUDIO_URL;

  // =========================================================================
  // PHASE 7 — factorDB wiring (flywheel for cc-agent runs)
  // When cc-agent drives curriculum sweeps, each compile should log to the
  // Factor DB so the flywheel fills for free. FACTOR_DB_PATH env var tells
  // the MCP server's buildMephContext to open the DB file and wire it into
  // ctx.factorDB. Without it, ctx.factorDB stays null (current behavior).
  // =========================================================================
  console.log('\n🎡 Phase 7 — factorDB wiring in MCP server (flywheel)');

  const { mkdtempSync, rmSync, existsSync } = await import('fs');
  const { tmpdir } = await import('os');
  const { join } = await import('path');

  // Without FACTOR_DB_PATH set: factorDB stays null (backward-compat)
  const origFactorDbPath = process.env.FACTOR_DB_PATH;
  delete process.env.FACTOR_DB_PATH;
  _resetMcpState();
  _resetFactorDbCache();
  const ctxNoDb = await _testBuildMephContext();
  assert(ctxNoDb.factorDB === null,
    'without FACTOR_DB_PATH, ctx.factorDB is null (backward-compat)');

  // With FACTOR_DB_PATH pointing at a nonexistent file: factorDB stays null
  process.env.FACTOR_DB_PATH = join(tmpdir(), 'nonexistent-factor-db-' + Date.now() + '.sqlite');
  _resetMcpState();
  _resetFactorDbCache();
  const ctxMissingDb = await _testBuildMephContext();
  assert(ctxMissingDb.factorDB === null,
    `nonexistent FACTOR_DB_PATH → ctx.factorDB null (graceful, no crash). got ${ctxMissingDb.factorDB}`);

  // With FACTOR_DB_PATH pointing at a real SQLite file: factorDB opened
  const tmpDbDir = mkdtempSync(join(tmpdir(), 'mcp-factor-db-test-'));
  const tmpDbPath = join(tmpDbDir, 'test.sqlite');
  // Create the file via FactorDB's own constructor so the schema is valid
  const { FactorDB } = await import('../supervisor/factor-db.js');
  const initDb = new FactorDB(tmpDbPath);
  initDb.close?.();
  process.env.FACTOR_DB_PATH = tmpDbPath;
  _resetMcpState();
  _resetFactorDbCache();
  const ctxWithDb = await _testBuildMephContext();
  assert(ctxWithDb.factorDB !== null && ctxWithDb.factorDB !== undefined,
    `FACTOR_DB_PATH pointing at a valid DB → ctx.factorDB populated. got ${ctxWithDb.factorDB}`);
  assert(typeof ctxWithDb.factorDB?.logAction === 'function',
    'ctx.factorDB exposes logAction (the flywheel-feeding method)');

  // Cleanup
  _resetFactorDbCache();
  if (origFactorDbPath === undefined) delete process.env.FACTOR_DB_PATH;
  else process.env.FACTOR_DB_PATH = origFactorDbPath;
  try { rmSync(tmpDbDir, { recursive: true, force: true }); } catch {}

  // =========================================================================
  // PHASE 8 — run_app lifecycle in MCP mode
  // Happy-path: source → compile → run_app → http_request → stop_app.
  //
  // The MCP server runs in its own subprocess (no Studio in the loop), so
  // its buildMephContext must own the running-app state directly —
  // allocatePort, setRunningChild, getRunningChild, getRunningPort,
  // isAppRunning, stopRunningApp. Without them, MephContext defaults to
  // no-op stubs and run_app returns "ctx.allocatePort() returned null",
  // cascading into http_request's "No app running" error during cc-agent
  // curriculum sweeps.
  //
  // This test is the drift-guard: if any of those callbacks regresses to
  // the default no-op, this lifecycle test fails loudly instead of the
  // failure only surfacing on a $10 sweep run.
  // =========================================================================
  console.log('\n🚀 Phase 8 — run_app lifecycle (MCP owns the child process)');

  _resetMcpState();

  // Simple Clear backend — "build for javascript backend" forces backend-only
  // output (no HTML shell), which is what runAppTool's fallback expects when
  // `compiled.serverJS` is absent. Same shape as the L1 hello-world curriculum
  // skeleton, so we're testing the exact path cc-agent sweeps exercise.
  const simpleSource = [
    "build for javascript backend",
    "",
    "when user calls GET /api/hello:",
    "  send back { message: 'mcp-run-app-ok' }",
    "",
  ].join('\n');

  await dispatch({
    jsonrpc: '2.0', id: 800, method: 'tools/call',
    params: { name: 'meph_edit_code', arguments: { action: 'write', code: simpleSource } },
  }, registry);

  const compile8 = await dispatch({
    jsonrpc: '2.0', id: 801, method: 'tools/call',
    params: { name: 'meph_compile', arguments: {} },
  }, registry);
  const compile8Parsed = JSON.parse(compile8.result.content[0].text);
  assert(Array.isArray(compile8Parsed.errors) && compile8Parsed.errors.length === 0,
    `Phase 8: compile produces no errors (got ${JSON.stringify(compile8Parsed.errors || 'missing')})`);

  // run_app must NOT return the "allocatePort returned null" failure — that
  // was the symptom of the unwired context during the 2026-04 sweep debug.
  const runApp8 = await dispatch({
    jsonrpc: '2.0', id: 802, method: 'tools/call',
    params: { name: 'meph_run_app', arguments: {} },
  }, registry);
  const runApp8Text = runApp8.result.content[0].text;
  const runApp8Parsed = JSON.parse(runApp8Text);
  assert(!runApp8Parsed.error,
    `Phase 8: run_app does not return an error (got ${runApp8Text.slice(0, 200)})`);
  assert(runApp8Parsed.started === true,
    `Phase 8: run_app returns started:true (got ${runApp8Text.slice(0, 200)})`);
  assert(typeof runApp8Parsed.port === 'number' && runApp8Parsed.port > 0,
    `Phase 8: run_app returns a numeric port (got ${runApp8Parsed.port})`);

  // http_request must reach the running child and return 2xx.
  const http8 = await dispatch({
    jsonrpc: '2.0', id: 803, method: 'tools/call',
    params: { name: 'meph_http_request', arguments: { method: 'GET', path: '/api/hello' } },
  }, registry);
  const http8Text = http8.result.content[0].text;
  const http8Parsed = JSON.parse(http8Text);
  assert(!http8Parsed.error,
    `Phase 8: http_request does not return an error after run_app (got ${http8Text.slice(0, 200)})`);
  assert(http8Parsed.status >= 200 && http8Parsed.status < 300,
    `Phase 8: http_request returns 2xx (got status=${http8Parsed.status}, text=${http8Text.slice(0, 200)})`);

  // stop_app must kill the child cleanly — follow-up http_request should
  // go back to the "No app running" path.
  const stop8 = await dispatch({
    jsonrpc: '2.0', id: 804, method: 'tools/call',
    params: { name: 'meph_stop_app', arguments: {} },
  }, registry);
  const stop8Parsed = JSON.parse(stop8.result.content[0].text);
  assert(stop8Parsed.stopped === true,
    `Phase 8: stop_app returns stopped:true (got ${JSON.stringify(stop8Parsed)})`);

  const httpAfter = await dispatch({
    jsonrpc: '2.0', id: 805, method: 'tools/call',
    params: { name: 'meph_http_request', arguments: { method: 'GET', path: '/api/hello' } },
  }, registry);
  const httpAfterParsed = JSON.parse(httpAfter.result.content[0].text);
  assert(httpAfterParsed.error && httpAfterParsed.error.includes('No app running'),
    `Phase 8: after stop_app, http_request returns "No app running" (got ${JSON.stringify(httpAfterParsed)})`);

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

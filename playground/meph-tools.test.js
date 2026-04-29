// =============================================================================
// MEPH TOOLS — UNIT TESTS
// =============================================================================
// Verifies the pure helpers extracted from playground/server.js in GM-2 step 2.
// Both functions are referentially transparent so tests are fast and don't
// need any subprocess/HTTP/db setup.
//
// Run: node playground/meph-tools.test.js
// =============================================================================

import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { validateToolInput, describeMephTool, readFileTool, highlightCodeTool, sourceMapTool, editCodeTool, patchCodeTool, readTerminalTool, listEvalsTool, browseTemplatesTool, clickElementTool, fillInputTool, inspectElementTool, readStorageTool, readDomTool, readNetworkTool, websocketLogTool, todoTool, readActionsTool, editFileTool, stopAppTool, dbInspectTool, runCommandTool, screenshotOutputTool, runAppTool, runTestsTool, runEvalsTool, runEvalTool, httpRequestTool, compileTool, dispatchTool, _applyTestOutcomeToFactorDb } from './meph-tools.js';
import { existsSync, mkdtempSync, readFileSync as fsReadFileSync, writeFileSync as fsWriteFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { MephContext, createMephContext } from './meph-context.js';
import { compileProgram } from '../index.js';
import { patch } from '../patch.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');

let passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}`); }
}

console.log('\n📦 validateToolInput\n');

// non-object input
assert(validateToolInput('edit_code', null)?.includes('expects a JSON object'),
  'rejects null input with "expects a JSON object"');
assert(validateToolInput('edit_code', 'string')?.includes('expects a JSON object'),
  'rejects string input with "expects a JSON object"');

// edit_code
assert(validateToolInput('edit_code', { action: 'read' }) === null,
  'edit_code action=read passes');
assert(validateToolInput('edit_code', { action: 'write', code: 'foo' }) === null,
  'edit_code action=write with code passes');
assert(validateToolInput('edit_code', { action: 'write' })?.includes('"code" string'),
  'edit_code action=write without code is rejected');
assert(validateToolInput('edit_code', { action: 'invalid' })?.includes('"read", "write", or "undo"'),
  'edit_code with invalid action is rejected');

// http_request
assert(validateToolInput('http_request', { method: 'GET', path: '/api/x' }) === null,
  'http_request GET with path passes');
assert(validateToolInput('http_request', { method: 'PUT', path: '/api/x' }) === null,
  'http_request PUT with path passes');
assert(validateToolInput('http_request', { method: 'TRACE', path: '/x' })?.includes('GET/POST/PUT/DELETE/PATCH'),
  'http_request with bogus method is rejected');
assert(validateToolInput('http_request', { method: 'GET' })?.includes('"path" string'),
  'http_request without path is rejected');

// edit_file
assert(validateToolInput('edit_file', { filename: 'README.md', action: 'append' }) === null,
  'edit_file with valid action passes');
assert(validateToolInput('edit_file', { filename: 'x', action: 'delete' })?.includes('append, insert, replace, overwrite, read'),
  'edit_file with invalid action is rejected');

// todo
assert(validateToolInput('todo', { action: 'get' }) === null,
  'todo action=get passes');
assert(validateToolInput('todo', { action: 'set', todos: [{ content: 'x', status: 'pending', activeForm: 'doing x' }] }) === null,
  'todo action=set with valid todos passes');
assert(validateToolInput('todo', { action: 'set', todos: [{ content: 'x', status: 'wrong', activeForm: 'y' }] })?.includes('pending/in_progress/completed'),
  'todo with invalid status is rejected');
assert(validateToolInput('todo', { action: 'set' })?.includes('"todos" array'),
  'todo action=set without todos array is rejected');

// patch_code
assert(validateToolInput('patch_code', { operations: [{ op: 'fix_line', line: 5, replacement: 'x' }] }) === null,
  'patch_code with valid fix_line op passes');
assert(validateToolInput('patch_code', { operations: [] })?.includes('non-empty "operations"'),
  'patch_code with empty operations is rejected');
assert(validateToolInput('patch_code', { operations: [{ op: 'invalid_op' }] })?.includes('must be one of'),
  'patch_code with invalid op is rejected');
assert(validateToolInput('patch_code', { operations: [{ op: 'fix_line', line: 5 }] })?.includes('"replacement" (string)'),
  'patch_code fix_line without replacement is rejected');

// no-arg tools
for (const name of ['compile', 'run_app', 'stop_app', 'read_terminal', 'screenshot_output', 'run_tests', 'list_evals', 'run_evals', 'read_dom', 'read_actions', 'read_storage', 'source_map', 'browse_templates', 'websocket_log']) {
  assert(validateToolInput(name, {}) === null, `${name} accepts empty input`);
}

// run_eval
assert(validateToolInput('run_eval', { id: 'eval_x' }) === null, 'run_eval with id passes');
assert(validateToolInput('run_eval', {})?.includes('"id" (string)'), 'run_eval without id is rejected');

// unknown tool
assert(validateToolInput('hallucinated_tool', {})?.includes('Unknown tool'),
  'unknown tool name is rejected (no silent pass-through)');

console.log('\n📝 describeMephTool\n');

assert(describeMephTool('compile', {}) === 'compile', 'compile → "compile"');
assert(describeMephTool('edit_code', { action: 'read' }) === 'edit_code (read)',
  'edit_code action=read → "edit_code (read)"');
assert(describeMephTool('edit_code', { action: 'write', code: 'foo bar' }) === 'edit_code (write, 7 chars)',
  'edit_code action=write reports char count');
assert(describeMephTool('http_request', { method: 'POST', path: '/api/x' }) === 'http_request POST /api/x',
  'http_request reports method + path');
assert(describeMephTool('http_request', { path: '/api/y' }) === 'http_request GET /api/y',
  'http_request defaults to GET when method missing');
assert(describeMephTool('run_command', { command: 'ls -la' }) === 'run_command: ls -la',
  'run_command reports the command');
const longCmd = 'x'.repeat(200);
assert(describeMephTool('run_command', { command: longCmd }).length <= 'run_command: '.length + 120,
  'run_command truncates long commands to ~120 chars');
assert(describeMephTool('todo', { action: 'set' }) === 'todo (set)', 'todo reports action');
assert(describeMephTool('completely_new_tool', { x: 1 }) === 'completely_new_tool',
  'unknown tool name falls through to bare name');

console.log('\n📄 readFileTool\n');

// Non-allowlisted file → error
const r1 = JSON.parse(readFileTool({ filename: 'package.json' }, { rootDir: REPO_ROOT }));
assert(r1.error && r1.error.includes('Can only read'),
  'readFileTool rejects non-allowlisted file (package.json)');
assert(r1.error.includes('SYNTAX.md'), 'error message lists what IS readable');

// Missing file in allowlist → file-not-found
const r2 = JSON.parse(readFileTool({ filename: 'requests.md' }, { rootDir: '/nonexistent-dir-xyz' }));
assert(r2.error && r2.error.includes('not found'),
  'readFileTool returns "not found" when allowlisted file is absent');

// Real allowed file — SYNTAX.md
const r3 = JSON.parse(readFileTool({ filename: 'SYNTAX.md' }, { rootDir: REPO_ROOT }));
assert(r3.filename === 'SYNTAX.md', 'returns the filename');
assert(typeof r3.totalLines === 'number' && r3.totalLines > 0,
  `returns totalLines > 0 (got ${r3.totalLines})`);

// SYNTAX.md is over 800 lines → expect TOC mode
assert(r3.mode === 'toc' && typeof r3.toc === 'string' && r3.toc.length > 0,
  'large file returns TOC mode with non-empty toc string');

// Line-range mode
const r4 = JSON.parse(readFileTool({ filename: 'SYNTAX.md', startLine: 1, endLine: 5 }, { rootDir: REPO_ROOT }));
assert(r4.lines === '1-5', `line range echoed in result (got "${r4.lines}")`);
assert(typeof r4.content === 'string' && r4.content.split('\n').length === 5,
  'startLine/endLine returns exactly that range');

console.log('\n🎨 highlightCodeTool\n');

const h1 = JSON.parse(highlightCodeTool({ start_line: 5, end_line: 10 }));
assert(h1.ok === true, 'highlightCodeTool returns ok=true');
assert(h1.message.includes('5') && h1.message.includes('10'),
  'highlightCodeTool message names start and end lines');

const h2 = JSON.parse(highlightCodeTool({ start_line: 7 }));
assert(h2.ok === true, 'highlightCodeTool with no end_line still ok');
assert(h2.message.includes('7'),
  'highlightCodeTool falls back to start_line when end_line missing');

console.log('\n📦 MephContext\n');

// Defaults
const c1 = new MephContext();
assert(c1.rootDir === '.', 'MephContext default rootDir is "."');
assert(c1.source === '', 'MephContext default source is ""');
assert(Array.isArray(c1.errors) && c1.errors.length === 0, 'MephContext default errors is empty array');
assert(typeof c1.send === 'function', 'MephContext.send default is callable');

// Construction options
const c2 = new MephContext({ rootDir: '/tmp', source: 'foo' });
assert(c2.rootDir === '/tmp', 'MephContext constructor honors rootDir');
assert(c2.source === 'foo', 'MephContext constructor honors source');

// Setters fire callbacks
let sourceChangeCalled = null;
let errorsChangeCalled = null;
const c3 = new MephContext({
  source: 'old',
  onSourceChange: (s) => { sourceChangeCalled = s; },
  onErrorsChange: (e) => { errorsChangeCalled = e; },
});
c3.setSource('new');
assert(c3.source === 'new', 'setSource updates internal source');
assert(sourceChangeCalled === 'new', 'setSource fires onSourceChange callback');
c3.setErrors([{ line: 5, message: 'test' }]);
assert(c3.errors.length === 1, 'setErrors updates internal errors');
assert(errorsChangeCalled?.[0]?.message === 'test', 'setErrors fires onErrorsChange callback');

// createMephContext convenience
const c4 = createMephContext({ rootDir: '/x' });
assert(c4 instanceof MephContext, 'createMephContext returns MephContext instance');
assert(c4.rootDir === '/x', 'createMephContext passes options through');

console.log('\n🗺  sourceMapTool\n');

// No source → error
const sm1 = JSON.parse(sourceMapTool({}, new MephContext(), compileProgram));
assert(sm1.error?.includes('No code in editor'),
  'sourceMapTool with empty source returns "No code in editor" error');

// Real compile → returns mapping summary
const helloSrc = `build for javascript backend\n\nwhen user requests data from /api/health:\n  send back 'ok'`;
const sm2 = JSON.parse(sourceMapTool({}, new MephContext({ source: helloSrc }), compileProgram));
assert(sm2.result?.includes('Clear'),
  `sourceMapTool returns mapping summary mentioning Clear lines (got: ${(sm2.result || sm2.error || '').slice(0, 100)})`);

// With clear_line param → returns the snippet for that line
const sm3 = JSON.parse(sourceMapTool({ clear_line: 3 }, new MephContext({ source: helloSrc }), compileProgram));
assert(typeof (sm3.result) === 'string',
  'sourceMapTool with clear_line returns a result string');

console.log('\n✏️  editCodeTool\n');

// read action
const ec1 = JSON.parse(editCodeTool({ action: 'read' }, new MephContext({ source: 'foo bar', errors: [{ line: 1, message: 'x' }] }), compileProgram));
assert(ec1.source === 'foo bar', 'editCodeTool read returns ctx.source');
assert(ec1.errors.length === 1, 'editCodeTool read returns ctx.errors');

// write action — mutates source via setSource (captures sourceBeforeEdit)
let sourceChangeFired = null;
let errorsChangeFired = null;
const ctxWrite = new MephContext({
  source: 'old source',
  onSourceChange: (s) => { sourceChangeFired = s; },
  onErrorsChange: (e) => { errorsChangeFired = e; },
});
const writeSrc = `build for javascript backend\nwhen user requests data from /api/x:\n  send back 'ok'`;
const ec2 = JSON.parse(editCodeTool({ action: 'write', code: writeSrc }, ctxWrite, compileProgram));
assert(ec2.applied === true, 'editCodeTool write returns applied=true');
assert(Array.isArray(ec2.errors), 'editCodeTool write returns errors array from compile');
assert(Array.isArray(ec2.warnings), 'editCodeTool write returns warnings array');
assert(ctxWrite.source === writeSrc, 'editCodeTool write updates ctx.source');
assert(ctxWrite.sourceBeforeEdit === 'old source',
  'editCodeTool write captures ctx.sourceBeforeEdit (the pre-edit source)');
assert(sourceChangeFired === writeSrc,
  'editCodeTool write triggers onSourceChange callback');
assert(Array.isArray(errorsChangeFired),
  'editCodeTool write triggers onErrorsChange callback after compile');
assert(ctxWrite.lastCompileResult !== null,
  'editCodeTool write stores lastCompileResult on ctx');

// undo action
let undoSent = null;
const ctxUndo = new MephContext({
  source: 'x',
  send: (msg) => { undoSent = msg; },
});
const ec3 = JSON.parse(editCodeTool({ action: 'undo' }, ctxUndo, compileProgram));
assert(ec3.undone === true, 'editCodeTool undo returns undone=true');
assert(undoSent && undoSent.type === 'undo',
  'editCodeTool undo emits ctx.send({type:"undo"})');

// invalid action
const ec4 = JSON.parse(editCodeTool({ action: 'frobnicate' }, new MephContext(), compileProgram));
assert(ec4.error?.includes('Invalid action'),
  'editCodeTool with invalid action returns "Invalid action"');

console.log('\n🩹 patchCodeTool\n');

// Empty source → error
const pc1 = JSON.parse(patchCodeTool({ operations: [{ op: 'fix_line', line: 1, replacement: 'x' }] }, new MephContext(), patch));
assert(pc1.error?.includes('No code in editor'),
  'patchCodeTool with empty source returns "No code in editor"');

// Empty ops array → error
const pc2 = JSON.parse(patchCodeTool({ operations: [] }, new MephContext({ source: 'x' }), patch));
assert(pc2.error?.includes('operations array'),
  'patchCodeTool with empty operations array returns guidance error');

// Real patch — fix_line replaces line 2
let pcSourceFired = null;
let pcCodeUpdate = null;
const ctxPatch = new MephContext({
  source: 'line one\nline two\nline three',
  send: (msg) => { if (msg.type === 'code_update') pcCodeUpdate = msg; },
  onSourceChange: (s) => { pcSourceFired = s; },
});
const pc3 = JSON.parse(patchCodeTool({
  operations: [{ op: 'fix_line', line: 2, replacement: 'NEW LINE' }],
}, ctxPatch, patch));
assert(pc3.applied >= 1, `patchCodeTool fix_line applied >= 1 (got ${pc3.applied})`);
assert(typeof pc3.totalLines === 'number', 'patchCodeTool returns totalLines');
assert(ctxPatch.source.includes('NEW LINE'),
  'patchCodeTool fix_line mutates ctx.source');
assert(ctxPatch.sourceBeforeEdit === 'line one\nline two\nline three',
  'patchCodeTool fix_line captures sourceBeforeEdit');
assert(pcSourceFired === ctxPatch.source,
  'patchCodeTool fires onSourceChange on successful apply');
assert(pcCodeUpdate && pcCodeUpdate.type === 'code_update',
  'patchCodeTool emits ctx.send({type:"code_update"}) on successful apply');

console.log('\n📺 readTerminalTool\n');

// Empty buffers
const rt1 = JSON.parse(readTerminalTool({}, new MephContext()));
assert(rt1.terminal === '', 'readTerminalTool with empty buffers returns empty terminal string');
assert(Array.isArray(rt1.frontendErrors) && rt1.frontendErrors.length === 0,
  'readTerminalTool returns empty frontendErrors array');

// Populated buffers
const lines = Array.from({ length: 100 }, (_, i) => `line-${i}`);
const errors = Array.from({ length: 30 }, (_, i) => ({ line: i, message: `err-${i}` }));
const rt2 = JSON.parse(readTerminalTool({}, new MephContext({ terminal: lines, frontendErrors: errors })));
const termLines = rt2.terminal.split('\n');
assert(termLines.length === 80, `readTerminalTool slices last 80 terminal lines (got ${termLines.length})`);
assert(termLines[0] === 'line-20', 'readTerminalTool keeps the most recent 80 (drops first 20 of 100)');
assert(rt2.frontendErrors.length === 20, 'readTerminalTool slices last 20 frontendErrors');
assert(rt2.frontendErrors[0].line === 10, 'readTerminalTool keeps the most recent 20 errors');

console.log('\n📊 listEvalsTool\n');

// compileForEval returns ok=false → forwarded
const le1 = JSON.parse(listEvalsTool({}, new MephContext({ source: 'invalid' }),
  (src) => ({ ok: false, errors: ['nope'] })));
assert(le1.ok === false, 'listEvalsTool forwards compileForEval errors');

// compileForEval returns ok=true with eval suite
const fakeCompiler = (src) => ({ ok: true, compiled: { evalSuite: [{ id: 'e1' }, { id: 'e2' }, { id: 'e3' }] } });
const le2 = JSON.parse(listEvalsTool({}, new MephContext({ source: 'src' }), fakeCompiler));
assert(le2.ok === true, 'listEvalsTool returns ok=true on success');
assert(le2.count === 3, 'listEvalsTool counts the suite entries');
assert(le2.suite.length === 3 && le2.suite[0].id === 'e1', 'listEvalsTool surfaces the suite array');

// Missing evalSuite → empty array, count 0
const le3 = JSON.parse(listEvalsTool({}, new MephContext({ source: 'src' }),
  (src) => ({ ok: true, compiled: {} })));
assert(le3.count === 0 && le3.suite.length === 0,
  'listEvalsTool defaults to empty suite when compileForEval omits evalSuite');

console.log('\n📂 browseTemplatesTool\n');

// list action — uses real apps/ directory
const bt1 = JSON.parse(browseTemplatesTool({ action: 'list' }, new MephContext({ rootDir: REPO_ROOT })));
assert(typeof bt1.count === 'number' && bt1.count > 0,
  `browseTemplatesTool list returns count > 0 (got ${bt1.count})`);
assert(Array.isArray(bt1.templates) && bt1.templates[0].name && typeof bt1.templates[0].lines === 'number',
  'browseTemplatesTool list returns templates with name + lines');
const dealDesk = bt1.templates.find(t => t.name === 'deal-desk');
assert(dealDesk !== undefined, 'browseTemplatesTool list includes deal-desk app shipped this session');

// read action — read the deal-desk template we shipped this session
const bt2 = JSON.parse(browseTemplatesTool({ action: 'read', name: 'deal-desk' }, new MephContext({ rootDir: REPO_ROOT })));
assert(bt2.name === 'deal-desk', 'browseTemplatesTool read returns the requested template name');
assert(typeof bt2.source === 'string' && bt2.source.includes('Deal Desk'),
  'browseTemplatesTool read returns source containing the app title');

// read with no name → error
const bt3 = JSON.parse(browseTemplatesTool({ action: 'read' }, new MephContext({ rootDir: REPO_ROOT })));
assert(bt3.error?.includes('Need a template name'),
  'browseTemplatesTool read without name surfaces helpful error');

// read with non-existent template
const bt4 = JSON.parse(browseTemplatesTool({ action: 'read', name: 'does-not-exist-xyz' }, new MephContext({ rootDir: REPO_ROOT })));
assert(bt4.error?.includes('not found'),
  'browseTemplatesTool read with bad name surfaces "not found"');

// invalid action
const bt5 = JSON.parse(browseTemplatesTool({ action: 'frobnicate' }, new MephContext({ rootDir: REPO_ROOT })));
assert(bt5.error?.includes('action must be'),
  'browseTemplatesTool with bad action surfaces "action must be"');

console.log('\n🌉 Bridge tools (click_element, fill_input, inspect_element, read_storage, read_dom)\n');

// All 5 bridge tools share the same shape — when isAppRunning is false,
// they short-circuit to the same NO_APP_ERR string.
for (const [tool, name] of [
  [clickElementTool, 'clickElement'],
  [fillInputTool, 'fillInput'],
  [inspectElementTool, 'inspectElement'],
  [readStorageTool, 'readStorage'],
  [readDomTool, 'readDom'],
]) {
  const r = JSON.parse(await tool({ selector: 'button.x', value: 'y' }, new MephContext()));
  assert(r.error?.includes('No app running'),
    `${name}Tool returns "No app running" when isAppRunning() is false`);
}

// When isAppRunning is true, each tool calls sendBridgeCommand with the
// expected command name and forwards the relevant input.
let recorded = null;
const ctxLive = new MephContext({
  isAppRunning: () => true,
  sendBridgeCommand: async (cmd, payload, timeoutMs) => {
    recorded = { cmd, payload, timeoutMs };
    return { ok: true, cmd };
  },
});

const clickRes = JSON.parse(await clickElementTool({ selector: '#submit' }, ctxLive));
assert(recorded.cmd === 'click', 'clickElementTool sends "click" command');
assert(recorded.payload.selector === '#submit', 'clickElementTool forwards selector');
assert(clickRes.ok === true, 'clickElementTool returns the bridge result');

const fillRes = JSON.parse(await fillInputTool({ selector: '#email', value: 'a@b.c' }, ctxLive));
assert(recorded.cmd === 'fill', 'fillInputTool sends "fill" command');
assert(recorded.payload.value === 'a@b.c', 'fillInputTool forwards value');
assert(fillRes.ok === true, 'fillInputTool returns the bridge result');

await inspectElementTool({ selector: '.thing' }, ctxLive);
assert(recorded.cmd === 'inspect', 'inspectElementTool sends "inspect" command');

await readStorageTool({}, ctxLive);
assert(recorded.cmd === 'read-storage', 'readStorageTool sends "read-storage" command');

await readDomTool({}, ctxLive);
assert(recorded.cmd === 'read-dom', 'readDomTool sends "read-dom" command');

console.log('\n📡 Buffer tools (read_network, websocket_log)\n');

// read_network — no app
const rn1 = JSON.parse(readNetworkTool({}, new MephContext()));
assert(rn1.error?.includes('Network capture'),
  'readNetworkTool returns "Network capture" error when isAppRunning false');

// read_network — populated buffer + slice + filter
const reqs = Array.from({ length: 30 }, (_, i) => ({ url: `https://api/x/${i}`, status: 200 }));
const rn2 = JSON.parse(readNetworkTool(
  { limit: 5 },
  new MephContext({ isAppRunning: () => true, networkBuffer: reqs }),
));
assert(rn2.count === 5, `readNetworkTool slices last N (got count ${rn2.count})`);
assert(rn2.requests[0].url === 'https://api/x/25', 'readNetworkTool keeps the most recent N');

const rn3 = JSON.parse(readNetworkTool(
  { limit: 50, filter: '/x/2' },
  new MephContext({ isAppRunning: () => true, networkBuffer: reqs }),
));
// Filter should match URLs containing /x/2 — that's /x/2, /x/20-29 — 11 items
assert(rn3.count === 11, `readNetworkTool filter narrows by URL substring (got ${rn3.count})`);

// read_network — limit caps at 100
const big = Array.from({ length: 200 }, (_, i) => ({ url: `u${i}`, status: 200 }));
const rn4 = JSON.parse(readNetworkTool(
  { limit: 500 },
  new MephContext({ isAppRunning: () => true, networkBuffer: big }),
));
assert(rn4.count === 100, 'readNetworkTool caps limit at 100 even when caller asks for more');

// websocket_log — no app
const ws1 = JSON.parse(websocketLogTool({}, new MephContext()));
assert(ws1.error?.includes('WebSocket capture'),
  'websocketLogTool returns "WebSocket capture" error when isAppRunning false');

// websocket_log — populated buffer + tail slice
const frames = Array.from({ length: 50 }, (_, i) => ({ payload: `frame-${i}`, dir: 'in' }));
const ws2 = JSON.parse(websocketLogTool(
  {},
  new MephContext({ isAppRunning: () => true, websocketBuffer: frames }),
));
assert(ws2.count === 20, `websocketLogTool defaults to 20 (got ${ws2.count})`);
assert(ws2.messages[0].payload === 'frame-30',
  'websocketLogTool keeps the most recent 20');

console.log('\n📝 todoTool\n');

// get
const td1 = JSON.parse(todoTool({ action: 'get' }, new MephContext({ todos: [{ content: 'x' }] })));
assert(Array.isArray(td1.todos) && td1.todos[0].content === 'x',
  'todoTool get returns ctx.todos');

// set fires onTodosChange + send
let setTodos = null;
let sentMsg = null;
const ctxTodo = new MephContext({
  send: (m) => { if (m.type === 'todo_update') sentMsg = m; },
  onTodosChange: (t) => { setTodos = t; },
});
const td2 = JSON.parse(todoTool(
  { action: 'set', todos: [{ content: 'a', status: 'pending', activeForm: 'doing a' }, { content: 'b', status: 'in_progress', activeForm: 'doing b' }] },
  ctxTodo,
));
assert(td2.ok === true, 'todoTool set returns ok=true');
assert(td2.count === 2, 'todoTool set returns count of new todos');
assert(setTodos?.length === 2, 'todoTool set fires onTodosChange callback');
assert(sentMsg?.type === 'todo_update' && sentMsg.todos.length === 2,
  'todoTool set emits ctx.send({type:"todo_update"}) with updated todos');

// set with no todos → defaults to empty array
const td3 = JSON.parse(todoTool({ action: 'set' }, new MephContext()));
assert(td3.count === 0, 'todoTool set with no todos defaults to empty');

// invalid action
const td4 = JSON.parse(todoTool({ action: 'frobnicate' }, new MephContext()));
assert(td4.error?.includes('action must be'),
  'todoTool with bad action returns "action must be"');

console.log('\n📡 readActionsTool\n');

// fetch returns actions array → sliced by limit
const fakeFetch = async (url) => ({
  json: async () => ({ actions: Array.from({ length: 30 }, (_, i) => ({ kind: 'click', i })) }),
});
const ra1 = JSON.parse(await readActionsTool({ limit: 10 },
  new MephContext({ mephActionsUrl: 'http://x' }), fakeFetch));
assert(ra1.count === 10, `readActionsTool slices to limit (got ${ra1.count})`);
assert(ra1.actions[0].i === 20, 'readActionsTool keeps the most recent N');

// limit caps at 100
const fakeFetchBig = async () => ({
  json: async () => ({ actions: Array.from({ length: 200 }, (_, i) => ({ i })) }),
});
const ra2 = JSON.parse(await readActionsTool({ limit: 500 }, new MephContext(), fakeFetchBig));
assert(ra2.count === 100, 'readActionsTool caps limit at 100');

// fetch failure → error
const fakeFetchErr = async () => { throw new Error('network down'); };
const ra3 = JSON.parse(await readActionsTool({}, new MephContext(), fakeFetchErr));
assert(ra3.error?.includes('network down'),
  'readActionsTool surfaces fetch errors as { error: ... }');

console.log('\n📁 editFileTool\n');

// Spin up a tmp dir to scribble in — we don't want test runs touching the real repo.
const tmpDir = mkdtempSync(join(tmpdir(), 'meph-tools-edit-file-'));
const tmpCtx = new MephContext({ rootDir: tmpDir });

// Missing filename
const ef1 = JSON.parse(editFileTool({}, tmpCtx));
assert(ef1.error?.includes('"filename"'),
  'editFileTool without filename returns helpful error');

// Missing action
const ef2 = JSON.parse(editFileTool({ filename: 'x.md' }, tmpCtx));
assert(ef2.error?.includes('"action"'),
  'editFileTool without action returns helpful error');

// Disallowed extension
const ef3 = JSON.parse(editFileTool({ filename: 'x.exe', action: 'append', content: 'x' }, tmpCtx));
assert(ef3.error?.includes('not allowed'),
  'editFileTool rejects disallowed extension');

// Append creates new .clear file
const ef4 = JSON.parse(editFileTool({ filename: 'app.clear', action: 'append', content: 'hello' }, tmpCtx));
assert(ef4.ok === true && ef4.appended === true, 'editFileTool append creates new .clear file');
assert(fsReadFileSync(join(tmpDir, 'app.clear'), 'utf8') === 'hello',
  'editFileTool append writes the content to disk');

// Append again adds newline separator if missing
const ef5 = JSON.parse(editFileTool({ filename: 'app.clear', action: 'append', content: 'world' }, tmpCtx));
assert(ef5.ok === true,
  'editFileTool second append succeeds');
assert(fsReadFileSync(join(tmpDir, 'app.clear'), 'utf8') === 'hello\nworld',
  'editFileTool append inserts newline between non-newline-terminated existing + new');

// Read returns content + lines
const ef6 = JSON.parse(editFileTool({ filename: 'app.clear', action: 'read' }, tmpCtx));
assert(ef6.content === 'hello\nworld', 'editFileTool read returns full content');
assert(ef6.lines === 2, `editFileTool read returns line count (got ${ef6.lines})`);

// Insert at line 2
const ef7 = JSON.parse(editFileTool({ filename: 'app.clear', action: 'insert', line: 2, content: 'middle' }, tmpCtx));
assert(ef7.ok === true && ef7.inserted === true, 'editFileTool insert succeeds');
assert(fsReadFileSync(join(tmpDir, 'app.clear'), 'utf8') === 'hello\nmiddle\nworld',
  'editFileTool insert places new line at the right index');

// Replace single occurrence
const ef8 = JSON.parse(editFileTool({ filename: 'app.clear', action: 'replace', find: 'middle', content: 'MIDDLE' }, tmpCtx));
assert(ef8.ok === true && ef8.occurrences === 1, 'editFileTool replace returns occurrences=1');
assert(fsReadFileSync(join(tmpDir, 'app.clear'), 'utf8').includes('MIDDLE'),
  'editFileTool replace updates the file');

// Replace non-existent string returns helpful error
const ef9 = JSON.parse(editFileTool({ filename: 'app.clear', action: 'replace', find: 'nothere', content: 'x' }, tmpCtx));
assert(ef9.error?.includes('not found'),
  'editFileTool replace without match returns helpful error');

// Overwrite replaces entire file
const ef10 = JSON.parse(editFileTool({ filename: 'app.clear', action: 'overwrite', content: 'new content' }, tmpCtx));
assert(ef10.ok === true && ef10.written === true, 'editFileTool overwrite succeeds');
assert(fsReadFileSync(join(tmpDir, 'app.clear'), 'utf8') === 'new content',
  'editFileTool overwrite replaces full content');

// Read non-existent file
const ef11 = JSON.parse(editFileTool({ filename: 'nope.clear', action: 'read' }, tmpCtx));
assert(ef11.error?.includes('does not exist'),
  'editFileTool read on missing file returns helpful error');

// Permission denied: trying to overwrite a non-allowlisted .md file that exists
fsWriteFileSync(join(tmpDir, 'protected.md'), 'existing protected content');
const ef12 = JSON.parse(editFileTool({ filename: 'protected.md', action: 'append', content: 'x' }, tmpCtx));
assert(ef12.error?.includes('Permission denied'),
  'editFileTool blocks writing to non-allowlisted existing .md file');

// But the same file can be READ
const ef13 = JSON.parse(editFileTool({ filename: 'protected.md', action: 'read' }, tmpCtx));
assert(ef13.content === 'existing protected content',
  'editFileTool can read non-allowlisted files (read-only access)');

// Cleanup
try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}

console.log('\n🛑 stopAppTool\n');

let stopFired = false;
const stCtx = new MephContext({ stopRunningApp: () => { stopFired = true; } });
const st1 = JSON.parse(stopAppTool({}, stCtx));
assert(st1.stopped === true, 'stopAppTool returns { stopped: true }');
assert(stopFired === true, 'stopAppTool calls ctx.stopRunningApp()');

// Idempotent: calling again still returns stopped=true
stopFired = false;
const st2 = JSON.parse(stopAppTool({}, new MephContext()));
assert(st2.stopped === true,
  'stopAppTool returns stopped=true even when stopRunningApp is the no-op default');

console.log('\n🗄  dbInspectTool\n');

// No app running
const di1 = JSON.parse(await dbInspectTool({ query: 'SELECT 1' }, new MephContext()));
assert(di1.error?.includes('No app running'),
  'dbInspectTool returns "No app running" when isAppRunning false');

// Missing query
const di2 = JSON.parse(await dbInspectTool({}, new MephContext({ isAppRunning: () => true })));
assert(di2.error?.includes('Missing query'),
  'dbInspectTool returns "Missing query" with no input.query');

// Non-SELECT query rejected
const di3 = JSON.parse(await dbInspectTool({ query: 'DROP TABLE users' },
  new MephContext({ isAppRunning: () => true })));
assert(di3.error?.includes('Only SELECT'),
  'dbInspectTool rejects non-SELECT queries');

const di4 = JSON.parse(await dbInspectTool({ query: 'INSERT INTO x VALUES (1)' },
  new MephContext({ isAppRunning: () => true })));
assert(di4.error?.includes('Only SELECT'),
  'dbInspectTool rejects INSERT');

// SELECT against non-existent buildDir
const di5 = JSON.parse(await dbInspectTool({ query: 'SELECT * FROM x' },
  new MephContext({ isAppRunning: () => true, buildDir: '/nonexistent-dir-xyz' })));
assert(di5.error?.includes('No database file'),
  'dbInspectTool returns "No database file yet" when DB file is absent');

console.log('\n💻 runCommandTool\n');

// No allowlist → rejected
const rc1 = JSON.parse(runCommandTool({ command: 'ls' }, new MephContext({ rootDir: REPO_ROOT })));
assert(rc1.error?.includes('Not allowed'),
  'runCommandTool with empty allowlist rejects everything');

// Disallowed prefix
const rc2 = JSON.parse(runCommandTool({ command: 'rm -rf /' },
  new MephContext({ rootDir: REPO_ROOT, allowedCommandPrefixes: ['ls ', 'cat '] })));
assert(rc2.error?.includes('Not allowed'),
  'runCommandTool rejects commands not matching any allowed prefix');

// Allowed prefix → executes (use node --version which is portable + fast)
const rc3 = JSON.parse(runCommandTool({ command: 'node --version' },
  new MephContext({ rootDir: REPO_ROOT, allowedCommandPrefixes: ['node '] })));
assert(rc3.exitCode === 0, `runCommandTool exec returns exitCode=0 (got ${rc3.exitCode})`);
assert(typeof rc3.stdout === 'string' && rc3.stdout.startsWith('v'),
  `runCommandTool returns stdout from the command (got ${rc3.stdout.slice(0, 30)})`);

// Failing command (node with bad arg) → captures error
const rc4 = JSON.parse(runCommandTool({ command: 'node --not-a-flag-xyz' },
  new MephContext({ rootDir: REPO_ROOT, allowedCommandPrefixes: ['node '] })));
assert(rc4.exitCode !== 0, 'runCommandTool failing command returns nonzero exitCode');
assert(typeof rc4.stderr === 'string' && rc4.stderr.length > 0,
  'runCommandTool captures stderr on failure');

console.log('\n📸 screenshotOutputTool\n');

// No app running → clear error
const ss1 = JSON.parse(await screenshotOutputTool({}, new MephContext()));
assert(ss1.error?.includes('No app running'),
  'screenshotOutputTool returns "No app running" when isAppRunning false');

// getPage throws → caught, returned as JSON error
const ss2 = JSON.parse(await screenshotOutputTool({}, new MephContext({
  isAppRunning: () => true,
  getPage: async () => { throw new Error('chromium boom'); },
})));
assert(ss2.error?.includes('Screenshot failed') && ss2.error.includes('chromium boom'),
  'screenshotOutputTool catches getPage throws and prefixes with "Screenshot failed"');

// page.screenshot throws → same error path
const ss3 = JSON.parse(await screenshotOutputTool({}, new MephContext({
  isAppRunning: () => true,
  getPage: async () => ({
    waitForLoadState: async () => {},
    screenshot: async () => { throw new Error('navigator gone'); },
  }),
})));
assert(ss3.error?.includes('Screenshot failed') && ss3.error.includes('navigator gone'),
  'screenshotOutputTool catches page.screenshot throws');

// Happy path: returns content-block array with image + caption
const fakeBuf = Buffer.from('fake-png-bytes', 'utf8');
const ss4 = await screenshotOutputTool({}, new MephContext({
  isAppRunning: () => true,
  getRunningPort: () => 4567,
  getPage: async () => ({
    waitForLoadState: async () => {},
    screenshot: async () => fakeBuf,
  }),
}));
assert(Array.isArray(ss4), 'screenshotOutputTool returns an array on success');
assert(ss4.length === 2, 'screenshotOutputTool success array has 2 entries (image + text)');
assert(ss4[0].type === 'image' && ss4[0].source?.type === 'base64',
  'screenshotOutputTool first entry is an image content block');
assert(ss4[0].source.data === fakeBuf.toString('base64'),
  'screenshotOutputTool encodes the screenshot buffer as base64');
assert(ss4[0].source.media_type === 'image/png',
  'screenshotOutputTool declares media_type image/png');
assert(ss4[1].type === 'text' && ss4[1].text.includes('localhost:4567'),
  'screenshotOutputTool caption references the running port');

// waitForLoadState throwing should NOT fail the whole screenshot — it's
// wrapped in .catch(() => {}) on purpose so chatty apps still get captured.
const ss5 = await screenshotOutputTool({}, new MephContext({
  isAppRunning: () => true,
  getRunningPort: () => 4568,
  getPage: async () => ({
    waitForLoadState: async () => { throw new Error('networkidle timeout'); },
    screenshot: async () => Buffer.from('ok', 'utf8'),
  }),
}));
assert(Array.isArray(ss5) && ss5[0].type === 'image',
  'screenshotOutputTool survives waitForLoadState throwing (it is bounded)');

console.log('\n🚀 runAppTool\n');

// No compile result → clear error, no spawn attempted
const app1 = JSON.parse(runAppTool({}, new MephContext()));
assert(app1.error?.includes('No compiled server code'),
  'runAppTool returns "No compiled server code" when lastCompileResult is null');

// lastCompileResult exists but has no serverJS/javascript → error
const app2 = JSON.parse(runAppTool({}, new MephContext({
  lastCompileResult: { html: '<h1>hi</h1>', css: '' },
})));
assert(app2.error?.includes('No compiled server code'),
  'runAppTool rejects when html present but no backend code');

// html + javascript (frontend JS, not a server) → also "No compiled server code"
// because having html means javascript is frontend code, not backend.
const app3 = JSON.parse(runAppTool({}, new MephContext({
  lastCompileResult: { html: '<h1>hi</h1>', javascript: 'console.log("client")' },
})));
assert(app3.error?.includes('No compiled server code'),
  'runAppTool treats javascript+html as frontend-only (no server code)');

// Real serverJS but no port allocator → error at allocate step
const appTmp = mkdtempSync(join(tmpdir(), 'meph-runapp-'));
const app4 = JSON.parse(runAppTool({}, new MephContext({
  lastCompileResult: { serverJS: '// noop' },
  buildDir: appTmp,
  rootDir: REPO_ROOT,
  allocatePort: () => null,
})));
assert(app4.error?.includes('no port allocator wired'),
  'runAppTool surfaces allocatePort returning null as a clear error');
try { rmSync(appTmp, { recursive: true, force: true }); } catch {}

// Happy path: spawn a trivial server that exits immediately. We're not testing
// the app behaviour — we're verifying the tool returns { started, port } shape
// and invokes the child-lifecycle callbacks in the right order.
const appTmp2 = mkdtempSync(join(tmpdir(), 'meph-runapp-'));
let childHolder = null;
let allocCalls = 0;
const appCtx = new MephContext({
  // Minimal serverJS that just exits — we don't care about the listen.
  lastCompileResult: { serverJS: 'process.exit(0);' },
  buildDir: appTmp2,
  rootDir: REPO_ROOT,
  getRunningChild: () => childHolder,
  setRunningChild: (c) => { childHolder = c; },
  allocatePort: () => { allocCalls++; return 4999; },
});
const app5 = JSON.parse(runAppTool({}, appCtx));
assert(app5.started === true, 'runAppTool returns { started: true } on happy path');
assert(app5.port === 4999, `runAppTool returns the allocated port (got ${app5.port})`);
assert(allocCalls === 1, 'runAppTool calls allocatePort exactly once per run');
// The child was registered via setRunningChild
assert(childHolder && typeof childHolder.pid === 'number',
  'runAppTool registers the spawned child via setRunningChild');
// buildDir side effects: server.js + package.json written
assert(existsSync(join(appTmp2, 'server.js')),
  'runAppTool writes the compiled backend to buildDir/server.js');
assert(existsSync(join(appTmp2, 'package.json')),
  'runAppTool writes a package.json with runtime deps');
const appPkg = JSON.parse(fsReadFileSync(join(appTmp2, 'package.json'), 'utf8'));
assert(appPkg.dependencies?.ws === '*',
  'runAppTool declares ws as a runtime dep (every compiled app needs it)');
// Cleanup: kill the child if it's still alive (process.exit(0) should've ended it but be safe)
try { if (childHolder) childHolder.kill('SIGKILL'); } catch {}
try { rmSync(appTmp2, { recursive: true, force: true }); } catch {}

console.log('\n🧪 runTestsTool\n');

// Stub parser we can verify was called (or not) — takes a string, returns
// the shape runTestsTool consumes from parseTestOutput.
const stubParser = (stdout) => ({ passed: 0, failed: 0, results: [] });

// Empty source → no-source-code error, never invokes the subprocess
const rtBuildDir = mkdtempSync(join(tmpdir(), 'meph-runtests-'));
const rtt1 = runTestsTool({}, new MephContext({ source: '', rootDir: REPO_ROOT, buildDir: rtBuildDir }), stubParser);
assert(rtt1.ok === false, 'runTestsTool empty source returns ok=false');
assert(rtt1.error?.includes('No source code'),
  'runTestsTool empty source returns "No source code" error');

// Whitespace-only source also rejected
const rtt2 = runTestsTool({}, new MephContext({ source: '   \n\t  ', rootDir: REPO_ROOT, buildDir: rtBuildDir }), stubParser);
assert(rtt2.error?.includes('No source code'),
  'runTestsTool whitespace-only source is treated as empty');
try { rmSync(rtBuildDir, { recursive: true, force: true }); } catch {}

// Parser contract: runTestsTool spreads the parser output into its return.
// Stub a parser that counts rt callbacks so we can verify it gets invoked
// with the child's stdout exactly once per run. We avoid spawning the real
// cli/clear.js here — that's covered by server.test.js's /api/run-tests
// integration test, which goes through the same runTestsTool now.
let parserCalls = 0;
const countingParser = (stdout) => {
  parserCalls++;
  return { passed: 1, failed: 0, results: [{ name: 'fake', status: 'pass' }] };
};
// Give runTestsTool an intentionally-crashable command target by pointing
// rootDir at a directory with no cli/clear.js — execSync throws, the tool's
// err-handler branch runs. We still assert duration is populated, confirming
// the tool reached the finally block without crashing the process.
const rtt4 = runTestsTool({}, new MephContext({
  source: 'database:\n  one counter with value of 0\n',
  rootDir: mkdtempSync(join(tmpdir(), 'meph-runtests-norepo-')),
  buildDir: mkdtempSync(join(tmpdir(), 'meph-runtests-build2-')),
  apiKey: null,
}), countingParser);
assert(typeof rtt4.duration === 'number' && rtt4.duration >= 0,
  `runTestsTool populates duration even on subprocess failure (got ${rtt4.duration})`);
assert(rtt4.ok === false, 'runTestsTool returns ok=false when cli/clear.js is not findable');

// ── _applyTestOutcomeToFactorDb — pure helper that owns the Factor DB
// write-through on test outcomes. Extracted from server.js:3114-3134 so
// cc-agent sweeps get the same training signal /api/chat already wrote.
// Same bug class as the http_request side-effect move that landed earlier
// this session: cross-path tool side-effects belong IN the tool. ──
console.log('\n🎡 _applyTestOutcomeToFactorDb (test-outcome → Factor DB)\n');

const { FactorDB: _FactorDB2 } = await import('./supervisor/factor-db.js');
const tdbPath = join(tmpdir(), `meph-tools-tdbtest-${Date.now()}.sqlite`);
const tdb = new _FactorDB2(tdbPath);

function freshCompileRow() {
  return tdb.logAction({
    session_id: 't-outcome-test',
    task_type: 'compile_cycle',
    compile_ok: 1,
    test_pass: 0,
  });
}
function rowAfter(id) {
  return tdb._db.prepare('SELECT test_pass, test_score FROM code_actions WHERE id = ?').get(id);
}

// (1) All-pass result → test_pass=1, test_score=1.0
{
  const rowId = freshCompileRow();
  _applyTestOutcomeToFactorDb(
    new MephContext({ factorDB: tdb, hintState: { lastFactorRowId: rowId } }),
    { ok: true, passed: 3, failed: 0 },
  );
  const r = rowAfter(rowId);
  assert(r?.test_pass === 1, `all-pass: test_pass=1 (got ${r?.test_pass})`);
  assert(r?.test_score === 1.0, `all-pass: test_score=1.0 (got ${r?.test_score})`);
}

// (2) Partial-pass result → test_pass=0 (must be all-green to earn 1),
//     test_score=passed/total. This is the critical difference from the
//     http_request side-effect: a mix of pass+fail is NOT a win, but the
//     score still reflects how close Meph got.
{
  const rowId = freshCompileRow();
  _applyTestOutcomeToFactorDb(
    new MephContext({ factorDB: tdb, hintState: { lastFactorRowId: rowId } }),
    { ok: false, passed: 2, failed: 3 },
  );
  const r = rowAfter(rowId);
  assert(r?.test_pass === 0, `partial-pass: test_pass=0 (got ${r?.test_pass})`);
  assert(Math.abs(r?.test_score - 0.4) < 0.001, `partial-pass: test_score=2/5=0.4 (got ${r?.test_score})`);
}

// (3) All-fail result → test_pass=0, test_score=0 (passed/total=0)
{
  const rowId = freshCompileRow();
  _applyTestOutcomeToFactorDb(
    new MephContext({ factorDB: tdb, hintState: { lastFactorRowId: rowId } }),
    { ok: false, passed: 0, failed: 4 },
  );
  const r = rowAfter(rowId);
  assert(r?.test_pass === 0, `all-fail: test_pass=0 (got ${r?.test_pass})`);
  assert(r?.test_score === 0, `all-fail: test_score=0 (got ${r?.test_score})`);
}

// (4) No tests ran (passed=0, failed=0) BUT ok=true → test_score=1.0
//     falls through to the "ok-with-no-tests" branch. test_pass stays 0
//     because we require at least one real test to have run.
{
  const rowId = freshCompileRow();
  _applyTestOutcomeToFactorDb(
    new MephContext({ factorDB: tdb, hintState: { lastFactorRowId: rowId } }),
    { ok: true, passed: 0, failed: 0 },
  );
  const r = rowAfter(rowId);
  assert(r?.test_pass === 0, `no-tests+ok: test_pass=0 (got ${r?.test_pass})`);
  assert(r?.test_score === 1.0, `no-tests+ok: test_score=1.0 (got ${r?.test_score})`);
}

// (5) ctx.factorDB = null → silent no-op (backwards compat for callers
//     without the flywheel wired)
{
  // Should not throw — returns undefined, leaves nothing behind.
  const result = _applyTestOutcomeToFactorDb(
    new MephContext({ factorDB: null, hintState: { lastFactorRowId: 1 } }),
    { ok: true, passed: 1, failed: 0 },
  );
  assert(result === undefined, 'null factorDB: returns undefined (no-op)');
}

// (6) No lastFactorRowId → silent no-op (compile hadn't run yet)
{
  const result = _applyTestOutcomeToFactorDb(
    new MephContext({ factorDB: tdb, hintState: { lastFactorRowId: null } }),
    { ok: true, passed: 1, failed: 0 },
  );
  assert(result === undefined, 'no lastFactorRowId: returns undefined (no-op)');
}

// Cleanup
try { tdb._db.close(); } catch {}
try { rmSync(tdbPath, { force: true }); } catch {}
try { rmSync(tdbPath + '-shm', { force: true }); } catch {}
try { rmSync(tdbPath + '-wal', { force: true }); } catch {}

console.log('\n🎯 runEvalsTool / runEvalTool\n');

// runEvalTool with missing id → structured error, never touches the suite
let suiteCalls = 0;
const fakeSuite = async (source, id, onProgress) => {
  suiteCalls++;
  onProgress({ spec_id: 'spec-1', status: 'pass' });
  return { ok: true, passed: 1, failed: 0, results: [{ id: 'spec-1', status: 'pass' }] };
};
const re1 = await runEvalTool({}, new MephContext({ source: 'x', send: () => {} }), fakeSuite);
assert(re1.ok === false && re1.error?.includes('Missing \'id\''),
  'runEvalTool returns structured error when input.id is missing');
assert(suiteCalls === 0, 'runEvalTool does NOT invoke the suite when id is missing');

// runEvalTool happy path forwards input.id into runEvalSuite
suiteCalls = 0;
let recordedId = null;
const suiteWithId = async (source, id, onProgress) => {
  suiteCalls++;
  recordedId = id;
  return { ok: true, passed: 1 };
};
const re2 = await runEvalTool({ id: 'spec-abc' },
  new MephContext({ source: 'foo', send: () => {} }), suiteWithId);
assert(re2.ok === true, 'runEvalTool returns the suite result object');
assert(recordedId === 'spec-abc', `runEvalTool forwards input.id to the suite (got ${recordedId})`);
assert(suiteCalls === 1, 'runEvalTool invokes the suite exactly once on happy path');

// runEvalsTool always passes undefined id (runs the whole suite)
suiteCalls = 0;
recordedId = 'stale';
const re3 = await runEvalsTool({}, new MephContext({ source: 'bar', send: () => {} }), suiteWithId);
assert(re3.ok === true, 'runEvalsTool returns the suite result');
assert(recordedId === undefined, `runEvalsTool passes id=undefined (got ${recordedId})`);

// runEvalsTool fires per-spec progress through ctx.send
const sends = [];
const progressSuite = async (source, id, onProgress) => {
  onProgress({ spec_id: 'a', status: 'pass' });
  onProgress({ spec_id: 'b', status: 'fail' });
  return { ok: true, passed: 1, failed: 1 };
};
await runEvalsTool({}, new MephContext({
  source: 'zzz',
  send: (ev) => sends.push(ev),
}), progressSuite);
assert(sends.length === 2, `runEvalsTool fires one ctx.send per progress event (got ${sends.length})`);
assert(sends[0].type === 'eval_row' && sends[0].spec_id === 'a',
  'runEvalsTool send events have type="eval_row" and forward progress fields');
assert(sends[1].status === 'fail', 'runEvalsTool forwards status field from progress');

console.log('\n🌐 httpRequestTool\n');

// No app running → no fetch attempted, clear error
const hr1 = JSON.parse(await httpRequestTool({ method: 'GET', path: '/api/x' },
  new MephContext()));
assert(hr1.error?.includes('No app running'),
  'httpRequestTool returns "No app running" when isAppRunning false');

// Spin up a tiny local HTTP server to exercise the happy path
const { createServer } = await import('http');
const httpSrv = createServer((req, res) => {
  let body = '';
  req.on('data', c => body += c);
  req.on('end', () => {
    // Echo back JSON so we can verify round-tripping
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ got_method: req.method, got_path: req.url, got_body: body || null }));
  });
});
await new Promise(res => httpSrv.listen(0, '127.0.0.1', res));
const hrPort = httpSrv.address().port;
const hrCtx = new MephContext({
  isAppRunning: () => true,
  getRunningPort: () => hrPort,
});

// GET — hits the echoing server, returns status + parsed JSON data
const hr2 = JSON.parse(await httpRequestTool({ method: 'GET', path: '/api/ping' }, hrCtx));
assert(hr2.status === 200, `httpRequestTool GET returns status 200 (got ${hr2.status})`);
assert(hr2.data?.got_method === 'GET' && hr2.data?.got_path === '/api/ping',
  `httpRequestTool GET reaches the right path (got ${JSON.stringify(hr2.data)})`);

// POST with a body — body is JSON-stringified before send
const hr3 = JSON.parse(await httpRequestTool({ method: 'POST', path: '/api/x', body: { name: 'meph' } }, hrCtx));
assert(hr3.status === 200, `httpRequestTool POST returns status 200 (got ${hr3.status})`);
assert(hr3.data?.got_body?.includes('"name":"meph"'),
  `httpRequestTool POST serializes body as JSON (got ${JSON.stringify(hr3.data?.got_body)})`);

// Non-JSON response → data is the raw text, not an error
const textSrv = createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('hello not-json');
});
await new Promise(res => textSrv.listen(0, '127.0.0.1', res));
const textPort = textSrv.address().port;
const hr4 = JSON.parse(await httpRequestTool({ method: 'GET', path: '/' },
  new MephContext({ isAppRunning: () => true, getRunningPort: () => textPort })));
assert(hr4.status === 200 && hr4.data === 'hello not-json',
  `httpRequestTool falls back to raw text when response is not JSON (got ${JSON.stringify(hr4)})`);

// Fetch failure → returns { error }, does not throw
const hr5 = JSON.parse(await httpRequestTool({ method: 'GET', path: '/' },
  new MephContext({ isAppRunning: () => true, getRunningPort: () => 1 })));
assert(hr5.error, `httpRequestTool returns structured error on fetch failure (got ${JSON.stringify(hr5)})`);

// Factor DB write-through: 2xx response on the running app must update
// test_pass=1 on the most recent compile row. This is the behavior that
// was only firing in server.js's /api/chat callback — moving it INTO the
// tool means cc-agent sweeps get the same training signal.
const { FactorDB: _FactorDB1 } = await import('./supervisor/factor-db.js');
const fdbPath = join(tmpdir(), `meph-tools-hrtest-${Date.now()}.sqlite`);
const fdb = new _FactorDB1(fdbPath);
const compileRowId = fdb.logAction({
  session_id: 'hr-test',
  task_type: 'compile_cycle',
  compile_ok: 1,
  test_pass: 0,
});
const hr6HintState = { lastFactorRowId: compileRowId };
const hr6Ctx = new MephContext({
  isAppRunning: () => true,
  getRunningPort: () => hrPort,
  factorDB: fdb,
  hintState: hr6HintState,
});
const hr6 = JSON.parse(await httpRequestTool({ method: 'GET', path: '/api/hello' }, hr6Ctx));
assert(hr6.status === 200, `httpRequestTool 2xx: status is 200 (got ${hr6.status})`);
const hrRow = fdb._db.prepare('SELECT test_pass, test_score FROM code_actions WHERE id = ?').get(compileRowId);
assert(hrRow?.test_pass === 1,
  `httpRequestTool 2xx updates test_pass=1 on the current compile row (got ${JSON.stringify(hrRow)})`);
assert(hrRow?.test_score >= 0.9,
  `httpRequestTool 2xx sets test_score >= 0.9 (got ${hrRow?.test_score})`);

// Non-2xx must NOT update — a 500 response is not a pass signal.
const errSrv = createServer((req, res) => { res.writeHead(500); res.end('boom'); });
await new Promise(res => errSrv.listen(0, '127.0.0.1', res));
const errPort = errSrv.address().port;
const errRowId = fdb.logAction({ session_id: 'hr-test', task_type: 'compile_cycle', compile_ok: 1, test_pass: 0 });
const errCtx = new MephContext({
  isAppRunning: () => true,
  getRunningPort: () => errPort,
  factorDB: fdb,
  hintState: { lastFactorRowId: errRowId },
});
await httpRequestTool({ method: 'GET', path: '/boom' }, errCtx);
const errRow = fdb._db.prepare('SELECT test_pass FROM code_actions WHERE id = ?').get(errRowId);
assert(errRow?.test_pass === 0,
  `httpRequestTool non-2xx leaves test_pass=0 (got ${errRow?.test_pass})`);

// A compile row with compile_ok=0 must NOT be flipped by a 2xx — it's
// a contradiction to claim tests pass on code that didn't compile. This
// mirrors the WHERE compile_ok=1 guard in the original /api/chat code.
const failedCompileRowId = fdb.logAction({ session_id: 'hr-test', task_type: 'compile_cycle', compile_ok: 0, test_pass: 0 });
const failedCtx = new MephContext({
  isAppRunning: () => true,
  getRunningPort: () => hrPort,
  factorDB: fdb,
  hintState: { lastFactorRowId: failedCompileRowId },
});
await httpRequestTool({ method: 'GET', path: '/api/hello' }, failedCtx);
const failedRow = fdb._db.prepare('SELECT test_pass FROM code_actions WHERE id = ?').get(failedCompileRowId);
assert(failedRow?.test_pass === 0,
  `httpRequestTool does not flip test_pass on a compile_ok=0 row (got ${failedRow?.test_pass})`);

// No factorDB on ctx → tool still works, does not throw
const noFdbCtx = new MephContext({
  isAppRunning: () => true,
  getRunningPort: () => hrPort,
});
const hr7 = JSON.parse(await httpRequestTool({ method: 'GET', path: '/api/hello' }, noFdbCtx));
assert(hr7.status === 200,
  `httpRequestTool works when ctx has no factorDB (got ${JSON.stringify(hr7).slice(0, 80)})`);

// Cleanup
fdb.close();
try { rmSync(fdbPath, { force: true }); } catch {}
await new Promise(res => errSrv.close(res));

// Cleanup
await new Promise(res => httpSrv.close(res));
await new Promise(res => textSrv.close(res));

console.log('\n⚙ compileTool\n');

// Helper bundle for these tests. We mock the reranker-side pieces (they
// require their own bundle format) but use REAL compileProgram from
// index.js so the parse/validate pipeline is exercised end-to-end.
const fakeSha1 = (s) => 'h' + String(s).length + ':' + (s.slice?.(0, 8) || '');
const fakeArchetype = () => 'test_archetype';
const fakeStep = () => ({ id: 'step-1', index: 0, name: 'build' });
const fakeClassifyCategory = () => 'syntax';
const noopRerank = (_bundle, _ctx, rows) => rows.slice(0);
const noopEbm = (_bundle, rows) => rows.slice(0);
const noopFeaturize = (row) => row;

const compileHelpers = {
  compileProgram,
  sha1: fakeSha1,
  currentStep: fakeStep,
  safeArchetype: fakeArchetype,
  classifyErrorCategory: fakeClassifyCategory,
  rankPairwise: noopRerank,
  rankEBM: noopEbm,
  featurizeRow: noopFeaturize,
};

// --- 1. Clean compile, no Factor DB, no include_compiled: returns shape
//       flags but NOT the compiled output (cost optimization).
const cleanSrc = "on GET '/':\n  send 'hi'\n";
const cleanCtx = new MephContext({ source: cleanSrc });
const comp1 = JSON.parse(compileTool({}, cleanCtx, compileHelpers));
assert(Array.isArray(comp1.errors) && comp1.errors.length === 0,
  `compileTool clean compile returns empty errors array (got ${JSON.stringify(comp1.errors)})`);
assert(typeof comp1.hasServerJS === 'boolean' && typeof comp1.hasHTML === 'boolean',
  'compileTool returns hasServerJS + hasHTML boolean flags');
assert(comp1.serverJS === undefined && comp1.javascript === undefined,
  'compileTool clean compile WITHOUT include_compiled omits compiled source from payload');

// --- 2. Clean compile + include_compiled=true: forces compiled output in
const comp2 = JSON.parse(compileTool({ include_compiled: true }, cleanCtx, compileHelpers));
assert(comp2.serverJS !== undefined || comp2.javascript !== undefined,
  `compileTool include_compiled=true embeds compiled output even on clean compile (got keys: ${Object.keys(comp2).join(',')})`);

// --- 3. Failing compile: errors present, compiled output auto-included
//       (TIER 2 #12 — Meph was debugging blind; now gets javascript/serverJS
//       embedded whenever errors exist, without needing include_compiled=true)
const brokenSrc = `target: backend
when user calls GET /api/x:
  foo = nonexistent_var
  send back foo`;
const brokenCtx = new MephContext({ source: brokenSrc });
const comp3 = JSON.parse(compileTool({}, brokenCtx, compileHelpers));
assert(comp3.errors.length > 0,
  `compileTool surfaces compile errors (got ${comp3.errors.length})`);
assert(comp3.javascript !== undefined || comp3.serverJS !== undefined,
  `compileTool AUTO-includes compiled source on errors so Meph can debug (got keys: ${Object.keys(comp3).join(',')})`);
assert(typeof comp3.note === 'string' && /errors/i.test(comp3.note),
  `compileTool annotates why compiled output is included on error (got note: ${JSON.stringify(comp3.note)})`);

// --- 4. "Example:" stripping from error messages
const brokenCtxEx = new MephContext({ source: 'database:\n  bogus syntax garbage line\n' });
const comp4 = JSON.parse(compileTool({}, brokenCtxEx, compileHelpers));
for (const e of comp4.errors) {
  assert(!/\nExample:|\s+Example:/i.test(String(e.message || '')),
    `compileTool strips "Example:" blocks from error messages (found in: ${String(e.message).slice(0, 80)})`);
}

// --- 5. Warning cap: fake a compile that emits >3 warnings. We can't easily
//       force real warnings, so we patch compileProgram via helpers.
let warningsCapHelpers = {
  ...compileHelpers,
  compileProgram: (s) => ({
    errors: [],
    warnings: [
      { message: 'w1' }, { message: 'w2' }, { message: 'w3' },
      { message: 'w4' }, { message: 'w5' },
    ],
  }),
};
const comp5 = JSON.parse(compileTool({}, new MephContext({ source: 'x' }), warningsCapHelpers));
assert(comp5.warnings.length === 3,
  `compileTool caps warnings at 3 (got ${comp5.warnings.length})`);
assert(comp5.warningsTruncated === 2,
  `compileTool reports warningsTruncated=2 when 5 total warnings (got ${comp5.warningsTruncated})`);

// --- 6. Factor DB: logAction called on every compile; lastFactorRowId mirrored
let loggedActions = [];
const fakeFactorDB = {
  logAction: (row) => { loggedActions.push(row); return 777; },
  querySuggestions: () => [],
  _db: { prepare: () => ({ get: () => null }) },
};
const hrFdbCtx = new MephContext({
  source: cleanSrc,
  factorDB: fakeFactorDB,
  sessionId: 'sess-abc',
});
const comp6 = JSON.parse(compileTool({}, hrFdbCtx, compileHelpers));
assert(loggedActions.length === 1,
  `compileTool invokes factorDB.logAction exactly once (got ${loggedActions.length})`);
assert(loggedActions[0].session_id === 'sess-abc',
  `compileTool logAction carries sessionId (got ${loggedActions[0].session_id})`);
assert(loggedActions[0].compile_ok === 1,
  'compileTool logAction records compile_ok=1 for clean compile');
assert(hrFdbCtx.hintState.lastFactorRowId === 777,
  `compileTool mirrors logAction return into hintState.lastFactorRowId (got ${hrFdbCtx.hintState.lastFactorRowId})`);

// --- 7. Factor DB + errors + hint rows: hints attached to result
let querySuggestionCalls = 0;
const hintRow = {
  tier: 'exact_error_same_archetype',
  patch_summary: 'added auth guard',
  source_before: 'app: "hello"\n',
  test_score: 1,
  session_id: 'prev-sess',
  created_at: 1,
  pairwise_score: 0.87,
};
const fdbWithHints = {
  logAction: () => 888,
  querySuggestions: () => { querySuggestionCalls++; return [hintRow]; },
  _db: { prepare: () => ({ get: () => null }) },
};
const hintCtx = new MephContext({
  source: 'database:\n  bogus garbage\n',
  factorDB: fdbWithHints,
  sessionId: 'sess-hint',
  pairwiseBundle: { weights: 'fake' },
});
const comp7 = JSON.parse(compileTool({}, hintCtx, compileHelpers));
assert(querySuggestionCalls === 1,
  `compileTool with errors + factorDB calls querySuggestions once (got ${querySuggestionCalls})`);
assert(comp7.hints && typeof comp7.hints.text === 'string',
  `compileTool attaches hints.text when hint rows present (got ${comp7.hints ? 'yes' : 'no'})`);
assert(comp7.hints.text.includes('SAME ERROR in same archetype'),
  'compileTool hints.text includes tier label for exact_error_same_archetype rows');
assert(comp7.hints.reranked_by === 'pairwise',
  `compileTool marks reranked_by=pairwise when pairwiseBundle present (got ${comp7.hints.reranked_by})`);
assert(hintCtx.hintState.hintsInjectedRowId === 888,
  `compileTool updates hintsInjectedRowId when hints attached (got ${hintCtx.hintState.hintsInjectedRowId})`);
assert(hintCtx.hintState.hintsInjectedTier === 'exact_error_same_archetype',
  'compileTool records top-hint tier in hintState');

// --- 8. Reranker fallback: EBM used when pairwise fails / is absent
const ebmCtx = new MephContext({
  source: 'database:\n  bogus garbage\n',
  factorDB: fdbWithHints,
  sessionId: 'sess-ebm',
  ebmBundle: { weights: 'fake' },
});
const comp8 = JSON.parse(compileTool({}, ebmCtx, compileHelpers));
assert(comp8.hints?.reranked_by === 'ebm',
  `compileTool falls back to EBM when only ebmBundle present (got ${comp8.hints?.reranked_by})`);

// --- 9. No reranker: hints stay in BM25 order
const bm25Ctx = new MephContext({
  source: 'database:\n  bogus garbage\n',
  factorDB: fdbWithHints,
  sessionId: 'sess-bm25',
});
const comp9 = JSON.parse(compileTool({}, bm25Ctx, compileHelpers));
assert(comp9.hints?.reranked_by === 'bm25',
  `compileTool reports reranked_by=bm25 when no reranker bundle (got ${comp9.hints?.reranked_by})`);

// --- 9b. CLEAR_HINT_DISABLE=1 env flag short-circuits hint retrieval
// Session 44 / Track 1.2: enables honest A/B measurement of hint effect on
// Meph's live pass rate. Passive/observational data is confounded by
// selection bias (hints fire on hard tasks), so observational "with hints
// passes less" is uninterpretable. Forcing hint-off via env lets a sweep
// control the variable cleanly. Must skip querySuggestions entirely so
// the hint-off condition pays zero DB-query / ranker cost and the A/B
// measures hint *effect*, not hint *compute overhead*.
const origHintDisable = process.env.CLEAR_HINT_DISABLE;
process.env.CLEAR_HINT_DISABLE = '1';
let disabledQueryCalls = 0;
const fdbDisabled = {
  logAction: () => 900,
  querySuggestions: () => { disabledQueryCalls++; return [hintRow]; },
  _db: { prepare: () => ({ get: () => null }) },
};
const disabledCtx = new MephContext({
  source: 'database:\n  bogus garbage\n',
  factorDB: fdbDisabled,
  sessionId: 'sess-disabled',
  pairwiseBundle: { weights: 'fake' },
});
const compDisabled = JSON.parse(compileTool({}, disabledCtx, compileHelpers));
assert(!compDisabled.hints,
  `CLEAR_HINT_DISABLE=1 strips hints from compile result (got ${compDisabled.hints ? JSON.stringify(compDisabled.hints).slice(0, 80) : 'none'})`);
assert(disabledQueryCalls === 0,
  `CLEAR_HINT_DISABLE=1 skips querySuggestions entirely (got ${disabledQueryCalls} calls; zero avoids ranker/DB load on hint-off condition)`);
assert(disabledCtx.hintState.hintsInjectedRowId === null,
  'CLEAR_HINT_DISABLE=1 leaves hintState clean (no injection recorded)');
if (origHintDisable === undefined) delete process.env.CLEAR_HINT_DISABLE;
else process.env.CLEAR_HINT_DISABLE = origHintDisable;

// And: when the flag is back off (unset or != '1'), hints flow normally.
// Guards against a regression where the flag check accidentally inverts.
delete process.env.CLEAR_HINT_DISABLE;
let renabledQueryCalls = 0;
const fdbReenabled = {
  logAction: () => 901,
  querySuggestions: () => { renabledQueryCalls++; return [hintRow]; },
  _db: { prepare: () => ({ get: () => null }) },
};
const renabledCtx = new MephContext({
  source: 'database:\n  bogus garbage\n',
  factorDB: fdbReenabled,
  sessionId: 'sess-renabled',
  pairwiseBundle: { weights: 'fake' },
});
const compReenabled = JSON.parse(compileTool({}, renabledCtx, compileHelpers));
assert(renabledQueryCalls === 1,
  `flag unset: querySuggestions called as normal (got ${renabledQueryCalls})`);
assert(compReenabled.hints && compReenabled.hints.text,
  'flag unset: hints flow through normally (no inversion regression)');
if (origHintDisable !== undefined) process.env.CLEAR_HINT_DISABLE = origHintDisable;

// --- 10. Inference fallback: postHintMinErrorCount tracks drops after hint-serve
const dropCtx = new MephContext({
  source: 'database:\n  bogus garbage\n',
  factorDB: {
    logAction: () => 999,
    querySuggestions: () => [],
    _db: { prepare: () => ({ get: () => null }) },
  },
  sessionId: 'sess-drop',
  // Pretend hints were served on row 555 in a prior compile
  hintState: {
    lastFactorRowId: null,
    hintsInjectedRowId: 555,
    hintsInjectedErrorCount: 5,
    hintsInjectedTier: 'exact_error',
    postHintMinErrorCount: null,
  },
});
compileTool({}, dropCtx, compileHelpers);
assert(typeof dropCtx.hintState.postHintMinErrorCount === 'number',
  `compileTool updates postHintMinErrorCount on post-hint compile (got ${dropCtx.hintState.postHintMinErrorCount})`);

// --- 11. compileProgram throws → { error: message }
const throwingHelpers = {
  ...compileHelpers,
  compileProgram: () => { throw new Error('synthetic compile crash'); },
};
const comp11 = JSON.parse(compileTool({}, new MephContext({ source: 'x' }), throwingHelpers));
assert(comp11.error?.includes('synthetic compile crash'),
  `compileTool catches compiler throws and returns { error } (got ${JSON.stringify(comp11)})`);

// =====================================================================
// editCodeTool — hint pipeline integration (cycle 2 of the cc-agent fix)
// Closes the gap where cc-agent's edit_code auto-compile bypassed the
// hint retrieval entirely. With the full helpers bag passed, edit_code
// now calls attachHintsForCompileResult and ships hints back to Meph.
// =====================================================================

// edit_code with full helpers + factorDB + a compile error should fire hints
let editQuerySuggestionCalls = 0;
const editHintRow = {
  tier: 'exact_error_same_archetype',
  patch_summary: 'fixed by adding the missing variable',
  source_before: 'database is local memory\nset name = "demo"\n',
  test_score: 1,
  session_id: 'past-sess-edit',
  created_at: 1,
  pairwise_score: 0.91,
};
const fdbForEdit = {
  logAction: () => 1234,
  querySuggestions: () => { editQuerySuggestionCalls++; return [editHintRow]; },
  _db: { prepare: () => ({ get: () => null }) },
};
const editCtx = new MephContext({
  source: '',
  factorDB: fdbForEdit,
  sessionId: 'edit-test-sess',
  pairwiseBundle: { weights: 'fake' },
});
// Pass the FULL helpers bag (the cc-agent dispatch path), not just compileProgram
const editResult = JSON.parse(editCodeTool(
  { action: 'write', code: 'database:\n  bogus garbage\n' },
  editCtx,
  compileHelpers
));
assert(editQuerySuggestionCalls === 1,
  `edit_code with errors + factorDB calls querySuggestions once via the helper (got ${editQuerySuggestionCalls})`);
assert(editResult.hints && typeof editResult.hints.text === 'string',
  `edit_code attaches hints.text when called via dispatch with errors (got ${editResult.hints ? 'yes' : 'no'})`);
assert(editResult.hints.text.includes('SAME ERROR in same archetype'),
  'edit_code hint text includes tier label for exact_error_same_archetype rows');

// edit_code with bare compileProgram (legacy test call site) should NOT fire hints
let legacyQueryCalls = 0;
const fdbLegacy = {
  logAction: () => 5678,
  querySuggestions: () => { legacyQueryCalls++; return [editHintRow]; },
  _db: { prepare: () => ({ get: () => null }) },
};
const legacyCtx = new MephContext({
  source: '',
  factorDB: fdbLegacy,
  sessionId: 'legacy-sess',
});
// Pass JUST compileProgram (the old shape)
const legacyResult = JSON.parse(editCodeTool(
  { action: 'write', code: 'database:\n  garbage\n' },
  legacyCtx,
  compileProgram
));
assert(legacyQueryCalls === 0,
  `edit_code with bare compileProgram (legacy) does NOT fire hint retrieval (got ${legacyQueryCalls} calls)`);
assert(!legacyResult.hints,
  `edit_code legacy call site keeps {applied,errors,warnings} shape with no hints field (got ${legacyResult.hints ? 'unexpected hints' : 'clean'})`);

// edit_code with no compile errors should NOT fire hints (querySuggestions guard)
let editCleanQueryCalls = 0;
const editFdbClean = {
  logAction: () => 9999,
  querySuggestions: () => { editCleanQueryCalls++; return []; },
  _db: { prepare: () => ({ get: () => null }) },
};
const editCleanCtx = new MephContext({
  source: '',
  factorDB: editFdbClean,
  sessionId: 'clean-edit-sess',
});
const editCleanResult = JSON.parse(editCodeTool(
  { action: 'write', code: 'show "hello"\n' },
  editCleanCtx,
  compileHelpers
));
assert(editCleanQueryCalls === 0,
  `edit_code with clean compile (no errors) does NOT fire hint retrieval (got ${editCleanQueryCalls} calls)`);

console.log('\n🧭 dispatchTool\n');

// Unknown tool names are caught by the validator (schemaError path) BEFORE
// dispatchTool's default case runs. This is the stronger guard — we don't
// want an unknown tool to silently run; we want a clear rejection.
const dt1 = JSON.parse(await dispatchTool('definitely_not_a_tool', {},
  new MephContext(), {}));
assert(dt1.schemaError === true && dt1.error?.includes('Unknown tool'),
  `dispatchTool rejects unknown tool names with schemaError=true (got ${JSON.stringify(dt1)})`);

// Schema error: unknown input shape is rejected up front
const dt2 = JSON.parse(await dispatchTool('edit_code', { action: 'write' },
  new MephContext(), { compileProgram: () => ({ errors: [], warnings: [] }) }));
assert(dt2.schemaError === true && dt2.error?.includes('"code" string'),
  'dispatchTool returns { schemaError: true } when validateToolInput rejects input');

// Routing: highlight_code (stateless, lightest tool) goes through and returns ack
const dt3 = JSON.parse(await dispatchTool('highlight_code', { start_line: 3, end_line: 5 },
  new MephContext(), {}));
assert(dt3.ok === true, `dispatchTool routes highlight_code and returns ack (got ${JSON.stringify(dt3)})`);

// Routing: read_file succeeds against the real repo. SYNTAX.md may be small
// enough for full content OR large enough to return a TOC — both shapes
// prove the routing works.
const dt4 = JSON.parse(await dispatchTool('read_file', { filename: 'SYNTAX.md' },
  new MephContext({ rootDir: REPO_ROOT }), {}));
const dt4Delivered = (typeof dt4.content === 'string' && dt4.content.length > 0)
                  || (dt4.mode === 'toc' && typeof dt4.toc === 'string');
assert(dt4Delivered,
  `dispatchTool routes read_file and returns either content or toc (got keys: ${Object.keys(dt4).join(',')})`);

// Routing: todo tool (action=get) flows through ctx
const dt5 = JSON.parse(await dispatchTool('todo', { action: 'get' },
  new MephContext({ todos: [{ content: 'x', status: 'pending', activeForm: 'doing x' }] }), {}));
assert(Array.isArray(dt5.todos) && dt5.todos.length === 1,
  `dispatchTool routes todo and reads ctx.todos (got ${JSON.stringify(dt5)})`);

// Routing: run_tests tab-switch side-effect happens through ctx.send
const dtSends = [];
const dtTmp = mkdtempSync(join(tmpdir(), 'meph-dispatch-'));
await dispatchTool('run_tests', {},
  new MephContext({
    source: '', // will short-circuit on "No source code"
    rootDir: REPO_ROOT,
    buildDir: dtTmp,
    send: (ev) => dtSends.push(ev),
  }),
  { parseTestOutput: () => ({ passed: 0, failed: 0, results: [] }) });
const hasTabSwitch = dtSends.some(e => e.type === 'switch_tab' && e.tab === 'tests');
const hasResults = dtSends.some(e => e.type === 'test_results');
assert(hasTabSwitch, `dispatchTool run_tests fires switch_tab=tests through ctx.send (got ${JSON.stringify(dtSends.map(e => e.type))})`);
assert(hasResults, 'dispatchTool run_tests fires test_results through ctx.send after the tool returns');
try { rmSync(dtTmp, { recursive: true, force: true }); } catch {}

// Routing: run_evals fires tab-switch + eval_results through ctx.send
const dtEvalSends = [];
const fakeSuiteForDispatch = async () => ({ ok: true, passed: 3, failed: 0 });
await dispatchTool('run_evals', {},
  new MephContext({ source: 'x', send: (ev) => dtEvalSends.push(ev) }),
  { runEvalSuite: fakeSuiteForDispatch });
assert(dtEvalSends.some(e => e.type === 'switch_tab' && e.tab === 'tests'),
  'dispatchTool run_evals fires switch_tab=tests');
assert(dtEvalSends.some(e => e.type === 'eval_results'),
  'dispatchTool run_evals fans out eval_results through ctx.send');

console.log(`\n${failed === 0 ? '✅' : '❌'} ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);

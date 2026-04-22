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
import { validateToolInput, describeMephTool, readFileTool, highlightCodeTool, sourceMapTool, editCodeTool, patchCodeTool, readTerminalTool, listEvalsTool, browseTemplatesTool, clickElementTool, fillInputTool, inspectElementTool, readStorageTool, readDomTool, readNetworkTool, websocketLogTool, todoTool, readActionsTool, editFileTool, stopAppTool, dbInspectTool, runCommandTool, screenshotOutputTool, runAppTool, runTestsTool, runEvalsTool, runEvalTool, httpRequestTool } from './meph-tools.js';
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

// Cleanup
await new Promise(res => httpSrv.close(res));
await new Promise(res => textSrv.close(res));

console.log(`\n${failed === 0 ? '✅' : '❌'} ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);

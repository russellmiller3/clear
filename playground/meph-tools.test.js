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
import { validateToolInput, describeMephTool, readFileTool, highlightCodeTool, sourceMapTool, editCodeTool, patchCodeTool, readTerminalTool, listEvalsTool, browseTemplatesTool } from './meph-tools.js';
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

console.log(`\n${failed === 0 ? '✅' : '❌'} ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);

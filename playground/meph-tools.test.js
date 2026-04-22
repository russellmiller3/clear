// =============================================================================
// MEPH TOOLS — UNIT TESTS
// =============================================================================
// Verifies the pure helpers extracted from playground/server.js in GM-2 step 2.
// Both functions are referentially transparent so tests are fast and don't
// need any subprocess/HTTP/db setup.
//
// Run: node playground/meph-tools.test.js
// =============================================================================

import { validateToolInput, describeMephTool } from './meph-tools.js';

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

console.log(`\n${failed === 0 ? '✅' : '❌'} ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);

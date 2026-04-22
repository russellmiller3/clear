// =============================================================================
// RUNTIME DB — direct unit tests
// =============================================================================
// Focused tests for db.js runtime behaviors that can't be reached from the
// compiler test suite. Runs as a standalone node script; uses a tmp dir so
// clear-data.db doesn't collide with the repo's real DB file.
//
// Run: node runtime/db.test.cjs
// =============================================================================

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), 'clear-dbtest-'));
const origCwd = process.cwd();
process.chdir(tmpdir);

let passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; console.log('  \u2713 ' + msg); }
  else { failed++; console.log('  \u2717 ' + msg); }
}

const db = require('./db.js');

// Reusable table setup
db.createTable('widgets', { name: { type: 'text' }, qty: { type: 'number' } });

// ── db.update rejects record without id — Session 42 tick 6 fix ──
// Silent return-0 used to hide Meph's common mistake:
//   initial = { value: 0 }
//   save initial to Counters    ← compiles to db.update, silent no-op
// Now throws so the Clear error wrapper surfaces a helpful message.
try {
  db.update('widgets', { name: 'gadget', qty: 5 });
  assert(false, 'db.update({no-id}) throws instead of silent 0');
} catch (err) {
  assert(err instanceof Error, 'db.update({no-id}) throws an Error');
  assert(err.status === 400, 'thrown error carries status=400');
  assert(/as new/.test(err.message), 'error message points Meph at "as new" form');
  assert(/id/.test(err.message), 'error message names the missing "id" field');
}

// ── db.update still works with record.id (existing row) ──
const inserted = db.insert('widgets', { name: 'thingamajig', qty: 2 });
assert(typeof inserted.id === 'number', 'insert returns record with id');

inserted.qty = 99;
const changed = db.update('widgets', inserted);
assert(changed === 1, 'db.update on existing row updates 1 row');

// ── db.update with filter+data form (convention 2) unchanged ──
const filterResult = db.update('widgets', { id: inserted.id }, { qty: 42 });
assert(filterResult === 1, 'db.update(filter, data) still works');

// Cleanup
process.chdir(origCwd);
try { fs.rmSync(tmpdir, { recursive: true, force: true }); } catch {}

console.log('\n' + (failed === 0 ? '\u2705' : '\u274c') + ' ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed === 0 ? 0 : 1);

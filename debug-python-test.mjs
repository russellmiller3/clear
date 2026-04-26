import { compileProgram } from './index.js';
import { writeFileSync } from 'fs';
import { execSync } from 'child_process';

const src = `build for python backend
database is local memory

create a Todo table:
  title, text, required
  completed, boolean

when user sends POST /api/todos receiving todo:
  save todo as new Todo
  send back todo

when user sends GET /api/todos:
  items = get all Todos
  send back items

test 'can create todo':
  can user create a todo with title is 'Buy milk'
  can user view todos
`;

const r = compileProgram(src);
console.log('errors:', r.errors.length, 'warnings:', r.warnings.length);
for (const e of r.errors) console.log('  err:', typeof e === 'string' ? e : e.message);

const py = r.python || '';
console.log('\npython length:', py.length);
console.log('\n=== emitted python (tail 2500 chars) ===');
console.log(py.slice(-2500));

// Write out and py_compile it
writeFileSync('./tmp-test-emit.py', py);
try {
  execSync('python3 -m py_compile ./tmp-test-emit.py', { encoding: 'utf8' });
  console.log('\n✅ py_compile OK — emitted Python parses');
} catch (e) {
  console.log('\n❌ py_compile FAILED:');
  console.log(e.stdout);
  console.log(e.stderr);
}

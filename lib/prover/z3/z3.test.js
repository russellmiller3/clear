// Phase 0 smoke test: the Z3 session boots and decides ground + universal goals.
// Run: node lib/prover/z3/z3.test.js
//
// Green-wash guard (red-team P0): a forgotten `await` would leave a Promise asserted
// as if sync and silently "pass". Crashing on any unhandled rejection makes that fail loudly.
import assert from 'node:assert';
import { getZ3 } from './session.js';

process.on('unhandledRejection', (error) => {
  console.error('UNHANDLED REJECTION:', error);
  process.exit(1);
});

let passedCount = 0;
async function check(label, run) {
  await run();
  passedCount += 1;
  console.log(`  ok  ${label}`);
}

async function main() {
  const z3Context = await getZ3();

  await check('Z3 boots and the context is usable', async () => {
    assert.ok(z3Context && z3Context.Solver && z3Context.Int, 'expected a usable Z3 Context');
  });

  await check('ground fact: NOT(2+2=4) is unsat', async () => {
    const solver = new z3Context.Solver();
    solver.add(z3Context.Not(z3Context.Int.val(2).add(z3Context.Int.val(2)).eq(z3Context.Int.val(4))));
    assert.strictEqual(await solver.check(), 'unsat');
  });

  await check('universal: x+0 == x holds for all x (negation unsat)', async () => {
    const solver = new z3Context.Solver();
    const freeVar = z3Context.Int.const('x');
    solver.add(z3Context.Not(freeVar.add(z3Context.Int.val(0)).eq(freeVar)));
    assert.strictEqual(await solver.check(), 'unsat');
  });

  await check('counterexample: x*2 == x+2 is NOT universal (negation sat)', async () => {
    const solver = new z3Context.Solver();
    const freeVar = z3Context.Int.const('x');
    solver.add(z3Context.Not(freeVar.mul(z3Context.Int.val(2)).eq(freeVar.add(z3Context.Int.val(2)))));
    assert.strictEqual(await solver.check(), 'sat');
  });

  console.log(`\nZ3 smoke: ${passedCount}/4 passed.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

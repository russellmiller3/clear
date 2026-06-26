// Phase 1+2: the AST→SMT encoder + verdict mapping, with the load-bearing soundness gate.
// Run: node lib/prover/z3/encode.test.js
import assert from 'node:assert';
import { Lit, Sym, Op } from '../symbolic.js';
import { proveEquals, proveCompare } from './solve.js';

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

// numeric symbols (typed 'number') vs untyped symbols (default → string sort)
const numericA = Sym('a', 'number');
const numericB = Sym('b', 'number');
const untypedA = Sym('a');
const untypedB = Sym('b');

async function main() {
  await check('numeric a+b == b+a is PROVED for all inputs', async () => {
    const verdict = await proveEquals(Op('+', numericA, numericB), Op('+', numericB, numericA));
    assert.strictEqual(verdict.passed, true);
    assert.strictEqual(verdict.unknown, false);
  });

  await check('SOUNDNESS: untyped a+b == b+a is NOT proved — PARTIAL (the false-PROVED bug is dead)', async () => {
    // Untyped operands could be numbers OR strings. We refuse to guess: arithmetic
    // on unknown-typed values is opaque → PARTIAL ("can't prove without types"),
    // never a false PROVED. This is the exact bug fix.
    const verdict = await proveEquals(Op('+', untypedA, untypedB), Op('+', untypedB, untypedA));
    assert.strictEqual(verdict.passed, false, 'untyped commutativity must not be PROVED');
    assert.strictEqual(verdict.unknown, true, 'unknown type → PARTIAL, not a guess');
  });

  await check('literal string concat "a"+"b" == "b"+"a" FAILS (concat is not commutative)', async () => {
    const verdict = await proveEquals(Op('+', Lit('a'), Lit('b')), Op('+', Lit('b'), Lit('a')));
    assert.strictEqual(verdict.passed, false, 'string concat is decidably non-commutative');
    assert.strictEqual(verdict.unknown, false, 'literals are fully concrete → FAILED, not PARTIAL');
  });

  await check('mixed-sort 5+a == a+5 degrades to PARTIAL, no crash', async () => {
    const verdict = await proveEquals(Op('+', Lit(5), untypedA), Op('+', untypedA, Lit(5)));
    assert.strictEqual(verdict.unknown, true, 'mixed numeric+string + is ambiguous → PARTIAL');
    assert.strictEqual(verdict.passed, false);
  });

  await check('true identity (a+b)(a-b) == a*a - b*b is PROVED', async () => {
    const left = Op('*', Op('+', numericA, numericB), Op('-', numericA, numericB));
    const right = Op('-', Op('*', numericA, numericA), Op('*', numericB, numericB));
    const verdict = await proveEquals(left, right);
    assert.strictEqual(verdict.passed, true);
  });

  await check('false identity a/2 == a*2 FAILS with a counterexample', async () => {
    const verdict = await proveEquals(Op('/', numericA, Lit(2)), Op('*', numericA, Lit(2)));
    assert.strictEqual(verdict.passed, false);
    assert.strictEqual(verdict.unknown, false);
    assert.ok(verdict.observed && 'a' in verdict.observed, 'expected a counterexample for a');
  });

  await check('proveCompare: a*a >= 0 holds for all numeric a (PROVED)', async () => {
    const verdict = await proveCompare('>=', Op('*', numericA, numericA), Lit(0));
    assert.strictEqual(verdict.passed, true);
  });

  await check('proveCompare: a >= 0 does NOT hold for all a (counterexample)', async () => {
    const verdict = await proveCompare('>=', numericA, Lit(0));
    assert.strictEqual(verdict.passed, false);
    assert.strictEqual(verdict.unknown, false);
  });

  console.log(`\nEncoder + verdict: ${passedCount}/8 passed.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

// Phase 5 — differential parity oracle. The archived term-rewriter is the baseline:
// for every goal the OLD decider PROVED, the new Z3 decider must NOT downgrade to
// PARTIAL/UNKNOWN. A downgrade is a capability regression (not unsound, but weaker)
// and must be caught here, per the red-team. Run: node lib/prover/z3/parity.test.js
import assert from 'node:assert';
import { Lit, Sym, Op } from '../symbolic.js';
import { symEquals as legacyEquals } from '../legacy-symbolic/symbolic.js';
import { proveEquals } from './solve.js';

process.on('unhandledRejection', (error) => {
  console.error('UNHANDLED REJECTION:', error);
  process.exit(1);
});

const numericA = Sym('a', 'number');
const numericB = Sym('b', 'number');
const numericC = Sym('c', 'number');

// Goals the old simplifier could PROVE (numeric identities). Each is [label, left, right].
const PROVABLE_GOALS = [
  ['commutativity a+b == b+a', Op('+', numericA, numericB), Op('+', numericB, numericA)],
  ['identity a+0 == a', Op('+', numericA, Lit(0)), numericA],
  ['identity a*1 == a', Op('*', numericA, Lit(1)), numericA],
  ['like terms a+a == a*2', Op('+', numericA, numericA), Op('*', numericA, Lit(2))],
  ['associativity (a+b)+c == a+(b+c)', Op('+', Op('+', numericA, numericB), numericC), Op('+', numericA, Op('+', numericB, numericC))],
  ['distributivity a*(b+c) == a*b + a*c', Op('*', numericA, Op('+', numericB, numericC)), Op('+', Op('*', numericA, numericB), Op('*', numericA, numericC))],
];

let checked = 0;
let legacyProvedCount = 0;

async function main() {
  for (const [label, left, right] of PROVABLE_GOALS) {
    const legacyVerdict = legacyEquals(left, right);   // true | false | 'unknown'
    const z3Verdict = await proveEquals(left, right);  // { passed, unknown }

    // The parity invariant: if the OLD engine PROVED it, Z3 must not be weaker (PARTIAL).
    if (legacyVerdict === true) {
      legacyProvedCount += 1;
      assert.strictEqual(
        z3Verdict.passed, true,
        `REGRESSION: "${label}" was PROVED by the legacy engine but Z3 gave ${JSON.stringify(z3Verdict)}`,
      );
      assert.strictEqual(z3Verdict.unknown, false, `REGRESSION: "${label}" downgraded to PARTIAL`);
    }
    checked += 1;
    console.log(`  ok  ${label}  (legacy=${legacyVerdict}, z3.passed=${z3Verdict.passed})`);
  }

  // Guard: the corpus must actually exercise the legacy PROVED path, or the test is vacuous.
  assert.ok(legacyProvedCount >= 4, `expected the legacy engine to PROVE most goals, got ${legacyProvedCount}`);
  console.log(`\nParity: ${checked} goals checked, ${legacyProvedCount} legacy-PROVED, zero downgrades.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

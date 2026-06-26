// Z3 solver layer: prove a goal holds for ALL inputs, behind the prover's verdict shape.
//
// Proof direction (the standard SMT idiom): to prove `goal` holds for every input,
// assert its NEGATION and ask Z3 if that is satisfiable.
//   unsat   → no input violates the goal → PROVED (passed: true)
//   sat     → Z3 found a violating input → FAILED (passed: false) + counterexample
//   unknown → undecidable/timeout        → PARTIAL (unknown: true) — never a false PROVED
//
// An un-encodable goal (mixed-sort `+`, unsupported op) also maps to PARTIAL, so the
// prover degrades honestly instead of guessing.

import { getZ3 } from './session.js';
import { astToSmt, EncodeOpaque } from './ast-to-smt.js';

// A short per-query timeout so undecidable/nonlinear goals degrade to `unknown`
// instead of hanging the prover.
const QUERY_TIMEOUT_MS = 5000;

// Rebuild concrete Clear values from a Z3 counterexample model, for FAILED verdicts.
function reconstructCounterexample(model, varCache) {
  const counterexample = {};
  for (const [name, z3Const] of varCache.entries()) {
    try {
      counterexample[name] = model.eval(z3Const, true).toString();
    } catch {
      // A var the model doesn't constrain — skip it.
    }
  }
  return counterexample;
}

// Decide whether `goalExpr` (a Z3 boolean) holds for all values of the cached vars.
async function decideGoal(z3Context, goalExpr, varCache, checkKind) {
  const solver = new z3Context.Solver();
  solver.set('timeout', QUERY_TIMEOUT_MS);
  solver.add(z3Context.Not(goalExpr));
  const outcome = await solver.check();

  if (outcome === 'unsat') return { passed: true, unknown: false, check: checkKind };
  if (outcome === 'unknown') return { passed: false, unknown: true, check: checkKind };
  // sat → the negation has a model → the goal is violated by that input.
  const observed = reconstructCounterexample(solver.model(), varCache);
  return { passed: false, unknown: false, observed, check: checkKind };
}

// Wrap the encode→decide pipeline with the EncodeOpaque → PARTIAL safety net.
async function decideUniversal(buildGoal, checkKind) {
  const z3Context = await getZ3();
  const varCache = new Map();
  try {
    const goalExpr = buildGoal(z3Context, varCache);
    return await decideGoal(z3Context, goalExpr, varCache, checkKind);
  } catch (error) {
    if (error instanceof EncodeOpaque) {
      return { passed: false, unknown: true, check: checkKind, reason: error.reason };
    }
    throw error;
  }
}

/**
 * Prove `leftNode == rightNode` for all inputs.
 * @returns {Promise<{passed:boolean, unknown:boolean, observed?:object, check:string}>}
 */
export async function proveEquals(leftNode, rightNode) {
  return decideUniversal((z3Context, varCache) => {
    const left = astToSmt(leftNode, z3Context, varCache);
    const right = astToSmt(rightNode, z3Context, varCache);
    return left.eq(right);
  }, 'eq');
}

// Build the Z3 goal for a comparison, accepting both the prover's check names
// ('neq'/'gt'/'gte'/'lt'/'lte') and the raw operator forms ('<'/'<='/'>'/'>=').
function buildComparison(comparisonOp, left, right) {
  switch (comparisonOp) {
    case 'gt': case '>': return left.gt(right);
    case 'gte': case '>=': return left.ge(right);
    case 'lt': case '<': return left.lt(right);
    case 'lte': case '<=': return left.le(right);
    case 'neq': return left.neq(right);
    default: throw new EncodeOpaque(`comparison op '${comparisonOp}'`);
  }
}

/**
 * Prove the comparison `leftNode <op> rightNode` for all inputs, optionally under
 * a list of assumption nodes (each must hold for the goal to be required).
 * @param {string} comparisonOp - 'neq' | 'gt' | 'gte' | 'lt' | 'lte' (or '<','<=','>','>=').
 * @param {object[]} assumptionNodes - Clear boolean nodes assumed true on this path.
 */
export async function proveCompare(comparisonOp, leftNode, rightNode, assumptionNodes = []) {
  return decideUniversal((z3Context, varCache) => {
    const left = astToSmt(leftNode, z3Context, varCache);
    const right = astToSmt(rightNode, z3Context, varCache);
    const goal = buildComparison(comparisonOp, left, right);

    if (assumptionNodes.length === 0) return goal;
    // Goal only required where all assumptions hold: (assumptions) → goal.
    const premises = assumptionNodes.map((node) => astToSmt(node, z3Context, varCache));
    const premise = premises.length === 1 ? premises[0] : z3Context.And(...premises);
    return z3Context.Implies(premise, goal);
  }, comparisonOp);
}

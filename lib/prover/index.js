// =============================================================================
// CLEAR PROVER — Public API
// =============================================================================
//
// `prove(source)` parses a Clear program, walks every test block, and produces
// a ProofBundle showing which assertions PROVED, which FAILED with a
// counterexample, and which were UNVERIFIABLE (the function under test
// reaches an impure operation, so we refuse to make a claim).
//
// The contract: a PROVED assertion has been verified against Clear's
// source-level semantics, with no compiler in the path. The compiled
// JavaScript or Python is a separate question (the trusted compiler base).
// We never claim more than that.
// =============================================================================

import { parse } from '../../parser.js';
import {
  evaluate,
  evaluateTest,
  buildEnv,
  ImpurityError,
  UndefinedRefError,
} from './evaluator.js';
import {
  Sym, Lit,
  evaluateSymbolic, buildSymEnv, symEquals, simplify,
  symCompare,
  SymbolicLimit,
} from './symbolic.js';

/**
 * Verify all `test 'X':` blocks in a Clear program by walking the AST directly.
 *
 * @param {string} source - Clear source code.
 * @returns {ProofBundle}
 */
export function prove(source) {
  const ast = parse(source);

  if (ast.errors && ast.errors.length > 0) {
    return {
      status: 'parse_error',
      summary: 'Source did not parse — proof skipped.',
      errors: ast.errors,
      results: [],
    };
  }

  const env = buildEnv(ast);
  const results = [];

  for (const node of ast.body) {
    if (node.type !== 'test_def') continue;
    results.push(proveTest(node, env, ast));
  }

  return summarize(results);
}

// ---------------------------------------------------------------------------

function proveTest(testNode, env, ast) {
  try {
    const assertions = evaluateTest(testNode, env);
    const verdicts = assertions.map(a => verdictFor(a));
    return {
      test: testNode.name,
      line: testNode.line,
      status: overallStatus(verdicts),
      mode: 'concrete',
      assertions: verdicts,
    };
  } catch (err) {
    if (err instanceof UndefinedRefError) {
      // Test references a name with no value bound — promote it to a free
      // symbolic input and try to prove the test universally.
      return proveTestSymbolic(testNode, ast, [err.name]);
    }
    if (err instanceof ImpurityError) {
      return {
        test: testNode.name,
        line: testNode.line,
        status: 'unverifiable',
        mode: 'concrete',
        reason: err.message,
        assertions: [],
      };
    }
    return {
      test: testNode.name,
      line: testNode.line,
      status: 'error',
      mode: 'concrete',
      reason: err.message,
      assertions: [],
    };
  }
}

// ---------------------------------------------------------------------------
// Symbolic test path
// ---------------------------------------------------------------------------
//
// Triggered when concrete mode hits a free variable. We rebuild the env in
// symbolic mode, bind the offending variable to Sym(name), and re-walk the
// test. Free variables that show up later in the same walk get auto-bound
// as we encounter them.

function proveTestSymbolic(testNode, ast, knownFreeVars) {
  try {
    const symEnv = buildSymEnv(ast);
    const testEnv = {
      vars: new Map(),
      functions: symEnv.functions,
      freeVars: new Set(),
      returnValue: Lit(null),
    };
    // Pre-bind known free variables to symbolic placeholders.
    for (const name of knownFreeVars) {
      testEnv.vars.set(name, Sym(name));
      testEnv.freeVars.add(name);
    }

    const verdicts = [];
    for (const stmt of testNode.body) {
      if (stmt.type === 'unit_assert') {
        const left  = evaluateSymbolic(stmt.left,  testEnv);
        const right = evaluateSymbolic(stmt.right, testEnv);
        const verdict = symVerdict(stmt.check, left, right);
        verdicts.push({
          line: stmt.line,
          ...verdict,
        });
      } else if (stmt.type === 'expect') {
        const value = evaluateSymbolic(stmt.expression, testEnv);
        const simplified = simplify(value);
        const truthy = simplified.kind === 'lit' ? Boolean(simplified.value) : 'unknown';
        verdicts.push({
          line: stmt.line,
          passed: truthy === true,
          unknown: truthy === 'unknown',
          observed: simplified,
        });
      } else {
        evaluateSymbolic(stmt, testEnv);
      }
    }

    return {
      test: testNode.name,
      line: testNode.line,
      status: overallSymbolicStatus(verdicts),
      mode: 'symbolic',
      freeVars: Array.from(testEnv.freeVars),
      assertions: verdicts,
    };
  } catch (err) {
    if (err instanceof SymbolicLimit) {
      return {
        test: testNode.name,
        line: testNode.line,
        status: 'unverifiable',
        mode: 'symbolic',
        reason: err.message,
        assertions: [],
      };
    }
    return {
      test: testNode.name,
      line: testNode.line,
      status: 'error',
      mode: 'symbolic',
      reason: err.message,
      assertions: [],
    };
  }
}

function symVerdict(check, left, right) {
  // For equality checks, run the simplifier-based prover. For other
  // comparisons, only succeed if both sides reduce to literals.
  if (check === 'eq') {
    const verdict = symEquals(left, right);
    if (verdict === true)  return { passed: true,  observed: simplify(left), expected: simplify(right), check };
    if (verdict === false) return { passed: false, observed: simplify(left), expected: simplify(right), check };
    return { passed: false, unknown: true, observed: simplify(left), expected: simplify(right), check };
  }
  if (['neq', 'gt', 'gte', 'lt', 'lte'].includes(check)) {
    const verdict = symCompare(check, left, right);
    if (verdict === true)  return { passed: true,  observed: simplify(left), expected: simplify(right), check };
    if (verdict === false) return { passed: false, observed: simplify(left), expected: simplify(right), check };
  }
  return { passed: false, unknown: true, observed: simplify(left), expected: simplify(right), check };
}

function overallSymbolicStatus(verdicts) {
  if (verdicts.length === 0)                                 return 'empty';
  if (verdicts.some(v => v.passed === false && !v.unknown))  return 'failed';
  if (verdicts.some(v => v.unknown))                         return 'partial';
  if (verdicts.every(v => v.passed))                         return 'proved';
  return 'partial';
}

function verdictFor(assertion) {
  // The evaluator returns either a structured assertion object (from unit_assert)
  // or a raw value (from expect <truthy>).
  const { result, line, sourceShape } = assertion;

  if (sourceShape === 'unit_assert' && result && result.kind === 'assertion') {
    const { left, check, right } = result;
    const passed = applyCheck(check, left, right);
    return {
      line,
      passed,
      observed: left,
      expected: right,
      check,
    };
  }

  // expect <truthy>
  return {
    line,
    passed: Boolean(result),
    observed: result,
  };
}

function applyCheck(check, left, right) {
  switch (check) {
    case 'eq':           return left === right;
    case 'neq':          return left !== right;
    case 'gt':           return left > right;
    case 'gte':          return left >= right;
    case 'lt':           return left < right;
    case 'lte':          return left <= right;
    case 'contains':
      if (typeof left === 'string') return left.includes(right);
      if (Array.isArray(left))      return left.includes(right);
      return false;
    case 'not_contains':
      if (typeof left === 'string') return !left.includes(right);
      if (Array.isArray(left))      return !left.includes(right);
      return true;
    default:
      return false;
  }
}

function overallStatus(verdicts) {
  if (verdicts.length === 0)              return 'empty';
  if (verdicts.every(v => v.passed))      return 'proved';
  return 'failed';
}

function summarize(results) {
  const proved       = results.filter(r => r.status === 'proved').length;
  const failed       = results.filter(r => r.status === 'failed').length;
  const partial      = results.filter(r => r.status === 'partial').length;
  const unverifiable = results.filter(r => r.status === 'unverifiable').length;
  const errored      = results.filter(r => r.status === 'error').length;

  // Status precedence: any failed → failed; any errored → error; any partial
  // (symbolic UNKNOWN) → partial; only unverifiable + nothing proved → unverifiable;
  // anything left over with proved + unverifiable mix → partial; only proved → proved.
  let status;
  if (failed > 0)                                  status = 'failed';
  else if (errored > 0)                            status = 'error';
  else if (partial > 0)                            status = 'partial';
  else if (unverifiable > 0 && proved === 0)       status = 'unverifiable';
  else if (unverifiable > 0)                       status = 'partial';
  else if (proved > 0)                             status = 'proved';
  else                                             status = 'empty';

  return {
    status,
    summary: humanSummary({ proved, failed, partial, unverifiable, errored, total: results.length }),
    counts: { proved, failed, partial, unverifiable, errored, total: results.length },
    results,
  };
}

function humanSummary({ proved, failed, partial, unverifiable, errored, total }) {
  if (total === 0) return 'No tests in the program — nothing to prove.';
  const parts = [];
  if (proved > 0)       parts.push(`${proved} proved`);
  if (failed > 0)       parts.push(`${failed} failed`);
  if (partial > 0)      parts.push(`${partial} unknown (simplifier could not decide)`);
  if (unverifiable > 0) parts.push(`${unverifiable} unverifiable (impure)`);
  if (errored > 0)      parts.push(`${errored} errored`);
  return parts.join(', ');
}

// =============================================================================
// EXPORTED FORMATTERS
// =============================================================================

/**
 * Render a ProofBundle as plain English suitable for the chat panel
 * or the auditor-facing bundle. Trades JSON's precision for readability.
 */
export function formatBundle(bundle) {
  const lines = [];
  lines.push(`Clear Proof Bundle`);
  lines.push(`==================`);
  lines.push(`Status: ${bundle.status.toUpperCase()}`);
  lines.push(`Summary: ${bundle.summary}`);
  lines.push('');

  if (bundle.errors && bundle.errors.length > 0) {
    lines.push('Parse errors:');
    for (const e of bundle.errors) {
      lines.push(`  - line ${e.line}: ${e.message}`);
    }
    return lines.join('\n');
  }

  for (const r of bundle.results) {
    const badge =
      r.status === 'proved'       ? 'PROVED'    :
      r.status === 'failed'       ? 'FAILED'    :
      r.status === 'partial'      ? 'UNKNOWN'   :
      r.status === 'unverifiable' ? 'SKIPPED'   :
      r.status === 'empty'        ? 'EMPTY'     :
                                    'ERROR';
    const modeTag = r.mode === 'symbolic' ? ' [symbolic]' : '';
    lines.push(`[${badge}]${modeTag} ${r.test} (line ${r.line})`);
    if (r.freeVars && r.freeVars.length > 0) {
      lines.push(`  for any: ${r.freeVars.join(', ')}`);
    }
    if (r.reason) lines.push(`  ${r.reason}`);
    for (const a of r.assertions) {
      const mark = a.unknown ? '?' : (a.passed ? '✓' : '✗');
      lines.push(`  ${mark} line ${a.line}: ${describeAssertion(a)}${a.unknown ? ' — simplifier cannot decide' : ''}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

function describeAssertion(a) {
  if (a.expected !== undefined) {
    const opWord = describeCheck(a.check);
    return `expected ${formatValue(a.observed)} ${opWord} ${formatValue(a.expected)}`;
  }
  return `expected ${formatValue(a.observed)} to be true`;
}

function describeCheck(check) {
  switch (check) {
    case 'eq':           return '===';
    case 'neq':          return '!==';
    case 'gt':           return '>';
    case 'gte':          return '>=';
    case 'lt':           return '<';
    case 'lte':          return '<=';
    case 'contains':     return 'to contain';
    case 'not_contains': return 'to NOT contain';
    default:             return check;
  }
}

function formatValue(v) {
  // Symbolic values come through as { kind: 'lit'|'sym'|'op', ... }
  if (v && typeof v === 'object' && v.kind) return formatSymbolic(v);
  if (typeof v === 'string') return `'${v}'`;
  if (v === null) return 'nothing';
  if (Array.isArray(v))  return `[${v.map(formatValue).join(', ')}]`;
  return String(v);
}

function formatSymbolic(v) {
  if (v.kind === 'lit') {
    if (typeof v.value === 'string') return `'${v.value}'`;
    if (v.value === null) return 'nothing';
    return String(v.value);
  }
  if (v.kind === 'sym') return v.name;
  if (v.kind === 'op') {
    if (v.args.length === 1) return `(${v.op} ${formatSymbolic(v.args[0])})`;
    if (v.args.length === 2) return `(${formatSymbolic(v.args[0])} ${v.op} ${formatSymbolic(v.args[1])})`;
    return `(${v.op} ${v.args.map(formatSymbolic).join(' ')})`;
  }
  return '?';
}

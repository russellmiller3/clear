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
    results.push(proveTest(node, env));
  }

  return summarize(results);
}

// ---------------------------------------------------------------------------

function proveTest(testNode, env) {
  try {
    const assertions = evaluateTest(testNode, env);
    const verdicts = assertions.map(a => verdictFor(a));
    return {
      test: testNode.name,
      line: testNode.line,
      status: overallStatus(verdicts),
      assertions: verdicts,
    };
  } catch (err) {
    if (err instanceof ImpurityError) {
      return {
        test: testNode.name,
        line: testNode.line,
        status: 'unverifiable',
        reason: err.message,
        assertions: [],
      };
    }
    if (err instanceof UndefinedRefError) {
      return {
        test: testNode.name,
        line: testNode.line,
        status: 'error',
        reason: err.message,
        assertions: [],
      };
    }
    return {
      test: testNode.name,
      line: testNode.line,
      status: 'error',
      reason: err.message,
      assertions: [],
    };
  }
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
  const unverifiable = results.filter(r => r.status === 'unverifiable').length;
  const errored      = results.filter(r => r.status === 'error').length;

  let status = 'proved';
  if (failed > 0)                       status = 'failed';
  else if (errored > 0)                 status = 'error';
  else if (unverifiable > 0 && proved === 0) status = 'unverifiable';
  else if (unverifiable > 0)            status = 'partial';

  return {
    status,
    summary: humanSummary({ proved, failed, unverifiable, errored, total: results.length }),
    counts: { proved, failed, unverifiable, errored, total: results.length },
    results,
  };
}

function humanSummary({ proved, failed, unverifiable, errored, total }) {
  if (total === 0) return 'No tests in the program — nothing to prove.';
  const parts = [];
  if (proved > 0)       parts.push(`${proved} proved`);
  if (failed > 0)       parts.push(`${failed} failed`);
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
      r.status === 'unverifiable' ? 'SKIPPED'   :
      r.status === 'empty'        ? 'EMPTY'     :
                                    'ERROR';
    lines.push(`[${badge}] ${r.test} (line ${r.line})`);
    if (r.reason) lines.push(`  ${r.reason}`);
    for (const a of r.assertions) {
      if (a.passed) {
        lines.push(`  ✓ line ${a.line}: ${describeAssertion(a)}`);
      } else {
        lines.push(`  ✗ line ${a.line}: ${describeAssertion(a)}`);
      }
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
  if (typeof v === 'string') return `'${v}'`;
  if (v === null) return 'nothing';
  if (Array.isArray(v))  return `[${v.map(formatValue).join(', ')}]`;
  return String(v);
}

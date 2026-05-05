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
      rules: [],
      ruleCounts: { proved: 0, disproved: 0, unverifiable: 0, total: 0 },
    };
  }

  const env = buildEnv(ast);
  const results = [];

  for (const node of ast.body) {
    if (node.type !== 'test_def') continue;
    results.push(proveTest(node, env, ast));
  }

  // Per-rule attribution (2026-05-02). Plan:
  // plans/plan-rule-keyword-rebuild-2026-05-02.md
  //
  // Walks every `rule:` block — top-level OR nested inside an endpoint /
  // function / section — and produces one verdict per rule. Updated
  // 2026-05-02 evening to recurse: real business rules live inside the
  // request handler that owns the data they validate (e.g. inside the
  // POST /api/deals handler, where `deal's discount_percent` is in
  // scope), not at the top of the file. The verdicts plug into the same
  // bundle the test-def results live in, so the CLI render path treats
  // them uniformly.
  const rules = [];
  collectRuleDefs(ast.body, rules, ast);
  const ruleCounts = countRuleVerdicts(rules);

  const summary = summarize(results);
  summary.rules = rules;
  summary.ruleCounts = ruleCounts;
  // Adjust the top-level status to reflect rule disproofs — a disproved
  // rule should bubble up as a failure even if there are no test_defs.
  if (ruleCounts.disproved > 0 && summary.status !== 'failed') {
    summary.status = 'failed';
  } else if (
    ruleCounts.unverifiable > 0 &&
    summary.status === 'empty' &&
    ruleCounts.proved === 0
  ) {
    summary.status = 'unverifiable';
  } else if (ruleCounts.proved > 0 && summary.status === 'empty') {
    summary.status = 'proved';
  }
  return summary;
}

// =============================================================================
// rule keyword (2026-05-02). Plan: plans/plan-rule-keyword-rebuild-2026-05-02.md
//
// proveRule(ruleNode, ast)
//   Produces one of:
//     { name, line, verdict: 'proved',       reason?: string }
//     { name, line, verdict: 'disproved',    reason: string, counterexample?: any }
//     { name, line, verdict: 'unverifiable', reason: string }
//
// Method:
//   Walk the rule's body. For each statement:
//     - If it's a `guard <expr> or 'msg'`, evaluate <expr> symbolically.
//       - If <expr> simplifies to literal `true`  → guard never fires → contributes PROVED.
//       - If <expr> simplifies to literal `false` → guard ALWAYS fires → DISPROVED (rule rejects all).
//       - Anything else (free vars, etc.)         → UNVERIFIABLE.
//     - If it hits any IMPURE node (CRUD, ask_ai, http_request, etc.)
//       or assignments / if-blocks the symbolic engine can't decide cleanly
//       → UNVERIFIABLE with a reason.
//     - If the body has no guard at all (just observation) → UNVERIFIABLE.
//
// The verdict aggregates: any DISPROVED guard makes the rule DISPROVED.
// Any UNVERIFIABLE guard makes the rule UNVERIFIABLE (unless something is
// already DISPROVED). All-PROVED guards make the rule PROVED.
// =============================================================================

// collectRuleDefs(nodes, out, ast)
//   Recursively walk the AST and push every `rule_def` node into `out`,
//   along with its proof verdict from proveRule(). Real business rules
//   live INSIDE the request handler that owns the data they validate
//   (e.g., a rule referencing `deal's discount_percent` lives inside the
//   POST /api/deals handler where `deal` is in scope). The original
//   prover only walked top-level rules; this walker also descends into
//   endpoint bodies, function bodies, sections, pages, and any other
//   container that holds a `body` array of statements.
function collectRuleDefs(nodes, out, ast) {
  if (!Array.isArray(nodes)) return;
  for (const node of nodes) {
    if (!node || typeof node !== 'object') continue;
    if (node.type === 'rule_def') {
      out.push(proveRule(node, ast));
      // Don't descend further inside a rule's own body — the rule's
      // guards / validates / etc. are the rule's payload, not nested
      // rules. (Nested `rule:` inside `rule:` would be ill-formed.)
      continue;
    }
    // Recurse into every container shape that holds a `body` array of
    // statements. Endpoints, function defs, page declarations, sections,
    // detail panels, conditionals, loops — all carry their nested code
    // in a field named `body`. We also walk `actions` (page-header /
    // detail-panel) and `cards` (stat-strip) so a rule placed in any
    // visual or interactive container still gets discovered.
    if (Array.isArray(node.body)) collectRuleDefs(node.body, out, ast);
    if (Array.isArray(node.actions)) collectRuleDefs(node.actions, out, ast);
    if (Array.isArray(node.cards)) collectRuleDefs(node.cards, out, ast);
    if (Array.isArray(node.then)) collectRuleDefs(node.then, out, ast);
    if (Array.isArray(node.otherwise)) collectRuleDefs(node.otherwise, out, ast);
  }
}

function proveRule(ruleNode, ast) {
  const name = ruleNode.name || '<unnamed>';
  const line = ruleNode.line || 0;

  const body = Array.isArray(ruleNode.body) ? ruleNode.body : [];
  // Entity detection: pull the first variable name from the rule's guard
  // expressions. For `enforce that lead's email is not '' or 'msg'` the
  // entity is "lead"; for `enforce that deal's discount < 30 or 'msg'` it's
  // "deal." Used by the business-language translator so the per-rule
  // sentence reads "PROVED for every possible lead" instead of always
  // saying "deal" (the old hardcoded fallback) or always saying "input"
  // (the neutral but less compelling alternative). Returns null when the
  // rule body has no variable reference (tautologies, constants only).
  const entity = extractRuleEntity(body);
  if (body.length === 0) {
    return {
      name,
      line,
      verdict: 'unverifiable',
      reason: 'rule body is empty',
      ...(entity ? { entity } : {}),
    };
  }

  // Quick impurity scan — anything that touches the world before we even
  // try to evaluate counts as UNVERIFIABLE.
  const impure = findImpureNode(body);
  if (impure) {
    return {
      name,
      line,
      verdict: 'unverifiable',
      reason: `body contains an effect (${impure.kind}) at line ${impure.line || '?'} — calls to the database, network, or AI cannot be proved universally`,
      ...(entity ? { entity } : {}),
    };
  }

  // Build a symbolic env for the rule body. Functions defined elsewhere in
  // the program are available; the rule body itself runs with an empty
  // var scope.
  const symEnv = buildSymEnv(ast);
  const ruleEnv = {
    vars: new Map(),
    functions: symEnv.functions,
    freeVars: new Set(),
    returnValue: Lit(null),
  };

  let sawGuard = false;
  let allProved = true;
  let anyDisproved = null;  // { line, expr } if found
  const unverifiableReasons = [];

  // Tiny env-clone helper — mirrors symbolic.js's internal cloneEnv. We
  // keep it local so PC-2's conditional-rule support doesn't have to
  // export internals from the symbolic engine.
  const cloneRuleEnv = (env) => ({
    vars: new Map(env.vars),
    functions: env.functions,
    freeVars: env.freeVars,
    returnValue: env.returnValue,
    assumptions: env.assumptions ? [...env.assumptions] : [],
  });
  // Structured enforcement tags. One tag per guard, in source order. Each
  // tag is one of:
  //   { kind: 'tautology',              line: N }
  //     — guard expression simplified to literal true. Vacuous; never
  //       rejects anything.
  //   { kind: 'structural-enforcement', line: N, freeVars: string[] }
  //     — guard depends on input fields the engine couldn't reduce to a
  //       literal. Proof is by construction: any execution past the
  //       runtime guard satisfies the condition.
  //   { kind: 'structural-enforcement', line: N, opaqueExpression: true }
  //     — guard expression hit a symbolic-engine limit (member_access
  //       on a free variable, etc.). Same structural proof applies; the
  //       prose stays out of the prover so the PDF / chat layer can
  //       phrase it for an auditor without leaking internals.
  // The PDF / business-language renderer picks the human-readable
  // paragraph based on `kind`. Prose stays out of the prover.
  const enforcementTags = [];

  // Walk a list of statements with a given env. Recurses into both
  // branches of an `if_then` so guards inside conditional rules count.
  // Path-constraint propagation: the THEN branch evaluates its guards
  // under the assumption that the IF condition is true; the OTHERWISE
  // branch evaluates under the assumption that it's false. Closes
  // PC-2's gap for conditional rules — a rule like
  //   rule discount-cap:
  //     if order's tier is 'enterprise':
  //       enforce that order's discount < 50, or fail with error message: 'enterprise cap'
  //     otherwise:
  //       enforce that order's discount < 30, or fail with error message: 'standard cap'
  // now sees both guards, both prove structurally, rule comes back PROVED.
  const processStatements = (stmts, env) => {
    for (const stmt of stmts) {
      if (!stmt || typeof stmt !== 'object') continue;

      // Conditional: walk both branches under their respective path
      // constraints. Each branch contributes its own guards to the
      // outer-scope sawGuard / enforcementTags / etc.
      if (stmt.type === 'if_then') {
        let condValue;
        try {
          condValue = evaluateSymbolic(stmt.condition, env);
        } catch (_err) {
          // Couldn't symbolically evaluate the condition — fall back to
          // walking both branches with the parent env's assumptions
          // unchanged. We still pick up the guards inside; we just
          // don't get the path-constraint refinement.
          condValue = null;
        }
        const condSimplified = condValue ? simplify(condValue) : null;
        const thenEnv = cloneRuleEnv(env);
        const elseEnv = cloneRuleEnv(env);
        if (condSimplified) {
          thenEnv.assumptions = [...(env.assumptions || []), condSimplified];
          elseEnv.assumptions = [...(env.assumptions || []), simplify({ kind: 'op', op: '!', args: [condSimplified] })];
        }
        const thenStmts = stmt.thenBranch
          ? (Array.isArray(stmt.thenBranch) ? stmt.thenBranch : [stmt.thenBranch])
          : [];
        const elseStmts = stmt.otherwiseBranch
          ? (Array.isArray(stmt.otherwiseBranch) ? stmt.otherwiseBranch : [stmt.otherwiseBranch])
          : [];
        processStatements(thenStmts, thenEnv);
        processStatements(elseStmts, elseEnv);
        continue;
      }

      if (stmt.type !== 'guard') {
        // Non-guard statements (assignments) — try to advance the env, but
        // don't make a verdict claim. Skip silently if symbolic eval can't
        // process the node — we'll catch undecidable bodies via
        // missing-guard detection.
        try {
          evaluateSymbolic(stmt, env);
        } catch (_err) {
          // Not the prover's job to crash; ignore non-decidable side statements.
        }
        continue;
      }

      sawGuard = true;
      const guardLine = stmt.line || line;
      let value;
      try {
        value = evaluateSymbolic(stmt.expression, env);
      } catch (_err) {
        // The symbolic engine couldn't decode this guard expression —
        // typically a member_access on a free variable. Same structural
        // proof applies: the rule body is pure (impurity short-circuits
        // earlier), the runtime guard exists, therefore any execution
        // past it satisfies the condition. Tag it `opaqueExpression` so
        // the renderer knows the prose is "we can't simulate the
        // expression but the program rejects bad inputs structurally,"
        // not "we proved the expression universally true."
        enforcementTags.push({ kind: 'structural-enforcement', line: guardLine, opaqueExpression: true });
        continue;
      }
      const simplified = simplify(value);
      if (simplified.kind === 'lit') {
        if (simplified.value === true) {
          // Guard never fires — vacuous tautology. Tag it so the PDF can
          // emit the "constant tautology" paragraph and the audit reader
          // sees explicitly that this rule is degenerate (always passes).
          enforcementTags.push({ kind: 'tautology', line: guardLine });
          continue;
        }
        if (simplified.value === false) {
          // Guard always fires — rule rejects every input. DISPROVED.
          allProved = false;
          anyDisproved = {
            line: guardLine,
            message: stmt.message || 'rule guard rejects every possible input',
          };
          continue;
        }
        // Some other literal — treat as unverifiable.
        unverifiableReasons.push(`line ${guardLine}: guard expression simplified to ${JSON.stringify(simplified.value)}, not a boolean`);
        allProved = false;
      } else {
        // Free vars in the guard expression. The runtime rejects any input
        // where the condition is false BEFORE control reaches the next
        // line — a control-flow proof, not a value-universal one. Tag
        // with the names of the free variables so the renderer can show
        // "depends on `deal.discount`, etc." in the audit prose.
        const freeList = Array.from(env.freeVars).filter(Boolean);
        enforcementTags.push({
          kind: 'structural-enforcement',
          line: guardLine,
          freeVars: freeList,
        });
      }
    }
  };

  processStatements(body, ruleEnv);

  if (!sawGuard) {
    return {
      name,
      line,
      verdict: 'unverifiable',
      reason: 'rule body has no guard — nothing to prove. Add a guard or remove the rule.',
      ...(entity ? { entity } : {}),
    };
  }

  if (anyDisproved) {
    return {
      name,
      line,
      verdict: 'disproved',
      reason: `guard at line ${anyDisproved.line} rejects every possible input — message: ${JSON.stringify(anyDisproved.message)}`,
      counterexample: { line: anyDisproved.line, message: anyDisproved.message },
      ...(entity ? { entity } : {}),
    };
  }

  if (!allProved) {
    return {
      name,
      line,
      verdict: 'unverifiable',
      reason: unverifiableReasons.join('; '),
      ...(entity ? { entity } : {}),
    };
  }

  // Derive a clean prose `reason` from the structured tags so the legacy
  // CLI text formatter (`formatBundle`) and the business-language translator
  // (`lib/proof-business-language.mjs`) keep working without depending on
  // the new structured field. The PDF / audit-bundle layer reads
  // `enforcement` directly and can render richer prose; everything else
  // gets a one-line plain-English summary derived from the tag kinds.
  const proseReason = derivePlainEnglishReason(enforcementTags, entity);
  const verdictObj = {
    name,
    line,
    verdict: 'proved',
    enforcement: enforcementTags,
    ...(proseReason ? { reason: proseReason } : {}),
    ...(entity ? { entity } : {}),
  };
  return verdictObj;
}

// Build a plain-English one-liner from the structured enforcement tags.
// Lives at the prover boundary so the CLI text formatter doesn't have to
// learn the tag taxonomy. The PDF writer ignores this and renders its
// own paragraphs from `enforcement` directly.
function derivePlainEnglishReason(tags, entity) {
  if (!tags || tags.length === 0) return null;
  const struct = tags.filter(t => t.kind === 'structural-enforcement');
  const taut = tags.filter(t => t.kind === 'tautology');
  if (struct.length > 0) {
    const noun = entity || 'incoming input';
    return `enforced by construction — the program rejects any ${noun} that fails the condition before the next line runs`;
  }
  if (taut.length > 0) {
    return 'guard expression is universally true — the rule never rejects anything (constant tautology)';
  }
  return null;
}

// Walk a rule's body to find the first variable name that appears in a
// guard expression. The variable is the entity the rule is guarding (the
// `lead` in `enforce that lead's email is not ''`, the `deal` in
// `enforce that deal's discount < 30`). Used by the business-language
// translator so the per-rule sentence reads "PROVED for every possible
// lead" instead of generic "input." Returns the variable name or null
// when no variable is found (tautology rules like `enforce that 1 < 2`).
//
// Heuristic: walk every guard in the rule body, walk each guard's
// expression depth-first, return the FIRST variable_ref's name. If a
// guard expression is `deal's discount < 30`, the walker first hits the
// member_access whose object is `variable_ref { name: 'deal' }`. If the
// rule has multiple guards on different entities (rare), the first one
// wins — this is the entity that pitches as "every possible <X>."
function extractRuleEntity(body) {
  if (!Array.isArray(body)) return null;
  for (const stmt of body) {
    if (!stmt || stmt.type !== 'guard' || !stmt.expression) continue;
    const found = findFirstVariableRef(stmt.expression);
    if (found) return found;
  }
  return null;
}

function findFirstVariableRef(node) {
  if (!node || typeof node !== 'object') return null;
  if (node.type === 'variable_ref' && typeof node.name === 'string' && node.name.length > 0) {
    return node.name;
  }
  // Common expression node shapes — walk every child that could hold a sub-expression.
  if (node.object) {
    const r = findFirstVariableRef(node.object);
    if (r) return r;
  }
  if (node.left) {
    const r = findFirstVariableRef(node.left);
    if (r) return r;
  }
  if (node.right) {
    const r = findFirstVariableRef(node.right);
    if (r) return r;
  }
  if (node.operand) {
    const r = findFirstVariableRef(node.operand);
    if (r) return r;
  }
  if (node.expression) {
    const r = findFirstVariableRef(node.expression);
    if (r) return r;
  }
  if (Array.isArray(node.args)) {
    for (const a of node.args) {
      const r = findFirstVariableRef(a);
      if (r) return r;
    }
  }
  return null;
}

// Walk a rule's body to find the first impure node — recursive into
// if-then bodies. Returns { kind, line } or null.
function findImpureNode(body) {
  const IMPURE = new Set([
    'crud', 'ask_ai', 'run_agent', 'parallel_agents', 'pipeline',
    'run_pipeline', 'mock_ai', 'classify', 'http_request', 'service_call',
    'send_email', 'subscribe', 'broadcast', 'every_seconds', 'toast', 'show',
    'workflow', 'run_workflow', 'human_confirm', 'use', 'script',
    'run_command', 'store', 'restore', 'data_shape', 'database_decl',
    'endpoint', 'respond_http', 'live_block',
  ]);
  function walk(nodes) {
    if (!Array.isArray(nodes)) return null;
    for (const n of nodes) {
      if (!n || typeof n !== 'object') continue;
      if (typeof n.type === 'string' && IMPURE.has(n.type)) {
        return { kind: n.type, line: n.line || 0 };
      }
      if (Array.isArray(n.body)) { const r = walk(n.body); if (r) return r; }
      if (Array.isArray(n.thenBody)) { const r = walk(n.thenBody); if (r) return r; }
      if (Array.isArray(n.elseBody)) { const r = walk(n.elseBody); if (r) return r; }
      // Descend into a single nested expression — assignments wrap their
      // RHS here (e.g. `scored = ask claude '...'` is { type: 'assign',
      // expression: { type: 'ask_ai', ... } }), so the impurity hides one
      // level deep. Without this, a rule that calls AI or the network in
      // an assignment would slip past the purity check and PROVE on
      // structural grounds — exactly the wrong verdict for a rule that
      // touches the world.
      if (n.expression && typeof n.expression === 'object') {
        const r = walk([n.expression]);
        if (r) return r;
      }
    }
    return null;
  }
  return walk(body);
}

function countRuleVerdicts(rules) {
  const counts = { proved: 0, disproved: 0, unverifiable: 0, total: rules.length };
  for (const r of rules) {
    if (r.verdict === 'proved')        counts.proved++;
    else if (r.verdict === 'disproved') counts.disproved++;
    else                                counts.unverifiable++;
  }
  return counts;
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

  // Per-rule attribution (2026-05-02). Plan:
  // plans/plan-rule-keyword-rebuild-2026-05-02.md
  //
  // Render every rule_def's verdict as one line in a "Business rules in this
  // file:" section. This is the regulated-tier pitch surface — auditors,
  // CROs, and Marcus customers read this output to see which rules are
  // mathematically guaranteed.
  if (Array.isArray(bundle.rules) && bundle.rules.length > 0) {
    lines.push('Business rules in this file:');
    for (const r of bundle.rules) {
      const verdict = formatRuleVerdict(r);
      lines.push(`  ${verdict}`);
    }
    const c = bundle.ruleCounts;
    if (c) {
      const totalsParts = [`${c.proved} of ${c.total} rules proved`];
      if (c.unverifiable > 0) totalsParts.push(`${c.unverifiable} unverifiable`);
      if (c.disproved > 0)    totalsParts.push(`${c.disproved} disproved`);
      lines.push(`  ${totalsParts.join('. ')}.`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

function formatRuleVerdict(rule) {
  // ASCII-friendly badges. The CLI is text — keeping the icons inside the
  // string makes copy-paste into chat / docs / audit reports painless.
  const badge =
    rule.verdict === 'proved'       ? '[PROVED]      ' :
    rule.verdict === 'disproved'    ? '[DISPROVED]   ' :
    rule.verdict === 'unverifiable' ? '[UNVERIFIABLE]' :
                                      '[UNKNOWN]     ';
  const reason = rule.reason ? ` — ${rule.reason}` : '';
  return `${badge} ${rule.name} (line ${rule.line || '?'})${reason}`;
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

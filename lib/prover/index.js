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
  evaluateSymbolic, buildSymEnv, simplify,
  SymbolicLimit,
} from './symbolic.js';
// The symbolic DECISION core is now the Z3 SMT backend (lib/prover/z3/). `simplify`
// is still used above the seam for display + path-constraint normalization, but the
// actual "does this hold for all inputs?" call goes to proveEquals / proveCompare.
import { proveEquals, proveCompare } from './z3/solve.js';

/**
 * Verify all `test 'X':` blocks in a Clear program by walking the AST directly.
 *
 * @param {string} source - Clear source code.
 * @returns {ProofBundle}
 */
export async function prove(source) {
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
    results.push(await proveTest(node, env, ast));
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

  // Agent tool-bound claims (2026-05-07). Top-level statements of the form:
  //   prove that agent 'X' cannot call <function_name>
  //
  // For each claim, the prover walks the named agent's tool closure
  // (own `has tools:` entries plus the recursive transitive closure of
  // `uses skills:`). PROVED iff <function_name> is not in the closure;
  // DISPROVED with the source path that brings it in if it is.
  //
  // Soundness rests on Clear's closed-world tool dispatch: the compiled
  // `_askAIWithTools` looks up tool names in a compile-time-built dict and
  // returns "Unknown tool" for anything else (compiler.js around line 695).
  // Nothing can extend that dict at runtime — no `eval`, no string lookup
  // of globals. So if a function name isn't in the static closure, it
  // genuinely cannot be invoked by the agent.
  const boundClaims = [];
  for (const node of ast.body) {
    if (node && node.type === 'agent_bound_claim') {
      boundClaims.push(proveAgentBoundClaim(node, ast));
    }
  }
  const boundCounts = countBoundVerdicts(boundClaims);

  const summary = summarize(results);
  summary.rules = rules;
  summary.ruleCounts = ruleCounts;
  summary.boundClaims = boundClaims;
  summary.boundCounts = boundCounts;
  // Adjust the top-level status to reflect rule + bound-claim disproofs —
  // a disproved verdict in either bucket should bubble up as a failure
  // even if there are no test_defs.
  const anyDisproved = ruleCounts.disproved > 0 || boundCounts.disproved > 0;
  const anyUnverifiable = ruleCounts.unverifiable > 0 || boundCounts.unverifiable > 0;
  const anyProved = ruleCounts.proved > 0 || boundCounts.proved > 0;
  if (anyDisproved && summary.status !== 'failed') {
    summary.status = 'failed';
  } else if (anyUnverifiable && summary.status === 'empty' && !anyProved) {
    summary.status = 'unverifiable';
  } else if (anyProved && summary.status === 'empty') {
    summary.status = 'proved';
  }
  return summary;
}

// =============================================================================
// Agent tool-bound claim (2026-05-07).
//
// proveAgentBoundClaim(claimNode, ast)
//   claimNode = { type: 'agent_bound_claim', agentName, forbiddenAction, line }
//
// Returns one of:
//   { agentName, forbiddenAction, line, verdict: 'proved',
//     reason: string, closureSize: number }
//   { agentName, forbiddenAction, line, verdict: 'disproved',
//     reason: string, path: string[] }
//   { agentName, forbiddenAction, line, verdict: 'unverifiable',
//     reason: string }
//
// "unverifiable" only fires when the named agent doesn't exist in the AST —
// we can't make a claim about a non-existent agent. Otherwise the closure
// walk is total and produces a definitive proved/disproved verdict.
// =============================================================================
function proveAgentBoundClaim(claimNode, ast) {
  const { agentName, line } = claimNode;
  // Default to 'call' for parser nodes that predate the kind field.
  const claimKind = claimNode.claimKind || 'call';
  const target = claimNode.target || claimNode.forbiddenAction;

  // Find the agent definition by name. Match is case-insensitive on the
  // human-readable name string the source declared (`agent 'Refund Bot'`).
  const topLevel = Array.isArray(ast.body) ? ast.body : [];
  const agentDef = topLevel.find(
    n => n && n.type === 'agent' && typeof n.name === 'string' &&
         n.name.toLowerCase() === agentName.toLowerCase()
  );

  if (!agentDef) {
    return {
      agentName,
      claimKind,
      target,
      forbiddenAction: target,  // back-compat for the call kind
      line,
      verdict: 'unverifiable',
      reason: `agent '${agentName}' is not defined in this file — cannot make a bound claim about a non-existent agent`,
    };
  }

  if (claimKind === 'call') {
    return proveCannotCall(agentDef, target, line, topLevel);
  }
  if (claimKind === 'delete' || claimKind === 'modify') {
    return proveCannotAffect(agentDef, claimKind, target, line, topLevel);
  }
  if (claimKind === 'call_with_constraint') {
    return proveCannotCallWithConstraint(agentDef, target, claimNode.constraint, line, topLevel);
  }
  if (claimKind === 'upholds_policies') {
    return proveAgentUpholdsPolicies(agentDef, line, topLevel);
  }
  return {
    agentName,
    claimKind,
    target,
    line,
    verdict: 'unverifiable',
    reason: `unknown claim kind '${claimKind}' — only 'call', 'delete', 'modify', and 'call_with_constraint' are supported`,
  };
}

// =============================================================================
// Direct: prove that agent 'X' cannot call <function_name>
// =============================================================================
function proveCannotCall(agentDef, forbiddenAction, line, topLevel) {
  // Walk the closure: own tools + skill tools (recursive). Track the path
  // so a DISPROVED verdict can name how the forbidden action enters scope
  // ("Refund Bot → uses skills: Billing → has tool: charge_card").
  const closure = collectAgentToolClosure(agentDef, topLevel);

  const hit = closure.entries.find(e => e.name === forbiddenAction);
  if (hit) {
    return {
      agentName: agentDef.name,
      claimKind: 'call',
      target: forbiddenAction,
      forbiddenAction,
      line,
      verdict: 'disproved',
      reason: `agent '${agentDef.name}' CAN call '${forbiddenAction}' — it appears in the tool closure via: ${hit.path.join(' → ')}`,
      path: hit.path,
    };
  }

  return {
    agentName: agentDef.name,
    claimKind: 'call',
    target: forbiddenAction,
    forbiddenAction,
    line,
    verdict: 'proved',
    reason: `agent '${agentDef.name}' has no path to call '${forbiddenAction}' — closure has ${closure.entries.length} tool(s) and '${forbiddenAction}' is not among them`,
    closureSize: closure.entries.length,
  };
}

// =============================================================================
// Transitive: prove that agent 'X' cannot delete from <Entity>
//             prove that agent 'X' cannot modify <Entity>
//
// Walks the agent body PLUS every reachable tool function body (transitively,
// following function calls) and looks for a matching CRUD node:
//   delete kind  → operation === 'remove'
//   modify kind  → operation in {save, remove, upsert, update}
//
// PROVED iff no matching CRUD against `<Entity>` is reachable. DISPROVED
// with the path that names where the offending operation lives.
// UNVERIFIABLE if a reachable function call dispatches to a function we
// can't see (no FUNCTION_DEF for it) — refusing the claim is sounder than
// making one we can't justify.
// =============================================================================
const MODIFY_OPS = new Set(['save', 'remove', 'upsert', 'update']);
const DELETE_OPS = new Set(['remove']);

function proveCannotAffect(agentDef, claimKind, entity, line, topLevel) {
  const matchingOps = claimKind === 'delete' ? DELETE_OPS : MODIFY_OPS;

  // Build the function-name → FUNCTION_DEF lookup so the walker can recurse
  // through call chains. Function calls in Clear show up as `call` AST nodes
  // (or as expressions inside ASSIGN/RETURN) referencing the callee's name.
  const fnDefs = new Map();
  for (const node of topLevel) {
    if (node && node.type === 'function_def' && typeof node.name === 'string') {
      fnDefs.set(node.name, node);
    }
  }

  const seen = new Set();
  const callPath = [`agent '${agentDef.name}'`];
  // 1. Walk the agent's own body first — anything the agent does directly
  //    counts even if no tool path leads there.
  const agentHit = findCrudViolation(
    agentDef.body || [],
    entity,
    matchingOps,
    fnDefs,
    seen,
    callPath
  );
  if (agentHit) {
    return makeAffectVerdict(agentDef.name, claimKind, entity, line, 'disproved', agentHit);
  }

  // 2. Walk every reachable tool body, transitively closing under function
  //    calls. The closure already accounts for skills, so iterating it covers
  //    the full surface the AI can dispatch to.
  const closure = collectAgentToolClosure(agentDef, topLevel);
  for (const tool of closure.entries) {
    const fnDef = fnDefs.get(tool.name);
    if (!fnDef) {
      // The tool is declared in `has tools:` / a skill but no FUNCTION_DEF
      // exists for it. Either it's a built-in Clear primitive (rare) or the
      // source is incomplete. Refuse to make a soundness claim.
      return makeAffectVerdict(
        agentDef.name,
        claimKind,
        entity,
        line,
        'unverifiable',
        {
          path: [...tool.path, `(no function body found for '${tool.name}')`],
          op: 'unknown',
          line: 0,
        },
        `tool '${tool.name}' has no function definition in this file — cannot walk its body to verify the claim`
      );
    }
    const toolPath = [...tool.path];
    const hit = findCrudViolation(
      fnDef.body || [],
      entity,
      matchingOps,
      fnDefs,
      seen,
      toolPath
    );
    if (hit) {
      return makeAffectVerdict(agentDef.name, claimKind, entity, line, 'disproved', hit);
    }
  }

  // Nothing reachable touches the entity in the matching way.
  return makeAffectVerdict(
    agentDef.name,
    claimKind,
    entity,
    line,
    'proved',
    null,
    `no reachable code (agent body + ${closure.entries.length} tool(s)) ${claimKind === 'delete' ? 'deletes from' : 'modifies'} '${entity}'`
  );
}

function makeAffectVerdict(agentName, claimKind, entity, line, verdict, hit, customReason) {
  const verbLabel = claimKind === 'delete' ? 'delete from' : 'modify';
  const verbPast = claimKind === 'delete' ? 'deletes from' : 'modifies';
  if (verdict === 'proved') {
    return {
      agentName,
      claimKind,
      target: entity,
      line,
      verdict: 'proved',
      reason: customReason || `no reachable code ${verbPast} '${entity}'`,
    };
  }
  if (verdict === 'unverifiable') {
    return {
      agentName,
      claimKind,
      target: entity,
      line,
      verdict: 'unverifiable',
      reason: customReason || `cannot fully walk the agent's reachable code`,
      path: hit && hit.path,
    };
  }
  // disproved
  return {
    agentName,
    claimKind,
    target: entity,
    line,
    verdict: 'disproved',
    reason: `agent '${agentName}' CAN ${verbLabel} '${entity}' — '${hit.op}' against '${entity}' at line ${hit.line || '?'} via: ${hit.path.join(' → ')}`,
    path: hit.path,
    op: hit.op,
    violationLine: hit.line || 0,
  };
}

// Walk a list of statement nodes looking for a CRUD violation against
// `entity` whose operation is in `matchingOps`. Recurses into nested
// containers (body, then/else, args) and follows function calls through
// `fnDefs`. Returns the first violation found as { path, op, line } or
// null if none.
function findCrudViolation(nodes, entity, matchingOps, fnDefs, seen, path) {
  if (!Array.isArray(nodes)) return null;
  for (const node of nodes) {
    const hit = findCrudViolationInNode(node, entity, matchingOps, fnDefs, seen, path);
    if (hit) return hit;
  }
  return null;
}

function findCrudViolationInNode(node, entity, matchingOps, fnDefs, seen, path) {
  if (!node || typeof node !== 'object') return null;

  // CRUD node — the actual data-touching primitive. Match the entity
  // case-insensitively AND tolerantly across the singular/plural pair: a
  // table declared `create a Users table:` has CRUD ops with target='User'
  // (Clear normalizes table → singular record), but the developer writing
  // `cannot delete from Users` will use the plural table name. Accept
  // either form on either side.
  if (node.type === 'crud' && matchingOps.has(node.operation) &&
      _entitiesMatch(node.target, entity)) {
    return {
      path: [...path, `${node.operation} ${node.target}${node.line ? ' @ line ' + node.line : ''}`],
      op: node.operation,
      line: node.line || 0,
    };
  }

  // Function call — recurse into the callee's body if we have it.
  // `call` nodes carry the callee under `.name` or `.functionName`. ASSIGN
  // wraps an expression that may itself be a `call` (e.g. `result = helper(x)`).
  const callName = extractCallName(node);
  if (callName && fnDefs.has(callName) && !seen.has(callName)) {
    seen.add(callName);
    const callee = fnDefs.get(callName);
    const calleePath = [...path, `function ${callName}()`];
    const hit = findCrudViolation(callee.body || [], entity, matchingOps, fnDefs, seen, calleePath);
    if (hit) return hit;
  }

  // Walk standard nested-container fields. Mirrors the rule walker — every
  // shape that holds child statements gets a recursive descent.
  if (node.expression) {
    const hit = findCrudViolationInNode(node.expression, entity, matchingOps, fnDefs, seen, path);
    if (hit) return hit;
  }
  for (const key of ['body', 'thenBody', 'elseBody', 'thenBranch', 'otherwiseBranch', 'then', 'otherwise', 'args']) {
    if (Array.isArray(node[key])) {
      const hit = findCrudViolation(node[key], entity, matchingOps, fnDefs, seen, path);
      if (hit) return hit;
    }
  }
  return null;
}

// Match two entity names tolerantly. Case-insensitive, and accepts the
// singular/plural pair (User vs Users). Clear's CRUD ops carry the singular
// record name (`User`) while developers writing the claim use the table name
// (`Users`) — both should match. Naive plural rule (`+ 's'`) is good enough
// for the table names Clear apps actually declare; users with irregular
// pluralizations can write the form that matches the CRUD target.
function _entitiesMatch(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const al = a.toLowerCase();
  const bl = b.toLowerCase();
  if (al === bl) return true;
  if (al + 's' === bl) return true;
  if (al === bl + 's') return true;
  return false;
}

// =============================================================================
// Phase 3: Symbolic argument-bound claim (2026-05-07)
//
// `prove that agent 'X' cannot call <fn> with <argName> <op> <value>`
//
// Walks the agent body + every reachable tool body for CALL sites whose
// callee matches `<fn>`. For each call site, looks up which positional
// argument corresponds to `<argName>` (via the FUNCTION_DEF's params list),
// evaluates that arg expression with the full symbolic engine (free
// variables for everything Claude could pass), and checks whether the
// constraint `argSym <op> value` could be satisfied.
//
// Verdict semantics:
//   PROVED       — every reachable call site has an argument that the
//                   symbolic engine can prove makes the constraint FALSE
//                   (e.g. literal 50 vs `> 1000`).
//   DISPROVED    — at least one call site has an argument that satisfies
//                   the constraint (or could — symbolic free vars are
//                   conservatively assumed to be unbounded).
//   UNVERIFIABLE — the agent / function isn't defined, OR the symbolic
//                   engine bails out on a reachable arg expression.
//
// This leverages the existing prover machinery (evaluateSymbolic + simplify
// + path constraints) rather than pattern-matching, so the verdict is a
// real symbolic claim — the moat play vs every other agent SDK.
// =============================================================================
function proveCannotCallWithConstraint(agentDef, fnName, constraint, line, topLevel) {
  // Build the function-name → FUNCTION_DEF lookup so we can resolve
  // parameter positions and walk callee bodies (transitively).
  const fnDefs = new Map();
  for (const node of topLevel) {
    if (node && node.type === 'function_def' && typeof node.name === 'string') {
      fnDefs.set(node.name, node);
    }
  }

  const targetDef = fnDefs.get(fnName);
  if (!targetDef) {
    return {
      agentName: agentDef.name,
      claimKind: 'call_with_constraint',
      target: fnName,
      constraint,
      line,
      verdict: 'unverifiable',
      reason: `function '${fnName}' is not defined in this file — cannot resolve which argument '${constraint.argName}' refers to`,
    };
  }
  const argIndex = (targetDef.params || []).findIndex(p => p && p.name === constraint.argName);
  if (argIndex === -1) {
    return {
      agentName: agentDef.name,
      claimKind: 'call_with_constraint',
      target: fnName,
      constraint,
      line,
      verdict: 'unverifiable',
      reason: `function '${fnName}' has no parameter named '${constraint.argName}' (params: ${(targetDef.params || []).map(p => p.name).join(', ') || 'none'})`,
    };
  }

  // SOUNDNESS GATE: if the constrained function IS itself a tool in the
  // agent's closure, Claude can dispatch to it directly with arbitrary
  // arguments. The static call-site walk doesn't see this dispatch — it's
  // an opaque runtime hop where every parameter is effectively a free
  // variable. So if fnName is in the closure, the constraint is DISPROVED
  // unconditionally (Claude can pass anything that satisfies it).
  const closure = collectAgentToolClosure(agentDef, topLevel);
  const directToolHit = closure.entries.find(e => e.name === fnName);
  if (directToolHit) {
    return {
      agentName: agentDef.name,
      claimKind: 'call_with_constraint',
      target: fnName,
      constraint,
      line,
      verdict: 'disproved',
      reason: `agent '${agentDef.name}' can invoke '${fnName}' directly via tool dispatch — Claude controls every argument, so '${constraint.argName} ${constraint.op} ${formatConstraintValue(constraint)}' is satisfiable. Use 'cannot call ${fnName}' to forbid it entirely, OR add an enforce statement inside ${fnName}'s body to bound the argument`,
      path: directToolHit.path,
    };
  }

  // Collect every static CALL site to fnName reachable from the agent's
  // surface: agent body + every reachable tool body (transitive via
  // fnDefs lookup). These are source-level invocations the symbolic
  // engine can analyze precisely, unlike Claude's opaque tool dispatch.
  const callSites = [];
  const seenFns = new Set();
  collectCallSites(agentDef.body || [], fnName, fnDefs, seenFns, [`agent '${agentDef.name}'`], callSites);
  for (const tool of closure.entries) {
    const fnDef = fnDefs.get(tool.name);
    if (!fnDef) continue;  // unverifiable handled in Transitive flavor; here just skip
    if (seenFns.has(tool.name)) continue;
    seenFns.add(tool.name);
    collectCallSites(fnDef.body || [], fnName, fnDefs, seenFns, tool.path, callSites);
  }

  if (callSites.length === 0) {
    return {
      agentName: agentDef.name,
      claimKind: 'call_with_constraint',
      target: fnName,
      constraint,
      line,
      verdict: 'proved',
      reason: `agent '${agentDef.name}' has no reachable call site for '${fnName}' — constraint '${constraint.argName} ${constraint.op} ${formatConstraintValue(constraint)}' cannot be triggered`,
      callSiteCount: 0,
    };
  }

  // Evaluate each call site's relevant argument symbolically. Build a
  // fresh symbolic env per site — fall back to a free variable if the
  // engine can't decide.
  const symEnv = buildSymEnv({ body: topLevel });
  for (const site of callSites) {
    const argExpr = (site.callNode.args || [])[argIndex];
    if (!argExpr) {
      return makeConstraintVerdict(agentDef.name, fnName, constraint, line, 'unverifiable', site,
        `call site at line ${site.callNode.line || '?'} doesn't pass argument index ${argIndex} (expected '${constraint.argName}')`);
    }
    let argValue;
    try {
      const env = {
        vars: new Map(),
        functions: symEnv.functions,
        freeVars: new Set(),
        returnValue: Lit(null),
      };
      argValue = evaluateSymbolic(argExpr, env);
    } catch (err) {
      return makeConstraintVerdict(agentDef.name, fnName, constraint, line, 'unverifiable', site,
        `symbolic engine could not evaluate the argument at line ${site.callNode.line || '?'} (${err.reason || err.message})`);
    }
    const argSimplified = simplify(argValue);
    const verdict = checkConstraint(argSimplified, constraint);
    if (verdict === 'satisfiable') {
      return makeConstraintVerdict(agentDef.name, fnName, constraint, line, 'disproved', site,
        `call site at line ${site.callNode.line || '?'} can satisfy '${constraint.argName} ${constraint.op} ${formatConstraintValue(constraint)}' — argument is ${formatSymValue(argSimplified)}`);
    }
    if (verdict === 'unknown') {
      return makeConstraintVerdict(agentDef.name, fnName, constraint, line, 'unverifiable', site,
        `symbolic engine cannot prove or refute '${constraint.argName} ${constraint.op} ${formatConstraintValue(constraint)}' for the argument at line ${site.callNode.line || '?'} (${formatSymValue(argSimplified)}) — add an enforce statement before the call to bound it`);
    }
    // 'unsatisfiable' — this site is safe; continue checking others.
  }

  return {
    agentName: agentDef.name,
    claimKind: 'call_with_constraint',
    target: fnName,
    constraint,
    line,
    verdict: 'proved',
    reason: `every reachable call to '${fnName}' (${callSites.length} site(s)) passes an argument that provably cannot satisfy '${constraint.argName} ${constraint.op} ${formatConstraintValue(constraint)}'`,
    callSiteCount: callSites.length,
  };
}

function makeConstraintVerdict(agentName, fnName, constraint, line, verdict, site, reason) {
  return {
    agentName,
    claimKind: 'call_with_constraint',
    target: fnName,
    constraint,
    line,
    verdict,
    reason,
    path: site ? site.path : undefined,
    siteLine: site && site.callNode ? site.callNode.line : undefined,
  };
}

function formatConstraintValue(constraint) {
  if (constraint.valueIsString) return `'${constraint.value}'`;
  return String(constraint.value);
}

function formatSymValue(v) {
  if (!v || typeof v !== 'object') return String(v);
  if (v.kind === 'lit') return JSON.stringify(v.value);
  if (v.kind === 'sym') return `<symbolic ${v.name}>`;
  if (v.kind === 'op') return `${v.op}(${(v.args || []).map(formatSymValue).join(', ')})`;
  if (v.kind === 'phi') return `if-then-else`;
  return JSON.stringify(v);
}

// Check if the constraint `arg <op> value` is satisfiable, unsatisfiable,
// or unknown given the symbolic value of arg.
//
// Returns one of: 'satisfiable', 'unsatisfiable', 'unknown'.
//
// The decisive case: arg is a literal. Then we evaluate the comparison
// directly. For free symbolic variables (the common case where Claude
// passes the value through unchanged) we conservatively answer
// 'satisfiable' — Claude could pass anything.
function checkConstraint(argSym, constraint) {
  const { op, value, valueIsString } = constraint;

  if (argSym.kind === 'lit') {
    const a = argSym.value;
    const b = valueIsString ? String(value) : value;
    switch (op) {
      case 'is':
      case '=':
      case '==':
        return a === b ? 'satisfiable' : 'unsatisfiable';
      case 'is not':
      case '!=':
        return a !== b ? 'satisfiable' : 'unsatisfiable';
      case 'is greater than':
      case '>':
        return (typeof a === 'number' && a > b) ? 'satisfiable' : 'unsatisfiable';
      case 'is less than':
      case '<':
        return (typeof a === 'number' && a < b) ? 'satisfiable' : 'unsatisfiable';
      case 'is at least':
      case '>=':
        return (typeof a === 'number' && a >= b) ? 'satisfiable' : 'unsatisfiable';
      case 'is at most':
      case '<=':
        return (typeof a === 'number' && a <= b) ? 'satisfiable' : 'unsatisfiable';
      default:
        return 'unknown';
    }
  }

  // Symbolic free variable or compound expression: conservatively
  // satisfiable. Future deepening: track guards/enforces upstream and
  // check whether the argument has a proven bound from a guard.
  if (argSym.kind === 'sym' || argSym.kind === 'op' || argSym.kind === 'phi') {
    return 'satisfiable';
  }

  return 'unknown';
}

// Walk a list of statement nodes and push every CALL site to fnName onto
// the `out` array. Recurses into nested containers AND into other called
// functions (transitive, tracked by `seenFns` to break cycles). The `path`
// argument records the chain of containers that lead here so verdicts can
// attribute the leak.
function collectCallSites(nodes, fnName, fnDefs, seenFns, path, out) {
  if (!Array.isArray(nodes)) return;
  for (const node of nodes) {
    collectCallSitesInNode(node, fnName, fnDefs, seenFns, path, out);
  }
}

function collectCallSitesInNode(node, fnName, fnDefs, seenFns, path, out) {
  if (!node || typeof node !== 'object') return;

  // Direct CALL — record if it matches.
  if (node.type === 'call' && node.name === fnName) {
    out.push({ callNode: node, path: [...path, `call ${fnName}() @ line ${node.line || '?'}`] });
    return;  // don't recurse into the arg list of a matching call
  }

  // Other CALL — recurse into the callee's body.
  const callName = extractCallName(node);
  if (callName && fnDefs.has(callName) && !seenFns.has(callName)) {
    seenFns.add(callName);
    const callee = fnDefs.get(callName);
    collectCallSites(callee.body || [], fnName, fnDefs, seenFns, [...path, `function ${callName}()`], out);
  }

  if (node.expression) collectCallSitesInNode(node.expression, fnName, fnDefs, seenFns, path, out);
  for (const key of ['body', 'thenBody', 'elseBody', 'thenBranch', 'otherwiseBranch', 'then', 'otherwise', 'args']) {
    if (Array.isArray(node[key])) {
      collectCallSites(node[key], fnName, fnDefs, seenFns, path, out);
    }
  }
}

// =============================================================================
// Phase 4: Agent × Policy bridge (2026-05-07)
//
// `prove that agent 'X' upholds all policies`
//
// Composes the agent reachability walker with every `policy:` block in the
// AST. For each policy rule, dispatches to the appropriate static checker
// (CRUD walk, condition check, or honest UNVERIFIABLE for runtime-only
// rules). Emits one verdict per (agent, policy_rule) pair.
//
// What's statically provable from agent surface:
//   protect_tables [tables]            → walk reachable code for any CRUD on listed tables
//   dont_delete_row                    → walk for any `remove` op
//   dont_delete_without_where          → walk for `remove` ops with empty WHERE
//   dont_update_without_where          → walk for `save` ops with empty WHERE
//   dont_read_sensitive_tables [t]     → walk for `lookup` against listed tables
//   block_ddl                          → trivially proves (Clear agents go through CRUD primitives)
//   dont_push_to_main / dont_merge_to_main / dont_delete_branch / max_files_per_commit / require_branch_prefix
//                                      → trivially proves (git ops not in agent surface)
//   dont_delete_file / restrict_paths / block_extensions
//                                      → trivially proves (filesystem ops not in agent surface)
//
// What's runtime-only (UNVERIFIABLE — refuses to claim):
//   block_prompt_injection             → runtime input scan
//   code_freeze_active                 → runtime env var
//   maintenance_window                 → runtime time check
//   require_role / require_clearance / contractor_cannot_write_pii
//                                      → runtime auth context
//
// Returns a parent verdict envelope with `subverdicts: []` so the
// CRO-readable formatter can render one line per policy rule.
// =============================================================================
const TRIVIAL_PROVE_KINDS = new Set([
  'block_ddl',
  'dont_push_to_main',
  'dont_merge_to_main',
  'dont_delete_branch',
  'max_files_per_commit',
  'require_branch_prefix',
  'dont_delete_file',
  'restrict_paths',
  'block_extensions',
]);
const RUNTIME_ONLY_KINDS = new Set([
  'block_prompt_injection',
  'code_freeze_active',
  'maintenance_window',
  'require_role',
  'require_clearance',
  'contractor_cannot_write_pii',
]);

function proveAgentUpholdsPolicies(agentDef, line, topLevel) {
  const policyNodes = topLevel.filter(n => n && n.type === 'policy');
  const allRules = [];
  for (const p of policyNodes) {
    if (Array.isArray(p.rules)) {
      for (const r of p.rules) allRules.push(r);
    }
  }

  if (allRules.length === 0) {
    return {
      agentName: agentDef.name,
      claimKind: 'upholds_policies',
      target: 'all_policies',
      line,
      verdict: 'unverifiable',
      reason: `no policy: blocks declared in this file — nothing to uphold`,
      subverdicts: [],
    };
  }

  const subverdicts = [];
  let anyDisproved = false;
  let anyUnverifiable = false;

  for (const rule of allRules) {
    const sub = checkPolicyRuleAgainstAgent(rule, agentDef, topLevel);
    subverdicts.push(sub);
    if (sub.verdict === 'disproved') anyDisproved = true;
    if (sub.verdict === 'unverifiable') anyUnverifiable = true;
  }

  const verdict = anyDisproved ? 'disproved' : anyUnverifiable ? 'unverifiable' : 'proved';
  const provedCount = subverdicts.filter(s => s.verdict === 'proved').length;
  const reason = `${provedCount} of ${subverdicts.length} policy rule(s) proved` +
    (anyDisproved ? `, ${subverdicts.filter(s => s.verdict === 'disproved').length} disproved` : '') +
    (anyUnverifiable ? `, ${subverdicts.filter(s => s.verdict === 'unverifiable').length} unverifiable (runtime-only)` : '');

  return {
    agentName: agentDef.name,
    claimKind: 'upholds_policies',
    target: 'all_policies',
    line,
    verdict,
    reason,
    subverdicts,
  };
}

function checkPolicyRuleAgainstAgent(rule, agentDef, topLevel) {
  const ruleLabel = formatPolicyRuleLabel(rule);

  // Trivially provable — the rule's domain isn't reachable from the agent
  // surface at all (git ops, raw SQL, file ops). Declare PROVED and move on.
  if (TRIVIAL_PROVE_KINDS.has(rule.kind)) {
    return {
      ruleKind: rule.kind,
      ruleLabel,
      verdict: 'proved',
      reason: `'${rule.kind}' is structurally satisfied — Clear agents have no path to ${describeRuleDomain(rule.kind)}`,
    };
  }

  // Runtime-only — honest UNVERIFIABLE rather than a false PROVED.
  if (RUNTIME_ONLY_KINDS.has(rule.kind)) {
    return {
      ruleKind: rule.kind,
      ruleLabel,
      verdict: 'unverifiable',
      reason: `'${rule.kind}' is enforced at runtime, not by static analysis — the prover cannot claim what the runtime check will refuse`,
    };
  }

  // protect_tables [tables] — for each table, walk reachable CRUD for any
  // matching op. PROVED iff none of the tables is touched. DISPROVED with
  // the call chain to the first violation found.
  if (rule.kind === 'protect_tables' && Array.isArray(rule.tables)) {
    for (const table of rule.tables) {
      const violation = findCrudHitForRule(agentDef, MODIFY_OPS, table, topLevel);
      if (violation) {
        return {
          ruleKind: rule.kind,
          ruleLabel,
          verdict: 'disproved',
          reason: `agent reaches a '${violation.op}' against protected table '${table}' via: ${violation.path.join(' → ')}`,
          path: violation.path,
        };
      }
    }
    return {
      ruleKind: rule.kind,
      ruleLabel,
      verdict: 'proved',
      reason: `no reachable code in agent '${agentDef.name}' touches any of the protected tables: ${rule.tables.join(', ')}`,
    };
  }

  if (rule.kind === 'dont_delete_row') {
    const violation = findCrudHitForRule(agentDef, new Set(['remove']), null, topLevel);
    if (violation) {
      return {
        ruleKind: rule.kind,
        ruleLabel,
        verdict: 'disproved',
        reason: `agent reaches a row deletion via: ${violation.path.join(' → ')}`,
        path: violation.path,
      };
    }
    return {
      ruleKind: rule.kind,
      ruleLabel,
      verdict: 'proved',
      reason: `no reachable code in agent '${agentDef.name}' deletes any rows`,
    };
  }

  if (rule.kind === 'dont_delete_without_where') {
    const violation = findCrudHitForRule(agentDef, new Set(['remove']), null, topLevel, /*requireEmptyCondition*/ true);
    if (violation) {
      return {
        ruleKind: rule.kind,
        ruleLabel,
        verdict: 'disproved',
        reason: `agent reaches an unconditional delete via: ${violation.path.join(' → ')}`,
        path: violation.path,
      };
    }
    return {
      ruleKind: rule.kind,
      ruleLabel,
      verdict: 'proved',
      reason: `every reachable delete in agent '${agentDef.name}' has a WHERE condition`,
    };
  }

  if (rule.kind === 'dont_update_without_where') {
    const violation = findCrudHitForRule(agentDef, new Set(['save', 'update']), null, topLevel, /*requireEmptyCondition*/ true);
    if (violation) {
      return {
        ruleKind: rule.kind,
        ruleLabel,
        verdict: 'disproved',
        reason: `agent reaches an unconditional update via: ${violation.path.join(' → ')}`,
        path: violation.path,
      };
    }
    return {
      ruleKind: rule.kind,
      ruleLabel,
      verdict: 'proved',
      reason: `every reachable update in agent '${agentDef.name}' has a WHERE condition`,
    };
  }

  if (rule.kind === 'dont_read_sensitive_tables' && Array.isArray(rule.tables)) {
    for (const table of rule.tables) {
      const violation = findCrudHitForRule(agentDef, new Set(['lookup']), table, topLevel);
      if (violation) {
        return {
          ruleKind: rule.kind,
          ruleLabel,
          verdict: 'disproved',
          reason: `agent reaches a read of sensitive table '${table}' via: ${violation.path.join(' → ')}`,
          path: violation.path,
        };
      }
    }
    return {
      ruleKind: rule.kind,
      ruleLabel,
      verdict: 'proved',
      reason: `no reachable code in agent '${agentDef.name}' reads any sensitive table: ${rule.tables.join(', ')}`,
    };
  }

  // Unknown rule kind — refuse to claim.
  return {
    ruleKind: rule.kind,
    ruleLabel,
    verdict: 'unverifiable',
    reason: `policy rule kind '${rule.kind}' has no static checker yet — falls through to runtime enforcement`,
  };
}

// Helper: walk the agent body + every reachable tool body for a CRUD node
// matching the given (ops, optionalEntity, optionalEmptyCondition) pattern.
// Returns { op, path } for the first violation, or null if none.
function findCrudHitForRule(agentDef, matchingOps, entityOrNull, topLevel, requireEmptyCondition = false) {
  const fnDefs = new Map();
  for (const node of topLevel) {
    if (node && node.type === 'function_def' && typeof node.name === 'string') {
      fnDefs.set(node.name, node);
    }
  }
  const seen = new Set();
  const startPath = [`agent '${agentDef.name}'`];

  // Walk agent body first
  const agentHit = findRuleViolation(agentDef.body || [], entityOrNull, matchingOps, fnDefs, seen, startPath, requireEmptyCondition);
  if (agentHit) return agentHit;

  // Then every reachable tool body
  const closure = collectAgentToolClosure(agentDef, topLevel);
  for (const tool of closure.entries) {
    const fnDef = fnDefs.get(tool.name);
    if (!fnDef) continue;
    const hit = findRuleViolation(fnDef.body || [], entityOrNull, matchingOps, fnDefs, seen, [...tool.path], requireEmptyCondition);
    if (hit) return hit;
  }
  return null;
}

function findRuleViolation(nodes, entityOrNull, matchingOps, fnDefs, seen, path, requireEmptyCondition) {
  if (!Array.isArray(nodes)) return null;
  for (const node of nodes) {
    const hit = findRuleViolationInNode(node, entityOrNull, matchingOps, fnDefs, seen, path, requireEmptyCondition);
    if (hit) return hit;
  }
  return null;
}

function findRuleViolationInNode(node, entityOrNull, matchingOps, fnDefs, seen, path, requireEmptyCondition) {
  if (!node || typeof node !== 'object') return null;
  if (node.type === 'crud' && matchingOps.has(node.operation)) {
    const entityMatches = entityOrNull === null ? true : _entitiesMatch(node.target, entityOrNull);
    const conditionMatches = !requireEmptyCondition || !node.condition;
    if (entityMatches && conditionMatches) {
      return {
        path: [...path, `${node.operation} ${node.target}${node.line ? ' @ line ' + node.line : ''}`],
        op: node.operation,
        line: node.line || 0,
      };
    }
  }
  const callName = extractCallName(node);
  if (callName && fnDefs.has(callName) && !seen.has(callName)) {
    seen.add(callName);
    const callee = fnDefs.get(callName);
    const calleePath = [...path, `function ${callName}()`];
    const hit = findRuleViolation(callee.body || [], entityOrNull, matchingOps, fnDefs, seen, calleePath, requireEmptyCondition);
    if (hit) return hit;
  }
  if (node.expression) {
    const hit = findRuleViolationInNode(node.expression, entityOrNull, matchingOps, fnDefs, seen, path, requireEmptyCondition);
    if (hit) return hit;
  }
  for (const key of ['body', 'thenBody', 'elseBody', 'thenBranch', 'otherwiseBranch', 'then', 'otherwise', 'args']) {
    if (Array.isArray(node[key])) {
      const hit = findRuleViolation(node[key], entityOrNull, matchingOps, fnDefs, seen, path, requireEmptyCondition);
      if (hit) return hit;
    }
  }
  return null;
}

function formatPolicyRuleLabel(rule) {
  if (rule.kind === 'protect_tables') return `protect tables ${(rule.tables || []).join(', ')}`;
  if (rule.kind === 'dont_read_sensitive_tables') return `block reads on ${(rule.tables || []).join(', ')}`;
  if (rule.kind === 'block_prompt_injection') {
    return rule.fields ? `block prompt injection on ${rule.fields.join(', ')}` : 'block prompt injection';
  }
  if (rule.kind === 'maintenance_window') return `maintenance window ${rule.start}-${rule.end}`;
  if (rule.kind === 'require_clearance') return `require clearance ${rule.level}`;
  return rule.kind.replace(/_/g, ' ');
}

function describeRuleDomain(kind) {
  if (kind === 'block_ddl') return 'execute raw SQL or DDL — every database op goes through CRUD primitives';
  if (kind.startsWith('dont_push_to_main') || kind.startsWith('dont_merge_to_main') || kind === 'dont_delete_branch' || kind === 'max_files_per_commit' || kind === 'require_branch_prefix') return 'invoke git operations';
  if (kind === 'dont_delete_file' || kind === 'restrict_paths' || kind === 'block_extensions') return 'manipulate the filesystem directly';
  return 'invoke this category of operation';
}

function extractCallName(node) {
  if (!node || typeof node !== 'object') return null;
  if (node.type === 'call' && typeof node.name === 'string') return node.name;
  if (node.type === 'call' && typeof node.functionName === 'string') return node.functionName;
  // Bare expressions sometimes wrap calls — e.g. an ASSIGN's `expression`
  // can be a CALL node directly.
  if (node.expression) return extractCallName(node.expression);
  return null;
}

// Build the recursive tool closure for an agent.
//
// Sources:
//   1. agent.tools          — entries shaped { type: 'ref', name: string }
//                             from `has tools: fn1, fn2`
//   2. agent.skills         — list of skill name strings from `uses skills: 'X'`
//                             For each, find the matching SKILL node at top
//                             level and pull its `.tools` entries (string list).
//   3. (transitive)          Skills don't currently chain to other skills in
//                             Clear's grammar — `skill` bodies declare tools
//                             and instructions, not nested skill use. If that
//                             changes, this walker will need to recurse on
//                             skills found inside skills.
//
// Returns { entries: [{name, path: string[]}, ...] } where `path` records
// how the tool entered scope. Used by the disproved verdict so a developer
// can see exactly why the closure includes a forbidden action.
function collectAgentToolClosure(agentDef, topLevel) {
  const entries = [];
  const seen = new Set();
  const agentLabel = `agent '${agentDef.name}'`;

  // Direct tools
  if (Array.isArray(agentDef.tools)) {
    for (const tool of agentDef.tools) {
      const name = tool && typeof tool === 'object' ? tool.name : tool;
      if (typeof name !== 'string' || seen.has(name)) continue;
      seen.add(name);
      entries.push({ name, path: [agentLabel, `has tool: ${name}`] });
    }
  }

  // Tools brought in by skills
  if (Array.isArray(agentDef.skills)) {
    for (const skillName of agentDef.skills) {
      const skillDef = topLevel.find(
        n => n && n.type === 'skill' && typeof n.name === 'string' &&
             n.name === skillName
      );
      if (!skillDef || !Array.isArray(skillDef.tools)) continue;
      for (const skillTool of skillDef.tools) {
        const name = typeof skillTool === 'string'
          ? skillTool
          : (skillTool && skillTool.name);
        if (typeof name !== 'string' || seen.has(name)) continue;
        seen.add(name);
        entries.push({
          name,
          path: [agentLabel, `uses skills: '${skillName}'`, `has tool: ${name}`],
        });
      }
    }
  }

  return { entries };
}

function countBoundVerdicts(boundClaims) {
  const counts = { proved: 0, disproved: 0, unverifiable: 0, total: boundClaims.length };
  for (const c of boundClaims) {
    if (c.verdict === 'proved') counts.proved++;
    else if (c.verdict === 'disproved') counts.disproved++;
    else if (c.verdict === 'unverifiable') counts.unverifiable++;
  }
  return counts;
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
  // Track sibling statements that appear BEFORE each rule_def so the
  // bounds_agent_output check (below) can ask "did an agent call happen
  // upstream in this same body?". Reset per body — a rule in one
  // endpoint can't see agent calls in an unrelated endpoint.
  const precedingSiblings = [];
  for (const node of nodes) {
    if (!node || typeof node !== 'object') continue;
    if (node.type === 'rule_def') {
      // Detect: is there an agent invocation among the statements that
      // ran in this same body BEFORE this rule? If yes, the rule's
      // structural guarantee extends to agent-produced RETURN VALUES —
      // every agent output flows through this rule before the next line
      // runs. BUT: if any of the called agents has tools (`has tool: ...`),
      // those tool calls happen DURING the agent's execution, before the
      // rule fires — and the rule cannot retroactively undo a Stripe
      // charge or a row deletion. So we only claim the bounds property
      // when EVERY called agent is output-only (no tools). For tool-using
      // agents, the rule still PROVES, but without the misleading bounds
      // claim. Use `must not:` on the agent for tool-action guarantees.
      const hasAgentCall = containsAgentInvocation(precedingSiblings);
      const anyAgentHasTools = hasAgentCall && containsToolUsingAgent(precedingSiblings, ast);
      const boundsAgent = hasAgentCall && !anyAgentHasTools;
      out.push(proveRule(node, ast, { boundsAgentOutput: boundsAgent }));
      precedingSiblings.push(node);
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
    precedingSiblings.push(node);
  }
}

// Walk a list of statement nodes and return true if ANY of them — at any
// depth — contains an agent invocation. Two shapes count:
//   - `run_agent`  → `call 'AgentName' with X` (named-agent dispatch).
//   - `ask_ai`     → `ask claude '…'` directly (the agent's own body, or
//                    an inline AI call in a request handler).
// Both wrap inside `assign` (e.g. `drafted = call 'X' with deal`), so the
// walker descends through `expression` and the standard container fields.
//
// This is the upstream half of the bounds_agent_output check: when a rule
// follows one of these in the same body, the rule's runtime gate filters
// every agent output before the next line runs. The agent is opaque, but
// the rule's structural proof says "you cannot get past this without
// satisfying the guard" — which is exactly the regulated-tier pitch.
// Walk a list of statement nodes and return true if ANY agent invocation
// inside them references a named agent (via `call 'AgentName' with X`)
// whose definition has tools (`has tool: ...` or `has tools: ...`). Used
// by the bounds_agent_output check to refuse the bounds claim when any
// downstream agent could mutate state through a tool BEFORE the rule
// fires. Direct `ask claude '...'` calls don't count — they have no tool
// loop and are output-only.
//
// `ast` is the top-level AST so we can look up agent definitions by
// name. Without it, every named-agent invocation would have to be
// treated conservatively as tool-using; with it, we can confirm
// output-only agents and keep the bounds claim honest.
function containsToolUsingAgent(nodes, ast) {
  if (!Array.isArray(nodes) || !ast) return false;
  // Build a lookup: agent name (lowercased, space-collapsed) → agent node.
  // Agent definitions live at top level of the parsed AST. The `ast`
  // parameter is the parser result; top-level statements are at `ast.body`
  // when called from `collectRuleDefs(ast.body, rules, ast)`.
  const agentDefs = new Map();
  const topLevel = Array.isArray(ast) ? ast : (Array.isArray(ast.body) ? ast.body : []);
  for (const top of topLevel) {
    if (top && top.type === 'agent' && typeof top.name === 'string') {
      agentDefs.set(top.name.toLowerCase().replace(/\s+/g, '_'), top);
    }
  }
  function nodeHasToolUsingAgentCall(node) {
    if (!node || typeof node !== 'object') return false;
    if (node.type === 'run_agent' && typeof node.agentName === 'string') {
      const key = node.agentName.toLowerCase().replace(/\s+/g, '_');
      const def = agentDefs.get(key);
      if (def && Array.isArray(def.tools) && def.tools.length > 0) return true;
    }
    if (node.expression && nodeHasToolUsingAgentCall(node.expression)) return true;
    if (Array.isArray(node.body) && node.body.some(nodeHasToolUsingAgentCall)) return true;
    if (Array.isArray(node.thenBody) && node.thenBody.some(nodeHasToolUsingAgentCall)) return true;
    if (Array.isArray(node.elseBody) && node.elseBody.some(nodeHasToolUsingAgentCall)) return true;
    if (Array.isArray(node.thenBranch) && node.thenBranch.some(nodeHasToolUsingAgentCall)) return true;
    if (Array.isArray(node.otherwiseBranch) && node.otherwiseBranch.some(nodeHasToolUsingAgentCall)) return true;
    if (Array.isArray(node.args) && node.args.some(nodeHasToolUsingAgentCall)) return true;
    return false;
  }
  return nodes.some(nodeHasToolUsingAgentCall);
}

function containsAgentInvocation(nodes) {
  if (!Array.isArray(nodes)) return false;
  for (const node of nodes) {
    if (containsAgentInvocationNode(node)) return true;
  }
  return false;
}

function containsAgentInvocationNode(node) {
  if (!node || typeof node !== 'object') return false;
  if (node.type === 'run_agent' || node.type === 'ask_ai') return true;
  // Assignment / return / similar wrappers carry their RHS under
  // `expression`. Without descending here, `drafted = call 'X' with deal`
  // would look pure to the detector.
  if (node.expression && containsAgentInvocationNode(node.expression)) return true;
  // Conditional + container shapes — a rule downstream of an `if` whose
  // branches each call an agent should still flag (every reachable path
  // produced agent output before the rule fires).
  if (Array.isArray(node.body) && containsAgentInvocation(node.body)) return true;
  if (Array.isArray(node.thenBody) && containsAgentInvocation(node.thenBody)) return true;
  if (Array.isArray(node.elseBody) && containsAgentInvocation(node.elseBody)) return true;
  if (Array.isArray(node.thenBranch) && containsAgentInvocation(node.thenBranch)) return true;
  if (Array.isArray(node.otherwiseBranch) && containsAgentInvocation(node.otherwiseBranch)) return true;
  if (Array.isArray(node.args)) {
    for (const a of node.args) {
      if (containsAgentInvocationNode(a)) return true;
    }
  }
  return false;
}

function proveRule(ruleNode, ast, options = {}) {
  const name = ruleNode.name || '<unnamed>';
  const line = ruleNode.line || 0;
  // Set when an agent call (`call 'X' with Y` or `ask claude '…'`) appears
  // earlier in the same body. Surfaced on PROVED verdicts only — the
  // claim only makes sense for rules whose guards actually held; saying
  // an UNVERIFIABLE rule "bounds the agent" would be a false promise.
  const boundsAgentOutput = options.boundsAgentOutput === true;

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
    ...(boundsAgentOutput ? { bounds_agent_output: true } : {}),
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

async function proveTest(testNode, env, ast) {
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
      return await proveTestSymbolic(testNode, ast, [err.name]);
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

async function proveTestSymbolic(testNode, ast, knownFreeVars) {
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
        const verdict = await symVerdict(stmt.check, left, right);
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

async function symVerdict(check, left, right) {
  // `observed`/`expected` are the human-readable simplified forms (display only).
  // The decision — does this hold for ALL inputs? — goes to the Z3 backend.
  const observed = simplify(left);
  const expected = simplify(right);

  let solved;
  if (check === 'eq') {
    solved = await proveEquals(left, right);
  } else if (['neq', 'gt', 'gte', 'lt', 'lte'].includes(check)) {
    solved = await proveCompare(check, left, right);
  } else {
    return { passed: false, unknown: true, observed, expected, check };
  }

  if (solved.unknown) return { passed: false, unknown: true, observed, expected, check };
  const verdict = solved.passed
    ? { passed: true, observed, expected, check }
    : { passed: false, observed, expected, check };
  // Surface the Z3 counterexample on a failing verdict (additive — old callers ignore it).
  if (!solved.passed && solved.observed) verdict.counterexample = solved.observed;
  return verdict;
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

  // Agent tool-bound claims (2026-05-07). Render the same way as rules — one
  // line per claim plus a totals line. The regulated-tier pitch sits here:
  // a CRO can read "Refund Bot cannot delete from Deals — PROVED" as a
  // mathematical guarantee, with the closure size telling them how many
  // tools the proof had to walk.
  if (Array.isArray(bundle.boundClaims) && bundle.boundClaims.length > 0) {
    lines.push('Agent tool-bound claims:');
    for (const c of bundle.boundClaims) {
      lines.push(`  ${formatBoundClaimVerdict(c)}`);
    }
    const counts = bundle.boundCounts;
    if (counts) {
      const totalsParts = [`${counts.proved} of ${counts.total} agent claims proved`];
      if (counts.unverifiable > 0) totalsParts.push(`${counts.unverifiable} unverifiable`);
      if (counts.disproved > 0)    totalsParts.push(`${counts.disproved} disproved`);
      lines.push(`  ${totalsParts.join('. ')}.`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

function formatBoundClaimVerdict(claim) {
  const badge =
    claim.verdict === 'proved'       ? '[PROVED]      ' :
    claim.verdict === 'disproved'    ? '[DISPROVED]   ' :
    claim.verdict === 'unverifiable' ? '[UNVERIFIABLE]' :
                                       '[UNKNOWN]     ';
  const action =
    claim.claimKind === 'call'   ? `cannot call '${claim.target}'` :
    claim.claimKind === 'delete' ? `cannot delete from '${claim.target}'` :
    claim.claimKind === 'modify' ? `cannot modify '${claim.target}'` :
    claim.claimKind === 'call_with_constraint' && claim.constraint
      ? `cannot call '${claim.target}' with ${claim.constraint.argName} ${claim.constraint.op} ${claim.constraint.valueIsString ? `'${claim.constraint.value}'` : claim.constraint.value}`
      : claim.claimKind === 'upholds_policies'
        ? `upholds all policies`
        : `cannot affect '${claim.target}'`;
  const reason = claim.reason ? ` — ${claim.reason}` : '';
  let main = `${badge} agent '${claim.agentName}' ${action} (line ${claim.line || '?'})${reason}`;
  if (Array.isArray(claim.subverdicts) && claim.subverdicts.length > 0) {
    for (const sub of claim.subverdicts) {
      const subBadge =
        sub.verdict === 'proved'       ? '    [proved]      ' :
        sub.verdict === 'disproved'    ? '    [disproved]   ' :
        sub.verdict === 'unverifiable' ? '    [unverifiable]' :
                                         '    [unknown]     ';
      const subReason = sub.reason ? ` — ${sub.reason}` : '';
      main += `\n${subBadge} ${sub.ruleLabel}${subReason}`;
    }
  }
  return main;
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

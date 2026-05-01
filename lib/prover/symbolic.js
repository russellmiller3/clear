// =============================================================================
// CLEAR PROVER — Symbolic mode
// =============================================================================
//
// The "for ALL inputs" proof. Where concrete mode binds test variables to
// specific numbers and walks the function, symbolic mode binds variables to
// SYMBOLIC PLACEHOLDERS, walks the function, and produces a symbolic
// expression. Proving an assertion then becomes proving symbolic equality.
//
// Example: proving `add(a, b) === add(b, a)` for any a, b:
//   - symbolic eval of add(a, b) → BinOp(+, a, b)
//   - symbolic eval of add(b, a) → BinOp(+, b, a)
//   - simplify both into canonical form → both become "a + b" (sorted)
//   - check structural equality → PROVED for all inputs
//
// Scope tonight: pure arithmetic functions only (no conditionals, no loops,
// no data structures). Conditionals require case-splitting which is a
// significantly bigger lift — staged for the next session.
// =============================================================================

// =============================================================================
// SYMBOLIC VALUE TYPES
// =============================================================================
//
// Sym values form a small algebra:
//   { kind: 'lit', value }              — concrete number/string/bool
//   { kind: 'sym', name }                — unbound placeholder
//   { kind: 'op',  op, args }            — n-ary operation; args are sym values

export const Lit = (value) => ({ kind: 'lit', value });
export const Sym = (name)  => ({ kind: 'sym', name });
export const Op  = (op, ...args) => ({ kind: 'op', op, args });

// Piecewise value — represents "if cond then ifTrue else ifFalse" when
// the condition can't be decided concretely. Used by the symbolic
// evaluator when it walks an `if_then` whose condition depends on free
// variables.
export const Phi = (cond, ifTrue, ifFalse) => ({ kind: 'phi', cond, ifTrue, ifFalse });

// Returned when symbolic mode meets a node it can't handle. The caller
// falls back to concrete-mode for that test or marks it unprovable.
export class SymbolicLimit extends Error {
  constructor(reason, line) {
    super(`Symbolic limit: ${reason}${line ? ` (line ${line})` : ''}`);
    this.reason = reason;
    this.line = line;
  }
}

// =============================================================================
// SYMBOLIC EVALUATOR
// =============================================================================

const ALLOWED_NODE_TYPES = new Set([
  'literal_number', 'literal_string', 'literal_boolean', 'literal_nothing',
  'variable_ref', 'binary_op', 'unary_op', 'call',
  'assign', 'return', 'respond',
  'function_def', 'comment',
  'if_then',
]);

export function evaluateSymbolic(node, env) {
  if (!node) return Lit(null);
  if (!ALLOWED_NODE_TYPES.has(node.type)) {
    throw new SymbolicLimit(`unsupported node '${node.type}'`, node.line);
  }
  const handler = HANDLERS[node.type];
  return handler(node, env);
}

const RETURNED = Symbol('RETURNED');

const HANDLERS = {
  literal_number:  (n) => Lit(n.value),
  literal_string:  (n) => Lit(n.value),
  literal_boolean: (n) => Lit(n.value),
  literal_nothing: ()  => Lit(null),

  variable_ref: (n, env) => {
    if (env.vars.has(n.name)) return env.vars.get(n.name);
    // Free variable in symbolic context — treat as a forall-quantified placeholder.
    const placeholder = Sym(n.name);
    env.vars.set(n.name, placeholder);
    env.freeVars.add(n.name);
    return placeholder;
  },

  binary_op: (n, env) => {
    const left  = evaluateSymbolic(n.left,  env);
    const right = evaluateSymbolic(n.right, env);
    return simplify(Op(n.operator, left, right));
  },

  unary_op: (n, env) => {
    const operand = evaluateSymbolic(n.operand ?? n.expression, env);
    return simplify(Op(n.operator, operand));
  },

  call: (n, env) => {
    const fn = env.functions.get(n.name);
    if (!fn) {
      // Unknown function — treat as an opaque symbolic call. Lets us still
      // express claims like `f(a) === f(a)` even if we don't know `f`.
      const args = (n.args || []).map(a => evaluateSymbolic(a, env));
      return Op(`call:${n.name}`, ...args);
    }
    const args = (n.args || []).map(a => evaluateSymbolic(a, env));
    return callFunctionSym(fn, args, env);
  },

  assign: (n, env) => {
    const value = evaluateSymbolic(n.expression, env);
    env.vars.set(n.name, value);
    return value;
  },

  return:  (n, env) => { env.returnValue = evaluateSymbolic(n.expression, env); return RETURNED; },
  respond: (n, env) => { env.returnValue = evaluateSymbolic(n.expression, env); return RETURNED; },

  // Conditional handler — case-splits when the condition is symbolic.
  //
  // Three cases:
  //   1. Condition simplifies to a concrete true/false → take that branch.
  //   2. Condition is symbolic + both branches return → the function-level
  //      return becomes Phi(cond, returnIfTrue, returnIfFalse).
  //   3. Anything else (mutations inside branches, mixed return shapes) →
  //      throw SymbolicLimit so the caller falls back to concrete mode
  //      (or marks the test unverifiable). Tomorrow's work expands case 3.
  if_then: (n, env) => {
    const cond = simplify(evaluateSymbolic(n.condition, env));
    if (cond.kind === 'lit') {
      const branch = cond.value ? n.thenBranch : n.otherwiseBranch;
      if (!branch) return Lit(null);
      const stmts = Array.isArray(branch) ? branch : [branch];
      for (const stmt of stmts) {
        if (evaluateSymbolic(stmt, env) === RETURNED) return RETURNED;
      }
      return Lit(null);
    }
    // Symbolic condition — clone env for each branch, walk each, and combine.
    const thenEnv  = cloneEnv(env);
    const elseEnv  = cloneEnv(env);
    const thenStmts = n.thenBranch ? (Array.isArray(n.thenBranch) ? n.thenBranch : [n.thenBranch]) : [];
    const elseStmts = n.otherwiseBranch ? (Array.isArray(n.otherwiseBranch) ? n.otherwiseBranch : [n.otherwiseBranch]) : [];

    let thenReturned = false, elseReturned = false;
    for (const stmt of thenStmts) {
      if (evaluateSymbolic(stmt, thenEnv) === RETURNED) { thenReturned = true; break; }
    }
    for (const stmt of elseStmts) {
      if (evaluateSymbolic(stmt, elseEnv) === RETURNED) { elseReturned = true; break; }
    }

    // The simplest, most useful pattern: BOTH branches return.
    // Function-level return becomes Phi.
    if (thenReturned && elseReturned) {
      env.returnValue = simplify(Phi(cond, thenEnv.returnValue, elseEnv.returnValue));
      return RETURNED;
    }
    // Only one side returned, or neither — symbolic-limit so we don't make
    // a false claim about the merged variable state.
    if (thenReturned !== elseReturned) {
      throw new SymbolicLimit('one branch returns and the other does not — symbolic merge unsupported', n.line);
    }
    // Neither returned. If both branches assigned the same variables to the
    // same symbolic values, merge is trivial; if they diverge, give up.
    mergeEnvs(env, thenEnv, elseEnv, cond, n.line);
    return Lit(null);
  },

  function_def: () => Lit(null),
  comment:      () => Lit(null),
};

function cloneEnv(env) {
  return {
    vars: new Map(env.vars),
    functions: env.functions,
    freeVars: env.freeVars,
    returnValue: env.returnValue,
  };
}

function mergeEnvs(target, thenEnv, elseEnv, cond, line) {
  const allKeys = new Set([...thenEnv.vars.keys(), ...elseEnv.vars.keys()]);
  for (const key of allKeys) {
    const t = thenEnv.vars.get(key);
    const e = elseEnv.vars.get(key);
    if (t === undefined || e === undefined) {
      throw new SymbolicLimit(`variable '${key}' assigned on only one branch`, line);
    }
    if (sameSym(t, e)) {
      target.vars.set(key, t);
    } else {
      target.vars.set(key, simplify(Phi(cond, t, e)));
    }
  }
}

function callFunctionSym(fn, args, env) {
  const inner = {
    vars: new Map(),
    functions: env.functions,
    freeVars: env.freeVars,
    returnValue: Lit(null),
  };
  for (let i = 0; i < fn.params.length; i++) {
    inner.vars.set(fn.params[i].name, args[i] ?? Lit(null));
  }
  for (const stmt of fn.body) {
    if (evaluateSymbolic(stmt, inner) === RETURNED) break;
  }
  return inner.returnValue;
}

// =============================================================================
// SIMPLIFIER
// =============================================================================
//
// Walks symbolic values, applies term-rewrite rules until stable. The goal
// is "canonical form" — two expressions that are mathematically equal end
// up byte-identical after simplification, so equality is structural.

export function simplify(value) {
  let prev;
  let curr = value;
  do {
    prev = curr;
    curr = simplifyOnce(curr);
  } while (!sameSym(prev, curr));
  return curr;
}

function simplifyOnce(value) {
  // Phi simplification: Phi(true, a, _) → a; Phi(false, _, b) → b;
  // Phi(c, a, a) → a (value doesn't depend on c).
  if (value.kind === 'phi') {
    const cond = simplify(value.cond);
    const t    = simplify(value.ifTrue);
    const e    = simplify(value.ifFalse);
    if (cond.kind === 'lit') return cond.value ? t : e;
    if (sameSym(t, e)) return t;
    return Phi(cond, t, e);
  }

  if (value.kind !== 'op') return value;

  // Recursively simplify sub-values first.
  const args = value.args.map(simplify);
  const op = value.op;

  // Constant folding: every arg is a literal → compute it.
  if (args.every(a => a.kind === 'lit')) {
    const folded = foldOp(op, args.map(a => a.value));
    if (folded !== undefined) return Lit(folded);
  }

  // Identity rules per operator.
  switch (op) {
    case '+': {
      // x + 0 → x.  Drop literal-zero terms.
      const nonZero = args.filter(a => !(a.kind === 'lit' && a.value === 0));
      if (nonZero.length === 0) return Lit(0);
      if (nonZero.length === 1) return nonZero[0];
      // Flatten nested + into a single n-ary sum.
      const flat = flatten('+', nonZero);
      // Collect like terms: x + x → 2*x, 2*x + 3*x → 5*x, etc.
      const collected = collectLikeTerms(flat);
      if (collected.length === 0) return Lit(0);
      if (collected.length === 1) return collected[0];
      return canonicalize('+', collected);
    }
    case '*': {
      // x * 0 → 0.
      if (args.some(a => a.kind === 'lit' && a.value === 0)) return Lit(0);
      // x * 1 → x.
      const nonOne = args.filter(a => !(a.kind === 'lit' && a.value === 1));
      if (nonOne.length === 0) return Lit(1);
      if (nonOne.length === 1) return nonOne[0];
      // Pull divisions out of the product: a * (b / d) * c → (a * b * c) / d.
      // This makes (2 * a * b) / 100 and 2 * ((a * b) / 100) reach the same
      // canonical form so claims that "commission is linear in deal value"
      // become provable.
      const pulled = pullDivisionsOut(nonOne);
      if (pulled) return simplify(pulled);
      const flat = flatten('*', nonOne);
      return canonicalize('*', flat);
    }
    case '-': {
      // x - 0 → x.
      if (args.length === 2 && args[1].kind === 'lit' && args[1].value === 0) return args[0];
      return Op(op, ...args);
    }
    case '/': {
      // x / 1 → x.
      if (args.length === 2 && args[1].kind === 'lit' && args[1].value === 1) return args[0];
      // 0 / x → 0 (assuming x is not zero — but the simplifier is happy
      // to claim 0 here; concrete-mode guard catches divide-by-zero anyway).
      if (args.length === 2 && args[0].kind === 'lit' && args[0].value === 0) return Lit(0);
      // (a / b) / c → a / (b * c) — collapse nested divisions.
      if (args.length === 2 && args[0].kind === 'op' && args[0].op === '/' && args[0].args.length === 2) {
        const inner = args[0];
        return simplify(Op('/', inner.args[0], simplify(Op('*', inner.args[1], args[1]))));
      }
      return Op(op, ...args);
    }
  }

  return Op(op, ...args);
}

// If any argument of a product is a division, pull the divisor out:
//   a * (b / d) → (a * b) / d
//   2 * (x / 100) → (2 * x) / 100
// Returns the rewritten Op, or null if no division was found.
function pullDivisionsOut(args) {
  let divisor = null;
  const numerators = [];
  for (const arg of args) {
    if (arg.kind === 'op' && arg.op === '/' && arg.args.length === 2) {
      // Combine multiple divisors by multiplication: a * (b/d1) * (c/d2) → (a*b*c) / (d1*d2)
      divisor = divisor === null ? arg.args[1] : Op('*', divisor, arg.args[1]);
      numerators.push(arg.args[0]);
    } else {
      numerators.push(arg);
    }
  }
  if (divisor === null) return null;
  const numeratorOp = numerators.length === 1 ? numerators[0] : Op('*', ...numerators);
  return Op('/', numeratorOp, divisor);
}

// Collect like terms in a sum: x + x → 2*x; 2*x + 3*x → 5*x; a + b + a → 2*a + b.
// Decomposes each term into (coefficient, body) so we can group by body.
//
// Decomposition rules:
//   Lit(n)                       → (n, ONE)         "ONE" is a sentinel for the constant body
//   Sym(x)                       → (1, Sym(x))
//   Op('*', Lit(n), rest...)     → (n, Op('*', rest...) or rest[0] if single)
//   Anything else                → (1, arg)         opaque body
function collectLikeTerms(args) {
  const groups = new Map(); // bodyKey → { coefficient, body }
  let constant = 0;

  for (const arg of args) {
    if (arg.kind === 'lit') {
      constant += arg.value;
      continue;
    }
    const { coefficient, body } = decomposeProduct(arg);
    const key = symKey(body);
    const existing = groups.get(key);
    if (existing) existing.coefficient += coefficient;
    else groups.set(key, { coefficient, body });
  }

  const out = [];
  if (constant !== 0) out.push(Lit(constant));
  for (const { coefficient, body } of groups.values()) {
    if (coefficient === 0) continue;
    if (coefficient === 1) out.push(body);
    else                    out.push(simplifyOnce(Op('*', Lit(coefficient), body)));
  }
  return out;
}

// Decompose a product into (coefficient, body). Coefficient is the leading
// literal factor if any; body is the rest of the product.
function decomposeProduct(node) {
  if (node.kind === 'op' && node.op === '*') {
    const lits = node.args.filter(a => a.kind === 'lit');
    const others = node.args.filter(a => a.kind !== 'lit');
    if (lits.length > 0) {
      const coefficient = lits.reduce((a, b) => a * b.value, 1);
      if (others.length === 0) return { coefficient, body: Lit(1) };
      if (others.length === 1) return { coefficient, body: others[0] };
      return { coefficient, body: Op('*', ...others) };
    }
  }
  return { coefficient: 1, body: node };
}

function flatten(op, args) {
  const out = [];
  for (const a of args) {
    if (a.kind === 'op' && a.op === op) out.push(...a.args);
    else out.push(a);
  }
  return out;
}

function canonicalize(op, args) {
  // Fold all literals into a single literal at the front, then sort
  // remaining args by stable string key. This makes `a + b` and `b + a`
  // structurally identical after simplification.
  const lits = args.filter(a => a.kind === 'lit');
  const others = args.filter(a => a.kind !== 'lit').sort(byKey);

  let folded;
  if (lits.length > 0) {
    folded = lits.reduce(
      (acc, lit) => foldOp(op, [acc, lit.value]),
      op === '+' ? 0 : 1
    );
  }

  const finalArgs = [];
  if (folded !== undefined && !(op === '+' && folded === 0) && !(op === '*' && folded === 1)) {
    finalArgs.push(Lit(folded));
  }
  finalArgs.push(...others);

  if (finalArgs.length === 0) return Lit(op === '+' ? 0 : 1);
  if (finalArgs.length === 1) return finalArgs[0];
  return Op(op, ...finalArgs);
}

function byKey(a, b) {
  return symKey(a).localeCompare(symKey(b));
}

function symKey(v) {
  if (v.kind === 'lit') return `lit:${typeof v.value}:${v.value}`;
  if (v.kind === 'sym') return `sym:${v.name}`;
  if (v.kind === 'op')  return `op:${v.op}:[${v.args.map(symKey).join(',')}]`;
  if (v.kind === 'phi') return `phi:${symKey(v.cond)}:?:${symKey(v.ifTrue)}:|:${symKey(v.ifFalse)}`;
  return '??';
}

function foldOp(op, vs) {
  switch (op) {
    case '+': return vs.reduce((a, b) => a + b);
    case '-': return vs.length === 2 ? vs[0] - vs[1] : undefined;
    case '*': return vs.reduce((a, b) => a * b);
    case '/': return vs.length === 2 && vs[1] !== 0 ? vs[0] / vs[1] : undefined;
    case '%': return vs.length === 2 ? vs[0] % vs[1] : undefined;
    case '==': case '=': case 'is':       return vs[0] === vs[1];
    case '!=': case 'is not':              return vs[0] !== vs[1];
    case '<':                               return vs[0] < vs[1];
    case '<=':                              return vs[0] <= vs[1];
    case '>':                               return vs[0] > vs[1];
    case '>=':                              return vs[0] >= vs[1];
    case '&&': case 'and':                  return Boolean(vs[0]) && Boolean(vs[1]);
    case '||': case 'or':                   return Boolean(vs[0]) || Boolean(vs[1]);
    case '!': case 'not':                   return !vs[0];
    case 'neg':                             return -vs[0];
    case '-' /* unary */:                   return vs.length === 1 ? -vs[0] : undefined;
    default: return undefined;
  }
}

// =============================================================================
// EQUALITY
// =============================================================================

export function sameSym(a, b) {
  if (a === b) return true;
  if (a.kind !== b.kind) return false;
  if (a.kind === 'lit') return Object.is(a.value, b.value);
  if (a.kind === 'sym') return a.name === b.name;
  if (a.kind === 'op') {
    if (a.op !== b.op || a.args.length !== b.args.length) return false;
    return a.args.every((arg, i) => sameSym(arg, b.args[i]));
  }
  if (a.kind === 'phi') {
    return sameSym(a.cond, b.cond)
        && sameSym(a.ifTrue, b.ifTrue)
        && sameSym(a.ifFalse, b.ifFalse);
  }
  return false;
}

/**
 * Prove that two symbolic values are mathematically equal under the
 * simplifier's term-rewrite rules. Returns true / false / 'unknown'.
 */
export function symEquals(a, b) {
  const sa = simplify(a);
  const sb = simplify(b);
  if (sameSym(sa, sb)) return true;
  // If both are literals and not equal, definitely not equal.
  if (sa.kind === 'lit' && sb.kind === 'lit') return false;

  // Phi vs anything: the equality holds iff it holds in both branches.
  if (sa.kind === 'phi') {
    const t = symEquals(sa.ifTrue, sb);
    const e = symEquals(sa.ifFalse, sb);
    if (t === true && e === true) return true;
    if (t === false || e === false) return false;
    return 'unknown';
  }
  if (sb.kind === 'phi') {
    return symEquals(sb, sa);
  }

  // Otherwise: the simplifier didn't reach a verdict.
  return 'unknown';
}

// =============================================================================
// PUBLIC: prove that a function body matches a symbolic spec
// =============================================================================
//
// Used internally by index.js when a test contains free variables.

export function buildSymEnv(programAst) {
  const env = {
    vars: new Map(),
    functions: new Map(),
    freeVars: new Set(),
    returnValue: Lit(null),
  };
  for (const node of programAst.body) {
    if (node.type === 'function_def') {
      env.functions.set(node.name, node);
    }
  }
  return env;
}

// =============================================================================
// CLEAR PROVER — Concrete-value evaluator
// =============================================================================
//
// Walks the AST directly, computing concrete values from concrete inputs.
// Bypasses the compiler entirely — the proof path never touches generated JS.
//
// Pure node types ONLY. If the walker hits anything that talks to the
// world (database, network, AI, email, time, randomness), it throws
// ImpurityError with the offending node's name. The caller catches that
// and marks the proof as UNVERIFIABLE rather than wrong.
//
// This is the core verification engine. Future symbolic-mode (proves for
// ALL inputs, not just concrete ones) plugs into the same shape — the
// `value` becomes a symbolic expression instead of a number.
// =============================================================================

export class ImpurityError extends Error {
  constructor(reason, line) {
    super(`Impure: ${reason}${line ? ` (line ${line})` : ''}`);
    this.reason = reason;
    this.line = line;
  }
}

export class UndefinedRefError extends Error {
  constructor(name, line) {
    super(`Undefined: '${name}'${line ? ` (line ${line})` : ''}`);
    this.name = name;
    this.line = line;
  }
}

// Sentinel returned when a function explicitly returns/responds.
// Distinct from `undefined` so a function returning nothing doesn't get confused.
const RETURNED = Symbol('RETURNED');

// =============================================================================
// IMPURE NODE TYPES — anything that touches the world
// =============================================================================
//
// If the walker sees one of these inside a function body, the function is
// not provable. The check is by-name: as the language grows, new effectful
// node types should be added here. Anything NOT in this set is presumed pure.

const IMPURE_NODE_TYPES = new Set([
  'ask_ai',
  'run_agent',
  'parallel_agents',
  'pipeline',
  'run_pipeline',
  'mock_ai',
  'classify',
  'http_test_call',
  'expect_response',
  'crud',
  'data_shape',
  'database_decl',
  'endpoint',
  'respond_http',
  'send_email',
  'subscribe',
  'broadcast',
  'every_seconds',
  'toast',
  'show',
  'workflow',
  'run_workflow',
  'human_confirm',
  'service_call',
  'use',
  'script',
  'run_command',
  'store',
  'restore',
]);

// =============================================================================
// PUBLIC: evaluate(node, env)
// =============================================================================

export function evaluate(node, env) {
  if (node === null || node === undefined) return null;
  if (IMPURE_NODE_TYPES.has(node.type)) {
    throw new ImpurityError(node.type, node.line);
  }
  const handler = HANDLERS[node.type];
  if (!handler) {
    throw new ImpurityError(`unknown node type '${node.type}'`, node.line);
  }
  return handler(node, env);
}

// =============================================================================
// HANDLERS — one per pure node type
// =============================================================================

const HANDLERS = {
  literal_number:  (n) => n.value,
  literal_string:  (n) => n.value,
  literal_boolean: (n) => n.value,
  literal_nothing: ()  => null,

  literal_list: (n, env) => {
    if (!Array.isArray(n.value)) return [];
    return n.value.map(item => evaluate(item, env));
  },

  variable_ref: (n, env) => {
    if (env.vars.has(n.name)) return env.vars.get(n.name);
    throw new UndefinedRefError(n.name, n.line);
  },

  binary_op: (n, env) => {
    const left  = evaluate(n.left,  env);
    const right = evaluate(n.right, env);
    return applyBinary(n.operator, left, right, n.line);
  },

  unary_op: (n, env) => {
    const operand = evaluate(n.operand ?? n.expression, env);
    return applyUnary(n.operator, operand, n.line);
  },

  call: (n, env) => {
    const fn = env.functions.get(n.name);
    if (!fn) throw new UndefinedRefError(`function '${n.name}'`, n.line);
    const args = (n.args || []).map(a => evaluate(a, env));
    return callFunction(fn, args, env);
  },

  assign: (n, env) => {
    const value = evaluate(n.expression, env);
    env.vars.set(n.name, value);
    return value;
  },

  return: (n, env) => {
    const value = evaluate(n.expression, env);
    env.returnValue = value;
    return RETURNED;
  },

  // `send back X` produces a respond node with status null in pure (non-endpoint) context
  respond: (n, env) => {
    const value = evaluate(n.expression, env);
    env.returnValue = value;
    return RETURNED;
  },

  if_then: (n, env) => {
    const cond = evaluate(n.condition, env);
    const branch = cond ? n.thenBranch : n.otherwiseBranch;
    if (!branch) return null;
    return walkBlock(Array.isArray(branch) ? branch : [branch], env);
  },

  comment: () => null,

  // `expect X` — tests-internal node. Caller handles assertion separately.
  expect: (n, env) => evaluate(n.expression, env),

  // `expect X is Y` — explicit assertion. We don't evaluate it here; the
  // proof obligation extractor pulls these out and proves them externally.
  unit_assert: (n, env) => {
    // Returning the structured pieces lets the prover compare them.
    return {
      kind: 'assertion',
      left:  evaluate(n.left,  env),
      check: n.check,
      right: evaluate(n.right, env),
    };
  },

  function_def: () => null,  // declarative, no value
  test_def:     () => null,
  program:      () => null,
};

// =============================================================================
// HELPERS
// =============================================================================

function applyBinary(op, left, right, line) {
  switch (op) {
    case '+':  return typeof left === 'string' || typeof right === 'string'
                 ? String(left) + String(right)
                 : left + right;
    case '-':  return left - right;
    case '*':  return left * right;
    case '/':  if (right === 0) throw new Error(`Division by zero (line ${line})`);
               return left / right;
    case '%':  return left % right;
    case '**': return left ** right;

    case '==': case '=': case 'is':       return left === right;
    case '!=': case 'is not':             return left !== right;
    case '<':                              return left < right;
    case '<=':                             return left <= right;
    case '>':                              return left > right;
    case '>=':                             return left >= right;

    case '&&': case 'and':                 return Boolean(left) && Boolean(right);
    case '||': case 'or':                  return Boolean(left) || Boolean(right);

    default:
      throw new Error(`Unknown binary operator '${op}' (line ${line})`);
  }
}

function applyUnary(op, operand, line) {
  switch (op) {
    case '-':                              return -operand;
    case '!': case 'not':                  return !operand;
    default:
      throw new Error(`Unknown unary operator '${op}' (line ${line})`);
  }
}

function callFunction(fn, args, env) {
  // Fresh scope inheriting the function table but with new vars.
  const innerEnv = {
    vars: new Map(),
    functions: env.functions,
    returnValue: null,
  };
  // Bind params
  for (let i = 0; i < fn.params.length; i++) {
    innerEnv.vars.set(fn.params[i].name, args[i]);
  }
  walkBlock(fn.body, innerEnv);
  return innerEnv.returnValue;
}

function walkBlock(stmts, env) {
  for (const stmt of stmts) {
    const result = evaluate(stmt, env);
    if (result === RETURNED) return env.returnValue;
  }
  return null;
}

// Public: build the env from a program AST so the caller doesn't have to.
export function buildEnv(programAst) {
  const env = { vars: new Map(), functions: new Map(), returnValue: null };
  for (const node of programAst.body) {
    if (node.type === 'function_def') {
      env.functions.set(node.name, node);
    }
  }
  return env;
}

// Public: walk a test body and collect every assertion outcome.
export function evaluateTest(testNode, env) {
  // Each test gets a fresh scope but inherits functions.
  const testEnv = {
    vars: new Map(),
    functions: env.functions,
    returnValue: null,
  };
  const assertions = [];
  for (const stmt of testNode.body) {
    if (stmt.type === 'unit_assert' || stmt.type === 'expect') {
      const result = evaluate(stmt, testEnv);
      assertions.push({
        line: stmt.line,
        result,
        sourceShape: stmt.type,
      });
    } else {
      evaluate(stmt, testEnv);
    }
  }
  return assertions;
}

export { RETURNED };

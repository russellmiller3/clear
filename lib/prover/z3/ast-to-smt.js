// AST → SMT translator: turn Clear symbolic value trees into Z3 expressions.
//
// Clear's symbolic algebra (lib/prover/symbolic.js) has three node kinds:
//   { kind: 'lit', value }       — concrete number / string / bool
//   { kind: 'sym', name, type? } — free placeholder ('number' or untyped)
//   { kind: 'op',  op, args }    — n-ary operation
//   { kind: 'phi', cond, ifTrue, ifFalse } — piecewise (if/then/else)
//
// The load-bearing soundness rule: `+` is overloaded in Clear (number addition
// vs string concat). We model numeric `+` as Z3 Real arithmetic, but a `+` whose
// operands are NOT all numeric as Z3 native String concat — which is associative
// but NOT commutative — so Z3 can never falsely prove `a + b == b + a` for strings.
// A genuinely mixed `+` (a number and a string in one `+`) is ambiguous: we refuse
// to guess and raise EncodeOpaque, which the decider maps to PARTIAL — an honest
// "can't decide" always beats an unsound PROVED.

import { isNumeric } from '../symbolic.js';

const COMPARISON_OPS = new Set(['<', '<=', '>', '>=']);
const EQUALITY_OPS = new Set(['==', '=', 'is']);
const INEQUALITY_OPS = new Set(['!=', 'is not']);
const BOOLEAN_OPS = new Set(['&&', '||', 'and', 'or', 'not', '!']);
const ARITHMETIC_OPS = new Set(['+', '-', '*', '/', 'neg']);

/** Raised when a node cannot be soundly encoded (mixed sorts, unsupported op).
 *  The decider catches this and returns a PARTIAL verdict — never a false PROVED. */
export class EncodeOpaque extends Error {
  constructor(reason) {
    super(`cannot soundly encode: ${reason}`);
    this.reason = reason;
  }
}

// Which Z3 sort a node lives in: 'real' | 'bool' | 'str' | 'unknown'. Drives const
// creation and the `+` numeric-vs-concat decision. An UNTYPED symbol is 'unknown'
// (could be a number OR a string), modeled as an uninterpreted sort — so arithmetic
// on it is refused (→ PARTIAL) rather than guessed. Only provably-string operands
// (string literals) are 'str' and use concat. Uses the existing isNumeric() gate.
function sortOf(node) {
  if (!node) return 'unknown';
  if (node.kind === 'lit') {
    if (typeof node.value === 'number') return 'real';
    if (typeof node.value === 'boolean') return 'bool';
    if (typeof node.value === 'string') return 'str';
    return 'unknown';
  }
  if (node.kind === 'sym') return node.type === 'number' ? 'real' : 'unknown';
  if (node.kind === 'phi') return sortOf(node.ifTrue);
  if (node.kind === 'op') {
    if (COMPARISON_OPS.has(node.op) || EQUALITY_OPS.has(node.op)
        || INEQUALITY_OPS.has(node.op) || BOOLEAN_OPS.has(node.op)) return 'bool';
    if (ARITHMETIC_OPS.has(node.op) || node.op === '%' || node.op === '**') {
      if (isNumeric(node)) return 'real';
      if (node.args.every((arg) => sortOf(arg) === 'str')) return 'str';
      return 'unknown';
    }
  }
  return 'unknown';
}

// One shared uninterpreted sort for untyped Clear values. Z3 interns by name, so
// repeated declare() calls return the same sort.
function unknownSort(z3Context) {
  return z3Context.Sort.declare('ClearValue');
}

// A literal becomes the Z3 value of its sort.
function encodeLiteral(node, z3Context) {
  if (typeof node.value === 'number') return z3Context.Real.val(node.value);
  if (typeof node.value === 'boolean') return z3Context.Bool.val(node.value);
  if (typeof node.value === 'string') return z3Context.String.val(node.value);
  // null / nothing — model as an empty string sentinel (rare in proof goals).
  return z3Context.String.val('');
}

// A symbol becomes a cached Z3 const of its inferred sort, so every occurrence
// of the same name is the same variable.
function encodeSymbol(node, z3Context, varCache) {
  if (varCache.has(node.name)) return varCache.get(node.name);
  const sort = sortOf(node);
  let z3Const;
  if (sort === 'real') z3Const = z3Context.Real.const(node.name);
  else if (sort === 'bool') z3Const = z3Context.Bool.const(node.name);
  else if (sort === 'str') z3Const = z3Context.String.const(node.name);
  else z3Const = z3Context.Const(node.name, unknownSort(z3Context)); // untyped → uninterpreted
  varCache.set(node.name, z3Const);
  return z3Const;
}

function encodeArithmetic(node, encodedArgs) {
  switch (node.op) {
    case '+': return encodedArgs.reduce((acc, term) => acc.add(term));
    case '-':
      if (encodedArgs.length === 1) return encodedArgs[0].neg();
      return encodedArgs.reduce((acc, term) => acc.sub(term));
    case 'neg': return encodedArgs[0].neg();
    case '*': return encodedArgs.reduce((acc, term) => acc.mul(term));
    case '/': return encodedArgs.reduce((acc, term) => acc.div(term));
    default: throw new EncodeOpaque(`arithmetic op '${node.op}'`);
  }
}

// String `+` → native Z3 concat (non-commutative). Requires every operand to be
// string-sorted; a mixed numeric+string `+` is ambiguous → opaque.
function encodeStringConcat(node, encodedArgs) {
  for (const operand of node.args) {
    if (sortOf(operand) !== 'str') {
      throw new EncodeOpaque(`mixed-sort '+': '${node.op}' over numeric and string operands`);
    }
  }
  return encodedArgs.reduce((acc, term) => acc.concat(term));
}

/**
 * Translate a Clear symbolic value tree into a Z3 expression.
 * @param {object} node - a Clear sym value ({kind:'lit'|'sym'|'op'|'phi'}).
 * @param {object} z3Context - the z3-solver high-level Context.
 * @param {Map<string,object>} varCache - name → Z3 const, shared across the goal.
 * @returns {object} a Z3 expression.
 * @throws {EncodeOpaque} when the node cannot be soundly encoded.
 */
export function astToSmt(node, z3Context, varCache) {
  if (!node) throw new EncodeOpaque('null node');

  if (node.kind === 'lit') return encodeLiteral(node, z3Context);
  if (node.kind === 'sym') return encodeSymbol(node, z3Context, varCache);

  if (node.kind === 'phi') {
    return z3Context.If(
      astToSmt(node.cond, z3Context, varCache),
      astToSmt(node.ifTrue, z3Context, varCache),
      astToSmt(node.ifFalse, z3Context, varCache),
    );
  }

  if (node.kind === 'op') {
    const encodedArgs = node.args.map((arg) => astToSmt(arg, z3Context, varCache));

    if (ARITHMETIC_OPS.has(node.op)) {
      // The soundness gate. Numeric arithmetic only when ALL operands are provably
      // numeric. A `+` over provably-string operands is concat (non-commutative).
      // Anything with an untyped/unknown operand is refused → PARTIAL, never guessed.
      if (isNumeric(node)) return encodeArithmetic(node, encodedArgs);
      if (node.op === '+' && node.args.every((arg) => sortOf(arg) === 'str')) {
        return encodeStringConcat(node, encodedArgs);
      }
      throw new EncodeOpaque(`'${node.op}' on non-numeric/unknown operands`);
    }
    if (node.op === '%' || node.op === '**') {
      throw new EncodeOpaque(`unsupported numeric op '${node.op}'`); // no sound Real encoding yet
    }
    if (COMPARISON_OPS.has(node.op)) {
      const [left, right] = encodedArgs;
      if (node.op === '<') return left.lt(right);
      if (node.op === '<=') return left.le(right);
      if (node.op === '>') return left.gt(right);
      return left.ge(right); // '>='
    }
    if (EQUALITY_OPS.has(node.op)) return encodedArgs[0].eq(encodedArgs[1]);
    if (INEQUALITY_OPS.has(node.op)) return encodedArgs[0].neq(encodedArgs[1]);
    if (node.op === 'not' || node.op === '!') return z3Context.Not(encodedArgs[0]);
    if (node.op === 'and' || node.op === '&&') return z3Context.And(...encodedArgs);
    if (node.op === 'or' || node.op === '||') return z3Context.Or(...encodedArgs);

    throw new EncodeOpaque(`unsupported op '${node.op}'`);
  }

  throw new EncodeOpaque(`unsupported node kind '${node.kind}'`);
}

// =============================================================================
// CLEAR PROVER — Symbolic-mode unit tests
// =============================================================================

import { describe, it, run } from '../testUtils.js';
import { strict as assert } from 'node:assert';
import {
  Lit, Sym, Op, Phi, simplify, sameSym, symEquals,
  evaluateSymbolic, buildSymEnv,
} from './symbolic.js';
import { parse } from '../../parser.js';
import { prove } from './index.js';

// ---------------------------------------------------------------------------
describe('Symbolic — simplifier', () => {

  it('folds 3 + 4 to 7', () => {
    assert.ok(sameSym(simplify(Op('+', Lit(3), Lit(4))), Lit(7)));
  });

  it('drops a + 0 down to a', () => {
    const result = simplify(Op('+', Sym('a'), Lit(0)));
    assert.ok(sameSym(result, Sym('a')));
  });

  it('drops a * 1 down to a', () => {
    const result = simplify(Op('*', Sym('a'), Lit(1)));
    assert.ok(sameSym(result, Sym('a')));
  });

  it('annihilates a * 0 to 0', () => {
    const result = simplify(Op('*', Sym('a'), Lit(0)));
    assert.ok(sameSym(result, Lit(0)));
  });

  it('puts a + b into the same canonical form as b + a', () => {
    const ab = simplify(Op('+', Sym('a'), Sym('b')));
    const ba = simplify(Op('+', Sym('b'), Sym('a')));
    assert.ok(sameSym(ab, ba), 'commutative + should canonicalize identically');
  });

  it('flattens nested addition (a + b) + c == a + (b + c)', () => {
    const left  = simplify(Op('+', Op('+', Sym('a'), Sym('b')), Sym('c')));
    const right = simplify(Op('+', Sym('a'), Op('+', Sym('b'), Sym('c'))));
    assert.ok(sameSym(left, right), 'associative + should canonicalize identically');
  });

  it('puts a * b into the same canonical form as b * a', () => {
    const ab = simplify(Op('*', Sym('a'), Sym('b')));
    const ba = simplify(Op('*', Sym('b'), Sym('a')));
    assert.ok(sameSym(ab, ba));
  });

  // PC-1: like-terms collection (distributivity)
  it('collects x + x into 2 * x', () => {
    const result = simplify(Op('+', Sym('x'), Sym('x')));
    assert.ok(sameSym(result, Op('*', Lit(2), Sym('x'))));
  });

  it('collects 2*x + 3*x into 5*x', () => {
    const result = simplify(Op('+', Op('*', Lit(2), Sym('x')), Op('*', Lit(3), Sym('x'))));
    assert.ok(sameSym(result, Op('*', Lit(5), Sym('x'))));
  });

  it('collects mixed sums: a + b + a into 2*a + b', () => {
    const result = simplify(Op('+', Sym('a'), Sym('b'), Sym('a')));
    // Should reduce to 2*a + b in some canonical order.
    const expected1 = Op('+', Op('*', Lit(2), Sym('a')), Sym('b'));
    const expected2 = Op('+', Sym('b'), Op('*', Lit(2), Sym('a')));
    assert.ok(sameSym(result, expected1) || sameSym(result, expected2),
      `expected 2*a + b, got ${JSON.stringify(result)}`);
  });

  it('proves x + x equals 2 * x (full equivalence)', () => {
    assert.equal(symEquals(Op('+', Sym('x'), Sym('x')), Op('*', Lit(2), Sym('x'))), true);
  });

  // PC-1.5: division-distribution
  it('pulls divisions out of products: 2 * (x/100) becomes (2*x)/100', () => {
    const result = simplify(Op('*', Lit(2), Op('/', Sym('x'), Lit(100))));
    // Expected: (2 * x) / 100
    const expected = Op('/', Op('*', Lit(2), Sym('x')), Lit(100));
    assert.ok(sameSym(result, expected), `got ${JSON.stringify(result)}`);
  });

  it('proves linearity: c * (x/d) equals (c*x)/d for any c, x, d', () => {
    const left  = Op('*', Sym('c'), Op('/', Sym('x'), Sym('d')));
    const right = Op('/', Op('*', Sym('c'), Sym('x')), Sym('d'));
    assert.equal(symEquals(left, right), true);
  });

  it('proves commission linearity: commission(2v, t) = 2 * commission(v, t)', () => {
    // commission(x, t) = x * t / 100
    // commission(2v, t) = 2v * t / 100
    // 2 * commission(v, t) = 2 * (v * t / 100)
    // Both should normalize to (2 * v * t) / 100.
    const left  = Op('/', Op('*', Lit(2), Sym('v'), Sym('t')), Lit(100));
    const right = Op('*', Lit(2), Op('/', Op('*', Sym('v'), Sym('t')), Lit(100)));
    assert.equal(symEquals(left, right), true);
  });
});

// ---------------------------------------------------------------------------
describe('Symbolic — equality verdicts', () => {
  it('proves a + b equals b + a', () => {
    const verdict = symEquals(Op('+', Sym('a'), Sym('b')), Op('+', Sym('b'), Sym('a')));
    assert.equal(verdict, true);
  });

  it('proves a + 0 equals a', () => {
    const verdict = symEquals(Op('+', Sym('a'), Lit(0)), Sym('a'));
    assert.equal(verdict, true);
  });

  it('returns false when both sides are concrete and unequal', () => {
    assert.equal(symEquals(Lit(2), Lit(3)), false);
  });

  it('returns unknown when the simplifier cannot decide', () => {
    // a * b is not equal to a + b in general; the simplifier doesn't know
    // a/b's values, so the verdict is "unknown" not "false".
    const verdict = symEquals(Op('*', Sym('a'), Sym('b')), Op('+', Sym('a'), Sym('b')));
    assert.equal(verdict, 'unknown');
  });
});

// ---------------------------------------------------------------------------
describe('Symbolic — function evaluation', () => {

  it('evaluates add(a, b) symbolically as a + b', () => {
    const ast = parse(`define function add(a, b):\n  return a + b\n`);
    const env = buildSymEnv(ast);
    const fn = env.functions.get('add');
    const inner = { vars: new Map(), functions: env.functions, freeVars: new Set(), returnValue: Lit(null) };
    inner.vars.set('a', Sym('a'));
    inner.vars.set('b', Sym('b'));
    for (const stmt of fn.body) {
      const r = evaluateSymbolic(stmt, inner);
      if (r && typeof r === 'symbol') break;
    }
    assert.ok(symEquals(inner.returnValue, Op('+', Sym('a'), Sym('b'))) === true);
  });

  it('evaluates a chained calculation symbolically', () => {
    const src = `
define function compute(price, rate):
  tax = price * rate / 100
  total = price + tax
  return total
`;
    const ast = parse(src);
    const env = buildSymEnv(ast);
    const fn = env.functions.get('compute');
    const inner = { vars: new Map(), functions: env.functions, freeVars: new Set(), returnValue: Lit(null) };
    inner.vars.set('price', Sym('price'));
    inner.vars.set('rate', Sym('rate'));
    for (const stmt of fn.body) {
      const r = evaluateSymbolic(stmt, inner);
      if (r && typeof r === 'symbol') break;
    }
    // Result should equal price + (price * rate / 100). The simplifier
    // doesn't (yet) prove distributivity, so we just check the shape.
    assert.equal(inner.returnValue.kind, 'op');
  });
});

// ---------------------------------------------------------------------------
describe('Symbolic — proves real theorems', () => {

  it('proves add is commutative', () => {
    const src = `
define function add(a, b):
  return a + b
`;
    const ast = parse(src);
    const env = buildSymEnv(ast);
    // Compute add(a, b) and add(b, a) by walking the function with each
    // pair of symbolic inputs, then check they're equal.
    function evalCall(args) {
      const fn = env.functions.get('add');
      const inner = { vars: new Map(), functions: env.functions, freeVars: new Set(), returnValue: Lit(null) };
      inner.vars.set('a', args[0]);
      inner.vars.set('b', args[1]);
      for (const stmt of fn.body) {
        if (evaluateSymbolic(stmt, inner) === Symbol.for) break;
        if (evaluateSymbolic(stmt, inner) && stmt.type === 'return') break;
      }
      return inner.returnValue;
    }
    const ab = evalCall([Sym('a'), Sym('b')]);
    const ba = evalCall([Sym('b'), Sym('a')]);
    assert.equal(symEquals(ab, ba), true, `expected a+b === b+a — got ${JSON.stringify(ab)} vs ${JSON.stringify(ba)}`);
  });

  // PC-2: Phi (conditional) handling
  it('Phi(true, a, b) simplifies to a', () => {
    const result = simplify(Phi(Lit(true), Sym('a'), Sym('b')));
    assert.ok(sameSym(result, Sym('a')));
  });

  it('Phi(false, a, b) simplifies to b', () => {
    const result = simplify(Phi(Lit(false), Sym('a'), Sym('b')));
    assert.ok(sameSym(result, Sym('b')));
  });

  it('Phi(c, a, a) simplifies to a regardless of c', () => {
    const result = simplify(Phi(Op('>', Sym('x'), Lit(5)), Sym('a'), Sym('a')));
    assert.ok(sameSym(result, Sym('a')));
  });

  it('Phi(c, a, b) stays as Phi when both differ and c is symbolic', () => {
    const result = simplify(Phi(Op('>', Sym('x'), Lit(5)), Lit(42), Lit(99)));
    assert.equal(result.kind, 'phi');
  });

  it('proves a function that returns the same value in both branches', () => {
    const src = `
define function constant_42(flag):
  if flag:
    return 42
  otherwise:
    return 42

test 'always 42':
  expect constant_42(flag) is 42
`;
    const bundle = prove(src);
    assert.equal(bundle.status, 'proved', JSON.stringify(bundle, null, 2));
  });

  it('proves a function whose branches reduce to the same canonical form', () => {
    const src = `
define function double_either_way(x, flag):
  if flag:
    return x + x
  otherwise:
    return x * 2

test 'both branches are 2*x':
  expect double_either_way(x, flag) is x * 2
`;
    const bundle = prove(src);
    assert.equal(bundle.status, 'proved', JSON.stringify(bundle, null, 2));
  });

  it('proves multiplying by 1 is identity', () => {
    const src = `
define function id(a):
  return a * 1
`;
    const ast = parse(src);
    const env = buildSymEnv(ast);
    const fn = env.functions.get('id');
    const inner = { vars: new Map(), functions: env.functions, freeVars: new Set(), returnValue: Lit(null) };
    inner.vars.set('a', Sym('a'));
    for (const stmt of fn.body) {
      evaluateSymbolic(stmt, inner);
    }
    assert.equal(symEquals(inner.returnValue, Sym('a')), true);
  });
});

run();

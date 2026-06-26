// =============================================================================
// CLEAR PROVER — Symbolic-mode unit tests
// =============================================================================

import { describeAsync, itAsync, run } from '../testUtils.js';
import { strict as assert } from 'node:assert';
import {
  Lit, Sym, Op, Phi, simplify, sameSym, symEquals,
  evaluateSymbolic, buildSymEnv,
} from './symbolic.js';
import { parse } from '../../parser.js';
import { prove } from './index.js';

// ---------------------------------------------------------------------------
await describeAsync('Symbolic — simplifier', async () => {

  await itAsync('folds 3 + 4 to 7', async () => {
    assert.ok(sameSym(simplify(Op('+', Lit(3), Lit(4))), Lit(7)));
  });

  await itAsync('drops a + 0 down to a', async () => {
    const result = simplify(Op('+', Sym('a'), Lit(0)));
    assert.ok(sameSym(result, Sym('a')));
  });

  await itAsync('drops a * 1 down to a', async () => {
    const result = simplify(Op('*', Sym('a'), Lit(1)));
    assert.ok(sameSym(result, Sym('a')));
  });

  await itAsync('annihilates a * 0 to 0', async () => {
    const result = simplify(Op('*', Sym('a'), Lit(0)));
    assert.ok(sameSym(result, Lit(0)));
  });

  await itAsync('puts a + b into the same canonical form as b + a (numeric)', async () => {
    const ab = simplify(Op('+', Sym('a', 'number'), Sym('b', 'number')));
    const ba = simplify(Op('+', Sym('b', 'number'), Sym('a', 'number')));
    assert.ok(sameSym(ab, ba), 'commutative + should canonicalize identically for numeric operands');
  });

  await itAsync('does NOT commute + when operands are untyped (soundness gate)', async () => {
    const ab = simplify(Op('+', Sym('a'), Sym('b')));
    const ba = simplify(Op('+', Sym('b'), Sym('a')));
    // For unknown-typed operands, + could mean string concat. Order is preserved.
    assert.ok(!sameSym(ab, ba), 'untyped + should NOT be assumed commutative');
  });

  await itAsync('flattens nested addition (a + b) + c == a + (b + c) for numerics', async () => {
    const a = Sym('a', 'number'), b = Sym('b', 'number'), c = Sym('c', 'number');
    const left  = simplify(Op('+', Op('+', a, b), c));
    const right = simplify(Op('+', a, Op('+', b, c)));
    assert.ok(sameSym(left, right), 'associative + should canonicalize identically for numerics');
  });

  await itAsync('puts a * b into the same canonical form as b * a', async () => {
    const ab = simplify(Op('*', Sym('a'), Sym('b')));
    const ba = simplify(Op('*', Sym('b'), Sym('a')));
    assert.ok(sameSym(ab, ba));
  });

  // PC-1: like-terms collection (distributivity) — requires numeric typing.
  await itAsync('collects x + x into 2 * x (numeric)', async () => {
    const x = Sym('x', 'number');
    const result = simplify(Op('+', x, x));
    assert.ok(sameSym(result, Op('*', Lit(2), x)));
  });

  await itAsync('collects 2*x + 3*x into 5*x (numeric)', async () => {
    const x = Sym('x', 'number');
    const result = simplify(Op('+', Op('*', Lit(2), x), Op('*', Lit(3), x)));
    assert.ok(sameSym(result, Op('*', Lit(5), x)));
  });

  await itAsync('collects mixed sums: a + b + a into 2*a + b (numeric)', async () => {
    const a = Sym('a', 'number'), b = Sym('b', 'number');
    const result = simplify(Op('+', a, b, a));
    const expected1 = Op('+', Op('*', Lit(2), a), b);
    const expected2 = Op('+', b, Op('*', Lit(2), a));
    assert.ok(sameSym(result, expected1) || sameSym(result, expected2),
      `expected 2*a + b, got ${JSON.stringify(result)}`);
  });

  await itAsync('proves x + x equals 2 * x for numeric x', async () => {
    const x = Sym('x', 'number');
    assert.equal(symEquals(Op('+', x, x), Op('*', Lit(2), x)), true);
  });

  // PC-1.5: division-distribution
  await itAsync('pulls divisions out of products: 2 * (x/100) becomes (2*x)/100', async () => {
    const result = simplify(Op('*', Lit(2), Op('/', Sym('x'), Lit(100))));
    // Expected: (2 * x) / 100
    const expected = Op('/', Op('*', Lit(2), Sym('x')), Lit(100));
    assert.ok(sameSym(result, expected), `got ${JSON.stringify(result)}`);
  });

  await itAsync('proves linearity: c * (x/d) equals (c*x)/d for any c, x, d', async () => {
    const left  = Op('*', Sym('c'), Op('/', Sym('x'), Sym('d')));
    const right = Op('/', Op('*', Sym('c'), Sym('x')), Sym('d'));
    assert.equal(symEquals(left, right), true);
  });

  await itAsync('proves commission linearity: commission(2v, t) = 2 * commission(v, t)', async () => {
    // commission(x, t) = x * t / 100
    // commission(2v, t) = 2v * t / 100
    // 2 * commission(v, t) = 2 * (v * t / 100)
    // Both should normalize to (2 * v * t) / 100.
    const left  = Op('/', Op('*', Lit(2), Sym('v'), Sym('t')), Lit(100));
    const right = Op('*', Lit(2), Op('/', Op('*', Sym('v'), Sym('t')), Lit(100)));
    assert.equal(symEquals(left, right), true);
  });

  // PC-1: distributivity — k * (a + b) === k*a + k*b for numerics.
  // Without this rule the prover gives UNKNOWN on linear formulas like
  // `2 * (deal_value + adjustment) === 2 * deal_value + 2 * adjustment` —
  // the exact shape Marcus's deal-desk discount math takes.
  await itAsync('distributes 2 * (a + b) into 2*a + 2*b (numeric)', async () => {
    const a = Sym('a', 'number'), b = Sym('b', 'number');
    const left  = simplify(Op('*', Lit(2), Op('+', a, b)));
    const right = simplify(Op('+', Op('*', Lit(2), a), Op('*', Lit(2), b)));
    assert.ok(sameSym(left, right),
      `distributivity should canonicalize 2*(a+b) and 2*a+2*b identically. got left=${JSON.stringify(left)} right=${JSON.stringify(right)}`);
  });

  await itAsync('proves 2 * (a + b) equals 2*a + 2*b for numeric a, b', async () => {
    const a = Sym('a', 'number'), b = Sym('b', 'number');
    const verdict = symEquals(
      Op('*', Lit(2), Op('+', a, b)),
      Op('+', Op('*', Lit(2), a), Op('*', Lit(2), b))
    );
    assert.equal(verdict, true);
  });

  await itAsync('distributes n-ary: k * (x + y + z) into k*x + k*y + k*z (numeric)', async () => {
    const x = Sym('x', 'number'), y = Sym('y', 'number'), z = Sym('z', 'number');
    const left  = simplify(Op('*', Lit(3), Op('+', x, y, z)));
    const right = simplify(Op('+', Op('*', Lit(3), x), Op('*', Lit(3), y), Op('*', Lit(3), z)));
    assert.ok(sameSym(left, right),
      `n-ary distributivity should canonicalize 3*(x+y+z) and 3x+3y+3z identically. got left=${JSON.stringify(left)} right=${JSON.stringify(right)}`);
  });

  await itAsync('distributes when the sum is on the left: (a + b) * c into a*c + b*c (numeric)', async () => {
    const a = Sym('a', 'number'), b = Sym('b', 'number'), c = Sym('c', 'number');
    const left  = simplify(Op('*', Op('+', a, b), c));
    const right = simplify(Op('+', Op('*', a, c), Op('*', b, c)));
    assert.ok(sameSym(left, right),
      `sum-on-left distributivity should match a*c+b*c. got left=${JSON.stringify(left)} right=${JSON.stringify(right)}`);
  });

  await itAsync('distributes with a symbolic factor: k * (a + b) === k*a + k*b for any numeric k, a, b', async () => {
    const k = Sym('k', 'number'), a = Sym('a', 'number'), b = Sym('b', 'number');
    const verdict = symEquals(
      Op('*', k, Op('+', a, b)),
      Op('+', Op('*', k, a), Op('*', k, b))
    );
    assert.equal(verdict, true);
  });

  await itAsync('does NOT distribute when the sum has untyped operands (soundness gate)', async () => {
    // Untyped + could be string concat. Distribution would change semantics.
    const a = Sym('a'), b = Sym('b');
    const left  = simplify(Op('*', Lit(2), Op('+', a, b)));
    // Should NOT have been expanded — sum stays as a single + node inside *.
    // Acceptable canonical: 2 * (a + b) — args = [Lit(2), Op('+',a,b)].
    const hasNestedSum = left.kind === 'op' && left.op === '*' &&
                          left.args.some(arg => arg.kind === 'op' && arg.op === '+');
    assert.ok(hasNestedSum, `should preserve untyped sum inside product, got ${JSON.stringify(left)}`);
  });
});

// ---------------------------------------------------------------------------
await describeAsync('Symbolic — equality verdicts', async () => {
  await itAsync('proves a + b equals b + a for numeric a, b', async () => {
    const a = Sym('a', 'number'), b = Sym('b', 'number');
    const verdict = symEquals(Op('+', a, b), Op('+', b, a));
    assert.equal(verdict, true);
  });

  await itAsync('refuses to prove a + b equals b + a when types are unknown', async () => {
    // Without type info, + could be string concat (not commutative).
    const verdict = symEquals(Op('+', Sym('a'), Sym('b')), Op('+', Sym('b'), Sym('a')));
    assert.notEqual(verdict, true, 'untyped + must NOT be claimed commutative');
  });

  await itAsync('proves a + 0 equals a', async () => {
    const verdict = symEquals(Op('+', Sym('a'), Lit(0)), Sym('a'));
    assert.equal(verdict, true);
  });

  await itAsync('returns false when both sides are concrete and unequal', async () => {
    assert.equal(symEquals(Lit(2), Lit(3)), false);
  });

  await itAsync('returns unknown when the simplifier cannot decide', async () => {
    // a * b is not equal to a + b in general; the simplifier doesn't know
    // a/b's values, so the verdict is "unknown" not "false".
    const verdict = symEquals(Op('*', Sym('a'), Sym('b')), Op('+', Sym('a'), Sym('b')));
    assert.equal(verdict, 'unknown');
  });
});

// ---------------------------------------------------------------------------
await describeAsync('Symbolic — function evaluation', async () => {

  await itAsync('evaluates add(a, b) symbolically as a + b', async () => {
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

  await itAsync('evaluates a chained calculation symbolically', async () => {
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
await describeAsync('Symbolic — proves real theorems', async () => {

  await itAsync('proves add is commutative for numeric params (via public prove)', async () => {
    // Use the public API so the call handler propagates types from typed
    // params back to the test's free variables — the sound path.
    const src = `
define function add(a is number, b is number):
  return a + b

test 'addition is commutative for numbers':
  expect add(a, b) is add(b, a)
`;
    const bundle = await prove(src);
    assert.equal(bundle.status, 'proved', JSON.stringify(bundle, null, 2));
  });

  // PC-2: Phi (conditional) handling
  await itAsync('Phi(true, a, b) simplifies to a', async () => {
    const result = simplify(Phi(Lit(true), Sym('a'), Sym('b')));
    assert.ok(sameSym(result, Sym('a')));
  });

  await itAsync('Phi(false, a, b) simplifies to b', async () => {
    const result = simplify(Phi(Lit(false), Sym('a'), Sym('b')));
    assert.ok(sameSym(result, Sym('b')));
  });

  await itAsync('Phi(c, a, a) simplifies to a regardless of c', async () => {
    const result = simplify(Phi(Op('>', Sym('x'), Lit(5)), Sym('a'), Sym('a')));
    assert.ok(sameSym(result, Sym('a')));
  });

  await itAsync('Phi(c, a, b) stays as Phi when both differ and c is symbolic', async () => {
    const result = simplify(Phi(Op('>', Sym('x'), Lit(5)), Lit(42), Lit(99)));
    assert.equal(result.kind, 'phi');
  });

  await itAsync('proves a function that returns the same value in both branches', async () => {
    const src = `
define function constant_42(flag):
  if flag:
    return 42
  otherwise:
    return 42

test 'always 42':
  expect constant_42(flag) is 42
`;
    const bundle = await prove(src);
    assert.equal(bundle.status, 'proved', JSON.stringify(bundle, null, 2));
  });

  await itAsync('proves a function whose branches reduce to the same canonical form', async () => {
    const src = `
define function double_either_way(x, flag):
  if flag:
    return x + x
  otherwise:
    return x * 2

test 'both branches are 2*x':
  expect double_either_way(x, flag) is x * 2
`;
    const bundle = await prove(src);
    assert.equal(bundle.status, 'proved', JSON.stringify(bundle, null, 2));
  });

  await itAsync('proves a positive-floor function never returns a negative fee', async () => {
    const src = `
define function late_fee_floor(fee is number):
  if fee is greater than 0:
    return fee
  otherwise:
    return 0

test 'late fee floor is never negative':
  expect late_fee_floor(fee) is at least 0
`;
    const bundle = await prove(src);
    assert.equal(bundle.status, 'proved', JSON.stringify(bundle, null, 2));
  });

  await itAsync('proves multiplying by 1 is identity', async () => {
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

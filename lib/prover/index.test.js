// =============================================================================
// CLEAR PROVER — Unit Tests
// =============================================================================
//
// Run: node lib/prover/index.test.js
//
// Coverage targets:
//   - simple arithmetic proves
//   - failed assertion gives counterexample
//   - conditional logic
//   - nested function calls
//   - impure code is marked unverifiable, NOT proved
//   - parse errors are surfaced cleanly
//   - empty programs don't crash
// =============================================================================

import { describe, it, run } from '../testUtils.js';
import { strict as assert } from 'node:assert';
import { prove, formatBundle } from './index.js';

// ---------------------------------------------------------------------------
describe('Prover — basic arithmetic', () => {

  it('proves addition with concrete inputs', () => {
    const src = `
define function add(a, b):
  return a + b

test 'addition is correct':
  result = add(3, 4)
  expect result is 7
`;
    const bundle = prove(src);
    assert.equal(bundle.status, 'proved');
    assert.equal(bundle.counts.proved, 1);
    assert.equal(bundle.counts.failed, 0);
  });

  it('proves multiplication', () => {
    const src = `
define function mul(a, b):
  return a * b

test 'multiplication':
  r = mul(6, 7)
  expect r is 42
`;
    const bundle = prove(src);
    assert.equal(bundle.status, 'proved');
  });

  it('flags a wrong assertion as FAILED with the observed value', () => {
    const src = `
define function add(a, b):
  return a + b

test 'wrong claim':
  result = add(1, 1)
  expect result is 3
`;
    const bundle = prove(src);
    assert.equal(bundle.status, 'failed');
    assert.equal(bundle.counts.failed, 1);
    const a = bundle.results[0].assertions[0];
    assert.equal(a.passed, false);
    assert.equal(a.observed, 2);
    assert.equal(a.expected, 3);
  });

  it('proves chained arithmetic', () => {
    const src = `
define function compute(price, rate):
  tax = price * rate / 100
  total = price + tax
  return total

test 'price plus tax':
  r = compute(100, 8)
  expect r is 108
`;
    const bundle = prove(src);
    assert.equal(bundle.status, 'proved');
  });
});

// ---------------------------------------------------------------------------
describe('Prover — comparisons and booleans', () => {

  it('proves a greater-than check', () => {
    const src = `
define function is_overdue(due_day, now_day):
  return now_day > due_day

test 'overdue when today after due':
  r = is_overdue(10, 20)
  expect r is true
`;
    const bundle = prove(src);
    assert.equal(bundle.status, 'proved', formatBundle(bundle));
  });

  it('proves a not-overdue case', () => {
    const src = `
define function is_overdue(due_day, now_day):
  return now_day > due_day

test 'not overdue when same day':
  r = is_overdue(10, 10)
  expect r is false
`;
    const bundle = prove(src);
    assert.equal(bundle.status, 'proved', formatBundle(bundle));
  });
});

// ---------------------------------------------------------------------------
describe('Prover — conditionals', () => {

  it('proves an if-then branch', () => {
    const src = `
define function classify(score):
  if score >= 90:
    return 'A'
  otherwise:
    return 'B'

test 'high score is A':
  r = classify(95)
  expect r is 'A'
`;
    const bundle = prove(src);
    assert.equal(bundle.status, 'proved', formatBundle(bundle));
  });

  it('proves the otherwise branch', () => {
    const src = `
define function classify(score):
  if score >= 90:
    return 'A'
  otherwise:
    return 'B'

test 'low score is B':
  r = classify(70)
  expect r is 'B'
`;
    const bundle = prove(src);
    assert.equal(bundle.status, 'proved', formatBundle(bundle));
  });
});

// ---------------------------------------------------------------------------
describe('Prover — nested function calls', () => {

  it('proves a function calling another pure function', () => {
    const src = `
define function double(x):
  return x * 2

define function quadruple(x):
  doubled = double(x)
  return double(doubled)

test 'quadruple of 5 is 20':
  r = quadruple(5)
  expect r is 20
`;
    const bundle = prove(src);
    assert.equal(bundle.status, 'proved', formatBundle(bundle));
  });
});

// ---------------------------------------------------------------------------
describe('Prover — impurity detection', () => {

  it('marks tests touching impure ops as UNVERIFIABLE, not proved', () => {
    // toast is a UI side-effect — should be refused
    const src = `
test 'toast is impure':
  toast 'hello'
  expect 1 is 1
`;
    const bundle = prove(src);
    // Either unverifiable or partial (depending on whether the assert ran first)
    assert.notEqual(bundle.status, 'proved', formatBundle(bundle));
  });
});

// ---------------------------------------------------------------------------
describe('Prover — edge cases', () => {

  it('handles a program with no tests at all', () => {
    const src = `
define function add(a, b):
  return a + b
`;
    const bundle = prove(src);
    assert.equal(bundle.counts.total, 0);
    assert.equal(bundle.summary, 'No tests in the program — nothing to prove.');
  });

  it('surfaces parse errors instead of crashing', () => {
    const src = `define function broken(`;
    const bundle = prove(src);
    assert.equal(bundle.status, 'parse_error');
    assert.ok(bundle.errors.length > 0);
  });

  it('proves multiple tests in a program', () => {
    const src = `
define function add(a, b):
  return a + b

test 'one plus one':
  r = add(1, 1)
  expect r is 2

test 'two plus two':
  r = add(2, 2)
  expect r is 4
`;
    const bundle = prove(src);
    assert.equal(bundle.status, 'proved');
    assert.equal(bundle.counts.proved, 2);
  });

  // Regression: partial (symbolic UNKNOWN) status was silently being classified
  // as overall 'proved' because summarize() didn't count partial results.
  // This is the soundness floor — a test that returns UNKNOWN must NEVER show
  // up as PROVED at the bundle level.
  it('a single partial test makes the bundle status partial, not proved', () => {
    const src = `
define function ambiguous_add(a, b):
  return a + b

test 'addition commutativity (untyped — should be UNKNOWN, not PROVED)':
  expect ambiguous_add(a, b) is ambiguous_add(b, a)
`;
    const bundle = prove(src);
    assert.equal(bundle.status, 'partial');
    assert.equal(bundle.counts.proved, 0);
    assert.equal(bundle.counts.partial, 1);
  });
});

// ---------------------------------------------------------------------------
describe('Prover — formatter', () => {

  it('formatBundle produces readable text for a passing program', () => {
    const src = `
define function add(a, b):
  return a + b

test 'simple':
  r = add(2, 3)
  expect r is 5
`;
    const bundle = prove(src);
    const text = formatBundle(bundle);
    assert.ok(text.includes('PROVED'),  text);
    assert.ok(text.includes('Status: PROVED'), text);
  });

  it('formatBundle shows counterexample on failure', () => {
    const src = `
define function add(a, b):
  return a + b

test 'wrong':
  r = add(1, 1)
  expect r is 3
`;
    const bundle = prove(src);
    const text = formatBundle(bundle);
    assert.ok(text.includes('FAILED'),  text);
    assert.ok(text.includes('2'),       text);  // observed
    assert.ok(text.includes('3'),       text);  // expected
  });
});

run();

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

// ---------------------------------------------------------------------------
// Structured enforcement tags (2026-05-03)
//
// Each PROVED rule carries an `enforcement` array of structured tags that
// the audit-bundle / PDF layer renders into auditor-readable prose. Prose
// stays OUT of the prover — leaking strings like "the symbolic engine
// couldn't decode the guard expression" used to land straight into the
// PDF and made the report read like a stack trace. These tests pin the
// tag shape so prose can never sneak back in.
// ---------------------------------------------------------------------------
describe('Prover — structured enforcement tags', () => {

  it('emits kind:tautology for a constant-true guard', () => {
    const src = `
rule tautology-rule:
  enforce that 1 is less than 2, or fail with error message: 'never fires'
`;
    const bundle = prove(src);
    const rule = bundle.rules.find(r => r.name === 'tautology-rule');
    assert.equal(rule.verdict, 'proved');
    assert.ok(Array.isArray(rule.enforcement), 'enforcement must be an array');
    assert.equal(rule.enforcement.length, 1);
    assert.equal(rule.enforcement[0].kind, 'tautology');
    assert.ok(typeof rule.enforcement[0].line === 'number');
  });

  it('emits kind:structural-enforcement with opaqueExpression for member-access guards', () => {
    const src = `
when user sends deal to /api/deals:
  rule discount-cap:
    enforce that deal's discount_percent is less than 30, or fail with error message: 'too high'
  send back 'ok'
`;
    const bundle = prove(src);
    const rule = bundle.rules.find(r => r.name === 'discount-cap');
    assert.equal(rule.verdict, 'proved');
    assert.equal(rule.enforcement.length, 1);
    const tag = rule.enforcement[0];
    assert.equal(tag.kind, 'structural-enforcement');
    assert.ok(typeof tag.line === 'number');
    assert.equal(tag.opaqueExpression, true);
  });

  it('emits one tag per guard for multi-guard rules', () => {
    const src = `
when user sends deal to /api/deals:
  rule two-guards:
    enforce that 1 is less than 2, or fail with error message: 'tautology'
    enforce that deal's discount_percent is less than 30, or fail with error message: 'too high'
  send back 'ok'
`;
    const bundle = prove(src);
    const rule = bundle.rules.find(r => r.name === 'two-guards');
    assert.equal(rule.verdict, 'proved');
    assert.equal(rule.enforcement.length, 2);
    assert.equal(rule.enforcement[0].kind, 'tautology');
    assert.equal(rule.enforcement[1].kind, 'structural-enforcement');
  });

  it('NEVER leaks symbolic-engine internals into the prose reason field', () => {
    // Regression guard for the original bug: rule reasons used to read
    // "the symbolic engine couldn't decode the guard expression: Symbolic
    // limit: unsupported node 'member_access'". That gibberish landed in
    // the auditor PDF. The new design keeps prose out of the prover; this
    // test asserts that none of the verbatim leaks survive.
    const src = `
when user sends deal to /api/deals:
  rule audit-rule:
    enforce that deal's discount_percent is less than 30, or fail with error message: 'too high'
  send back 'ok'
`;
    const bundle = prove(src);
    const rule = bundle.rules.find(r => r.name === 'audit-rule');
    const reason = rule.reason || '';
    assert.ok(!/symbolic engine/i.test(reason), `prover prose must not mention "symbolic engine": ${reason}`);
    assert.ok(!/Symbolic limit/i.test(reason),   `prover prose must not mention "Symbolic limit": ${reason}`);
    assert.ok(!/unsupported node/i.test(reason), `prover prose must not mention "unsupported node": ${reason}`);
  });

  it('derives a clean plain-English reason that names the entity', () => {
    const src = `
when user sends lead to /api/leads:
  rule lead-must-have-email:
    enforce that lead's email is not '', or fail with error message: 'no email'
  send back 'ok'
`;
    const bundle = prove(src);
    const rule = bundle.rules.find(r => r.name === 'lead-must-have-email');
    assert.equal(rule.entity, 'lead');
    assert.ok(/lead/.test(rule.reason || ''), `reason should name the entity 'lead': ${rule.reason}`);
    assert.ok(/before the next line runs/i.test(rule.reason || ''), rule.reason);
  });

  // PC-2 regression — conditional rules. Pre-2026-05-04 the rule walker
  // only looked for guards at the top level of the rule body; if the
  // policy was structured as an if/otherwise with the actual enforce
  // calls inside each branch, the prover came back with "no guard" and
  // marked the rule UNVERIFIABLE. Now the walker recurses into both
  // branches under the right path-constraint assumption, so the
  // conditional shape proves cleanly.
  it('proves a conditional rule whose guards live inside if/otherwise branches', () => {
    const src = `rule discount-cap-tiered:
  if order's customer_tier is 'enterprise':
    enforce that order's discount_percent is less than 50, or fail with error message: 'enterprise discount cap'
  otherwise:
    enforce that order's discount_percent is less than 30, or fail with error message: 'standard discount cap'
`;
    const bundle = prove(src);
    const rule = bundle.rules.find(r => r.name === 'discount-cap-tiered');
    assert.equal(rule.verdict, 'proved', `expected PROVED for conditional rule; got ${rule.verdict} — ${rule.reason}`);
    assert.ok(/before the next line runs/i.test(rule.reason || ''), rule.reason);
  });

  it('still marks an empty-body conditional rule UNVERIFIABLE (no guards on either branch)', () => {
    const src = `rule conditional-no-guards:
  if order's customer_tier is 'enterprise':
    log_info = 'enterprise tier'
  otherwise:
    log_info = 'standard tier'
`;
    const bundle = prove(src);
    const rule = bundle.rules.find(r => r.name === 'conditional-no-guards');
    assert.equal(rule.verdict, 'unverifiable', `expected UNVERIFIABLE for branches with no guards; got ${rule.verdict}`);
  });
});

// ---------------------------------------------------------------------------
// Agent-bounded rules (2026-05-07)
//
// Customers care about a specific shape: an agent (or `ask claude` directly)
// produces output, and a rule guards downstream of that output. The rule
// itself is structurally provable (its guard is pure, the runtime gate
// fires). The agent is non-deterministic, but it cannot bypass the rule —
// every agent output is filtered through the same gate.
//
// The prover marks these rules with `bounds_agent_output: true` so the
// regulated-tier pitch surface (the audit PDF, the chat panel) can say:
//   "PROVED — agent output cannot bypass this rule."
//
// We add the flag without changing the verdict itself. A rule that proves
// structurally still proves; the new field just records that the rule's
// protection EXTENDS to agent-produced inputs in the same scope.
// ---------------------------------------------------------------------------
describe('Prover — bounds_agent_output annotation', () => {

  it('flags a rule that fires AFTER a call-by-name agent invocation', () => {
    const src = `
agent 'discount drafter' receives deal:
  drafted = ask claude 'Suggest a discount' with deal returning JSON text:
    discount_percent (number)
  return drafted

when user sends deal to /api/draft:
  drafted = call 'discount drafter' with deal
  rule discount-cap:
    enforce that drafted's discount_percent is less than 30, or fail with error message: 'Over cap'
  send back drafted
`;
    const bundle = prove(src);
    const rule = bundle.rules.find(r => r.name === 'discount-cap');
    assert.ok(rule, 'rule should be discovered inside the endpoint');
    assert.equal(rule.verdict, 'proved', `expected PROVED; got ${rule.verdict} — ${rule.reason}`);
    assert.equal(rule.bounds_agent_output, true, 'rule downstream of an agent call must set bounds_agent_output');
  });

  it('does NOT flag a rule with no preceding agent call', () => {
    const src = `
when user sends deal to /api/deals:
  rule plain-cap:
    enforce that deal's discount_percent is less than 30, or fail with error message: 'too high'
  send back 'ok'
`;
    const bundle = prove(src);
    const rule = bundle.rules.find(r => r.name === 'plain-cap');
    assert.ok(rule, 'rule should be discovered');
    assert.equal(rule.verdict, 'proved');
    assert.notEqual(rule.bounds_agent_output, true, 'no agent call → no bounds_agent_output flag');
  });

  it('does NOT flag a rule that fires BEFORE the agent call', () => {
    // Rule guards the INPUT to the agent, not the agent's output.
    // Structurally provable, but there is no agent output to bound at
    // this point in the body — the agent call has not happened yet.
    const src = `
agent 'discount drafter' receives deal:
  drafted = ask claude 'Suggest a discount' with deal returning JSON text:
    discount_percent (number)
  return drafted

when user sends deal to /api/draft:
  rule input-cap:
    enforce that deal's discount_percent is less than 30, or fail with error message: 'input over cap'
  drafted = call 'discount drafter' with deal
  send back drafted
`;
    const bundle = prove(src);
    const rule = bundle.rules.find(r => r.name === 'input-cap');
    assert.ok(rule, 'rule should be discovered');
    assert.equal(rule.verdict, 'proved');
    assert.notEqual(rule.bounds_agent_output, true, 'rule fires BEFORE agent call → no bounds_agent_output flag');
  });
});

run();

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

  it('does NOT flag a rule downstream of a tool-using agent (tool actions cannot be bounded after-the-fact)', () => {
    // The agent's body can mutate state through tools BEFORE the rule
    // fires. The rule guards the agent's RETURN VALUE, but a tool call
    // (delete, charge, send-email) already happened by the time the
    // rule runs — so the "AI is bounded" claim would be misleading.
    // Use `must not:` on the agent for tool-action guarantees.
    const src = `
define function look_up_orders(customer_email):
  out = look up all Orders where email is customer_email
  return out

agent 'support bot' receives request:
  has tool: look_up_orders
  drafted = ask claude 'Help this customer' with request returning JSON text:
    discount_percent (number)
  return drafted

when user sends deal to /api/support:
  drafted = call 'support bot' with deal
  rule cap:
    enforce that drafted's discount_percent is less than 30, or fail with error message: 'too high'
  send back drafted
`;
    const bundle = prove(src);
    const rule = bundle.rules.find(r => r.name === 'cap');
    assert.ok(rule, 'rule should be discovered');
    assert.equal(rule.verdict, 'proved', `expected PROVED; got ${rule.verdict}`);
    assert.notEqual(rule.bounds_agent_output, true, 'tool-using agent → bounds claim must NOT fire');
  });
});

// ---------------------------------------------------------------------------
// Agent tool-bound claims (2026-05-07)
//
// Soundness rests on Clear's closed-world tool dispatch — `_askAIWithTools`
// only honors functions in the compile-time-built `_toolFns` dict and falls
// through to "Unknown tool" otherwise. The prover walks the static closure
// (own `has tools:` + recursive `uses skills:`) and emits PROVED iff the
// forbidden action is absent.
// ---------------------------------------------------------------------------

describe('Prover — agent tool-bound claims', () => {

  it('PROVES that an agent without the function in its closure cannot call it', () => {
    const src = `
define function look_up_orders(email):
  return look up all Orders where customer_email is email

define function charge_card(amount, token):
  return amount

agent 'Refund Bot' receives request:
  has tool: look_up_orders
  reply = ask claude 'Process this refund' with request
  return reply

prove that agent 'Refund Bot' cannot call charge_card
`;
    const bundle = prove(src);
    assert.ok(Array.isArray(bundle.boundClaims), 'bundle should carry boundClaims');
    assert.equal(bundle.boundClaims.length, 1, 'one claim was declared');
    const claim = bundle.boundClaims[0];
    assert.equal(claim.agentName, 'Refund Bot');
    assert.equal(claim.forbiddenAction, 'charge_card');
    assert.equal(claim.verdict, 'proved', `expected PROVED; got ${claim.verdict}: ${claim.reason}`);
    assert.equal(claim.closureSize, 1, 'closure should hold exactly the one declared tool');
    assert.equal(bundle.boundCounts.proved, 1);
    assert.equal(bundle.boundCounts.disproved, 0);
  });

  it('DISPROVES the claim and names the path when the function IS in the agent\'s direct tools', () => {
    const src = `
define function charge_card(amount, token):
  return amount

agent 'Refund Bot' receives request:
  has tool: charge_card
  reply = ask claude 'Process this refund' with request
  return reply

prove that agent 'Refund Bot' cannot call charge_card
`;
    const bundle = prove(src);
    const claim = bundle.boundClaims[0];
    assert.equal(claim.verdict, 'disproved', `expected DISPROVED; got ${claim.verdict}`);
    assert.ok(claim.path, 'disproved claim should carry the path that brings the tool into scope');
    assert.deepEqual(claim.path, [`agent 'Refund Bot'`, 'has tool: charge_card']);
    assert.equal(bundle.boundCounts.disproved, 1);
    // The summary should bubble the failure up.
    assert.equal(bundle.status, 'failed');
  });

  it('DISPROVES via skills closure when the function enters scope through a skill', () => {
    const src = `
define function charge_card(amount, token):
  return amount

define function look_up_orders(email):
  return look up all Orders where customer_email is email

skill 'Billing':
  has tools: charge_card
  instructions: 'Use charge_card to process refunds.'

agent 'Refund Bot' receives request:
  has tool: look_up_orders
  uses skills: 'Billing'
  reply = ask claude 'Process this refund' with request
  return reply

prove that agent 'Refund Bot' cannot call charge_card
`;
    const bundle = prove(src);
    const claim = bundle.boundClaims[0];
    assert.equal(claim.verdict, 'disproved', `expected DISPROVED via skill; got ${claim.verdict}: ${claim.reason}`);
    assert.deepEqual(
      claim.path,
      [`agent 'Refund Bot'`, `uses skills: 'Billing'`, 'has tool: charge_card'],
      'path should attribute the leak to the skill'
    );
  });

  it('marks UNVERIFIABLE when the named agent does not exist', () => {
    const src = `
prove that agent 'Phantom Bot' cannot call charge_card
`;
    const bundle = prove(src);
    const claim = bundle.boundClaims[0];
    assert.equal(claim.verdict, 'unverifiable');
    assert.match(claim.reason, /not defined/);
  });

  it('handles an agent with NO tools at all (every claim against it proves)', () => {
    const src = `
agent 'Greeter' receives request:
  reply = ask claude 'Say hello' with request
  return reply

prove that agent 'Greeter' cannot call charge_card
prove that agent 'Greeter' cannot call delete_user
`;
    const bundle = prove(src);
    assert.equal(bundle.boundClaims.length, 2);
    for (const claim of bundle.boundClaims) {
      assert.equal(claim.verdict, 'proved', `expected PROVED for claim ${claim.forbiddenAction}; got ${claim.verdict}`);
      assert.equal(claim.closureSize, 0);
    }
    assert.equal(bundle.boundCounts.proved, 2);
  });

  // --- Transitive flavor: cannot delete from / cannot modify -----------------

  it('TRANSITIVE: PROVES "cannot delete from" when no reachable tool body has a remove on the entity', () => {
    const src = `
create a Deals table:
  amount, number
  customer, text

create a Logs table:
  message, text

define function lookup_deal(deal_id):
  return look up Deal where id is deal_id

define function record_log(message):
  save log_row as new Log

agent 'Refund Bot' receives request:
  has tools: lookup_deal, record_log
  reply = ask claude 'Look up and log' with request
  return reply

prove that agent 'Refund Bot' cannot delete from Deals
`;
    const bundle = prove(src);
    const claim = bundle.boundClaims[0];
    assert.equal(claim.verdict, 'proved', `expected PROVED; got ${claim.verdict}: ${claim.reason}`);
    assert.equal(claim.claimKind, 'delete');
    assert.equal(claim.target, 'Deals');
  });

  it('TRANSITIVE: DISPROVES "cannot delete from" when a tool body has a remove on the entity', () => {
    const src = `
create a Deals table:
  amount, number

define function purge_deal(deal_id):
  delete the Deal with this id

agent 'Refund Bot' receives request:
  has tools: purge_deal
  reply = ask claude 'Purge expired deals' with request
  return reply

prove that agent 'Refund Bot' cannot delete from Deals
`;
    const bundle = prove(src);
    const claim = bundle.boundClaims[0];
    assert.equal(claim.verdict, 'disproved', `expected DISPROVED; got ${claim.verdict}: ${claim.reason}`);
    assert.equal(claim.op, 'remove');
    // Path should mention the offending tool by name. The closure walker
    // emits `has tool: purge_deal` as the entry hop, then the CRUD line as
    // the violation step — both should be visible.
    const pathStr = claim.path.join(' → ');
    assert.ok(pathStr.includes('purge_deal'),
      `path should name the offending tool; got: ${pathStr}`);
    assert.ok(pathStr.includes('remove'),
      `path should label the operation as remove; got: ${pathStr}`);
  });

  it('TRANSITIVE: DISPROVES through a transitive function call chain', () => {
    const src = `
create a Users table:
  email, text

define function force_remove(user_id):
  delete the User with this id

define function deactivate(user_id):
  force_remove(user_id)

agent 'Admin Bot' receives request:
  has tool: deactivate
  reply = ask claude 'Deactivate the requested account' with request
  return reply

prove that agent 'Admin Bot' cannot delete from Users
`;
    const bundle = prove(src);
    const claim = bundle.boundClaims[0];
    assert.equal(claim.verdict, 'disproved',
      `expected DISPROVED via call chain; got ${claim.verdict}: ${claim.reason}`);
    // Path should walk through deactivate → force_remove
    const pathStr = claim.path.join(' → ');
    assert.ok(pathStr.includes('deactivate') && pathStr.includes('force_remove'),
      `path should show the call chain; got: ${pathStr}`);
  });

  it('TRANSITIVE: PROVES "cannot modify" when reads are the only operations', () => {
    const src = `
create a Deals table:
  amount, number

define function lookup_deal(deal_id):
  return look up Deal where id is deal_id

agent 'Read Only Bot' receives request:
  has tools: lookup_deal
  reply = ask claude 'Look up the deal' with request
  return reply

prove that agent 'Read Only Bot' cannot modify Deals
`;
    const bundle = prove(src);
    const claim = bundle.boundClaims[0];
    assert.equal(claim.verdict, 'proved', `expected PROVED; got ${claim.verdict}: ${claim.reason}`);
  });

  it('TRANSITIVE: DISPROVES "cannot modify" on a save (insert/update) operation', () => {
    const src = `
create a Users table:
  email, text

define function create_user(email):
  save new_user as new User

agent 'Onboarding Bot' receives request:
  has tools: create_user
  reply = ask claude 'Onboard this user' with request
  return reply

prove that agent 'Onboarding Bot' cannot modify Users
`;
    const bundle = prove(src);
    const claim = bundle.boundClaims[0];
    assert.equal(claim.verdict, 'disproved', `expected DISPROVED; got ${claim.verdict}: ${claim.reason}`);
    assert.equal(claim.op, 'save');
  });

  it('TRANSITIVE: catches CRUD that lives directly in the AGENT BODY (not just tool bodies)', () => {
    const src = `
create a Logs table:
  message, text

agent 'Logger Bot' receives request:
  save log_row as new Log
  reply = ask claude 'Log this and respond' with request
  return reply

prove that agent 'Logger Bot' cannot modify Logs
`;
    const bundle = prove(src);
    const claim = bundle.boundClaims[0];
    assert.equal(claim.verdict, 'disproved',
      `agent-body CRUD must be detected; got ${claim.verdict}: ${claim.reason}`);
    // Path should attribute to the agent body itself, not a function.
    assert.ok(claim.path[0].startsWith(`agent 'Logger Bot'`),
      `path should start at the agent; got: ${JSON.stringify(claim.path)}`);
  });

  it('TRANSITIVE: claim against a different entity does NOT trip on operations against other tables', () => {
    const src = `
create a Logs table:
  message, text

create a Deals table:
  amount, number

define function purge_logs(log_id):
  delete the Log with this id

agent 'Cleanup Bot' receives request:
  has tools: purge_logs
  reply = ask claude 'Clean up old logs' with request
  return reply

prove that agent 'Cleanup Bot' cannot delete from Deals
`;
    const bundle = prove(src);
    const claim = bundle.boundClaims[0];
    assert.equal(claim.verdict, 'proved',
      `purge_logs touches Logs, not Deals — claim against Deals must hold; got ${claim.verdict}: ${claim.reason}`);
  });

  // --- Phase 3: symbolic argument-bound claims --------------------------------

  it('SYMBOLIC: PROVES "cannot call charge_card with amount is greater than 1000" when call sites pass literal small values', () => {
    const src = `
define function charge_card(amount, token):
  return amount

define function refund_50(token):
  return charge_card(50, token)

agent 'Refund Bot' receives request:
  has tools: refund_50
  reply = ask claude 'Refund' with request
  return reply

prove that agent 'Refund Bot' cannot call charge_card with amount is greater than 1000
`;
    const bundle = prove(src);
    const claim = bundle.boundClaims[0];
    assert.equal(claim.verdict, 'proved',
      `expected PROVED — literal 50 cannot exceed 1000; got ${claim.verdict}: ${claim.reason}`);
    assert.equal(claim.claimKind, 'call_with_constraint');
    assert.equal(claim.callSiteCount, 1);
  });

  it('SYMBOLIC: DISPROVES when a call site passes a free symbolic value (Claude-controlled)', () => {
    const src = `
define function charge_card(amount, token):
  return amount

define function refund_anything(amount, token):
  return charge_card(amount, token)

agent 'Refund Bot' receives request:
  has tools: refund_anything
  reply = ask claude 'Refund' with request
  return reply

prove that agent 'Refund Bot' cannot call charge_card with amount is greater than 1000
`;
    const bundle = prove(src);
    const claim = bundle.boundClaims[0];
    assert.equal(claim.verdict, 'disproved',
      `expected DISPROVED — amount is a free var Claude can pass; got ${claim.verdict}: ${claim.reason}`);
    assert.match(claim.reason, /can satisfy/,
      `disproved verdict should explain that the constraint is satisfiable; got: ${claim.reason}`);
  });

  it('SYMBOLIC: PROVES "cannot call charge_card with amount is greater than 1000" when there are zero reachable call sites', () => {
    const src = `
define function charge_card(amount, token):
  return amount

define function lookup_user(id):
  return look up User where id is id

agent 'Read Only Bot' receives request:
  has tools: lookup_user
  reply = ask claude 'Read' with request
  return reply

prove that agent 'Read Only Bot' cannot call charge_card with amount is greater than 1000
`;
    const bundle = prove(src);
    const claim = bundle.boundClaims[0];
    assert.equal(claim.verdict, 'proved',
      `no reachable call site means the constraint can't be triggered; got ${claim.verdict}: ${claim.reason}`);
    assert.equal(claim.callSiteCount, 0);
  });

  it('SYMBOLIC: UNVERIFIABLE when the constrained function is not defined in this file', () => {
    const src = `
agent 'Refund Bot' receives request:
  reply = ask claude 'Refund' with request
  return reply

prove that agent 'Refund Bot' cannot call charge_card with amount is greater than 1000
`;
    const bundle = prove(src);
    const claim = bundle.boundClaims[0];
    assert.equal(claim.verdict, 'unverifiable',
      `function not in file → can't resolve the parameter index; got ${claim.verdict}: ${claim.reason}`);
    assert.match(claim.reason, /not defined/);
  });

  it('SYMBOLIC: UNVERIFIABLE when the constrained argument name does not match any parameter', () => {
    const src = `
define function charge_card(amount, token):
  return amount

define function refund(token):
  return charge_card(50, token)

agent 'Bot' receives request:
  has tools: refund
  reply = ask claude 'X' with request
  return reply

prove that agent 'Bot' cannot call charge_card with size is greater than 1000
`;
    const bundle = prove(src);
    const claim = bundle.boundClaims[0];
    assert.equal(claim.verdict, 'unverifiable');
    assert.match(claim.reason, /no parameter named 'size'/);
  });

  it('SYMBOLIC: DISPROVES when the constrained function IS itself a tool the agent can invoke (Claude controls every arg)', () => {
    // Soundness gate: if charge_card is in the tool closure, Claude can
    // dispatch to it directly. The symbolic walker would miss this because
    // there's no source-level call site — the dispatch is opaque. Without
    // this gate the verdict would falsely read PROVED.
    const src = `
define function charge_card(amount, token):
  return amount

agent 'Refund Bot' receives request:
  has tools: charge_card
  reply = ask claude 'Refund' with request
  return reply

prove that agent 'Refund Bot' cannot call charge_card with amount is greater than 1000
`;
    const bundle = prove(src);
    const claim = bundle.boundClaims[0];
    assert.equal(claim.verdict, 'disproved',
      `direct tool dispatch by Claude → constraint is satisfiable; got ${claim.verdict}: ${claim.reason}`);
    assert.match(claim.reason, /tool dispatch/i,
      `verdict should explain that Claude controls the arg via tool dispatch; got: ${claim.reason}`);
  });

  it('SYMBOLIC: catches a literal value that DOES satisfy the constraint (DISPROVED with explanation)', () => {
    const src = `
define function charge_card(amount, token):
  return amount

define function premium_charge(token):
  return charge_card(5000, token)

agent 'VIP Bot' receives request:
  has tools: premium_charge
  reply = ask claude 'X' with request
  return reply

prove that agent 'VIP Bot' cannot call charge_card with amount is greater than 1000
`;
    const bundle = prove(src);
    const claim = bundle.boundClaims[0];
    assert.equal(claim.verdict, 'disproved',
      `literal 5000 > 1000 must DISPROVE; got ${claim.verdict}: ${claim.reason}`);
  });

  // --- Phase 4: Agent × Policy bridge (`upholds all policies`) ---------------

  it('POLICY: PROVES "upholds all policies" when no reachable code touches a protected table', () => {
    const src = `
create a Users table:
  email, text

create a Logs table:
  message, text

policy:
  protect tables Users

define function record_log(message):
  save log_row as new Log

agent 'Logger Bot' receives request:
  has tools: record_log
  reply = ask claude 'Log this' with request
  return reply

prove that agent 'Logger Bot' upholds all policies
`;
    const bundle = prove(src);
    const claim = bundle.boundClaims[0];
    assert.equal(claim.verdict, 'proved',
      `protected table Users isn't touched; got ${claim.verdict}: ${claim.reason}`);
    assert.equal(claim.subverdicts.length, 1);
    assert.equal(claim.subverdicts[0].ruleKind, 'protect_tables');
    assert.equal(claim.subverdicts[0].verdict, 'proved');
  });

  it('POLICY: DISPROVES when a reachable tool body touches a protected table', () => {
    const src = `
create a Users table:
  email, text

policy:
  protect tables Users

define function deactivate_user(user_id):
  delete the User with this id

agent 'Admin Bot' receives request:
  has tools: deactivate_user
  reply = ask claude 'Admin' with request
  return reply

prove that agent 'Admin Bot' upholds all policies
`;
    const bundle = prove(src);
    const claim = bundle.boundClaims[0];
    assert.equal(claim.verdict, 'disproved',
      `agent reaches a delete on protected Users; got ${claim.verdict}: ${claim.reason}`);
    const sub = claim.subverdicts[0];
    assert.equal(sub.verdict, 'disproved');
    assert.match(sub.reason, /protected table 'Users'/);
    assert.ok(sub.path.some(p => p.includes('deactivate_user')),
      `path should name the offending tool; got: ${JSON.stringify(sub.path)}`);
  });

  it('POLICY: emits one subverdict per rule (multi-rule policy block)', () => {
    const src = `
create a Logs table:
  message, text

create a Users table:
  email, text

policy:
  protect tables Logs
  protect tables Users
  block ddl

define function look_up_user(id):
  return look up User where id is id

agent 'Read Only Bot' receives request:
  has tools: look_up_user
  reply = ask claude 'X' with request
  return reply

prove that agent 'Read Only Bot' upholds all policies
`;
    const bundle = prove(src);
    const claim = bundle.boundClaims[0];
    // Logs not touched → PROVED. Users IS read (lookup is in MODIFY_OPS? no — lookup is read-only) → PROVED. block_ddl trivial → PROVED.
    // protect_tables uses MODIFY_OPS which doesn't include lookup, so a read of Users still counts as not touching.
    assert.equal(claim.subverdicts.length, 3,
      `expected 3 rule subverdicts (Logs, Users, ddl); got ${claim.subverdicts.length}`);
    const ddlSub = claim.subverdicts.find(s => s.ruleKind === 'block_ddl');
    assert.equal(ddlSub.verdict, 'proved', 'block_ddl trivially proves');
  });

  it('POLICY: marks runtime-only rules UNVERIFIABLE rather than falsely PROVING them', () => {
    const src = `
policy:
  block prompt injection
  code freeze

agent 'Bot' receives request:
  reply = ask claude 'X' with request
  return reply

prove that agent 'Bot' upholds all policies
`;
    const bundle = prove(src);
    const claim = bundle.boundClaims[0];
    assert.equal(claim.verdict, 'unverifiable',
      `runtime-only rules can't be statically PROVED; got ${claim.verdict}: ${claim.reason}`);
    assert.equal(claim.subverdicts.length, 2);
    for (const sub of claim.subverdicts) {
      assert.equal(sub.verdict, 'unverifiable',
        `runtime-only rule ${sub.ruleKind} should be UNVERIFIABLE; got ${sub.verdict}`);
      assert.match(sub.reason, /runtime/);
    }
  });

  it('POLICY: PROVES dont_delete_without_where naturally — Clear deletes always carry a condition', () => {
    // Clear's syntax requires every `delete the X with this id` to carry a
    // WHERE condition. Unconditional deletes aren't even expressible in
    // valid source. So this rule trivially proves for any well-formed Clear
    // agent — the protection is structural, not just policy-driven.
    const src = `
create a Logs table:
  message, text

policy:
  block deletes without where

define function purge_log(log_id):
  delete the Log with this id

agent 'Cleanup Bot' receives request:
  has tools: purge_log
  reply = ask claude 'Clean' with request
  return reply

prove that agent 'Cleanup Bot' upholds all policies
`;
    const bundle = prove(src);
    const claim = bundle.boundClaims[0];
    assert.equal(claim.verdict, 'proved',
      `every Clear delete carries a condition; got ${claim.verdict}: ${claim.reason}`);
    const sub = claim.subverdicts.find(s => s.ruleKind === 'dont_delete_without_where');
    assert.ok(sub, 'should have a subverdict for dont_delete_without_where');
    assert.equal(sub.verdict, 'proved');
  });

  it('POLICY: UNVERIFIABLE when no policy block is declared', () => {
    const src = `
agent 'Bot' receives request:
  reply = ask claude 'X' with request
  return reply

prove that agent 'Bot' upholds all policies
`;
    const bundle = prove(src);
    const claim = bundle.boundClaims[0];
    assert.equal(claim.verdict, 'unverifiable');
    assert.match(claim.reason, /no policy: blocks/);
  });

  it('multiple claims against the same agent are all evaluated independently', () => {
    const src = `
define function charge_card(amount, token):
  return amount
define function refund_amount(amount):
  return amount

agent 'Refund Bot' receives request:
  has tool: refund_amount
  reply = ask claude 'X' with request
  return reply

prove that agent 'Refund Bot' cannot call charge_card
prove that agent 'Refund Bot' cannot call refund_amount
`;
    const bundle = prove(src);
    assert.equal(bundle.boundClaims.length, 2);
    const cantCharge = bundle.boundClaims.find(c => c.forbiddenAction === 'charge_card');
    const cantRefund = bundle.boundClaims.find(c => c.forbiddenAction === 'refund_amount');
    assert.equal(cantCharge.verdict, 'proved');
    assert.equal(cantRefund.verdict, 'disproved');
    assert.equal(bundle.boundCounts.proved, 1);
    assert.equal(bundle.boundCounts.disproved, 1);
  });
});

run();

#!/usr/bin/env node
// Tests for scripts/proof-business-language.mjs — translates Decidable Core
// proof bundles into CRO-readable language.

import { translateBundle } from './proof-business-language.mjs';

let passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; console.log('  ✅ ' + msg); }
  else { failed++; console.log('  ❌ ' + msg); }
}

console.log('\n📜 translateBundle — empty bundle');
{
  const out = translateBundle({});
  assert(Array.isArray(out.lines), 'returns an array of lines');
  assert(typeof out.headline === 'string', 'returns a headline string');
}

console.log('\n📜 translateBundle — proved test, with free vars');
{
  const bundle = {
    status: 'proved',
    counts: { proved: 1, total: 1 },
    results: [{
      test: 'add is commutative',
      status: 'proved',
      mode: 'symbolic',
      freeVars: ['a', 'b'],
      assertions: [],
    }],
  };
  const out = translateBundle(bundle);
  assert(out.lines.length === 1, 'one verdict line');
  assert(out.lines[0].startsWith('We proved:'), 'leads with "We proved:"');
  assert(out.lines[0].includes('add is commutative'), 'includes test name');
  assert(out.lines[0].includes('for every possible a, b'), 'mentions universal quantifier in business English');
}

console.log('\n📜 translateBundle — proved test, no free vars');
{
  const bundle = {
    results: [{
      test: 'discount cap holds',
      status: 'proved',
      assertions: [],
    }],
  };
  const out = translateBundle(bundle);
  assert(out.lines[0] === 'We proved: discount cap holds.', 'no "for every" suffix when no free vars');
}

console.log('\n📜 translateBundle — failed test surfaces counterexample');
{
  const bundle = {
    results: [{
      test: 'never goes negative',
      status: 'failed',
      assertions: [{
        line: 5,
        passed: false,
        unknown: false,
        observed: -1,
        expected: 0,
        check: 'gte',
      }],
    }],
  };
  const out = translateBundle(bundle);
  assert(out.lines[0].startsWith('Counterexample found'), 'leads with counterexample');
  assert(out.lines[0].includes('never goes negative'), 'names the test');
  assert(out.lines[0].includes('-1'), 'shows observed value');
  assert(out.lines[0].includes('0'), 'shows expected value');
}

console.log('\n📜 translateBundle — unverifiable maps impurity to plain English');
{
  const cases = [
    { reason: 'calls ask claude inside the body', expected: 'asks the AI assistant for an answer' },
    { reason: 'reads from sqlite database', expected: 'reads or writes the database' },
    { reason: 'fetches https://example.com', expected: 'calls an outside service' },
    { reason: 'sends email via smtp', expected: 'sends email' },
    { reason: 'reads Date.now() for timestamp', expected: 'depends on the current time' },
    { reason: 'uses Math.random for jitter', expected: 'depends on random values' },
  ];
  for (const c of cases) {
    const bundle = { results: [{ test: 't', status: 'unverifiable', reason: c.reason }] };
    const out = translateBundle(bundle);
    assert(out.lines[0].includes(c.expected), `"${c.reason}" -> "${c.expected}"`);
  }
}

console.log('\n📜 translateBundle — partial test mentions simplifier limit');
{
  const bundle = {
    results: [{
      test: 'tricky inequality',
      status: 'partial',
      assertions: [{ unknown: true }, { unknown: true }],
    }],
  };
  const out = translateBundle(bundle);
  assert(out.lines[0].startsWith('Partly proved:'), 'leads with "Partly proved:"');
  assert(out.lines[0].includes('2 assertion'), 'reports the unknown count');
}

console.log('\n📜 translateBundle — headline summarises counts in business English');
{
  const bundle = {
    results: [
      { test: 'a', status: 'proved' },
      { test: 'b', status: 'proved' },
      { test: 'c', status: 'failed', assertions: [{ passed: false, observed: 1, expected: 2 }] },
      { test: 'd', status: 'unverifiable', reason: 'database call' },
    ],
  };
  const out = translateBundle(bundle);
  assert(out.headline.includes('2 proved'), 'headline includes proved count');
  assert(out.headline.includes('1 counterexample'), 'headline includes failed (singular)');
  assert(out.headline.includes('1 not math-checkable'), 'headline includes unverifiable in plain words');
  assert(out.headline.includes('4 total'), 'headline includes total');
}

console.log('\n📜 translateBundle — counts roll up correctly');
{
  const bundle = {
    results: [
      { test: 'a', status: 'proved' },
      { test: 'b', status: 'partial', assertions: [{ unknown: true }] },
      { test: 'c', status: 'unverifiable', reason: 'asks claude' },
    ],
  };
  const out = translateBundle(bundle);
  assert(out.counts.proved === 1, 'proved count');
  assert(out.counts.partial === 1, 'partial count');
  assert(out.counts.unverifiable === 1, 'unverifiable count');
  assert(out.counts.total === 3, 'total count');
}

console.log(`\n${failed === 0 ? '✅' : '❌'} ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);

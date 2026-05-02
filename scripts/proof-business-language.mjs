#!/usr/bin/env node
// Translates a Decidable Core proof bundle into business-friendly language.
//
// The default `clear prove` output is correct but reads like a math journal
// ("UNVERIFIABLE", "for any: discount", "simplifier cannot decide"). This
// translator turns each verdict into a sentence a CRO or compliance buyer
// can actually understand:
//
//   PROVED  → "We proved: <test_name>, for every possible <vars>."
//   PARTIAL → "Partly proved: <test_name>. Tests pass for the cases we
//             tried; the math prover can't yet decide every case."
//   FAILED  → "Counterexample found for: <test_name>. The app fails when
//             <example_inputs>."
//   UNVERIFIABLE → "<test_name> talks to the world (database / email / AI /
//                   time). The prover can't decide it; tests still cover
//                   the cases you wrote."
//   ERRORED → "<test_name> couldn't be checked: <reason>."
//
// Usage:
//   node scripts/proof-business-language.mjs <file.clear>
//   cat my-bundle.json | node scripts/proof-business-language.mjs --stdin
//   node scripts/proof-business-language.mjs <file.clear> --json
//
// The --json flag emits a machine-readable payload Studio (or any caller)
// can consume to render proof verdicts in business language inline.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const RACE_CONDITION_NOTE =
  'Note on concurrency: the Decidable Core prover today checks app rules '
  + 'against single inputs (does the rule hold for every possible deal?). '
  + 'It does NOT yet model two requests landing at the same time. For '
  + 'concurrency claims like "the audit row writes before the ship," see '
  + 'the runtime-claims layer (runtime-enforced, not math-proved).';

// Map proof statuses to plain-English verdict templates. The generator is
// pure: take a bundle, return an array of business-language strings.
export function translateBundle(bundle) {
  if (!bundle || typeof bundle !== 'object') {
    return { lines: ['No proof bundle to translate.'], counts: { total: 0 } };
  }
  const results = Array.isArray(bundle.results) ? bundle.results : [];
  const lines = [];
  const counts = { proved: 0, partial: 0, failed: 0, unverifiable: 0, errored: 0, total: results.length };

  for (const r of results) {
    const name = (r.test || '(unnamed test)').toString();
    const status = (r.status || 'errored').toLowerCase();
    counts[status] = (counts[status] || 0) + 1;
    const freeVars = Array.isArray(r.freeVars) && r.freeVars.length > 0
      ? r.freeVars.join(', ')
      : null;

    if (status === 'proved') {
      const range = freeVars ? ` for every possible ${freeVars}` : '';
      lines.push(`We proved: ${name}${range}.`);
    } else if (status === 'partial') {
      const reason = describePartial(r);
      lines.push(`Partly proved: ${name}. ${reason}`);
    } else if (status === 'failed') {
      const example = describeCounterexample(r);
      lines.push(`Counterexample found for: ${name}. ${example}`);
    } else if (status === 'unverifiable') {
      const cause = describeImpurity(r);
      lines.push(`We can't math-prove "${name}" because it ${cause}. Tests still cover the cases you wrote.`);
    } else {
      const reason = (r.error || 'unknown error').toString().slice(0, 200);
      lines.push(`"${name}" couldn't be checked: ${reason}.`);
    }
  }

  return { lines, counts, headline: buildHeadline(counts) };
}

function describePartial(result) {
  const failed = (result.assertions || []).filter(a => a && a.unknown === true);
  if (failed.length === 0) {
    return 'Tests pass for the cases we tried; the math prover can\'t yet decide every case.';
  }
  return `${failed.length} assertion(s) the simplifier couldn't yet decide. Tests still pass for the cases the suite exercises.`;
}

function describeCounterexample(result) {
  const broken = (result.assertions || []).find(a => a && a.passed === false && !a.unknown);
  if (!broken || !broken.observed) {
    return 'The rule does not hold for at least one input.';
  }
  const obs = JSON.stringify(broken.observed);
  const exp = JSON.stringify(broken.expected);
  return `Got ${obs}, expected ${exp}.`;
}

function describeImpurity(result) {
  const reason = (result.reason || result.error || '').toString();
  if (/\bask\s+claude\b|claude\b/i.test(reason)) return 'asks the AI assistant for an answer';
  if (/\bcall\s+api\b|http|fetch\b/i.test(reason)) return 'calls an outside service';
  if (/\bemail\b|smtp\b/i.test(reason)) return 'sends email';
  if (/\bdatabase\b|sqlite|postgres|sql/i.test(reason)) return 'reads or writes the database';
  if (/\btime\b|now\(|date\.now/i.test(reason)) return 'depends on the current time';
  if (/\brandom\b/i.test(reason)) return 'depends on random values';
  return 'talks to the world (database, email, AI, time, or randomness)';
}

function buildHeadline(counts) {
  const parts = [];
  if (counts.proved) parts.push(`${counts.proved} proved`);
  if (counts.partial) parts.push(`${counts.partial} partly proved`);
  if (counts.failed) parts.push(`${counts.failed} counterexample${counts.failed === 1 ? '' : 's'}`);
  if (counts.unverifiable) parts.push(`${counts.unverifiable} not math-checkable`);
  if (counts.errored) parts.push(`${counts.errored} errored`);
  if (parts.length === 0) return 'No tests checked.';
  return parts.join(', ') + ` (${counts.total || 0} total).`;
}

// ── CLI ──────────────────────────────────────────────────────────────
const isMain = import.meta.url === pathToFileURL(process.argv[1] || '').href;
if (isMain) {
  await runCli(process.argv.slice(2));
}

async function runCli(argv) {
  const flags = new Set(argv.filter(a => a.startsWith('--')));
  const positional = argv.filter(a => !a.startsWith('--'));
  const wantJson = flags.has('--json');
  const wantStdin = flags.has('--stdin');

  let bundle;
  if (wantStdin) {
    const raw = await readStream(process.stdin);
    bundle = JSON.parse(raw);
  } else {
    const file = positional[0];
    if (!file) {
      console.error('Usage: proof-business-language.mjs <file.clear> [--json]');
      console.error('   or: cat bundle.json | proof-business-language.mjs --stdin [--json]');
      process.exit(2);
    }
    const source = readFileSync(resolve(file), 'utf8');
    const { prove } = await import(pathToFileURL(resolve('lib/prover/index.js')).href);
    bundle = prove(source);
  }

  const out = translateBundle(bundle);
  if (wantJson) {
    console.log(JSON.stringify({ ...out, raw: bundle, race_condition_note: RACE_CONDITION_NOTE }, null, 2));
    return;
  }
  console.log('Business-language proof report');
  console.log('==============================');
  console.log(`Headline: ${out.headline}`);
  console.log('');
  for (const line of out.lines) console.log(`- ${line}`);
  console.log('');
  console.log(RACE_CONDITION_NOTE);
}

function readStream(stream) {
  return new Promise((res, rej) => {
    let data = '';
    stream.setEncoding('utf8');
    stream.on('data', chunk => { data += chunk; });
    stream.on('end', () => res(data));
    stream.on('error', rej);
  });
}

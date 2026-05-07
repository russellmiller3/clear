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
  + 'against single inputs (does the rule hold for every possible input?). '
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

// Translate the per-rule verdicts (bundle.rules) the way translateBundle
// translates the per-test verdicts (bundle.results). Rules use a different
// shape — `verdict: 'proved' | 'disproved' | 'unverifiable'` — but the
// plain-English mapping is the same idea: the math-mode label becomes a
// CRO-readable sentence.
//
// Returns { lines, counts, headline }. The headline reads
// "We proved N of M named rules in this app, for every possible input."
// when at least one rule exists; empty when no rules. "input" is the
// neutral noun — works for deal, lead, expense, ticket, pto_request, or
// any other entity name without lying. (A future change could derive the
// actual entity name from the rule's guard expression — `lead's email`
// would surface as "every possible lead" — but that requires the prover
// to attach entity info to each rule, which it does not yet.)
export function translateRules(bundle) {
  const rules = Array.isArray(bundle && bundle.rules) ? bundle.rules : [];
  const counts = { proved: 0, disproved: 0, unverifiable: 0, total: rules.length };
  const lines = [];

  for (const r of rules) {
    const name = (r.name || '(unnamed rule)').toString();
    const verdict = (r.verdict || 'unknown').toLowerCase();
    if (verdict === 'proved') {
      counts.proved += 1;
      const entityWord = (r.entity && typeof r.entity === 'string') ? r.entity : 'input';
      // The headline reads the same as before. The agent-bounding claim is
      // appended ONLY when the prover marked the rule with bounds_agent_output:
      // true — meaning an agent invocation ran earlier in the same body AND
      // every called agent is output-only (no tools). The wording stays
      // precise: "RETURN VALUE cannot bypass" — NOT "agent cannot bypass."
      // For agents with tools, the rule guards what the agent RETURNS, but
      // tool calls during the agent's execution can still mutate state. The
      // prover (in lib/prover/index.js) drops the bounds flag when any called
      // agent has tools, so this clause never fires misleadingly. To prevent
      // tool actions, use `must not: ...` on the agent — that's a build-time
      // check on every tool's effects, not a runtime gate on the return value.
      const baseSentence = `PROVED for every possible ${entityWord}`;
      const sentence = r.bounds_agent_output === true
        ? `${baseSentence} — the agent's return value cannot bypass this rule (the rule fires after the agent returns; for tool actions, use \`must not:\` on the agent)`
        : baseSentence;
      lines.push({
        verdict: 'proved',
        name,
        sentence,
        bounds_agent_output: r.bounds_agent_output === true,
      });
    } else if (verdict === 'disproved') {
      counts.disproved += 1;
      const example = describeRuleCounterexample(r);
      lines.push({ verdict: 'disproved', name, sentence: `Counterexample: ${example}` });
    } else if (verdict === 'unverifiable') {
      counts.unverifiable += 1;
      const cause = describeImpurity(r);
      lines.push({ verdict: 'unverifiable', name, sentence: `${capitalize(cause)} — not provable, tests still cover it` });
    } else {
      lines.push({ verdict: 'unknown', name, sentence: 'Could not be checked' });
    }
  }

  let headline = '';
  if (counts.total > 0) {
    // Pick a noun for the headline. Only count entities from PROVED rules
    // — unverifiable rules sometimes pull in misleading variable names
    // (e.g. `found = look up Deal ...` makes "found" the entity, which is
    // a local result variable, not the rule's audience). If every PROVED
    // rule shares the same entity name, use it ("every possible deal").
    // If they vary or there are no PROVED-rule entities, fall back to the
    // neutral "input" — accurate but less compelling.
    const entities = new Set();
    for (const r of rules) {
      if (r.verdict !== 'proved') continue;
      if (r.entity && typeof r.entity === 'string') entities.add(r.entity);
    }
    const headlineNoun = entities.size === 1 ? Array.from(entities)[0] : 'input';
    headline = `We proved ${counts.proved} of ${counts.total} named rules in this app, for every possible ${headlineNoun}.`;
  }

  return { lines, counts, headline };
}

// Compose the full default `clear prove` output: the human-friendly default
// surface. Replaces the old formatBundle() output one-for-one — same
// information, plain English. Math-mode (formatBundle) stays available
// behind the --math flag for prover engineers.
//
// Returns a single multi-line string the CLI prints. The shape:
//
//   We proved N of M named rules in this app, for every possible input.
//
//     ✅ discount-cap        PROVED for every possible input
//     ⚠  reads-the-database  Reads or writes the database — not provable, ...
//
//   Tests in this file: <test verdicts in plain English>
//
// The function gracefully handles bundles with no rules (falls back to test
// verdicts only) and bundles with no tests (rules-only file). If both are
// empty, returns a one-line "nothing to prove" sentence — same semantics as
// formatBundle's empty-bundle path.
export function formatProveOutput(bundle) {
  if (!bundle || typeof bundle !== 'object') {
    return 'No proof bundle to render.';
  }

  const ruleResult = translateRules(bundle);
  const testResult = translateBundle(bundle);
  const out = [];

  // Rules section — only if rules exist. The headline + bullet list is the
  // load-bearing surface for the regulated-tier sale.
  if (ruleResult.counts.total > 0) {
    out.push(ruleResult.headline);
    out.push('');
    const nameWidth = ruleResult.lines.reduce((w, l) => Math.max(w, l.name.length), 0);
    for (const item of ruleResult.lines) {
      const icon = item.verdict === 'proved'       ? 'OK '
                 : item.verdict === 'disproved'    ? 'X  '
                 : item.verdict === 'unverifiable' ? '!  '
                 :                                   '?  ';
      const padded = item.name.padEnd(nameWidth, ' ');
      out.push(`  ${icon} ${padded}  ${item.sentence}`);
    }
  }

  // Tests section — only if tests exist. Surface each test verdict as its
  // CRO-readable sentence; the headline summarises counts.
  if (testResult.counts.total > 0) {
    if (out.length > 0) out.push('');
    out.push(`Tests in this file: ${testResult.headline}`);
    out.push('');
    for (const line of testResult.lines) {
      out.push(`  - ${line}`);
    }
  }

  // Agent tool-bound claims (2026-05-07). One section per file, same shape
  // as the rules section. The CRO sees verdicts attributed by agent +
  // forbidden action — "Refund Bot cannot delete from Deals — PROVED" is
  // the regulated-tier audit sentence.
  const boundClaims = Array.isArray(bundle.boundClaims) ? bundle.boundClaims : [];
  if (boundClaims.length > 0) {
    if (out.length > 0) out.push('');
    const counts = bundle.boundCounts || { proved: 0, disproved: 0, unverifiable: 0, total: boundClaims.length };
    out.push(`Agent tool-bound claims: ${counts.proved} of ${counts.total} proved${counts.disproved ? `, ${counts.disproved} disproved` : ''}${counts.unverifiable ? `, ${counts.unverifiable} unverifiable` : ''}.`);
    out.push('');
    for (const claim of boundClaims) {
      const icon = claim.verdict === 'proved'       ? 'OK '
                 : claim.verdict === 'disproved'    ? 'X  '
                 : claim.verdict === 'unverifiable' ? '!  '
                 :                                    '?  ';
      const action =
        claim.claimKind === 'call'   ? `cannot call '${claim.target}'` :
        claim.claimKind === 'delete' ? `cannot delete from '${claim.target}'` :
        claim.claimKind === 'modify' ? `cannot modify '${claim.target}'` :
                                       `cannot affect '${claim.target}'`;
      out.push(`  ${icon} agent '${claim.agentName}' ${action} — ${claim.reason}`);
    }
  }

  // Empty file — nothing was proved AND nothing was tested AND no agent
  // tool-bound claims. Mirror formatBundle's "Summary: No tests in the
  // program" voice in plain English.
  if (ruleResult.counts.total === 0 && testResult.counts.total === 0 && boundClaims.length === 0) {
    return 'No rules or tests in this file — nothing to prove.';
  }

  return out.join('\n');
}

function describeRuleCounterexample(rule) {
  // Rule disproof comes back from the prover as a short text reason, not a
  // structured assertion record. Pass through the reason directly when
  // present; otherwise fall back to a generic phrasing.
  const reason = (rule.reason || rule.example || '').toString().trim();
  if (!reason) return 'the rule does not hold for at least one input';
  return reason;
}

function capitalize(s) {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
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

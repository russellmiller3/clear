// Miller v2 — single-turn repair A/B (MF-2).
//
// Hypothesis: the RANKED violation-vector feedback makes Meph fix the HARD gaps (approval, audit)
// in one repair turn more often than the old FLAT feedback. This is the cleanest test of the
// claim, because the ONLY thing that differs between the two arms is the Ralph message:
//
//   control  (flat)   = CLEAR_MILLER_RANK_DISABLE=1  → unordered gap list, no vector line
//   treatment(ranked) = default                       → worst-first list + "Violation vector: ..."
//
// Everything else — the fake-complete fixture, the approved requirements, the syntax primer, the
// system instructions, the model — is identical. We hand Meph the fixture + requirements + the arm's
// feedback, ask for ONE corrected source, then re-audit the output and check whether the hard
// families (approval, audit) went missing → passed. Deterministic measurement; the model only
// supplies the repair.
//
// Defaults CHEAP (Haiku 4.5) per the "never default to premium models" learning. --dry-run builds
// and prints both arms' prompts with NO API call (free) so the harness can be validated before spend.
//
// Usage:
//   node scripts/miller-ab-repair.mjs --dry-run                 # free: show both prompts + fixture audit
//   node scripts/miller-ab-repair.mjs --trials=4                # paid: 4 trials/arm on Haiku 4.5

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { auditRequirements } from '../studio/supervisor/requirements-audit.js';
import { formatRalphMessage } from '../studio/ralph-layer.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const MODEL = 'claude-haiku-4-5-20251001';
// Haiku 4.5 list pricing, $ per million tokens (matches studio/supervisor/verify-caching.js).
const PRICE_IN_PER_M = 1.0;
const PRICE_OUT_PER_M = 5.0;

// A fake-complete deal-desk app: it stores the deal and exposes a create flow + a dashboard, but it
// has NO real approval routing and NO audit trail. It compiles and "looks done" — the exact trap.
export const FIXTURE = `create a deals table:
  rep_email
  customer
  list_price
  discount_percent
  status

when user sends new deal to '/api/deals':
  save new deal

page 'Deal Desk' at '/':
  show all deals`;

// Approved requirements, deliberately ORDERED soft-gap-first so raw order != priority order — that
// is the scenario where ranking should matter. One already-met (storage), one SOFT gap listed early
// (notification), then two HARD gaps (approval, audit). Control shows them in this raw order (soft
// first); treatment re-ranks hard-first and adds the vector line.
export const REQUIREMENTS = [
  'deals must store rep_email, customer, list_price, discount_percent, and status',
  'email the rep when their deal status changes',
  'discounts of 30 percent or more require CRO approval',
  'every approval decision must be logged in an audit trail',
];

// Identical syntax primer for BOTH arms — gives Meph the means to fix any gap, so the only steering
// difference is the feedback ordering, not syntax recall.
const SYNTAX_PRIMER = `Clear syntax you may need:
- A table: "create a deals table:" then indented field names.
- An approval workflow: "queue for deal: reviewer is 'CRO'" — this routes deals to a reviewer AND
  auto-generates an audit trail (who decided, what status, when).
- A page heading: inside a "page '...' at '/':" block, "heading 'Pending Approvals'".
- Threshold rules: "rule discount-cap: enforce that deal's discount_percent is less than 30, or fail
  with error message: '...requires CRO approval'".
Write plain Clear. One operation per line.`;

const SYSTEM = `You are Meph, an app builder for the Clear language. You are given a Clear app, its
approved requirements, and automated feedback about what is missing. Fix the source so it satisfies
the requirements. Output ONLY the complete corrected Clear source — no prose, no markdown fences.
${SYNTAX_PRIMER}`;

/** Build the Ralph feedback for an arm by toggling the rank flag around formatRalphMessage. Reads/writes its own env key, restores it. */
export function buildArmMessage(audit, arm) {
  const previous = process.env.CLEAR_MILLER_RANK_DISABLE;
  if (arm === 'control') process.env.CLEAR_MILLER_RANK_DISABLE = '1';
  else delete process.env.CLEAR_MILLER_RANK_DISABLE;
  try {
    return formatRalphMessage({ audit, retryIndex: 1, maxRetries: 2 });
  } finally {
    if (previous === undefined) delete process.env.CLEAR_MILLER_RANK_DISABLE;
    else process.env.CLEAR_MILLER_RANK_DISABLE = previous;
  }
}

/** Status of one constraint family in an audit's items ('passed' | 'missing' | 'unverified' | 'absent'). Pure. */
export function familyStatus(audit, familyKey) {
  const found = (audit.items || []).find(entry => entry.family === familyKey);
  return found ? found.status : 'absent';
}

/** Compare a before/after audit and report which hard families went missing → passed. Pure. */
export function measureFix(beforeAudit, afterAudit) {
  const wasMissing = (audit, key) => familyStatus(audit, key) === 'missing';
  const nowPassed = (audit, key) => familyStatus(audit, key) === 'passed';
  const approvalFixed = wasMissing(beforeAudit, 'approval') && nowPassed(afterAudit, 'approval');
  const auditFixed = wasMissing(beforeAudit, 'audit') && nowPassed(afterAudit, 'audit');
  return {
    approvalFixed,
    auditFixed,
    hardFixedCount: (approvalFixed ? 1 : 0) + (auditFixed ? 1 : 0),
  };
}

/** Build the user turn for a repair trial. Pure. */
export function buildRepairPrompt(source, requirements, ralphMessage) {
  return [
    'APP SOURCE:', source, '',
    'APPROVED REQUIREMENTS:', ...requirements.map(requirement => `- ${requirement}`), '',
    'AUTOMATED FEEDBACK:', ralphMessage, '',
    'Return the complete corrected Clear source only.',
  ].join('\n');
}

/** Pull a Clear source body out of a model reply (strip markdown fences / leading prose). Pure. */
export function extractSource(rawResponse) {
  const fenced = String(rawResponse || '').match(/```(?:clear)?\n([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  return String(rawResponse || '').trim();
}

function loadEnv() {
  const envPath = join(ROOT, '.env');
  if (!existsSync(envPath)) return;
  for (const rawLine of readFileSync(envPath, 'utf8').split('\n')) {
    const line = rawLine.replace(/\r$/, '');
    const eq = line.indexOf('=');
    if (eq > 0 && !line.startsWith('#')) {
      const key = line.slice(0, eq).trim();
      if (!process.env[key]) process.env[key] = line.slice(eq + 1).trim();
    }
  }
}

async function callHaiku(userMessage, apiKey) {
  const apiResponse = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
      'x-api-key': apiKey,
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1500,
      // Cache the shared system block (identical across every trial + both arms) per the
      // always-use-prompt-caching rule — cuts repeat input cost ~10x after the first call.
      system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: userMessage }],
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!apiResponse.ok) {
    throw new Error(`HTTP ${apiResponse.status}: ${(await apiResponse.text()).slice(0, 200)}`);
  }
  const payload = await apiResponse.json();
  const assistantText = (payload.content || []).filter(block => block.type === 'text').map(block => block.text).join('');
  return { assistantText, usage: payload.usage || {} };
}

async function runArm(arm, trials, apiKey) {
  const beforeAudit = auditRequirements({ source: FIXTURE, requirements: REQUIREMENTS });
  const ralphMessage = buildArmMessage(beforeAudit, arm);
  const userMessage = buildRepairPrompt(FIXTURE, REQUIREMENTS, ralphMessage);

  const outcomes = [];
  let inTokens = 0;
  let outTokens = 0;
  for (let trial = 0; trial < trials; trial++) {
    const { assistantText, usage } = await callHaiku(userMessage, apiKey);
    inTokens += (usage.input_tokens || 0) + (usage.cache_read_input_tokens || 0);
    outTokens += usage.output_tokens || 0;
    const afterAudit = auditRequirements({ source: extractSource(assistantText), requirements: REQUIREMENTS });
    const fix = measureFix(beforeAudit, afterAudit);
    outcomes.push(fix);
    console.log(`  [${arm}] trial ${trial + 1}/${trials}: approval=${fix.approvalFixed ? '✓' : '✗'} audit=${fix.auditFixed ? '✓' : '✗'}`);
  }
  return { arm, outcomes, inTokens, outTokens };
}

export function summarizeArm(armOutcome) {
  const trialCount = armOutcome.outcomes.length;
  const approval = armOutcome.outcomes.filter(outcome => outcome.approvalFixed).length;
  const auditFamily = armOutcome.outcomes.filter(outcome => outcome.auditFixed).length;
  const bothHard = armOutcome.outcomes.filter(outcome => outcome.hardFixedCount === 2).length;
  return { trialCount, approval, auditFamily, bothHard };
}

async function main() {
  loadEnv();
  const argv = process.argv.slice(2);
  const dryRun = argv.includes('--dry-run');
  const trialsArg = argv.find(a => a.startsWith('--trials='));
  const trials = trialsArg ? parseInt(trialsArg.split('=')[1], 10) : 4;

  const beforeAudit = auditRequirements({ source: FIXTURE, requirements: REQUIREMENTS });
  console.log('=== Miller A/B — single-turn repair ===');
  console.log(`Fixture audit (before): approval=${familyStatus(beforeAudit, 'approval')}, audit=${familyStatus(beforeAudit, 'audit')}, notification=${familyStatus(beforeAudit, 'notification')}, storage=${familyStatus(beforeAudit, 'storage')}`);

  if (dryRun) {
    for (const arm of ['control', 'treatment']) {
      console.log(`\n────── ${arm} message ──────`);
      console.log(buildArmMessage(beforeAudit, arm));
    }
    console.log('\n[dry-run] no API calls made.');
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) { console.error('ANTHROPIC_API_KEY not set (in env or .env).'); process.exit(1); }

  const armOutcomes = [];
  for (const arm of ['control', 'treatment']) {
    console.log(`\n── arm: ${arm} (${trials} trials) ──`);
    armOutcomes.push(await runArm(arm, trials, apiKey));
  }

  const totalIn = armOutcomes.reduce((sum, armOutcome) => sum + armOutcome.inTokens, 0);
  const totalOut = armOutcomes.reduce((sum, armOutcome) => sum + armOutcome.outTokens, 0);
  const cost = (totalIn / 1e6) * PRICE_IN_PER_M + (totalOut / 1e6) * PRICE_OUT_PER_M;

  console.log('\n=== Summary ===');
  console.log('| arm       | approval-fixed | audit-fixed | both-hard |');
  console.log('|-----------|----------------|-------------|-----------|');
  for (const armOutcome of armOutcomes) {
    const stats = summarizeArm(armOutcome);
    console.log(`| ${armOutcome.arm.padEnd(9)} | ${(stats.approval + '/' + stats.trialCount).padEnd(14)} | ${(stats.auditFamily + '/' + stats.trialCount).padEnd(11)} | ${(stats.bothHard + '/' + stats.trialCount).padEnd(9)} |`);
  }
  console.log(`\nTokens: ${totalIn} in, ${totalOut} out. Estimated cost: $${cost.toFixed(3)} (Haiku 4.5).`);
}

if (process.argv[1] && process.argv[1].endsWith('miller-ab-repair.mjs')) {
  main().catch(err => { console.error('A/B failed:', err.message); process.exit(1); });
}

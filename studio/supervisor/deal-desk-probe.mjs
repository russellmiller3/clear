// Probe: run Marcus-style requirements against the real deal-desk app.
// Each requirement is phrased the way a business person would write it,
// not the way a developer would. Goal: find gaps in what the checker can verify.

import { readFileSync } from 'fs';
import { auditRequirements } from './requirements-audit.js';
import { compileProgram } from '../../index.js';

const source = readFileSync(
  new URL('../../apps/deal-desk/main.clear', import.meta.url),
  'utf8'
);
const compiled = compileProgram(source);

const requirements = [
  // Storage / data shape
  { id: 'r01', text: 'deals must store customer, discount_percent, list_price, and status' },
  { id: 'r02', text: 'deal data must be stored with rep_name, rep_email, and customer' },
  { id: 'r03', text: 'deals must store the discount percent and list price' },

  // Approval routing / thresholds
  { id: 'r04', text: 'deals with discount over 30% route to VP approval' },
  { id: 'r05', text: 'deals at least 30 percent discount require VP approval' },
  { id: 'r06', text: 'discounts of 30 percent or more require VP approval' },

  // Role restrictions
  { id: 'r07', text: 'only CROs can approve deals' },
  { id: 'r08', text: 'reps can create deals' },

  // Audit trail
  { id: 'r09', text: 'an audit trail must store every status change with the actor\'s email and timestamp' },
  { id: 'r10', text: 'every approval decision must be logged' },

  // Notifications
  { id: 'r11', text: 'notify the rep via email when a deal is approved or rejected' },
  { id: 'r12', text: 'email the customer when a deal is countered or awaiting their response' },

  // Dashboard / UI
  { id: 'r13', text: 'show a dashboard with a pending queue for CRO review' },
  { id: 'r14', text: 'managers can approve or reject pending deals' },

  // Business rules / domain
  { id: 'r15', text: 'calling POST /api/deals with a discount of 30% or more returns a 400 error' },
  { id: 'r16', text: 'the list price must be greater than zero' },

  // AI / agent
  { id: 'r17', text: 'an AI agent can draft a deal summary from the deal details' },
];

const audit = auditRequirements({
  source,
  ast: compiled.ast,
  compileResult: compiled,
  requirements,
});

const byStatus = { passed: [], missing: [], unverified: [] };
for (const item of audit.items) {
  byStatus[item.status].push(item);
}

console.log(`\n${'='.repeat(60)}`);
console.log(`Deal-Desk Compliance Probe — ${new Date().toISOString().slice(0, 10)}`);
console.log(`${'='.repeat(60)}`);
console.log(`✅ Passed:     ${byStatus.passed.length}`);
console.log(`❌ Missing:    ${byStatus.missing.length}`);
console.log(`⚠️  Unverified: ${byStatus.unverified.length}`);
console.log();

if (byStatus.passed.length) {
  console.log('── PASSED ────────────────────────────────────────────────');
  for (const item of byStatus.passed) {
    console.log(`  [${item.id}] ${item.text}`);
    console.log(`         → ${item.reason}`);
  }
  console.log();
}

if (byStatus.missing.length) {
  console.log('── MISSING (code gap or wrong phrasing) ─────────────────');
  for (const item of byStatus.missing) {
    console.log(`  [${item.id}] ${item.text}`);
    console.log(`         → ${item.reason}`);
  }
  console.log();
}

if (byStatus.unverified.length) {
  console.log('── UNVERIFIED (checker can\'t evaluate this yet) ──────────');
  for (const item of byStatus.unverified) {
    console.log(`  [${item.id}] ${item.text}`);
    console.log(`         → ${item.reason}`);
  }
  console.log();
}

// Miller v2 — Ralph adapter (consumer #1 of the engine).
//
// The app-checker (requirements-audit.js) already runs each requirement through a named detector
// and returns passed / missing / unverified with a reason. This adapter does NOT re-judge any of
// that. It re-SCORES it: each detector owns a Miller constraint family (a priority lane), every
// unmet requirement becomes a per-family violation magnitude, and the domain-agnostic engine
// (lib/miller) projects a priority-weighted energy and ranks the repair worst-first.
//
// Result: instead of a flat "these 4 things are missing" list, the checker says
//   V = (approval=1, audit=1, role_check=1)  E=...  -> "fix the approval workflow first".

import { evaluate } from '../../lib/miller/index.js';

// Constraint families, highest tier = hardest. A single hard-family miss outweighs any pile of
// soft-family misses (priority preservation is proven in the engine's axiom tests).
export const RALPH_FAMILIES = Object.freeze([
  // tier 2 — hard. The regulated-tier bar: who approved, was it enforced, is it recorded.
  { key: 'approval', label: 'Approval routing', tier: 2 },
  { key: 'role_check', label: 'Role restriction', tier: 2 },
  { key: 'enforcement', label: 'Decision enforcement', tier: 2 },
  { key: 'audit', label: 'Audit trail', tier: 2 },
  { key: 'domain_rule', label: 'Domain rule', tier: 2 },
  { key: 'storage', label: 'Data storage', tier: 2 },
  { key: 'auth', label: 'Authenticated access', tier: 2 },
  { key: 'workflow', label: 'Create / submit flow', tier: 2 },
  // tier 1 — medium. Real capability, but not the provable-correctness core.
  { key: 'agent', label: 'AI agent capability', tier: 1 },
  { key: 'read_access', label: 'Read / list access', tier: 1 },
  { key: 'concurrency', label: 'Concurrency safety', tier: 1 },
  { key: 'unknown', label: 'Unclassified requirement', tier: 1 },
  // tier 0 — soft. Visible polish; never blocks the regulated bar on its own.
  { key: 'notification', label: 'Notification', tier: 0 },
  { key: 'ui', label: 'Dashboard / display', tier: 0 },
]);

// A missing requirement is a harder violation than an unverified one (no evidence either way).
const STATUS_MAGNITUDE = Object.freeze({ missing: 2, unverified: 1 });

const DECLARED_FAMILIES = new Set(RALPH_FAMILIES.map(family => family.key));

function familyKeyFor(auditItem) {
  const key = auditItem && auditItem.family;
  return DECLARED_FAMILIES.has(key) ? key : 'unknown';
}

// Turn an audit result into engine violations. Passed/waived requirements contribute nothing.
export function auditToViolations(audit) {
  const auditItems = (audit && Array.isArray(audit.items)) ? audit.items : [];
  return auditItems
    .filter(auditItem => auditItem && auditItem.status !== 'passed' && auditItem.status !== 'waived')
    .map(auditItem => ({
      family: familyKeyFor(auditItem),
      magnitude: STATUS_MAGNITUDE[auditItem.status] || 1,
      hint: auditItem.reason || auditItem.text || '',
    }));
}

// Full Miller view of an audit: { vector, energy, hints } over the Ralph family taxonomy.
export function evaluateAudit(audit) {
  return evaluate(auditToViolations(audit), RALPH_FAMILIES);
}

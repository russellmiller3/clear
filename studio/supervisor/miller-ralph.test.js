// Miller v2 — Ralph adapter. Wires the app-checker's per-requirement audit into the
// domain-agnostic Miller engine (lib/miller). Each checker detector owns a constraint family;
// unmet requirements become per-family violation magnitudes; the engine ranks the repair.
//
// This is consumer #1 of the engine. The adapter does NOT re-decide pass/fail — it re-scores
// the audit that already exists (learnings: don't make layers fight over the verdict).

import { describe, it, expect, run } from '../../lib/testUtils.js';
import { auditRequirements } from './requirements-audit.js';
import { RALPH_FAMILIES, auditToViolations, evaluateAudit } from './miller-ralph.js';

describe('miller-ralph — family taxonomy', () => {
  it('every family has a string key, a label, and an integer tier', () => {
    expect(Array.isArray(RALPH_FAMILIES)).toBe(true);
    expect(RALPH_FAMILIES.length > 0).toBe(true);
    for (const family of RALPH_FAMILIES) {
      expect(typeof family.key).toBe('string');
      expect(typeof family.label).toBe('string');
      expect(Number.isInteger(family.tier)).toBe(true);
    }
  });

  it('approval/audit/role are hard families; notification/ui are soft families', () => {
    const tierOf = (key) => (RALPH_FAMILIES.find(family => family.key === key) || {}).tier;
    expect(tierOf('approval') > tierOf('notification')).toBe(true);
    expect(tierOf('audit') > tierOf('ui')).toBe(true);
    expect(tierOf('role_check') > tierOf('notification')).toBe(true);
  });
});

describe('miller-ralph — auditToViolations', () => {
  it('keeps only non-passed items and weights missing harder than unverified', () => {
    const audit = {
      ok: false,
      items: [
        { id: 'r1', text: 'storage', status: 'passed', family: 'storage', reason: 'ok' },
        { id: 'r2', text: 'approval routing', status: 'missing', family: 'approval', reason: 'No route assigns deals to CRO.' },
        { id: 'r3', text: 'optimistic lock', status: 'unverified', family: 'concurrency', reason: 'No marker found.' },
      ],
    };
    const violations = auditToViolations(audit);

    expect(violations.length).toBe(2);
    const approval = violations.find(violation => violation.family === 'approval');
    const concurrency = violations.find(violation => violation.family === 'concurrency');
    expect(approval.hint).toBe('No route assigns deals to CRO.');
    expect(approval.magnitude > concurrency.magnitude).toBe(true);
  });
});

describe('miller-ralph — evaluateAudit on a fake-complete deal-desk app', () => {
  it('flags the missing approval workflow as a hard violation, ranked above cosmetics', () => {
    // Fake-complete: stores a deal with discount + status, exposes a create endpoint — but has NO
    // real approval routing, NO role check, NO audit trail. The classic "looks done, fails the
    // regulated bar" app the Marcus pitch hinges on catching.
    const source = `create a deals table:
  rep_email
  discount_percent
  status

when user sends new deal to '/api/deals':
  save new deal`;
    const requirements = [
      'deals must store rep_email, discount_percent, and status',
      'discounts of 30 percent or more require CRO approval',
      'every approval decision must be logged in an audit trail',
    ];

    const audit = auditRequirements({ source, requirements });
    const millerCheck = evaluateAudit(audit);

    // storage passes; approval + audit are unmet and must surface as violations.
    expect(millerCheck.energy > 0).toBe(true);
    expect(millerCheck.vector.approval > 0).toBe(true);
    // The worst-first repair list leads with a hard-family fix, never a soft one.
    expect(millerCheck.hints[0].tier >= 2).toBe(true);
  });
});

run();

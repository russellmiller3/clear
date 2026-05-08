import { describe, it, expect, run } from '../../lib/testUtils.js';
import { compileProgram } from '../../index.js';
import { auditRequirements } from './requirements-audit.js';

describe('requirements audit', () => {
  it('passes data-shape and approval-routing evidence', () => {
    const source = `
requirements:
  each deal stores customer, amount, status, and approver
  deals at least 50000 route to VP approval

build for javascript backend
create a Deals table:
  customer, required
  amount, number, required
  status, required
  approver, required

when user sends deal to /api/deals:
  if deal's amount is at least 50000:
    set deal's approver to 'VP'
  otherwise:
    set deal's approver to 'Manager'
  saved = save deal as new Deal
  send back saved

test:
  deals at least 50000 route to VP approval
`;
    const compiled = compileProgram(source);
    const audit = auditRequirements({
      source,
      ast: compiled.ast,
      compileResult: compiled,
      requirements: compiled.requirements,
    });

    expect(audit.ok).toBe(true);
    expect(audit.items.every(item => item.status === 'passed')).toBe(true);
  });

  it('marks optimistic lock as unverified when approval action lacks stale-update evidence', () => {
    const source = `
requirements:
  approval actions use optimistic lock protection

build for javascript backend
when user sends decision to /api/approve:
  set decision's status to 'approved'
  send back decision
`;

    const audit = auditRequirements({
      source,
      requirements: [{ id: 'req_1', text: 'approval actions use optimistic lock protection' }],
    });

    expect(audit.ok).toBe(false);
    expect(audit.items[0].status).toBe('unverified');
    expect(audit.items[0].reason).toContain('optimistic');
  });

  it('does not treat the requirements block itself as implementation evidence', () => {
    const source = `
requirements:
  deals at least 50000 route to VP approval

build for javascript backend
when user requests data from /api/health:
  send back 'ok'
`;

    const compiled = compileProgram(source);
    const audit = auditRequirements({
      source,
      ast: compiled.ast,
      compileResult: compiled,
      requirements: compiled.requirements,
    });

    expect(audit.ok).toBe(false);
    expect(audit.items[0].status).not.toBe('passed');
  });
});

run();

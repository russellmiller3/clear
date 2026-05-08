import { describe, it, expect, run } from '../../lib/testUtils.js';
import {
  shouldRequireApproval,
  extractRequirementsDraft,
  validateRequirements,
  requirementsId,
  buildRequirementsInstruction,
  requirementsReviewEventFromAssistantText,
} from './requirements-contract.js';

describe('requirements contract', () => {
  it('requires approval for vague app-build requests', () => {
    expect(shouldRequireApproval('build me a deal approval app')).toBe(true);
    expect(shouldRequireApproval('Build a complete Clear app for a deal approval queue. Use approved requirements and retrieved patterns before choosing syntax.')).toBe(true);
    expect(shouldRequireApproval('what syntax routes approval by amount?')).toBe(false);
  });

  it('extracts a requirements block from Meph text', () => {
    const items = extractRequirementsDraft(`requirements:
  logged-in sellers can submit deals
  deals at least 50000 route to VP approval`);

    expect(items).toEqual([
      'logged-in sellers can submit deals',
      'deals at least 50000 route to VP approval',
    ]);
  });

  it('rejects vague requirements', () => {
    const result = validateRequirements([
      'the app is robust',
      'approval queue works',
    ], 'build me a deal approval app');

    expect(result.ok).toBe(false);
    expect(result.errors.some(e => e.includes('not observable'))).toBe(true);
  });

  it('rejects compound or non-e2e requirements for complex app builds', () => {
    const result = validateRequirements([
      'sales reps can create deals with an amount and stage; managers can review, approve, or reject deals above a $10,000 threshold',
      'deals must store title, amount, status (pending, approved, rejected), and the creator_id',
      "deals over $10,000 are automatically routed to a 'Manager' role for approval",
    ], 'build me a deal approval app');

    expect(result.ok).toBe(false);
    expect(result.errors.some(e => e.includes('one observable claim'))).toBe(true);
    expect(result.errors.some(e => e.includes('read/list/detail'))).toBe(true);
    expect(result.errors.some(e => e.includes('UI evidence'))).toBe(true);
  });

  it('accepts e2e CRUD-lifecycle requirements for complex app builds', () => {
    const result = validateRequirements([
      'sales reps can create a deal with title, amount, stage, and notes from a form',
      'deals must store title, amount, stage, status, creator_id, approver_role, and notes',
      'reps can see a list of their submitted deals with current status',
      'managers can see a pending approval queue assigned to the Manager role',
      'deals over 10000 route to Manager approval before they can be approved',
      'managers can approve or reject a pending deal and update its status',
      'sales reps are notified when a deal is approved or rejected',
      'all create, approve, reject, list, and detail actions are reachable from visible pages',
    ], 'build me a deal approval app');

    expect(result.ok).toBe(true);
  });

  it('creates stable ids for normalized text', () => {
    const a = requirementsId([' Deal approvals route to VP  ']);
    const b = requirementsId(['deal approvals route to vp']);

    expect(a).toBe(b);
  });

  it('builds a requirements-only instruction for complex app requests', () => {
    const text = buildRequirementsInstruction('build me a deal approval app');

    expect(text).toContain('Do not write Clear source yet');
    expect(text).toContain('requirements:');
    expect(text).toContain('CRUD');
    expect(text).toContain('UI');
  });

  it('turns assistant requirements into a review event', () => {
    const event = requirementsReviewEventFromAssistantText(`requirements:
  logged-in sellers can submit deals
  each deal stores customer, amount, status, and approver
  deals under 50000 route to manager approval
  deals at least 50000 route to VP approval
  approvers can approve or reject pending deals`);

    expect(event.type).toBe('requirements_review');
    expect(event.needsApproval).toBe(true);
    expect(event.requirements).toHaveLength(5);
  });
});

run();

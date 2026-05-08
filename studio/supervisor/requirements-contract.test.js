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

  it('creates stable ids for normalized text', () => {
    const a = requirementsId([' Deal approvals route to VP  ']);
    const b = requirementsId(['deal approvals route to vp']);

    expect(a).toBe(b);
  });

  it('builds a requirements-only instruction for complex app requests', () => {
    const text = buildRequirementsInstruction('build me a deal approval app');

    expect(text).toContain('Do not write Clear source yet');
    expect(text).toContain('requirements:');
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

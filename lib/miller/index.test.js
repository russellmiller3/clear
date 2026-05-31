// Miller v2 violation-vector engine — admissibility axioms.
//
// The engine is domain-agnostic: it knows nothing about Clear, requirements, or Ralph.
// It takes constraint families (named lanes with a priority tier) and per-family violation
// magnitudes, builds a violation vector, projects a priority-preserving scalar energy, and
// ranks repair hints worst-first. These tests lock the four Miller-admissibility axioms:
// coverage, monotonicity, distinguishability, priority-preservation.

import { describe, it, expect, run } from '../testUtils.js';
import {
  buildViolationVector,
  projectEnergy,
  generateRepairHints,
  evaluate,
} from './index.js';

describe('miller engine — buildViolationVector', () => {
  it('AXIOM coverage: every declared family appears in the vector, 0 when unviolated', () => {
    const families = [
      { key: 'workflow', label: 'Workflow', tier: 2 },
      { key: 'audit', label: 'Audit', tier: 2 },
      { key: 'cosmetic', label: 'Cosmetic', tier: 0 },
    ];
    const { vector } = buildViolationVector([{ family: 'workflow', magnitude: 1 }], families);

    expect(vector.workflow).toBe(1);
    expect(vector.audit).toBe(0);
    expect(vector.cosmetic).toBe(0);
    expect(Object.keys(vector).length).toBe(3);
  });

  it('AXIOM distinguishability: distinct families stay distinct dimensions, never collapsed', () => {
    const families = [
      { key: 'workflow', label: 'Workflow', tier: 2 },
      { key: 'audit', label: 'Audit', tier: 2 },
    ];
    const { vector } = buildViolationVector(
      [{ family: 'workflow', magnitude: 1 }, { family: 'audit', magnitude: 2 }],
      families,
    );

    expect(vector.workflow).toBe(1);
    expect(vector.audit).toBe(2);
  });

  it('accumulates multiple violations in the same family', () => {
    const families = [{ key: 'workflow', label: 'Workflow', tier: 2 }];
    const { vector } = buildViolationVector(
      [{ family: 'workflow', magnitude: 1 }, { family: 'workflow', magnitude: 3 }],
      families,
    );
    expect(vector.workflow).toBe(4);
  });

  it('throws on an unknown family (runtime guard, not silent drop)', () => {
    const families = [{ key: 'workflow', label: 'Workflow', tier: 2 }];
    let threw = false;
    try {
      buildViolationVector([{ family: 'nope', magnitude: 1 }], families);
    } catch (guardError) {
      threw = true;
    }
    expect(threw).toBe(true);
  });
});

describe('miller engine — projectEnergy', () => {
  it('AXIOM monotonicity: increasing one family magnitude strictly increases energy', () => {
    const families = [{ key: 'a', label: 'A', tier: 1 }];
    const energyOneViolation = projectEnergy(
      buildViolationVector([{ family: 'a', magnitude: 1 }], families).vector, families,
    );
    const energyTwoViolations = projectEnergy(
      buildViolationVector([{ family: 'a', magnitude: 2 }], families).vector, families,
    );
    expect(energyTwoViolations > energyOneViolation).toBe(true);
  });

  it('AXIOM priority-preservation: one hard violation outweighs a maxed pile of soft violations', () => {
    const families = [
      { key: 'hard', label: 'Hard', tier: 1 },
      { key: 'soft1', label: 'Soft 1', tier: 0 },
      { key: 'soft2', label: 'Soft 2', tier: 0 },
    ];
    const hardOnly = buildViolationVector([{ family: 'hard', magnitude: 1 }], families).vector;
    const softMaxed = buildViolationVector(
      [{ family: 'soft1', magnitude: 50 }, { family: 'soft2', magnitude: 50 }],
      families,
    ).vector;

    expect(projectEnergy(hardOnly, families) > projectEnergy(softMaxed, families)).toBe(true);
  });

  it('zero violations project to zero energy', () => {
    const families = [{ key: 'a', label: 'A', tier: 2 }, { key: 'b', label: 'B', tier: 0 }];
    expect(projectEnergy(buildViolationVector([], families).vector, families)).toBe(0);
  });
});

describe('miller engine — generateRepairHints', () => {
  it('ranks the hard-family fix first even when a soft family has a larger raw count', () => {
    const families = [
      { key: 'workflow', label: 'Workflow', tier: 2 },
      { key: 'cosmetic', label: 'Cosmetic', tier: 0 },
    ];
    const rankedHints = generateRepairHints(
      [
        { family: 'cosmetic', magnitude: 5, hint: 'fix the spacing' },
        { family: 'workflow', magnitude: 1, hint: 'add CRO approval' },
      ],
      families,
    );

    expect(rankedHints[0].family).toBe('workflow');
    expect(rankedHints[0].hint).toBe('add CRO approval');
    expect(rankedHints[rankedHints.length - 1].family).toBe('cosmetic');
  });
});

describe('miller engine — evaluate (convenience)', () => {
  it('returns the vector, energy, and ranked hints together', () => {
    const families = [
      { key: 'workflow', label: 'Workflow', tier: 2 },
      { key: 'cosmetic', label: 'Cosmetic', tier: 0 },
    ];
    const millerCheck = evaluate(
      [
        { family: 'workflow', magnitude: 1, hint: 'add CRO approval' },
        { family: 'cosmetic', magnitude: 2, hint: 'fix the spacing' },
      ],
      families,
    );

    expect(millerCheck.vector.workflow).toBe(1);
    expect(millerCheck.vector.cosmetic).toBe(2);
    expect(millerCheck.energy > 0).toBe(true);
    expect(millerCheck.hints[0].family).toBe('workflow');
  });
});

run();

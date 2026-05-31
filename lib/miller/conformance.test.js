// Miller v2 — cross-domain conformance.
//
// The whole point of Miller is that the engine is domain-agnostic: the SAME buildViolationVector /
// projectEnergy / generateRepairHints work on any problem whose failures decompose into named
// constraint families with priority tiers. These tests point the engine at two domains that have
// nothing to do with software requirements — Towers of Hanoi and a 2-link robot arm — and prove the
// four Miller-admissibility axioms still hold there.
//
// We hand-build the violation vectors here, exactly as the maze / GOAP / blocks-world / robot-arm
// experiments did. The novel, AUTOMATIC V-construction lives in the Ralph adapter (miller-ralph.js);
// this file proves the engine underneath is general, not Ralph-shaped.

import { describe, it, expect, run } from '../testUtils.js';
import { buildViolationVector, projectEnergy, generateRepairHints, evaluate } from './index.js';

// Towers of Hanoi: an illegal move dominates a larger-on-smaller stack, which dominates a misplaced
// goal block, which dominates taking extra moves.
const HANOI = [
  { key: 'illegal_move', label: 'Illegal move', tier: 3 },
  { key: 'bad_stack', label: 'Larger disk on smaller disk', tier: 2 },
  { key: 'goal_misplaced', label: 'Goal disk misplaced', tier: 1 },
  { key: 'path_cost', label: 'Extra moves', tier: 0 },
];

// 2-link robot arm: a joint-limit break dominates a collision, which dominates distance-to-target,
// which dominates an awkward pose.
const ROBOT_ARM = [
  { key: 'joint_limit', label: 'Joint limit exceeded', tier: 3 },
  { key: 'collision', label: 'Collision', tier: 2 },
  { key: 'target_error', label: 'Distance to target', tier: 1 },
  { key: 'awkwardness', label: 'Awkward pose', tier: 0 },
];

describe('miller conformance — Towers of Hanoi', () => {
  it('coverage + distinguishability hold for a hand-built Hanoi violation set', () => {
    const { vector } = buildViolationVector(
      [{ family: 'illegal_move', magnitude: 1 }, { family: 'path_cost', magnitude: 7 }],
      HANOI,
    );
    expect(vector.illegal_move).toBe(1);
    expect(vector.bad_stack).toBe(0);
    expect(vector.goal_misplaced).toBe(0);
    expect(vector.path_cost).toBe(7);
  });

  it('one illegal move outweighs a long but legal path (priority preservation)', () => {
    const illegalShort = buildViolationVector([{ family: 'illegal_move', magnitude: 1 }], HANOI).vector;
    const legalButLong = buildViolationVector([{ family: 'path_cost', magnitude: 500 }], HANOI).vector;
    expect(projectEnergy(illegalShort, HANOI) > projectEnergy(legalButLong, HANOI)).toBe(true);
  });

  it('the worst-first repair list leads with the illegal move, not the extra moves', () => {
    const rankedFixes = generateRepairHints(
      [
        { family: 'path_cost', magnitude: 9, hint: 'use fewer moves' },
        { family: 'illegal_move', magnitude: 1, hint: 'never place a larger disk on a smaller one' },
      ],
      HANOI,
    );
    expect(rankedFixes[0].family).toBe('illegal_move');
  });
});

describe('miller conformance — 2-link robot arm', () => {
  it('joint-limit break dominates collision dominates any awkwardness (lexicographic tiers)', () => {
    const jointBreak = evaluate([{ family: 'joint_limit', magnitude: 1 }], ROBOT_ARM);
    const collide = evaluate([{ family: 'collision', magnitude: 1 }], ROBOT_ARM);
    const awkwardPile = evaluate([{ family: 'awkwardness', magnitude: 999 }], ROBOT_ARM);

    expect(jointBreak.energy > collide.energy).toBe(true);
    expect(collide.energy > awkwardPile.energy).toBe(true);
  });

  it('reaching the target with no violations is zero energy regardless of family count', () => {
    expect(evaluate([], ROBOT_ARM).energy).toBe(0);
  });
});

run();

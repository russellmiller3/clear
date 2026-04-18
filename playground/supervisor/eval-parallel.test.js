import { describe, it, expect } from '../../lib/testUtils.js';
import { contiguousSlice, runParallelEval } from '../eval-parallel.js';
import { SCENARIOS } from '../eval-scenarios.js';

describe('contiguousSlice', () => {
  it('splits evenly when divisible', () => {
    const s = contiguousSlice([1, 2, 3, 4, 5, 6], 3);
    expect(s[0]).toEqual([1, 2]);
    expect(s[1]).toEqual([3, 4]);
    expect(s[2]).toEqual([5, 6]);
  });

  it('handles remainder with earlier slices larger (dependency-preserving)', () => {
    // 16 scenarios across 3 workers: 6 + 5 + 5
    const s = contiguousSlice(Array(16).fill(0).map((_, i) => i), 3);
    expect(s[0].length).toEqual(6);
    expect(s[1].length).toEqual(5);
    expect(s[2].length).toEqual(5);
    // Contiguous, not round-robin
    expect(s[0]).toEqual([0, 1, 2, 3, 4, 5]);
    expect(s[1]).toEqual([6, 7, 8, 9, 10]);
    expect(s[2]).toEqual([11, 12, 13, 14, 15]);
  });

  it('handles single worker (no partitioning)', () => {
    const s = contiguousSlice([1, 2, 3], 1);
    expect(s[0]).toEqual([1, 2, 3]);
  });

  it('handles fewer items than workers', () => {
    const s = contiguousSlice([1, 2], 5);
    expect(s.length).toEqual(5);
    // With 2 items and 5 slots: base=0, remainder=2 → first two slots get 1 item each
    expect(s[0]).toEqual([1]);
    expect(s[1]).toEqual([2]);
    expect(s[2]).toEqual([]);
  });
});

describe('SCENARIOS', () => {
  it('loads 16 scenarios', () => {
    expect(SCENARIOS.length).toEqual(16);
  });

  it('every scenario has required shape', () => {
    for (const s of SCENARIOS) {
      expect(s.name).toBeTruthy();
      expect(s.prompt).toBeTruthy();
      expect(s.expectTool).toBeTruthy();
      expect(typeof s.grade).toEqual('function');
    }
  });
});

describe('runParallelEval dry-run', () => {
  it('plans partition without spawning workers', async () => {
    const result = await runParallelEval({ workers: 3, dryRun: true });
    expect(result.dryRun).toEqual(true);
    expect(result.scenariosRun).toEqual(0);
  });
});

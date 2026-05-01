import { describe, it, expect } from '../lib/testUtils.js';
import {
  analyzeHintArtifacts,
  classifySweepArtifact,
  fisherExactTwoSided,
  summarizeTaskBuckets,
} from './hint-effect-report-helpers.mjs';

function bucket({ onPasses, onTrials, offPasses, offTrials, onMs = 60_000, offMs = 60_000 }) {
  return {
    hint_on: {
      trials: onTrials,
      passes: onPasses,
      passRate: onTrials ? onPasses / onTrials : 0,
      elapsedMsTotal: onTrials * onMs,
      avgElapsedMs: onMs,
    },
    hint_off: {
      trials: offTrials,
      passes: offPasses,
      passRate: offTrials ? offPasses / offTrials : 0,
      elapsedMsTotal: offTrials * offMs,
      avgElapsedMs: offMs,
    },
    lift: (onTrials ? onPasses / onTrials : 0) - (offTrials ? offPasses / offTrials : 0),
  };
}

describe('hint-effect-report measurement helpers', () => {
  it('excludes saturated tasks from the headline and keeps them in the appendix', () => {
    const artifact = {
      path: 'synthetic-ab.json',
      startedAt: '2026-05-01T12:00:00.000Z',
      elapsedMs: 1_200_000,
      summary: {
        counter: bucket({ onPasses: 10, onTrials: 10, offPasses: 10, offTrials: 10 }),
        'deal-desk': bucket({ onPasses: 9, onTrials: 10, offPasses: 2, offTrials: 10 }),
      },
      trials: [],
    };

    const report = analyzeHintArtifacts([artifact]);

    expect(report.headline.includedTasks.map(t => t.taskId)).toEqual(['deal-desk']);
    expect(report.appendix.saturatedTasks.map(t => t.taskId)).toEqual(['counter']);
    expect(report.headline.hintOn.passes).toEqual(9);
    expect(report.headline.hintOff.passes).toEqual(2);
    expect(report.headline.verdict).toEqual('significant_positive');
  });

  it('returns underpowered when the hard-task subset has too few trials', () => {
    const report = analyzeHintArtifacts([{
      path: 'tiny-ab.json',
      startedAt: '2026-05-01T12:00:00.000Z',
      elapsedMs: 600_000,
      summary: {
        'deal-desk': bucket({ onPasses: 3, onTrials: 3, offPasses: 1, offTrials: 3 }),
      },
      trials: [],
    }]);

    expect(report.headline.verdict).toEqual('underpowered');
    expect(report.headline.requiredTrialsPerArm).toEqual(10);
  });

  it('excludes suspicious-fast artifacts from the headline evidence', () => {
    const artifact = {
      path: 'fast-ab.json',
      startedAt: '2026-05-01T12:00:00.000Z',
      elapsedMs: 4_000,
      summary: {
        'deal-desk': bucket({ onPasses: 10, onTrials: 10, offPasses: 0, offTrials: 10 }),
      },
      trials: Array.from({ length: 20 }, (_, i) => ({
        taskId: 'deal-desk',
        condition: i < 10 ? 'hint_on' : 'hint_off',
        ok: i < 10,
        elapsedMs: 1_000,
      })),
    };

    const classification = classifySweepArtifact(artifact);
    const report = analyzeHintArtifacts([artifact]);

    expect(classification.status).toEqual('invalid');
    expect(classification.reason).toEqual('suspicious_fast');
    expect(report.artifacts.invalid.length).toEqual(1);
    expect(report.headline.verdict).toEqual('underpowered');
  });

  it('computes Fisher exact significance for large hard-task lift', () => {
    const pValue = fisherExactTwoSided({ onPasses: 9, onTrials: 10, offPasses: 2, offTrials: 10 });
    expect(pValue < 0.05).toEqual(true);
  });

  it('summarizes trial rows when an artifact has no summary object', () => {
    const summary = summarizeTaskBuckets([
      { taskId: 'deal-desk', condition: 'hint_on', ok: true, elapsedMs: 100 },
      { taskId: 'deal-desk', condition: 'hint_on', ok: false, elapsedMs: 200 },
      { taskId: 'deal-desk', condition: 'hint_off', ok: false, elapsedMs: 300 },
    ]);

    expect(summary['deal-desk'].hint_on.trials).toEqual(2);
    expect(summary['deal-desk'].hint_on.passes).toEqual(1);
    expect(summary['deal-desk'].hint_off.trials).toEqual(1);
    expect(summary['deal-desk'].lift).toEqual(0.5);
  });
});

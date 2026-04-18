import { describe, it, expect } from '../../lib/testUtils.js';
import { aggregateTrials, runReplicatedEval } from '../eval-replicated.js';

describe('aggregateTrials', () => {
  it('marks a scenario SOLID when all trials passed', () => {
    const trials = [
      [{ scenarioName: 'compile', graded: true }, { scenarioName: 'run_app', graded: true }],
      [{ scenarioName: 'compile', graded: true }, { scenarioName: 'run_app', graded: true }],
      [{ scenarioName: 'compile', graded: true }, { scenarioName: 'run_app', graded: true }],
    ];
    const summary = aggregateTrials(trials);
    const compile = summary.perScenario.find(s => s.name === 'compile');
    expect(compile.verdict).toEqual('SOLID');
    expect(compile.passRate).toEqual(1);
  });

  it('marks a scenario FLAKY when some trials fail', () => {
    const trials = [
      [{ scenarioName: 'compile', graded: true }],
      [{ scenarioName: 'compile', graded: false }],
      [{ scenarioName: 'compile', graded: true }],
    ];
    const summary = aggregateTrials(trials);
    const compile = summary.perScenario.find(s => s.name === 'compile');
    expect(compile.verdict).toEqual('FLAKY');
    expect(compile.passed).toEqual(2);
    expect(compile.total).toEqual(3);
  });

  it('marks a scenario BROKEN when no trials passed', () => {
    const trials = [
      [{ scenarioName: 'compile', graded: false }],
      [{ scenarioName: 'compile', graded: false }],
      [{ scenarioName: 'compile', graded: false }],
    ];
    const summary = aggregateTrials(trials);
    const compile = summary.perScenario.find(s => s.name === 'compile');
    expect(compile.verdict).toEqual('BROKEN');
    expect(compile.passRate).toEqual(0);
  });

  it('computes overall pass rate correctly', () => {
    const trials = [
      [{ scenarioName: 'compile', graded: true }, { scenarioName: 'run_app', graded: true }],
      [{ scenarioName: 'compile', graded: false }, { scenarioName: 'run_app', graded: true }],
    ];
    const summary = aggregateTrials(trials);
    // 3 of 4 total runs passed
    expect(summary.overallPassRate).toEqual(0.75);
  });

  it('counts solid/flaky/broken across 16 scenarios', () => {
    const trials = [
      [{ scenarioName: 'compile', graded: true }, { scenarioName: 'run_app', graded: true }, { scenarioName: 'stop_app', graded: false }],
      [{ scenarioName: 'compile', graded: true }, { scenarioName: 'run_app', graded: false }, { scenarioName: 'stop_app', graded: false }],
      [{ scenarioName: 'compile', graded: true }, { scenarioName: 'run_app', graded: true }, { scenarioName: 'stop_app', graded: false }],
    ];
    const summary = aggregateTrials(trials);
    // We only asserted 3 scenarios here but aggregateTrials enumerates all 16 — the
    // other 13 will show as BROKEN because they got 0 passes. That's fine for this test.
    const compile = summary.perScenario.find(s => s.name === 'compile');
    const runApp = summary.perScenario.find(s => s.name === 'run_app');
    const stopApp = summary.perScenario.find(s => s.name === 'stop_app');
    expect(compile.verdict).toEqual('SOLID');
    expect(runApp.verdict).toEqual('FLAKY');
    expect(stopApp.verdict).toEqual('BROKEN');
  });
});

describe('runReplicatedEval dry-run', () => {
  it('returns without spawning workers', async () => {
    const result = await runReplicatedEval({ trials: 3, dryRun: true });
    expect(result.dryRun).toEqual(true);
    expect(result.trialsRun).toEqual(0);
  });
});

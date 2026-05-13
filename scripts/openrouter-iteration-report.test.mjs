import { describe, expect, it, run } from '../lib/testUtils.js';
import { analyzeRuns, renderHtml, summarizeRuns } from './openrouter-iteration-report.mjs';

const payload = {
  tasks: [
    {
      id: 'twitter_scheduler',
      family: 'external_api_scheduler',
      title: 'Scheduled Twitter post publisher',
      userAsk: 'Build a scheduled Twitter posting app with retries.',
    },
  ],
  runs: [
    {
      model: 'Gemini 3 Flash Preview',
      modelId: 'google/gemini-3-flash-preview',
      taskId: 'twitter_scheduler',
      taskTitle: 'Scheduled Twitter post publisher',
      mode: 'pattern_hints',
      modeLabel: 'Error + pattern hints',
      success: true,
      successAttempt: 2,
      totalCost: 0.01,
      totalLatencyMs: 12000,
      attempts: [
        { attempt: 1, content: 'REQUIREMENTS:\n- schedule tweets\n\nCLEAR_SOURCE:\nbroken', evaluation: { checks: [1, 2, 3], failedCount: 2, compileErrorCount: 1, compileErrors: [{ message: 'Line 1: fake syntax error' }] } },
        { attempt: 2, content: 'REQUIREMENTS:\n- schedule tweets\n\nCLEAR_SOURCE:\nworking', evaluation: { checks: [1, 2, 3], failedCount: 0, compileErrorCount: 0, compileErrors: [] } },
      ],
      finalFailedChecks: [],
    },
    {
      model: 'GPT-5.5',
      modelId: 'openai/gpt-5.5',
      taskId: 'twitter_scheduler',
      taskTitle: 'Scheduled Twitter post publisher',
      mode: 'minimal',
      modeLabel: 'Minimal feedback',
      success: false,
      successAttempt: null,
      totalCost: 0.12,
      totalLatencyMs: 30000,
      attempts: [
        { attempt: 1, content: 'REQUIREMENTS:\n- schedule tweets\n\nCLEAR_SOURCE:\nbroken', evaluation: { checks: [1, 2, 3], failedCount: 2, compileErrorCount: 1, compileErrors: [{ message: 'Line 1: missing endpoint' }] } },
        { attempt: 2, content: 'REQUIREMENTS:\n- schedule tweets\n\nCLEAR_SOURCE:\nstill broken', evaluation: { checks: [1, 2, 3], failedCount: 1, compileErrorCount: 0, compileErrors: [] } },
        { attempt: 3, content: 'REQUIREMENTS:\n- schedule tweets\n\nCLEAR_SOURCE:\nstill broken', evaluation: { checks: [1, 2, 3], failedCount: 1, compileErrorCount: 0, compileErrors: [] } },
      ],
      finalFailedChecks: [{ id: 'cron_api_call' }],
    },
  ],
};

describe('OpenRouter iteration report', () => {
  it('summarizes pass rate, attempts, spend, and failures', () => {
    const summary = summarizeRuns(payload);

    expect(summary.totals.runs).toBe(2);
    expect(summary.totals.successes).toBe(1);
    expect(summary.totals.totalSpend).toBe(0.13);
    expect(summary.byModel[0].label).toBe('Gemini 3 Flash Preview');
    expect(summary.failures[0].failedChecks).toEqual(['cron_api_call']);
  });

  it('renders a visual HTML report without emoji-only decoration', () => {
    const summary = summarizeRuns(payload);
    const analysis = analyzeRuns(payload, summary);
    const html = renderHtml({
      payload,
      summary,
      analysis,
      toolCalls: { total: 1, byTool: [{ tool_name: 'compile_clear', count: 1 }] },
    });

    expect(html).toContain('Iteration Benchmark');
    expect(html).toContain('Price vs Completion Frontier');
    expect(html).toContain('What Ralph Changed');
    expect(html).toContain('Gemini 3 Flash Preview');
    expect(html).toContain('compile_clear');
    expect(html).toContain('Scheduled Twitter post publisher');
  });

  it('analyzes chat attempts, Ralph movement, and frontier points from code', () => {
    const summary = summarizeRuns(payload);
    const analysis = analyzeRuns(payload, summary);

    expect(analysis.frontier.points.length).toBe(2);
    expect(analysis.frontier.points[0].label).toBe('Gemini 3 Flash Preview');
    expect(analysis.ralph.matchedPairs).toBe(0);
    expect(analysis.chat.totalResponses).toBe(5);
    expect(analysis.failures.topFailedChecks[0].id).toBe('cron_api_call');
    expect(analysis.compiler.topCategories.length).toBeGreaterThan(0);
    expect(analysis.taskDifficulty.length).toBe(1);
    expect(analysis.taskDifficulty[0].label).toBe('Scheduled Twitter post publisher');
  });
});

run();

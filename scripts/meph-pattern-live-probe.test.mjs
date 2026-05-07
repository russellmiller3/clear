import { describe, it, expect, run } from '../lib/testUtils.js';
import { buildChatBody, buildProbeServerEnv, isExpensiveProbeModel, isProviderQuotaError, probeSuites, resolveProbeModel, summarizeRows, scoreGeneratedApp, selectProbes, scoreProbe } from './meph-pattern-live-probe.mjs';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('meph pattern live probe harness', () => {
  it('defaults to a cheap OpenRouter model and blocks accidental Sonnet spend', () => {
    expect(resolveProbeModel({})).toEqual('deepseek/deepseek-v4-flash');
    expect(isExpensiveProbeModel('~anthropic/claude-sonnet-latest')).toEqual(true);
    expect(isExpensiveProbeModel('deepseek/deepseek-v4-flash')).toEqual(false);
  });

  it('forces the Ghost OpenRouter server to use the requested probe model', () => {
    const env = buildProbeServerEnv({
      processEnv: { ANTHROPIC_API_KEY: 'sk-ant-test' },
      envFromFile: { OPENROUTER_API_KEY: 'sk-or-file-test' },
      openRouterKey: 'sk-or-run-test',
      model: 'deepseek/deepseek-v4-flash',
      port: 3999,
    });

    expect(env.MEPH_BRAIN).toEqual('openrouter');
    expect(env.OPENROUTER_MODEL).toEqual('deepseek/deepseek-v4-flash');
    expect(env.MEPH_MODEL).toEqual('deepseek/deepseek-v4-flash');
    expect(env.OPENROUTER_API_KEY).toEqual('sk-or-run-test');
    expect(env.PORT).toEqual(3999);
  });

  it('keeps a narrow Marcus-style approval suite for realistic pattern retrieval', () => {
    const narrow = probeSuites.narrowApprovalQueue;

    expect(narrow.length).toBeGreaterThan(5);
    expect(narrow.map(probe => probe.id)).toContain('threshold-routing-change');
    expect(narrow.map(probe => probe.id)).toContain('only-my-pending-items');
    expect(narrow.map(probe => probe.id)).toContain('stale-approval-submit');

    for (const probe of narrow) {
      expect(probe.prompt).toContain('approval');
      expect(probe.prompt).not.toContain('smallest relevant snippet shape');
      expect(probe.expectKinds.length).toBeGreaterThan(0);
      expect(probe.expectTerms.length).toBeGreaterThan(0);
    }
  });

  it('keeps a full-app approval suite for the hook A/B outcome test', () => {
    const fullApps = probeSuites.approvalQueueFullApps;

    expect(fullApps.length).toEqual(7);
    for (const probe of fullApps) {
      expect(probe.prompt).toContain('Build a complete Clear app');
      expect(probe.prompt).not.toContain('pattern DB');
      expect(probe.requiredSourceTerms.length).toBeGreaterThan(2);
    }
  });

  it('can select a suite and then narrow it by probe id', () => {
    const selected = selectProbes({
      suiteName: 'narrowApprovalQueue',
      only: 'threshold-routing-change,stale-approval-submit',
    });

    expect(selected.map(probe => probe.id)).toEqual([
      'threshold-routing-change',
      'stale-approval-submit',
    ]);
  });

  it('scores a probe only when Meph searched and answered with expected primitive evidence', () => {
    const probe = {
      expectKinds: ['concurrency'],
      expectTerms: ['optimistic lock'],
    };

    const noSearch = scoreProbe(probe, {
      toolNames: [],
      text: 'Use a concurrency pattern with optimistic lock.',
    });
    const searched = scoreProbe(probe, {
      toolNames: ['browse_templates'],
      text: 'Use a concurrency pattern with optimistic lock.',
    });
    const preflightSearched = scoreProbe(probe, {
      toolNames: [],
      preflight: { required: true, pattern_count: 2 },
      text: 'Use a concurrency pattern with optimistic lock.',
    });

    expect(noSearch.pass).toEqual(false);
    expect(searched.pass).toEqual(true);
    expect(preflightSearched.pass).toEqual(true);
    expect(preflightSearched.usedSearch).toEqual(true);
  });

  it('builds chat bodies that can isolate hook-on/off A/B trials from prompt prose', () => {
    const off = buildChatBody('Build an approval queue', {
      patternPreflight: 'docs',
      disablePatternSearchPromptGuard: true,
      disablePatternSearchTool: true,
    });
    const on = buildChatBody('Build an approval queue', {
      patternPreflight: 'full',
      disablePatternSearchPromptGuard: true,
      disablePatternSearchTool: false,
    });

    expect(off.patternPreflight).toEqual('docs');
    expect(on.patternPreflight).toEqual('full');
    expect(off.disablePatternSearchPromptGuard).toEqual(true);
    expect(on.disablePatternSearchPromptGuard).toEqual(true);
    expect(off.disablePatternSearchTool).toEqual(true);
    expect(on.disablePatternSearchTool).toEqual(false);
    expect(off.messages[0].content).toContain('Call edit_code with the complete .clear source');
    expect(off.messages[0].content).not.toContain('pattern DB');
  });

  it('scores full-app builds with compile success and required source behavior', () => {
    const probe = {
      requiredSourceTerms: ['page "Approval Queue"', 'approve', 'reject'],
      optionalSourceTerms: ['with optimistic lock'],
    };

    const failed = scoreGeneratedApp(probe, {
      source: 'page "Approval Queue"\nbutton "Approve"',
      toolNames: ['edit_code'],
      compile: { errors: [] },
    });
    const passed = scoreGeneratedApp(probe, {
      source: 'page "Approval Queue"\nbutton "Approve"\nbutton "Reject"\nwith optimistic lock',
      toolNames: ['edit_code'],
      compile: { errors: [] },
    });

    expect(failed.pass).toEqual(false);
    expect(passed.pass).toEqual(true);
    expect(passed.compiles).toEqual(true);
    expect(passed.usedEditor).toEqual(true);
  });

  it('does not count provider quota blocks as failed app trials', () => {
    expect(isProviderQuotaError('openrouter HTTP 403: Key limit exceeded')).toEqual(true);
    expect(isProviderQuotaError('syntax compile failed')).toEqual(false);

    const rows = [
      { probe: { id: 'a', requiredSourceTerms: ['approval'] }, variant: 'docs_only', score: { pass: true }, result: {} },
      { probe: { id: 'a', requiredSourceTerms: ['approval'] }, variant: 'full_hook', score: { pass: false }, result: { blocked: true, error: 'Key limit exceeded' } },
    ];
    const summary = summarizeRows(rows, { abMode: true });

    expect(summary.completedRows.length).toEqual(1);
    expect(summary.blockedRows.length).toEqual(1);
    expect(summary.passed).toEqual(1);
    expect(summary.ab.full_hook.total).toEqual(0);
    expect(summary.aborted).toEqual(true);
  });

  it('keeps Meph instructed to search before answering narrow Clear shape questions', () => {
    const prompt = readFileSync(join(process.cwd(), 'studio', 'system-prompt.md'), 'utf8');

    expect(prompt).toContain('MUST call `browse_templates` with `action: "search"` before answering');
    expect(prompt).toContain('threshold routing');
    expect(prompt).toContain('selected-row detail');
    expect(prompt).toContain('approval manager gate');
  });
});

run();

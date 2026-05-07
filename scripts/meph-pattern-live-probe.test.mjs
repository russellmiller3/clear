import { describe, it, expect, run } from '../lib/testUtils.js';
import { probeSuites, selectProbes, scoreProbe } from './meph-pattern-live-probe.mjs';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('meph pattern live probe harness', () => {
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

    expect(noSearch.pass).toEqual(false);
    expect(searched.pass).toEqual(true);
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

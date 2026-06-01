import { describe, it, expect, run } from '../lib/testUtils.js';
import {
  RALPH_DEFAULTS,
  formatRalphMessage,
  readRalphConfig,
  shouldRalphRetry,
} from './ralph-layer.js';

describe('ralph-layer.shouldRalphRetry', () => {
  it('retries when approved requirements are missing', () => {
    const decision = shouldRalphRetry({
      audit: {
        ok: false,
        items: [{ text: 'deals route to VP approval', status: 'missing', reason: 'No VP route found.' }],
      },
      retryCount: 0,
      maxRetries: 2,
    });

    expect(decision.retry).toBe(true);
    expect(decision.blocked).toBe(false);
  });

  it('does not retry when the audit passed', () => {
    const decision = shouldRalphRetry({
      audit: { ok: true, items: [{ status: 'passed' }] },
      retryCount: 0,
      maxRetries: 2,
    });

    expect(decision.retry).toBe(false);
    expect(decision.blocked).toBe(false);
  });

  it('stops after retry cap', () => {
    const decision = shouldRalphRetry({
      audit: { ok: false, items: [{ status: 'missing' }] },
      retryCount: 2,
      maxRetries: 2,
    });

    expect(decision.retry).toBe(false);
    expect(decision.blocked).toBe(true);
  });

  it('can treat unverified requirements as non-blocking when configured', () => {
    const decision = shouldRalphRetry({
      audit: { ok: false, items: [{ status: 'unverified' }] },
      retryCount: 0,
      maxRetries: 2,
      blockOnUnverified: false,
    });

    expect(decision.retry).toBe(false);
    expect(decision.blocked).toBe(false);
  });

  it('respects the kill switch', () => {
    const decision = shouldRalphRetry({
      audit: { ok: false, items: [{ status: 'missing' }] },
      retryCount: 0,
      maxRetries: 2,
      layerOff: true,
    });

    expect(decision.retry).toBe(false);
    expect(decision.blocked).toBe(false);
  });
});

describe('ralph-layer.formatRalphMessage', () => {
  it('formats concrete gap feedback', () => {
    const message = formatRalphMessage({
      audit: {
        items: [{
          text: 'approval actions use optimistic lock protection',
          status: 'unverified',
          reason: 'No stale-update evidence.',
        }],
      },
      retryIndex: 1,
      maxRetries: 2,
    });

    expect(message).toContain('You are not done yet');
    expect(message).toContain('optimistic lock protection');
    expect(message).toContain('No stale-update evidence');
    expect(message).toContain('ralph-retry 1/2');
  });

  it('limits the listed gaps so the retry message stays readable', () => {
    const items = Array.from({ length: 8 }, (_, index) => ({
      text: `requirement ${index + 1}`,
      status: 'missing',
      reason: `gap ${index + 1}`,
    }));
    const message = formatRalphMessage({ audit: { items }, retryIndex: 1, maxRetries: 2 });

    expect(message).toContain('requirement 1');
    expect(message).toContain('requirement 5');
    expect(message).not.toContain('requirement 6');
    expect(message).toContain('3 more');
  });

  it('leads with the violation vector and ranks hard families above soft ones', () => {
    const message = formatRalphMessage({
      audit: {
        items: [
          { text: 'pretty dashboard', status: 'missing', reason: 'No dashboard.', family: 'ui' },
          { text: 'discounts over 30% need CRO approval', status: 'missing', reason: 'No approval route.', family: 'approval' },
        ],
      },
      retryIndex: 1,
      maxRetries: 2,
    });

    expect(message).toContain('Violation vector');
    expect(message).toContain('approval=2');
    // The hard family (approval) must appear in the ranked list before the soft family (ui).
    const approvalPosition = message.indexOf('CRO approval');
    const dashboardPosition = message.indexOf('pretty dashboard');
    expect(approvalPosition < dashboardPosition).toBe(true);
  });

  it('falls back to the flat, unranked message under CLEAR_MILLER_RANK_DISABLE=1 (A/B control arm)', () => {
    const previous = process.env.CLEAR_MILLER_RANK_DISABLE;
    process.env.CLEAR_MILLER_RANK_DISABLE = '1';
    try {
      const message = formatRalphMessage({
        audit: {
          items: [
            { text: 'pretty dashboard', status: 'missing', reason: 'No dashboard.', family: 'ui' },
            { text: 'discounts over 30% need CRO approval', status: 'missing', reason: 'No approval route.', family: 'approval' },
          ],
        },
        retryIndex: 1,
        maxRetries: 2,
      });

      // Control arm = the pre-Miller message: no vector line, original gap order (no worst-first re-rank).
      expect(message.includes('Violation vector')).toBe(false);
      expect(message.includes('You are not done yet')).toBe(true);
      expect(message.indexOf('pretty dashboard') < message.indexOf('CRO approval')).toBe(true);
    } finally {
      if (previous === undefined) delete process.env.CLEAR_MILLER_RANK_DISABLE;
      else process.env.CLEAR_MILLER_RANK_DISABLE = previous;
    }
  });
});

describe('ralph-layer.readRalphConfig', () => {
  it('defaults to enabled, two retries, and blocking unverified requirements', () => {
    const config = readRalphConfig({});

    expect(config.layerOff).toBe(false);
    expect(config.maxRetries).toBe(2);
    expect(config.blockOnUnverified).toBe(true);
  });

  it('reads env overrides', () => {
    const config = readRalphConfig({
      [RALPH_DEFAULTS.ENABLED_ENV]: '0',
      [RALPH_DEFAULTS.MAX_RETRIES_ENV]: '4',
      [RALPH_DEFAULTS.BLOCK_UNVERIFIED_ENV]: '0',
    });

    expect(config.layerOff).toBe(true);
    expect(config.maxRetries).toBe(4);
    expect(config.blockOnUnverified).toBe(false);
  });
});

run();

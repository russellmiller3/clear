/*
Snap Layer — unit tests for the auto-retry decision + retry-message formatting.

Snap layer wedges into /api/chat: when Meph "thinks he's done" but the source
still has compile errors, the layer asks Meph to fix them before responding to
the user. Up to N retries. The user only ever sees converged output.

These tests cover the two pure functions that drive the wedge:
- shouldSnapRetry: should we retry, given errors + retry count + env?
- formatSnapMessage: what synthetic user message to inject?
*/

import { describe, it, expect, run } from '../lib/testUtils.js';
import { shouldSnapRetry, formatSnapMessage, SNAP_DEFAULTS } from './snap-layer.js';

describe('snap-layer.shouldSnapRetry', () => {
  it('returns true when errors present, retries below cap, env enabled', () => {
    const decision = shouldSnapRetry({
      currentErrors: [{ line: 5, message: 'unexpected token' }],
      snapRetryCount: 0,
      maxRetries: 3,
      layerOff: false,
    });
    expect(decision).toBe(true);
  });

  it('returns false when no errors', () => {
    const decision = shouldSnapRetry({
      currentErrors: [],
      snapRetryCount: 0,
      maxRetries: 3,
      layerOff: false,
    });
    expect(decision).toBe(false);
  });

  it('returns false when retry count has hit the cap', () => {
    const decision = shouldSnapRetry({
      currentErrors: [{ line: 1, message: 'oops' }],
      snapRetryCount: 3,
      maxRetries: 3,
      layerOff: false,
    });
    expect(decision).toBe(false);
  });

  it('returns false when retry count exceeds the cap', () => {
    const decision = shouldSnapRetry({
      currentErrors: [{ line: 1, message: 'oops' }],
      snapRetryCount: 4,
      maxRetries: 3,
      layerOff: false,
    });
    expect(decision).toBe(false);
  });

  it('returns false when layerOff is true even with errors and retries left', () => {
    const decision = shouldSnapRetry({
      currentErrors: [{ line: 1, message: 'oops' }],
      snapRetryCount: 0,
      maxRetries: 3,
      layerOff: true,
    });
    expect(decision).toBe(false);
  });

  it('handles undefined errors as no errors', () => {
    const decision = shouldSnapRetry({
      currentErrors: undefined,
      snapRetryCount: 0,
      maxRetries: 3,
      layerOff: false,
    });
    expect(decision).toBe(false);
  });

  it('handles undefined errors-list properties gracefully', () => {
    const decision = shouldSnapRetry({
      currentErrors: null,
      snapRetryCount: 0,
      maxRetries: 3,
      layerOff: false,
    });
    expect(decision).toBe(false);
  });

  it('falls back to defaults when maxRetries is undefined', () => {
    const decision = shouldSnapRetry({
      currentErrors: [{ line: 1, message: 'oops' }],
      snapRetryCount: SNAP_DEFAULTS.MAX_RETRIES - 1,
      maxRetries: undefined,
      layerOff: false,
    });
    expect(decision).toBe(true);
  });

  it('respects custom maxRetries higher than default', () => {
    const decision = shouldSnapRetry({
      currentErrors: [{ line: 1, message: 'oops' }],
      snapRetryCount: 5,
      maxRetries: 10,
      layerOff: false,
    });
    expect(decision).toBe(true);
  });
});

describe('snap-layer.formatSnapMessage', () => {
  it('formats a single error with line + message', () => {
    const msg = formatSnapMessage({
      errors: [{ line: 5, message: 'unexpected token' }],
      retryIndex: 1,
      maxRetries: 3,
    });
    expect(msg).toContain('1 compile error');
    expect(msg).toContain('line 5');
    expect(msg).toContain('unexpected token');
    expect(msg).toContain('snap-retry 1/3');
    expect(msg.toLowerCase()).toContain('fix');
  });

  it('formats multiple errors with plural "errors"', () => {
    const msg = formatSnapMessage({
      errors: [
        { line: 3, message: 'a' },
        { line: 7, message: 'b' },
      ],
      retryIndex: 2,
      maxRetries: 3,
    });
    expect(msg).toContain('2 compile errors');
    expect(msg).toContain('line 3');
    expect(msg).toContain('line 7');
  });

  it('caps the listed errors at 5 (so the message stays small)', () => {
    const errors = Array.from({ length: 10 }, (_, i) => ({ line: i + 1, message: `err ${i}` }));
    const msg = formatSnapMessage({ errors, retryIndex: 1, maxRetries: 3 });
    expect(msg).toContain('10 compile errors');
    expect(msg).toContain('line 1');
    expect(msg).toContain('line 5');
    expect(msg).not.toContain('line 6');
    expect(msg).toContain('5 more');
  });

  it('handles errors without explicit line numbers', () => {
    const msg = formatSnapMessage({
      errors: [{ message: 'something exploded' }],
      retryIndex: 1,
      maxRetries: 3,
    });
    expect(msg).toContain('something exploded');
  });

  it('handles plain-string errors (legacy shape)', () => {
    const msg = formatSnapMessage({
      errors: ['a stringified error'],
      retryIndex: 1,
      maxRetries: 3,
    });
    expect(msg).toContain('a stringified error');
  });

  it('reads as a real user follow-up, not a system message', () => {
    const msg = formatSnapMessage({
      errors: [{ line: 1, message: 'x' }],
      retryIndex: 1,
      maxRetries: 3,
    });
    expect(msg.toLowerCase()).not.toContain('system');
    expect(msg.toLowerCase()).not.toContain('automatic');
  });
});

describe('snap-layer.SNAP_DEFAULTS', () => {
  it('exposes a default retry cap that is small but non-zero', () => {
    expect(SNAP_DEFAULTS.MAX_RETRIES).toBeGreaterThan(0);
    expect(SNAP_DEFAULTS.MAX_RETRIES).toBeLessThan(6);
  });

  it('exposes the env var name for the kill switch', () => {
    expect(SNAP_DEFAULTS.LAYER_OFF_ENV).toBe('SNAP_LAYER_OFF');
  });

  it('exposes the env var name for the retry cap override', () => {
    expect(SNAP_DEFAULTS.MAX_RETRIES_ENV).toBe('SNAP_MAX_RETRIES');
  });
});

run();

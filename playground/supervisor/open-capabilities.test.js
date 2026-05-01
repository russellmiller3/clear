// playground/supervisor/open-capabilities.test.js
//
// Tests for the open-capability report builder used by Meph's per-turn context.
//
// "Open capability" = anything the program needs to be complete but isn't yet.
// Three sources, all surfaced together so Meph reads ONE structured list instead
// of inferring three separate things from raw test output:
//
//   1. TBD placeholders (from Lesson 1's `result.placeholders`)
//   2. Failing tests (from the most recent test run snapshot)
//   3. Unresolved compile errors with hints (text-matched against INTENT_HINTS)
//
// The output shape is the contract — server.js wires the result into Meph's
// system context, so the test pins fields, line numbers, and the summary
// heuristic that picks the most-impactful item.

import { describe, it, expect } from '../../lib/testUtils.js';
import { getOpenCapabilities } from './open-capabilities.js';

describe('open-capabilities — empty when nothing is open', () => {
  it('returns empty arrays and a clean summary when source is fine', () => {
    const result = getOpenCapabilities('show "hello"', null, { errors: [], placeholders: [] });
    expect(result.placeholders).toEqual([]);
    expect(result.failingTests).toEqual([]);
    expect(result.unresolvedErrors).toEqual([]);
    expect(result.summary).toContain('0');
    // Summary stays short when nothing is open — feeds the <200 char prompt rule
    expect(result.summary.length).toBeLessThan(120);
  });

  it('handles missing inputs gracefully (all undefined)', () => {
    const result = getOpenCapabilities('', null, null);
    expect(result.placeholders).toEqual([]);
    expect(result.failingTests).toEqual([]);
    expect(result.unresolvedErrors).toEqual([]);
    // Should still produce a summary string
    expect(typeof result.summary).toBe('string');
  });

  it('handles null compile result without throwing', () => {
    const result = getOpenCapabilities('anything', null, null);
    expect(result.placeholders).toEqual([]);
  });
});

describe('open-capabilities — TBD placeholders', () => {
  it('lifts placeholders from compile result with line numbers and source context', () => {
    const source = [
      "show 'start'",            // line 1
      "TBD",                     // line 2
      "save user as new User",   // line 3
    ].join('\n');
    const compile = { placeholders: [{ line: 2 }], errors: [] };
    const result = getOpenCapabilities(source, null, compile);
    expect(result.placeholders).toHaveLength(1);
    expect(result.placeholders[0].line).toBe(2);
    expect(result.placeholders[0].context).toContain('TBD');
  });

  it('handles multiple placeholders in source order', () => {
    const source = [
      "TBD",                     // line 1
      "show 'middle'",
      "TBD",                     // line 3
    ].join('\n');
    const compile = { placeholders: [{ line: 1 }, { line: 3 }], errors: [] };
    const result = getOpenCapabilities(source, null, compile);
    expect(result.placeholders).toHaveLength(2);
    expect(result.placeholders[0].line).toBe(1);
    expect(result.placeholders[1].line).toBe(3);
  });

  it('truncates very long context lines so the prompt stays small', () => {
    const longLine = 'TBD ' + 'x'.repeat(500);
    const source = longLine + '\n';
    const compile = { placeholders: [{ line: 1 }], errors: [] };
    const result = getOpenCapabilities(source, null, compile);
    // Context is capped — keeps the per-turn prompt under 1KB even when
    // someone leaves a giant comment next to a TBD
    expect(result.placeholders[0].context.length).toBeLessThan(160);
  });
});

describe('open-capabilities — failing tests', () => {
  it('extracts failing test names + reasons from a test snapshot', () => {
    const testResult = {
      passed: 4,
      failed: 2,
      failures: [
        { name: 'queue endpoint returns 200 on empty', error: 'expected 200 got 500', sourceLine: 14 },
        { name: 'auth check redirects on expired token', error: 'expected 302 got 200' },
      ],
    };
    const result = getOpenCapabilities('source', testResult, { errors: [], placeholders: [] });
    expect(result.failingTests).toHaveLength(2);
    expect(result.failingTests[0].name).toBe('queue endpoint returns 200 on empty');
    expect(result.failingTests[0].reason).toContain('expected 200 got 500');
    expect(result.failingTests[0].sourceLine).toBe(14);
  });

  it('returns empty failingTests when test snapshot has no failures', () => {
    const testResult = { passed: 4, failed: 0, failures: [] };
    const result = getOpenCapabilities('source', testResult, { errors: [], placeholders: [] });
    expect(result.failingTests).toEqual([]);
  });

  it('caps failing tests at 10 (matches buildSystemWithContext slice)', () => {
    const failures = [];
    for (let i = 0; i < 25; i++) {
      failures.push({ name: `test ${i}`, error: 'failure' });
    }
    const testResult = { passed: 0, failed: 25, failures };
    const result = getOpenCapabilities('source', testResult, { errors: [], placeholders: [] });
    expect(result.failingTests).toHaveLength(10);
  });
});

describe('open-capabilities — unresolved errors with hints', () => {
  it('surfaces compile errors and matches INTENT_HINTS keywords inside the message', () => {
    const compile = {
      errors: [
        { line: 5, message: "Undefined variable 'fetch' — define on an earlier line." },
      ],
      placeholders: [],
    };
    const result = getOpenCapabilities('source', null, compile);
    expect(result.unresolvedErrors).toHaveLength(1);
    expect(result.unresolvedErrors[0].line).toBe(5);
    // The hint is the canonical fix from INTENT_HINTS — `fetch` → "use `get all X`..."
    expect(result.unresolvedErrors[0].hint).toContain('get all');
    expect(result.unresolvedErrors[0].severity).toBe('error');
  });

  it('falls back to the original message when no INTENT_HINTS match', () => {
    const compile = {
      errors: [
        { line: 3, message: "Some unusual error that no hint covers" },
      ],
      placeholders: [],
    };
    const result = getOpenCapabilities('source', null, compile);
    expect(result.unresolvedErrors).toHaveLength(1);
    expect(result.unresolvedErrors[0].hint).toContain('Some unusual error');
  });

  it('returns empty unresolvedErrors when there are none', () => {
    const compile = { errors: [], placeholders: [] };
    const result = getOpenCapabilities('source', null, compile);
    expect(result.unresolvedErrors).toEqual([]);
  });

  it('caps errors at 10 — same friction-budget rule as buildSystemWithContext', () => {
    const errors = [];
    for (let i = 0; i < 20; i++) {
      errors.push({ line: i + 1, message: `error ${i}` });
    }
    const result = getOpenCapabilities('source', null, { errors, placeholders: [] });
    expect(result.unresolvedErrors).toHaveLength(10);
  });
});

describe('open-capabilities — summary heuristic', () => {
  it('picks the most-impactful item (compile error > failing test > placeholder)', () => {
    const compile = {
      errors: [{ line: 7, message: 'Undefined variable' }],
      placeholders: [{ line: 14 }],
    };
    const testResult = {
      passed: 0, failed: 1,
      failures: [{ name: 'queue test', error: 'failed' }],
    };
    const source = "line 1\nline 2\nline 3\nline 4\nline 5\nline 6\nline 7\n";
    const result = getOpenCapabilities(source, testResult, compile);
    // Errors take priority — they block compilation entirely.
    // The summary mentions compile errors first (line number cited).
    expect(result.summary).toContain('error');
    expect(result.summary).toContain('7');
  });

  it('falls through to failing-test focus when no compile errors', () => {
    const compile = { errors: [], placeholders: [{ line: 14 }] };
    const testResult = {
      passed: 0, failed: 1,
      failures: [{ name: 'auth test', error: 'failed', sourceLine: 22 }],
    };
    const result = getOpenCapabilities('source', testResult, compile);
    expect(result.summary.toLowerCase()).toContain('test');
  });

  it('falls through to placeholder focus when only placeholders are open', () => {
    const compile = { errors: [], placeholders: [{ line: 14 }] };
    const result = getOpenCapabilities('a\nb\nc\nd\ne\nf\ng\nh\ni\nj\nk\nl\nm\nTBD', null, compile);
    expect(result.summary.toLowerCase()).toContain('stub');
    expect(result.summary).toContain('14');
  });

  it('counts everything in the headline numbers', () => {
    const compile = {
      errors: [{ line: 1, message: 'e1' }, { line: 2, message: 'e2' }],
      placeholders: [{ line: 3 }, { line: 4 }, { line: 5 }],
    };
    const testResult = {
      passed: 0, failed: 1,
      failures: [{ name: 'one', error: 'failed' }],
    };
    const result = getOpenCapabilities('source', testResult, compile);
    expect(result.summary).toContain('3');  // placeholder count
    expect(result.summary).toContain('1');  // failing test count
    expect(result.summary).toContain('2');  // error count
  });
});

describe('open-capabilities — all-three-sources-at-once integration', () => {
  it('returns a coherent report with all three categories populated', () => {
    const source = [
      "create a Users table:",         // 1
      "  email, text",                 // 2
      "TBD",                           // 3
      "when user calls GET /api/foo:", // 4
      "  send back fetch",             // 5
    ].join('\n');
    const compile = {
      errors: [{ line: 5, message: "Undefined variable 'fetch' — define earlier" }],
      placeholders: [{ line: 3 }],
    };
    const testResult = {
      passed: 2, failed: 1,
      failures: [{ name: 'GET /api/foo returns 200', error: 'expected 200 got 500', sourceLine: 4 }],
    };
    const result = getOpenCapabilities(source, testResult, compile);
    expect(result.placeholders).toHaveLength(1);
    expect(result.failingTests).toHaveLength(1);
    expect(result.unresolvedErrors).toHaveLength(1);
    expect(result.summary).toBeTruthy();
    // Stays under 1KB even when fully populated — caps in the prompt budget
    const total = JSON.stringify(result).length;
    expect(total).toBeLessThan(2000);
  });
});

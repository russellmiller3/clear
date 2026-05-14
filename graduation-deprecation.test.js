// =============================================================================
// CLEAR LANGUAGE — graduation-deprecation test
// =============================================================================
//
// `ask user to confirm 'X' with graduation after N runs` packages an
// implicit runtime state machine (counter table + scope key + counter
// check + audit row) into one keyword. PHILOSOPHY §1:1 says "no super
// commands that silently generate 50 lines of boilerplate." Graduation
// is exactly that.
//
// Cleanup path (added 2026-05-14):
//   1. The sugar still compiles (back-compat, existing apps don't break)
//   2. Every use emits a GRADUATION_DEPRECATED warning pointing at the
//      canonical visible-conditional form
//   3. Future cleanup pass replaces existing call sites and removes the
//      sugar entirely
//
// This test pins step 2 (the warning).
// =============================================================================

import { describe, it, expect } from './lib/testUtils.js';
import { compileProgram } from './index.js';

describe('graduation deprecation warning (2026-05-14)', () => {
  it('emits GRADUATION_DEPRECATED warning when `with graduation after N runs` is used', () => {
    const source = [
      "when user calls POST /api/open-notepad:",
      "  ask user to confirm 'Open Notepad?' with graduation after 3 runs",
      "  send back 'opened'",
    ].join('\n');
    const result = compileProgram(source);
    // The sugar still compiles cleanly (no errors)
    expect(result.errors).toEqual([]);
    // But emits a deprecation warning
    expect(Array.isArray(result.warnings)).toBe(true);
    const gradWarnings = (result.warnings || []).filter(w => w.code === 'GRADUATION_DEPRECATED');
    expect(gradWarnings.length).toBeGreaterThan(0);
    expect(gradWarnings[0].message).toMatch(/canonical replacement is a visible conditional/);
    expect(gradWarnings[0].message).toMatch(/PHILOSOPHY/);
  });

  it('does NOT emit the warning when `ask user to confirm` is used without graduation', () => {
    const source = [
      "when user calls POST /api/open-notepad:",
      "  ask user to confirm 'Open Notepad?'",
      "  send back 'opened'",
    ].join('\n');
    const result = compileProgram(source);
    expect(result.errors).toEqual([]);
    const gradWarnings = (result.warnings || []).filter(w => w.code === 'GRADUATION_DEPRECATED');
    expect(gradWarnings.length).toBe(0);
  });

  it('dedupes per source line — one warning per confirm site', () => {
    // Same line, same warning code, fired once.
    const source = [
      "when user calls POST /api/x:",
      "  ask user to confirm 'X?' with graduation after 3 runs",
      "  send back 'ok'",
    ].join('\n');
    const result = compileProgram(source);
    const gradWarnings = (result.warnings || []).filter(w => w.code === 'GRADUATION_DEPRECATED');
    expect(gradWarnings.length).toBe(1);
  });
});

#!/usr/bin/env node

import { describe, it, expect, run } from '../lib/testUtils.js';
import {
  findMojibake,
  isTrackedTextFile,
  normalizeForAsciiDisplay,
} from './mojibake-hygiene.mjs';

describe('mojibake hygiene', () => {
  it('flags common UTF-8 decoded-as-Windows-1252 corruption', () => {
    const corrupted = [
      'Good ' + '\u00e2\u20ac\u201d' + ' bad',
      'Flow ' + '\u00e2\u2020\u2019' + ' next',
      'Count ' + '\u00c3\u2014' + ' target',
    ].join('\n');

    const findings = findMojibake(corrupted, 'docs/test.md');

    expect(findings).toHaveLength(3);
    expect(findings[0].file).toEqual('docs/test.md');
    expect(findings[0].line).toEqual(1);
  });

  it('does not flag valid UTF-8 punctuation', () => {
    const valid = 'Valid ' + String.fromCodePoint(0x2014) +
      ' arrow ' + String.fromCodePoint(0x2192);

    expect(findMojibake(valid, 'valid.md')).toHaveLength(0);
  });

  it('normalizes Unicode-heavy logs to ASCII for Windows shell display', () => {
    const raw = [
      'A' + String.fromCodePoint(0x2014) + 'B',
      'left ' + String.fromCodePoint(0x2192) + ' right',
      String.fromCodePoint(0x250c) + String.fromCodePoint(0x2500) + String.fromCodePoint(0x2510),
    ].join('\n');

    const safe = normalizeForAsciiDisplay(raw);

    expect(safe).toContain('A-B');
    expect(safe).toContain('left -> right');
    expect(safe).not.toMatch(/[^\x09\x0a\x0d\x20-\x7e]/);
  });

  it('scans extensionless repo text files like .gitignore', () => {
    expect(isTrackedTextFile('.gitignore')).toBe(true);
    expect(isTrackedTextFile('.husky/pre-push')).toBe(true);
    expect(isTrackedTextFile('studio/factor-db.sqlite')).toBe(false);
  });
});

run();

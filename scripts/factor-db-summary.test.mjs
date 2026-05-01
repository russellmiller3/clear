import { describe, it, expect } from '../lib/testUtils.js';
import { hintHelpfulSql, isHelpfulHintValue } from './factor-db-summary-helpers.mjs';

describe('factor-db-summary hint telemetry', () => {
  it('treats text hint labels as helpful telemetry', () => {
    expect(isHelpfulHintValue('yes')).toBe(true);
    expect(isHelpfulHintValue('partial')).toBe(true);
    expect(isHelpfulHintValue('inferred')).toBe(true);
  });

  it('does not treat skipped or missing hints as helpful', () => {
    expect(isHelpfulHintValue('no')).toBe(false);
    expect(isHelpfulHintValue(null)).toBe(false);
    expect(isHelpfulHintValue('')).toBe(false);
  });

  it('builds SQL for text hint labels, not numeric 1', () => {
    const sql = hintHelpfulSql();
    expect(sql).toContain("'yes'");
    expect(sql).toContain("'partial'");
    expect(sql).toContain("'inferred'");
    expect(sql).not.toContain('= 1');
  });
});

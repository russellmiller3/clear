// Tests for scripts/score-winning-runs.mjs — the winner-harvest scorer.
//
// Pure-function tests: countLines, firstFeature, computeScore, rankRows.
// We don't touch the live Factor DB here — that's covered by manually running
// the CLI against playground/factor-db.sqlite. These tests exercise the
// scoring math on synthetic rows so a future tweak to the weights can't
// silently break the ranking shape.

import { describe, it, expect } from '../lib/testUtils.js';
import {
  countLines,
  firstFeature,
  computeScore,
  rankRows,
  renderSnapshot,
} from './score-winning-runs.mjs';

describe('score-winning-runs — countLines', () => {
  it('counts non-empty lines', () => {
    expect(countLines('a\nb\nc')).toBe(3);
  });
  it('skips blank lines and trailing newline', () => {
    expect(countLines('a\n\nb\n')).toBe(2);
  });
  it('returns 0 for empty / null', () => {
    expect(countLines('')).toBe(0);
    expect(countLines(null)).toBe(0);
    expect(countLines(undefined)).toBe(0);
  });
});

describe('score-winning-runs — firstFeature', () => {
  it('finds a table directive past the build line and comments', () => {
    const src = `# Build directive
build for javascript backend

# Set up storage
create a Users table:
  name, required
`;
    expect(firstFeature(src)).toBe('create a users table:'.toLowerCase());
  });

  it('finds an endpoint directive past comments', () => {
    const src = `build for javascript backend
# Header
calls GET /api/hello:
  send back { message: 'hi' }
`;
    expect(firstFeature(src)).toBe('calls get /api/hello:');
  });

  it('finds an agent directive', () => {
    const src = `build for javascript backend
create an agent named helper:
  knows about: 'support'
`;
    expect(firstFeature(src)).toBe('create an agent named helper:');
  });

  it('returns empty string for empty source', () => {
    expect(firstFeature('')).toBe('');
    expect(firstFeature(null)).toBe('');
  });

  it('falls back to first non-comment line if no recognized directive', () => {
    const src = `# header
do something unusual
`;
    expect(firstFeature(src)).toBe('do something unusual');
  });
});

describe('score-winning-runs — computeScore', () => {
  it('rewards compactness — more milestones per line scores higher', () => {
    const tight = computeScore({ lines: 10, milestones: 3, attempts: 0, unique: false });
    const loose = computeScore({ lines: 30, milestones: 3, attempts: 0, unique: false });
    expect(tight.score > loose.score).toBe(true);
  });

  it('rewards first-try cleanness — fewer prior failures scores higher', () => {
    const clean = computeScore({ lines: 20, milestones: 1, attempts: 0, unique: false });
    const noisy = computeScore({ lines: 20, milestones: 1, attempts: 5, unique: false });
    expect(clean.score > noisy.score).toBe(true);
  });

  it('grants exactly +0.5 uniqueness bonus when unique=true', () => {
    const base = computeScore({ lines: 20, milestones: 1, attempts: 0, unique: false });
    const bumped = computeScore({ lines: 20, milestones: 1, attempts: 0, unique: true });
    expect(Math.abs((bumped.score - base.score) - 0.5) < 1e-9).toBe(true);
    expect(bumped.bonus).toBe(0.5);
  });

  it('clamps lines and milestones to 1 to avoid division-by-zero', () => {
    const r = computeScore({ lines: 0, milestones: 0, attempts: 0, unique: false });
    // milestones=1, lines=1 → compactness=1; cleanness=1; total=2 (no bonus).
    expect(r.compactness).toBe(1);
    expect(r.cleanness).toBe(1);
    expect(r.score).toBe(2);
  });

  it('handles negative attempts defensively (clamps to 0)', () => {
    const r = computeScore({ lines: 10, milestones: 1, attempts: -3, unique: false });
    expect(r.cleanness).toBe(1); // 1 / (0+1)
  });
});

describe('score-winning-runs — rankRows', () => {
  // Synthetic rows: a tight first-try winner, a noisy retry winner,
  // a duplicate of the tight winner's archetype-feature combo, a winner
  // in a totally different archetype, and a bulky general-bucket win.
  const synthetic = [
    {
      id: 1, task_id: 'hello-world', archetype: 'api_service',
      lines: 10, milestones: 2, attempts: 0,
      first_feature: 'calls get /api/hello:',
    },
    {
      id: 2, task_id: 'hello-world', archetype: 'api_service',
      lines: 14, milestones: 2, attempts: 4,
      first_feature: 'calls get /api/hello:',
    },
    {
      id: 3, task_id: 'todo-crud', archetype: 'crud_app',
      lines: 30, milestones: 4, attempts: 1,
      first_feature: 'create a todos table:',
    },
    {
      id: 4, task_id: 'echo', archetype: 'api_service',
      lines: 8, milestones: 1, attempts: 0,
      first_feature: 'calls post /api/echo:',
    },
    {
      id: 5, task_id: 'general-misc', archetype: 'general',
      lines: 60, milestones: 1, attempts: 8,
      first_feature: 'do unusual thing',
    },
  ];

  it('returns rows sorted by score descending', () => {
    const ranked = rankRows(synthetic);
    for (let i = 1; i < ranked.length; i++) {
      expect(ranked[i - 1].score >= ranked[i].score).toBe(true);
    }
  });

  it('grants the unique bonus to exactly one row per (archetype, first_feature) bucket', () => {
    const ranked = rankRows(synthetic);
    // Rows 1 and 2 share archetype+feature — only one gets the bonus.
    const row1 = ranked.find((r) => r.id === 1);
    const row2 = ranked.find((r) => r.id === 2);
    // Row 1 has cleaner attempts → wins the bucket (gets bonus). Row 2 doesn't.
    expect(row1.unique).toBe(true);
    expect(row2.unique).toBe(false);
    expect(row1.bonus).toBe(0.5);
    expect(row2.bonus).toBe(0);
  });

  it('rows in distinct archetype-feature buckets each receive the bonus', () => {
    const ranked = rankRows(synthetic);
    expect(ranked.find((r) => r.id === 3).unique).toBe(true);
    expect(ranked.find((r) => r.id === 4).unique).toBe(true);
    expect(ranked.find((r) => r.id === 5).unique).toBe(true);
  });

  it('places the tight first-try winner above the noisy retry winner', () => {
    const ranked = rankRows(synthetic);
    const idx1 = ranked.findIndex((r) => r.id === 1);
    const idx2 = ranked.findIndex((r) => r.id === 2);
    expect(idx1 < idx2).toBe(true);
  });

  it('handles an empty input list', () => {
    expect(rankRows([])).toEqual([]);
  });
});

describe('score-winning-runs — renderSnapshot', () => {
  it('produces a header and one line per ranked row', () => {
    const ranked = rankRows([
      { id: 9, task_id: 'demo', archetype: 'api_service', lines: 5, milestones: 1, attempts: 0, first_feature: 'calls get /api/x:' },
    ]);
    const out = renderSnapshot(ranked);
    expect(out.includes('# Winner Rankings')).toBe(true);
    expect(out.includes('id=')).toBe(false); // raw format, not key=value
    expect(out.includes('| api_service |')).toBe(true);
    expect(out.includes('demo')).toBe(true);
  });
});

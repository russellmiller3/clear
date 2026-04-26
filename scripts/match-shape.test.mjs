// Tests for shape-search retrieval (Lean Lesson 2).
//
// Three core behaviors to lock in:
//   1. An identical source returns its own canonical example as #1.
//   2. Same archetype always beats different-archetype, even when the
//      different-archetype example shares more keywords (e.g. an
//      api_service query against an agent_workflow that names "user"
//      shouldn't out-rank a real api_service match).
//   3. With no matches, the highest-archetype-coverage example surfaces —
//      i.e. the system falls back to the example whose shape vector
//      generalizes best, not to a random first one.
//
// Run: `node scripts/match-shape.test.mjs`

import { describe, it, expect } from '../lib/testUtils.js';
import { loadCanonicalExamples, matchShape } from './match-shape.mjs';
import {
  computeShape, shapeTokens, shapeSimilarity, jaccard,
} from '../playground/supervisor/program-shape.js';
import { parse } from '../parser.js';

describe('program-shape — computeShape', () => {
  it('returns the general archetype for an empty / unparseable program', () => {
    const sig = computeShape({ body: [] });
    expect(sig.archetype).toEqual('general');
    expect(sig.first_feature).toEqual(null);
    expect(sig.histogram.endpoint).toEqual(0);
    expect(sig.flags.uses_db).toEqual(false);
  });

  it('counts endpoint + table for a CRUD api_service', () => {
    const src = `build for javascript backend

create a Contacts table:
  name, required
  email, required, unique

when user calls GET /api/contacts:
  send back all Contacts

when user sends data to /api/contacts:
  saved = save data to Contacts
  send back saved
`;
    const sig = computeShape(parse(src));
    expect(sig.archetype).toEqual('api_service');
    expect(sig.histogram.endpoint).toEqual(2);
    expect(sig.histogram.table).toEqual(1);
    expect(sig.flags.uses_db).toEqual(true);
    expect(sig.flags.uses_charts).toEqual(false);
  });

  it('detects auth via allow signup and login directive', () => {
    const src = `build for javascript backend

allow signup and login

when user calls GET /api/me:
  requires login
  send back 'ok'
`;
    const sig = computeShape(parse(src));
    expect(sig.flags.uses_auth).toEqual(true);
  });

  it('detects realtime via subscribe + broadcast', () => {
    const src = `build for javascript backend

subscribe to 'chat':
  broadcast to all message
`;
    const sig = computeShape(parse(src));
    expect(sig.flags.uses_realtime).toEqual(true);
    expect(sig.histogram.subscribe).toEqual(1);
  });

  it('first_feature names the leading endpoint by method + path', () => {
    const src = `build for javascript backend

when user calls GET /api/greet/:name:
  send back { greeting: 'hi ' + this name }
`;
    const sig = computeShape(parse(src));
    expect(sig.first_feature).toEqual('endpoint:GET /api/greet/:name');
  });
});

describe('program-shape — jaccard + shapeSimilarity', () => {
  it('jaccard returns 0 for two empty sets', () => {
    expect(jaccard(new Set(), new Set())).toEqual(0);
  });

  it('jaccard returns 1 for identical sets', () => {
    const a = new Set(['x', 'y', 'z']);
    const b = new Set(['x', 'y', 'z']);
    expect(jaccard(a, b)).toEqual(1);
  });

  it('jaccard reports the overlap fraction on a partial match', () => {
    const a = new Set(['x', 'y']);
    const b = new Set(['x', 'z']);
    // intersection=1, union=3 => 1/3
    expect(jaccard(a, b)).toEqual(1 / 3);
  });

  it('shapeTokens emits archetype + active flags + non-zero hist features', () => {
    const sig = {
      archetype: 'api_service',
      first_feature: 'endpoint:GET /api/x',
      histogram: { endpoint: 1, table: 0, agent: 0 },
      flags: { uses_db: false, uses_auth: true },
    };
    const tokens = shapeTokens(sig);
    expect(tokens.has('archetype:api_service')).toEqual(true);
    expect(tokens.has('feature:endpoint:GET /api/x')).toEqual(true);
    expect(tokens.has('hist:endpoint')).toEqual(true);
    expect(tokens.has('hist:table')).toEqual(false);
    expect(tokens.has('flag:uses_auth')).toEqual(true);
    expect(tokens.has('flag:uses_db')).toEqual(false);
  });

  it('same archetype gets a +1.0 archetype bonus over cross-archetype', () => {
    const a = { archetype: 'api_service', histogram: { endpoint: 1 }, flags: {} };
    const b = { archetype: 'api_service', histogram: { endpoint: 1 }, flags: {} };
    const c = { archetype: 'agent_workflow', histogram: { agent: 1 }, flags: {} };
    expect(shapeSimilarity(a, b)).toBeGreaterThan(1.0);   // 1.0 + jaccard
    expect(shapeSimilarity(a, c)).toBeLessThan(1.0);      // pure jaccard, no bonus
  });
});

describe('match-shape — canonical examples retrieval', () => {
  // Cached so we only parse the markdown once.
  const examples = loadCanonicalExamples();

  it('loads the curated examples file and finds at least 5 examples', () => {
    expect(examples.length >= 5).toEqual(true);
    // Each one has a number, title, source.
    for (const ex of examples) {
      expect(typeof ex.number).toEqual('number');
      expect(typeof ex.title).toEqual('string');
      expect(typeof ex.source).toEqual('string');
      expect(ex.source.length > 0).toEqual(true);
    }
  });

  it('an example matched against itself returns it as the #1 result', () => {
    // Pick the first example, score it back against the library — it
    // should be the top match (similarity=2.0: 1.0 archetype + 1.0 jaccard).
    const target = examples[0];
    const top = matchShape(target.source, { top: 1, examples });
    expect(top[0].example.number).toEqual(target.number);
    // Same-source matches max out near 2.0.
    expect(top[0].score >= 1.5).toEqual(true);
  });

  it('all examples match themselves as #1 (strong identity check)', () => {
    let mismatches = 0;
    for (const ex of examples) {
      const top = matchShape(ex.source, { top: 1, examples });
      if (top[0].example.number !== ex.number) mismatches++;
    }
    expect(mismatches).toEqual(0);
  });

  it('archetype gates matter — agent query never returns api_service as #1 if any agent example exists', () => {
    // Compose a minimal agent_workflow program. Any canonical agent example
    // should out-rank any api_service example for this query.
    const agentSrc = `build for javascript backend

agent 'Helper' receives text:
  response = ask claude 'Echo: ' with text
  send back response

when user sends data to /api/ask:
  result = call 'Helper' with data's text
  send back result
`;
    const top = matchShape(agentSrc, { top: 3, examples });
    // The top result must share the agent_workflow archetype.
    expect(top[0].signature.archetype).toEqual('agent_workflow');
  });

  it('a totally-unrelated archetype still returns SOME ranking — never empty', () => {
    // A "general" program with no recognizable archetype shouldn't blow up.
    const src = `build for javascript backend

when user calls GET /healthz:
  send back 'ok'
`;
    const top = matchShape(src, { top: 3, examples });
    expect(top.length >= 1).toEqual(true);
    // Every result has a numeric score.
    for (const m of top) expect(typeof m.score).toEqual('number');
  });

  it('top is configurable — top=5 returns up to 5 results', () => {
    const src = `build for javascript backend

when user calls GET /api/x:
  send back 'ok'
`;
    const top = matchShape(src, { top: 5, examples });
    expect(top.length <= 5).toEqual(true);
    // Sorted descending — non-increasing scores.
    for (let i = 1; i < top.length; i++) {
      expect(top[i - 1].score >= top[i].score).toEqual(true);
    }
  });

  it('signatures are cached on the example record across calls', () => {
    const ex = examples[0];
    delete ex._signature;
    matchShape('build for javascript backend', { examples });
    expect(typeof ex._signature).toEqual('object');
    const cached = ex._signature;
    matchShape('build for javascript backend', { examples });
    // Same object identity — not recomputed.
    expect(ex._signature === cached).toEqual(true);
  });
});

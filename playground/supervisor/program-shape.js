// Program-shape signature — deterministic feature vector for a Clear program.
//
// Used by `scripts/match-shape.mjs` (canonical-example retrieval) and the
// compile-tool's hint pipeline (additive shape-match alongside text-match).
// Lean's `library_search` / premise selection equivalent for Clear: given a
// partial program, find the closest past winners by SHAPE, not by error text.
//
// What's a "shape"? A small, interpretable feature vector:
//   - archetype             string — one of 16 from archetype.js
//   - first_feature         string — first endpoint path / table name / agent
//                                    name the program declares (idiomatic
//                                    "what is this app trying to be?")
//   - histogram             object — node-type counts
//                                    { endpoint, table, agent, page,
//                                      cron, chart, validate, guard,
//                                      service_call, api_call, subscribe,
//                                      broadcast }
//   - flags                 object — boolean presence
//                                    { uses_auth, uses_validation,
//                                      uses_streaming, uses_db,
//                                      uses_charts, uses_agents,
//                                      uses_realtime, uses_cron,
//                                      uses_external_services }
//
// Two signatures are compared by Jaccard on the union of their token sets:
// archetype, every histogram feature with count > 0, every flag set true,
// and the first_feature path. Picked Jaccard over cosine because the feature
// vector is sparse-binary by nature ("does this app have charts?") and
// Jaccard reads naturally — "fraction of features they share." Cosine would
// require frequency normalization that's noise on these sparse counts.
//
// Deterministic. No ML. Same parsed program → same signature.

import { NodeType } from '../../parser.js';
import { classifyArchetype } from './archetype.js';

// Walk every node in body / thenBranch / otherwiseBranch. Same shape as
// archetype.js's walk() — duplicated here so this module stays self-contained
// and doesn't import archetype.js's internals (only its public classify fn).
function walk(nodes, fn) {
  if (!Array.isArray(nodes)) return;
  for (const n of nodes) {
    if (!n || typeof n !== 'object') continue;
    fn(n);
    if (Array.isArray(n.body)) walk(n.body, fn);
    if (Array.isArray(n.thenBranch)) walk(n.thenBranch, fn);
    if (Array.isArray(n.otherwiseBranch)) walk(n.otherwiseBranch, fn);
  }
}

// Find the FIRST top-level "feature-defining" node — the thing that says
// what this app IS. Endpoint path > table name > agent name > page title.
// Top-level only (no walk into bodies) — we want what the program LEADS with.
function firstFeature(body) {
  if (!Array.isArray(body)) return null;
  for (const n of body) {
    if (!n || typeof n !== 'object') continue;
    if (n.type === NodeType.ENDPOINT && n.path) return `endpoint:${n.method || 'ANY'} ${n.path}`;
    if (n.type === NodeType.DATA_SHAPE && n.name) return `table:${n.name}`;
    if (n.type === NodeType.AGENT && n.name) return `agent:${n.name}`;
    if (n.type === NodeType.PAGE && n.title) return `page:${n.title}`;
  }
  return null;
}

// Build the histogram. Only counts node types that meaningfully reshape the
// program — assignments, comments, ifs aren't included because they live
// inside other features. The histogram answers "what primitives is this app
// built from?", not "how big is the body?".
function histogram(body) {
  const h = {
    endpoint: 0,
    table: 0,
    agent: 0,
    page: 0,
    cron: 0,
    chart: 0,
    validate: 0,
    guard: 0,
    service_call: 0,
    api_call: 0,
    subscribe: 0,
    broadcast: 0,
  };
  walk(body, n => {
    if (n.type === NodeType.ENDPOINT) h.endpoint++;
    else if (n.type === NodeType.DATA_SHAPE) h.table++;
    else if (n.type === NodeType.AGENT) h.agent++;
    else if (n.type === NodeType.PAGE) h.page++;
    else if (n.type === NodeType.CRON) h.cron++;
    else if (n.type === NodeType.CHART) h.chart++;
    else if (n.type === NodeType.VALIDATE) h.validate++;
    else if (n.type === NodeType.GUARD) h.guard++;
    else if (n.type === NodeType.SERVICE_CALL) h.service_call++;
    else if (n.type === NodeType.API_CALL) h.api_call++;
    else if (n.type === NodeType.SUBSCRIBE) h.subscribe++;
    else if (n.type === NodeType.BROADCAST) h.broadcast++;
  });
  return h;
}

// Presence flags — boolean roll-ups derived from the histogram + auth
// detection. Mirrors archetype.js's hasAuth() since auth signals span
// directives, RLS policies, and per-endpoint REQUIRES_AUTH.
function flags(body, hist) {
  let usesAuth = false;
  walk(body, n => {
    if (n.type === NodeType.DATA_SHAPE && Array.isArray(n.policies) && n.policies.length > 0) usesAuth = true;
    if (n.type === NodeType.DIRECTIVE && typeof n.value === 'string' && /login|signup|auth/i.test(n.value)) usesAuth = true;
    if (n.type === NodeType.REQUIRES_AUTH || n.type === NodeType.REQUIRES_ROLE) usesAuth = true;
    if (n.type === NodeType.AUTH_SCAFFOLD) usesAuth = true;
  });
  return {
    uses_auth: usesAuth,
    uses_validation: hist.validate + hist.guard > 0,
    uses_streaming: hist.api_call > 0 || hist.subscribe > 0,
    uses_db: hist.table > 0,
    uses_charts: hist.chart > 0,
    uses_agents: hist.agent > 0,
    uses_realtime: hist.subscribe + hist.broadcast > 0,
    uses_cron: hist.cron > 0,
    uses_external_services: hist.service_call > 0,
  };
}

/**
 * Compute the shape signature of a parsed Clear program.
 *
 * @param {Object} program - parse(source) result. { type, target, body, errors }
 * @returns {Object} signature with archetype, first_feature, histogram, flags
 */
export function computeShape(program) {
  if (!program || !Array.isArray(program.body)) {
    return {
      archetype: 'general',
      first_feature: null,
      histogram: histogram([]),
      flags: flags([], histogram([])),
    };
  }
  const body = program.body;
  const archetype = classifyArchetype(program);
  const hist = histogram(body);
  return {
    archetype,
    first_feature: firstFeature(body),
    histogram: hist,
    flags: flags(body, hist),
  };
}

/**
 * Convert a shape signature to a flat token set for Jaccard comparison.
 *
 * Token shapes:
 *   - "archetype:api_service"
 *   - "feature:endpoint:GET /api/greet/:name"
 *   - "hist:endpoint" (for every histogram feature with count > 0)
 *   - "flag:uses_auth" (for every flag set true)
 *
 * Why string tokens not numeric vectors? Jaccard on sets is the simplest
 * correct similarity for sparse-binary features, and string tokens debug
 * cleanly — you can `console.log(tokens)` and read which features matched.
 * If we ever want weighted features we'd switch to a count Map; today we
 * don't, and the binary roll-up is honest about what we know.
 */
export function shapeTokens(sig) {
  if (!sig) return new Set();
  const tokens = new Set();
  if (sig.archetype) tokens.add(`archetype:${sig.archetype}`);
  if (sig.first_feature) tokens.add(`feature:${sig.first_feature}`);
  if (sig.histogram) {
    for (const [k, v] of Object.entries(sig.histogram)) {
      if (v > 0) tokens.add(`hist:${k}`);
    }
  }
  if (sig.flags) {
    for (const [k, v] of Object.entries(sig.flags)) {
      if (v) tokens.add(`flag:${k}`);
    }
  }
  return tokens;
}

/**
 * Jaccard similarity on two token sets — |A ∩ B| / |A ∪ B|.
 *
 * @param {Set<string>} a
 * @param {Set<string>} b
 * @returns {number} similarity in [0, 1]
 */
export function jaccard(a, b) {
  if (!(a instanceof Set) || !(b instanceof Set)) return 0;
  if (a.size === 0 && b.size === 0) return 0;
  let intersection = 0;
  for (const t of a) if (b.has(t)) intersection++;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Two-tier shape similarity:
 *   - hard archetype gate: same archetype OR cross-archetype gives a
 *     fixed bonus. Same archetype always beats cross-archetype, even if
 *     a cross-archetype example shares more features. Lean's premise
 *     selection has the same property — the type signature gates first,
 *     keyword matching only re-orders within a type.
 *   - jaccard on the token set scores within the gate.
 *
 * Returns a score in [0, 2]:
 *   1.0 + jaccard  if archetypes match
 *   jaccard        if archetypes differ
 *
 * @param {Object} sigA
 * @param {Object} sigB
 * @returns {number}
 */
export function shapeSimilarity(sigA, sigB) {
  if (!sigA || !sigB) return 0;
  const tokensA = shapeTokens(sigA);
  const tokensB = shapeTokens(sigB);
  const j = jaccard(tokensA, tokensB);
  const archetypeBonus = (sigA.archetype && sigA.archetype === sigB.archetype) ? 1.0 : 0;
  return archetypeBonus + j;
}

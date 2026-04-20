// EBM Scorer — JS-side inference from the JSON shape-table bundle.
//
// The Python trainer (train_reranker.py) writes reranker.json with this shape:
//   {
//     "intercept": float,
//     "feature_order": [string],     // names in original feature order
//     "features": [                   // 1D shape functions
//       { "name": str, "type": "continuous"|"nominal",
//         "bin_edges": [float|string], "scores": [float] }
//     ],
//     "interactions": [               // 2D shape functions (pairs)
//       { "name": "feat_a & feat_b", "type": "interaction",
//         "bin_edges": 2D-nested, "scores": 2D-nested }
//     ]
//   }
//
// Inference is literally: intercept + Σ (1D bin lookup) + Σ (2D bin lookup).
// No ML dependency, no model loading. Pure arithmetic. Microsecond latency.

import { readFileSync } from 'fs';

// Load + parse a JSON shape-table bundle from disk.
export function loadBundle(path) {
  const raw = readFileSync(path, 'utf8');
  const bundle = JSON.parse(raw);
  // Index features by name for fast lookup
  bundle._featuresByName = {};
  for (const f of bundle.features || []) bundle._featuresByName[f.name] = f;
  return bundle;
}

// Find which bin a value falls into. Supports both continuous (numeric edges)
// and nominal (exact-match string edges). Returns the bin index or -1 if no match.
function binIndex(value, bin_edges, type) {
  if (!Array.isArray(bin_edges) || bin_edges.length === 0) return -1;

  if (type === 'nominal') {
    // String/categorical — exact match
    const strVal = value === null || value === undefined ? 'none' : String(value);
    for (let i = 0; i < bin_edges.length; i++) {
      if (String(bin_edges[i]) === strVal) return i;
    }
    return -1; // unseen category → no contribution
  }

  // Continuous — bin_edges are upper bounds (sorted ascending); find first edge >= value
  const numVal = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numVal)) return -1;
  for (let i = 0; i < bin_edges.length; i++) {
    if (numVal <= bin_edges[i]) return i;
  }
  return bin_edges.length - 1; // above all edges → last bin
}

// Score a feature vector using the bundle. Returns predicted value (test_score).
// featureVec: plain object with feature names → values, must cover feature_order.
export function score(bundle, featureVec) {
  let total = bundle.intercept || 0;

  // 1D shape function contributions
  for (const feat of bundle.features || []) {
    const value = featureVec[feat.name];
    const idx = binIndex(value, feat.bin_edges, feat.type);
    if (idx >= 0 && idx < (feat.scores || []).length) {
      total += Number(feat.scores[idx]) || 0;
    }
  }

  // 2D interaction contributions — skipped in v1 for simplicity; interactions
  // in the bundle have a richer shape that needs a separate parser. Can add
  // in v2 if empirical ranking improves materially from 1D alone.

  return total;
}

// Rank candidates by their EBM score, highest first. Returns the input array
// re-sorted, with each item annotated with a `.ebm_score` field.
export function rank(bundle, candidates, featurizeFn) {
  const annotated = candidates.map(c => ({
    ...c,
    ebm_score: score(bundle, featurizeFn(c)),
  }));
  annotated.sort((a, b) => b.ebm_score - a.ebm_score);
  return annotated;
}

// ═══════════════════════════════════════════════════════════════════════════
// PAIRWISE SCORING
//
// The pointwise scorer above answers "how good is this past row?" — a
// regression problem that BM25 + test_score sort already approximates.
//
// The pairwise scorer answers "given THIS error, is THIS past fix likely
// to resolve it?" — features compare the current error to each candidate.
// Produced by train_reranker_pairwise.py, bundle shape:
//   {
//     "model_type": "pairwise_logistic",
//     "features": ["archetype_match", "error_sig_exact", ...],
//     "coefficients": [w1, w2, ...],
//     "intercept": b
//   }
// Scoring is sigmoid(intercept + Σ coef × feature). Higher = more likely fix.
// ═══════════════════════════════════════════════════════════════════════════

// Minimal Clear-side error classifier, mirrors the Python trainer's featurizer.
// Kept here so pairwise scoring doesn't need to re-import the exporter.
export function classifyErrorCategory(patchSummary) {
  if (!patchSummary) return 'none';
  const s = patchSummary.toLowerCase();
  if (s.startsWith('clean compile')) return 'none';
  if (/hasn'?t been (created|defined)|not defined/.test(s)) return 'undefined_var';
  if (/doesn'?t understand|expected|unexpected|syntax/.test(s)) return 'syntax';
  if (/table|column|field/.test(s)) return 'schema';
  if (/auth|login|permission/.test(s)) return 'auth';
  if (/validate|required|missing/.test(s)) return 'validation';
  if (/endpoint|route|path/.test(s)) return 'routing';
  if (/chart|display|page/.test(s)) return 'ui';
  return 'other';
}

// Jaccard on token sets — cheap proxy for structural similarity.
function jaccardTokens(a, b) {
  if (!a || !b) return 0;
  const tokA = new Set(a.toLowerCase().split(/[^a-z0-9_]+/).filter(t => t.length > 1));
  const tokB = new Set(b.toLowerCase().split(/[^a-z0-9_]+/).filter(t => t.length > 1));
  if (tokA.size === 0 || tokB.size === 0) return 0;
  let inter = 0;
  for (const t of tokA) if (tokB.has(t)) inter++;
  const union = tokA.size + tokB.size - inter;
  return union === 0 ? 0 : inter / union;
}

// Compute the six pairwise features that the Python trainer uses.
// errorCtx: { archetype, error_sig, error_category, step_index, source_before }
// candidate: factor-db row. The caller SHOULD attach target_error_category
//            (the error category this candidate was known to fix — classified
//            from its session predecessor's patch_summary). If absent, we
//            treat it as 'none' and error_category_match becomes 0.
export function pairFeatures(errorCtx, candidate) {
  const eCat = errorCtx.error_category || 'none';
  const fTarget = candidate.target_error_category || 'none';
  return {
    archetype_match: errorCtx.archetype && errorCtx.archetype === candidate.archetype ? 1 : 0,
    error_sig_exact: errorCtx.error_sig && errorCtx.error_sig === candidate.error_sig ? 1 : 0,
    error_category_match: eCat !== 'none' && eCat === fTarget ? 1 : 0,
    source_jaccard: jaccardTokens(errorCtx.source_before || '', candidate.source_before || ''),
    step_delta: Math.abs(
      (typeof errorCtx.step_index === 'number' ? errorCtx.step_index : 0) -
      (typeof candidate.step_index === 'number' ? candidate.step_index : 0)
    ),
    fix_test_score: candidate.test_score || 0,
  };
}

// Score a single pair via logistic regression. Returns probability in (0, 1).
export function scorePairwise(bundle, features) {
  if (!bundle || bundle.model_type !== 'pairwise_logistic') return 0;
  let z = Number(bundle.intercept) || 0;
  const names = bundle.features || [];
  const coefs = bundle.coefficients || [];
  for (let i = 0; i < names.length; i++) {
    const val = Number(features[names[i]]);
    if (Number.isFinite(val)) z += coefs[i] * val;
  }
  // Sigmoid. Clip z to avoid overflow in Math.exp on extreme inputs.
  if (z > 50) return 1;
  if (z < -50) return 0;
  return 1 / (1 + Math.exp(-z));
}

// Rank candidates by pairwise probability, highest first. Each result is
// annotated with `.pairwise_score` and `.pair_features` for debugging.
export function rankPairwise(bundle, errorCtx, candidates) {
  const annotated = candidates.map(c => {
    const feats = pairFeatures(errorCtx, c);
    return { ...c, pair_features: feats, pairwise_score: scorePairwise(bundle, feats) };
  });
  annotated.sort((a, b) => b.pairwise_score - a.pairwise_score);
  return annotated;
}

// ═══════════════════════════════════════════════════════════════════════════

// Default featurizer for Factor DB rows. Matches the fields exported by
// export-training-data.js (minus the label and metadata). If the bundle was
// trained with different features, pass a custom featurizer to rank().
export function featurizeFactorRow(row) {
  const source = row.source_before || '';
  return {
    archetype: row.archetype || 'unknown',
    step_index: row.step_index !== null && row.step_index !== undefined ? row.step_index : -1,
    step_name: row.step_name || 'none',
    compile_ok: row.compile_ok ? 1 : 0,
    source_length: source ? source.split('\n').length : 0,
    // Other features would be computed from source_before via the same AST
    // walks as the exporter. For a first-pass MVP (whole-row scoring at
    // retrieval time), the core categoricals + compile_ok + source_length
    // capture most of the ranking signal. The richer features improve
    // precision later; this minimum already orders candidates meaningfully.
  };
}

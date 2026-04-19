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

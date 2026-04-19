#!/usr/bin/env python3
"""
Re-ranker training script using Explainable Boosting Machine (EBM).

Waits for 200 passing rows before training. Reads training data exported
from Factor DB, fits an EBM regressor (glass-box GAM + pairwise interactions)
on structured features to predict test_score, then exports both a pickled
model (for Python-side inference) AND a JSON shape-function table (for
pure-JS inference in Studio).

Usage:
  node playground/supervisor/export-training-data.js --out=data.jsonl
  python playground/supervisor/train_reranker.py data.jsonl --out reranker

Dependencies: interpret, pandas, scikit-learn (pip install interpret pandas scikit-learn)

Why EBM not XGBoost: input space is ~15 structured features. EBM is
within 1-3% of XGBoost accuracy at this scale AND provides native
interpretability — each feature's contribution is a plottable shape
function you can audit directly. When a hint gets a bad score, you read
one chart to understand why, no SHAP layer required. Matches Clear's
"no magic, readable source" philosophy. See RESEARCH.md for the full
reasoning.
"""

import json
import sys
import argparse
import pickle
from pathlib import Path


def load_data(jsonl_path):
    """Load JSONL export from Factor DB. Returns list of dict examples."""
    examples = []
    with open(jsonl_path) as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            examples.append(json.loads(line))
    return examples


def export_ebm_to_json(model, feature_cols, out_path):
    """
    Serialize an EBM to a JSON lookup table for pure-JS inference.

    An EBM is a sum of per-feature shape functions plus pairwise interaction
    terms. Each shape function is a piecewise-constant function defined by
    bin edges and bin scores. To evaluate the model in JS: sum the bin
    score for each feature's current value, add the intercept.

    Format:
      {
        "intercept": float,
        "features": [
          {"name": str, "type": "continuous"|"nominal",
           "bin_edges": [float...], "scores": [float...]},
          ...
        ],
        "interactions": [
          {"features": [name1, name2],
           "bin_edges_1": [...], "bin_edges_2": [...], "scores": [[...]]}
        ]
      }
    """
    global_exp = model.explain_global()

    bundle = {
        "intercept": float(model.intercept_) if hasattr(model, 'intercept_') else 0.0,
        "features": [],
        "interactions": [],
        "feature_order": list(feature_cols),
    }

    for idx, name in enumerate(model.feature_names_in_):
        data = global_exp.data(idx)
        feat_entry = {
            "name": str(name),
            "type": str(model.feature_types_in_[idx]),
            "bin_edges": [float(x) for x in (data.get("names") or [])],
            "scores": [float(x) for x in (data.get("scores") or [])],
        }
        if feat_entry["type"] == "interaction":
            bundle["interactions"].append(feat_entry)
        else:
            bundle["features"].append(feat_entry)

    with open(out_path, 'w') as f:
        json.dump(bundle, f, indent=2)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('input', help='Path to JSONL export from Factor DB')
    parser.add_argument('--out', default='reranker', help='Output prefix (writes .pkl + .json)')
    parser.add_argument('--min-passing', type=int, default=200,
                        help='Minimum passing rows to proceed (default 200)')
    args = parser.parse_args()

    examples = load_data(args.input)
    passing = sum(1 for e in examples if e.get('test_pass') == 1)

    print(f'Loaded {len(examples)} examples, {passing} passing')
    if passing < args.min_passing:
        print(f'REFUSED: need {args.min_passing} passing rows to train (have {passing}).')
        print(f'Run more curriculum sweeps to grow the dataset:')
        print(f'  node playground/supervisor/curriculum-sweep.js --workers=3')
        sys.exit(1)

    # ─── When we cross threshold, this block kicks in ──────────────
    try:
        import pandas as pd
        from sklearn.model_selection import train_test_split
        from interpret.glassbox import ExplainableBoostingRegressor
    except ImportError as e:
        print(f'Missing dependency: {e}')
        print(f'Install: pip install interpret pandas scikit-learn')
        sys.exit(1)

    df = pd.DataFrame(examples)

    # EBM handles categoricals natively via feature_types parameter, so we
    # DON'T one-hot encode. Pass the categorical columns as-is and tell EBM.
    label_col = 'test_score'
    meta_cols = [c for c in df.columns if c.startswith('_') or c in ('test_pass',)]
    feature_cols = [c for c in df.columns if c != label_col and c not in meta_cols]

    # Identify categorical features: anything stored as string
    feature_types = []
    for col in feature_cols:
        if df[col].dtype == 'object':
            feature_types.append('nominal')
        else:
            feature_types.append('continuous')

    X = df[feature_cols]
    y = df[label_col]

    X_train, X_val, y_train, y_val = train_test_split(X, y, test_size=0.2, random_state=42)

    # interactions=15 captures the top-15 pairwise interactions automatically.
    # For our ~15 feature count that covers a reasonable breadth; EBM will
    # prune unhelpful interactions during greedy search.
    model = ExplainableBoostingRegressor(
        feature_types=feature_types,
        interactions=15,
        max_bins=256,
        random_state=42,
    )
    print(f'Training EBM on {len(X_train)} rows, {len(feature_cols)} features...')
    model.fit(X_train, y_train)

    # Eval
    train_score = model.score(X_train, y_train)
    val_score = model.score(X_val, y_val)
    print(f'Train R²: {train_score:.3f}')
    print(f'Val R²:   {val_score:.3f}')
    if val_score < 0.3:
        print('WARNING: val R² below 0.3 — model barely beats baseline. More diverse data needed.')

    # Global feature importance — EBM gives this natively from the shape-fn magnitudes
    print('\nTop features by importance:')
    try:
        global_exp = model.explain_global()
        importances = list(zip(
            global_exp.data()['names'],
            global_exp.data()['scores'],
        ))
        importances.sort(key=lambda x: -abs(x[1]))
        for name, score in importances[:10]:
            print(f'  {score:+.4f}  {name}')
    except Exception as e:
        print(f'  (could not extract: {e})')

    # Persist: pickle for Python + JSON for JS-side inference
    pkl_path = f'{args.out}.pkl'
    json_path = f'{args.out}.json'
    with open(pkl_path, 'wb') as f:
        pickle.dump(model, f)
    print(f'\nExported EBM pickle → {pkl_path}')

    try:
        export_ebm_to_json(model, feature_cols, json_path)
        print(f'Exported EBM as JSON lookup → {json_path}')
        print(f'  Feature order for JS inference: {feature_cols}')
    except Exception as e:
        print(f'JSON export failed: {e}')
        print(f'Pickle still usable for Python-side inference.')


if __name__ == '__main__':
    main()

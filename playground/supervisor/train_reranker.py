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
    import numpy as np

    def _to_jsonable(val):
        """Coerce numpy scalars, arrays, or Python primitives to JSON-safe values."""
        if val is None:
            return None
        if isinstance(val, np.ndarray):
            return [_to_jsonable(v) for v in val.tolist()]
        if isinstance(val, (list, tuple)):
            return [_to_jsonable(v) for v in val]
        if isinstance(val, (np.integer,)):
            return int(val)
        if isinstance(val, (np.floating,)):
            return float(val)
        if isinstance(val, (np.bool_,)):
            return bool(val)
        if isinstance(val, (str, int, float, bool)):
            return val
        return str(val)  # last resort

    # EBMs expose intercept_ as a 1-element array for regression
    raw_intercept = getattr(model, 'intercept_', 0.0)
    if hasattr(raw_intercept, '__len__') and len(raw_intercept) > 0:
        intercept = float(raw_intercept[0])
    else:
        intercept = float(raw_intercept)

    bundle = {
        "intercept": intercept,
        "features": [],
        "interactions": [],
        "feature_order": list(feature_cols),
    }

    for idx, name in enumerate(model.feature_names_in_):
        # Use `is not None` instead of truthy check — numpy arrays bomb on bool()
        data = global_exp.data(idx)
        names = data.get("names") if data is not None else None
        scores = data.get("scores") if data is not None else None
        feat_entry = {
            "name": str(name),
            "type": str(model.feature_types_in_[idx]),
            "bin_edges": _to_jsonable(names) if names is not None else [],
            "scores": _to_jsonable(scores) if scores is not None else [],
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
        from sklearn.linear_model import LassoCV
        from sklearn.preprocessing import StandardScaler
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

    # Identify categorical features. Dtype-only detection failed because columns
    # with all-None or mixed rows sometimes infer as float64. Whitelist known
    # categoricals by name, then fall back to dtype/string check.
    KNOWN_CATEGORICAL = {'archetype', 'error_category', 'step_name', 'step_id', 'task_type'}
    feature_types = []
    for col in feature_cols:
        if col in KNOWN_CATEGORICAL:
            feature_types.append('nominal')
            # Coerce None → 'none' so EBM doesn't trip on NaN in categoricals
            df[col] = df[col].fillna('none').astype(str)
        elif df[col].dtype == 'object' or pd.api.types.is_string_dtype(df[col]):
            feature_types.append('nominal')
            df[col] = df[col].fillna('none').astype(str)
        else:
            feature_types.append('continuous')

    X = df[feature_cols]
    y = df[label_col]

    X_train, X_val, y_train, y_val = train_test_split(X, y, test_size=0.2, random_state=42)

    # Hyperparameters tuned for Phase-1 scale (200-500 rows, ~25 features):
    # - interactions=8 (down from 15) — too many interactions overfits at this row count
    # - max_bins=32 (down from 256) — 32 bins is plenty for features with ≤16 unique values;
    #   fewer bins = less overfitting on high-cardinality categoricals like error_token
    # - min_samples_leaf=4 — require at least 4 samples per leaf split; prevents
    #   memorizing singleton categoricals
    # - learning_rate=0.01 — half default, more gradient-boosting iterations for
    #   smoother shape functions
    # Revisit these once we have 1000+ passing rows.
    model = ExplainableBoostingRegressor(
        feature_types=feature_types,
        interactions=8,
        max_bins=32,
        min_samples_leaf=4,
        learning_rate=0.01,
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

    # ─── 2-stage Lasso → EBM pipeline (Russell's suggestion) ───────────────
    # Stage 1: run Lasso on one-hot-encoded features. L1 regularization
    #   auto-zeros weak features. Aggregate per-dummy coefficients back to
    #   source-feature importance: a source feature is "kept" if ANY of its
    #   one-hot dummies has non-zero coefficient (or a continuous feature's
    #   coefficient is non-zero).
    # Stage 2: retrain EBM on ONLY the Lasso-selected source features.
    #   Fewer features → less overfitting at low row counts, while still
    #   getting EBM's non-linear shape functions and pairwise interactions.
    # We report all three (EBM-on-all, Lasso alone, EBM-on-Lasso-selected)
    # so you can see whether the 2-stage beats either alone.
    print('\nStage 1: Lasso on one-hot features...')
    # Categorical columns to one-hot: known categoricals + any object-dtype
    cat_cols = [c for c in feature_cols if c in KNOWN_CATEGORICAL or X_train[c].dtype == 'object']
    X_train_lasso = pd.get_dummies(X_train, columns=cat_cols, drop_first=False)
    X_val_lasso = pd.get_dummies(X_val, columns=cat_cols, drop_first=False)
    X_val_lasso = X_val_lasso.reindex(columns=X_train_lasso.columns, fill_value=0)
    scaler = StandardScaler()
    X_train_lasso_s = scaler.fit_transform(X_train_lasso)
    X_val_lasso_s = scaler.transform(X_val_lasso)

    lasso = LassoCV(cv=5, max_iter=5000, random_state=42)
    lasso.fit(X_train_lasso_s, y_train)
    lasso_train_r2 = lasso.score(X_train_lasso_s, y_train)
    lasso_val_r2 = lasso.score(X_val_lasso_s, y_val)
    nonzero = sum(1 for c in lasso.coef_ if abs(c) > 1e-8)
    print(f'  Lasso Train R²: {lasso_train_r2:.3f}')
    print(f'  Lasso Val R²:   {lasso_val_r2:.3f}')
    print(f'  Nonzero coefficients: {nonzero} / {len(lasso.coef_)}   (alpha={lasso.alpha_:.4f})')

    # Aggregate per-dummy importance back to source features.
    # A source feature is "kept" if any of its one-hot dummies has a non-zero
    # coefficient (or a continuous feature's coefficient is non-zero).
    feature_importance_from_lasso = {f: 0.0 for f in feature_cols}
    for dummy_name, coef in zip(X_train_lasso.columns, lasso.coef_):
        if abs(coef) < 1e-8:
            continue
        # Find which source feature this dummy came from
        if dummy_name in feature_importance_from_lasso:
            feature_importance_from_lasso[dummy_name] = max(
                feature_importance_from_lasso[dummy_name], abs(coef)
            )
        else:
            # It's a one-hot dummy: look for the source categorical
            for cat in cat_cols:
                if dummy_name.startswith(f'{cat}_'):
                    feature_importance_from_lasso[cat] = max(
                        feature_importance_from_lasso[cat], abs(coef)
                    )
                    break

    lasso_selected = [f for f, imp in feature_importance_from_lasso.items() if imp > 1e-8]
    lasso_dropped = [f for f, imp in feature_importance_from_lasso.items() if imp <= 1e-8]
    print(f'\n  Lasso-kept source features ({len(lasso_selected)}/{len(feature_cols)}):')
    ranked = sorted(feature_importance_from_lasso.items(), key=lambda x: -x[1])
    for f, imp in ranked:
        if imp > 1e-8:
            print(f'    {imp:+.4f}  {f}')
    if lasso_dropped:
        print(f'  Dropped (zero coefficient): {", ".join(lasso_dropped)}')

    # ─── Stage 2: retrain EBM on ONLY Lasso-selected features ──────────────
    print(f'\nStage 2: EBM on Lasso-selected features ({len(lasso_selected)} features)...')
    if len(lasso_selected) < 2:
        print('  Too few features selected by Lasso — skipping 2-stage EBM')
        stage2_model = model
        stage2_val_r2 = val_score
    else:
        X_train_s2 = X_train[lasso_selected]
        X_val_s2 = X_val[lasso_selected]
        ft_s2 = [ft for f, ft in zip(feature_cols, feature_types) if f in lasso_selected]
        stage2_model = ExplainableBoostingRegressor(
            feature_types=ft_s2,
            interactions=min(8, len(lasso_selected) * (len(lasso_selected) - 1) // 2),
            max_bins=32,
            min_samples_leaf=4,
            learning_rate=0.01,
            random_state=42,
        )
        stage2_model.fit(X_train_s2, y_train)
        stage2_train_r2 = stage2_model.score(X_train_s2, y_train)
        stage2_val_r2 = stage2_model.score(X_val_s2, y_val)
        print(f'  Stage-2 EBM Train R²: {stage2_train_r2:.3f}')
        print(f'  Stage-2 EBM Val R²:   {stage2_val_r2:.3f}')

    # ─── Scorecard ─────────────────────────────────────────────────────────
    print('\n=== Scorecard ===')
    print(f'  EBM (all {len(feature_cols)} features):        val R² = {val_score:.3f}')
    print(f'  Lasso alone (one-hot, L1-regularized):   val R² = {lasso_val_r2:.3f}')
    print(f'  EBM on Lasso-selected features ({len(lasso_selected)}):   val R² = {stage2_val_r2:.3f}')
    best = max([('EBM-all', val_score), ('Lasso-alone', lasso_val_r2), ('EBM-on-Lasso-selected', stage2_val_r2)], key=lambda x: x[1])
    print(f'  >>> WINNER: {best[0]}  (val R² = {best[1]:.3f})')

    # Switch production model to stage-2 EBM if it wins
    if stage2_val_r2 > val_score and stage2_val_r2 > lasso_val_r2:
        print(f'  2-stage pipeline wins. Using stage-2 EBM as production model.')
        model = stage2_model
        feature_cols = lasso_selected
        feature_types = [ft for f, ft in zip([f for f in feature_importance_from_lasso.keys()], feature_types) if f in lasso_selected]
        val_score = stage2_val_r2
    # ────────────────────────────────────────────────────────────────────────

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
    print(f'\nExported EBM pickle -> {pkl_path}')

    try:
        export_ebm_to_json(model, feature_cols, json_path)
        print(f'Exported EBM as JSON lookup -> {json_path}')
        print(f'  Feature order for JS inference: {feature_cols}')
    except Exception as e:
        print(f'JSON export failed: {e}')
        print(f'Pickle still usable for Python-side inference.')


if __name__ == '__main__':
    main()

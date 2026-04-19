#!/usr/bin/env python3
"""
Re-ranker training script. NOT YET ACTIVE — waits for 200 passing rows.

Reads training data exported from Factor DB, trains XGBoost to predict
test_score from structured features, exports as ONNX for portable
inference in Node.

Usage:
  node playground/supervisor/export-training-data.js --out=data.jsonl
  python playground/supervisor/train_reranker.py data.jsonl --out model.onnx

Dependencies: pandas, xgboost, onnxmltools, scikit-learn (pip install)

Why XGBoost not a large model: input space is ~15 structured features.
This is a tabular problem, not a language understanding problem. See
RESEARCH.md for the full reasoning.
"""

import json
import sys
import argparse
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


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('input', help='Path to JSONL export from Factor DB')
    parser.add_argument('--out', default='reranker.onnx', help='Output model path')
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
        import xgboost as xgb
        from sklearn.model_selection import train_test_split
    except ImportError as e:
        print(f'Missing dependency: {e}')
        print(f'Install: pip install pandas xgboost onnxmltools scikit-learn')
        sys.exit(1)

    df = pd.DataFrame(examples)

    # One-hot encode archetype
    df = pd.get_dummies(df, columns=['archetype'], prefix='arch')

    # Features: all non-underscore, non-label columns
    label_col = 'test_score'
    meta_cols = [c for c in df.columns if c.startswith('_') or c in ('test_pass',)]
    feature_cols = [c for c in df.columns if c != label_col and c not in meta_cols]

    X = df[feature_cols]
    y = df[label_col]

    X_train, X_val, y_train, y_val = train_test_split(X, y, test_size=0.2, random_state=42)

    model = xgb.XGBRegressor(
        n_estimators=100,
        max_depth=4,
        learning_rate=0.1,
        objective='reg:squarederror',
    )
    model.fit(X_train, y_train, eval_set=[(X_val, y_val)], verbose=False)

    # Print eval metrics
    train_score = model.score(X_train, y_train)
    val_score = model.score(X_val, y_val)
    print(f'Train R²: {train_score:.3f}')
    print(f'Val R²:   {val_score:.3f}')
    if val_score < 0.3:
        print('WARNING: val R² below 0.3 — model is barely beating random. More data needed.')

    # Feature importance
    print('\nTop features:')
    importances = sorted(zip(feature_cols, model.feature_importances_), key=lambda x: -x[1])
    for name, score in importances[:10]:
        print(f'  {score:.4f}  {name}')

    # Export to ONNX for Node inference
    try:
        from onnxmltools import convert_xgboost
        from onnxmltools.convert.common.data_types import FloatTensorType
        initial_type = [('input', FloatTensorType([None, len(feature_cols)]))]
        onnx_model = convert_xgboost(model, initial_types=initial_type)
        with open(args.out, 'wb') as f:
            f.write(onnx_model.SerializeToString())
        print(f'\nExported model to {args.out}')
        print(f'Feature order (save this — inference code needs it):')
        print(f'  {feature_cols}')
    except ImportError:
        print('Skipping ONNX export — install onnxmltools to enable.')


if __name__ == '__main__':
    main()

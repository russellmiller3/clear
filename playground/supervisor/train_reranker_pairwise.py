#!/usr/bin/env python3
"""
Pairwise re-ranker trainer.

Reads (error, fix) pairs exported from Factor DB, fits a simple binary
classifier that predicts "did this fix resolve this error?", and writes a
JSON bundle for JS-side inference.

Different from train_reranker.py (pointwise regression on test_score) —
this one answers the question the retriever actually cares about:
"given Meph's CURRENT error, which candidate is most likely to help?"

We use plain logistic regression because:
 - At ~24 pairs (2026-04 data scale), anything fancier overfits.
 - Six features, all in [0, 1] or small integers — linear boundary is fine.
 - JSON export is trivial (6 coefficients + 1 intercept).
 - Swap in XGBoost/LambdaRank when pair count crosses ~1000.

Usage:
  node playground/supervisor/export-training-data.js --pairwise --out=pairs.jsonl
  python playground/supervisor/train_reranker_pairwise.py pairs.jsonl --out reranker-pairwise

Dependencies: scikit-learn, pandas, numpy.
"""

import json
import sys
import argparse
from pathlib import Path


FEATURE_COLS = [
    'archetype_match',
    'error_sig_exact',
    'error_category_match',
    'source_jaccard',
    'step_delta',
    'fix_test_score',
]


def load_pairs(jsonl_path):
    pairs = []
    with open(jsonl_path) as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            pairs.append(json.loads(line))
    return pairs


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('pairs_jsonl', help='Pairs JSONL from --pairwise export')
    ap.add_argument('--out', default='reranker-pairwise',
                    help='Output basename (writes .json for JS inference)')
    args = ap.parse_args()

    pairs = load_pairs(args.pairs_jsonl)
    if not pairs:
        print(f'No pairs in {args.pairs_jsonl} — aborting.', file=sys.stderr)
        sys.exit(2)

    # Lazy imports so the --help path works without sklearn installed
    import numpy as np
    import pandas as pd
    from sklearn.linear_model import LogisticRegression
    from sklearn.model_selection import train_test_split
    from sklearn.metrics import roc_auc_score

    df = pd.DataFrame(pairs)
    missing = [c for c in FEATURE_COLS + ['label'] if c not in df.columns]
    if missing:
        print(f'Missing columns in pairs JSONL: {missing}', file=sys.stderr)
        sys.exit(2)

    X = df[FEATURE_COLS].fillna(0).astype(float)
    y = df['label'].astype(int)
    n_pos, n_neg = int((y == 1).sum()), int((y == 0).sum())
    print(f'Loaded {len(df)} pairs: {n_pos} positive, {n_neg} negative')

    if n_pos < 3 or n_neg < 3:
        print('WARNING: fewer than 3 pairs per class — results will be unstable.')

    # Train / validation split (stratified so val has both classes even at tiny N).
    # With <20 pairs the split is largely decorative — train == val is a common
    # reality at this scale. Keep the split so metrics are honest as data grows.
    if len(df) >= 10 and n_pos >= 2 and n_neg >= 2:
        X_tr, X_val, y_tr, y_val = train_test_split(
            X, y, test_size=0.25, random_state=42, stratify=y
        )
    else:
        X_tr, y_tr = X, y
        X_val, y_val = X, y

    model = LogisticRegression(max_iter=1000, C=1.0, random_state=42)
    model.fit(X_tr, y_tr)

    train_acc = model.score(X_tr, y_tr)
    val_acc = model.score(X_val, y_val)
    train_auc = roc_auc_score(y_tr, model.predict_proba(X_tr)[:, 1]) if len(set(y_tr)) > 1 else float('nan')
    val_auc = roc_auc_score(y_val, model.predict_proba(X_val)[:, 1]) if len(set(y_val)) > 1 else float('nan')

    print(f'Train accuracy: {train_acc:.3f}   AUC: {train_auc:.3f}')
    print(f'Val   accuracy: {val_acc:.3f}   AUC: {val_auc:.3f}')

    print('\nFeature weights (positive = favors this pair):')
    for name, w in sorted(zip(FEATURE_COLS, model.coef_[0]), key=lambda x: -abs(x[1])):
        print(f'  {w:+.4f}  {name}')
    print(f'  {model.intercept_[0]:+.4f}  (intercept)')

    bundle = {
        'model_type': 'pairwise_logistic',
        'features': FEATURE_COLS,
        'coefficients': [float(w) for w in model.coef_[0]],
        'intercept': float(model.intercept_[0]),
        'metrics': {
            'train_accuracy': float(train_acc),
            'val_accuracy': float(val_acc),
            'train_auc': None if np.isnan(train_auc) else float(train_auc),
            'val_auc': None if np.isnan(val_auc) else float(val_auc),
            'n_pairs': len(df),
            'n_positives': n_pos,
            'n_negatives': n_neg,
        },
        'note': 'Score = sigmoid(intercept + sum(coef[i] * features[name[i]])).',
    }

    out_path = Path(args.out).with_suffix('.json')
    with open(out_path, 'w') as f:
        json.dump(bundle, f, indent=2)
    print(f'\nWrote pairwise bundle -> {out_path}')


if __name__ == '__main__':
    main()

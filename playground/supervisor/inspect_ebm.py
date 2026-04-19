#!/usr/bin/env python3
"""
Pretty-print an EBM's shape functions as text charts. Run after training:
  python playground/supervisor/inspect_ebm.py /tmp/reranker-v2.json

For each feature, prints a bar chart showing how each bin contributes to
the predicted score. Negative contributions are bars going left, positive
bars going right. This is the "glass-box" payoff — you can literally read
what the model learned.
"""

import json
import sys


def bar(value, max_abs, width=40):
    """Render a signed numeric value as a text bar, centered at 0."""
    if max_abs == 0:
        return '|' + ' ' * width
    half = width // 2
    filled = int(abs(value) / max_abs * half)
    if value < 0:
        return (' ' * (half - filled)) + ('#' * filled) + '|' + (' ' * half)
    else:
        return (' ' * half) + '|' + ('#' * filled) + (' ' * (half - filled))


def print_feature(feat, max_bins=20):
    name = feat.get('name', '?')
    ftype = feat.get('type', '?')
    bin_edges = feat.get('bin_edges', [])
    scores = feat.get('scores', [])

    if not scores:
        print(f'  (no bins)')
        return

    # Find max abs score for scaling bars
    flat_scores = []
    for s in scores:
        if isinstance(s, list):
            for sub in s:
                if isinstance(sub, (int, float)):
                    flat_scores.append(sub)
        elif isinstance(s, (int, float)):
            flat_scores.append(s)
    max_abs = max((abs(s) for s in flat_scores), default=0)

    print(f'\n=== {name}  ({ftype}) ===')
    if ftype == 'interaction':
        print(f'  (2D shape function, {len(scores)} × {len(scores[0]) if scores and isinstance(scores[0], list) else "?"} grid — summary only)')
        print(f'  peak magnitude: {max_abs:+.4f}')
        return

    # 1D shape function
    print(f'  max |contribution|: {max_abs:.4f}')
    print(f'  {"bin".ljust(24)} score       visualization')
    print(f'  {"-" * 24} ----------  {"-" * 42}')

    rendered_bins = list(zip(bin_edges, scores)) if len(bin_edges) == len(scores) else list(enumerate(scores))
    if len(rendered_bins) > max_bins:
        # Show most-impactful bins only
        rendered_bins.sort(key=lambda x: abs(x[1]) if isinstance(x[1], (int, float)) else 0, reverse=True)
        rendered_bins = rendered_bins[:max_bins]
        rendered_bins.sort(key=lambda x: bin_edges.index(x[0]) if x[0] in bin_edges else 0)

    for edge, score in rendered_bins:
        if not isinstance(score, (int, float)):
            continue
        label = str(edge)[:22].ljust(24)
        print(f'  {label}  {score:+.4f}    {bar(score, max_abs)}')


def main():
    if len(sys.argv) < 2:
        print('Usage: python inspect_ebm.py <reranker.json>')
        sys.exit(1)

    with open(sys.argv[1]) as f:
        bundle = json.load(f)

    print(f'EBM intercept: {bundle["intercept"]:+.4f}')
    print(f'Features: {len(bundle.get("features", []))}')
    print(f'Interactions: {len(bundle.get("interactions", []))}')

    # Sort features by max abs contribution (rough importance)
    def feat_importance(f):
        scores = f.get('scores', [])
        return max((abs(s) for s in scores if isinstance(s, (int, float))), default=0)

    features = sorted(bundle.get('features', []), key=feat_importance, reverse=True)

    for feat in features:
        print_feature(feat)


if __name__ == '__main__':
    main()

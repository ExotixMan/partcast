#!/usr/bin/env python3
"""Development-only model comparison. Original sales remain unchanged.

The final period cannot affect candidate selection. Previously reviewed extracts
still cannot become fresh independent evidence by changing their split.
"""
import argparse
import hashlib
import json
from datetime import timedelta
from pathlib import Path
import pandas as pd
from xgboost import XGBRegressor
from train_forecast import build_product_series, evaluate_horizon, make_model

MIN_POSITIVE_DEVELOPMENT_WINDOWS = 3


def candidate_models():
    common = dict(n_estimators=160, max_depth=2, learning_rate=0.04,
                  min_child_weight=5, subsample=0.9, colsample_bytree=0.9,
                  reg_alpha=0.1, reg_lambda=10, random_state=42, n_jobs=2)
    return {
        'current_tweedie': make_model,
        'regularized_poisson': lambda: XGBRegressor(**common, objective='count:poisson', eval_metric='mae'),
        'regularized_squared_error': lambda: XGBRegressor(**common, objective='reg:squarederror', eval_metric='mae')
    }


def development_comparison(series, horizon_days=30, factories=None):
    factories = factories or candidate_models()
    last = max(s.index.max() for s in series.values())
    cutoff = pd.Timestamp(last.to_pydatetime() - timedelta(days=horizon_days))
    development = {pid: s.loc[s.index <= cutoff] for pid, s in series.items() if s.index.min() <= cutoff}
    checks = {name: evaluate_horizon(development, horizon_days, model_factory=factory)
              for name, factory in factories.items()} if development else {}
    positive_windows = min((r.get('nonzero_window_count', 0) for r in checks.values()), default=0)
    selected = None
    reason = 'Too few development periods contain recorded demand to select a model reliably.'
    if positive_windows >= MIN_POSITIVE_DEVELOPMENT_WINDOWS:
        comparable = {name: r for name, r in checks.items() if r.get('model') is not None}
        windows = [tuple((w['product_id'], w['origin']) for w in r['windows']) for r in comparable.values()]
        if comparable and all(w == windows[0] for w in windows):
            selected = min(comparable, key=lambda name: comparable[name]['model']['mae'])
            reason = 'Lowest development-period MAE; final-period labels did not affect selection.'
    # Never run every candidate on the final period to pick a favorable score.
    final = evaluate_horizon(series, horizon_days, max_origins=1,
                             model_factory=factories[selected]) if selected else None
    return {
        'horizon_days': horizon_days,
        'development_ends': cutoff.date().isoformat(),
        'final_period_start': (cutoff.to_pydatetime() + timedelta(days=1)).date().isoformat(),
        'final_period_end': last.date().isoformat(),
        'minimum_positive_development_windows': MIN_POSITIVE_DEVELOPMENT_WINDOWS,
        'positive_development_windows': positive_windows,
        'development_checks': checks, 'selected_candidate': selected, 'selection_reason': reason,
        'final_evaluation': final,
        'final_period_used_for_selection': False,
        'production_model_changed': False,
        'independent_accuracy_established': False,
        'limitations': [
            'Internal absent days use the existing unverified zero-coverage assumption.',
            'Three positive development windows is a comparison guard, not an industry accuracy standard.',
            'Previously reviewed records cannot establish fresh independent validation.',
            'No parameters, dates, quantities or items are changed to force a high score.'
        ]
    }


def compare(csv_path, horizon_days=30):
    source = Path(csv_path).read_bytes()
    frame = pd.read_csv(csv_path, dtype={'Part Number': str})
    required = {'Date', 'Part Number', 'Demand Quantity'}
    if not required.issubset(frame.columns):
        raise ValueError('Use Date, Part Number and Demand Quantity columns.')
    observations = [{'product_id': r['Part Number'], 'occurred_on': r['Date'], 'quantity': r['Demand Quantity']}
                    for r in frame.to_dict('records')]
    series, skipped = build_product_series(observations)
    result = development_comparison(series, horizon_days)
    known = set(frame['Part Number'])
    tested = {w['product_id'] for r in result['development_checks'].values() for w in r['windows']}
    if not tested.issubset(known):
        raise ValueError('A comparison referenced an unidentified part.')
    if source != Path(csv_path).read_bytes():
        raise ValueError('Source records changed during comparison.')
    return {
        'source_sha256': hashlib.sha256(source).hexdigest(), 'source_unchanged': True,
        'known_part_count': len(known), 'new_part_count': len(tested - known),
        'observations': len(observations), 'sparse_parts': len(skipped), **result
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--csv', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--horizon', type=int, default=30)
    args = parser.parse_args()
    if not 7 <= args.horizon <= 90:
        parser.error('Choose a horizon between 7 and 90 days.')
    result = compare(args.csv, args.horizon)
    output = Path(args.output); output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, indent=2), encoding='utf-8')
    print(json.dumps({k: v for k, v in result.items() if k not in ['development_checks', 'final_evaluation']}, indent=2))


if __name__ == '__main__':
    main()

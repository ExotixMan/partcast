"""Evaluate explicitly simulated workbook splits; never read/write store data."""
import argparse
from datetime import timedelta
import json
import platform
from pathlib import Path

import numpy as np
import pandas as pd
import xgboost

from direct_period_demo import forecast_direct_period
from train_forecast import feature_columns, forecast, make_features, make_model, total_errors

HORIZON = 30
XGBOOST_METHODS = ('direct_period_xgboost', 'recursive_xgboost')
METHODS = (*XGBOOST_METHODS, 'recent_average_28', 'sma_365')


def parse_splits(payload):
    if payload.get('dataset_type') != 'SIMULATED_DEMO':
        raise ValueError('This experiment requires an explicitly labelled simulated dataset.')
    splits, previous_end, expected_parts = {}, None, None
    as_of = pd.Timestamp(payload.get('as_of_date', pd.Timestamp.now(tz='Asia/Manila').date().isoformat()))
    for name in ('train', 'validation', 'test'):
        rows = payload.get('splits', {}).get(name)
        if not isinstance(rows, list) or not rows or len(rows) > 50000:
            raise ValueError('Each demo split needs 1 to 50,000 daily records.')
        frame = pd.DataFrame(rows)
        if not {'date', 'part_number', 'quantity', 'tier'}.issubset(frame.columns):
            raise ValueError('Demo rows need date, part number, quantity and a synthetic tier.')
        if not frame['tier'].isin(['synthetic_simulated', 'simulated_demo']).all():
            raise ValueError('Actual and simulated records cannot be mixed in this demo.')
        if not frame['date'].map(lambda value: isinstance(value, str) and len(value) == 10).all():
            raise ValueError('Demo dates must use YYYY-MM-DD.')
        frame['date'] = pd.to_datetime(frame['date'], format='%Y-%m-%d', errors='raise')
        if frame['date'].max() > as_of:
            raise ValueError('Demo history contains future dates.')
        if not frame['part_number'].map(lambda value: isinstance(value, str) and bool(value.strip()) and len(value) <= 120).all():
            raise ValueError('Every demo row needs an identified part number.')
        quantities = pd.to_numeric(frame['quantity'], errors='raise').to_numpy(dtype=float)
        if any(isinstance(value, (bool, np.bool_)) for value in frame['quantity']) or not np.isfinite(quantities).all() or (quantities < 0).any():
            raise ValueError('Demo quantities must be finite nonnegative numbers, including explicit zero days.')
        frame['quantity'] = quantities
        if frame.duplicated(['date', 'part_number']).any():
            raise ValueError('Duplicate part/date rows would double-count demand.')
        parts = set(frame['part_number'])
        if len(parts) > 30 or (expected_parts is not None and parts != expected_parts):
            raise ValueError('Use the same 1 to 30 identified parts in every split.')
        expected_parts = parts
        days = pd.date_range(frame['date'].min(), frame['date'].max())
        if previous_end is not None and days.min() != previous_end + timedelta(days=1):
            raise ValueError('Training, validation and test dates must be consecutive and must not overlap.')
        previous_end = days.max()
        if name == 'train' and len(days) < 120:
            raise ValueError('The demo needs at least 120 complete training days per part.')
        if name != 'train' and (len(days) < HORIZON or len(days) > 90 or len(days) % HORIZON):
            raise ValueError('Validation and test must each contain 30, 60 or 90 complete days per part.')
        series = {}
        for pid, group in frame.groupby('part_number', sort=True):
            values = group.set_index('date')['quantity'].sort_index()
            if not values.index.equals(days):
                raise ValueError('Every split must explicitly contain every day, including zero-demand days, for every part.')
            series[pid] = values
        splits[name] = series
    return splits


def recursive_period(history, horizon, origin):
    features, codes = make_features(history)
    model = make_model()
    columns = feature_columns()
    model.fit(features[columns], features['y'])
    return forecast(model, columns, history, codes, horizon, origin)


def period_predictions(history, method, origin, forecasters=None):
    forecasters = forecasters or {'direct_period_xgboost': forecast_direct_period, 'recursive_xgboost': recursive_period}
    if method in XGBOOST_METHODS:
        totals = {pid: 0.0 for pid in history}
        expected = {(pid, (origin + timedelta(days=step)).date().isoformat()) for pid in history for step in range(1,HORIZON+1)}
        seen = set()
        for row in forecasters[method](history, HORIZON, origin):
            if row['product_id'] not in totals or not np.isfinite(row['predicted_quantity']) or row['predicted_quantity'] < 0:
                raise ValueError('The demo model returned an invalid part or quantity.')
            key = (row['product_id'], row['forecast_date'])
            if key not in expected or key in seen:
                raise ValueError('The demo model returned duplicate or out-of-period dates.')
            seen.add(key)
            totals[row['product_id']] += float(row['predicted_quantity'])
        if seen != expected:
            raise ValueError('The demo model did not predict the complete planning period.')
        return totals
    window = 28 if method == 'recent_average_28' else 365
    return {pid: float(values.tail(window).mean()) * HORIZON for pid, values in history.items()}


def evaluate_split(all_series, split, forecasters=None):
    first = next(iter(split.values())).index.min()
    last = next(iter(split.values())).index.max()
    windows = {method: [] for method in METHODS}
    for start in pd.date_range(first, last, freq=f'{HORIZON}D'):
        origin, end = start - timedelta(days=1), start + timedelta(days=HORIZON - 1)
        history = {pid: values.loc[values.index <= origin] for pid, values in all_series.items()}
        if any(values.index.max() != origin for values in history.values()):
            raise ValueError('Every model needs a complete known calendar through its forecast origin.')
        for method in METHODS:
            predictions = period_predictions(history, method, origin, forecasters)
            for pid in sorted(history):
                actual = float(all_series[pid].loc[start:end].sum())
                windows[method].append({'part_number': pid, 'start': start.date().isoformat(), 'end': end.date().isoformat(),
                                        'actual_units': actual, 'predicted_units': round(predictions[pid], 4)})
    return {method: {'metrics': total_errors([r['actual_units'] for r in rows], [r['predicted_units'] for r in rows]),
                     'window_count': len(rows), 'positive_window_count': sum(r['actual_units'] > 0 for r in rows),
                     'windows': rows} for method, rows in windows.items()}


def evaluate_workbook(payload, forecasters=None, include_future=True):
    splits = parse_splits(payload)

    development = {pid: pd.concat([splits['train'][pid], splits['validation'][pid]]) for pid in splits['train']}
    validation = evaluate_split(development, splits['validation'], forecasters)
    candidates = [method for method in XGBOOST_METHODS if validation[method]['metrics']['wape_percent'] is not None]
    selected = min(candidates, key=lambda method: (validation[method]['metrics']['wape_percent'], method)) if candidates else None
    full = {pid: pd.concat([development[pid], splits['test'][pid]]) for pid in development}

    test = evaluate_split(full, splits['test'], forecasters)
    future = []
    if include_future and selected:
        origin = next(iter(full.values())).index.max()
        totals = period_predictions(full, selected, origin, forecasters)
        future = [{'part_number': pid, 'start': (origin + timedelta(days=1)).date().isoformat(),
                   'end': (origin + timedelta(days=HORIZON)).date().isoformat(),
                   'predicted_units': round(totals[pid], 4)} for pid in sorted(totals)]
    return {'dataset_type': 'SIMULATED_DEMO', 'filename': payload.get('filename'), 'source_sha256': payload.get('source_sha256'),
            'runtime_versions': {'python': platform.python_version(), 'numpy': np.__version__, 'pandas': pd.__version__, 'xgboost': xgboost.__version__},
            'horizon_days': HORIZON, 'part_count': len(full), 'parts': sorted(full),
            'split_summary': {name: {'rows': sum(len(s) for s in series.values()),
                                    'start': next(iter(series.values())).index.min().date().isoformat(),
                                    'end': next(iter(series.values())).index.max().date().isoformat()}
                              for name, series in splits.items()},
            'selected_method': selected, 'selection_basis': 'Validation WAPE among fixed direct and recursive XGBoost strategies; test labels cannot select the strategy.',
            'validation': validation, 'test': test, 'future_periods': future,
            'production_accuracy_established': False, 'actual_sales_modified': False,
            'limitations': ['Every demand date and quantity in this experiment is simulated, including zero days.',
                           'Test labels are excluded from fitting each tested period. Completed earlier periods become historical before the next period.',
                           'The workbook and its test outcomes have already been inspected; this is a reproducible demonstration, not new independent real-store evidence.',
                           'Future totals are fitted after evaluation using all supplied synthetic history; they are not stock-order recommendations.',
                           'Moving-average baselines may outperform XGBoost and remain visible. WAPE is error, not an accuracy percentage.']}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', required=True)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    try:
        result = evaluate_workbook(json.loads(Path(args.input).read_text()))
    except (ValueError, KeyError, TypeError) as error:
        print(str(error))
        raise SystemExit(2)
    Path(args.output).write_text(json.dumps(result, indent=2))
    print(json.dumps({'selected_method': result['selected_method'], 'part_count': result['part_count'], 'dataset_type': 'SIMULATED_DEMO'}))


if __name__ == '__main__':
    main()

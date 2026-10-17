#!/usr/bin/env python3
"""Reproducible historical audit; never changes sales dates or the live database."""
import argparse
import hashlib
import json
from pathlib import Path
import pandas as pd
from train_forecast import build_product_series, select_fresh_series, evaluate_horizon
from benchmark_raw_forecast import benchmark


def audit(csv_path, as_of_date):
    frame = pd.read_csv(csv_path, dtype={'Part Number': str})
    required = {'Date', 'Part Number', 'Demand Quantity'}
    if not required.issubset(frame.columns):
        raise ValueError('Use a CSV with Date, Part Number and Demand Quantity columns.')
    observations = [{'product_id': row['Part Number'], 'occurred_on': row['Date'], 'quantity': row['Demand Quantity']}
                    for row in frame.to_dict('records')]
    dates = pd.to_datetime(frame['Date'], errors='raise')
    if dates.max().normalize() > pd.Timestamp(as_of_date).normalize():
        raise ValueError('The audit contains future sales dates; review the originals instead of changing dates.')
    series, skipped = build_product_series(observations)
    ready_error = None
    try:
        fresh, stale = select_fresh_series(series, as_of_date)
    except ValueError as error:
        fresh, stale = {}, list(series)
        ready_error = str(error)
    result = {
        'as_of_date': as_of_date,
        'purpose': 'Historical accuracy audit on accepted recorded quantities; not live forecast accuracy.',
        'input_sha256': hashlib.sha256(Path(csv_path).read_bytes()).hexdigest(),
        'observation_rows': len(frame), 'products_with_recorded_quantities': int(frame['Part Number'].nunique()),
        'minimum_history_products': len(series), 'sparse_products': len(skipped),
        'fresh_eligible_products': len(fresh), 'stale_eligible_products': len(stale),
        'current_data_error': ready_error,
        'latest_recorded_sale': dates.max().date().isoformat(),
        'historical_product_summary': [
            {'part_number': pid, 'positive_days': int((s > 0).sum()), 'first_sale': s.index.min().date().isoformat(),
             'last_sale': s.index.max().date().isoformat(), 'recorded_units': float(s.sum())}
            for pid, s in series.items()
        ],
        'exploratory_comparison': benchmark(csv_path),
        'planning_period_validation': {str(h): evaluate_horizon(series, h) for h in [14, 30, 60, 90]},
        'production_accuracy_established': False,
        'limitations': [
            'The extract has actual quantities for accepted lines but does not establish complete sales coverage.',
            'Internal absent daily rows are assumed zero for historical comparisons, not verified zero demand.',
            'Stockout periods and missed customer requests were not supplied.',
            'Only parts meeting the history threshold before each validation origin are tested.',
            'Method comparison is exploratory; do not tune on these tests and reuse them as independent evidence.',
            'Synthetic runtime tests prove software behavior, not accuracy on the store data.'
        ]
    }
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--csv', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--as-of', default=pd.Timestamp.now(tz='Asia/Manila').date().isoformat())
    args = parser.parse_args()
    result = audit(args.csv, args.as_of)
    output = Path(args.output); output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, indent=2), encoding='utf-8')
    print(json.dumps({k: v for k, v in result.items() if k not in ['exploratory_comparison', 'planning_period_validation']}, indent=2))


if __name__ == '__main__':
    main()

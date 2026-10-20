#!/usr/bin/env python3
"""Exploratory comparisons of recorded units, never a claim of complete sales coverage."""
import argparse
from datetime import timedelta
import json
from pathlib import Path
import numpy as np
import pandas as pd
from train_forecast import build_product_series, make_features, train_model, row_for_next_date, safe_wape
from intermittent import croston_sba, tsb


def errors(actual, predicted):
    actual, predicted = np.asarray(actual, dtype=float), np.asarray(predicted, dtype=float)
    wape = safe_wape(actual, predicted)
    return {'mae': round(float(np.abs(actual - predicted).mean()), 5),
            'rmse': round(float(np.sqrt(np.mean((actual - predicted) ** 2))), 5),
            'wape_percent': round(wape, 3) if wape is not None else None,
            'bias': round(float((predicted - actual).mean()), 5),
            'actual_recorded_units': round(float(actual.sum()), 3), 'predicted_units': round(float(predicted.sum()), 3)}


def benchmark(csv_path):
    df = pd.read_csv(csv_path, dtype={'Part Number': str})
    observations = [{'product_id': row['Part Number'], 'occurred_on': row['Date'], 'quantity': row['Demand Quantity']} for row in df.to_dict('records')]
    series, skipped = build_product_series(observations)
    features, codes = make_features(series)
    methods, fitted = {}, {}
    for label, weight in [('XGBoost_previous_positive_weight_4', 4.0), ('XGBoost_equal_weight', 1.0)]:
        model, metrics, cols = train_model(features, positive_weight=weight, refit=False)
        fitted[label] = model
        methods[label] = metrics
    first, last = methods['XGBoost_equal_weight']['evaluation_start'], methods['XGBoost_equal_weight']['evaluation_end']
    test = features[features.date >= pd.Timestamp(first)]
    y = test.y.to_numpy()
    methods['recent_average_28'] = errors(y, test.roll_mean_28.to_numpy())
    methods['zero_diagnostic'] = errors(y, np.zeros(len(test)))
    daily_predictions = {'Croston_SBA': [], 'TSB': []}
    for row in test.itertuples():
        history = series[row.product_id].loc[series[row.product_id].index < row.date].tolist()
        daily_predictions['Croston_SBA'].append(croston_sba(history))
        daily_predictions['TSB'].append(tsb(history))
    for method, pred in daily_predictions.items():
        methods[method] = errors(y, pred)



    totals = {label: [] for label in [*fitted, 'recent_average_28', 'Croston_SBA', 'TSB', 'zero_diagnostic']}
    targets, block_rows = [], []
    for start in pd.date_range(first, last, freq='30D'):
        end = pd.Timestamp(start.to_pydatetime() + timedelta(days=29))
        for pid, s in series.items():
            if s.index.min() >= start or s.index.max() < end:
                continue
            history = s.loc[s.index < start].tolist()
            if len(history) < 28:
                continue
            actual = float(s.loc[start:end].sum())
            targets.append(actual)
            values = {'recent_average_28': float(np.mean(history[-28:])) * 30,
                      'Croston_SBA': croston_sba(history) * 30, 'TSB': tsb(history) * 30, 'zero_diagnostic': 0.0}
            for label, model in fitted.items():
                buffer, forecast_total = history.copy(), 0.0
                events = (np.asarray(history) > 0).astype(float).tolist()
                for step in range(30):
                    day = pd.Timestamp(start.to_pydatetime() + timedelta(days=step))
                    x = pd.DataFrame([row_for_next_date(codes[pid], buffer, day, len(history) + step, events)])[cols]
                    prediction = max(0.0, float(model.predict(x)[0]))
                    prediction = 0.0 if prediction < 0.005 else prediction
                    forecast_total += prediction
                    buffer.append(prediction)
                    events.append(0.0)
                values[label] = forecast_total
            for label, prediction in values.items():
                totals[label].append(prediction)
            block_rows.append({'part_number': pid, 'start': start.date().isoformat(), 'end': end.date().isoformat(),
                               'actual_recorded_units': actual, 'predictions': values})
    return {'purpose': 'Exploratory historical comparison on accepted recorded quantities.',
            'production_ready': False, 'eligible_products': sorted(series), 'skipped_sparse_products': len(skipped),
            'historical_evaluation_start': first, 'historical_evaluation_end': last,
            'test_days_with_recorded_demand': int((y > 0).sum()), 'test_rows': len(test),
            'daily_one_step_methods': methods,
            'blocked_30_day_methods': {label: errors(targets, preds) for label, preds in totals.items()} if targets else {},
            'blocked_30_day_count': len(targets), 'blocked_30_day_nonzero_count': sum(value > 0 for value in targets),
            'baseline_parameters': {'Croston_SBA_alpha': 0.1, 'Croston_single_event': 'exposure-rate fallback', 'TSB_size_alpha': 0.1, 'TSB_probability_alpha': 0.01},
            'blocks': block_rows,
            'limitations': [
                'Missing daily rows were assumed zero for this exploratory comparison; that assumption is unverified.',
                'Two sparse historical parts cannot demonstrate accuracy across the current inventory.',
                'Holdout dates are historical; this does not create current production forecasts.',
                'Method comparisons share a holdout and are exploratory. A fresh independent holdout is needed before choosing a method.',
                'Zero is a diagnostic for sparse data, not a replenishment policy.'
            ]}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--csv', required=True)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    result = benchmark(args.csv)
    Path(args.output).write_text(json.dumps(result, indent=2))
    print(json.dumps({key: value for key, value in result.items() if key not in ('blocks', 'daily_one_step_methods')}, indent=2))


if __name__ == '__main__':
    main()

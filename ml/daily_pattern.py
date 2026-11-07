"""Learn relative daily expectations from past sales; preserve XGBoost period totals."""
from decimal import Decimal, localcontext
import json
from typing import NamedTuple
import numpy as np
import pandas as pd
from train_forecast import feature_columns, row_for_next_date, MAX_FORECAST_GAP_DAYS
from period_forecast import fit_period, predict_period, MAX_TRAINING_ROWS, MIN_PERIOD_ROWS

STRATEGY = 'direct_period_with_learned_daily_profile'
MODEL_PREFIX = 'xgb-pattern-period-'
EXTRA_COLUMNS = ['forecast_gap_days', 'lead_days', 'cadence_days', 'cadence_consistency',
                 'cycle_distance', 'recent_event_size']
COLUMNS = feature_columns() + EXTRA_COLUMNS


class HistoryState(NamedTuple):
    code: int
    values: np.ndarray
    gap: int
    cadence: float
    consistency: float
    event_size: float
    last: pd.Timestamp
    features: dict
    scale: float


def history_state(code, source, origin):
    source = source.loc[source.index <= pd.Timestamp(origin)]
    values = source.to_numpy(dtype=float)
    events = np.flatnonzero(values > 0)
    if len(events) < 5:
        return None
    observed = values[:events[-1] + 1]
    last = source.index[events[-1]]
    gap = int((pd.Timestamp(origin) - last).days)
    if not 0 <= gap <= MAX_FORECAST_GAP_DAYS:
        return None
    intervals = np.diff(events[-13:])
    cadence = float(np.median(intervals))
    features = row_for_next_date(code, observed, last + pd.Timedelta(days=gap + 1), len(observed) + gap + 1)
    return HistoryState(code, observed, gap, cadence, float(np.mean(np.abs(intervals - cadence) <= 1)),
                        float(np.mean(values[events[-5:]])), last, features,
                        max(1.0, float(np.mean(observed[-90:]))))


def daily_features(state, lead, calendar=None):
    row = state.features.copy()
    if calendar is None:
        date = state.last + pd.Timedelta(days=state.gap + lead)
        calendar = {'dow':date.dayofweek, 'dom':date.day, 'month':date.month,
                    'week':int(date.isocalendar().week), 'is_weekend':int(date.dayofweek >= 5)}
    row.update(calendar)
    phase = (state.gap + lead) % state.cadence
    row.update(days_from_start=len(state.values) + state.gap + lead,
               forecast_gap_days=state.gap, lead_days=lead, cadence_days=state.cadence,
               cadence_consistency=state.consistency,
               cycle_distance=min(phase, state.cadence - phase) / state.cadence,
               recent_event_size=state.event_size)
    return row


def fit_daily_profile(histories, codes, horizon):
    from xgboost import XGBRegressor
    records, targets, part_ids = [], [], []
    budget = max(1, MAX_TRAINING_ROWS // max(1, len(codes)))
    for pid in sorted(codes):
        series = histories[pid]
        values = series.to_numpy(dtype=float)
        calendar = [{'dow':int(dow), 'dom':int(dom), 'month':int(month), 'week':int(week), 'is_weekend':int(dow >= 5)}
                    for dow,dom,month,week in zip(series.index.dayofweek, series.index.day, series.index.month, series.index.isocalendar().week)]
        origins = np.arange(35, len(series) - horizon, 3)
        combinations = len(origins) * horizon
        if not combinations:
            continue
        selected = np.sort(np.random.default_rng(42).choice(combinations, min(combinations, budget), replace=False))
        states = {}
        for sample in selected:
            position, lead = int(origins[sample // horizon]), int(sample % horizon) + 1
            if position not in states:
                states[position] = history_state(codes[pid], series.iloc[:position + 1], series.index[position])
            state = states[position]
            if state is None:
                continue
            records.append(daily_features(state, lead, calendar[position + lead]))
            targets.append(float(values[position + lead]) / state.scale)
            part_ids.append(pid)
    if len(records) > MAX_TRAINING_ROWS:
        chosen = np.linspace(0, len(records) - 1, MAX_TRAINING_ROWS, dtype=int)
        records, targets, part_ids = ([records[i] for i in chosen], [targets[i] for i in chosen], [part_ids[i] for i in chosen])
    if len(records) < MIN_PERIOD_ROWS or not any(value > 0 for value in targets):
        return None, set(), len(records)
    model = XGBRegressor(n_estimators=200, max_depth=3, learning_rate=0.04, min_child_weight=3,
                         reg_alpha=0.1, reg_lambda=10, objective='reg:tweedie', tweedie_variance_power=1.35,
                         random_state=42, n_jobs=2)
    model.fit(pd.DataFrame(records, columns=COLUMNS), np.asarray(targets))
    return model, set(part_ids), len(records)


def allocate_ticks(total_ticks, weights):
    weights = np.asarray(weights, dtype=float)
    if weights.ndim != 1 or not len(weights) or not np.isfinite(weights).all() or (weights < 0).any():
        raise ValueError('The daily-pattern model returned invalid estimates.')
    if not weights.any():
        weights = np.ones(len(weights))
    with localcontext() as context:
        context.prec = 40
        numbers = [Decimal(str(float(value))) for value in weights]
        denominator = sum(numbers)
        shares = [Decimal(total_ticks) * value / denominator for value in numbers]
        ticks = [int(value) for value in shares]
        remainder = total_ticks - sum(ticks)
        order = sorted(range(len(ticks)), key=lambda i: (-(shares[i] - ticks[i]), i))
        for i in order[:remainder]:
            ticks[i] += 1
    if sum(ticks) != total_ticks or any(value < 0 or value >= 10**14 for value in ticks):
        raise ValueError('The daily estimate exceeds the supported quantity range. Review the source quantities.')
    return [value / 10000 for value in ticks]


def fit_pattern_forecast(series_by_product, horizon, origin):
    model, histories, gaps, codes, count = fit_period(series_by_product, horizon, origin)
    uniform = predict_period(model, histories, gaps, codes, horizon, origin)
    profile, represented, profile_rows = fit_daily_profile(histories, codes, horizon)
    results, modes = [], {}
    for pid in sorted(codes):
        rows = [row for row in uniform if row['product_id'] == pid]
        total_ticks = sum(int(round(row['predicted_quantity'] * 10000)) for row in rows)
        state = history_state(codes[pid], histories[pid], origin)
        weights = np.ones(horizon)
        modes[pid] = 'uniform_fallback_insufficient_daily_targets'
        if profile is not None and pid in represented and state is not None:
            weights = np.asarray(profile.predict(pd.DataFrame([daily_features(state, day) for day in range(1, horizon + 1)], columns=COLUMNS)), dtype=float)
            if weights.shape != (horizon,) or not np.isfinite(weights).all():
                raise ValueError('The daily-pattern model returned invalid estimates.')
            weights = np.maximum(0, weights)
            modes[pid] = 'learned_daily_profile' if weights.any() else 'uniform_fallback_zero_profile'
        quantities = allocate_ticks(total_ticks, weights)
        results.extend({**row, 'predicted_quantity':quantity} for row,quantity in zip(rows, quantities))
    attrs = {'forecast_strategy':STRATEGY, 'daily_profile_features':json.dumps(COLUMNS),
             'daily_profile_product_modes':json.dumps(modes, sort_keys=True),
             'daily_profile_training_rows':str(profile_rows), 'prediction_feedback':'none'}
    if profile is not None:
        attrs['daily_profile_model'] = profile.get_booster().save_raw(raw_format='json').decode('utf-8')
    model.get_booster().set_attr(**attrs)
    return model, histories, gaps, codes, count, results, {'training_rows':profile_rows, 'product_modes':modes}


def pattern_forecast(series_by_product, horizon, origin):
    return fit_pattern_forecast(series_by_product, horizon, origin)[5]

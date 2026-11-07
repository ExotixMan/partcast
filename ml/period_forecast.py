"""Direct XGBoost period totals from observed history; no prediction feedback."""
from datetime import timedelta
import json
import numpy as np
import pandas as pd
from train_forecast import feature_columns, row_for_next_date, MIN_SPAN_DAYS, MIN_NONZERO_DAYS, MAX_FORECAST_GAP_DAYS

MAX_TRAINING_ROWS = 20000
MIN_PERIOD_ROWS = 20


def observed_history(series_by_product, origin):
    origin = pd.Timestamp(origin).normalize()
    histories, gaps = {}, {}
    for pid, source in series_by_product.items():
        available = source.loc[source.index <= origin]
        positive = available.loc[available > 0]
        if positive.empty:
            continue
        history = available.loc[:positive.index[-1]]
        gap = int((origin - history.index[-1]).days)
        if len(history) >= MIN_SPAN_DAYS and len(positive) >= MIN_NONZERO_DAYS and 0 <= gap <= MAX_FORECAST_GAP_DAYS:
            histories[pid], gaps[pid] = history, gap
    return histories, gaps


def context(code, values, start, gap):
    row = row_for_next_date(code, values, start, len(values) + gap)
    row['forecast_gap_days'] = gap
    return row


def volume_scale(values, horizon):
    return max(1.0, float(np.mean(values[-90:])) * horizon)


def training_rows(histories, gaps, horizon, stride):
    codes = {pid:i for i,pid in enumerate(sorted(histories))}
    columns = feature_columns() + ['forecast_gap_days']
    records, targets, ends, part_ids = [], [], [], []
    for pid in codes:
        series = histories[pid]
        values = series.to_numpy(dtype=float)
        cumulative = np.concatenate(([0.0], np.cumsum(values)))
        gap = gaps[pid]
        last_position = len(values) - horizon - gap - 1
        positions = list(range(28, last_position + 1, stride))
        if positions and positions[-1] != last_position:
            positions.append(last_position)
        budget = max(1, MAX_TRAINING_ROWS // max(1, len(codes)))
        if len(positions) > budget:
            positions = [positions[i] for i in np.linspace(0, len(positions)-1, budget, dtype=int)]
        for position in positions:
            past = values[:position + 1]
            start = position + gap + 1
            end = start + horizon
            records.append(context(codes[pid], past, series.index[start], gap))
            targets.append(float(cumulative[end] - cumulative[start]) / volume_scale(past, horizon))
            ends.append(series.index[end - 1])
            part_ids.append(pid)
    if len(records) > MAX_TRAINING_ROWS:
        selected = np.linspace(0, len(records)-1, MAX_TRAINING_ROWS, dtype=int)
        records = [records[i] for i in selected]
        targets = [targets[i] for i in selected]
        ends = [ends[i] for i in selected]
        part_ids = [part_ids[i] for i in selected]
    return pd.DataFrame(records, columns=columns), np.asarray(targets), codes, ends, part_ids


def fit_period(series_by_product, horizon, origin):
    from xgboost import XGBRegressor
    histories, gaps = observed_history(series_by_product, origin)
    frame, target, codes, ends, ids = training_rows(histories, gaps, horizon, 7)
    if len(frame) < MIN_PERIOD_ROWS:
        frame, target, codes, ends, ids = training_rows(histories, gaps, horizon, 1)
    if len(frame) < MIN_PERIOD_ROWS:
        raise ValueError('Not enough completed historical periods for this planning horizon. Use a shorter period or add verified dated sales.')
    represented = set(ids)
    valid_codes = {pid:code for pid,code in codes.items() if pid in represented}
    model = XGBRegressor(n_estimators=200, max_depth=3, learning_rate=0.04,
                         min_child_weight=3, subsample=1.0, colsample_bytree=1.0,
                         reg_alpha=0.1, reg_lambda=10, objective='reg:tweedie',
                         tweedie_variance_power=1.35, eval_metric='mae', random_state=42, n_jobs=2)
    model.fit(frame, target)
    model.get_booster().set_attr(forecast_strategy='direct_period_expected_daily_average',
                                horizon_days=str(horizon), prediction_feedback='none',
                                volume_normalization='past_90_day_mean_times_horizon',
                                product_codes=json.dumps(valid_codes,sort_keys=True),
                                history_cutoffs=json.dumps({pid:str(histories[pid].index[-1].date()) for pid in valid_codes},sort_keys=True))
    return model, histories, gaps, valid_codes, len(frame)


def predict_period(model, histories, gaps, codes, horizon, origin):
    origin = pd.Timestamp(origin).normalize()
    ids = sorted(codes)
    columns = feature_columns() + ['forecast_gap_days']
    rows = [context(codes[pid], histories[pid].to_numpy(dtype=float), origin + timedelta(days=1), gaps[pid]) for pid in ids]
    estimates = np.asarray(model.predict(pd.DataFrame(rows)[columns]), dtype=float)
    if estimates.shape != (len(ids),) or not np.isfinite(estimates).all():
        raise ValueError('The period model returned invalid estimates.')
    results = []
    for pid, ratio in zip(ids, estimates):
        total = round(max(0.0, float(ratio)) * volume_scale(histories[pid].to_numpy(dtype=float), horizon), 4)
        if not np.isfinite(total) or total / horizon >= 1e10:
            raise ValueError('The period estimate exceeds the supported quantity range. Review the source quantities before forecasting.')
        amount, remainder = divmod(int(round(total * 10000)), horizon)
        if amount + int(remainder > 0) >= 10**14:
            raise ValueError('The period estimate exceeds the supported quantity range. Review the source quantities before forecasting.')
        for day in range(1, horizon + 1):
            quantity = (amount + int(day <= remainder)) / 10000
            results.append({'product_id':pid, 'forecast_date':(origin + timedelta(days=day)).date().isoformat(),
                            'predicted_quantity':round(float(quantity), 4)})
    return results


def direct_forecast(series_by_product, horizon, origin):
    model, histories, gaps, codes, count = fit_period(series_by_product, horizon, origin)
    return predict_period(model, histories, gaps, codes, horizon, origin)


def check_period_history(series_by_product, horizon, origin):
    histories, gaps = observed_history(series_by_product, origin)
    frame, target, codes, ends, ids = training_rows(histories, gaps, horizon, 7)
    if len(frame) < MIN_PERIOD_ROWS:
        frame, target, codes, ends, ids = training_rows(histories, gaps, horizon, 1)
    return {'ready':len(frame) >= MIN_PERIOD_ROWS, 'period_training_rows':len(frame),
            'period_eligible_product_count':len(set(ids)), 'minimum_period_rows':MIN_PERIOD_ROWS}

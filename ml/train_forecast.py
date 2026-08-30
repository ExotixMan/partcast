#!/usr/bin/env python3
import argparse
import json
from pathlib import Path
import warnings

import numpy as np
import pandas as pd
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from xgboost import XGBRegressor

warnings.filterwarnings("ignore", category=FutureWarning)

LAGS = [1, 7, 14, 28]
ROLLS = [7, 14, 28]
EVENT_WINDOWS = [7, 28, 90]
MIN_SPAN_DAYS = 35
MIN_NONZERO_DAYS = 5


def safe_mape(y_true, y_pred):
    y_true = np.asarray(y_true, dtype=float)
    y_pred = np.asarray(y_pred, dtype=float)
    mask = y_true != 0
    if not mask.any():
        return None
    return float(np.mean(np.abs((y_true[mask] - y_pred[mask]) / y_true[mask])) * 100)


def safe_wape(y_true, y_pred):
    y_true = np.asarray(y_true, dtype=float)
    y_pred = np.asarray(y_pred, dtype=float)
    denom = float(np.abs(y_true).sum())
    if denom <= 0:
        return None
    return float(np.abs(y_true - y_pred).sum() / denom * 100)


def build_product_series(observations):
    df = pd.DataFrame(observations)
    if df.empty:
        raise ValueError("No demand observations were provided.")
    required = {"product_id", "occurred_on", "quantity"}
    if not required.issubset(df.columns):
        raise ValueError("Demand observations are missing required fields.")

    df["occurred_on"] = pd.to_datetime(df["occurred_on"], errors="coerce")
    df["quantity"] = pd.to_numeric(df["quantity"], errors="coerce")
    df = df.dropna(subset=["product_id", "occurred_on", "quantity"])
    df = df[df["quantity"] > 0]
    daily = df.groupby(["product_id", "occurred_on"], as_index=False)["quantity"].sum()

    series = {}
    skipped = []
    for product_id, group in daily.groupby("product_id"):
        group = group.sort_values("occurred_on").set_index("occurred_on")
        start, end = group.index.min(), group.index.max()
        span = int((end - start).days) + 1
        nonzero_days = int((group["quantity"] > 0).sum())
        if span < MIN_SPAN_DAYS or nonzero_days < MIN_NONZERO_DAYS:
            skipped.append(str(product_id))
            continue
        idx = pd.date_range(start, end, freq="D")
        s = group["quantity"].reindex(idx, fill_value=0.0).astype(float)
        series[str(product_id)] = s
    if not series:
        raise ValueError(
            "No products have enough usable history. A product needs at least 5 observed demand days and about 35 days between its first and latest observation."
        )
    return series, skipped


def add_days_since_demand(frame):
    last_event_index = -1
    values = frame["y"].to_numpy(dtype=float)
    output = np.zeros(len(frame), dtype=float)
    for i, value in enumerate(values):
        if value > 0:
            last_event_index = i
            output[i] = 0
        else:
            output[i] = (i - last_event_index) if last_event_index >= 0 else i + 1
    frame["days_since_demand"] = output


def make_features(series_by_product):
    frames = []
    product_codes = {pid: i for i, pid in enumerate(sorted(series_by_product.keys()))}
    for pid, s in series_by_product.items():
        frame = pd.DataFrame({"date": s.index, "y": s.values})
        frame["product_id"] = pid
        frame["product_code"] = product_codes[pid]
        frame["dow"] = frame["date"].dt.dayofweek
        frame["dom"] = frame["date"].dt.day
        frame["month"] = frame["date"].dt.month
        frame["week"] = frame["date"].dt.isocalendar().week.astype(int)
        frame["is_weekend"] = (frame["dow"] >= 5).astype(int)
        frame["days_from_start"] = np.arange(len(frame), dtype=float)
        add_days_since_demand(frame)

        for lag in LAGS:
            frame[f"lag_{lag}"] = frame["y"].shift(lag)
        shifted = frame["y"].shift(1)
        shifted_event = (shifted > 0).astype(float)
        for window in ROLLS:
            frame[f"roll_mean_{window}"] = shifted.rolling(window, min_periods=1).mean()
            frame[f"roll_std_{window}"] = shifted.rolling(window, min_periods=2).std().fillna(0)
        for window in EVENT_WINDOWS:
            frame[f"event_count_{window}"] = shifted_event.rolling(window, min_periods=1).sum()
            frame[f"event_rate_{window}"] = shifted_event.rolling(window, min_periods=1).mean()
        frames.append(frame)

    full = pd.concat(frames, ignore_index=True).dropna().sort_values(["date", "product_code"])
    if len(full) < 30:
        raise ValueError("Not enough feature rows after creating lag and rolling-window features.")
    return full, product_codes


def feature_columns():
    return [
        "product_code", "dow", "dom", "month", "week", "is_weekend", "days_from_start", "days_since_demand",
        *[f"lag_{x}" for x in LAGS],
        *[f"roll_mean_{x}" for x in ROLLS],
        *[f"roll_std_{x}" for x in ROLLS],
        *[f"event_count_{x}" for x in EVENT_WINDOWS],
        *[f"event_rate_{x}" for x in EVENT_WINDOWS],
    ]


def train_model(feature_df):
    cols = feature_columns()
    unique_dates = np.array(sorted(feature_df["date"].dt.normalize().unique()))
    if len(unique_dates) >= 10:
        split_index = max(1, int(len(unique_dates) * 0.8))
        split_date = pd.Timestamp(unique_dates[min(split_index, len(unique_dates) - 1)])
        train = feature_df[feature_df["date"] < split_date]
        test = feature_df[feature_df["date"] >= split_date]
    else:
        split = max(1, int(len(feature_df) * 0.8))
        train, test = feature_df.iloc[:split], feature_df.iloc[split:]

    if len(train) < 20 or len(test) < 5:
        split = max(20, int(len(feature_df) * 0.8))
        split = min(split, len(feature_df) - 5)
        train, test = feature_df.iloc[:split], feature_df.iloc[split:]

    model = XGBRegressor(
        n_estimators=320,
        max_depth=5,
        learning_rate=0.04,
        min_child_weight=2,
        subsample=0.9,
        colsample_bytree=0.9,
        reg_alpha=0.08,
        reg_lambda=1.2,
        objective="reg:tweedie",
        tweedie_variance_power=1.35,
        eval_metric="mae",
        random_state=42,
        n_jobs=2,
    )
    train_weights = np.where(train["y"].to_numpy(dtype=float) > 0, 4.0, 1.0)
    model.fit(train[cols], train["y"], sample_weight=train_weights)
    pred = np.maximum(0, model.predict(test[cols]))
    y_true = test["y"].to_numpy(dtype=float)
    rmse = float(np.sqrt(mean_squared_error(y_true, pred)))
    mape = safe_mape(y_true, pred)
    wape = safe_wape(y_true, pred)
    metrics = {
        "mae": round(float(mean_absolute_error(y_true, pred)), 4),
        "rmse": round(rmse, 4),
        "r2": round(float(r2_score(y_true, pred)), 4) if len(set(y_true.tolist())) > 1 else None,
        "mape_percent": round(mape, 4) if mape is not None else None,
        "wape_percent": round(wape, 4) if wape is not None else None,
        "bias": round(float(np.mean(pred - y_true)), 4),
        "train_rows": int(len(train)),
        "test_rows": int(len(test)),
        "nonzero_train_rows": int((train["y"] > 0).sum()),
        "nonzero_test_rows": int((test["y"] > 0).sum()),
    }
    all_weights = np.where(feature_df["y"].to_numpy(dtype=float) > 0, 4.0, 1.0)
    model.fit(feature_df[cols], feature_df["y"], sample_weight=all_weights)
    return model, metrics, cols


def current_days_since_demand(history):
    for idx, value in enumerate(reversed(history)):
        if value > 0:
            return idx
    return len(history)


def row_for_next_date(code, history, next_date, days_from_start):
    values = np.asarray(history, dtype=float)
    row = {
        "product_code": code,
        "dow": next_date.dayofweek,
        "dom": next_date.day,
        "month": next_date.month,
        "week": int(next_date.isocalendar().week),
        "is_weekend": int(next_date.dayofweek >= 5),
        "days_from_start": float(days_from_start),
        "days_since_demand": float(current_days_since_demand(history)),
    }
    for lag in LAGS:
        row[f"lag_{lag}"] = float(values[-lag]) if len(values) >= lag else 0.0
    for window in ROLLS:
        tail = values[-window:] if len(values) >= window else values
        row[f"roll_mean_{window}"] = float(np.mean(tail)) if len(tail) else 0.0
        row[f"roll_std_{window}"] = float(np.std(tail)) if len(tail) else 0.0
    for window in EVENT_WINDOWS:
        tail = values[-window:] if len(values) >= window else values
        events = (tail > 0).astype(float) if len(tail) else np.asarray([], dtype=float)
        row[f"event_count_{window}"] = float(events.sum()) if len(events) else 0.0
        row[f"event_rate_{window}"] = float(events.mean()) if len(events) else 0.0
    return row


def forecast(model, cols, series_by_product, product_codes, horizon_days):
    results = []
    today = pd.Timestamp.today().normalize()
    for pid, original in series_by_product.items():
        history = original.astype(float).tolist()
        last_date = pd.Timestamp(original.index.max()).normalize()

        # Bridge a stale dataset to today with explicit zero-demand days instead of recursive synthetic predictions.
        # This keeps lag/event features stable and avoids prediction drift across long historical gaps.
        if last_date < today:
            gap_days = int((today - last_date).days)
            history.extend([0.0] * gap_days)
            last_date = today

        next_date = last_date + pd.Timedelta(days=1)
        base_index = len(history)
        for step in range(horizon_days):
            row = row_for_next_date(product_codes[pid], history, next_date, base_index + step)
            x = pd.DataFrame([row])[cols]
            yhat = max(0.0, float(model.predict(x)[0]))
            yhat = 0.0 if yhat < 0.005 else yhat
            results.append({
                "product_id": pid,
                "forecast_date": next_date.date().isoformat(),
                "predicted_quantity": round(yhat, 4),
            })
            history.append(yhat)
            next_date += pd.Timedelta(days=1)
    return results


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--model-out", required=True)
    args = parser.parse_args()

    payload = json.loads(Path(args.input).read_text(encoding="utf-8"))
    horizon = int(payload.get("horizonDays", 30))
    horizon = min(90, max(7, horizon))
    observations = payload.get("observations", [])

    series_by_product, skipped_products = build_product_series(observations)
    features, product_codes = make_features(series_by_product)
    model, metrics, cols = train_model(features)
    forecasts = forecast(model, cols, series_by_product, product_codes, horizon)
    model.save_model(args.model_out)

    source_dates = pd.to_datetime([x["occurred_on"] for x in observations], errors="coerce").dropna()
    output = {
        "model_version": f"xgb-intermittent-{pd.Timestamp.utcnow().strftime('%Y%m%dT%H%M%SZ')}",
        "metrics": metrics,
        "training_date_min": source_dates.min().date().isoformat() if len(source_dates) else None,
        "training_date_max": source_dates.max().date().isoformat() if len(source_dates) else None,
        "forecast_product_count": len(series_by_product),
        "skipped_product_count": len(skipped_products),
        "forecast_horizon_days": horizon,
        "forecasts": forecasts,
    }
    Path(args.output).write_text(json.dumps(output), encoding="utf-8")
    print(json.dumps({"ok": True, "forecast_rows": len(forecasts), "products": len(series_by_product), "metrics": metrics}))


if __name__ == "__main__":
    main()

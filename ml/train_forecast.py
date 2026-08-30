#!/usr/bin/env python3
import argparse
import json
from pathlib import Path
from datetime import timedelta
import warnings

import numpy as np
import pandas as pd
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from xgboost import XGBRegressor

warnings.filterwarnings("ignore", category=FutureWarning)

LAGS = [1, 7, 14, 28]
ROLLS = [7, 14, 28]


def safe_mape(y_true, y_pred):
    y_true = np.asarray(y_true, dtype=float)
    y_pred = np.asarray(y_pred, dtype=float)
    mask = y_true != 0
    if not mask.any():
        return None
    return float(np.mean(np.abs((y_true[mask] - y_pred[mask]) / y_true[mask])) * 100)


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
    for product_id, group in daily.groupby("product_id"):
        group = group.sort_values("occurred_on").set_index("occurred_on")
        start, end = group.index.min(), group.index.max()
        idx = pd.date_range(start, end, freq="D")
        s = group["quantity"].reindex(idx, fill_value=0.0).astype(float)
        if len(s) >= 35:
            series[str(product_id)] = s
    if not series:
        raise ValueError("Not enough dated demand history. At least one product needs about 35 days between its first and latest observation.")
    return series


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
        for lag in LAGS:
            frame[f"lag_{lag}"] = frame["y"].shift(lag)
        shifted = frame["y"].shift(1)
        for window in ROLLS:
            frame[f"roll_mean_{window}"] = shifted.rolling(window).mean()
            frame[f"roll_std_{window}"] = shifted.rolling(window).std().fillna(0)
        frames.append(frame)
    full = pd.concat(frames, ignore_index=True).dropna().sort_values("date")
    if len(full) < 30:
        raise ValueError("Not enough feature rows after creating lag and rolling-window features.")
    return full, product_codes


def train_model(feature_df):
    feature_cols = [
        "product_code", "dow", "dom", "month", "week", "is_weekend",
        *[f"lag_{x}" for x in LAGS],
        *[f"roll_mean_{x}" for x in ROLLS],
        *[f"roll_std_{x}" for x in ROLLS],
    ]
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
        n_estimators=350,
        max_depth=6,
        learning_rate=0.045,
        subsample=0.9,
        colsample_bytree=0.9,
        reg_alpha=0.05,
        reg_lambda=1.0,
        objective="reg:squarederror",
        eval_metric="mae",
        random_state=42,
        n_jobs=2,
    )
    model.fit(train[feature_cols], train["y"])
    pred = np.maximum(0, model.predict(test[feature_cols]))
    y_true = test["y"].to_numpy(dtype=float)
    rmse = float(np.sqrt(mean_squared_error(y_true, pred)))
    metrics = {
        "mae": round(float(mean_absolute_error(y_true, pred)), 4),
        "rmse": round(rmse, 4),
        "r2": round(float(r2_score(y_true, pred)), 4) if len(set(y_true.tolist())) > 1 else None,
        "mape_percent": round(safe_mape(y_true, pred), 4) if safe_mape(y_true, pred) is not None else None,
        "train_rows": int(len(train)),
        "test_rows": int(len(test)),
    }
    # Refit on all available data for future forecasts.
    model.fit(feature_df[feature_cols], feature_df["y"])
    return model, metrics, feature_cols


def row_for_next_date(pid, code, history, next_date):
    values = np.asarray(history, dtype=float)
    row = {
        "product_code": code,
        "dow": next_date.dayofweek,
        "dom": next_date.day,
        "month": next_date.month,
        "week": int(next_date.isocalendar().week),
        "is_weekend": int(next_date.dayofweek >= 5),
    }
    for lag in LAGS:
        row[f"lag_{lag}"] = float(values[-lag]) if len(values) >= lag else 0.0
    for window in ROLLS:
        tail = values[-window:] if len(values) >= window else values
        row[f"roll_mean_{window}"] = float(np.mean(tail)) if len(tail) else 0.0
        row[f"roll_std_{window}"] = float(np.std(tail)) if len(tail) else 0.0
    return row


def forecast(model, feature_cols, series_by_product, product_codes, horizon_days):
    results = []
    for pid, original in series_by_product.items():
        history = original.astype(float).tolist()
        last_date = pd.Timestamp(original.index.max())
        # If the last historical date is old, roll forward until today without storing those bridge predictions.
        today = pd.Timestamp.today().normalize()
        bridge_end = max(last_date, today)
        next_date = last_date + pd.Timedelta(days=1)
        while next_date <= bridge_end:
            row = row_for_next_date(pid, product_codes[pid], history, next_date)
            x = pd.DataFrame([row])[feature_cols]
            yhat = max(0.0, float(model.predict(x)[0]))
            history.append(yhat)
            next_date += pd.Timedelta(days=1)

        forecast_start = max(today, last_date) + pd.Timedelta(days=1)
        next_date = forecast_start
        for _ in range(horizon_days):
            row = row_for_next_date(pid, product_codes[pid], history, next_date)
            x = pd.DataFrame([row])[feature_cols]
            yhat = max(0.0, float(model.predict(x)[0]))
            # Keep useful precision but avoid tiny numerical noise.
            yhat = 0.0 if yhat < 0.01 else yhat
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

    series_by_product = build_product_series(observations)
    features, product_codes = make_features(series_by_product)
    model, metrics, feature_cols = train_model(features)
    forecasts = forecast(model, feature_cols, series_by_product, product_codes, horizon)
    model.save_model(args.model_out)

    source_dates = pd.to_datetime([x["occurred_on"] for x in observations], errors="coerce").dropna()
    output = {
        "model_version": f"xgb-{pd.Timestamp.utcnow().strftime('%Y%m%dT%H%M%SZ')}",
        "metrics": metrics,
        "training_date_min": source_dates.min().date().isoformat() if len(source_dates) else None,
        "training_date_max": source_dates.max().date().isoformat() if len(source_dates) else None,
        "forecast_product_count": len(series_by_product),
        "forecast_horizon_days": horizon,
        "forecasts": forecasts,
    }
    Path(args.output).write_text(json.dumps(output), encoding="utf-8")
    print(json.dumps({"ok": True, "forecast_rows": len(forecasts), "metrics": metrics}))


if __name__ == "__main__":
    main()

"""SIMULATED experiment: direct period targets avoid recursive event features.

No production model selection or database writes occur in this module.
"""
from datetime import timedelta

import numpy as np
import pandas as pd

from train_forecast import feature_columns, make_model, row_for_next_date


def period_training_rows(series_by_product, horizon, stride=7):
    codes = {pid: i for i, pid in enumerate(sorted(series_by_product))}
    rows, targets, target_ends = [], [], []
    for pid, series in series_by_product.items():
        values = series.to_numpy(dtype=float)
        for position in range(28, len(series) - horizon, stride):
            rows.append(row_for_next_date(codes[pid], values[:position + 1],
                                         series.index[position] + timedelta(days=1), position + 1))
            targets.append(float(values[position + 1:position + 1 + horizon].sum()))
            target_ends.append(series.index[position + horizon])
    if len(rows) < 20:
        raise ValueError("Not enough past complete periods for the direct simulated model.")
    return pd.DataFrame(rows)[feature_columns()], np.asarray(targets), codes, target_ends


def fit_period_model(series_by_product, horizon):
    features, targets, codes, _ = period_training_rows(series_by_product, horizon)
    model = make_model()
    model.fit(features, targets)
    model.get_booster().set_attr(dataset_type="SIMULATED_DEMO", forecast_strategy="direct_planning_period",
                                horizon_days=str(horizon), real_world_accuracy_established="false")
    return model, codes


def predict_period(model, codes, series_by_product, horizon, origin):
    origin = pd.Timestamp(origin).normalize()
    rows = []
    for pid in codes:
        history = series_by_product[pid]
        if history.index.max() != origin:
            raise ValueError("Direct simulated prediction requires a complete known calendar through its origin.")
        rows.append(row_for_next_date(codes[pid], history.to_numpy(), origin + timedelta(days=1), len(history)))
    quantities = np.asarray(model.predict(pd.DataFrame(rows)[feature_columns()]), dtype=float)
    if quantities.shape != (len(codes),) or not np.isfinite(quantities).all():
        raise ValueError("The direct model returned invalid period estimates.")
    results = []
    for pid, quantity in zip(codes, quantities):
        total = round(max(0.0, float(quantity)), 4)
        # These daily rows are an even allocation of a predicted period total,
        # not separately trained daily forecasts. Preserve the rounded total.
        amount = np.floor(total / horizon * 10000) / 10000
        for step in range(1, horizon + 1):
            results.append({"product_id": pid, "forecast_date": (origin + timedelta(days=step)).date().isoformat(),
                            "predicted_quantity": round(amount if step < horizon else total - amount * (horizon - 1), 4)})
    return results


def forecast_direct_period(series_by_product, horizon, origin):
    model, codes = fit_period_model(series_by_product, horizon)
    return predict_period(model, codes, series_by_product, horizon, origin)

"""Fixed, un-tuned reference forecasts for intermittent demand.

Only supplied historical observations update the estimators. An expected future
quantity is never treated as an observed sale or an observed zero-demand day.
"""
from datetime import timedelta

import numpy as np
import pandas as pd


def daily_rate(history, method="croston_sba", alpha=0.1, beta=0.01):
    values = np.asarray(history, dtype=float)
    if not 0 < alpha <= 1 or not 0 < beta <= 1:
        raise ValueError("Smoothing parameters must be greater than zero and at most one.")
    if values.ndim != 1 or not np.isfinite(values).all() or (values < 0).any():
        raise ValueError("Intermittent demand needs finite non-negative daily quantities.")
    if method not in {"croston_sba", "tsb"}:
        raise ValueError("Unknown intermittent-demand method.")
    events = np.flatnonzero(values > 0)
    if not len(events):
        return 0.0
    if method == "croston_sba":
        if len(events) == 1:
            # The extract starts at a sale; its first index is not a measured
            # interarrival. Preserve the exploratory benchmark's exposure fallback.
            return (1 - alpha / 2) * float(values[events[0]]) / len(values)
        size, interval = float(values[events[0]]), float(events[1] - events[0])
        previous = events[0]
        for event in events[1:]:
            size += alpha * (float(values[event]) - size)
            interval += alpha * (float(event - previous) - interval)
            previous = event
        return (1 - alpha / 2) * size / interval
    first = int(events[0])
    size, probability = float(values[first]), 1.0 / (first + 1)
    for value in values[first + 1:]:
        event = float(value > 0)
        probability += beta * (event - probability)
        if event:
            size += alpha * (float(value) - size)
    return size * probability


def croston_sba(history, alpha=0.1):
    return daily_rate(history, "croston_sba", alpha=alpha)


def tsb(history, size_alpha=0.1, probability_alpha=0.01):
    return daily_rate(history, "tsb", alpha=size_alpha, beta=probability_alpha)


def forecast_intermittent(series_by_product, horizon_days, origin, method):
    origin = pd.Timestamp(origin).normalize()
    results = []
    for pid, history in series_by_product.items():
        if history.empty or history.index.max() > origin:
            raise ValueError("Intermittent forecasts may only use observations available at their origin.")
        rate = daily_rate(history.to_numpy(), method)
        for step in range(1, horizon_days + 1):
            results.append({"product_id": pid,
                            "forecast_date": (origin + timedelta(days=step)).date().isoformat(),
                            "predicted_quantity": round(rate, 4)})
    return sorted(results, key=lambda row: (row["product_id"], row["forecast_date"]))

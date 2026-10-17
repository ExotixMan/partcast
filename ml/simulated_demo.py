#!/usr/bin/env python3
"""Standalone SIMULATED training exercise; never connects to the store database."""
import argparse
import csv
import hashlib
import json
from pathlib import Path

import numpy as np
import pandas as pd

from train_forecast import evaluate_horizon, feature_columns, forecast, make_features, make_model, total_errors
from direct_period_demo import fit_period_model, forecast_direct_period, predict_period
from compare_forecast_candidates import development_comparison

DATASET_TYPE = "SIMULATED_DEMO"
PROFILES = ("steady", "weekly", "intermittent", "changing_level")


def select_parts(catalog, count, seed):
    groups = {}
    for record in catalog:
        pid = record.get("part_number")
        if not isinstance(pid, str) or not pid.strip() or not record.get("description"):
            continue
        # Exact source identifiers, descriptions, brands and units are retained.
        item = {key: record.get(key) or "" for key in ("part_number", "description", "brand", "unit")}
        groups.setdefault(pid, []).append(item)
    candidates = [rows[0] for rows in groups.values() if all(row == rows[0] for row in rows)]
    if len(candidates) < count:
        raise ValueError(f"Need {count} unambiguous existing parts; found {len(candidates)}.")
    candidates.sort(key=lambda r: hashlib.sha256(f"{seed}|select|{r['part_number']}".encode()).hexdigest())
    return [{**r, "simulated_profile": PROFILES[i % len(PROFILES)]} for i, r in enumerate(candidates[:count])]


def generate_series(parts, days, as_of, seed):
    dates = pd.date_range(end=pd.Timestamp(as_of), periods=days, freq="D")
    series, assumptions = {}, {}
    for item in parts:
        pid, profile = item["part_number"], item["simulated_profile"]
        digest = hashlib.sha256(f"{seed}|demand|{pid}".encode()).digest()
        rng = np.random.default_rng(int.from_bytes(digest[:8], "big"))
        base = int(rng.integers(4, 11))
        if profile == "steady":
            expected = np.full(days, float(base))
            values = rng.poisson(expected)
            params = {"base_daily_rate": base, "distribution": "Poisson"}
        elif profile == "weekly":
            weekday = np.array([1.0, 1.1, 1.05, 1.15, 1.25, 0.8, 0.55])
            annual = 1 + .2 * np.sin(2 * np.pi * dates.dayofyear.to_numpy() / 365.25)
            expected = base * weekday[dates.dayofweek.to_numpy()] * annual
            values = rng.poisson(expected)
            params = {"base_daily_rate": base, "weekday_factors": weekday.tolist(), "annual_amplitude": .2,
                      "distribution": "Poisson with weekly/annual variation"}
        elif profile == "intermittent":
            events = rng.random(days) < .22
            values = events * (1 + rng.poisson(1.5, days))
            params = {"daily_event_probability": .22, "positive_quantity": "1 + Poisson(1.5)"}
        elif profile == "changing_level":
            change = int(days * .65)
            expected = np.full(days, float(base)); expected[change:] *= 1.4
            values = rng.poisson(expected)
            params = {"base_daily_rate": base, "change_at_day": change, "new_level_factor": 1.4,
                      "distribution": "Poisson with a persistent level increase"}
        else:
            raise ValueError("Unknown simulation profile.")
        series[pid] = pd.Series(values.astype(float), index=dates)
        assumptions[pid] = {"profile": profile, **params}
    return series, assumptions


def evaluate_demo(series, parts, horizon=30, period_forecaster=None):
    # Full synthetic calendar is known, including zero days. No production
    # history reconstruction is used to drop trailing zero-demand days.
    result = evaluate_horizon(series, horizon, max_origins=1, period_forecaster=period_forecaster)
    result["dataset_type"] = DATASET_TYPE
    result["evaluation_scope"] = "Final held-out simulated planning period; fixed XGBoost parameters."
    result["by_profile"] = {}
    for profile in PROFILES:
        ids = {r["part_number"] for r in parts if r["simulated_profile"] == profile}
        windows = [w for w in result["windows"] if w["product_id"] in ids]
        if windows:
            result["by_profile"][profile] = {
                "parts_tested": len(windows),
                "model": total_errors([w["actual_recorded_units"] for w in windows], [w["predicted_units"] for w in windows]),
                "recent_average": total_errors([w["actual_recorded_units"] for w in windows], [w["recent_average_units"] for w in windows]),
            }
    return result


def write_csv(path, rows, fields):
    with path.open("w", newline="", encoding="utf-8-sig") as stream:
        writer = csv.DictWriter(stream, fieldnames=fields)
        writer.writeheader()
        # Catalogue text is untrusted spreadsheet input. Protect CSV users.
        writer.writerows({k: ("'" + v if isinstance(v, str) and v.lstrip().startswith(("=", "+", "-", "@")) else v)
                          for k, v in row.items()} for row in rows)


def create_demo(catalog_payload, out, as_of, days=730, count=24, seed=20261015, horizon=30):
    parts = select_parts(catalog_payload["parts"], count, seed)
    series, assumptions = generate_series(parts, days, as_of, seed)
    evaluation = evaluate_demo(series, parts, horizon)
    direct_evaluation = evaluate_demo(series, parts, horizon, forecast_direct_period)
    selection = development_comparison(series, horizon, factories={"recursive_xgboost": make_model},
                                       period_forecasters={"direct_period_xgboost": forecast_direct_period})
    if evaluation["tested_product_count"] != count or evaluation["window_count"] != count:
        raise ValueError("Not every selected part could be evaluated. No partial demo score will be reported.")
    # Evaluation completes before a separate delivery model is fitted on all
    # synthetic history. Holdout labels never enter the evaluated model.
    features, codes = make_features(series)
    model = make_model()
    cols = feature_columns()
    model.fit(features[cols], features["y"])
    model.get_booster().set_attr(dataset_type=DATASET_TYPE, real_world_accuracy_established="false",
                                part_mapping=json.dumps(codes), trained_as_of=as_of)
    model.save_model(out / "SIMULATED_XGBoost_Model.json")
    forecasts = forecast(model, cols, series, codes, horizon, as_of)
    direct_model, direct_codes = fit_period_model(series, horizon)
    direct_model.get_booster().set_attr(part_mapping=json.dumps(direct_codes), trained_as_of=as_of)
    direct_model.save_model(out / "SIMULATED_Direct_XGBoost_Model.json")
    direct_forecasts = predict_period(direct_model, direct_codes, series, horizon, as_of)
    daily, observations = [], []
    profile_by_id = {r["part_number"]: r["simulated_profile"] for r in parts}
    for pid, values in series.items():
        for day, qty in values.items():
            daily.append({"Date": day.date().isoformat(), "Part Number": pid, "Demand Quantity": int(qty),
                          "Data Type": DATASET_TYPE, "Simulated Profile": profile_by_id[pid]})
            observations.append({"product_id": pid, "occurred_on": day.date().isoformat(),
                                 "quantity": int(qty), "source": "simulated_demo"})
    summary = {
        "dataset_type": DATASET_TYPE, "seed": seed, "as_of_date": as_of,
        "part_count": count, "days_per_part": days, "daily_rows": len(daily),
        "all_dates_and_quantities_are_simulated": True,
        "catalog_identities_from_user_inventory": True,
        "actual_transactions_modified": False, "database_connection_used": False,
        "real_world_accuracy_established": False,
        "seed_or_generated_values_searched_for_target_score": False,
        "xgboost_hyperparameters_tuned_on_final_period": False,
        "comparison_is_exploratory": True,
        "independent_final_test_established": False,
        "comparison_note": "The recursive reference was inspected during development. Both fitted models exclude final-period labels, but these comparisons are exploratory, not fresh independent evidence.",
        "source_catalog_sha256": catalog_payload["source_sha256"],
        "generator_parameters": assumptions,
        "evaluation": evaluation,
        "direct_period_evaluation": direct_evaluation,
        "development_selection": selection,
        "direct_model_daily_rows": "Uniform allocation of a direct 30-day total; not separately predicted daily timing.",
        "model_fit_history": "Delivery model refitted on all simulated history AFTER evaluation; evaluated model used pre-test history only.",
        "feature_columns": cols, "product_codes": codes,
        "limitations": [
            "Part identifiers and catalog descriptions are real; all demand quantities and dates are generated scenarios.",
            "Scenario rates, seasonality, units sold and changes are assumptions, not estimates of store behavior.",
            "A low simulated WAPE does not establish accuracy on actual sales. Report every profile, including weak results.",
            "These files are for a standalone experiment or isolated demo installation; keep them separate from actual store history.",
            "Zero days are explicitly known in this generated calendar, unlike gaps in partial actual sales extracts.",
            "Future event features use only observed synthetic events and remain uncertain in recursive forecasts.",
        ],
    }
    write_csv(out / "SIMULATED_Demand.csv", daily, ["Date", "Part Number", "Demand Quantity", "Data Type", "Simulated Profile"])
    catalog_rows = [{**r, "dataset_type": DATASET_TYPE} for r in parts]
    (out / "SIMULATED_Catalog_Input.json").write_text(json.dumps({
        "dataset_type": DATASET_TYPE, "source_sha256": catalog_payload["source_sha256"],
        "parts": [{k: r[k] for k in ("part_number", "description", "brand", "unit")} for r in parts]
    }, indent=2))
    write_csv(out / "SIMULATED_Catalog.csv", catalog_rows, ["part_number", "description", "brand", "unit", "simulated_profile", "dataset_type"])
    forecast_rows = [{**r, "dataset_type": DATASET_TYPE} for r in forecasts]
    write_csv(out / "SIMULATED_Future_Forecasts.csv", forecast_rows, ["product_id", "forecast_date", "predicted_quantity", "dataset_type"])
    direct_rows = [{**r, "dataset_type": DATASET_TYPE, "method": "direct_total_even_allocation"} for r in direct_forecasts]
    write_csv(out / "SIMULATED_Direct_Future_Forecasts.csv", direct_rows, ["product_id", "forecast_date", "predicted_quantity", "dataset_type", "method"])
    payload = {"dataset_type": DATASET_TYPE, "asOfDate": as_of, "horizonDays": horizon, "observations": observations}
    (out / "SIMULATED_Training_Input.json").write_text(json.dumps(payload))
    (out / "SIMULATED_Results.json").write_text(json.dumps(summary, indent=2))
    tables = {
        "SIMULATED_DAILY": [list(daily[0]), *[list(r.values()) for r in daily]],
        "SIMULATED_CATALOG": [list(catalog_rows[0]), *[list(r.values()) for r in catalog_rows]],
        "SIMULATED_FORECASTS": [list(forecast_rows[0]), *[list(r.values()) for r in forecast_rows]],
        "SIMULATED_TEST_PERIODS": [list(evaluation["windows"][0]), *[list(r.values()) for r in evaluation["windows"]]],
        "SIMULATED_DIRECT_PERIODS": [list(direct_evaluation["windows"][0]), *[list(r.values()) for r in direct_evaluation["windows"]]],
        "SIMULATED_DIRECT_FORECASTS": [list(direct_rows[0]), *[list(r.values()) for r in direct_rows]],
    }
    (out / "SIMULATED_Tables.json").write_text(json.dumps(tables))
    return summary


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--catalog", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--as-of", required=True)
    parser.add_argument("--days", type=int, default=730)
    parser.add_argument("--parts", type=int, default=24)
    parser.add_argument("--seed", type=int, default=20261015)
    args = parser.parse_args()
    if not 180 <= args.days <= 1095 or not 4 <= args.parts <= 48:
        parser.error("Use 180–1095 days and 4–48 existing parts.")
    if pd.Timestamp(args.as_of).date().isoformat() != args.as_of:
        parser.error("Use an explicit YYYY-MM-DD simulation date.")
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    if any(out.iterdir()):
        parser.error("Use an empty output directory; existing datasets are never overwritten.")
    summary = create_demo(json.loads(Path(args.catalog).read_text()), out, args.as_of, args.days, args.parts, args.seed)
    print(json.dumps({"dataset_type": DATASET_TYPE, "parts": summary["part_count"], "rows": summary["daily_rows"],
                      "recursive_30_day_metrics": summary["evaluation"]["model"],
                      "direct_30_day_metrics": summary["direct_period_evaluation"]["model"],
                      "development_selected_candidate": summary["development_selection"]["selected_candidate"],
                      "real_world_accuracy_established": False}))


if __name__ == "__main__":
    main()

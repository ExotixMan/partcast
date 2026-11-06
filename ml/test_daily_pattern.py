import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import numpy as np
import pandas as pd
from daily_pattern import allocate_ticks, fit_pattern_forecast, history_state, daily_features
from period_forecast import predict_period
from train_forecast import evaluate_horizon


class CapturedModel:
    instances = []

    def __init__(self, **kwargs):
        self.attrs = {}
        self.instances.append(self)

    def fit(self, frame, target):
        self.frame, self.target = frame.copy(), target.copy()

    def get_booster(self):
        return self

    def set_attr(self, **attrs):
        self.attrs.update(attrs)

    def save_raw(self, **kwargs):
        return b'{"test_fixture":true}'

    def predict(self, frame):
        if 'cycle_distance' in frame:
            return np.where(frame.cycle_distance == 0, 10., .01)
        return np.ones(len(frame))


class DailyPatternTests(unittest.TestCase):
    def series(self, days=420):
        return pd.Series([3. if i % 7 == 0 else 0. for i in range(days)],
                         index=pd.date_range('2025-01-01', periods=days))

    def test_unseen_sales_cannot_change_either_model_or_daily_predictions(self):
        original = self.series()
        origin = original.index[-61]
        changed = original.copy()
        changed.loc[changed.index > origin] = 9999
        CapturedModel.instances = []
        with patch('xgboost.XGBRegressor', CapturedModel):
            left = fit_pattern_forecast({'part':original}, 30, origin)
            right = fit_pattern_forecast({'part':changed}, 30, origin)
        for a, b in zip(CapturedModel.instances[:2], CapturedModel.instances[2:]):
            pd.testing.assert_frame_equal(a.frame, b.frame)
            np.testing.assert_array_equal(a.target, b.target)
        self.assertEqual(left[5:], right[5:])
        pd.testing.assert_series_equal(original, self.series())

    def test_observed_gap_is_a_feature_without_inventing_sales(self):
        source = self.series(421)
        origin = source.index[-1] + pd.Timedelta(days=3)
        state = history_state(0, source, origin)
        self.assertEqual(state[2], 3)
        self.assertEqual(len(state[1]), len(source))
        row = daily_features(state, 4)
        self.assertEqual(row['forecast_gap_days'], 3)
        self.assertEqual(row['cycle_distance'], 0)
        self.assertIsNone(history_state(0, source, origin + pd.Timedelta(days=40)))

    def test_learned_weekly_timing_preserves_the_independently_estimated_total(self):
        source = self.series(421)
        model, histories, gaps, codes, _, rows, metadata = fit_pattern_forecast({'part':source}, 30, source.index[-1])
        uniform = predict_period(model, histories, gaps, codes, 30, source.index[-1])
        ticks = lambda items:sum(round(r['predicted_quantity'] * 10000) for r in items)
        self.assertEqual(ticks(rows), ticks(uniform))
        peak = sum(r['predicted_quantity'] for i,r in enumerate(rows,1) if i % 7 == 0)
        self.assertGreater(peak, sum(r['predicted_quantity'] for r in rows) * .8)
        self.assertEqual(metadata['product_modes']['part'], 'learned_daily_profile')
        self.assertTrue(all(r['forecast_date'] > str(source.index[-1].date()) for r in rows))
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / 'model.json'
            model.save_model(target)
            artifact = json.loads(target.read_text())
            attrs = artifact['learner']['attributes']
            self.assertEqual(attrs['prediction_feedback'], 'none')
            from xgboost import Booster
            profile = Booster()
            profile.load_model(bytearray(attrs['daily_profile_model'], 'utf-8'))
            self.assertEqual(profile.num_features(), len(json.loads(attrs['daily_profile_features'])))

    def test_inadequate_daily_targets_use_an_explicit_uniform_fallback(self):
        source = self.series()
        with patch('xgboost.XGBRegressor', CapturedModel), patch('daily_pattern.fit_daily_profile', return_value=(None,set(),0)):
            *_, rows, metadata = fit_pattern_forecast({'part':source}, 30, source.index[-1])
        quantities = [r['predicted_quantity'] for r in rows]
        self.assertLessEqual(max(quantities) - min(quantities), .000100001)
        self.assertEqual(metadata['product_modes']['part'], 'uniform_fallback_insufficient_daily_targets')

    def test_daily_allocation_preserves_small_totals_and_rejects_bad_or_overflowing_values(self):
        for ticks, weights in [(1,[1,1,1]), (123456,[.0001,30,1]), (99,[0,0,0]), (11,[1e308,1e-300])]:
            values = allocate_ticks(ticks, weights)
            self.assertEqual(sum(round(value * 10000) for value in values), ticks)
            self.assertTrue(all(np.isfinite(value) and value >= 0 for value in values))
        for weights in [[np.nan], [np.inf], [-1,2], [], [[1,2]]]:
            with self.assertRaises(ValueError):
                allocate_ticks(100, weights)
        with self.assertRaises(ValueError):
            allocate_ticks(10**14, [1])

    def test_invalid_profile_predictions_cannot_be_saved_as_daily_rows(self):
        source = self.series()
        class Invalid:
            def predict(self, frame):return np.full(len(frame), np.nan)
        with patch('xgboost.XGBRegressor', CapturedModel), patch('daily_pattern.fit_daily_profile', return_value=(Invalid(),{'part'},100)):
            with self.assertRaisesRegex(ValueError, 'invalid estimates'):
                fit_pattern_forecast({'part':source}, 30, source.index[-1])

    def test_daily_and_period_errors_are_separate_and_use_the_same_unseen_period(self):
        source = pd.Series([3. if i % 3 == 0 else 0. for i in range(240)],
                           index=pd.date_range('2025-01-01', periods=240))
        def estimates(history, horizon, origin):
            return [{'product_id':'part','forecast_date':(origin + pd.Timedelta(days=i)).date().isoformat(),
                     'predicted_quantity':2. if i % 3 == 1 else .5} for i in range(1,horizon + 1)]
        result = evaluate_horizon({'part':source}, 30, max_origins=1, period_forecaster=estimates)
        daily = result['daily_validation']
        self.assertEqual(result['model']['mae'], 0)
        self.assertEqual(daily['day_count'], 30)
        self.assertEqual(daily['product_period_count'], result['window_count'])
        self.assertEqual(daily['model']['mae'], .6667)
        self.assertEqual(daily['uniform_allocation']['mae'], 1.3333)
        self.assertEqual(daily['model']['actual_recorded_units'], result['model']['actual_recorded_units'])
        self.assertEqual(daily['model']['predicted_units'], result['model']['predicted_units'])


if __name__ == '__main__':
    unittest.main()

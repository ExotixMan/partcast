import unittest
from datetime import date, timedelta
import numpy as np
import pandas as pd
from train_forecast import add_days_since_demand, make_features, train_model, build_product_series, select_fresh_series, forecast, feature_columns
from train_forecast import evaluate_horizon, total_errors
from train_forecast import row_for_next_date, assess_readiness
from unittest.mock import patch

class ForecastTests(unittest.TestCase):
    def test_readiness_uses_sale_days_span_and_recency_without_fitting(self):
        origin = pd.Timestamp('2026-10-15')
        rows = [{'product_id':'test-part','occurred_on':(origin-pd.Timedelta(days=offset)).date().isoformat(),'quantity':1}
                for offset in [70,50,30,10,0]]
        with patch('train_forecast.make_model', side_effect=AssertionError('Readiness must not fit')):
            report = assess_readiness(rows, origin)
        self.assertTrue(report['ready'])  # Five observed rows can produce enough lag-feature rows.
        self.assertEqual(report['record_count'],5)
        self.assertEqual(report['products'][0]['sale_days'],5)
        self.assertEqual(report['feature_rows'],43)
        self.assertGreaterEqual(report['train_rows'],20)
        self.assertGreaterEqual(report['test_rows'],5)
        repeated = assess_readiness([rows[-1]]*40, origin)
        self.assertFalse(repeated['ready'])
        self.assertEqual(repeated['products'][0]['sale_days'],1)
        self.assertIn('too_few_sale_days',repeated['products'][0]['reasons'])
        old = [{**row,'occurred_on':(pd.Timestamp(row['occurred_on'])-pd.Timedelta(days=90)).date().isoformat()} for row in rows]
        report = assess_readiness(old+[{'product_id':'another-part','occurred_on':'2026-10-15','quantity':1}],origin)
        self.assertEqual(report['status'],'stale_history')  # An unrelated new sale cannot refresh the old part.
        self.assertEqual(report['eligible_part_count'],1)
        self.assertEqual(report['current_part_count'],0)

    def test_readiness_preserves_feature_evaluation_and_invalid_data_gates(self):
        origin='2026-10-15'
        self.assertEqual(assess_readiness([],origin)['status'],'no_observations')
        short=[{'product_id':'test-part','occurred_on':(pd.Timestamp(origin)-pd.Timedelta(days=offset)).date().isoformat(),'quantity':1}
               for offset in [34,25,15,7,0]]
        self.assertEqual(assess_readiness(short,origin)['status'],'insufficient_feature_rows')
        same_dates=[{**row,'product_id':f'test-part-{part}'} for part in range(5) for row in short]
        # Enough pooled feature rows still cannot replace distinct evaluation dates.
        self.assertEqual(assess_readiness(same_dates,origin)['status'],'insufficient_evaluation_rows')
        for field,value in [('quantity',True),('quantity',-1),('occurred_on','bad-date'),('occurred_on','2026-10-16')]:
            with self.subTest(field=field,value=value):
                report=assess_readiness([{**short[0],field:value}],origin)
                self.assertFalse(report['ready'])
                self.assertEqual(report['status'],'invalid_observations')

    def test_features_cannot_see_current_or_future_demand(self):
        base = pd.Series([1.0 if i % 3 == 0 else 0.0 for i in range(120)], index=pd.date_range('2025-01-01',periods=120))
        changed = base.copy()
        changed.iloc[70:] = 100
        left,_ = make_features({'part':base})
        right,_ = make_features({'part':changed})
        columns = [c for c in left if c not in ('y',)]
        pd.testing.assert_frame_equal(left[left.date<=base.index[70]][columns].reset_index(drop=True),right[right.date<=base.index[70]][columns].reset_index(drop=True))

    def test_event_age_matches_prediction_semantics(self):
        frame = pd.DataFrame({'y':[1,0,0,1,0]})
        add_days_since_demand(frame)
        self.assertEqual(frame.days_since_demand.tolist(),[0,0,1,2,0])

    def test_chronological_evaluation_and_baseline(self):
        base = pd.Series([float(i%5+1) if i%3==0 else 0 for i in range(120)],index=pd.date_range('2025-01-01',periods=120))
        features,_ = make_features({'part':base})
        model,metrics,columns = train_model(features)
        self.assertGreater(metrics['train_rows'],20)
        self.assertGreater(metrics['test_rows'],5)
        self.assertEqual(metrics['evaluation'],'chronological one-day-ahead holdout')
        self.assertTrue(np.isfinite(metrics['baseline_mae']))
        self.assertLessEqual(metrics['evaluation_start'],metrics['evaluation_end'])
        self.assertEqual(metrics['positive_day_weight'], 1.0)

    def test_insufficient_history_is_not_presented_as_a_forecast(self):
        with self.assertRaisesRegex(ValueError,'enough usable history'):
            build_product_series([{'product_id':'part','occurred_on':'2025-01-01','quantity':1}])

    def test_stale_history_cannot_become_a_current_forecast(self):
        history = pd.Series([1.0] * 60, index=pd.date_range('2020-01-01', periods=60))
        with self.assertRaisesRegex(ValueError, 'stale sales history'):
            select_fresh_series({'part': history}, '2026-10-09')
        with self.assertRaisesRegex(ValueError, 'supported history window'):
            forecast(None, feature_columns(), {'part': history}, {'part': 0}, 7, '2026-10-09')

    def test_future_dates_are_not_current_sales(self):
        history = pd.Series([1.0], index=pd.to_datetime(['2026-12-05']))
        with self.assertRaisesRegex(ValueError, 'future dates'):
            select_fresh_series({'part': history}, '2026-10-09')

    def test_short_gap_is_estimated_and_does_not_mutate_observations(self):
        class ConstantModel:
            def __init__(self): self.inputs = []
            def predict(self, frame):
                self.inputs.append(frame)
                return [2.0]
        history = pd.Series([1.0] * 60, index=pd.date_range('2026-01-01', periods=60))
        original = history.copy()
        model = ConstantModel()
        result = forecast(model, feature_columns(), {'part': history}, {'part': 0}, 7, '2026-03-03')
        self.assertEqual(len(result), 7)
        self.assertEqual(result[0]['forecast_date'], '2026-03-04')
        self.assertEqual(model.inputs[1].iloc[0]['lag_1'], 2.0)
        pd.testing.assert_series_equal(history, original)

    def test_batch_predictions_keep_each_parts_own_history_and_bridge_gaps(self):
        class LagModel:
            def __init__(self): self.calls = 0
            def predict(self, frame):
                self.calls += 1
                return frame.lag_1.to_numpy() + 1
        left = pd.Series([1.0] * 60, index=pd.date_range('2026-01-01', periods=60))
        right = pd.Series([3.0] * 58, index=pd.date_range('2026-01-01', periods=58))
        model = LagModel()
        rows = forecast(model, feature_columns(), {'a': left, 'b': right}, {'a': 0, 'b': 1}, 7, left.index.max())
        self.assertEqual([r['predicted_quantity'] for r in rows if r['product_id']=='a'], list(range(2, 9)))
        self.assertEqual([r['predicted_quantity'] for r in rows if r['product_id']=='b'], list(range(6, 13)))
        self.assertEqual(model.calls, 9)
        self.assertTrue((left == 1).all()); self.assertTrue((right == 3).all())

    def test_invalid_model_values_cannot_be_presented_as_predictions(self):
        class InvalidModel:
            def predict(self, frame): return [np.nan] * len(frame)
        history = pd.Series([1.0] * 60, index=pd.date_range('2026-01-01', periods=60))
        with self.assertRaisesRegex(ValueError, 'invalid estimates'):
            forecast(InvalidModel(), feature_columns(), {'p': history}, {'p': 0}, 7, history.index.max())

    def test_future_point_estimates_do_not_become_observed_sale_events(self):
        class ConstantModel:
            def __init__(self): self.inputs = []
            def predict(self, frame):
                self.inputs.append(frame.copy())
                return np.full(len(frame), 0.5)
        history = pd.Series([0.0] * 59 + [10.0], index=pd.date_range('2026-01-01', periods=60))
        original = history.copy()
        model = ConstantModel()
        forecast(model, feature_columns(), {'p': history}, {'p': 0}, 10, history.index.max())
        self.assertEqual(model.inputs[0].iloc[0]['days_since_demand'], 0)
        self.assertEqual(model.inputs[1].iloc[0]['days_since_demand'], 1)
        self.assertEqual(model.inputs[1].iloc[0]['event_count_7'], 1)
        self.assertEqual(model.inputs[7].iloc[0]['event_count_7'], 0)
        self.assertEqual(model.inputs[7].iloc[0]['lag_1'], 0.5)
        pd.testing.assert_series_equal(history, original)

    def test_prediction_event_features_match_training_at_an_observed_origin(self):
        history = pd.Series([float(i % 5 == 0) * 3 for i in range(100)],
                            index=pd.date_range('2026-01-01', periods=100))
        features, _ = make_features({'p': history})
        before = history.iloc[:-1]
        row = row_for_next_date(0, before.tolist(), history.index[-1], len(before),
                                (before.to_numpy() > 0).astype(float).tolist())
        np.testing.assert_allclose([row[c] for c in feature_columns()],
                                   features.iloc[-1][feature_columns()].to_numpy(dtype=float))

    def test_planning_period_predictions_and_fit_cannot_see_their_holdout_sales(self):
        class Model:
            def fit(self, x, y):
                fits.append((x.copy(), y.copy()))
            def predict(self, frame): return np.ones(len(frame))
        base = pd.Series([float(i%3==0) for i in range(150)], index=pd.date_range('2026-01-01', periods=150))
        changed = base.copy(); changed.iloc[-30:] = 1000
        fits = []
        with patch('train_forecast.make_model', side_effect=Model):
            left = evaluate_horizon({'p': base}, 30, max_origins=1)
            right = evaluate_horizon({'p': changed}, 30, max_origins=1)
        pd.testing.assert_frame_equal(fits[0][0], fits[1][0]); pd.testing.assert_series_equal(fits[0][1], fits[1][1])
        self.assertEqual(left['model']['predicted_units'], right['model']['predicted_units'])
        self.assertNotEqual(left['model']['actual_recorded_units'], right['model']['actual_recorded_units'])
        for method in ['croston_sba', 'tsb']:
            self.assertEqual(left[method]['predicted_units'], right[method]['predicted_units'])
        self.assertLess(left['windows'][0]['origin'], left['windows'][0]['start'])

    def test_horizon_checks_use_distinct_origins_and_positive_past_eligibility(self):
        class Model:
            def fit(self, x, y): pass
            def predict(self, frame): return np.ones(len(frame))
        base = pd.Series([float(i%3==0) for i in range(240)], index=pd.date_range('2026-01-01', periods=240))
        with patch('train_forecast.make_model', side_effect=Model):
            result = evaluate_horizon({'p': base}, 30)
        self.assertEqual(result['origin_count'], 3); self.assertEqual(result['window_count'], 3)
        self.assertEqual(result['tested_product_count'], 1)
        for window in result['windows']: self.assertGreaterEqual(window['train_nonzero_days'], 5)
        sparse = base * 0; sparse.iloc[-5:] = 1
        self.assertEqual(evaluate_horizon({'p': sparse}, 30)['status'], 'insufficient_history')
        self.assertEqual(evaluate_horizon({'p': base.iloc[:60]}, 90)['status'], 'insufficient_history')

    def test_percentage_error_is_not_fabricated_for_a_zero_demand_holdout(self):
        self.assertIsNone(total_errors([0, 0], [1, 1])['wape_percent'])
        self.assertEqual(total_errors([10, 0], [0, 0])['wape_percent'], 100)

    def test_unidentified_sales_and_invalid_quantities_are_not_silently_discarded(self):
        valid=[{'product_id':'identified-part','occurred_on':'2026-01-01','quantity':1}]
        for field,value in [('product_id',None),('product_id',' '),('quantity',True),
                            ('quantity',np.inf),('quantity',np.nan),('quantity',-1),('occurred_on','bad-date')]:
            with self.subTest(field=field,value=value):
                with self.assertRaises(ValueError):build_product_series([{**valid[0],field:value}])

if __name__=='__main__':
    unittest.main()

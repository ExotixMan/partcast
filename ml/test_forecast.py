import unittest
from datetime import date, timedelta
import numpy as np
import pandas as pd
from train_forecast import add_days_since_demand, make_features, train_model, build_product_series, select_fresh_series, forecast, feature_columns

class ForecastTests(unittest.TestCase):
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

if __name__=='__main__':
    unittest.main()

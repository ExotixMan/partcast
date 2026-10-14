import unittest
from datetime import timedelta

import numpy as np
import pandas as pd
from unittest.mock import patch

from direct_period_demo import period_training_rows, predict_period, forecast_direct_period
from simulated_demo import evaluate_demo


class DirectPeriodDemoTests(unittest.TestCase):
    def test_final_labels_cannot_enter_direct_model_training_or_predictions(self):
        fits = []
        class Model:
            def fit(self, frame, target): fits.append((frame.copy(), target.copy()))
            def get_booster(self): return self
            def set_attr(self, **kwargs): pass
            def predict(self, frame): return np.ones(len(frame)) * 30
        history = pd.Series(np.ones(240), index=pd.date_range('2025-01-01', periods=240))
        changed = history.copy(); changed.iloc[-30:] = 100
        parts = [{'part_number':'known-part','simulated_profile':'steady'}]
        with patch('direct_period_demo.make_model', side_effect=Model):
            first = evaluate_demo({'known-part':history}, parts, period_forecaster=forecast_direct_period)
            second = evaluate_demo({'known-part':changed}, parts, period_forecaster=forecast_direct_period)
        pd.testing.assert_frame_equal(fits[0][0], fits[1][0])
        np.testing.assert_array_equal(fits[0][1], fits[1][1])
        self.assertTrue((fits[0][1] == 30).all())
        self.assertEqual(first['model']['predicted_units'], second['model']['predicted_units'])
        self.assertNotEqual(first['model']['mae'], second['model']['mae'])

    def test_every_training_target_ends_before_the_available_history_ends(self):
        history = pd.Series(np.arange(210, dtype=float), index=pd.date_range('2025-01-01', periods=210))
        features, targets, codes, ends = period_training_rows({'known-part': history}, 30)
        self.assertTrue(all(end <= history.index.max() for end in ends))
        self.assertEqual(codes, {'known-part': 0})
        self.assertEqual(targets[0], sum(range(29, 59)))
        self.assertEqual(features.iloc[0].lag_1, 28)
        self.assertEqual(ends[0], history.index[58])

    def test_direct_prediction_preserves_totals_and_does_not_invent_daily_timing(self):
        class Model:
            def predict(self, frame): return np.array([10.1234, -1.0])
        history = pd.Series(np.ones(210), index=pd.date_range('2025-01-01', periods=210))
        rows = predict_period(Model(), {'known-a': 0, 'known-b': 1}, {'known-a': history, 'known-b': history}, 30, history.index.max())
        self.assertEqual(len(rows), 60)
        self.assertAlmostEqual(sum(r['predicted_quantity'] for r in rows if r['product_id']=='known-a'), 10.1234)
        self.assertEqual(sum(r['predicted_quantity'] for r in rows if r['product_id']=='known-b'), 0)
        self.assertTrue(all(r['forecast_date'] > history.index.max().date().isoformat() for r in rows))
        with self.assertRaisesRegex(ValueError, 'complete known calendar'):
            predict_period(Model(), {'known-a': 0}, {'known-a': history}, 30, history.index.max()+timedelta(days=1))


if __name__ == '__main__':
    unittest.main()

import unittest
from unittest.mock import patch
import numpy as np
import pandas as pd
from period_forecast import observed_history, training_rows, fit_period, predict_period, check_period_history
from train_forecast import total_errors


class FixedModel:
    def __init__(self, **kwargs):
        self.kwargs = kwargs
    def fit(self, frame, target):
        self.frame, self.target = frame.copy(), target.copy()
        return self
    def get_booster(self):
        return self
    def set_attr(self, **kwargs):
        self.attrs = kwargs
    def predict(self, frame):
        return np.ones(len(frame))


class PeriodForecastTests(unittest.TestCase):
    def series(self, days=360):
        dates = pd.date_range('2025-01-01', periods=days)
        return pd.Series([20.0 if day % 14 == 0 else 0.0 for day in range(days)],index=dates)

    def test_future_sales_cannot_change_the_fit_or_estimate_at_an_earlier_origin(self):
        original = self.series()
        origin = original.index[-61]
        changed = original.copy();changed.loc[changed.index > origin] = 9999
        outputs = []
        with patch('xgboost.XGBRegressor', FixedModel):
            for data in [original,changed]:
                model, history, gaps, codes, count = fit_period({'part':data},30,origin)
                result = predict_period(model,history,gaps,codes,30,origin)
                outputs.append((model.frame,model.target,result))
        pd.testing.assert_frame_equal(outputs[0][0],outputs[1][0])
        np.testing.assert_array_equal(outputs[0][1],outputs[1][1])
        self.assertEqual(outputs[0][2],outputs[1][2])

    def test_missing_recent_dates_are_an_explicit_gap_not_invented_sales(self):
        series=self.series(351)
        origin=series.index[-1]+pd.Timedelta(days=30)
        copy=series.copy()
        history,gaps=observed_history({'part':series},origin)
        self.assertEqual(gaps['part'],30)
        self.assertEqual(history['part'].index[-1],series.index[-1])
        frame,target,codes,ends,ids=training_rows(history,gaps,30,7)
        self.assertTrue((frame.forecast_gap_days==30).all())
        self.assertTrue(all(end<=series.index[-1] for end in ends))
        pd.testing.assert_series_equal(copy,series)

    def test_daily_values_preserve_the_period_total_and_cannot_feed_back(self):
        series=self.series(351);origin=series.index[-1]
        history,gaps=observed_history({'part':series},origin)
        class Ratio:
            def predict(self, frame):return np.array([1.0])
        before=series.copy();rows=predict_period(Ratio(),history,gaps,{'part':0},30,origin)
        total=round(float(series.tail(90).mean())*30,4)
        self.assertEqual(len(rows),30)
        self.assertAlmostEqual(sum(r['predicted_quantity'] for r in rows),total,places=4)
        self.assertLessEqual(max(r['predicted_quantity'] for r in rows)-min(r['predicted_quantity'] for r in rows),.000100001)
        self.assertTrue(all(r['forecast_date']>str(origin.date()) for r in rows))
        pd.testing.assert_series_equal(series,before)

    def test_global_training_rows_are_bounded_before_fitting(self):
        history={f'part-{i}':self.series(500) for i in range(4)}
        gaps={pid:0 for pid in history}
        with patch('period_forecast.MAX_TRAINING_ROWS',40):
            frame,targets,codes,ends,ids=training_rows(history,gaps,30,1)
        self.assertLessEqual(len(frame),40)
        self.assertEqual(set(ids),set(history))

    def test_insufficient_and_stale_period_history_cannot_produce_a_forecast(self):
        short=self.series(71)
        self.assertFalse(check_period_history({'part':short},90,short.index[-1])['ready'])
        with self.assertRaisesRegex(ValueError,'Not enough completed historical periods'):
            fit_period({'part':short},90,short.index[-1])
        self.assertEqual(observed_history({'part':short},short.index[-1]+pd.Timedelta(days=50)),({},{}))

    def test_period_r_squared_matches_the_actual_period_test_and_handles_constants(self):
        values=total_errors([10,20],[12,18])
        self.assertAlmostEqual(values['r2'],.84)
        self.assertIsNone(total_errors([10,10],[9,11])['r2'])

    def test_nonfinite_or_overflowing_period_estimates_cannot_reach_database_rows(self):
        series=self.series(351);origin=series.index[-1]
        history,gaps=observed_history({'part':series},origin)
        for value in [np.nan,np.inf,1e308,1e20]:
            class Invalid:
                def predict(self,frame):return np.array([value])
            with self.assertRaises(ValueError):
                predict_period(Invalid(),history,gaps,{'part':0},30,origin)


if __name__=='__main__':
    unittest.main()

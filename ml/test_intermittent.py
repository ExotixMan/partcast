import unittest
from functools import partial

import numpy as np
import pandas as pd

from intermittent import daily_rate, forecast_intermittent
from compare_forecast_candidates import development_comparison
from benchmark_raw_forecast import croston_sba, tsb, errors


class IntermittentTests(unittest.TestCase):
    def test_cold_start_does_not_treat_a_single_sale_as_daily_demand(self):
        self.assertLess(croston_sba([40] + [0] * 1000), 0.04)

    def test_tsb_decays_during_observed_inactivity(self):
        self.assertLess(tsb([2, 0, 0] + [0] * 100), tsb([2, 0, 0]))
        self.assertEqual(tsb([0] * 30), 0)

    def test_percentage_accuracy_is_undefined_when_no_units_were_recorded(self):
        self.assertIsNone(errors([0, 0], [1, 1])['wape_percent'])
        self.assertEqual(errors([10, 0], [0, 0])['wape_percent'], 100)

    def test_sba_updates_size_and_time_between_actual_sales(self):

        self.assertAlmostEqual(daily_rate([10, 0, 0, 20]), .95 * 11 / 3)

        self.assertEqual(daily_rate([10, 0, 0, 20]), daily_rate([10, 0, 0, 20, 0, 0]))

    def test_tsb_updates_probability_only_with_observed_days(self):

        self.assertAlmostEqual(daily_rate([10, 0, 0, 20], 'tsb'), .980299 * 11)
        self.assertLess(daily_rate([10, 0, 0, 20, 0], 'tsb'), daily_rate([10, 0, 0, 20], 'tsb'))

    def test_leading_zero_days_and_zero_only_series(self):
        self.assertAlmostEqual(daily_rate([0, 0, 6]), .95 * 6 / 3)
        self.assertAlmostEqual(daily_rate([0, 0, 6], 'tsb'), 6 / 3)
        for method in ['croston_sba', 'tsb']:
            self.assertEqual(daily_rate([], method), 0)
            self.assertEqual(daily_rate([0, 0], method), 0)

    def test_invalid_data_and_parameters_are_rejected(self):
        for values in [[1, -1], [np.inf], [np.nan], [[1, 2]]]:
            with self.subTest(values=values), self.assertRaises(ValueError):
                daily_rate(values)
        for options in [{'alpha': 0}, {'alpha': 2}, {'beta': -1}, {'method': 'invented'}]:
            with self.subTest(options=options), self.assertRaises(ValueError):
                daily_rate([1, 0], **options)

    def test_future_estimates_do_not_decay_tsb_or_create_parts(self):
        history = pd.Series([10.0, 0.0, 0.0], index=pd.date_range('2026-01-01', periods=3))
        original = history.copy()
        result = forecast_intermittent({'known-part': history}, 30, '2026-01-03', 'tsb')
        self.assertEqual(len(result), 30)
        self.assertEqual({r['product_id'] for r in result}, {'known-part'})
        self.assertEqual(result[0]['forecast_date'], '2026-01-04')
        self.assertEqual(result[-1]['forecast_date'], '2026-02-02')
        self.assertEqual({r['predicted_quantity'] for r in result}, {9.801})
        pd.testing.assert_series_equal(history, original)
        with self.assertRaisesRegex(ValueError, 'origin'):
            forecast_intermittent({'known-part': history}, 30, '2026-01-02', 'tsb')

    def test_intermittent_selection_cannot_see_final_period_labels(self):
        history = pd.Series([1.0] * 180, index=pd.date_range('2025-01-01', periods=180))
        changed = history.copy(); changed.iloc[-30:] = 100
        candidates = {method: partial(forecast_intermittent, method=method) for method in ['croston_sba', 'tsb']}
        left = development_comparison({'known-part': history}, 30, factories={}, period_forecasters=candidates)
        right = development_comparison({'known-part': changed}, 30, factories={}, period_forecasters=candidates)
        self.assertEqual(left['selected_candidate'], 'tsb')
        self.assertEqual(right['selected_candidate'], left['selected_candidate'])
        self.assertEqual(left['development_checks'], right['development_checks'])
        self.assertNotEqual(left['final_evaluation']['model']['mae'], right['final_evaluation']['model']['mae'])
        self.assertFalse(right['production_model_changed'])


if __name__ == '__main__':
    unittest.main()

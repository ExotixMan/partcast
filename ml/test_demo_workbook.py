import copy
from datetime import timedelta
import unittest

import numpy as np
import pandas as pd

from evaluate_demo_workbook import evaluate_workbook, parse_splits


class WorkbookDemoTests(unittest.TestCase):
    def fixture(self):
        dates = pd.date_range('2025-01-01', periods=210)
        payload = {'dataset_type': 'SIMULATED_DEMO', 'as_of_date': '2026-10-15', 'splits': {}}
        for name, subset in [('train', dates[:150]), ('validation', dates[150:180]), ('test', dates[180:])]:
            payload['splits'][name] = [{'date': day.date().isoformat(), 'part_number': pid, 'quantity': 1,
                                       'tier': 'synthetic_simulated'} for pid in ['known-A', 'known-B'] for day in subset]
        return payload

    def forecasters(self, fits):
        def model(multiplier):
            def predict(history, horizon, origin):
                fits.append({pid: values.copy() for pid, values in history.items()})
                self.assertTrue(all(s.index.max() == origin for s in history.values()))
                return [{'product_id': pid, 'forecast_date': (origin + timedelta(days=i)).date().isoformat(),
                         'predicted_quantity': float(values.mean()) * multiplier}
                        for pid, values in history.items() for i in range(1, horizon+1)]
            return predict
        return {'direct_period_xgboost': model(1), 'recursive_xgboost': model(2)}

    def test_final_labels_cannot_choose_strategy_or_enter_test_fitting(self):
        first_fits, second_fits = [], []
        payload = self.fixture()
        changed = copy.deepcopy(payload)
        for row in changed['splits']['test']:
            row['quantity'] = 50
        first = evaluate_workbook(payload, self.forecasters(first_fits), include_future=False)
        second = evaluate_workbook(changed, self.forecasters(second_fits), include_future=False)
        self.assertEqual(first['selected_method'], 'direct_period_xgboost')
        self.assertEqual(second['selected_method'], first['selected_method'])
        for before, after in zip(first_fits, second_fits):
            for pid in before:
                pd.testing.assert_series_equal(before[pid], after[pid])
        self.assertEqual(first['test']['direct_period_xgboost']['metrics']['predicted_units'],
                         second['test']['direct_period_xgboost']['metrics']['predicted_units'])
        self.assertNotEqual(first['test']['direct_period_xgboost']['metrics']['wape_percent'],
                            second['test']['direct_period_xgboost']['metrics']['wape_percent'])
        self.assertFalse(first['actual_sales_modified'])
        self.assertFalse(first['production_accuracy_established'])

    def test_duplicate_missing_day_overlap_wrong_tier_or_quantity_is_rejected(self):
        changes = [lambda p: p['splits']['test'].append(copy.deepcopy(p['splits']['test'][0])),
                   lambda p: p['splits']['test'].pop(3),
                   lambda p: p['splits']['test'][0].update(date=p['splits']['validation'][0]['date']),
                   lambda p: p['splits']['test'][0].update(tier='actual_quantity'),
                   lambda p: p['splits']['test'][0].update(quantity=-1),
                   lambda p: p['splits']['test'][0].update(quantity=float('nan')),
                   lambda p: p['splits']['test'][0].update(quantity=True),
                   lambda p: p['splits']['test'][0].update(part_number='unidentified-new-part')]
        for change in changes:
            with self.subTest(change=change):
                payload = self.fixture(); change(payload)
                with self.assertRaises(ValueError):
                    parse_splits(payload)

    def test_zero_validation_cannot_claim_accuracy_or_choose_by_test(self):
        payload = self.fixture()
        for row in payload['splits']['validation']:
            row['quantity'] = 0
        result = evaluate_workbook(payload, self.forecasters([]), include_future=False)
        self.assertIsNone(result['selected_method'])
        self.assertIsNone(result['validation']['direct_period_xgboost']['metrics']['wape_percent'])
        self.assertEqual(result['future_periods'], [])


if __name__ == '__main__':
    unittest.main()

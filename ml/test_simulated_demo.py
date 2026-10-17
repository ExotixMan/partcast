import unittest
from unittest.mock import patch

import numpy as np
import pandas as pd

from simulated_demo import PROFILES, generate_series, select_parts, evaluate_demo


class SimulatedDemoTests(unittest.TestCase):
    def catalog(self, count=8):
        return [{"part_number": f"fixture-part-{i}", "description": f"Fixture catalog item {i}",
                 "brand": "Fixture", "unit": ""} for i in range(count)]

    def test_selection_preserves_known_identities_and_excludes_conflicting_duplicates(self):
        catalog = self.catalog()
        catalog += [{**catalog[0], "description": "Conflicting description"}]
        selected = select_parts(catalog, 4, 42)
        self.assertNotIn("fixture-part-0", {r["part_number"] for r in selected})
        self.assertEqual({r["simulated_profile"] for r in selected}, set(PROFILES))
        for r in selected:
            original = next(c for c in catalog if c['part_number'] == r['part_number'])
            self.assertEqual({k: r[k] for k in original}, original)
        with self.assertRaisesRegex(ValueError, 'unambiguous'):
            select_parts(catalog, 8, 42)

    def test_generated_calendar_is_complete_reproducible_and_separate_from_catalog(self):
        catalog = self.catalog(); selected = select_parts(catalog, 4, 42)
        first, assumptions = generate_series(selected, 365, '2026-10-15', 42)
        second, _ = generate_series(selected, 365, '2026-10-15', 42)
        self.assertEqual(set(first), {r['part_number'] for r in selected})
        for pid, s in first.items():
            pd.testing.assert_series_equal(s, second[pid])
            self.assertEqual(len(s), 365)
            self.assertEqual(s.index.max(), pd.Timestamp('2026-10-15'))
            self.assertTrue((s >= 0).all())
            self.assertTrue((s == np.floor(s)).all())
        intermittent = next(r['part_number'] for r in selected if r['simulated_profile'] == 'intermittent')
        self.assertGreater((first[intermittent] == 0).sum(), 0)
        self.assertEqual(assumptions[intermittent]['daily_event_probability'], .22)
        self.assertEqual(catalog, self.catalog())

    def test_holdout_labels_cannot_change_simulated_predictions_or_fit(self):
        fits = []
        class Constant:
            def fit(self, x, y): fits.append((x.copy(), y.copy()))
            def predict(self, frame): return np.ones(len(frame))
        series = {'fixture-part': pd.Series(np.ones(180), index=pd.date_range('2026-01-01', periods=180))}
        changed = {'fixture-part': series['fixture-part'].copy()}
        changed['fixture-part'].iloc[-30:] = 100
        parts = [{'part_number': 'fixture-part', 'simulated_profile': 'steady'}]
        with patch('train_forecast.make_model', side_effect=Constant):
            first = evaluate_demo(series, parts)
            second = evaluate_demo(changed, parts)
        pd.testing.assert_frame_equal(fits[0][0], fits[1][0])
        pd.testing.assert_series_equal(fits[0][1], fits[1][1])
        self.assertEqual(first['model']['predicted_units'], second['model']['predicted_units'])
        self.assertNotEqual(first['model']['mae'], second['model']['mae'])
        self.assertEqual(first['dataset_type'], 'SIMULATED_DEMO')

    def test_every_profile_is_reported_without_an_accuracy_threshold(self):
        parts = select_parts(self.catalog(), 4, 42)
        series, _ = generate_series(parts, 180, '2026-10-15', 42)
        class Zero:
            def fit(self, x, y): pass
            def predict(self, frame): return np.zeros(len(frame))
        with patch('train_forecast.make_model', side_effect=Zero):
            report = evaluate_demo(series, parts)
        self.assertEqual(set(report['by_profile']), set(PROFILES))
        self.assertEqual(report['model']['wape_percent'], 100)
        self.assertEqual(report['tested_product_count'], 4)


if __name__ == '__main__':
    unittest.main()

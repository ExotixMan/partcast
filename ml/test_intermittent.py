import unittest
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


if __name__ == '__main__':
    unittest.main()

import unittest
from unittest.mock import patch

from evaluate_forecast import planning_validation
from daily_pattern import pattern_forecast


class AuditStrategyTests(unittest.TestCase):
    def test_offline_planning_audit_calls_the_current_production_strategy(self):
        histories = {'part': object()}
        with patch('evaluate_forecast.evaluate_horizon', return_value={'status': 'checked'}) as evaluate:
            results = planning_validation(histories)
        self.assertEqual(list(results), ['14', '30', '60', '90'])
        self.assertEqual(evaluate.call_count, 4)
        for call, horizon in zip(evaluate.call_args_list, [14, 30, 60, 90]):
            self.assertEqual(call.args, (histories, horizon))
            self.assertIs(call.kwargs['period_forecaster'], pattern_forecast)

    def test_audit_with_no_fresh_history_does_not_try_to_fit_a_model(self):
        with patch('evaluate_forecast.evaluate_horizon') as evaluate:
            results = planning_validation({})
        evaluate.assert_not_called()
        self.assertTrue(all(value['status'] == 'insufficient_history' and value['window_count'] == 0
                            for value in results.values()))


if __name__ == '__main__':
    unittest.main()

import unittest
import numpy as np
import pandas as pd
from compare_forecast_candidates import development_comparison


class CandidateComparisonTests(unittest.TestCase):
    def model(self,quantity):
        class Constant:
            def fit(self,x,y): pass
            def predict(self,frame): return np.full(len(frame),quantity)
        return Constant

    def test_final_labels_cannot_select_a_candidate(self):
        history=pd.Series(np.ones(180),index=pd.date_range('2025-01-01',periods=180))
        changed=history.copy();changed.iloc[-30:]=2
        factories={'one':self.model(1),'two':self.model(2)}
        first=development_comparison({'identified-part':history},30,factories)
        second=development_comparison({'identified-part':changed},30,factories)
        self.assertEqual(first['selected_candidate'],'one')
        self.assertEqual(second['selected_candidate'],'one')
        self.assertEqual(first['development_checks'],second['development_checks'])
        self.assertNotEqual(first['final_evaluation']['model']['mae'],second['final_evaluation']['model']['mae'])
        self.assertFalse(second['final_period_used_for_selection'])

    def test_zero_demand_development_cannot_produce_a_high_accuracy_claim(self):
        history=pd.Series([1.0]*50+[0.0]*100,index=pd.date_range('2025-01-01',periods=150))
        result=development_comparison({'identified-part':history},14,{'one':self.model(1)})
        self.assertEqual(result['positive_development_windows'],0)
        self.assertIsNone(result['selected_candidate']);self.assertIsNone(result['final_evaluation'])
        self.assertFalse(result['production_model_changed']);self.assertFalse(result['independent_accuracy_established'])
        self.assertIsNone(result['development_checks']['one']['model']['wape_percent'])

    def test_final_period_is_not_part_of_the_development_evaluation(self):
        history=pd.Series(np.ones(180),index=pd.date_range('2025-01-01',periods=180))
        result=development_comparison({'identified-part':history},30,{'one':self.model(1)})
        for check in result['development_checks'].values():
            for window in check['windows']:
                self.assertLessEqual(window['end'],result['development_ends'])
                self.assertLess(window['end'],result['final_period_start'])


if __name__=='__main__':unittest.main()

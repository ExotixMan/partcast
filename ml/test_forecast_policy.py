import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from train_forecast import planning_horizon


class ForecastPolicyTests(unittest.TestCase):
    def test_horizons_above_sixty_or_invalid_values_are_rejected(self):
        for value in [7, 14, 30, 45, 60]:
            self.assertEqual(planning_horizon(value), value)
        for value in [90, 61, 6, True, None, float('inf'), float('nan'), 14.5, 'invalid']:
            with self.assertRaisesRegex(ValueError, '7 to 60'):
                planning_horizon(value)

    def test_ninety_day_cli_cannot_write_an_artifact_or_readiness_report(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            inp = root / 'input.json'
            inp.write_text(json.dumps({'observations':[], 'horizonDays':90}))
            for extra in [[], ['--check-data']]:
                result = subprocess.run([sys.executable, str(Path(__file__).with_name('train_forecast.py')),
                                         '--input', str(inp), '--output', str(root/'output.json'),
                                         '--model-out', str(root/'model.json'), *extra], capture_output=True, text=True)
                self.assertEqual(result.returncode, 2)
                self.assertIn('7 to 60', result.stderr)
                self.assertFalse((root/'model.json').exists())
                self.assertFalse((root/'output.json').exists())


if __name__ == '__main__':
    unittest.main()

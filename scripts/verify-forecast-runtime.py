#!/usr/bin/env python3
"""Deployment smoke test; uses fixture values, never store records or credentials."""
import json
import platform
import sys

if sys.version_info < (3, 10):
    raise SystemExit("PartCast forecasting needs Python 3.10 or newer.")

import numpy as np
import pandas as pd
import sklearn
import xgboost

features = np.array([[0.0], [1.0], [2.0], [3.0]])
model = xgboost.XGBRegressor(n_estimators=1, n_jobs=1, random_state=42)
model.fit(features, np.array([0.0, 1.0, 2.0, 3.0]))
if not np.isfinite(model.predict(features)).all():
    raise SystemExit("The installed XGBoost runtime returned invalid values.")
print(json.dumps({"forecast_runtime": "ready", "python": platform.python_version(),
                  "numpy": np.__version__, "pandas": pd.__version__,
                  "scikit_learn": sklearn.__version__, "xgboost": xgboost.__version__}))

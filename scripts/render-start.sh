#!/usr/bin/env bash
set -euo pipefail
partcast_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
partcast_venv="${PARTCAST_VENV_PATH:-$partcast_root/.venv}"

if [[ ! -x "$partcast_venv/bin/python" ]]; then
  printf '%s\n' 'Forecasting Python is missing. Set the Render Build Command to: bash scripts/render-build.sh' >&2
  exit 1
fi
export PYTHON_BIN="$partcast_venv/bin/python"
export ML_SCRIPT_PATH="$partcast_root/ml/train_forecast.py"
export OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 MKL_NUM_THREADS=1 NUMEXPR_NUM_THREADS=1
"$PYTHON_BIN" "$partcast_root/scripts/verify-forecast-runtime.py"
cd "$partcast_root/apps/server"
exec node src/server.js

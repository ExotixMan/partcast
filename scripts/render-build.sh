#!/usr/bin/env bash
set -euo pipefail
partcast_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
partcast_venv="${PARTCAST_VENV_PATH:-$partcast_root/.venv}"
cd "$partcast_root"
node -e "if(Number(process.versions.node.split('.')[0])<20)throw Error('PartCast API needs Node 20 or newer')"


export OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 MKL_NUM_THREADS=1 NUMEXPR_NUM_THREADS=1
python3 -m venv "$partcast_venv"
"$partcast_venv/bin/python" -m pip install --disable-pip-version-check --cache-dir "${PIP_CACHE_DIR:-${TMPDIR:-/tmp}/partcast-pip-cache}" -r ml/requirements.txt
"$partcast_venv/bin/python" -m pip check
"$partcast_venv/bin/python" scripts/verify-forecast-runtime.py
npm --prefix apps/server ci --omit=dev --cache "${npm_config_cache:-${NPM_CONFIG_CACHE:-${TMPDIR:-/tmp}/partcast-npm-cache}}"

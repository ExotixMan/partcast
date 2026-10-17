#!/usr/bin/env bash
set -euo pipefail
partcast_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$partcast_root"
node -e "const [a,b]=process.versions.node.split('.').map(Number);if(a<20||(a===20&&b<19))throw Error('Node >=20.19 required')"
(cd apps/server && npm ci --cache /tmp/partcast-npm-cache)
(cd apps/web && npm ci --cache /tmp/partcast-npm-cache)
python3 -m venv .venv
.venv/bin/pip install --cache-dir /tmp/partcast-pip-cache -r ml/requirements.txt
.venv/bin/pip check
.venv/bin/python - <<'PY'
from pathlib import Path
import secrets

root = Path.cwd()
env = root / 'apps/server/.env'
if not env.exists():
    content = ''.join(f'{key}={secrets.token_hex(32)}\n' for key in ['SETUP_SECRET', 'CRON_SECRET', 'IP_HASH_SECRET'])
    content += f'PYTHON_BIN={root / ".venv/bin/python"}\nML_SCRIPT_PATH={root / "ml/train_forecast.py"}\n'
    content += 'SUPABASE_URL=https://ragdjkdcrvexqfadlqbf.supabase.co\n'
    with env.open('x') as stream:
        env.chmod(0o600)
        stream.write(content)
PY
(cd apps/server && npm run check && npm test)
(cd apps/web && npm test && npm run build)
.venv/bin/python -m unittest discover -s ml -p 'test_*.py'

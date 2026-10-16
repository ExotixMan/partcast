# Repair forecasting on a Render Node service

A native **Node** service does not execute `Dockerfile`. A working `/health` endpoint confirms that Express is running; it does not confirm that Python's analytics packages were installed. The Node service needs both the JavaScript dependencies and a Python virtual environment.

Open the API service at **https://partcast.onrender.com** in Render and use:

| Setting | Value |
| --- | --- |
| Runtime | Node |
| Branch | `codex/partcast-offline-forecasting-20261009` |
| Root Directory | Leave blank, using the repository root |
| Build Command | `bash scripts/render-build.sh` |
| Start Command | `bash scripts/render-start.sh` |
| Health Check Path | `/health` |

Save the settings and deploy the latest commit. Retain the store's existing database, Gmail, Gemini and encryption settings. These scripts need no new API key. The API URL remains the same.

The root directory must include `ml`, `scripts` and `apps/server`. The build creates `.venv`, installs `ml/requirements.txt`, runs `pip check`, performs a tiny XGBoost fit on fixture values, and installs the server's locked production Node dependencies. The start script selects that virtual environment and the bundled training script, checks the forecasting installation again, then starts Express. Copied Windows interpreter settings are overridden by the start script's correct Linux paths. For a deliberate alternative environment location, set `PARTCAST_VENV_PATH` consistently for build and start; the default requires no setting.

Build and startup logs should show JSON with **`"forecast_runtime": "ready"`** and the installed package versions. A dependency or native-library failure stops deployment with its real build error. If Python is absent or older than 3.10 on a custom native build image, use the existing Docker deployment described below. Never mark a failed installation as ready just because `/health` responds.

After the deployment is live, open **Plan ahead → Check sales history again**. The page should show actual-history eligibility or its specific data requirement. Successful installation does not make stale/sparse observations eligible and does not establish forecast accuracy. Keep modeled demand separate from actual transactions.

## Docker deployment

The existing `render.yaml` creates a Docker API service and already installs Python and `libgomp1`. Its Dockerfile now performs the same dependency and XGBoost verification during the image build. Native Node dashboard settings are configured separately; pushing `render.yaml` does not convert an existing manually created Node service to Docker.

## Resource handling and validation

Native BLAS/OpenMP thread pools are limited for forecast child processes and deployment checks. Concurrent cold engine-status/readiness calls share one runtime discovery instead of importing analytics packages repeatedly at once. If a probe is killed by the host, the API reports a stopped process and suggests reviewing resource limits; it does not claim packages are missing. Render Logs receive bounded failure categories, signal/exit codes and missing module names, without secret values.

The native build and start workflow can be tested in a separate checkout or temporary fixture tree, using fixture environment values for Express and a real Python/XGBoost calculation. These checks do not alter Supabase records or send email. Running a model on test fixtures verifies software setup, not store forecasting accuracy.

On 16 October 2026, a fresh isolated native build installed the locked production Node dependencies and Python requirements, passed `pip check` and the XGBoost deployment smoke test, and served `/health` through the new start script. The installed runtime completed readiness checking, ten concurrent runtime calls and seven fixture forecast rows with a model artifact. Missing-venv startup was rejected before Express started. The server suite passed 58 tests; the frontend suite passed 17. Render dashboard settings and hosted forecasting still require applying the commands above; this local validation does not establish a live Render repair.

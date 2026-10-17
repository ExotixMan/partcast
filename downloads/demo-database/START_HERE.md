# Run forecasting in a separate Supabase demo project

These are **generated sample quantities**, using nine existing part identities.
They are not actual customer sales. The actual-store deployment stays separate.

## Load the database

1. Open the separate **DEMO** Supabase project and its SQL Editor.
2. If the project is empty, run `01_schema_and_roles.sql`, then
   `02_login_and_permissions.sql` from the ZIP, in that order. Skip these if
   this demo project already has the current PartCast schema installed.
3. Run `03_SEED_SIMULATED_DEMAND.sql`. Expect **9 parts**, **6,570 generated
   daily rows**, and **778 positive demand observations**. The seed refuses a
   database with existing business records unless it already has this demo marker.
4. The sample dates end yesterday relative to the day you run the SQL, in
   Philippine time. Repeating it refreshes only tagged sample demand, not user
   sales or accounts. Sample stock counts and prices are generated too.

The complete calendar includes zero days in `partcast_demo_daily`. The normal
sale-event table contains only positive quantities, with `source=simulated_demo`.
Do not change those rows to `actual_sale` or `imported_training_data`.
The CSV and JSON are audit and local-calculation files; they are not uploads for
normal actual-data Imports.

## Connect a separate demo website and API

Deploy the latest Codex branch to a **separate** Render API and website.
Keep your actual store services connected to the actual Supabase project.

On the **demo API**, set:

```dotenv
PARTCAST_DEMO_MODE=true
SUPABASE_URL=https://YOUR_DEMO_PROJECT.supabase.co
SUPABASE_ANON_KEY=YOUR_DEMO_PUBLIC_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_DEMO_SERVICE_ROLE_KEY
FRONTEND_ORIGINS=https://YOUR_DEMO_WEBSITE.onrender.com
```

Use the demo project's keys from Supabase project settings. Never put the
service-role key in the frontend or in chat. Keep the other required server
secrets and Gmail login-code configuration in Render Environment settings.
For a Render **Node** API service, leave Root Directory blank, use Build Command
`bash scripts/render-build.sh` and Start Command `bash scripts/render-start.sh`.
These install and verify Python with numpy, pandas, scikit-learn and xgboost.
A Docker API service can use the repository Dockerfile instead.

On the **demo website**, set:

```dotenv
VITE_API_URL=https://YOUR_DEMO_API.onrender.com
VITE_SUPABASE_URL=https://YOUR_DEMO_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_DEMO_PUBLIC_ANON_KEY
```

For a Render Static Site with a blank Root Directory, use Build Command
`cd apps/web && npm ci && npm run build`, Publish Directory `apps/web/dist`, and
a rewrite from `/*` to `/index.html`.

Redeploy both services. `PARTCAST_DEMO_MODE` remains unset or `false` on the
actual API. Demo mode also requires the SQL marker; setting the flag against
an unprepared database stops API requests with a setup message. The demo uses
only `simulated_demo` observations; normal mode uses only actual/imported sales.
Login, email codes, roles and private model storage continue to apply.

## Run the walkthrough

1. Create/sign in to the demo project's Owner or Super Admin account using the
   normal PartCast first-account setup. The SQL does not create a password or
   bypass email verification. A login from the actual project is a different account.
2. Check the generated-data description on **Demand planning**.
3. Open **Sales → Sales by part** to see sample quantities.
4. Open **Demand planning**, choose **Next 30 days**, and click
   **Update demand estimate** after sales-data preparation finishes.
5. Expect **270 daily estimates for 9 parts** for that 30-day run. Open a part,
   switch between Chart and Daily list, then open Restock to review suggestions.
6. Run `04_VERIFY_DEMO.sql` for read-only counts and the latest training result.

The model is fitted and tested when you click Update; the SQL does not insert
fake accuracy scores or precomputed forecasts. Backtest errors shown for this
sample describe generated demand, not actual-store accuracy. Error is not
zero or guaranteed, and simpler baselines may perform better.

The seed uses the already inspected capstone sample without optimizing its
quantities or searching seeds for a target score. SQL shifts the generated
calendar to the execution date for an interactive demo; it never shifts real
sales dates. The JSON/CSV dates reflect the pack's creation day, so a later SQL
execution can have different dates and different measured errors.

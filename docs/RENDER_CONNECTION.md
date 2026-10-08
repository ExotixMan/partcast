# Fixing the Render store connection

The website is `https://partcast-web.onrender.com` and the API service is `https://partcast.onrender.com`. `/health` is a check endpoint; do not include it in `VITE_API_URL`.

Open each service in the Render dashboard, choose **Environment**, and check these settings:

| Render service | Setting | Value |
| --- | --- | --- |
| PartCast website | `VITE_API_URL` | `https://partcast.onrender.com` |
| PartCast website | `VITE_SUPABASE_URL` | `https://ragdjkdcrvexqfadlqbf.supabase.co` |
| PartCast website | `VITE_SUPABASE_ANON_KEY` | Public/anon key from that same Supabase project |
| PartCast API | `FRONTEND_ORIGINS` | `https://partcast-web.onrender.com` |
| PartCast API | `SUPABASE_URL` | `https://ragdjkdcrvexqfadlqbf.supabase.co` |
| PartCast API | `SUPABASE_ANON_KEY` | Public/anon key from that same Supabase project |
| PartCast API | `SUPABASE_SERVICE_ROLE_KEY` | Service-role key from that same Supabase project; server only |

In Supabase, open the project matching the URL above, then **Project Settings → API Keys**. Existing JWT keys are under **Legacy anon, service_role API keys**. Use the public/anon key on both services and the service-role key only on the API service. Do not post keys in chat or commit them to GitHub.

Save the settings. Rebuild/redeploy the website after changing any `VITE_` setting because those settings are baked into the JavaScript build. Restart/redeploy the API after updating its environment. The corrected source is on `codex/partcast-offline-forecasting-20261009`; select that branch for both Render services or merge the reviewed changes into the branch Render already deploys. A GitHub push to another branch does not update a service configured to deploy `main`.

Check:

1. Open `https://partcast.onrender.com/health`. It should return JSON with `ok: true`. This proves the server is running; it does not establish database access.
2. Open `https://partcast.onrender.com/setup/status`. It should return JSON containing `needsSetup`. If it fails, check the API service logs for missing/mismatched Supabase settings or missing migrations. Apply only unapplied migrations through `0004_offline_security_notifications.sql`.
3. Open the website and sign in. If a stale installed copy remains, sync any pending stock changes before accepting an app update. Do not clear browser data or sign out while there are unsent changes.

The application now rejects hosted websites pointing at localhost, insecure/missing API addresses, and API addresses containing `/health`. It checks project/role claims in legacy Supabase JWT configuration, normalizes CORS website addresses, and shows readable network errors with a retry action. These claim checks are configuration checks, not signature verification or a replacement for Supabase authentication.

The local environment review found a matching server public key, but the frontend public key and server service-role key belonged to another project. This was a check of workspace settings; Render settings could not be read through this environment's network. Recheck the actual Render values against the project above. If the API's health check works but authenticated requests fail in the browser, verify the exact `FRONTEND_ORIGINS` value and that the website was rebuilt with the correct API URL.

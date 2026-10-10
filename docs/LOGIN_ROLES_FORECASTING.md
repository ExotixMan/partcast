# Required login, access roles, and forecasting upgrade

The saved branch is `codex/partcast-offline-forecasting-20261009`. This release requires password **then** a six-digit email code through **Gmail API**. Owners manage the store; Super Admin manages Google connections and technical settings. Inventory contains part editing and stock corrections; Sell or receive contains all sales and deliveries.

## Upgrade an existing Supabase project

Keep the existing database. These migrations add tables, roles, and policies; they do not erase inventory, sales, forecasts, or customer balances. Apply only migrations that have not already run. Back up the current project before updating its schema.

1. Install any missing migrations 0001–0005 in order.
2. Run **0006_access_roles.sql by itself** and let it finish. PostgreSQL must commit the new enum values before another migration uses them.
3. Run **0007_verified_login_and_access.sql** in a separate SQL Editor execution.
4. Promote one trusted IT account to Super Admin. Existing Owners are deliberately not promoted automatically. Replace the email in this exact-account query:

```sql
update public.profiles p
set role = 'super_admin', active = true
from auth.users u
where p.id = u.id
  and lower(u.email) = lower('your-trusted-it-account@example.com');
```

Check that exactly the intended account changed. Keep the store Owner as `owner`, or create a separate Owner account after the Super Admin signs in. On a fresh installation, the setup-secret bootstrap creates the first **Super Admin**; later accounts are created through Staff access. Public Supabase signup should remain disabled.

Deploy the API and website together after the migration and Gmail configuration. The old website's alternative Supabase email-code method is no longer accepted for store access. Previously authenticated staff must sign in with their password and complete the Gmail code.

## Configure Gmail before releasing required codes

First add these variables to **Render → PartCast API → Environment**. They are server variables, never `VITE_` variables:

| Variable | Value to supply |
| --- | --- |
| `GMAIL_CLIENT_ID` | OAuth client ID from your Google Cloud project |
| `GMAIL_CLIENT_SECRET` | That client's secret |
| `GMAIL_REFRESH_TOKEN` | Refresh token authorized by the sending Google account |
| `GMAIL_SENDER_EMAIL` | Email address of that sending Google account |
| `INTEGRATION_ENCRYPTION_KEY` | Stable random secret of at least 32 characters |
| `GEMINI_API_KEY` | Gemini API key, for the final chatbot fallback |
| `GEMINI_MODEL` | `gemini-2.5-flash`, or another model enabled for your key |

Generate the encryption key locally, for example with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`, and enter its output privately in Render. Keep this key stable across deployments. When no dedicated key is configured, the stable server `IP_HASH_SECRET` is used; changing either active key invalidates stored encrypted connections and pending code hashes. No credential belongs in chat, GitHub, screenshots, or frontend environment settings.

In [Google Cloud Console](https://console.cloud.google.com/), enable Gmail API, configure the OAuth consent screen, and create an OAuth client. Authorize the sending account using `https://www.googleapis.com/auth/gmail.send`, with offline access so Google issues a refresh token. Follow [Google's server OAuth guide](https://developers.google.com/identity/protocols/oauth2/web-server) and [Gmail scopes](https://developers.google.com/workspace/gmail/api/auth/scopes). An OAuth client ID alone is insufficient. Google consent, publishing, test-user eligibility and token expiration depend on your Google project; a refresh token from an external app in Testing can expire after seven days. Use a durable authorized setup for store operations.

Restart/redeploy the API after adding environment values. A Super Admin can then open **IT settings** to replace Gmail or Gemini credentials and model selection. Secrets are encrypted in the database, returned as presence flags, and cleared from the form after saving. Blank saved secret fields preserve their existing values. Gmail stays enabled because login codes are mandatory. Gemini can be disabled; local help and database answers remain available. Database settings override the corresponding environment fallback.

**Check saved connection** for Gmail validates Google OAuth access and its send permission; it does not send mail. Confirm actual delivery by signing in to a controlled staff account with password followed by the received code. The Gemini check validates model access; test an appropriate unanswered store question separately to exercise generation.

If an incorrect saved Gmail connection prevents new logins, a trusted project administrator can recover in Supabase SQL Editor:

```sql
-- Removes only the saved Gmail override; does not touch store records.
-- Supply correct Gmail environment values first, then restart the API.
delete from public.integration_settings where provider = 'gmail';
```

## Access roles

| Role | Pages and actions |
| --- | --- |
| Super Admin | All business pages, staff roles, and IT settings |
| Owner | All store workflows, business settings, staff management; cannot assign Owner/Super Admin or change those accounts |
| Admin | Store workflows, imports, backups, supplier management and forecast updates; no IT settings or Owner controls |
| Inventory staff | Everyday stock and customer workflows; no management settings or forecast training |
| Cashier | Sell or receive, read-only Inventory, stock alerts, inventory assistant and own account |

Cashiers can record multi-part sales, credit sales and deliveries. They cannot edit product metadata, correct/remove stock, read customer balance/history pages, export reports or train forecasts. Owners review customer utang and record payments. The assistant restricts Cashier answers to part availability and selling prices; it does not expose restricted store summaries through chatbot queries. Inventory data still includes the saved unit cost required for receiving deliveries; these roles limit workflows, rather than promise field-level cost secrecy.

Page navigation and direct page URLs apply the same role rules. APIs enforce them independently, and PostgreSQL policies/RPC checks enforce access for direct database clients. Integration tables, code hashes and login-verification records are service-role-only.

Password sessions alone receive `OTP_REQUIRED` until the email code is verified. Codes expire after 10 minutes, allow five incorrect attempts, and have a 60-second resend delay. Verification is bound to the signed Supabase `session_id`, the active user, and the password authentication method; it lasts 12 hours. Password-free OTP sessions cannot access business data. Online logout revokes that session's code verification.

Offline use requires a previously verified password session and account-scoped inventory cache. A newly created session cannot reuse an older session's cached verification. Offline access stops when the proof or the 12-hour cache expires. Pending changes remain in the outbox when another code is required and can send after re-verification. Offline logout clears this device but cannot immediately revoke a server record; the server proof expires within 12 hours. Account revocation and role changes are enforced on every online request; an offline device learns them when it reconnects.

## Simple store workflows

- **Sell or receive:** choose Sale or Delivery, tap parts into a basket, check quantities/prices and save once. Tap a part photo to inspect it without adding it to the basket. Photos fit the frame without cropping. Credit sales retain customer name, amount paid, optional due date and balance. A sale's charged price is saved on that transaction and does not overwrite the catalog selling price. Deliveries update the saved purchase cost.
- **Inventory:** add parts, edit details/category/barcode/photos, and **Adjust stock** for damaged, missing or miscounted parts. Corrections require a reason and cannot remove more stock than available. Use Sell or receive for actual sales and deliveries. A Cashier can search/filter/scan/view photos here, with editing controls hidden.
- **Alerts:** check current low/out-of-stock notices. Alerts refresh after stock changes and can be marked read. Failed reads or marking display a retry action. A Cashier opens Inventory from an alert; other staff can review Restock.
- **IT settings:** available to Super Admin only. Store settings remain business controls available to Owner and Super Admin.

## Fix the Windows Python ENOENT error

The old error references another computer's virtual environment:

```text
spawn C:/Users/Admin/Downloads/PartCast_NPG_Deployable/partcast/.venv/Scripts/python.exe ENOENT
```

A virtual environment is installed for one machine and should not be copied between computers or into Render. The launcher now tries the configured executable, this project's local virtual environment, the Docker virtual environment, then Python on PATH. It probes the required packages and falls back to the bundled forecasting script if a copied script path is missing. The Demand planning page shows a readable engine status, and Super Admin can check it in IT settings.

On **Render**, use this repository's root **Dockerfile**, not a Node-only runtime. The image installs Python and analytics packages at `/opt/partcast-venv/bin/python`, with the script at `/app/ml/train_forecast.py`. Remove copied Windows `PYTHON_BIN`/`ML_SCRIPT_PATH` values, or use those Linux paths.

On **Windows**, open a terminal in the PartCast project root and install a fresh virtual environment:

```powershell
py -3 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r ml\requirements.txt
```

On **Linux/cloud**, run `bash scripts/cloud-setup.sh`. The project `.venv/bin/python` is detected automatically. Restart the API after installation. A Windows machine was not available for a native Windows execution check; the exact copied Windows path was exercised as an invalid setting in a real Linux Node-to-Python training test.

Forecasting now uses the Philippines calendar day for training and live sales observations. Each part still needs at least five positive-sale days, 35 days of history, and a usable record within the last 31 days. Old supplied histories deliberately remain ineligible for current estimates. Add recent **actual quantities**, rather than changing invoice dates to appear recent. A successful synthetic training test proves the runtime and model pipeline, not accuracy on your store data.

## Activation check

Set both Render services to the saved branch and rebuild/redeploy with the matching Supabase project keys. Confirm `/health`, then password plus email-code login and **Inventory saved**. Check Owner/Cashier restrictions with test accounts. Record a test sale/delivery, reconnect an offline sale, inspect photos and stock alerts, then update demand using eligible recent sales. Refer to [verification](VERIFICATION.md) for completed local checks and remaining live checks.

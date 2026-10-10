# Complete SQL to paste into Supabase

Use the SQL Editor in the intended project: **`ragdjkdcrvexqfadlqbf`**, whose API URL is **`https://ragdjkdcrvexqfadlqbf.supabase.co`**. Open [this project's SQL Editor](https://supabase.com/dashboard/project/ragdjkdcrvexqfadlqbf/sql/new). SQL does not choose your project's URL or transfer another project's records; the selected dashboard project and your Render environment values control the database PartCast uses.

These files install the complete PartCast schema on a fresh project, or upgrade a recognized existing PartCast schema. They replace application access policies/functions and preserve Auth accounts, inventory, sales, customer debts/payments, photos, saved encrypted connections and synchronization receipts. They do not reset or delete the database. Unrecognized/partial schemas stop with an error rather than guessing how to change your records.

## Run the full scripts in order

Back up existing store records first. Run during a store update: business-table access pauses after Part 1 until Part 2 succeeds. Each file is transactional. Do not deploy the new required-code login until Gmail is configured.

1. Open [01_schema_and_roles.sql](01_schema_and_roles.sql), click **Raw**, select/copy the entire file, paste it into a new Supabase SQL Editor query, and click **Run** using the `postgres` role. Wait for success. This includes all baseline tables, forecasting, offline sync, notifications, customer utang, categories, barcodes, photo metadata and the new roles.
2. Open [02_login_and_permissions.sql](02_login_and_permissions.sql) and run its entire contents in a **separate** SQL Editor execution after Part 1 commits. It installs password-session email verification, encrypted Google connection settings, final role policies and the current stock-operation functions. Do not run only highlighted fragments. PostgreSQL requires this separate commit before the new enum roles are used.
3. For an existing store, open [03_activate_super_admin.sql](03_activate_super_admin.sql). Replace `REPLACE_WITH_YOUR_LOGIN_EMAIL` with the **exact email of the existing account** that will administer IT settings, then run it separately. It promotes only that account. It stops if the email is unchanged or the account is absent. Other store Owners remain Owners. For a fresh project with no Auth accounts, use PartCast's initial-account setup and your `SETUP_SECRET` to create the first Super Admin instead.

If you already have Auth accounts on a fresh schema, Part 1 adds any missing inactive profiles. Use Part 3 to activate the intended IT account. Accounts created manually in Supabase need a password and confirmed email for password login; other staff can then be added through PartCast Staff access. Keep public Auth signup disabled.

Both main scripts can be repeated after a successful installation. If a query fails, fix that error before continuing. A failed Part 2 leaves business access paused; correct it and rerun the **whole Part 2**, rather than deleting tables or bypassing email verification. These files support official PartCast schemas; a custom or incomplete schema needs separate review. For files to install correctly, the hosted API and website must use the matching release on branch `codex/partcast-offline-forecasting-20261009`.

## APIs and credentials required

| Provider | Purpose | Values needed | Where to obtain them |
| --- | --- | --- | --- |
| Supabase | Database, accounts and private image/model storage | Project URL, public `anon` key, server-only `service_role` key | [This project's API settings](https://supabase.com/dashboard/project/ragdjkdcrvexqfadlqbf/settings/api); use keys from this project |
| Gmail API | Required email login code after the password | OAuth client ID, client secret, authorized refresh token, sending account email | [Google Cloud Console](https://console.cloud.google.com/); enable Gmail API and authorize the sender with `https://www.googleapis.com/auth/gmail.send` and offline access |
| Gemini API | Chatbot's final AI fallback after local help and database answers | Gemini API key and enabled model | [Google AI Studio](https://aistudio.google.com/apikey) |
| Brevo | Supplier/low-stock emails | API key and verified sender email | [Brevo](https://app.brevo.com/); supplier email addresses are entered in PartCast |

Gmail needs the OAuth credentials and refresh token; a single API key is insufficient. External Google consent apps in Testing may issue refresh tokens that expire after seven days. Follow [Google's server OAuth instructions](https://developers.google.com/identity/protocols/oauth2/web-server) and the [PartCast activation guide](../../docs/LOGIN_ROLES_FORECASTING.md). Gmail and Supabase are required for staff login. Gemini is required for AI fallback; local/database answers work without it. Brevo is required for email alerts and supplier messages. Python/XGBoost forecasting runs on the API server and needs **no external forecasting API key**.

Enter credentials directly in Render or cloud environment settings. Do not put secret keys/tokens into SQL, chat, GitHub or `VITE_` settings.

### Obtain Gmail's four settings

1. In Google Cloud Console, choose your Google project and enable **Gmail API** under APIs & Services.
2. Configure the OAuth consent screen. If the app is in Testing, add the sending Google account as a test user. Complete Google's publishing/verification requirements for ongoing store use; Testing refresh tokens can expire.
3. Create an OAuth client of type **Web application**. For this one-time token setup, add `https://developers.google.com/oauthplayground` as an authorized redirect URI. Copy that client's ID and secret privately.
4. Open [Google OAuth 2.0 Playground](https://developers.google.com/oauthplayground). Open the settings gear, select **Use your own OAuth credentials**, and enter your client ID and secret there.
5. In Step 1, enter `https://www.googleapis.com/auth/gmail.send`, click **Authorize APIs**, and authorize the Google account that will send PartCast codes. In Step 2, exchange the authorization code for tokens and copy the **refresh token** privately.
6. Enter that client ID, client secret and refresh token in the three `GMAIL_` variables on the API service. Set `GMAIL_SENDER_EMAIL` to the Google account you authorized, then save/redeploy the API. Test delivery using an actual password-plus-code login. Never paste these secrets into this chat.

The authorized redirect URI is for obtaining the sender's refresh token; store users still sign into PartCast with their own password and received email code.

## Render: API service environment

Open the API service serving **`https://partcast.onrender.com`** → **Environment**. Use **Add from .env** if available, or enter each variable. Replace every `REPLACE_...` placeholder privately. Keep existing random secrets stable when upgrading.

```dotenv
NODE_ENV=production
SUPABASE_URL=https://ragdjkdcrvexqfadlqbf.supabase.co
SUPABASE_ANON_KEY=REPLACE_WITH_THIS_PROJECT_PUBLIC_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=REPLACE_WITH_THIS_PROJECT_SERVICE_ROLE_KEY
FRONTEND_ORIGINS=https://partcast-web.onrender.com

GMAIL_CLIENT_ID=REPLACE_WITH_GOOGLE_OAUTH_CLIENT_ID
GMAIL_CLIENT_SECRET=REPLACE_WITH_GOOGLE_OAUTH_CLIENT_SECRET
GMAIL_REFRESH_TOKEN=REPLACE_WITH_AUTHORIZED_GMAIL_REFRESH_TOKEN
GMAIL_SENDER_EMAIL=REPLACE_WITH_SENDING_GOOGLE_ACCOUNT_EMAIL

GEMINI_API_KEY=REPLACE_WITH_GEMINI_API_KEY
GEMINI_MODEL=gemini-2.5-flash
BREVO_API_KEY=REPLACE_WITH_BREVO_API_KEY
BREVO_SENDER_EMAIL=REPLACE_WITH_VERIFIED_BREVO_SENDER_EMAIL
BREVO_SENDER_NAME=NPG Autoparts - PartCast

SETUP_SECRET=REPLACE_WITH_STABLE_RANDOM_SETUP_SECRET_AT_LEAST_16_CHARACTERS
CRON_SECRET=REPLACE_WITH_STABLE_RANDOM_CRON_SECRET_AT_LEAST_24_CHARACTERS
IP_HASH_SECRET=REPLACE_WITH_STABLE_RANDOM_HASH_SECRET_AT_LEAST_16_CHARACTERS
INTEGRATION_ENCRYPTION_KEY=REPLACE_WITH_STABLE_RANDOM_ENCRYPTION_KEY_AT_LEAST_32_CHARACTERS
BACKUP_RETENTION_DAYS=30

PYTHON_BIN=/opt/partcast-venv/bin/python
ML_SCRIPT_PATH=/app/ml/train_forecast.py
```

The Python paths above apply to the repository's **Docker** deployment on Render. Use the root Dockerfile so Python and analytics packages are installed. Set both services to the saved branch and redeploy. Configure Gmail before deploying required-code login. If Gemini or Brevo is intentionally unused, omit its variables instead of entering placeholders.

The application also accepts the newer Supabase public/secret key format, but use this project's legacy `anon` and `service_role` keys when following the labels above. Never put a service-role/secret key on the website. The frontend public key and backend public key should match, and all Supabase values must belong to the same project.

If the store previously saved Gmail/Gemini connections in IT settings, those encrypted overrides take precedence over environment fallback. The stable encryption key must match the one used to save them. **If a store previously relied on `IP_HASH_SECRET` instead of a dedicated encryption key, continue that configuration for this upgrade**; omit `INTEGRATION_ENCRYPTION_KEY` until you intentionally migrate the saved settings. Changing the active key invalidates saved connections and pending code hashes. Connection recovery is documented in the activation guide.

## Render: website environment

Open **`https://partcast-web.onrender.com`**'s service → **Environment**:

```dotenv
VITE_SUPABASE_URL=https://ragdjkdcrvexqfadlqbf.supabase.co
VITE_SUPABASE_ANON_KEY=REPLACE_WITH_THE_SAME_PUBLIC_ANON_KEY_AS_THE_API
VITE_API_URL=https://partcast.onrender.com
```

Save and rebuild/redeploy the website. Vite embeds these values during the build; changing them without rebuilding does not update the website. Use the API origin above without `/health`.

## Confirm activation

Check [API health](https://partcast.onrender.com/health), then sign in using password followed by the Gmail code. Confirm **Inventory saved**, the correct role's pages, an authorized test sale/delivery and notification refresh. Gmail delivery, provider configuration, database availability and Render deployment still need live verification. The complete SQL scripts were checked with real PostgreSQL through PGlite for fresh installation, original-schema upgrade, repeat execution, preserved credit/payment/outbox records, denied stock edits and required login verification. No production migration or real email was executed when preparing these files.

The two main SQL files are generated from the versioned migrations with `node scripts/build-supabase-paste-sql.mjs`. Regenerate after changing a migration and run `node --test tests/paste-sql.test.js` from `apps/server`.

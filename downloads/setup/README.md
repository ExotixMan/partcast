# Fresh Supabase installation

Download [PartCast_Fresh_Supabase_Setup.zip](PartCast_Fresh_Supabase_Setup.zip), extract it and read `READ_FIRST.md` before running the SQL. The [complete guide](../../docs/SUPABASE_FRESH_START.md) is also available on GitHub.

This package installs PartCast on a **new empty Supabase project**. It does not erase or restore an existing project and contains no store records or credentials. Run Parts 1 and 2 in separate SQL Editor executions, then run the read-only verification file. Part 1 refuses projects that already contain Auth accounts, application tables or Storage buckets.

Generated from the current reviewed application setup files with `node scripts/build-supabase-fresh-start.mjs`. Accounts, photos and required store records must be created or imported afterward as described in the guide.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

const root = new URL('../../../', import.meta.url);
const archive = await JSZip.loadAsync(await readFile(new URL('downloads/setup/PartCast_Fresh_Supabase_Setup.zip', root)));
const first = await archive.file('01_schema_and_roles.sql').async('string');
const second = await archive.file('02_login_and_permissions.sql').async('string');
const verification = await archive.file('03_verify_installation.sql').async('string');

async function database() {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema storage;
    create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');
    create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create function auth.role() returns text language sql stable as $$select nullif(current_setting('request.jwt.claim.role',true),'')$$;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key,bucket_id text);
    alter table storage.objects enable row level security;
    grant usage on schema public,auth,storage to anon,authenticated,service_role;
  `);
  return db;
}

test('delivered ZIP installs on an empty project and verifies email-code and role restrictions', async () => {
  const db = await database();
  try {
    assert.deepEqual(Object.keys(archive.files).sort(), ['01_schema_and_roles.sql','02_login_and_permissions.sql','03_verify_installation.sql','READ_FIRST.md']);
    assert.equal(second, await readFile(new URL('supabase/paste-ready/02_login_and_permissions.sql', root), 'utf8'));
    await db.exec(first);
    await assert.rejects(db.exec(verification), /Missing protected table: email_login_challenges/);
    await db.exec('rollback;');
    await db.exec(second);
    const checks = await db.exec(verification);
    const counts = checks.find(result => result.rows?.[0]?.auth_accounts !== undefined).rows[0];
    assert.deepEqual(counts, { auth_accounts: 0, staff_profiles: 0, inventory_items: 0, demand_observations: 0, legacy_sales: 0, customer_debts: 0 });
    await assert.rejects(db.exec(first), /already has application tables/);
    await db.exec('rollback;');
    await db.exec(verification);
    await db.exec('grant execute on function public.issue_email_challenge(uuid,uuid,text) to authenticated;');
    await assert.rejects(db.exec(verification), /restricted to the API service role/);
    await db.exec('rollback;');
  } finally { await db.close(); }
});

test('fresh-only installation refuses existing accounts before making schema changes', async () => {
  const db = await database();
  try {
    await db.exec("insert into auth.users(id,email) values('11111111-1111-4111-8111-111111111111','fixture@example.test');");
    await assert.rejects(db.exec(first), /already has Auth accounts/);
    await db.exec('rollback;');
    assert.equal((await db.query('select count(*) n from auth.users')).rows[0].n, 1);
    assert.equal((await db.query("select to_regclass('public.products') as products")).rows[0].products, null);
  } finally { await db.close(); }
});

test('fresh-only installation preserves existing application tables and storage buckets', async () => {
  const db = await database();
  try {
    await db.exec("create table public.existing_data(value text); insert into public.existing_data values('preserve');");
    await assert.rejects(db.exec(first), /already has application tables/);
    await db.exec('rollback;');
    assert.equal((await db.query('select value from public.existing_data')).rows[0].value, 'preserve');
    await db.exec("drop table public.existing_data; insert into storage.buckets(id,name,public)values('existing','existing',false);");
    await assert.rejects(db.exec(first), /already has Storage buckets/);
    await db.exec('rollback;');
    assert.equal((await db.query('select id from storage.buckets')).rows[0].id, 'existing');
    assert.equal((await db.query("select to_regclass('public.products') as products")).rows[0].products, null);
  } finally { await db.close(); }
});

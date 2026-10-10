import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

const sql = name => readFile(new URL(`../../../supabase/${name}`, import.meta.url), 'utf8');
const first = await sql('paste-ready/01_schema_and_roles.sql');
const second = await sql('paste-ready/02_login_and_permissions.sql');
const user = '11111111-1111-4111-8111-111111111111';
const product = '22222222-2222-4222-8222-222222222222';
const session = '33333333-3333-4333-8333-333333333333';

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
async function authenticated(db) {
  await db.exec(`reset role;
    select set_config('request.jwt.claim.sub','${user}',false);
    select set_config('request.jwt.claim.role','authenticated',false);
    select set_config('request.jwt.claims','{"session_id":"${session}","amr":[{"method":"password"}]}',false);
    set role authenticated;`);
}
async function rollback(db) { await db.exec('rollback;reset role;'); }

test('complete paste-ready SQL installs fresh, preserves records and can be repeated', async t => {
  const db = await database();
  try {
    await t.test('Part 2 requires Part 1; existing Auth users receive inactive profiles', async () => {
      await assert.rejects(db.exec(second), /Run Part 1 first/);
      await rollback(db);
      await db.exec(`insert into auth.users(id,raw_user_meta_data)values('${user}','{"full_name":"Test owner"}');`);
      await db.exec(first);
      const account = (await db.query('select role,active,full_name from profiles')).rows[0];
      assert.deepEqual(account, { role: 'inventory_staff', active: false, full_name: 'Test owner' });
      assert.equal((await db.query('select * from pg_policies where schemaname=\'public\'')).rows.length, 0);
      await db.exec(second);
      assert.equal((await db.query('select * from integration_settings')).rows.length, 0);
    });
    await t.test('requires a password session and code before table and movement access', async () => {
      await db.exec(`update profiles set active=true,role='owner' where id='${user}';
        insert into products(id,description,current_stock,unit_cost,selling_price,photo_paths)
        values('${product}','Test part',8,50,75,array['${product}/photo.webp']);`);
      await authenticated(db);
      assert.equal((await db.query('select * from products')).rows.length, 0);
      await assert.rejects(db.query("select apply_inventory_transaction($1,'sale',1)", [product]), /Not authorized/);
      await db.exec(`reset role;insert into login_verifications(session_id,user_id,expires_at)values('${session}','${user}',now()+interval '12 hours');`);
      await authenticated(db);
      assert.equal((await db.query('select * from inventory_status')).rows.length, 1);
      await assert.rejects(db.exec('update products set current_stock=900'), /permission denied/);
      await assert.rejects(db.exec('select * from integration_settings'), /permission denied/);
      await assert.rejects(db.exec('truncate products cascade'), /permission denied/);
    });
    const operation = '44444444-4444-4444-8444-444444444444';
    const sale = { kind: 'batch', tx_type: 'sale', lines: [{ product_id: product, quantity: 2, unit_price: 75 }], is_credit: true, customer_name: 'Test customer', paid_amount: 50 };
    let saved;
    await t.test('credit sale and partial payment work with explicit installation grants', async () => {
      saved = (await db.query('select sync_store_operation($1,$2::jsonb) result', [operation, JSON.stringify(sale)])).rows[0].result;
      assert.equal(saved.balance, 100);
      const payment = { kind: 'payment', debt_id: saved.debtId, amount: 25 };
      await db.query('select sync_store_operation($1,$2::jsonb)', ['55555555-5555-4555-8555-555555555555', JSON.stringify(payment)]);
      assert.equal(Number((await db.query('select balance from customer_balances')).rows[0].balance), 75);
    });
    await t.test('repeating Part 2 preserves verification, encrypted settings and financial records', async () => {
      await db.exec(`reset role;insert into integration_settings(provider,encrypted_config)values('gemini','synthetic-encrypted-config');`);
      await db.exec(second);
      await authenticated(db);
      assert.deepEqual((await db.query('select sync_store_operation($1,$2::jsonb) result', [operation, JSON.stringify(sale)])).rows[0].result, saved);
      assert.equal((await db.query('select count(*) n from inventory_transactions')).rows[0].n, 1);
      assert.equal(Number((await db.query('select balance from customer_balances')).rows[0].balance), 75);
    });
    await t.test('repeating both parts pauses access then restores it without changing stock or photos', async () => {
      await db.exec('reset role;grant update(current_stock) on products to authenticated;');
      await db.exec(first);
      await authenticated(db);
      assert.equal((await db.query('select * from products')).rows.length, 0);
      await assert.rejects(db.query('select sync_store_operation($1,$2::jsonb)', [operation, JSON.stringify(sale)]), /Not authorized/);
      await db.exec('reset role;');
      await db.exec(second);
      await authenticated(db);
      const item = (await db.query('select current_stock,unit_cost,selling_price,photo_paths from products')).rows[0];
      assert.equal(Number(item.current_stock), 6);
      assert.equal(Number(item.unit_cost), 50);
      assert.equal(Number(item.selling_price), 75);
      assert.deepEqual(item.photo_paths, [`${product}/photo.webp`]);
      await assert.rejects(db.exec('update products set current_stock=900'), /permission denied/);
      assert.equal(Number((await db.query('select balance from customer_balances')).rows[0].balance), 75);
      await db.exec('reset role;');
      assert.equal((await db.query('select encrypted_config from integration_settings')).rows[0].encrypted_config, 'synthetic-encrypted-config');
      assert.equal((await db.query('select count(*) n from auth.users')).rows[0].n, 1);
    });
    await t.test('an incomplete existing feature stops before replacing access or losing store records', async () => {
      await db.exec('alter table inventory_transactions rename column batch_id to saved_batch_id;');
      await assert.rejects(db.exec(first), /Incomplete PartCast feature: missing inventory_transactions.batch_id/);
      await rollback(db);
      assert.equal(Number((await db.query('select current_stock from products')).rows[0].current_stock), 6);
      assert.equal((await db.query('select count(*) n from debt_payments')).rows[0].n, 1);
      await db.exec('alter table inventory_transactions rename column saved_batch_id to batch_id;');
    });
  } finally { await db.close(); }
});

test('complete SQL upgrades an original PartCast database and rejects an unrelated partial schema', async t => {
  const db = await database();
  try {
    await t.test('unrecognized schema stops and rolls back without deleting its records', async () => {
      await db.exec("create table public.products(description text);insert into products values('Unrelated preserved record');");
      await assert.rejects(db.exec(first), /not a complete PartCast schema/);
      await rollback(db);
      assert.equal((await db.query('select description from products')).rows[0].description, 'Unrelated preserved record');
      await db.exec('drop table public.products;');
    });
    await t.test('original migrations 0001–0003 upgrade with preserved stock and roles', async () => {
      for (const name of ['0001_schema.sql', '0002_rls.sql', '0003_training_import.sql']) await db.exec(await sql(`migrations/${name}`));
      await db.exec(`insert into auth.users(id)values('${user}');update profiles set active=true,role='owner' where id='${user}';
        insert into products(id,description,current_stock)values('${product}','Existing part',10);`);
      await db.exec(first);
      await db.exec(second);
      assert.equal(Number((await db.query('select current_stock from products')).rows[0].current_stock), 10);
      assert.deepEqual((await db.query('select role,active from profiles')).rows[0], { role: 'owner', active: true });
      assert.equal((await db.query('select count(*) n from stock_notifications')).rows[0].n, 0);
      assert.equal((await db.query('select enum_range(null::app_role)::text as roles')).rows[0].roles, '{owner,admin,inventory_staff,super_admin,cashier}');
    });
    await t.test('Super Admin activation requires an exact existing email and changes only that account', async () => {
      const promote = await sql('paste-ready/03_activate_super_admin.sql');
      await assert.rejects(db.exec(promote), /Replace REPLACE_WITH_YOUR_LOGIN_EMAIL/);
      await rollback(db);
      await assert.rejects(db.exec(promote.replaceAll('REPLACE_WITH_YOUR_LOGIN_EMAIL', 'missing@example.test')), /No Auth account exists/);
      await rollback(db);
      await db.exec(`update auth.users set email='owner@example.test' where id='${user}';
        insert into auth.users(id,email)values('${session}','staff@example.test');`);
      await db.exec(`update auth.users set email='owner@example.test' where id='${session}';`);
      await assert.rejects(db.exec(promote.replaceAll('REPLACE_WITH_YOUR_LOGIN_EMAIL', 'owner@example.test')), /More than one Auth account/);
      await rollback(db);
      assert.deepEqual((await db.query('select role,active from profiles where id=$1', [user])).rows[0], { role: 'owner', active: true });
      await db.exec(`update auth.users set email='staff@example.test' where id='${session}';`);
      await db.exec(promote.replaceAll('REPLACE_WITH_YOUR_LOGIN_EMAIL', 'owner@example.test'));
      assert.deepEqual((await db.query('select role,active from profiles where id=$1', [user])).rows[0], { role: 'super_admin', active: true });
      assert.deepEqual((await db.query('select role,active from profiles where id=$1', [session])).rows[0], { role: 'inventory_staff', active: false });
    });
  } finally { await db.close(); }
});

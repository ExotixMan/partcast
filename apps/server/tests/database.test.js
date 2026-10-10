import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

const staff='11111111-1111-4111-8111-111111111111';
const inactive='22222222-2222-4222-8222-222222222222';
const product='33333333-3333-4333-8333-333333333333';
const operation='44444444-4444-4444-8444-444444444444';

test('real PostgreSQL migrations, atomic sync, access control and alerts', async t => {
 const db=new PGlite({extensions:{pgcrypto}});
 await db.exec(`
 create role anon;create role authenticated;create role service_role bypassrls;
 create schema auth;create schema storage;
 create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function auth.role() returns text language sql stable as $$select nullif(current_setting('request.jwt.claim.role',true),'')$$;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key,bucket_id text);
 alter table storage.objects enable row level security;
 grant usage on schema public,auth,storage to anon,authenticated,service_role;
 `);
 for(const file of ['0001_schema.sql','0002_rls.sql','0003_training_import.sql','0004_offline_security_notifications.sql','0005_store_workflows.sql']){
  await db.exec(await readFile(new URL(`../../../supabase/migrations/${file}`,import.meta.url),'utf8'));
 }
 // Match Supabase default grants, then reapply the migration's deliberate revocations.
 await db.exec('grant select on all tables in schema public to authenticated;');
 await db.exec(`insert into auth.users(id) values('${staff}'),('${inactive}');update public.profiles set active=true where id='${staff}';insert into products(id,description,current_stock,minimum_stock)values('${product}','Brake pad',5,2);`);
 const claims=async id=>{await db.exec(`reset role;select set_config('request.jwt.claim.sub','${id}',false);select set_config('request.jwt.claim.role','authenticated',false);set role authenticated;`);};
 const payload={product_id:product,tx_type:'sale',quantity:3,occurred_at:'2026-01-01T12:00:00.000Z'};
 const sync=(id,body)=>db.query('select public.sync_inventory_movement($1,$2::jsonb) as id',[id,JSON.stringify(body)]);
 await t.test('active staff can read; inactive accounts cannot',async()=>{
  await claims(staff);assert.equal((await db.query('select * from products')).rows.length,1);
  await claims(inactive);assert.equal((await db.query('select * from products')).rows.length,0);
  await assert.rejects(sync(operation,payload),/Not authorized/);
  await assert.rejects(db.query(`select apply_inventory_transaction('${product}','sale',1)`),/Not authorized/);
 });
 await t.test('retry commits one sale and one demand observation',async()=>{
  await claims(staff);const first=await sync(operation,payload),retry=await sync(operation,payload);
  assert.equal(first.rows[0].id,retry.rows[0].id);
  assert.equal(Number((await db.query('select current_stock from products')).rows[0].current_stock),2);
  assert.equal((await db.query('select * from inventory_transactions')).rows.length,1);
  assert.equal((await db.query('select * from demand_observations')).rows.length,1);
 });
 await t.test('conflicting retries and overselling roll back',async()=>{
  await assert.rejects(sync(operation,{...payload,quantity:1}),/different movement/);
  await assert.rejects(sync('55555555-5555-4555-8555-555555555555',{...payload,quantity:3}),/Insufficient stock/);
  assert.equal(Number((await db.query('select current_stock from products')).rows[0].current_stock),2);
 });
 await t.test('direct stock writes and fabricated transactions are denied',async()=>{
  await assert.rejects(db.query('update products set current_stock=100'),/permission denied/);
  await assert.rejects(db.query(`insert into inventory_transactions(product_id,tx_type,quantity)values('${product}','sale',1)`),/permission denied/);
  await assert.rejects(db.query('select claim_job(\'supplier-email\',gen_random_uuid(),120)'),/permission denied/);
 });
 await t.test('stock alerts transition and resolve after restock',async()=>{
  assert.equal((await db.query('select kind from stock_notifications where resolved_at is null')).rows[0].kind,'low');
  await sync('66666666-6666-4666-8666-666666666666',{...payload,quantity:2});
  assert.equal((await db.query('select kind from stock_notifications where resolved_at is null')).rows[0].kind,'out');
  await sync('77777777-7777-4777-8777-777777777777',{...payload,tx_type:'stock_in',quantity:5});
  assert.equal((await db.query('select * from stock_notifications where resolved_at is null')).rows.length,0);
 });
 await t.test('notification read state belongs to its account',async()=>{
  const id=(await db.query('select id from stock_notifications limit 1')).rows[0].id;
  await db.query('insert into notification_reads(notification_id,user_id) values($1,$2)',[id,staff]);
  await assert.rejects(db.query('insert into notification_reads(notification_id,user_id) values($1,$2)',[id,inactive]),/row-level security/);
 });
 await t.test('email job lease excludes overlapping checks and releases only by owner',async()=>{
  await db.exec('reset role;');
  assert.equal((await db.query('select claim_job($1,$2,120) as claimed',['supplier-email',operation])).rows[0].claimed,true);
  assert.equal((await db.query('select claim_job($1,$2,120) as claimed',['supplier-email',staff])).rows[0].claimed,false);
  await db.query('select release_job($1,$2)',['supplier-email',staff]);
  assert.equal((await db.query('select claim_job($1,$2,120) as claimed',['supplier-email',staff])).rows[0].claimed,false);
  await db.query('select release_job($1,$2)',['supplier-email',operation]);
  assert.equal((await db.query('select claim_job($1,$2,120) as claimed',['supplier-email',staff])).rows[0].claimed,true);
 });
 await t.test('baskets, credit and payments are atomic and retry safely',async()=>{
  await db.exec(`reset role;insert into products(id,description,current_stock)values('99999999-9999-4999-8999-999999999999','Engine oil',3);`);
  await claims(staff);
  const batch={kind:'batch',tx_type:'sale',lines:[{product_id:product,quantity:2,unit_price:100},{product_id:'99999999-9999-4999-8999-999999999999',quantity:1,unit_price:50}],customer_name:'Test customer',is_credit:true,paid_amount:100,occurred_at:'2026-01-01T12:00:00Z',due_date:'2026-02-01'};
  const op='88888888-8888-4888-8888-888888888888';
  const call=(id,payload)=>db.query('select sync_store_operation($1,$2::jsonb) as result',[id,JSON.stringify(payload)]);
  const before=(await db.query('select count(*) n from inventory_transactions')).rows[0].n;
  await assert.rejects(call(op,{...batch,lines:[batch.lines[0],{...batch.lines[1],quantity:4}]}),/Insufficient stock/);
  assert.equal((await db.query('select count(*) n from inventory_transactions')).rows[0].n,before);
  assert.equal((await db.query('select count(*) n from stock_batches')).rows[0].n,0);
  const result=(await call(op,batch)).rows[0].result;
  assert.equal(result.total,250);assert.equal(result.balance,150);
  assert.deepEqual((await call(op,batch)).rows[0].result,result);
  assert.equal((await db.query('select count(*) n from stock_batches')).rows[0].n,1);
  assert.equal((await db.query('select count(*) n from customer_debts')).rows[0].n,1);
  await assert.rejects(call(op,{...batch,paid_amount:0}),/different change/);
  const payment={kind:'payment',debt_id:result.debtId,amount:60,occurred_at:'2026-01-02T12:00:00Z'};
  const payOp='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  assert.equal((await call(payOp,payment)).rows[0].result.balance,90);
  await call(payOp,payment);assert.equal((await db.query('select count(*) n from debt_payments')).rows[0].n,1);
  await assert.rejects(call('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',{...payment,amount:91}),/remaining balance/);
  await assert.rejects(call('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',{...payment,amount:0.001}),/decimal places/);
  await assert.rejects(db.query(`insert into debt_payments(debt_id,amount)values('${result.debtId}',100)`),/permission denied/);
  assert.equal(Number((await db.query('select balance from customer_balances')).rows[0].balance),90);
  await claims(inactive);assert.equal((await db.query('select * from customer_balances')).rows.length,0);
  await assert.rejects(call('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',payment),/Not authorized/);
  await claims(staff);
  const finished=(await call('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',{...payment,amount:90})).rows[0].result;
  assert.equal(finished.balance,0);assert.equal((await db.query('select status from customer_balances')).rows[0].status,'paid');
 });
 await t.test('existing customer debt can retain a past due date',async()=>{
  await claims(staff);
  const payload={kind:'debt',customer_name:'Existing customer',principal:125.5,due_date:'2020-01-01'};
  const op='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const result=(await db.query('select sync_store_operation($1,$2::jsonb) result',[op,JSON.stringify(payload)])).rows[0].result;
  const balance=(await db.query('select * from customer_balances where id=$1',[result.debtId])).rows[0];
  assert.equal(balance.status,'overdue');assert.equal(Number(balance.balance),125.5);
  const retried=(await db.query('select sync_store_operation($1,$2::jsonb) result',[op,JSON.stringify(payload)])).rows[0].result;
  assert.deepEqual(retried,result);
 });
 await db.close();
});

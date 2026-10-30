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
 create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function auth.role() returns text language sql stable as $$select nullif(current_setting('request.jwt.claim.role',true),'')$$;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key,bucket_id text);
 alter table storage.objects enable row level security;
 grant usage on schema public,auth,storage to anon,authenticated,service_role;
 `);
 for(const file of ['0001_schema.sql','0002_rls.sql','0003_training_import.sql','0004_offline_security_notifications.sql','0005_store_workflows.sql','0006_access_roles.sql']){
  await db.exec(await readFile(new URL(`../../../supabase/migrations/${file}`,import.meta.url),'utf8'));
 }

 await db.exec('grant select on all tables in schema public to authenticated;');
 await db.exec(await readFile(new URL('../../../supabase/migrations/0007_verified_login_and_access.sql',import.meta.url),'utf8'));
 await db.exec(await readFile(new URL('../../../supabase/migrations/0008_restock_threshold.sql',import.meta.url),'utf8'));
 await db.exec(await readFile(new URL('../../../supabase/migrations/0009_small_restock_orders.sql',import.meta.url),'utf8'));
 await db.exec(await readFile(new URL('../../../supabase/migrations/0010_sale_price_validation.sql',import.meta.url),'utf8'));
 await db.exec(await readFile(new URL('../../../supabase/migrations/0011_restock_workflows.sql',import.meta.url),'utf8'));
 await db.exec(await readFile(new URL('../../../supabase/migrations/0012_sale_financial_integrity.sql',import.meta.url),'utf8'));
 await db.exec(await readFile(new URL('../../../supabase/migrations/0013_realtime.sql',import.meta.url),'utf8'));
 await db.exec(await readFile(new URL('../../../supabase/migrations/0014_automatic_forecasts.sql',import.meta.url),'utf8'));
 await db.exec(`insert into auth.users(id) values('${staff}'),('${inactive}');update public.profiles set active=true where id='${staff}';insert into products(id,description,current_stock,minimum_stock)values('${product}','Brake pad',5,2);`);
 await db.exec(`insert into login_verifications(session_id,user_id,expires_at) values('${staff}','${staff}',now()+interval '12 hours'),('${inactive}','${inactive}',now()+interval '12 hours');`);
 const claims=async id=>{await db.exec(`reset role;select set_config('request.jwt.claim.sub','${id}',false);select set_config('request.jwt.claim.role','authenticated',false);select set_config('request.jwt.claims','{"session_id":"${id}","amr":[{"method":"password"}]}',false);set role authenticated;`);};
 const payload={product_id:product,tx_type:'sale',quantity:3,unit_price:100,occurred_at:'2026-01-01T12:00:00.000Z'};
 const sync=(id,body)=>db.query('select public.sync_inventory_movement($1,$2::jsonb) as id',[id,JSON.stringify(body)]);
 await t.test('email verification is required for table access and direct RPCs; codes are session bound',async()=>{
  await db.exec(`delete from login_verifications where user_id='${staff}';`);
  await claims(staff);
  assert.equal((await db.query('select * from products')).rows.length,0);
  await assert.rejects(sync(operation,payload),/Not authorized/);
  await assert.rejects(db.query('select issue_email_challenge($1,$2,$3)',[staff,staff,'a'.repeat(64)]),/permission denied/);
  await assert.rejects(db.query('select * from integration_settings'),/permission denied/);
  await db.exec('reset role;');
  const issue=(session,hash)=>db.query('select issue_email_challenge($1,$2,$3)',[staff,session,hash]);
  const verify=(session,hash)=>db.query('select verify_email_challenge($1,$2,$3) result',[staff,session,hash]);
  await issue(staff,'a'.repeat(64));
  await assert.rejects(issue(staff,'b'.repeat(64)),/Wait 60 seconds/);
  assert.equal((await verify(inactive,'a'.repeat(64))).rows[0].result.verified,false);
  await assert.rejects(verify(staff,null),/Invalid sign-in request/);
  for(let i=0;i<5;i++)assert.equal((await verify(staff,'b'.repeat(64))).rows[0].result.verified,false);
  assert.equal((await verify(staff,'a'.repeat(64))).rows[0].result.verified,false);
  await db.exec(`update email_login_challenges set sent_at=now()-interval '61 seconds' where session_id='${staff}';`);
  await issue(staff,'a'.repeat(64));
  await db.exec(`update email_login_challenges set expires_at=now()-interval '1 minute' where session_id='${staff}';`);
  assert.match((await verify(staff,'a'.repeat(64))).rows[0].result.error,/expired/);
  await db.exec(`update email_login_challenges set sent_at=now()-interval '61 seconds' where session_id='${staff}';`);
  await issue(staff,'a'.repeat(64));
  assert.equal((await verify(staff,'a'.repeat(64))).rows[0].result.verified,true);
  assert.equal((await verify(staff,'a'.repeat(64))).rows[0].result.verified,true);
  assert.equal((await db.query('select * from email_login_challenges')).rows.length,0);
  await claims(staff);
  await db.exec(`select set_config('request.jwt.claims','{"session_id":"${staff}","amr":[{"method":"otp"}]}',false);`);
  assert.equal((await db.query('select * from products')).rows.length,0);
  await claims(staff);
 });
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
 await t.test('unpriced direct sales roll back stock and never create demand or debt',async()=>{
  const before=(await db.query('select current_stock from products where id=$1',[product])).rows[0];
  const records=(await db.query('select count(*) n from inventory_transactions')).rows[0].n;
  for(const price of [null,0])await assert.rejects(db.query("select apply_inventory_transaction($1,'sale',1,null,$2)",[product,price]),/selling price greater than zero/);
  assert.deepEqual((await db.query('select current_stock from products where id=$1',[product])).rows[0],before);
  assert.equal((await db.query('select count(*) n from inventory_transactions')).rows[0].n,records);
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
  const initialStocks=(await db.query('select id,current_stock from products order by id')).rows;
  for(const unit_price of [0,null]){
   await assert.rejects(call(op,{...batch,paid_amount:0,lines:[{...batch.lines[0],unit_price},batch.lines[1]]}),/selling price greater than zero|valid amount/);
  }
  await assert.rejects(call(op,{...batch,paid_amount:251}),/Payment cannot exceed/);
  assert.deepEqual((await db.query('select id,current_stock from products order by id')).rows,initialStocks);
  assert.equal((await db.query('select count(*) n from customer_debts')).rows[0].n,0);
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
 await t.test('cashier can sell and receive atomically but cannot edit metadata, remove stock or read management tables',async()=>{
  const cashier='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  await db.exec(`reset role;insert into auth.users(id)values('${cashier}');update profiles set role='cashier',active=true where id='${cashier}';insert into login_verifications(session_id,user_id,expires_at)values('${cashier}','${cashier}',now()+interval '12 hours');`);
  await claims(cashier);
  assert.equal((await db.query('select * from products')).rows.length,2);
  for(const table of ['customer_balances','customer_debts','inventory_transactions','audit_logs','system_settings','forecast_runs'])assert.equal((await db.query('select * from '+table)).rows.length,0,table);
  await db.query("update products set description='Tampered' where id=$1",[product]);
  assert.equal((await db.query('select description from products where id=$1',[product])).rows[0].description,'Brake pad');
  await assert.rejects(db.query("select apply_inventory_transaction($1,'stock_out',1)",[product]),/Cashiers/);
  await assert.rejects(db.query('select sync_store_operation($1,$2::jsonb)',[operation,JSON.stringify({kind:'debt',customer_name:'Not allowed',principal:10})]),/Cashiers/);
  const op='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  const batch={kind:'batch',tx_type:'stock_in',lines:[{product_id:product,quantity:1,unit_price:100}]};
  await db.query('select sync_store_operation($1,$2::jsonb)',[op,JSON.stringify(batch)]);
  const catalog=(await db.query('select unit_cost,selling_price from products where id=$1',[product])).rows[0];
  const sale={...batch,tx_type:'sale',is_credit:true,customer_name:'Cashier customer',paid_amount:50};
  await db.query('select sync_store_operation($1,$2::jsonb)',['ffffffff-ffff-4fff-8fff-ffffffffffff',JSON.stringify(sale)]);
  assert.equal((await db.query('select * from customer_balances')).rows.length,0);
  assert.deepEqual((await db.query('select unit_cost,selling_price from products where id=$1',[product])).rows[0],catalog,'A sale must not change catalog pricing');
  await db.query("select apply_inventory_transaction($1,'stock_in',1,100)",[product]);
  await db.query("select apply_inventory_transaction($1,'sale',1,0,25)",[product]);
  assert.deepEqual((await db.query('select unit_cost,selling_price from products where id=$1',[product])).rows[0],catalog,'Sale parameters cannot bypass read-only product metadata');
  await db.exec(`reset role;update login_verifications set expires_at=now()-interval '1 minute' where user_id='${cashier}';`);
  await claims(cashier);assert.equal((await db.query('select * from products')).rows.length,0);
 });
 await t.test('every low/out-of-stock alert has a positive restock suggestion, including the exact limit and zero limit',async()=>{
  await db.exec(`reset role;insert into products(id,description,current_stock,minimum_stock,unit_cost,unit)values
   ('12345678-1234-4234-8234-123456789001','Exactly at alert level',2,2,50,'pcs'),
   ('12345678-1234-4234-8234-123456789002','Empty with zero limit',0,0,10,'litres'),
   ('12345678-1234-4234-8234-123456789003','Healthy stock',5,2,10,'pcs');`);
  const rows=(await db.query("select product_id,recommended_quantity,estimated_order_cost,unit,status from reorder_recommendations where product_id::text like '12345678%' order by product_id")).rows;
  assert.deepEqual(rows.map(r=>Number(r.recommended_quantity)),[1,1,0]);
  assert.deepEqual(rows.map(r=>Number(r.estimated_order_cost)),[50,10,0]);
  assert.deepEqual(rows.map(r=>r.unit),['pcs','litres','pcs']);
  assert.equal((await db.query('select n.id from stock_notifications n join reorder_recommendations r on r.product_id=n.product_id where n.resolved_at is null and r.recommended_quantity<=0')).rows.length,0);
  await db.exec(await readFile(new URL('../../../supabase/migrations/0008_restock_threshold.sql',import.meta.url),'utf8'));
  await db.exec(await readFile(new URL('../../../supabase/migrations/0009_small_restock_orders.sql',import.meta.url),'utf8'));
  assert.equal(Number((await db.query('select current_stock from products where id=$1',['12345678-1234-4234-8234-123456789001'])).rows[0].current_stock),2);
 });
 await t.test('small purchases preserve forecast demand and stock while limiting quantities and pricing the next order',async()=>{
  await db.exec('reset role;');
  await db.exec(await readFile(new URL('../../../supabase/migrations/0009_small_restock_orders.sql',import.meta.url),'utf8'));
  const prefix='87654321-1234-4234-8234-12345678900',run='87654321-1234-4234-8234-123456789100',supplier='87654321-1234-4234-8234-123456789200';
  await db.exec(`insert into products(id,description,current_stock,minimum_stock,unit_cost,active)values
   ('${prefix}1','Eleven expected sales',0,0,50,true),
   ('${prefix}2','One expected sale',0,0,40,true),
   ('${prefix}3','Healthy stock',5,2,10,true),
   ('${prefix}4','Fractional shortfall',1,0,20,true),
   ('${prefix}5','High low-stock limit',0,10,10,true),
   ('${prefix}6','Inactive part',0,0,10,false);
   insert into suppliers(id,name)values('${supplier}','Small-order supplier');
   insert into product_suppliers(product_id,supplier_id,latest_unit_cost,is_primary)values('${prefix}1','${supplier}',30,true);
   insert into forecast_runs(id,status,horizon_days,completed_at)values('${run}','completed',30,now());
   insert into demand_forecasts(run_id,product_id,forecast_date,predicted_quantity)values
    ('${run}','${prefix}1',current_date+1,5.5),('${run}','${prefix}1',current_date+2,5.5),
    ('${run}','${prefix}2',current_date+1,1),('${run}','${prefix}4',current_date+1,1.2),
    ('${run}','${prefix}6',current_date+1,11);`);
  const query="select product_id,current_stock,predicted_quantity,recommended_quantity,estimated_order_cost,status from reorder_recommendations where product_id::text like '87654321%' order by product_id";
  const before=(await db.query(query)).rows;
  assert.deepEqual(before.map(r=>Number(r.recommended_quantity)),[2,1,0,1,2]);
  assert.deepEqual(before.map(r=>Number(r.predicted_quantity)),[11,1,0,1.2,0]);
  assert.deepEqual(before.map(r=>Number(r.estimated_order_cost)),[60,40,0,20,20]);
  assert.deepEqual(before.map(r=>r.status),['out_of_stock','out_of_stock','ok','forecast_reorder','out_of_stock']);
  assert.deepEqual(before.map(r=>Number(r.current_stock)),[0,0,5,1,0]);
  const preserved=(await db.query('select * from demand_forecasts where run_id=$1 order by product_id,forecast_date',[run])).rows;
  await db.exec(await readFile(new URL('../../../supabase/migrations/0009_small_restock_orders.sql',import.meta.url),'utf8'));
  assert.deepEqual((await db.query(query)).rows,before);
  assert.deepEqual((await db.query('select * from demand_forecasts where run_id=$1 order by product_id,forecast_date',[run])).rows,preserved);
  assert.equal((await db.query("select reloptions from pg_class where oid='public.reorder_recommendations'::regclass")).rows[0].reloptions.includes('security_invoker=true'),true);
 });
 await t.test('main supplier changes validate first, roll back completely and require a verified manager',async()=>{
  const first='99999999-1111-4111-8111-111111111111',second='99999999-2222-4222-8222-222222222222',disabled='99999999-3333-4333-8333-333333333333';
  await db.exec(`reset role;update profiles set role='owner',active=true where id='${staff}';insert into suppliers(id,name,active)values('${first}','First',true),('${second}','Second',true),('${disabled}','Inactive',false);`);
  await claims(staff);
  const save=(supplier,cost=123.45)=>db.query('select save_product_supplier($1,$2,$3,9,true,null) result',[product,supplier,cost]);
  await save(first);
  for(const supplier of [disabled,'99999999-4444-4444-8444-444444444444'])await assert.rejects(save(supplier),/active supplier/);
  await assert.rejects(save(second,-1),/valid amount/);
  assert.equal((await db.query('select supplier_id from product_suppliers where product_id=$1 and is_primary',[product])).rows[0].supplier_id,first);

  await db.exec(`reset role;create function reject_supplier_test() returns trigger language plpgsql as $$begin if new.supplier_id='${second}' then raise exception 'Fixture save failed';end if;return new;end$$;create trigger fixture_supplier_failure before insert on product_suppliers for each row execute function reject_supplier_test();`);
  await claims(staff);await assert.rejects(save(second),/Fixture save failed/);
  assert.equal((await db.query('select supplier_id from product_suppliers where product_id=$1 and is_primary',[product])).rows[0].supplier_id,first);
  await db.exec('reset role;drop trigger fixture_supplier_failure on product_suppliers;drop function reject_supplier_test();');await claims(staff);
  await save(second);await save(second);
  const saved=(await db.query('select supplier_id,is_primary,latest_unit_cost,lead_time_days from product_suppliers where product_id=$1 order by supplier_id',[product])).rows;
  assert.equal(saved.filter(row=>row.is_primary).length,1);assert.equal(saved.find(row=>row.supplier_id===first).is_primary,false);assert.equal(saved.find(row=>row.supplier_id===second).lead_time_days,9);
  await db.exec(`reset role;update profiles set role='cashier' where id='${staff}';`);await claims(staff);await assert.rejects(save(first),/Not authorized/);
  await db.exec(`reset role;update profiles set role='owner' where id='${staff}';delete from login_verifications where user_id='${staff}';`);await claims(staff);await assert.rejects(save(first),/Not authorized/);
  await db.exec('reset role;');
  await db.exec(await readFile(new URL('../../../supabase/migrations/0011_restock_workflows.sql',import.meta.url),'utf8'));
 });
 await t.test('sale totals are exact, normalized when missing, and reject rollback leaves all balances unchanged',async()=>{
  const part='10101010-1010-4010-8010-101010101010';
  await db.exec(`reset role;insert into products(id,description,current_stock)values('${part}','Financial validation fixture',10);insert into login_verifications(session_id,user_id,expires_at)values('${staff}','${staff}',now()+interval '12 hours');`);
  await claims(staff);
  const snapshot=async()=>({
   products:(await db.query('select id,current_stock,unit_cost,selling_price from products order by id')).rows,
   counts:(await db.query('select (select count(*) from inventory_transactions) transactions,(select count(*) from demand_observations) observations,(select count(*) from customer_debts) debts,(select count(*) from stock_batches) batches,(select count(*) from business_sync_receipts) receipts')).rows[0]
  });
  const before=await snapshot();
  const direct=(quantity,price,total=null)=>db.query("select apply_inventory_transaction($1,'sale',$2,null,$3,null,null,null,$4) id",[part,quantity,price,total]);
  await assert.rejects(direct(0.01,0.01),/at least ₱0.01/);
  await assert.rejects(direct(0.01,0.01,0.01),/at least ₱0.01/);
  for(const total of [0,1,199.99,200.01])await assert.rejects(direct(2,100,total),/must match/);
  await assert.rejects(direct(1,1,1.001),/decimal places/);
  assert.deepEqual(await snapshot(),before);
  const normalized=(await direct(0.1,0.15)).rows[0].id;
  assert.equal(Number((await db.query('select total_amount from inventory_transactions where id=$1',[normalized])).rows[0].total_amount),0.02);
  const exact=(await direct(3,0.29,0.87)).rows[0].id;
  assert.equal(Number((await db.query('select total_amount from inventory_transactions where id=$1',[exact])).rows[0].total_amount),0.87);
  assert.equal(Number((await db.query('select current_stock from products where id=$1',[part])).rows[0].current_stock),6.9);
  await db.exec('reset role;');
  for(const change of ['total_amount=1','quantity=1','unit_price=2'])await assert.rejects(db.query(`update inventory_transactions set ${change} where id=$1`,[exact]),/must match/);
  const original=(await db.query('select * from inventory_transactions where id=$1',[exact])).rows[0];
  assert.equal(Number(original.quantity),3);assert.equal(Number(original.unit_price),0.29);assert.equal(Number(original.total_amount),0.87);
  await db.exec('grant insert,select on inventory_transactions to service_role;set role service_role;');
  const inserted=(await db.query("insert into inventory_transactions(product_id,tx_type,quantity,unit_price)values($1,'sale',2,3) returning total_amount",[part])).rows[0];
  assert.equal(Number(inserted.total_amount),6);
  await db.exec('reset role;');
 });
 await t.test('zero-cent basket lines roll back without saving stock, demand, debt or retry receipts',async()=>{
  const part='10101010-1010-4010-8010-101010101010';
  await claims(staff);
  const snapshot=async()=>({
   stocks:(await db.query('select id,current_stock from products order by id')).rows,
   counts:(await db.query('select (select count(*) from inventory_transactions) transactions,(select count(*) from demand_observations) observations,(select count(*) from customer_debts) debts,(select count(*) from stock_batches) batches,(select count(*) from business_sync_receipts) receipts')).rows[0]
  });
  const before=await snapshot(),op='12121212-1212-4212-8212-121212121212';
  const call=payload=>db.query('select sync_store_operation($1,$2::jsonb) result',[op,JSON.stringify(payload)]);
  const batch={kind:'batch',tx_type:'sale',customer_name:'Customer',is_credit:true,paid_amount:0,lines:[{product_id:part,quantity:0.01,unit_price:0.01},{product_id:product,quantity:0.01,unit_price:100}]};
  await assert.rejects(call(batch),/at least ₱0.01/);
  assert.deepEqual(await snapshot(),before);
  const fixed={...batch,lines:[{product_id:part,quantity:0.1,unit_price:0.15}]};
  const result=(await call(fixed)).rows[0].result;
  assert.equal(result.total,0.02);assert.equal(result.balance,0.02);
  assert.deepEqual((await call(fixed)).rows[0].result,result);
  assert.equal(Number((await db.query('select principal from customer_debts where id=$1',[result.debtId])).rows[0].principal),0.02);
 });
 await t.test('irrelevant due dates never block cash sales, free deliveries, paid sales or payments',async()=>{
  const part='10101010-1010-4010-8010-101010101010';
  await claims(staff);
  let sequence=0;
  const call=(payload,id)=>db.query('select sync_store_operation($1,$2::jsonb) result',[id||`13131313-1313-4313-8313-${String(++sequence).padStart(12,'0')}`,JSON.stringify(payload)]);
  const batch={kind:'batch',tx_type:'sale',lines:[{product_id:part,quantity:1,unit_price:10}],occurred_at:'2026-01-01T20:00:00Z'};
  for(const due_date of ['bad date','2020-01-01',{hidden:true}]){
   const received=(await call({...batch,tx_type:'stock_in',lines:[{product_id:part,quantity:1,unit_price:0}],due_date})).rows[0].result;
   assert.equal(received.total,0);assert.equal(received.balance,0);assert.equal(received.debtId,null);
   const cash=(await call({...batch,due_date})).rows[0].result;
   assert.equal(cash.total,10);assert.equal(cash.balance,0);assert.equal(cash.debtId,null);
   const paid=(await call({...batch,is_credit:true,customer_name:'Paid customer',paid_amount:10,due_date})).rows[0].result;
   assert.equal(paid.balance,0);assert.equal(paid.debtId,null);
  }
  const credit={...batch,is_credit:true,customer_name:'Credit customer',paid_amount:5};
  const before=(await db.query('select current_stock from products where id=$1',[part])).rows[0];
  await assert.rejects(call({...credit,due_date:'bad date'}),/invalid input syntax/);
  await assert.rejects(call({...credit,due_date:'2026-01-01'}),/on or after the sale date/);
  assert.deepEqual((await db.query('select current_stock from products where id=$1',[part])).rows[0],before);
  const sale=(await call({...credit,due_date:'2026-01-02'})).rows[0].result;
  const paid=(await call({kind:'payment',debt_id:sale.debtId,amount:5,due_date:'bad date',occurred_at:'2026-01-02T20:00:00Z'})).rows[0].result;
  assert.equal(paid.balance,0);
  const date=(await db.query('select due_date::text from customer_debts where id=$1',[sale.debtId])).rows[0].due_date;
  assert.equal(date,'2026-01-02');
 });
 await t.test('financial migration preserves old records and successful receipt replays',async()=>{
  const part='10101010-1010-4010-8010-101010101010',legacy='14141414-1414-4414-8414-141414141414';
  const oldPayload={kind:'batch',tx_type:'sale',lines:[{product_id:part,quantity:0.01,unit_price:0.01}],due_date:'ignored legacy field'};
  const oldResult={total:0,balance:0};
  await db.exec('reset role;drop trigger inventory_sale_price_check on inventory_transactions;');
  const oldSale=(await db.query("insert into inventory_transactions(product_id,tx_type,quantity,notes)values($1,'sale',1,'Historical record') returning *",[part])).rows[0];
  await db.query('insert into business_sync_receipts(user_id,operation_id,payload,result) values($1,$2,$3::jsonb,$4::jsonb)',[staff,legacy,JSON.stringify(oldPayload),JSON.stringify(oldResult)]);
  const stocks=(await db.query('select id,current_stock from products order by id')).rows;
  const debts=(await db.query('select * from customer_debts order by id')).rows;
  const migration=await readFile(new URL('../../../supabase/migrations/0012_sale_financial_integrity.sql',import.meta.url),'utf8');
  await db.exec(migration);await db.exec(migration);
  assert.deepEqual((await db.query('select * from inventory_transactions where id=$1',[oldSale.id])).rows[0],oldSale);
  assert.deepEqual((await db.query('select id,current_stock from products order by id')).rows,stocks);
  assert.deepEqual((await db.query('select * from customer_debts order by id')).rows,debts);
  await db.query("update inventory_transactions set notes='Updated historical note' where id=$1",[oldSale.id]);
  assert.equal((await db.query('select notes from inventory_transactions where id=$1',[oldSale.id])).rows[0].notes,'Updated historical note');
  await claims(staff);
  assert.deepEqual((await db.query('select sync_store_operation($1,$2::jsonb) result',[legacy,JSON.stringify(oldPayload)])).rows[0].result,oldResult);
  assert.deepEqual((await db.query('select id,current_stock from products order by id')).rows,stocks);
 });
 await db.close();
});

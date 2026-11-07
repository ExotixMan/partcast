import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

const owner='11111111-1111-4111-8111-111111111111',part='33333333-3333-4333-8333-333333333333';
const actual='55555555-5555-4555-8555-555555555555';

test('PostgreSQL history replacement commits completely, rolls back failures and preserves retry receipts',async t=>{
 const db=new PGlite();
 try{
  await db.exec(`
   create role anon;create role authenticated;create role service_role;
   create schema auth;
   create function auth.role() returns text language sql stable as $$select current_setting('request.jwt.claim.role',true)$$;
   create table profiles(id uuid primary key,role text,active boolean);
   create table products(id uuid primary key,part_number text,active boolean,current_stock numeric);
   create table demand_observations(id uuid primary key default gen_random_uuid(),product_id uuid references products(id),occurred_on date not null,quantity numeric(14,2) check(quantity>0),source text,source_reference text);
   create table import_batches(id uuid primary key,file_name text,file_sha256 text,import_type text,status text,rows_read integer,rows_imported integer,rows_skipped integer,warnings jsonb,created_by uuid,completed_at timestamptz);
   create table refresh_counter(n integer);insert into refresh_counter values(0);
   create function request_forecast_refresh() returns void language sql as $$update refresh_counter set n=n+1$$;
   grant usage on schema public,auth to anon,authenticated,service_role;
   grant all on demand_observations to service_role;
   insert into profiles values('${owner}','owner',true);
   insert into products values('${part}','TEST-001',true,12);
   insert into demand_observations(id,product_id,occurred_on,quantity,source) values('${actual}','${part}','2020-01-01',3,'actual_sale');
   insert into demand_observations(product_id,occurred_on,quantity,source) values('${part}','2020-01-02',7,'imported_training_data');
   select set_config('request.jwt.claim.role','service_role',false);
  `);
  const migration=await readFile(new URL('../../../supabase/migrations/0015_atomic_demand_import.sql',import.meta.url),'utf8');
  await db.exec(migration);
  await db.exec('create trigger demand_forecast_refresh after insert or update or delete on demand_observations for each row execute function queue_demand_forecast();');
  const snapshot=async()=>(await db.query('select demand_import_snapshot() result')).rows[0].result;
  const state=async()=>(await db.query(`select jsonb_build_object('observations',(select jsonb_agg(to_jsonb(d) order by id) from demand_observations d),'batches',(select coalesce(jsonb_agg(to_jsonb(b) order by id),'[]') from import_batches b),'refresh',(select n from refresh_counter),'stock',(select current_stock from products)) result`)).rows[0].result;
  const row=(date,quantity='2.00')=>({product_id:part,part_number:'TEST-001',occurred_on:date,quantity});
  const request=async(rows,overrides={})=>({id:randomUUID(),hash:'a'.repeat(64),fingerprint:(await snapshot()).fingerprint,expires:new Date(Date.now()+9*60000).toISOString(),rows,read:rows.length,zero:0,...overrides});
  const save=async r=>(await db.query('select replace_imported_demand($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11::jsonb) result',[r.id,owner,'history.xlsx',r.hash,'Daily_B_Usable',r.fingerprint,r.expires,JSON.stringify(r.rows),r.read,r.zero,'[]'])).rows[0].result;

  await t.test('review is read-only and legacy service-role deletes are denied',async()=>{
   const before=await state();assert.equal((await snapshot()).row_count,1);assert.deepEqual(await state(),before);
   await db.exec('set role service_role;');
   await assert.rejects(db.query("delete from demand_observations where source='imported_training_data'"),/permission denied/);
   await assert.rejects(db.query(`insert into demand_observations(product_id,occurred_on,quantity,source) values('${part}','2020-01-03',1,'imported_training_data')`),/permission denied/);
   await db.exec('reset role;');assert.deepEqual(await state(),before);
  });
  await t.test('failure during insertion restores old history, receipt, stock and refresh state',async()=>{
   await db.exec(`create function fail_import_row() returns trigger language plpgsql as $$begin if new.source='imported_training_data' and new.quantity=999 then raise exception 'Injected insert failure';end if;return new;end$$;
    create trigger injected_failure before insert on demand_observations for each row execute function fail_import_row();`);
   const before=await state();
   await assert.rejects(save(await request([row('2020-02-01'),row('2020-02-02','999.00')])),/Injected insert failure/);
   assert.deepEqual(await state(),before);
   await db.exec('drop trigger injected_failure on demand_observations;');
  });
  await t.test('all 701 rows commit with one refresh and the actual sale remains unchanged',async()=>{
   const rows=Array.from({length:701},(_,index)=>row(new Date(Date.UTC(2020,0,1+index)).toISOString().slice(0,10)));
   const r=await request(rows),before=await state(),result=await save(r);
   assert.equal(result.rowsImported,701);assert.equal(result.alreadyImported,false);
   const after=await state();assert.equal(after.observations.length,702);assert.equal(after.refresh,before.refresh+1);assert.equal(after.stock,12);
   assert.deepEqual(after.observations.find(r=>r.id===actual),before.observations.find(r=>r.id===actual));
   const replay=await save({...r,expires:new Date(Date.now()-60000).toISOString()});
   assert.equal(replay.alreadyImported,true);assert.equal(replay.rowsImported,0);assert.deepEqual(await state(),after);
   await assert.rejects(save({...r,hash:'b'.repeat(64)}),/does not match/);assert.deepEqual(await state(),after);
  });
  await t.test('a stale review cannot overwrite a newer completed import',async()=>{
   const stale=await request([row('2020-05-01')]),newer=await request([row('2020-06-01','4.00')]);
   await save(newer);const before=await state();
   await assert.rejects(save(stale),error=>error.code==='PT409'&&error.message==='IMPORT_HISTORY_CHANGED');assert.deepEqual(await state(),before);
   const replay=await save(newer);assert.equal(replay.rowsImported,0);assert.deepEqual(await state(),before);
  });
  await t.test('invalid, duplicate, expired and inactive-part requests leave the complete state intact',async()=>{
   const cases=[[],[row('2099-01-01')],[row('2020-02-30')],[row('2020-01-01','-1')],[row('2020-01-01','1.001')],[row('2020-01-01'),row('2020-01-01')],[{...row('2020-01-01'),product_id:randomUUID()}],[{...row('2020-01-01'),part_number:'WRONG'}]];
   for(const rows of cases){const before=await state();await assert.rejects(save(await request(rows)));assert.deepEqual(await state(),before);}
   let before=await state();await assert.rejects(save(await request([row('2020-01-01')],{expires:new Date(Date.now()-1000).toISOString()})),/IMPORT_PREVIEW_EXPIRED/);assert.deepEqual(await state(),before);
   await db.exec(`update products set active=false where id='${part}';`);before=await state();
   await assert.rejects(save(await request([row('2020-01-01')])),/became inactive/);assert.deepEqual(await state(),before);
   await db.exec(`update products set active=true where id='${part}';`);
  });
  await t.test('browser roles cannot execute the replacement or preview RPC',async()=>{
   await db.exec('set role authenticated;');
   await assert.rejects(db.query('select demand_import_snapshot()'),/permission denied/);
   await assert.rejects(db.query('select replace_imported_demand(null,null,null,null,null,null,null,null,null,null,null)'),/permission denied/);
   await db.exec('reset role;');
   await db.exec("update profiles set role='cashier';");
   await assert.rejects(save(await request([row('2020-01-01')])),/active store manager/);
   await db.exec("update profiles set role='owner';");
  });
  await t.test('migration reapplication preserves existing rows and receipts',async()=>{
   const before=await state();await db.exec(migration);assert.deepEqual(await state(),before);
  });
 }finally{await db.close();}
});

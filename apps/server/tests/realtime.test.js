import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

test('Realtime migration preserves publication members and RLS, and is repeatable',async()=>{
 const db=new PGlite();
 try{
  const tables=['products','inventory_transactions','demand_observations','legacy_sales','forecast_runs','suppliers','product_suppliers','import_batches','profiles','audit_logs','backup_logs','supplier_email_logs','system_settings','customer_debts','debt_payments'];
  for(const table of [...tables,'existing_member'])await db.exec(`create table public.${table}(id int primary key)`);
  await db.exec('alter table products enable row level security; create publication supabase_realtime for table existing_member');
  const migration=await readFile(new URL('../../../supabase/migrations/0013_realtime.sql',import.meta.url),'utf8');
  await db.exec(migration);await db.exec(migration);
  const {rows}=await db.query("select tablename from pg_publication_tables where pubname='supabase_realtime'");
  assert.deepEqual(rows.map(r=>r.tablename).sort(),[...tables,'existing_member'].sort());
  assert.equal((await db.query("select relrowsecurity from pg_class where relname='products'")).rows[0].relrowsecurity,true);
 }finally{await db.close();}
});

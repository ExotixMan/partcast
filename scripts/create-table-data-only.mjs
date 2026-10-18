#!/usr/bin/env node
// Data files for existing PartCast tables. No schema/account setup.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import ExcelJS from '../apps/server/node_modules/exceljs/excel.js';
import JSZip from '../apps/server/node_modules/jszip/lib/index.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.join(root,'downloads/table-data-only');await mkdir(out,{recursive:true});
const source=JSON.parse(await readFile(path.join(root,'downloads/demo-database/SIMULATED_Forecast_Input.json'),'utf8'));
if(source.data_type!=='SIMULATED_DEMO')throw Error('Use the labelled sample input.');
const book=new ExcelJS.Workbook();await book.xlsx.readFile(path.join(root,'downloads/capstone-demo/PartCast_Forecasting_DEMO.xlsx'));
const identities=book.getWorksheet('Existing_Part_Identities');
const uuid=key=>{const h=createHash('sha256').update(key).digest('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20,32)}`;};
const products=[];
for(let i=2;i<=identities.rowCount;i++){const r=identities.getRow(i),part=r.getCell(1).text;products.push({id:uuid('partcast-simulated-demo:'+part),part_number:part,description:r.getCell(2).text,brand:r.getCell(3).text,unit:'pcs',category:'parts'});}
const byId=new Map(products.map(row=>[row.id,row]));
const observations=source.observations.map(row=>{
 const part=byId.get(row.product_id);if(!part||row.source!=='simulated_demo'||!(row.quantity>0))throw Error('Invalid sample observation.');
 return {id:uuid('partcast-table-data-only:'+part.part_number+':'+row.occurred_on),product_id:part.id,occurred_on:row.occurred_on,quantity:row.quantity,source:'simulated_demo',source_reference:`PARTCAST_DEMO_ROWS_V1:${part.part_number}:${row.occurred_on}`};
});
const marker={mode:'simulated_demo',seed_version:'partcast-demo-v1',history_days:730,positive_observations:observations.length,identified_parts:products.length,as_of_date:source.asOfDate,notice:'Generated sample quantities. Existing inventory part identities. Not actual customer sales.'};
const settings=[{key:'partcast_demo_environment',value:JSON.stringify(marker)}];
const cell=value=>{const s=String(value??'');return /[",\r\n]/.test(s)?'"'+s.replaceAll('"','""')+'"':s;};
const csv=rows=>{const keys=Object.keys(rows[0]);return keys.map(cell).join(',')+'\n'+rows.map(row=>keys.map(key=>cell(row[key])).join(',')).join('\n')+'\n';};
for(const [name,rows] of [['products.csv',products],['demand_observations.csv',observations],['system_settings.csv',settings]])await writeFile(path.join(out,name),csv(rows));
const q=value=>`'${String(value).replaceAll("'","''")}'`;
const catalogValues=products.map(p=>`(${q(p.id)}::uuid,${q(p.part_number)},${q(p.description)},${q(p.brand)},${q(p.unit)},${q(p.category)})`).join(',\n');
const eventValues=observations.map(row=>`(${q(row.id)}::uuid,${q(byId.get(row.product_id).part_number)},${q(row.occurred_on)}::date,${row.quantity},${q(row.source_reference)})`).join(',\n');
const sql=`-- DATA ONLY: existing public.products, public.demand_observations, public.system_settings.
-- Generated sample quantities using existing inventory part identities.
-- No schemas, tables, accounts or permissions are created, altered or deleted.
-- Existing demand_observations must already permit source='simulated_demo'.
begin;
select pg_advisory_xact_lock(734935272);
do $guard$
begin
 if to_regclass('public.products') is null or to_regclass('public.demand_observations') is null or to_regclass('public.system_settings') is null then
  raise exception 'Use an existing PartCast database. This file contains data only.';
 end if;
 if not exists(select 1 from pg_constraint where conrelid='public.demand_observations'::regclass and contype='c' and pg_get_constraintdef(oid) like '%simulated_demo%') then
  raise exception 'This table does not yet allow simulated_demo. Enable that source in the separate demo database first; no schema changes are included in this data-only file.';
 end if;
 if not exists(select 1 from public.system_settings where key='partcast_demo_environment' and value->>'mode'='simulated_demo')
   and (exists(select 1 from public.demand_observations where source in ('actual_sale','imported_training_data')) or exists(select 1 from public.inventory_transactions)) then
  raise exception 'Use the separate demo project. This database already contains business history.';
 end if;
end $guard$;

-- Add only missing catalog identities. Existing part IDs, stock and prices are preserved.
insert into public.products(id,part_number,description,brand,unit,category)
select v.* from (values
${catalogValues}
) v(id,part_number,description,brand,unit,category)
where not exists(select 1 from public.products p where upper(trim(p.part_number))=upper(trim(v.part_number)))
on conflict(id) do nothing;

-- Match each generated observation to the inventory's EXISTING UUID by part number.
insert into public.demand_observations(id,product_id,occurred_on,quantity,source,source_reference)
select v.id,p.id,v.occurred_on,v.quantity,'simulated_demo',v.source_reference
from (values
${eventValues}
) v(id,part_number,occurred_on,quantity,source_reference)
join public.products p on upper(trim(p.part_number))=upper(trim(v.part_number))
where not exists(select 1 from public.demand_observations d where d.source='simulated_demo' and (d.source_reference=v.source_reference or (d.product_id=p.id and d.occurred_on=v.occurred_on)))
on conflict(id) do nothing;

-- One data row enables the existing demo-mode checks; other settings are unchanged.
insert into public.system_settings(key,value) values('partcast_demo_environment',${q(JSON.stringify(marker))}::jsonb)
on conflict(key) do update set value=excluded.value,updated_at=now();
commit;
`;
await writeFile(path.join(out,'INSERT_DATA_ONLY.sql'),sql);
const guide=`PARTCAST — TABLE DATA ONLY

These files contain generated sample quantities for 9 existing inventory parts.
The part numbers, descriptions and brands are retained. Quantities are not actual sales.
Dates and quantities are unchanged from the previously supplied sample.

FILES / SUPABASE DESTINATION
products.csv -> public.products (9 identities; no stock counts or prices supplied)
demand_observations.csv -> public.demand_observations (778 positive-demand records)
system_settings.csv -> public.system_settings (1 sample-environment marker)

USE ONE METHOD, NOT BOTH
1. Recommended if your inventory already exists: paste INSERT_DATA_ONLY.sql into
   the SQL Editor of your separate DEMO project. It reuses the existing product
   UUIDs by part number and inserts only missing parts and sample rows. It does
   not reset stock, replace real history, create tables, alter schemas, change
   permissions or create accounts. Rerunning skips the same sample rows.
2. If these tables have no matching parts or sample rows: use Table Editor ->
   Import data from CSV, in the order products.csv, demand_observations.csv,
   system_settings.csv. These two catalog/demand CSV files have matching UUIDs.
   If matching inventory parts already exist, use the SQL method instead; the
   catalog UUIDs may differ. Do not run a CSV import a second time.

PREREQUISITES
The existing demand_observations source constraint must already allow
simulated_demo. These are data-only files and do not enable/change that constraint.
The separate API must already be configured with PARTCAST_DEMO_MODE=true, and
both the website and API must point to that separate Supabase project.
If the sample marker already exists, use the SQL method to update it rather than
trying to insert the same system_settings key with CSV.

Then open Demand planning -> Update demand estimate (Next 30 days).
The model creates forecast_runs and demand_forecasts; no forecast/error scores
are inserted by these files. Normal actual-store mode ignores simulated_demo.
The dates are fixed sample dates ending in October 2026; normal freshness checks
still apply. No sample rows are inserted in inventory_transactions or legacy_sales.
`;
await writeFile(path.join(out,'READ_FIRST.txt'),guide);
const zip=new JSZip();for(const file of ['products.csv','demand_observations.csv','system_settings.csv','INSERT_DATA_ONLY.sql','READ_FIRST.txt'])zip.file(file,await readFile(path.join(out,file)));
await writeFile(path.join(out,'PartCast_Table_Data_Only.zip'),await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'}));
console.log(JSON.stringify({products:products.length,observations:observations.length,settings:settings.length,out}));

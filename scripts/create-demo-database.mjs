#!/usr/bin/env node
// Creates an explicitly labelled database demo, never actual customer sales.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import ExcelJS from '../apps/server/node_modules/exceljs/excel.js';
import JSZip from '../apps/server/node_modules/jszip/lib/index.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.resolve(process.argv[2]||path.join(root,'downloads/demo-database'));
await mkdir(out,{recursive:true});
const bytes=await readFile(path.join(root,'downloads/capstone-demo/PartCast_Forecasting_DEMO.xlsx'));
const book=new ExcelJS.Workbook();await book.xlsx.load(bytes);
if(!book.getWorksheet('SIMULATED_DEMAND'))throw Error('Use the labelled sample workbook.');
const idFor=code=>{const h=createHash('sha256').update('partcast-simulated-demo:'+code).digest('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20,32)}`;};
const catalog=[],daily=[];
const identities=book.getWorksheet('Existing_Part_Identities');
for(let r=2;r<=identities.rowCount;r++){const row=identities.getRow(r),code=row.getCell(1).text;catalog.push({id:idFor(code),part_number:code,description:row.getCell(2).text,brand:row.getCell(3).text});}
const known=new Set(catalog.map(p=>p.part_number));
for(const name of ['IMPORT_Train_5Col','Validation_5Col','Test_5Col']){const sheet=book.getWorksheet(name);for(let r=2;r<=sheet.rowCount;r++){const row=sheet.getRow(r),part_number=row.getCell(2).text,quantity=row.getCell(3).value,date=row.getCell(1).text;if(!known.has(part_number)||!Number.isFinite(quantity)||quantity<0||!/^\d{4}-\d{2}-\d{2}$/.test(date))throw Error('Invalid sample row.');daily.push({product_id:idFor(part_number),part_number,date,quantity});}}
const last=daily.map(r=>r.date).sort().at(-1);
for(const row of daily)row.days_before_today=1+(Date.parse(last)-Date.parse(row.date))/86400000;
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila'}).format(new Date());
const stamp=ago=>new Date(Date.parse(today+'T00:00:00Z')-ago*86400000).toISOString().slice(0,10);
const positive=daily.filter(r=>r.quantity>0);
const q=value=>`'${String(value).replaceAll("'","''")}'`;
const catalogSql=catalog.map((p,i)=>`(${q(p.id)}::uuid,${q(p.part_number)},${q(p.description)},${q(p.brand)},'pcs','DEMO shelf ${i+1}',${[0,2,12,1,20,3,8,1,15][i]},2,1,100,200,'parts')`).join(',\n');
const daysSql=daily.map(r=>`(${q(r.product_id)}::uuid,${r.days_before_today},${r.quantity})`).join(',\n');
const sql=`-- PARTCAST SIMULATED DATABASE DEMO. Not actual sales or actual-store accuracy evidence.
-- Run ONLY in your separate DEMO Supabase project AFTER the PartCast schema.
-- No accounts, passwords, settings secrets, or actual sales are copied.
begin;
select pg_advisory_xact_lock(734935271);
do $guard$
declare prepared boolean;
begin
  if to_regclass('public.products') is null or to_regclass('public.demand_observations') is null or to_regclass('public.login_verifications') is null then
    raise exception 'Install PartCast 01_schema_and_roles.sql and 02_login_and_permissions.sql first.';
  end if;
  select coalesce((select value->>'mode'='simulated_demo' and value->>'seed_version'='partcast-demo-v1' from public.system_settings where key='partcast_demo_environment'),false) into prepared;
  if not prepared and (exists(select 1 from public.products) or exists(select 1 from public.inventory_transactions) or exists(select 1 from public.demand_observations) or exists(select 1 from public.legacy_sales) or exists(select 1 from public.customer_debts) or exists(select 1 from public.purchase_history) or exists(select 1 from public.forecast_runs)) then
    raise exception 'Refusing to seed a store with existing business data. Open your EMPTY, separate demo project. Nothing was changed.';
  end if;
end $guard$;

-- Add a separate provenance value. Actual-sale and imported-sale labels are untouched.
alter table public.demand_observations drop constraint if exists demand_observations_source_check;
alter table public.demand_observations add constraint demand_observations_source_check
 check(source in ('actual_sale','legacy_transaction_proxy','imported_training_data','simulated_demo'));

insert into public.system_settings(key,value) values('partcast_demo_environment',jsonb_build_object(
 'mode','simulated_demo','seed_version','partcast-demo-v1','history_days',730,
 'daily_rows',${daily.length},'positive_observations',${positive.length},'identified_parts',${catalog.length},
 'as_of_date',(now() at time zone 'Asia/Manila')::date,'source_sha256',${q(createHash('sha256').update(bytes).digest('hex'))},
 'notice','Generated sample quantities and stock. Not actual sales.'))
on conflict(key) do update set value=excluded.value,updated_at=now();

insert into public.products(id,part_number,description,brand,unit,location,current_stock,minimum_stock,safety_stock,unit_cost,selling_price,category) values
${catalogSql}
on conflict(id) do nothing;

-- Complete generated calendar, including confirmed zero days, retained for inspection.
create table if not exists public.partcast_demo_daily(
 product_id uuid not null references public.products(id),occurred_on date not null,
 quantity numeric(14,2) not null check(quantity>=0),
 source text not null default 'simulated_demo' check(source='simulated_demo'),
 primary key(product_id,occurred_on)
);
alter table public.partcast_demo_daily enable row level security;
revoke all on public.partcast_demo_daily from anon,authenticated;
grant select on public.partcast_demo_daily to service_role;
create temporary table partcast_demo_input(product_id uuid,days_before_today integer,quantity numeric(14,2)) on commit drop;
insert into partcast_demo_input values
${daysSql};

-- Refresh this tagged sample only. Existing user sales and other rows remain untouched.
delete from public.demand_observations where source='simulated_demo' and source_reference like 'PARTCAST_DEMO_V1:%';
delete from public.partcast_demo_daily where product_id in (select distinct product_id from partcast_demo_input);
insert into public.partcast_demo_daily(product_id,occurred_on,quantity)
select product_id,(now() at time zone 'Asia/Manila')::date-days_before_today,quantity from partcast_demo_input;
-- Demand observations are positive sale events; the complete calendar above includes zeros.
insert into public.demand_observations(product_id,occurred_on,quantity,source,source_reference)
select product_id,occurred_on,quantity,'simulated_demo','PARTCAST_DEMO_V1:'||product_id::text||':'||occurred_on::text
from public.partcast_demo_daily where quantity>0;
commit;

-- Expect 9 parts, 6,570 generated days and 778 positive demand observations.
select source,count(*) as positive_demand_records,count(distinct product_id) as parts,
 min(occurred_on) as first_generated_sale,max(occurred_on) as last_generated_sale
from public.demand_observations where source='simulated_demo' group by source;
select count(*) as full_calendar_days from public.partcast_demo_daily;
`;
await writeFile(path.join(out,'03_SEED_SIMULATED_DEMAND.sql'),sql);
const verify=`-- Read-only demo verification; no credentials required.\nselect value as demo_marker from public.system_settings where key='partcast_demo_environment';\nselect source,count(*) as records,count(distinct product_id) as parts from public.demand_observations group by source;\nselect count(*) as generated_daily_rows,min(occurred_on) as first_day,max(occurred_on) as last_day from public.partcast_demo_daily;\nselect status,training_rows,product_count,metrics->>'data_mode' as data_mode,metrics->'horizon_validation'->'model' as planning_errors from public.forecast_runs order by started_at desc limit 5;\nselect count(*) as upcoming_estimates from public.demand_forecasts where forecast_date>(now() at time zone 'Asia/Manila')::date;\n`;
await writeFile(path.join(out,'04_VERIFY_DEMO.sql'),verify);
const payload={data_type:'SIMULATED_DEMO',asOfDate:today,horizonDays:30,observations:positive.map(r=>({product_id:r.product_id,occurred_on:stamp(r.days_before_today),quantity:r.quantity,source:'simulated_demo'}))};
await writeFile(path.join(out,'SIMULATED_Forecast_Input.json'),JSON.stringify(payload,null,2));
const csv=['data_type,part_number,date,quantity,days_before_seed_today',...daily.map(r=>`simulated_demo,${r.part_number},${stamp(r.days_before_today)},${r.quantity},${r.days_before_today}`)].join('\n')+'\n';
await writeFile(path.join(out,'SIMULATED_Daily_Calendar.csv'),csv);
const guide=await readFile(path.join(root,'docs/DEMO_DATABASE.md'),'utf8');await writeFile(path.join(out,'START_HERE.md'),guide);
const zip=new JSZip();
for(const [file,source] of [['01_schema_and_roles.sql','supabase/paste-ready/01_schema_and_roles.sql'],['02_login_and_permissions.sql','supabase/paste-ready/02_login_and_permissions.sql']])zip.file(file,await readFile(path.join(root,source)));
for(const file of ['03_SEED_SIMULATED_DEMAND.sql','04_VERIFY_DEMO.sql','SIMULATED_Forecast_Input.json','SIMULATED_Daily_Calendar.csv','START_HERE.md'])zip.file(file,await readFile(path.join(out,file)));
await writeFile(path.join(out,'PartCast_Demo_Database_Pack.zip'),await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'}));
console.log(JSON.stringify({out,parts:catalog.length,dailyRows:daily.length,positiveObservations:positive.length,asOfDate:today,seed:'03_SEED_SIMULATED_DEMAND.sql',bundle:'PartCast_Demo_Database_Pack.zip'}));

#!/usr/bin/env python3
"""Bind the existing labelled sample to an uploaded inventory, without inventing parts."""
import argparse,csv,hashlib,io,json,re,uuid,zipfile
from collections import defaultdict
from pathlib import Path

root=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser()
parser.add_argument('--inventory',type=Path,required=True)
parser.add_argument('--out',type=Path,default=root/'downloads/inventory-matched-demand')
a=parser.parse_args();a.out.mkdir(parents=True,exist_ok=True)
raw=a.inventory.read_bytes()
inventory=list(csv.DictReader(io.StringIO(raw.decode('utf-8-sig'))))
by_code=defaultdict(list)
ids=set()
for row in inventory:
 uuid.UUID(row['id'])
 if row['id'] in ids:raise ValueError('Duplicate inventory UUID; resolve before preparing a sample.')
 ids.add(row['id'])
 if row.get('active','true').lower()=='true' and row.get('part_number','').strip():by_code[row['part_number'].strip().upper()].append(row)
with (root/'downloads/table-data-only/products.csv').open(newline='') as f:old_parts=list(csv.DictReader(f))
source=json.loads((root/'downloads/demo-database/SIMULATED_Forecast_Input.json').read_text())
if source['data_type']!='SIMULATED_DEMO':raise ValueError('Use the labelled generated sample.')
matched=[];old_to_part={}
for old in old_parts:
 found=by_code.get(old['part_number'].strip().upper(),[])
 if len(found)!=1:raise ValueError('Each sample part must have exactly one active inventory match: '+old['part_number'])
 p=found[0]
 matched.append({key:p.get(key,'') for key in ['id','part_number','description','brand','unit']})
 old_to_part[old['id']]=p
namespace=uuid.UUID('d247aa02-e624-4b7b-a66a-2934641a9886')
rows=[]
for row in source['observations']:
 p=old_to_part[row['product_id']]
 if row['source']!='simulated_demo' or not row['quantity']>0 or not re.fullmatch(r'\d{4}-\d{2}-\d{2}',row['occurred_on']):raise ValueError('Invalid sample record.')
 rows.append({'id':str(uuid.uuid5(namespace,p['id']+'|'+row['occurred_on'])),'product_id':p['id'],'occurred_on':row['occurred_on'],'quantity':row['quantity'],'source':'simulated_demo','source_reference':'PARTCAST_INVENTORY_SAMPLE_V1:'+p['id']+':'+row['occurred_on']})
marker={'mode':'simulated_demo','seed_version':'partcast-demo-v1','history_days':730,'positive_observations':len(rows),'identified_parts':len(matched),'uploaded_inventory_items':len(inventory),'as_of_date':source['asOfDate'],'source_inventory_sha256':hashlib.sha256(raw).hexdigest(),'notice':'Existing uploaded inventory identities; generated sample quantities, not actual customer sales.'}
settings=[{'key':'partcast_demo_environment','value':json.dumps(marker,separators=(',',':'))}]

def write_csv(name,items):
 with (a.out/name).open('w',newline='',encoding='utf-8') as f:
  w=csv.DictWriter(f,fieldnames=list(items[0]),lineterminator='\n');w.writeheader();w.writerows(items)
write_csv('demand_observations.csv',rows)
write_csv('system_settings.csv',settings)
write_csv('matched_inventory_REFERENCE_ONLY.csv',matched)
q=lambda value:"'"+str(value).replace("'","''")+"'"
values=',\n'.join('('+','.join([q(r['id'])+'::uuid',q(r['product_id'])+'::uuid',q(r['occurred_on'])+'::date',str(r['quantity']),q(r['source_reference'])])+')' for r in rows)
expected=','.join('('+q(p['id'])+'::uuid,'+q(p['part_number'])+')' for p in matched)
sql=f'''-- EXISTING INVENTORY: generated demand only. No product/table/schema creation or replacement.
-- Requires the existing demand_observations table to permit simulated_demo.
begin;
select pg_advisory_xact_lock(734935273);
do $guard$
begin
 if to_regclass('public.products') is null or to_regclass('public.demand_observations') is null or to_regclass('public.system_settings') is null then
  raise exception 'Use the existing PartCast project from which this inventory was exported.';
 end if;
 if exists(select 1 from (values {expected}) v(id,part_number) left join public.products p on p.id=v.id and upper(trim(p.part_number))=upper(trim(v.part_number)) where p.id is null) then
  raise exception 'Inventory UUIDs do not match this project. Use the project that supplied products_rows.csv. No rows were inserted.';
 end if;
 if not exists(select 1 from pg_constraint where conrelid='public.demand_observations'::regclass and contype='c' and pg_get_constraintdef(oid) like '%simulated_demo%') then
  raise exception 'Enable the simulated_demo source in your separate demo database first. This file changes data only.';
 end if;
 if not exists(select 1 from public.system_settings where key='partcast_demo_environment' and value->>'mode'='simulated_demo')
 and (exists(select 1 from public.demand_observations where source in ('actual_sale','imported_training_data')) or exists(select 1 from public.inventory_transactions)) then
  raise exception 'This project has business history. Use the separate demo project with matching inventory IDs.';
 end if;
end $guard$;

insert into public.demand_observations(id,product_id,occurred_on,quantity,source,source_reference)
select v.id,v.product_id,v.occurred_on,v.quantity,'simulated_demo',v.source_reference
from (values
{values}
) v(id,product_id,occurred_on,quantity,source_reference)
where not exists(select 1 from public.demand_observations d where d.source='simulated_demo' and d.product_id=v.product_id and d.occurred_on=v.occurred_on)
on conflict(id) do nothing;

insert into public.system_settings(key,value) values('partcast_demo_environment',{q(json.dumps(marker,separators=(',',':')))}::jsonb)
on conflict(key) do update set value=excluded.value,updated_at=now();
commit;
'''
(a.out/'INSERT_MATCHED_DEMAND_ONLY.sql').write_text(sql)
guide=f'''DATA MATCHED TO YOUR UPLOADED INVENTORY — DATA ONLY

Your export contains {len(inventory):,} active inventory items. This package matches the
existing 9-part sample to their exact inventory UUIDs. It does not create demand
history for all {len(inventory):,} parts or insert replacement products.

USE ONE IMPORT METHOD
A. Recommended: paste INSERT_MATCHED_DEMAND_ONLY.sql into your existing demo
project's SQL Editor. It inserts only demand history and the one sample-mode
setting. It checks the uploaded inventory UUIDs and skips an existing simulated
row for the same part/date, including rows from the older sample pack.
B. CSV: import demand_observations.csv into public.demand_observations (778 rows).
If the sample-mode setting is absent, import system_settings.csv into
public.system_settings (1 row). If the setting or sample rows already exist,
use the SQL method instead. Do not run both methods.

matched_inventory_REFERENCE_ONLY.csv lists the 9 inventory items used. It is
for checking the mapping, NOT for import into products. Stock, prices, brands,
descriptions, categories and your other inventory items stay as they are.

The part identities are real inventory entries. All quantities in this demand
sample are GENERATED and remain source=simulated_demo. Dates and quantities
are unchanged from the earlier sample; only product UUIDs were remapped.
These files contain no account setup, table creation, schema changes, stock
movements, customer data or pre-filled forecast/accuracy results.

The existing table must already allow simulated_demo; that source constraint
is not changed by data-only files. The separate API needs
PARTCAST_DEMO_MODE=true and the matching Supabase project. Normal actual mode
ignores generated demand. Then open Demand planning -> Update demand estimate.
Use the same Supabase project that supplied the uploaded inventory UUIDs.
'''
(a.out/'READ_FIRST.txt').write_text(guide)
with zipfile.ZipFile(a.out/'Inventory_Matched_Table_Data.zip','w',zipfile.ZIP_DEFLATED) as z:
 for name in ['demand_observations.csv','system_settings.csv','matched_inventory_REFERENCE_ONLY.csv','INSERT_MATCHED_DEMAND_ONLY.sql','READ_FIRST.txt']:z.write(a.out/name,name)
print(json.dumps({'inventory_items':len(inventory),'matched_sample_parts':len(matched),'demand_records':len(rows),'product_inserts':0,'out':str(a.out)}))

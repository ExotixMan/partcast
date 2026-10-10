import { readFile, mkdir, writeFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const output = new URL('supabase/paste-ready/', root);
const read = name => readFile(new URL(`supabase/migrations/${name}`, root), 'utf8');
const [schema, rls, training, offline, workflows, roles, login] = await Promise.all([
  '0001_schema.sql', '0002_rls.sql', '0003_training_import.sql',
  '0004_offline_security_notifications.sql', '0005_store_workflows.sql',
  '0006_access_roles.sql', '0007_verified_login_and_access.sql'
].map(read));
const body = sql => sql.replace(/^begin;\s*$/gm, '').replace(/^commit;\s*$/gm, '').trim();
const baseline = [...schema.matchAll(/^create table public\.(\w+) \(\n([\s\S]*?)\n\);/gm)];
const business = [...baseline.map(([_, name]) => name), 'stock_batches', 'customer_debts', 'debt_payments', 'stock_notifications', 'notification_reads'];
const columns = baseline.flatMap(([_, name, definition]) => definition.split('\n').flatMap(line => {
  const match = line.match(/^\s*(\w+)\s+/);
  return match && !['primary', 'unique', 'foreign', 'constraint', 'check'].includes(match[1]) ? [[name, match[1]]] : [];
}));
const literalArray = list => `array[${list.map(x => `'${x}'`).join(',')}]`;
const pairs = columns.map(([table, column]) => `('${table}','${column}')`).join(',\n      ');
const preflight = `do $partcast_preflight$
declare tab text; col record;
begin
  if to_regclass('auth.users') is null or to_regclass('storage.buckets') is null
     or to_regprocedure('auth.uid()') is null or to_regprocedure('auth.jwt()') is null then
    raise exception 'Open this script in a Supabase project SQL Editor using the postgres role.';
  end if;
  if to_regclass('public.profiles') is null then
    if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
              where n.nspname='public' and c.relname=any(${literalArray(business)})) then
      raise exception 'Existing tables are not a complete PartCast schema. No data was removed. Review the existing schema before continuing.';
    end if;
  else
    foreach tab in array ${literalArray(baseline.map(([_, name]) => name))} loop
      if to_regclass('public.'||tab) is null then
        raise exception 'Existing PartCast schema is missing table %. No data was removed.', tab;
      end if;
    end loop;
    for col in select * from (values
      ${pairs}
    ) as expected(table_name,column_name) loop
      if not exists(select 1 from information_schema.columns c where c.table_schema='public'
                    and c.table_name=col.table_name and c.column_name=col.column_name) then
        raise exception 'Existing PartCast schema is missing %.%. No data was removed.', col.table_name,col.column_name;
      end if;
    end loop;
  end if;
end $partcast_preflight$;`;

const stage = (tag, condition, sql) => `do $partcast_${tag}$
begin
  if ${condition} then
    execute $partcast_${tag}_sql$
${body(sql)}
    $partcast_${tag}_sql$;
  end if;
end $partcast_${tag}$;`;

const first = `-- PARTCAST COMPLETE SETUP / UPGRADE: PART 1 OF 2
-- Expected project: ragdjkdcrvexqfadlqbf (check the Supabase dashboard project).
-- Run this entire file in SQL Editor as postgres, wait for success, then run Part 2
-- in a SEPARATE execution. This preserves inventory, sales, balances and Auth users.
-- Store access pauses after this file until Part 2 succeeds. Configure Gmail before deploying.
-- Unrecognized/partial older schemas stop with an error instead of deleting records.
begin;
${preflight}

-- Fresh projects get the complete original schema. Recognized existing projects keep it.
${stage('baseline', "to_regclass('public.profiles') is null", schema + '\n' + rls)}

-- These two constraints can be safely reapplied to existing PartCast records.
${training.trim()}

-- Each original feature migration is transactional. Only install a missing feature.
${stage('offline', "to_regclass('public.inventory_sync_receipts') is null", offline)}
${stage('workflows', "to_regclass('public.stock_batches') is null", workflows)}

do $partcast_features$
declare tab text; col record;
begin
  foreach tab in array array['inventory_sync_receipts','stock_notifications','notification_reads','job_leases','stock_batches','customer_debts','debt_payments','business_sync_receipts'] loop
    if to_regclass('public.'||tab) is null then raise exception 'Incomplete PartCast feature: missing %. No data was removed.',tab;end if;
  end loop;
  for col in select * from (values
    ('products','category'),('products','barcode'),('products','search_aliases'),('products','photo_paths'),('products','alias_text'),
    ('inventory_transactions','batch_id'),('supplier_email_logs','request_payload')
  ) as expected(table_name,column_name) loop
    if not exists(select 1 from information_schema.columns c where c.table_schema='public'
                  and c.table_name=col.table_name and c.column_name=col.column_name) then
      raise exception 'Incomplete PartCast feature: missing %.%. No data was removed.',col.table_name,col.column_name;
    end if;
  end loop;
  if to_regprocedure('public.sync_inventory_movement(uuid,jsonb)') is null
     or to_regprocedure('public.store_number(numeric,boolean)') is null
     or to_regprocedure('public.change_product_photo(uuid,text,boolean)') is null
     or to_regprocedure('public.claim_job(text,uuid,integer)') is null
     or to_regclass('public.customer_balances') is null
     or not exists(select 1 from information_schema.columns where table_schema='public' and table_name='products' and column_name='photo_paths')
     or not exists(select 1 from information_schema.columns where table_schema='public' and table_name='supplier_email_logs' and column_name='request_payload') then
    raise exception 'The existing PartCast feature migration is incomplete. No data was removed. Restore the complete migration before continuing.';
  end if;
end $partcast_features$;

${roles.trim()}

-- Explicit grants support fresh Supabase projects and restore the intended privileges.
-- No grant is made on other applications' tables or on Supabase Auth internals.
grant usage on schema public to authenticated, service_role;
do $partcast_permissions$
declare tab text; pol record; col record;
begin
  foreach tab in array ${literalArray(business)} loop
    execute format('alter table public.%I enable row level security',tab);
    execute format('revoke all on public.%I from public,anon,authenticated',tab);
    for col in select column_name from information_schema.columns where table_schema='public' and table_name=tab loop
      execute format('revoke select(%1$I),insert(%1$I),update(%1$I),references(%1$I) on public.%2$I from public,anon,authenticated',col.column_name,tab);
    end loop;
    execute format('grant select on public.%I to authenticated',tab);
    execute format('grant all on public.%I to service_role',tab);
    -- Part 2 installs the final password/code/role policies. Deny access in between.
    for pol in select policyname from pg_policies where schemaname='public' and tablename=tab loop
      execute format('drop policy %I on public.%I',pol.policyname,tab);
    end loop;
  end loop;
  foreach tab in array array['inventory_sync_receipts','business_sync_receipts','job_leases'] loop
    execute format('alter table public.%I enable row level security',tab);
    execute format('revoke all on public.%I from public,anon,authenticated',tab);
    execute format('grant all on public.%I to service_role',tab);
  end loop;
end $partcast_permissions$;
revoke insert,update,delete on public.profiles,public.inventory_transactions,public.demand_observations,
  public.legacy_sales,public.purchase_history,public.forecast_runs,public.demand_forecasts,
  public.audit_logs,public.backup_logs,public.supplier_email_logs,
  public.stock_batches,public.customer_debts,public.debt_payments from authenticated;
revoke insert,update on public.products from authenticated;
grant insert(part_number,sub_number,description,brand,unit,location,minimum_stock,safety_stock,unit_cost,selling_price,active,category,barcode,search_aliases),
      update(part_number,sub_number,description,brand,unit,location,minimum_stock,safety_stock,unit_cost,selling_price,active,category,barcode,search_aliases)
  on public.products to authenticated;
grant delete on public.products to authenticated;
grant insert,update,delete on public.suppliers,public.product_suppliers,public.import_batches,public.system_settings to authenticated;
revoke insert,update,delete on public.stock_notifications,public.notification_reads from authenticated;
grant insert on public.notification_reads to authenticated;
revoke all on public.inventory_status,public.customer_balances,public.latest_completed_forecast_run,public.reorder_recommendations from public,anon,authenticated;
grant select on public.inventory_status,public.customer_balances,public.latest_completed_forecast_run,public.reorder_recommendations to authenticated,service_role;
grant usage,select on sequence public.audit_logs_id_seq to service_role;
revoke all on sequence public.audit_logs_id_seq from public,anon,authenticated;
revoke execute on function public.apply_inventory_transaction(uuid,public.inventory_tx_type,numeric,numeric,numeric,text,uuid,text,numeric,text,timestamptz) from public,anon;
grant execute on function public.apply_inventory_transaction(uuid,public.inventory_tx_type,numeric,numeric,numeric,text,uuid,text,numeric,text,timestamptz) to authenticated,service_role;

-- Add missing profiles for existing Auth users without promoting or activating them.
insert into public.profiles(id,full_name)
select id,coalesce(raw_user_meta_data->>'full_name','') from auth.users
on conflict(id) do nothing;

-- Also block privileged movement functions until the final policies are installed.
create or replace function public.current_app_role()
returns public.app_role language sql stable security definer set search_path=public
as $$select null::public.app_role$$;
commit;
select 'Part 1 complete. Run Part 2 in a separate SQL Editor execution to restore store access.' as next_step;
`;

const reusableLogin = body(login)
  .replace(/^create table public\./gm, 'create table if not exists public.')
  .replace(/^create function public\./gm, 'create or replace function public.')
  .replace(/^drop policy (\w+) on /gm, 'drop policy if exists $1 on ');
const second = `-- PARTCAST COMPLETE SETUP / UPGRADE: PART 2 OF 2
-- Run separately AFTER Part 1 succeeds and commits. Safe to repeat after a successful installation.
-- Requires the current API/frontend release and Gmail OAuth configuration for staff login.
begin;
do $partcast_requires_part_one$
begin
  if to_regclass('public.business_sync_receipts') is null or to_regtype('public.app_role') is null then
    raise exception 'Run Part 1 first, wait for success, then run Part 2 separately.';
  end if;
  if (select count(*) from pg_enum where enumtypid='public.app_role'::regtype and enumlabel in ('super_admin','cashier'))<>2 then
    raise exception 'The new roles are missing. Run Part 1 and let it commit before Part 2.';
  end if;
end $partcast_requires_part_one$;

${reusableLogin}

-- Private buckets stay private when upgrading an existing store.
update storage.buckets set public=false where id in ('partcast-photos','partcast-models','partcast-backups');
-- Ask Supabase's API to refresh its schema cache after the transaction commits.
notify pgrst,'reload schema';
commit;
select 'PartCast schema, required email verification and access roles are ready. Configure Gmail and redeploy both services.' as result;
select enum_range(null::public.app_role) as available_roles;
select (select count(*) from public.products) as preserved_products,
       (select count(*) from public.inventory_transactions) as preserved_stock_movements,
       (select count(*) from public.customer_debts) as preserved_customer_balances;
`;

await mkdir(output, { recursive: true });
await writeFile(new URL('01_schema_and_roles.sql', output), first);
await writeFile(new URL('02_login_and_permissions.sql', output), second);
console.log('Generated the two complete paste-ready Supabase SQL files.');

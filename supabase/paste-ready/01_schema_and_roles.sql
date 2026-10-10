-- PARTCAST COMPLETE SETUP / UPGRADE: PART 1 OF 2
-- Expected project: ragdjkdcrvexqfadlqbf (check the Supabase dashboard project).
-- Run this entire file in SQL Editor as postgres, wait for success, then run Part 2
-- in a SEPARATE execution. This preserves inventory, sales, balances and Auth users.
-- Store access pauses after this file until Part 2 succeeds. Configure Gmail before deploying.
-- Unrecognized/partial older schemas stop with an error instead of deleting records.
begin;
do $partcast_preflight$
declare tab text; col record;
begin
  if to_regclass('auth.users') is null or to_regclass('storage.buckets') is null
     or to_regprocedure('auth.uid()') is null or to_regprocedure('auth.jwt()') is null then
    raise exception 'Open this script in a Supabase project SQL Editor using the postgres role.';
  end if;
  if to_regclass('public.profiles') is null then
    if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
              where n.nspname='public' and c.relname=any(array['profiles','suppliers','products','product_suppliers','inventory_transactions','demand_observations','legacy_sales','purchase_history','import_batches','forecast_runs','demand_forecasts','supplier_email_logs','backup_logs','audit_logs','system_settings','stock_batches','customer_debts','debt_payments','stock_notifications','notification_reads'])) then
      raise exception 'Existing tables are not a complete PartCast schema. No data was removed. Review the existing schema before continuing.';
    end if;
  else
    foreach tab in array array['profiles','suppliers','products','product_suppliers','inventory_transactions','demand_observations','legacy_sales','purchase_history','import_batches','forecast_runs','demand_forecasts','supplier_email_logs','backup_logs','audit_logs','system_settings'] loop
      if to_regclass('public.'||tab) is null then
        raise exception 'Existing PartCast schema is missing table %. No data was removed.', tab;
      end if;
    end loop;
    for col in select * from (values
      ('profiles','id'),
      ('profiles','full_name'),
      ('profiles','role'),
      ('profiles','active'),
      ('profiles','created_at'),
      ('profiles','updated_at'),
      ('suppliers','id'),
      ('suppliers','name'),
      ('suppliers','contact_person'),
      ('suppliers','email'),
      ('suppliers','phone'),
      ('suppliers','address'),
      ('suppliers','active'),
      ('suppliers','created_at'),
      ('suppliers','updated_at'),
      ('products','id'),
      ('products','part_number'),
      ('products','sub_number'),
      ('products','description'),
      ('products','brand'),
      ('products','unit'),
      ('products','location'),
      ('products','current_stock'),
      ('products','minimum_stock'),
      ('products','safety_stock'),
      ('products','unit_cost'),
      ('products','selling_price'),
      ('products','active'),
      ('products','created_at'),
      ('products','updated_at'),
      ('product_suppliers','product_id'),
      ('product_suppliers','supplier_id'),
      ('product_suppliers','supplier_part_number'),
      ('product_suppliers','latest_unit_cost'),
      ('product_suppliers','lead_time_days'),
      ('product_suppliers','is_primary'),
      ('product_suppliers','updated_at'),
      ('inventory_transactions','id'),
      ('inventory_transactions','product_id'),
      ('inventory_transactions','tx_type'),
      ('inventory_transactions','quantity'),
      ('inventory_transactions','unit_cost'),
      ('inventory_transactions','unit_price'),
      ('inventory_transactions','reference_no'),
      ('inventory_transactions','supplier_id'),
      ('inventory_transactions','customer_name'),
      ('inventory_transactions','total_amount'),
      ('inventory_transactions','notes'),
      ('inventory_transactions','occurred_at'),
      ('inventory_transactions','created_by'),
      ('inventory_transactions','created_at'),
      ('demand_observations','id'),
      ('demand_observations','product_id'),
      ('demand_observations','occurred_on'),
      ('demand_observations','quantity'),
      ('demand_observations','source'),
      ('demand_observations','source_reference'),
      ('demand_observations','created_at'),
      ('legacy_sales','id'),
      ('legacy_sales','reference_no'),
      ('legacy_sales','sale_date'),
      ('legacy_sales','customer_name'),
      ('legacy_sales','amount'),
      ('legacy_sales','raw_items'),
      ('legacy_sales','matched_product_id'),
      ('legacy_sales','imported_at'),
      ('legacy_sales','import_batch_id'),
      ('purchase_history','id'),
      ('purchase_history','product_id'),
      ('purchase_history','supplier_id'),
      ('purchase_history','part_number'),
      ('purchase_history','description'),
      ('purchase_history','brand'),
      ('purchase_history','quantity'),
      ('purchase_history','unit_cost'),
      ('purchase_history','amount'),
      ('purchase_history','reference_no'),
      ('purchase_history','purchase_date'),
      ('purchase_history','notes'),
      ('purchase_history','imported_at'),
      ('purchase_history','import_batch_id'),
      ('import_batches','id'),
      ('import_batches','file_name'),
      ('import_batches','file_sha256'),
      ('import_batches','import_type'),
      ('import_batches','status'),
      ('import_batches','rows_read'),
      ('import_batches','rows_imported'),
      ('import_batches','rows_skipped'),
      ('import_batches','warnings'),
      ('import_batches','created_by'),
      ('import_batches','created_at'),
      ('import_batches','completed_at'),
      ('forecast_runs','id'),
      ('forecast_runs','status'),
      ('forecast_runs','model_name'),
      ('forecast_runs','model_version'),
      ('forecast_runs','horizon_days'),
      ('forecast_runs','include_proxy'),
      ('forecast_runs','training_rows'),
      ('forecast_runs','product_count'),
      ('forecast_runs','training_date_min'),
      ('forecast_runs','training_date_max'),
      ('forecast_runs','metrics'),
      ('forecast_runs','model_storage_path'),
      ('forecast_runs','error_message'),
      ('forecast_runs','started_by'),
      ('forecast_runs','started_at'),
      ('forecast_runs','completed_at'),
      ('demand_forecasts','id'),
      ('demand_forecasts','run_id'),
      ('demand_forecasts','product_id'),
      ('demand_forecasts','forecast_date'),
      ('demand_forecasts','predicted_quantity'),
      ('demand_forecasts','created_at'),
      ('supplier_email_logs','id'),
      ('supplier_email_logs','supplier_id'),
      ('supplier_email_logs','recipient_email'),
      ('supplier_email_logs','subject'),
      ('supplier_email_logs','recommendation_hash'),
      ('supplier_email_logs','item_count'),
      ('supplier_email_logs','status'),
      ('supplier_email_logs','provider_message_id'),
      ('supplier_email_logs','error_message'),
      ('supplier_email_logs','sent_by'),
      ('supplier_email_logs','sent_at'),
      ('backup_logs','id'),
      ('backup_logs','storage_path'),
      ('backup_logs','file_name'),
      ('backup_logs','status'),
      ('backup_logs','size_bytes'),
      ('backup_logs','error_message'),
      ('backup_logs','created_by'),
      ('backup_logs','created_at'),
      ('audit_logs','id'),
      ('audit_logs','actor_id'),
      ('audit_logs','action'),
      ('audit_logs','entity_type'),
      ('audit_logs','entity_id'),
      ('audit_logs','metadata'),
      ('audit_logs','ip_hash'),
      ('audit_logs','created_at'),
      ('system_settings','key'),
      ('system_settings','value'),
      ('system_settings','updated_by'),
      ('system_settings','updated_at')
    ) as expected(table_name,column_name) loop
      if not exists(select 1 from information_schema.columns c where c.table_schema='public'
                    and c.table_name=col.table_name and c.column_name=col.column_name) then
        raise exception 'Existing PartCast schema is missing %.%. No data was removed.', col.table_name,col.column_name;
      end if;
    end loop;
  end if;
end $partcast_preflight$;

-- Fresh projects get the complete original schema. Recognized existing projects keep it.
do $partcast_baseline$
begin
  if to_regclass('public.profiles') is null then
    execute $partcast_baseline_sql$
create extension if not exists pgcrypto;

create type public.app_role as enum ('owner', 'admin', 'inventory_staff');
create type public.inventory_tx_type as enum ('initial', 'stock_in', 'stock_out', 'sale');
create type public.forecast_status as enum ('running', 'completed', 'failed');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  role public.app_role not null default 'inventory_staff',
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  contact_person text,
  email text,
  phone text,
  address text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  part_number text,
  sub_number text,
  description text not null,
  brand text,
  unit text,
  location text,
  current_stock numeric(14,2) not null default 0 check (current_stock >= 0),
  minimum_stock numeric(14,2) not null default 0 check (minimum_stock >= 0),
  safety_stock numeric(14,2) not null default 0 check (safety_stock >= 0),
  unit_cost numeric(14,2) not null default 0 check (unit_cost >= 0),
  selling_price numeric(14,2) not null default 0 check (selling_price >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index products_part_number_unique
  on public.products (upper(trim(part_number)))
  where part_number is not null and trim(part_number) <> '';

create index products_description_idx on public.products using gin (to_tsvector('simple', description));

create table public.product_suppliers (
  product_id uuid not null references public.products(id) on delete cascade,
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  supplier_part_number text,
  latest_unit_cost numeric(14,2) not null default 0,
  lead_time_days integer not null default 7 check (lead_time_days between 0 and 365),
  is_primary boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (product_id, supplier_id)
);

create unique index one_primary_supplier_per_product
  on public.product_suppliers(product_id)
  where is_primary = true;

create table public.inventory_transactions (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id),
  tx_type public.inventory_tx_type not null,
  quantity numeric(14,2) not null check (quantity > 0),
  unit_cost numeric(14,2),
  unit_price numeric(14,2),
  reference_no text,
  supplier_id uuid references public.suppliers(id),
  customer_name text,
  total_amount numeric(14,2),
  notes text,
  occurred_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index inventory_transactions_product_date_idx
  on public.inventory_transactions(product_id, occurred_at desc);
create index inventory_transactions_type_date_idx
  on public.inventory_transactions(tx_type, occurred_at desc);

create table public.demand_observations (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  occurred_on date not null,
  quantity numeric(14,2) not null check (quantity > 0),
  source text not null check (source in ('actual_sale', 'legacy_transaction_proxy')),
  source_reference text,
  created_at timestamptz not null default now()
);
create index demand_observations_product_date_idx on public.demand_observations(product_id, occurred_on);

create table public.legacy_sales (
  id uuid primary key default gen_random_uuid(),
  reference_no text,
  sale_date date,
  customer_name text,
  amount numeric(14,2),
  raw_items text,
  matched_product_id uuid references public.products(id),
  imported_at timestamptz not null default now(),
  import_batch_id uuid
);
create index legacy_sales_date_idx on public.legacy_sales(sale_date);

create table public.purchase_history (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.products(id),
  supplier_id uuid references public.suppliers(id),
  part_number text,
  description text,
  brand text,
  quantity numeric(14,2),
  unit_cost numeric(14,2),
  amount numeric(14,2),
  reference_no text,
  purchase_date date,
  notes text,
  imported_at timestamptz not null default now(),
  import_batch_id uuid
);

create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  file_name text not null,
  file_sha256 text,
  import_type text not null check (import_type in ('inventory', 'legacy_sales')),
  status text not null default 'processing' check (status in ('processing','completed','failed')),
  rows_read integer not null default 0,
  rows_imported integer not null default 0,
  rows_skipped integer not null default 0,
  warnings jsonb not null default '[]'::jsonb,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table public.legacy_sales
  add constraint legacy_sales_import_batch_fk foreign key (import_batch_id) references public.import_batches(id) on delete set null;
alter table public.purchase_history
  add constraint purchase_history_import_batch_fk foreign key (import_batch_id) references public.import_batches(id) on delete set null;

create index import_batches_hash_idx on public.import_batches(import_type, file_sha256);

create table public.forecast_runs (
  id uuid primary key default gen_random_uuid(),
  status public.forecast_status not null default 'running',
  model_name text not null default 'XGBoost Regression',
  model_version text,
  horizon_days integer not null default 30,
  include_proxy boolean not null default false,
  training_rows integer not null default 0,
  product_count integer not null default 0,
  training_date_min date,
  training_date_max date,
  metrics jsonb,
  model_storage_path text,
  error_message text,
  started_by uuid references auth.users(id),
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create table public.demand_forecasts (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.forecast_runs(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  forecast_date date not null,
  predicted_quantity numeric(14,4) not null check (predicted_quantity >= 0),
  created_at timestamptz not null default now(),
  unique(run_id, product_id, forecast_date)
);
create index demand_forecasts_product_date_idx on public.demand_forecasts(product_id, forecast_date);

create table public.supplier_email_logs (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers(id),
  recipient_email text not null,
  subject text not null,
  recommendation_hash text not null,
  item_count integer not null default 0,
  status text not null check (status in ('sent','failed','skipped')),
  provider_message_id text,
  error_message text,
  sent_by uuid references auth.users(id),
  sent_at timestamptz not null default now()
);
create index supplier_email_logs_supplier_date_idx on public.supplier_email_logs(supplier_id, sent_at desc);

create table public.backup_logs (
  id uuid primary key default gen_random_uuid(),
  storage_path text,
  file_name text,
  status text not null check (status in ('created','failed')),
  size_bytes bigint,
  error_message text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.audit_logs (
  id bigserial primary key,
  actor_id uuid references auth.users(id),
  action text not null,
  entity_type text not null,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  ip_hash text,
  created_at timestamptz not null default now()
);
create index audit_logs_created_at_idx on public.audit_logs(created_at desc);

create table public.system_settings (
  key text primary key,
  value jsonb not null,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

insert into public.system_settings(key, value) values
  ('forecast_horizon_days', '30'::jsonb),
  ('auto_supplier_email_enabled', 'false'::jsonb),
  ('supplier_email_cooldown_days', '3'::jsonb),
  ('backup_retention_days', '30'::jsonb),
  ('include_legacy_proxy_by_default', 'false'::jsonb)
on conflict do nothing;

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger profiles_updated_at before update on public.profiles
for each row execute function public.set_updated_at();
create trigger suppliers_updated_at before update on public.suppliers
for each row execute function public.set_updated_at();
create trigger products_updated_at before update on public.products
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles(id, full_name)
  values(new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.current_app_role()
returns public.app_role
language sql
stable
security definer set search_path = public
as $$
  select role from public.profiles where id = auth.uid() and active = true
$$;

create or replace function public.apply_inventory_transaction(
  p_product_id uuid,
  p_tx_type public.inventory_tx_type,
  p_quantity numeric,
  p_unit_cost numeric default null,
  p_unit_price numeric default null,
  p_reference_no text default null,
  p_supplier_id uuid default null,
  p_customer_name text default null,
  p_total_amount numeric default null,
  p_notes text default null,
  p_occurred_at timestamptz default now()
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_current numeric;
  v_new numeric;
  v_tx_id uuid;
  v_role public.app_role;
begin
  v_role := public.current_app_role();
  if coalesce(auth.role(), '') <> 'service_role' then
    if auth.uid() is null or v_role not in ('owner','admin','inventory_staff') then
      raise exception 'Not authorized';
    end if;
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Quantity must be greater than zero';
  end if;

  select current_stock into v_current from public.products where id = p_product_id for update;
  if not found then raise exception 'Product not found'; end if;

  if p_tx_type in ('initial','stock_in') then
    v_new := v_current + p_quantity;
  elsif p_tx_type in ('stock_out','sale') then
    if v_current < p_quantity then raise exception 'Insufficient stock'; end if;
    v_new := v_current - p_quantity;
  else
    raise exception 'Unsupported transaction type';
  end if;

  update public.products
  set current_stock = v_new,
      unit_cost = case when p_unit_cost is not null and p_unit_cost >= 0 then p_unit_cost else unit_cost end,
      selling_price = case when p_unit_price is not null and p_unit_price >= 0 then p_unit_price else selling_price end
  where id = p_product_id;

  insert into public.inventory_transactions(
    product_id, tx_type, quantity, unit_cost, unit_price, reference_no,
    supplier_id, customer_name, total_amount, notes, occurred_at, created_by
  ) values (
    p_product_id, p_tx_type, p_quantity, p_unit_cost, p_unit_price, p_reference_no,
    p_supplier_id, p_customer_name, p_total_amount, p_notes, p_occurred_at, auth.uid()
  ) returning id into v_tx_id;

  if p_tx_type = 'sale' then
    insert into public.demand_observations(product_id, occurred_on, quantity, source, source_reference)
    values(p_product_id, p_occurred_at::date, p_quantity, 'actual_sale', p_reference_no);
  end if;

  return v_tx_id;
end $$;

create or replace function public.get_dashboard_metrics()
returns jsonb
language sql
stable
security invoker
as $$
select jsonb_build_object(
  'totalProducts', count(*) filter (where active),
  'lowStock', count(*) filter (where active and current_stock > 0 and current_stock <= minimum_stock),
  'outOfStock', count(*) filter (where active and current_stock = 0),
  'inventoryValue', coalesce(sum(current_stock * unit_cost) filter (where active),0),
  'retailValue', coalesce(sum(current_stock * selling_price) filter (where active),0)
) from public.products;
$$;

create or replace function public.get_sales_trend(p_days integer default 30)
returns table(day date, quantity numeric, revenue numeric)
language sql
stable
security invoker
as $$
  with days as (
    select generate_series(current_date - greatest(p_days,1) + 1, current_date, interval '1 day')::date as day
  ), sales as (
    select occurred_at::date as day,
           sum(quantity) as quantity,
           sum(coalesce(total_amount, quantity * coalesce(unit_price,0))) as revenue
    from public.inventory_transactions
    where tx_type='sale' and occurred_at >= current_date - greatest(p_days,1) + 1
    group by occurred_at::date
  ), legacy as (
    select sale_date as day, sum(amount) as revenue
    from public.legacy_sales
    where sale_date >= current_date - greatest(p_days,1) + 1
    group by sale_date
  )
  select d.day,
         coalesce(s.quantity,0)::numeric,
         (coalesce(s.revenue,0)+coalesce(l.revenue,0))::numeric
  from days d
  left join sales s using(day)
  left join legacy l using(day)
  order by d.day;
$$;

create or replace function public.get_top_moving_products(p_days integer default 90, p_limit integer default 10, p_direction text default 'desc')
returns table(product_id uuid, part_number text, description text, quantity numeric)
language plpgsql
stable
security invoker
as $$
begin
  if lower(p_direction) = 'asc' then
    return query
      select p.id, p.part_number, p.description, coalesce(sum(t.quantity),0)::numeric
      from public.products p
      left join public.inventory_transactions t
        on t.product_id=p.id and t.tx_type='sale' and t.occurred_at >= current_date - greatest(p_days,1)
      where p.active
      group by p.id
      order by coalesce(sum(t.quantity),0) asc, p.description
      limit greatest(p_limit,1);
  else
    return query
      select p.id, p.part_number, p.description, coalesce(sum(t.quantity),0)::numeric
      from public.products p
      left join public.inventory_transactions t
        on t.product_id=p.id and t.tx_type='sale' and t.occurred_at >= current_date - greatest(p_days,1)
      where p.active
      group by p.id
      order by coalesce(sum(t.quantity),0) desc, p.description
      limit greatest(p_limit,1);
  end if;
end $$;

create or replace view public.latest_completed_forecast_run with (security_invoker = true) as
select * from public.forecast_runs
where status='completed'
order by completed_at desc nulls last, started_at desc
limit 1;

create or replace view public.reorder_recommendations with (security_invoker = true) as
with latest as (
  select id, horizon_days from public.latest_completed_forecast_run
), predicted as (
  select f.product_id, sum(f.predicted_quantity) as predicted_quantity
  from public.demand_forecasts f
  join latest l on l.id=f.run_id
  where f.forecast_date > current_date
    and f.forecast_date <= current_date + l.horizon_days
  group by f.product_id
), primary_supplier as (
  select distinct on (ps.product_id)
    ps.product_id, s.id supplier_id, s.name supplier_name, s.email supplier_email,
    ps.latest_unit_cost, ps.lead_time_days
  from public.product_suppliers ps
  join public.suppliers s on s.id=ps.supplier_id and s.active
  order by ps.product_id, ps.is_primary desc, ps.updated_at desc
)
select
  p.id product_id,
  p.part_number,
  p.description,
  p.brand,
  p.current_stock,
  p.minimum_stock,
  p.safety_stock,
  coalesce(pr.predicted_quantity,0) predicted_quantity,
  greatest(ceil(greatest(coalesce(pr.predicted_quantity,0) + p.safety_stock, p.minimum_stock) - p.current_stock),0)::numeric recommended_quantity,
  ps.supplier_id,
  ps.supplier_name,
  ps.supplier_email,
  coalesce(ps.latest_unit_cost,p.unit_cost) estimated_unit_cost,
  greatest(ceil(greatest(coalesce(pr.predicted_quantity,0) + p.safety_stock, p.minimum_stock) - p.current_stock),0) * coalesce(ps.latest_unit_cost,p.unit_cost) estimated_order_cost,
  case
    when p.current_stock = 0 then 'out_of_stock'
    when p.current_stock <= p.minimum_stock then 'low_stock'
    when greatest(ceil(greatest(coalesce(pr.predicted_quantity,0) + p.safety_stock, p.minimum_stock) - p.current_stock),0) > 0 then 'forecast_reorder'
    else 'ok'
  end as status
from public.products p
left join predicted pr on pr.product_id=p.id
left join primary_supplier ps on ps.product_id=p.id
where p.active;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('partcast-backups','partcast-backups',false,52428800,array['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
on conflict (id) do nothing;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('partcast-models','partcast-models',false,52428800,array['application/json','application/octet-stream'])
on conflict (id) do nothing;

create or replace view public.inventory_status with (security_invoker = true) as
select p.*,
  case when current_stock=0 then 'out'
       when current_stock<=minimum_stock then 'low'
       else 'ok' end as stock_status
from public.products p;

alter table public.profiles enable row level security;
alter table public.suppliers enable row level security;
alter table public.products enable row level security;
alter table public.product_suppliers enable row level security;
alter table public.inventory_transactions enable row level security;
alter table public.demand_observations enable row level security;
alter table public.legacy_sales enable row level security;
alter table public.purchase_history enable row level security;
alter table public.import_batches enable row level security;
alter table public.forecast_runs enable row level security;
alter table public.demand_forecasts enable row level security;
alter table public.supplier_email_logs enable row level security;
alter table public.backup_logs enable row level security;
alter table public.audit_logs enable row level security;
alter table public.system_settings enable row level security;

create policy profiles_select on public.profiles for select to authenticated
using (id=auth.uid() or public.current_app_role() in ('owner','admin'));

create policy suppliers_select on public.suppliers for select to authenticated using (true);
create policy suppliers_write on public.suppliers for all to authenticated
using (public.current_app_role() in ('owner','admin'))
with check (public.current_app_role() in ('owner','admin'));

create policy products_select on public.products for select to authenticated using (true);
create policy products_insert on public.products for insert to authenticated
with check (public.current_app_role() in ('owner','admin','inventory_staff'));
create policy products_update on public.products for update to authenticated
using (public.current_app_role() in ('owner','admin','inventory_staff'))
with check (public.current_app_role() in ('owner','admin','inventory_staff'));
create policy products_delete on public.products for delete to authenticated
using (public.current_app_role() in ('owner','admin'));

create policy product_suppliers_select on public.product_suppliers for select to authenticated using (true);
create policy product_suppliers_write on public.product_suppliers for all to authenticated
using (public.current_app_role() in ('owner','admin'))
with check (public.current_app_role() in ('owner','admin'));

create policy transactions_select on public.inventory_transactions for select to authenticated using (true);
create policy transactions_insert on public.inventory_transactions for insert to authenticated
with check (public.current_app_role() in ('owner','admin','inventory_staff'));

create policy observations_select on public.demand_observations for select to authenticated using (true);
create policy observations_insert on public.demand_observations for insert to authenticated
with check (public.current_app_role() in ('owner','admin','inventory_staff'));

create policy legacy_sales_select on public.legacy_sales for select to authenticated using (true);
create policy purchase_history_select on public.purchase_history for select to authenticated using (true);
create policy import_batches_select on public.import_batches for select to authenticated using (true);
create policy import_batches_write on public.import_batches for all to authenticated
using (public.current_app_role() in ('owner','admin'))
with check (public.current_app_role() in ('owner','admin'));

create policy forecast_runs_select on public.forecast_runs for select to authenticated using (true);
create policy demand_forecasts_select on public.demand_forecasts for select to authenticated using (true);
create policy supplier_email_logs_select on public.supplier_email_logs for select to authenticated
using (public.current_app_role() in ('owner','admin'));
create policy backup_logs_select on public.backup_logs for select to authenticated
using (public.current_app_role() in ('owner','admin'));
create policy audit_logs_select on public.audit_logs for select to authenticated
using (public.current_app_role() in ('owner','admin'));
create policy settings_select on public.system_settings for select to authenticated
using (public.current_app_role() in ('owner','admin'));
create policy settings_write on public.system_settings for all to authenticated
using (public.current_app_role()='owner')
with check (public.current_app_role()='owner');

create policy backup_objects_read on storage.objects for select to authenticated
using (bucket_id='partcast-backups' and public.current_app_role() in ('owner','admin'));
create policy model_objects_read on storage.objects for select to authenticated
using (bucket_id='partcast-models' and public.current_app_role() in ('owner','admin'));

revoke update on public.profiles from authenticated;
revoke update, delete on public.inventory_transactions from authenticated;
revoke update, delete on public.demand_observations from authenticated;
revoke insert, update, delete on public.audit_logs from authenticated;
revoke insert, update, delete on public.forecast_runs from authenticated;
revoke insert, update, delete on public.demand_forecasts from authenticated;
revoke insert, update, delete on public.backup_logs from authenticated;
revoke insert, update, delete on public.supplier_email_logs from authenticated;


revoke execute on function public.apply_inventory_transaction(uuid, public.inventory_tx_type, numeric, numeric, numeric, text, uuid, text, numeric, text, timestamptz) from public, anon;
grant execute on function public.apply_inventory_transaction(uuid, public.inventory_tx_type, numeric, numeric, numeric, text, uuid, text, numeric, text, timestamptz) to authenticated, service_role;
    $partcast_baseline_sql$;
  end if;
end $partcast_baseline$;

-- These two constraints can be safely reapplied to existing PartCast records.
-- PartCast upgrade: allow the cleaned XGBoost training-ready spreadsheet to be imported
-- Run this after 0001_schema.sql and 0002_rls.sql on an existing deployment.

alter table public.demand_observations
  drop constraint if exists demand_observations_source_check;

alter table public.demand_observations
  add constraint demand_observations_source_check
  check (source in ('actual_sale', 'legacy_transaction_proxy', 'imported_training_data'));

alter table public.import_batches
  drop constraint if exists import_batches_import_type_check;

alter table public.import_batches
  add constraint import_batches_import_type_check
  check (import_type in ('inventory', 'legacy_sales', 'demand_training'));

-- Each original feature migration is transactional. Only install a missing feature.
do $partcast_offline$
begin
  if to_regclass('public.inventory_sync_receipts') is null then
    execute $partcast_offline_sql$
-- Offline sync, active-account access and stock alerts. Apply after 0003.

create or replace function public.apply_inventory_transaction(
  p_product_id uuid,
  p_tx_type public.inventory_tx_type,
  p_quantity numeric,
  p_unit_cost numeric default null,
  p_unit_price numeric default null,
  p_reference_no text default null,
  p_supplier_id uuid default null,
  p_customer_name text default null,
  p_total_amount numeric default null,
  p_notes text default null,
  p_occurred_at timestamptz default now()
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_current numeric;
  v_new numeric;
  v_tx_id uuid;
  v_role public.app_role;
begin
  v_role := public.current_app_role();
  if coalesce(auth.role(), '') <> 'service_role' then
    if auth.uid() is null or v_role is null or v_role not in ('owner','admin','inventory_staff') then
      raise exception 'Not authorized';
    end if;
  end if;

  if p_quantity is null or p_quantity <= 0 or p_quantity::text in ('NaN','Infinity','-Infinity') then
    raise exception 'Quantity must be greater than zero';
  end if;

  if p_unit_cost < 0 or p_unit_price < 0 or p_total_amount < 0 then raise exception 'Amounts cannot be negative' using errcode = '22023'; end if;
  if p_occurred_at > now() + interval '5 minutes' then raise exception 'Transaction date cannot be in the future' using errcode = '22023'; end if;

  select current_stock into v_current from public.products where id = p_product_id and active for update;
  if not found then raise exception 'Product not found'; end if;

  if p_tx_type in ('initial','stock_in') then
    v_new := v_current + p_quantity;
  elsif p_tx_type in ('stock_out','sale') then
    if v_current < p_quantity then raise exception 'Insufficient stock. Review the saved transaction.' using errcode = 'P0001'; end if;
    v_new := v_current - p_quantity;
  else
    raise exception 'Unsupported transaction type';
  end if;

  update public.products
  set current_stock = v_new,
      unit_cost = case when p_unit_cost is not null and p_unit_cost >= 0 then p_unit_cost else unit_cost end,
      selling_price = case when p_unit_price is not null and p_unit_price >= 0 then p_unit_price else selling_price end
  where id = p_product_id;

  insert into public.inventory_transactions(
    product_id, tx_type, quantity, unit_cost, unit_price, reference_no,
    supplier_id, customer_name, total_amount, notes, occurred_at, created_by
  ) values (
    p_product_id, p_tx_type, p_quantity, p_unit_cost, p_unit_price, p_reference_no,
    p_supplier_id, p_customer_name, p_total_amount, p_notes, p_occurred_at, auth.uid()
  ) returning id into v_tx_id;

  if p_tx_type = 'sale' then
    insert into public.demand_observations(product_id, occurred_on, quantity, source, source_reference)
    values(p_product_id, p_occurred_at::date, p_quantity, 'actual_sale', p_reference_no);
  end if;

  return v_tx_id;
end $$;

-- Every retry uses the same UUID; the movement and receipt commit together.
create table public.inventory_sync_receipts (
  user_id uuid not null references auth.users(id),
  operation_id uuid not null,
  payload jsonb not null,
  transaction_id uuid not null references public.inventory_transactions(id),
  created_at timestamptz not null default now(),
  primary key(user_id, operation_id)
);
alter table public.inventory_sync_receipts enable row level security;
revoke all on public.inventory_sync_receipts from public, anon, authenticated;

create or replace function public.sync_inventory_movement(p_operation_id uuid, p_payload jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_receipt public.inventory_sync_receipts;
  v_tx uuid;
begin
  if v_user is null or public.current_app_role() is null then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if p_operation_id is null or p_payload is null or p_payload->>'tx_type' not in ('stock_in','stock_out','sale') then
    raise exception 'Invalid stock movement' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_user::text || p_operation_id::text,0));
  select * into v_receipt from public.inventory_sync_receipts where user_id=v_user and operation_id=p_operation_id;
  if found then
    if v_receipt.payload <> p_payload then raise exception 'Operation ID already used for a different movement' using errcode='22023'; end if;
    return v_receipt.transaction_id;
  end if;
  v_tx := public.apply_inventory_transaction(
    (p_payload->>'product_id')::uuid, (p_payload->>'tx_type')::public.inventory_tx_type,
    (p_payload->>'quantity')::numeric, (p_payload->>'unit_cost')::numeric,
    (p_payload->>'unit_price')::numeric, p_payload->>'reference_no',
    (p_payload->>'supplier_id')::uuid, p_payload->>'customer_name',
    (p_payload->>'total_amount')::numeric, p_payload->>'notes',
    coalesce((p_payload->>'occurred_at')::timestamptz,now())
  );
  insert into public.inventory_sync_receipts(user_id,operation_id,payload,transaction_id) values(v_user,p_operation_id,p_payload,v_tx);
  return v_tx;
end $$;
revoke all on function public.sync_inventory_movement(uuid,jsonb) from public, anon;
grant execute on function public.sync_inventory_movement(uuid,jsonb) to authenticated;

-- Inactive or merely registered users must not read business records directly.
do $$
declare v_table text; v_policy text;
begin
  foreach v_table in array array['suppliers','products','product_suppliers','inventory_transactions','demand_observations','legacy_sales','purchase_history','import_batches','forecast_runs','demand_forecasts'] loop
    select policyname into v_policy from pg_policies where schemaname='public' and tablename=v_table and cmd='SELECT';
    if v_policy is not null then execute format('drop policy %I on public.%I',v_policy,v_table); end if;
    execute format('create policy active_staff_read on public.%I for select to authenticated using (public.current_app_role() is not null)',v_table);
  end loop;
end $$;
-- Stock can only change through the atomic function, never direct table writes.
revoke insert, update on public.products from authenticated;
grant insert (part_number,sub_number,description,brand,unit,location,minimum_stock,safety_stock,unit_cost,selling_price,active) on public.products to authenticated;
grant update (part_number,sub_number,description,brand,unit,location,minimum_stock,safety_stock,unit_cost,selling_price,active) on public.products to authenticated;
revoke insert on public.inventory_transactions, public.demand_observations from authenticated;

create table public.stock_notifications (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  kind text not null check (kind in ('low','out')),
  title text not null,
  message text not null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create unique index one_open_stock_alert on public.stock_notifications(product_id) where resolved_at is null;
create table public.notification_reads (
  notification_id uuid references public.stock_notifications(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key(notification_id,user_id)
);
alter table public.stock_notifications enable row level security;
alter table public.notification_reads enable row level security;
create policy stock_alert_read on public.stock_notifications for select to authenticated using (public.current_app_role() is not null);
create policy own_notification_reads on public.notification_reads for select to authenticated using (user_id=auth.uid() and public.current_app_role() is not null);
create policy mark_own_alert on public.notification_reads for insert to authenticated with check (user_id=auth.uid() and public.current_app_role() is not null);
revoke all on public.stock_notifications, public.notification_reads from anon;
grant select on public.stock_notifications, public.notification_reads to authenticated;
grant insert on public.notification_reads to authenticated;

create or replace function public.stock_alert_after_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_kind text;
begin
  v_kind := case when not new.active then null when new.current_stock=0 then 'out' when new.current_stock<=new.minimum_stock then 'low' else null end;
  if tg_op='UPDATE' then
    if new.current_stock=old.current_stock and new.minimum_stock=old.minimum_stock and new.active=old.active then return new; end if;
  end if;
  update public.stock_notifications set resolved_at=now() where product_id=new.id and resolved_at is null and (v_kind is null or kind<>v_kind);
  if v_kind is not null then
    insert into public.stock_notifications(product_id,kind,title,message)
    values(new.id,v_kind,case when v_kind='out' then 'Out of stock' else 'Low stock' end || ': ' || new.description,
      coalesce(new.part_number,'No part number') || ' has ' || new.current_stock || ' ' || coalesce(new.unit,'units') || ' available. Minimum: ' || new.minimum_stock || '.')
    on conflict(product_id) where resolved_at is null do update set message=excluded.message,title=excluded.title;
  end if;
  return new;
end $$;
create trigger stock_alert_changed after insert or update on public.products for each row execute function public.stock_alert_after_change();
insert into public.stock_notifications(product_id,kind,title,message)
select id,case when current_stock=0 then 'out' else 'low' end,
case when current_stock=0 then 'Out of stock: ' else 'Low stock: ' end || description,
coalesce(part_number,'No part number') || ' has ' || current_stock || ' ' || coalesce(unit,'units') || ' available. Minimum: ' || minimum_stock || '.'
from public.products where active and current_stock<=minimum_stock;

-- A lease prevents overlapping server instances and scheduled jobs sending together.
create table public.job_leases (name text primary key, token uuid not null, expires_at timestamptz not null);
alter table public.job_leases enable row level security;
revoke all on public.job_leases from public, anon, authenticated;
create or replace function public.claim_job(p_name text,p_token uuid,p_seconds integer default 120)
returns boolean language plpgsql security definer set search_path=public as $$
declare v_claimed text;
begin
 insert into public.job_leases(name,token,expires_at) values(p_name,p_token,now()+make_interval(secs=>least(600,greatest(30,p_seconds))))
 on conflict(name) do update set token=excluded.token,expires_at=excluded.expires_at where public.job_leases.expires_at<now()
 returning name into v_claimed;
 return v_claimed is not null;
end $$;
create or replace function public.release_job(p_name text,p_token uuid)
returns void language sql security definer set search_path=public as $$
 delete from public.job_leases where name=p_name and token=p_token
$$;
revoke all on function public.claim_job(text,uuid,integer),public.release_job(text,uuid) from public,anon,authenticated;
grant execute on function public.claim_job(text,uuid,integer),public.release_job(text,uuid) to service_role;
    $partcast_offline_sql$;
  end if;
end $partcast_offline$;
do $partcast_workflows$
begin
  if to_regclass('public.stock_batches') is null then
    execute $partcast_workflows_sql$
-- Customer credit, atomic baskets, product identification and private photos.

alter table public.products
 add column category text not null default 'parts' check(category in ('parts','lubricants','fuel','accessories','other')),
 add column barcode text check(barcode is null or barcode ~ '^[A-Za-z0-9 ._/-]{1,80}$'),
 add column search_aliases text[] not null default '{}',
 add column photo_paths text[] not null default '{}';
create function public.alias_join(a text[]) returns text language sql immutable as $$select array_to_string(a,' ')$$;
alter table public.products add column alias_text text generated always as (public.alias_join(search_aliases)) stored;
create unique index products_barcode_unique on public.products(upper(trim(barcode))) where barcode is not null;
alter table public.products add constraint product_alias_limit check(cardinality(search_aliases)<=20), add constraint product_photo_limit check(cardinality(photo_paths)<=4);
create or replace view public.inventory_status with (security_invoker=true) as
 select p.id,p.part_number,p.sub_number,p.description,p.brand,p.unit,p.location,p.current_stock,p.minimum_stock,p.safety_stock,p.unit_cost,p.selling_price,p.active,p.created_at,p.updated_at,
 case when p.current_stock<=0 then 'out' when p.current_stock<=p.minimum_stock then 'low' else 'ok' end as stock_status,
 p.category,p.barcode,p.search_aliases,p.photo_paths,p.alias_text from public.products p;
grant insert(category,barcode,search_aliases),update(category,barcode,search_aliases) on public.products to authenticated;
create table public.stock_batches (
 id uuid primary key default gen_random_uuid(), tx_type public.inventory_tx_type not null check(tx_type in ('sale','stock_in')),
 customer_name text, reference_no text, notes text, total_amount numeric(14,2) not null check(total_amount>=0),
 paid_amount numeric(14,2) not null check(paid_amount>=0 and paid_amount<=total_amount),
 occurred_at timestamptz not null, created_by uuid references auth.users(id), created_at timestamptz not null default now()
);
alter table public.inventory_transactions add column batch_id uuid references public.stock_batches(id);
create table public.customer_debts (
 id uuid primary key default gen_random_uuid(), batch_id uuid unique references public.stock_batches(id),
 customer_name text not null check(length(trim(customer_name)) between 2 and 240), phone text,
 principal numeric(14,2) not null check(principal>0), due_date date, reference_no text, notes text,
 occurred_at timestamptz not null default now(), created_by uuid references auth.users(id), created_at timestamptz not null default now()
);
create table public.debt_payments (
 id uuid primary key default gen_random_uuid(), debt_id uuid not null references public.customer_debts(id),
 amount numeric(14,2) not null check(amount>0), notes text, paid_at timestamptz not null default now(), created_by uuid references auth.users(id)
);
create index debt_payments_debt on public.debt_payments(debt_id);
create view public.customer_balances with(security_invoker=true) as
 select d.*,coalesce(p.paid,0) as paid_amount,d.principal-coalesce(p.paid,0) as balance,
 case when d.principal-coalesce(p.paid,0)=0 then 'paid' when d.due_date<(now() at time zone 'Asia/Manila')::date then 'overdue' else 'open' end as status
 from public.customer_debts d left join (select debt_id,sum(amount) paid from public.debt_payments group by debt_id) p on p.debt_id=d.id;
create table public.business_sync_receipts(
 user_id uuid references auth.users(id),operation_id uuid,payload jsonb not null,result jsonb not null,created_at timestamptz default now(),primary key(user_id,operation_id)
);
do $$declare tab text;begin
 foreach tab in array array['stock_batches','customer_debts','debt_payments'] loop
 execute format('alter table public.%I enable row level security',tab);
 execute format('create policy active_staff_read on public.%I for select to authenticated using(public.current_app_role() is not null)',tab);
 execute format('revoke all on public.%I from public,anon,authenticated',tab);
 execute format('grant select on public.%I to authenticated',tab);
 end loop;
end $$;
grant all on public.stock_batches,public.customer_debts,public.debt_payments,public.business_sync_receipts to service_role;
alter table public.business_sync_receipts enable row level security;
revoke all on public.business_sync_receipts from public,anon,authenticated;
grant select on public.customer_balances to authenticated;
create function public.store_number(v numeric, positive boolean default false) returns numeric language plpgsql immutable as $$begin
 if v is null or v::text in ('NaN','Infinity','-Infinity') or v<0 or v>=1000000000000 or v<>round(v,2) or (positive and v=0) then
 raise exception 'Enter a valid amount or quantity with at most 2 decimal places' using errcode='22023'; end if;
 return v;
end $$;
revoke all on function public.store_number(numeric,boolean) from public,anon,authenticated;
create or replace function public.apply_inventory_transaction(
  p_product_id uuid,
  p_tx_type public.inventory_tx_type,
  p_quantity numeric,
  p_unit_cost numeric default null,
  p_unit_price numeric default null,
  p_reference_no text default null,
  p_supplier_id uuid default null,
  p_customer_name text default null,
  p_total_amount numeric default null,
  p_notes text default null,
  p_occurred_at timestamptz default now()
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_current numeric;
  v_new numeric;
  v_tx_id uuid;
  v_role public.app_role;
begin
  v_role := public.current_app_role();
  if coalesce(auth.role(), '') <> 'service_role' then
    if auth.uid() is null or v_role is null or v_role not in ('owner','admin','inventory_staff') then
      raise exception 'Not authorized';
    end if;
  end if;

  perform public.store_number(p_quantity,true);
  if p_unit_cost is not null then perform public.store_number(p_unit_cost);end if;
  if p_unit_price is not null then perform public.store_number(p_unit_price);end if;
  if p_total_amount is not null then perform public.store_number(p_total_amount);end if;
  if p_quantity is null or p_quantity <= 0 or p_quantity::text in ('NaN','Infinity','-Infinity') then
    raise exception 'Quantity must be greater than zero';
  end if;

  if p_unit_cost < 0 or p_unit_price < 0 or p_total_amount < 0 then raise exception 'Amounts cannot be negative' using errcode = '22023'; end if;
  if p_occurred_at > now() + interval '5 minutes' then raise exception 'Transaction date cannot be in the future' using errcode = '22023'; end if;

  select current_stock into v_current from public.products where id = p_product_id and active for update;
  if not found then raise exception 'Product not found'; end if;

  if p_tx_type in ('initial','stock_in') then
    v_new := v_current + p_quantity;
  elsif p_tx_type in ('stock_out','sale') then
    if v_current < p_quantity then raise exception 'Insufficient stock. Review the saved transaction.' using errcode = 'P0001'; end if;
    v_new := v_current - p_quantity;
  else
    raise exception 'Unsupported transaction type';
  end if;

  update public.products
  set current_stock = v_new,
      unit_cost = case when p_unit_cost is not null and p_unit_cost >= 0 then p_unit_cost else unit_cost end,
      selling_price = case when p_unit_price is not null and p_unit_price >= 0 then p_unit_price else selling_price end
  where id = p_product_id;

  insert into public.inventory_transactions(
    product_id, tx_type, quantity, unit_cost, unit_price, reference_no,
    supplier_id, customer_name, total_amount, notes, occurred_at, created_by
  ) values (
    p_product_id, p_tx_type, p_quantity, p_unit_cost, p_unit_price, p_reference_no,
    p_supplier_id, p_customer_name, p_total_amount, p_notes, p_occurred_at, auth.uid()
  ) returning id into v_tx_id;

  if p_tx_type = 'sale' then
    insert into public.demand_observations(product_id, occurred_on, quantity, source, source_reference)
    values(p_product_id, p_occurred_at::date, p_quantity, 'actual_sale', p_reference_no);
  end if;

  return v_tx_id;
end $$;


create function public.sync_store_operation(p_operation_id uuid,p_payload jsonb) returns jsonb
 language plpgsql security definer set search_path=public as $$
declare
 u uuid:=auth.uid(); saved public.business_sync_receipts; action text:=p_payload->>'kind';
 result jsonb; item jsonb; pid uuid; tid uuid; bid uuid; did uuid; payment_id uuid;
 qty numeric; price numeric; total numeric:=0; paid numeric; balance numeric; principal numeric;
 customer text:=nullif(trim(p_payload->>'customer_name'),''); dt timestamptz; due date; mode public.inventory_tx_type;
 ids jsonb:='[]';
begin
 if u is null or public.current_app_role() is null then raise exception 'Not authorized' using errcode='42501';end if;
 if p_operation_id is null or action is null or action not in ('batch','debt','payment') then raise exception 'Invalid store operation' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text||p_operation_id::text,0));
 select * into saved from public.business_sync_receipts where user_id=u and operation_id=p_operation_id;
 if found then
 if saved.payload<>p_payload then raise exception 'Operation ID already used for a different change' using errcode='22023';end if;
 return saved.result;end if;
 dt:=coalesce((p_payload->>'occurred_at')::timestamptz,now());
 if dt>now()+interval '5 minutes' then raise exception 'Date cannot be in the future' using errcode='22023';end if;
 due:=(p_payload->>'due_date')::date;
 if action='batch' and due is not null and due<(dt at time zone 'Asia/Manila')::date then raise exception 'Due date must be on or after the sale date' using errcode='22023';end if;
 if length(coalesce(customer,''))>240 or length(coalesce(p_payload->>'phone',''))>80 or length(coalesce(p_payload->>'reference_no',''))>180 or length(coalesce(p_payload->>'notes',''))>1000 then raise exception 'Text is too long' using errcode='22023';end if;
 if action='batch' then
 mode:=(p_payload->>'tx_type')::public.inventory_tx_type;
 if mode is null or mode not in ('sale','stock_in') or jsonb_typeof(p_payload->'lines') is distinct from 'array' or jsonb_array_length(p_payload->'lines') not between 1 and 100 then raise exception 'Choose 1 to 100 parts and a valid sale or delivery' using errcode='22023';end if;
 if (select count(distinct (x->>'product_id')::uuid) from jsonb_array_elements(p_payload->'lines') x)<>jsonb_array_length(p_payload->'lines') then raise exception 'Each part must appear once in the basket' using errcode='22023';end if;
 perform id from public.products where id in(select (x->>'product_id')::uuid from jsonb_array_elements(p_payload->'lines') x) order by id for update;
 for item in select value from jsonb_array_elements(p_payload->'lines') loop
 qty:=public.store_number((item->>'quantity')::numeric,true);price:=public.store_number((item->>'unit_price')::numeric);
 total:=public.store_number(total+round(qty*price,2));
 end loop;
 if mode='stock_in' and coalesce((p_payload->>'is_credit')::boolean,false) then raise exception 'Utang applies to customer sales only' using errcode='22023';end if;
 paid:=case when mode='stock_in' or not coalesce((p_payload->>'is_credit')::boolean,false) then total else public.store_number((p_payload->>'paid_amount')::numeric) end;
 if paid>total then raise exception 'Payment cannot exceed the sale total' using errcode='22023';end if;
 if mode='sale' and paid<total and length(coalesce(customer,''))<2 then raise exception 'Customer name is required for utang' using errcode='22023';end if;
 insert into public.stock_batches(tx_type,customer_name,reference_no,notes,total_amount,paid_amount,occurred_at,created_by)
 values(mode,customer,p_payload->>'reference_no',p_payload->>'notes',total,paid,dt,u) returning id into bid;
 for item in select value from jsonb_array_elements(p_payload->'lines') loop
 pid:=(item->>'product_id')::uuid;qty:=(item->>'quantity')::numeric;price:=(item->>'unit_price')::numeric;
 tid:=public.apply_inventory_transaction(pid,mode,qty,case when mode='stock_in' then price else null end,case when mode='sale' then price else null end,
 p_payload->>'reference_no',(p_payload->>'supplier_id')::uuid,customer,round(qty*price,2),p_payload->>'notes',dt);
 update public.inventory_transactions set batch_id=bid where id=tid;ids:=ids||jsonb_build_array(tid);
 end loop;
 if mode='sale' and paid<total then
 insert into public.customer_debts(batch_id,customer_name,phone,principal,due_date,reference_no,notes,occurred_at,created_by)
 values(bid,customer,p_payload->>'phone',total-paid,due,p_payload->>'reference_no',p_payload->>'notes',dt,u) returning id into did;
 end if;
 result:=jsonb_build_object('batchId',bid,'transactionIds',ids,'total',total,'debtId',did,'balance',case when mode='sale' then total-paid else 0 end);
 elsif action='debt' then
 if length(coalesce(customer,''))<2 then raise exception 'Enter the customer name' using errcode='22023';end if;
 principal:=public.store_number((p_payload->>'principal')::numeric,true);
 insert into public.customer_debts(customer_name,phone,principal,due_date,reference_no,notes,occurred_at,created_by)
 values(customer,p_payload->>'phone',principal,due,p_payload->>'reference_no',p_payload->>'notes',dt,u) returning id into did;
 result:=jsonb_build_object('debtId',did,'balance',principal);
 else
 did:=(p_payload->>'debt_id')::uuid;
 select d.principal into principal from public.customer_debts d where id=did for update;
 if not found then raise exception 'Customer balance was not found' using errcode='22023';end if;
 select principal-coalesce(sum(amount),0) into balance from public.debt_payments where debt_id=did;
 paid:=public.store_number((p_payload->>'amount')::numeric,true);
 if paid>balance then raise exception 'Payment cannot exceed the remaining balance' using errcode='22023';end if;
 if dt<(select occurred_at from public.customer_debts where id=did) then raise exception 'Payment date must be on or after the sale date' using errcode='22023';end if;
 insert into public.debt_payments(debt_id,amount,notes,paid_at,created_by) values(did,paid,p_payload->>'notes',dt,u) returning id into payment_id;
 result:=jsonb_build_object('paymentId',payment_id,'balance',balance-paid);
 end if;
 insert into public.business_sync_receipts(user_id,operation_id,payload,result) values(u,p_operation_id,p_payload,result);
 return result;
end $$;
revoke all on function public.sync_store_operation(uuid,jsonb) from public,anon;
grant execute on function public.sync_store_operation(uuid,jsonb) to authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('partcast-photos','partcast-photos',false,5242880,array['image/webp']) on conflict(id) do nothing;
create function public.change_product_photo(p_id uuid,p_path text,p_remove boolean default false) returns text[]
 language plpgsql security definer set search_path=public as $$declare paths text[];begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'Not authorized' using errcode='42501';end if;
 if p_path !~ ('^'||p_id::text||'/[0-9a-f-]{36}\.webp$') then raise exception 'Invalid photo' using errcode='22023';end if;
 select photo_paths into paths from public.products where id=p_id and active for update;
 if not found then raise exception 'Product not found';end if;
 if p_remove then paths:=array_remove(paths,p_path);
 elsif not(p_path=any(paths)) then
 if cardinality(paths)>=4 then raise exception 'A part can have up to 4 photos' using errcode='22023';end if;
 paths:=array_append(paths,p_path);end if;
 update public.products set photo_paths=paths where id=p_id;return paths;
end $$;
revoke all on function public.change_product_photo(uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.change_product_photo(uuid,text,boolean) to service_role;
alter table public.supplier_email_logs add column request_payload jsonb;
    $partcast_workflows_sql$;
  end if;
end $partcast_workflows$;

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

-- Apply this file in a separate SQL Editor run before 0007.
-- PostgreSQL must commit new enum values before another migration uses them.
alter type public.app_role add value if not exists 'super_admin';
alter type public.app_role add value if not exists 'cashier';

-- Explicit grants support fresh Supabase projects and restore the intended privileges.
-- No grant is made on other applications' tables or on Supabase Auth internals.
grant usage on schema public to authenticated, service_role;
do $partcast_permissions$
declare tab text; pol record; col record;
begin
  foreach tab in array array['profiles','suppliers','products','product_suppliers','inventory_transactions','demand_observations','legacy_sales','purchase_history','import_batches','forecast_runs','demand_forecasts','supplier_email_logs','backup_logs','audit_logs','system_settings','stock_batches','customer_debts','debt_payments','stock_notifications','notification_reads'] loop
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

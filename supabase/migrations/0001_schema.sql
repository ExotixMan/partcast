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

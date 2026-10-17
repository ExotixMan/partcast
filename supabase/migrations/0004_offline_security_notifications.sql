-- Offline sync, active-account access and stock alerts. Apply after 0003.
begin;

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
commit;

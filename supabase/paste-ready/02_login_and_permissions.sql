


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

create table if not exists public.email_login_challenges (
 session_id uuid primary key,user_id uuid not null references auth.users(id) on delete cascade,
 code_hash text not null check(length(code_hash)=64),expires_at timestamptz not null,
 sent_at timestamptz not null default now(),attempts integer not null default 0 check(attempts between 0 and 5)
);
create table if not exists public.login_verifications (
 session_id uuid primary key,user_id uuid not null references auth.users(id) on delete cascade,
 verified_at timestamptz not null default now(),expires_at timestamptz not null
);
create table if not exists public.integration_settings (
 provider text primary key check(provider in ('gmail','gemini')),enabled boolean not null default true,
 encrypted_config text not null,updated_at timestamptz not null default now(),updated_by uuid references auth.users(id)
);
alter table public.email_login_challenges enable row level security;
alter table public.login_verifications enable row level security;
alter table public.integration_settings enable row level security;
revoke all on public.email_login_challenges,public.login_verifications,public.integration_settings from public,anon,authenticated;
grant all on public.email_login_challenges,public.login_verifications,public.integration_settings to service_role;

create or replace function public.issue_email_challenge(p_user uuid,p_session uuid,p_hash text) returns void
language plpgsql security definer set search_path=public as $$begin
 if p_user is null or p_session is null or p_hash is null or length(p_hash)<>64 then raise exception 'Invalid sign-in request' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_session::text,0));
 if exists(select 1 from public.email_login_challenges where session_id=p_session and sent_at>now()-interval '60 seconds') then raise exception 'Wait 60 seconds before requesting another code' using errcode='P0001';end if;
 insert into public.email_login_challenges(session_id,user_id,code_hash,expires_at,sent_at,attempts)
 values(p_session,p_user,p_hash,now()+interval '10 minutes',now(),0)
 on conflict(session_id) do update set user_id=excluded.user_id,code_hash=excluded.code_hash,expires_at=excluded.expires_at,sent_at=excluded.sent_at,attempts=0;
end $$;
create or replace function public.verify_email_challenge(p_user uuid,p_session uuid,p_hash text) returns jsonb
language plpgsql security definer set search_path=public as $$declare c public.email_login_challenges;begin
 if p_user is null or p_session is null or p_hash is null or length(p_hash)<>64 then raise exception 'Invalid sign-in request' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_session::text,0));
 if exists(select 1 from public.login_verifications where session_id=p_session and user_id=p_user and expires_at>now()) then return jsonb_build_object('verified',true);end if;
 select * into c from public.email_login_challenges where session_id=p_session and user_id=p_user for update;
 if not found or c.expires_at<=now() then return jsonb_build_object('verified',false,'error','The code is expired. Request a new code.');end if;
 if c.attempts>=5 then return jsonb_build_object('verified',false,'error','Too many incorrect attempts. Request a new code after the resend wait.');end if;
 if c.code_hash<>p_hash then
 update public.email_login_challenges set attempts=attempts+1 where session_id=p_session;
 return jsonb_build_object('verified',false,'error','The code is incorrect. Check your most recent email.');end if;
 insert into public.login_verifications(session_id,user_id,expires_at)values(p_session,p_user,now()+interval '12 hours')
 on conflict(session_id) do update set user_id=excluded.user_id,verified_at=now(),expires_at=excluded.expires_at;
 delete from public.email_login_challenges where session_id=p_session;
 return jsonb_build_object('verified',true);
end $$;
revoke all on function public.issue_email_challenge(uuid,uuid,text),public.verify_email_challenge(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.issue_email_challenge(uuid,uuid,text),public.verify_email_challenge(uuid,uuid,text) to service_role;
create or replace function public.current_app_role() returns public.app_role language sql stable security definer set search_path=public as $$
 select p.role from public.profiles p where p.id=auth.uid() and p.active and auth.jwt()->'amr' @> '[{"method":"password"}]'::jsonb and exists(
 select 1 from public.login_verifications v where v.user_id=p.id and v.session_id=nullif(auth.jwt()->>'session_id','')::uuid and v.expires_at>now())
$$;

do $$declare tab text;pol record;allowed text;begin
 foreach tab in array array['profiles','products','suppliers','product_suppliers','inventory_transactions','demand_observations','legacy_sales','purchase_history','import_batches','forecast_runs','demand_forecasts','supplier_email_logs','backup_logs','audit_logs','system_settings','stock_batches','customer_debts','debt_payments','stock_notifications','notification_reads'] loop
 for pol in select policyname from pg_policies where schemaname='public' and tablename=tab loop execute format('drop policy %I on public.%I',pol.policyname,tab);end loop;
 if tab='profiles' then
 execute 'create policy staff_profiles_read on public.profiles for select to authenticated using (public.current_app_role() is not null and (id=auth.uid() or public.current_app_role()=''super_admin'' or (public.current_app_role() in (''owner'',''admin'') and role<>''super_admin'')))';
 else
 allowed:=case when tab in ('products','stock_notifications') then 'public.current_app_role() is not null'
 when tab='notification_reads' then 'user_id=auth.uid() and public.current_app_role() is not null'
 when tab in ('supplier_email_logs','backup_logs','audit_logs','system_settings','import_batches') then 'public.current_app_role() in (''super_admin'',''owner'',''admin'')'
 else 'public.current_app_role() in (''super_admin'',''owner'',''admin'',''inventory_staff'')' end;
 execute format('create policy role_read on public.%I for select to authenticated using (%s)',tab,allowed);
 end if;
 end loop;
end $$;
create policy product_create on public.products for insert to authenticated with check(public.current_app_role() in ('super_admin','owner','admin','inventory_staff'));
create policy product_edit on public.products for update to authenticated using(public.current_app_role() in ('super_admin','owner','admin','inventory_staff')) with check(public.current_app_role() in ('super_admin','owner','admin','inventory_staff'));
create policy product_remove on public.products for delete to authenticated using(public.current_app_role() in ('super_admin','owner','admin'));
create policy supplier_manage on public.suppliers for all to authenticated using(public.current_app_role() in ('super_admin','owner','admin')) with check(public.current_app_role() in ('super_admin','owner','admin'));
create policy product_supplier_manage on public.product_suppliers for all to authenticated using(public.current_app_role() in ('super_admin','owner','admin')) with check(public.current_app_role() in ('super_admin','owner','admin'));
create policy import_manage on public.import_batches for all to authenticated using(public.current_app_role() in ('super_admin','owner','admin')) with check(public.current_app_role() in ('super_admin','owner','admin'));
create policy settings_manage on public.system_settings for all to authenticated using(public.current_app_role() in ('super_admin','owner')) with check(public.current_app_role() in ('super_admin','owner'));
create policy own_alert_mark on public.notification_reads for insert to authenticated with check(user_id=auth.uid() and public.current_app_role() is not null);
grant all on public.stock_notifications,public.notification_reads to service_role;
drop policy if exists backup_objects_read on storage.objects;
drop policy if exists model_objects_read on storage.objects;
create policy backup_objects_read on storage.objects for select to authenticated using(bucket_id='partcast-backups' and public.current_app_role() in ('super_admin','owner','admin'));
create policy model_objects_read on storage.objects for select to authenticated using(bucket_id='partcast-models' and public.current_app_role()='super_admin');
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
    if auth.uid() is null or v_role is null or v_role not in ('super_admin','owner','admin','inventory_staff','cashier') then
      raise exception 'Not authorized';
    end if;
  end if;

  if v_role='cashier' and p_tx_type not in ('sale','stock_in') then raise exception 'Cashiers can record sales and deliveries only' using errcode='42501';end if;
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


      unit_cost = case when p_tx_type in ('initial','stock_in') and p_unit_cost is not null and p_unit_cost >= 0 then p_unit_cost else unit_cost end
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
    values(p_product_id, (p_occurred_at at time zone 'Asia/Manila')::date, p_quantity, 'actual_sale', p_reference_no);
  end if;

  return v_tx_id;
end $$;


create or replace function public.sync_store_operation(p_operation_id uuid,p_payload jsonb) returns jsonb
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
 if public.current_app_role()='cashier' and action<>'batch' then raise exception 'Cashiers cannot change customer balances' using errcode='42501';end if;
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
  greatest(ceil(greatest(coalesce(pr.predicted_quantity,0) + p.safety_stock, p.minimum_stock) - p.current_stock),case when p.current_stock <= p.minimum_stock then 1 else 0 end)::numeric recommended_quantity,
  ps.supplier_id,
  ps.supplier_name,
  ps.supplier_email,
  coalesce(ps.latest_unit_cost,p.unit_cost) estimated_unit_cost,
  greatest(ceil(greatest(coalesce(pr.predicted_quantity,0) + p.safety_stock, p.minimum_stock) - p.current_stock),case when p.current_stock <= p.minimum_stock then 1 else 0 end) * coalesce(ps.latest_unit_cost,p.unit_cost) estimated_order_cost,
  case
    when p.current_stock = 0 then 'out_of_stock'
    when p.current_stock <= p.minimum_stock then 'low_stock'
    when greatest(ceil(greatest(coalesce(pr.predicted_quantity,0) + p.safety_stock, p.minimum_stock) - p.current_stock),case when p.current_stock <= p.minimum_stock then 1 else 0 end) > 0 then 'forecast_reorder'
    else 'ok'
  end as status,
  p.unit,
  p.category,
  p.location
from public.products p
left join predicted pr on pr.product_id=p.id
left join primary_supplier ps on ps.product_id=p.id
where p.active;
notify pgrst,'reload schema';

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
), needs as (
  select p.*,
    coalesce(pr.predicted_quantity,0) as predicted_quantity,
    least(2,greatest(
      ceil(greatest(coalesce(pr.predicted_quantity,0) + p.safety_stock,p.minimum_stock) - p.current_stock),
      case when p.current_stock <= p.minimum_stock then 1 else 0 end
    ))::numeric as purchase_quantity
  from public.products p
  left join predicted pr on pr.product_id=p.id
  where p.active
)
select
  p.id product_id,
  p.part_number,
  p.description,
  p.brand,
  p.current_stock,
  p.minimum_stock,
  p.safety_stock,
  p.predicted_quantity,
  p.purchase_quantity recommended_quantity,
  ps.supplier_id,
  ps.supplier_name,
  ps.supplier_email,
  coalesce(ps.latest_unit_cost,p.unit_cost) estimated_unit_cost,
  p.purchase_quantity * coalesce(ps.latest_unit_cost,p.unit_cost) estimated_order_cost,
  case
    when p.current_stock = 0 then 'out_of_stock'
    when p.current_stock <= p.minimum_stock then 'low_stock'
    when p.purchase_quantity > 0 then 'forecast_reorder'
    else 'ok'
  end as status,
  p.unit,
  p.category,
  p.location
from needs p
left join primary_supplier ps on ps.product_id=p.id;
notify pgrst,'reload schema';

create or replace function public.check_sale_price() returns trigger
 language plpgsql set search_path=public as $$
begin
 if new.tx_type='sale' then
  if new.unit_price is null or new.unit_price::text in ('NaN','Infinity','-Infinity') or new.unit_price<=0 then
   raise exception 'Enter a selling price greater than zero for every part' using errcode='22023';
  end if;
 end if;
 return new;
end $$;
revoke all on function public.check_sale_price() from public,anon,authenticated;
drop trigger if exists inventory_sale_price_check on public.inventory_transactions;
create trigger inventory_sale_price_check
 before insert or update of tx_type,unit_price on public.inventory_transactions
 for each row execute function public.check_sale_price();
notify pgrst,'reload schema';

create or replace function public.save_product_supplier(
  p_product_id uuid, p_supplier_id uuid, p_latest_unit_cost numeric,
  p_lead_time_days integer, p_is_primary boolean default false,
  p_supplier_part_number text default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare saved public.product_suppliers;
begin
  if public.current_app_role() is null or public.current_app_role() not in ('super_admin','owner','admin') then
    raise exception 'Not authorized' using errcode='42501';
  end if;
  perform public.store_number(p_latest_unit_cost,false);
  if p_product_id is null or p_supplier_id is null
     or p_lead_time_days is null or p_lead_time_days<0 or p_lead_time_days>365
     or p_is_primary is null or length(p_supplier_part_number)>120 then
    raise exception 'Check the supplier, cost and delivery time.' using errcode='22023';
  end if;


  perform 1 from public.products where id=p_product_id and active for update;
  if not found then raise exception 'Choose an active part.' using errcode='22023';end if;
  perform 1 from public.suppliers where id=p_supplier_id and active for share;
  if not found then raise exception 'Choose an active supplier.' using errcode='22023';end if;
  if p_is_primary then
    update public.product_suppliers set is_primary=false,updated_at=now()
    where product_id=p_product_id and supplier_id<>p_supplier_id and is_primary;
  end if;
  insert into public.product_suppliers(product_id,supplier_id,latest_unit_cost,lead_time_days,is_primary,supplier_part_number)
  values(p_product_id,p_supplier_id,p_latest_unit_cost,p_lead_time_days,p_is_primary,p_supplier_part_number)
  on conflict(product_id,supplier_id) do update set
    latest_unit_cost=excluded.latest_unit_cost,lead_time_days=excluded.lead_time_days,
    is_primary=excluded.is_primary,updated_at=now(),
    supplier_part_number=coalesce(excluded.supplier_part_number,product_suppliers.supplier_part_number)
  returning * into saved;
  return to_jsonb(saved);
end $$;
revoke all on function public.save_product_supplier(uuid,uuid,numeric,integer,boolean,text) from public,anon;
grant execute on function public.save_product_supplier(uuid,uuid,numeric,integer,boolean,text) to authenticated;



alter table public.supplier_email_logs add column if not exists client_request_id uuid;
alter table public.supplier_email_logs add column if not exists request_hash text;
create unique index if not exists supplier_email_request_id_unique on public.supplier_email_logs(client_request_id) where client_request_id is not null;
alter table public.supplier_email_logs drop constraint if exists supplier_email_logs_status_check;
alter table public.supplier_email_logs add constraint supplier_email_logs_status_check
  check(status in ('sent','failed','skipped','sending','uncertain'));
notify pgrst,'reload schema';

create or replace function public.check_sale_price() returns trigger
 language plpgsql set search_path=public as $$
declare expected numeric;
begin
 if new.tx_type='sale' then
  if new.unit_price is null or new.unit_price::text in ('NaN','Infinity','-Infinity') or new.unit_price<=0 then
   raise exception 'Enter a selling price greater than zero for every part' using errcode='22023';
  end if;
  if new.quantity is null or new.quantity::text in ('NaN','Infinity','-Infinity') or new.quantity<=0 then
   raise exception 'Quantity must be greater than zero' using errcode='22023';
  end if;
  expected:=round(new.quantity*new.unit_price,2);
  if expected<0.01 then
   raise exception 'The sale total must be at least ₱0.01. Check the quantities and prices.' using errcode='22023';
  end if;
  if expected>=1000000000000 then
   raise exception 'The total is too large.' using errcode='22023';
  end if;
  if new.total_amount is not null and (new.total_amount::text in ('NaN','Infinity','-Infinity') or new.total_amount<>expected) then
   raise exception 'The sale total must match the quantity and selling price.' using errcode='22023';
  end if;
  new.total_amount:=expected;
 end if;
 return new;
end $$;
revoke all on function public.check_sale_price() from public,anon,authenticated;
drop trigger if exists inventory_sale_price_check on public.inventory_transactions;
create trigger inventory_sale_price_check
 before insert or update of tx_type,quantity,unit_price,total_amount on public.inventory_transactions
 for each row execute function public.check_sale_price();

create or replace function public.sync_store_operation(p_operation_id uuid,p_payload jsonb) returns jsonb
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
 if public.current_app_role()='cashier' and action<>'batch' then raise exception 'Cashiers cannot change customer balances' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text||p_operation_id::text,0));
 select * into saved from public.business_sync_receipts where user_id=u and operation_id=p_operation_id;
 if found then
 if saved.payload<>p_payload then raise exception 'Operation ID already used for a different change' using errcode='22023';end if;
 return saved.result;end if;
 dt:=coalesce((p_payload->>'occurred_at')::timestamptz,now());
 if dt>now()+interval '5 minutes' then raise exception 'Date cannot be in the future' using errcode='22023';end if;
 if action='debt' then due:=(p_payload->>'due_date')::date;end if;
 if length(coalesce(customer,''))>240 or length(coalesce(p_payload->>'phone',''))>80 or length(coalesce(p_payload->>'reference_no',''))>180 or length(coalesce(p_payload->>'notes',''))>1000 then raise exception 'Text is too long' using errcode='22023';end if;
 if action='batch' then
 mode:=(p_payload->>'tx_type')::public.inventory_tx_type;
 if mode is null or mode not in ('sale','stock_in') or jsonb_typeof(p_payload->'lines') is distinct from 'array' or jsonb_array_length(p_payload->'lines') not between 1 and 100 then raise exception 'Choose 1 to 100 parts and a valid sale or delivery' using errcode='22023';end if;
 if (select count(distinct (x->>'product_id')::uuid) from jsonb_array_elements(p_payload->'lines') x)<>jsonb_array_length(p_payload->'lines') then raise exception 'Each part must appear once in the basket' using errcode='22023';end if;
 perform id from public.products where id in(select (x->>'product_id')::uuid from jsonb_array_elements(p_payload->'lines') x) order by id for update;
 for item in select value from jsonb_array_elements(p_payload->'lines') loop
 qty:=public.store_number((item->>'quantity')::numeric,true);price:=public.store_number((item->>'unit_price')::numeric);
 if mode='sale' then
  if price<=0 then raise exception 'Enter a selling price greater than zero for every part' using errcode='22023';end if;
  if round(qty*price,2)<0.01 then raise exception 'The sale total must be at least ₱0.01. Check the quantities and prices.' using errcode='22023';end if;
 end if;
 total:=public.store_number(total+round(qty*price,2));
 end loop;
 if mode='stock_in' and coalesce((p_payload->>'is_credit')::boolean,false) then raise exception 'Utang applies to customer sales only' using errcode='22023';end if;
 paid:=case when mode='stock_in' or not coalesce((p_payload->>'is_credit')::boolean,false) then total else public.store_number((p_payload->>'paid_amount')::numeric) end;
 if paid>total then raise exception 'Payment cannot exceed the sale total' using errcode='22023';end if;
 if mode='sale' and paid<total then
  due:=(p_payload->>'due_date')::date;
  if due is not null and due<(dt at time zone 'Asia/Manila')::date then raise exception 'Due date must be on or after the sale date' using errcode='22023';end if;
 end if;
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
notify pgrst,'reload schema';


update storage.buckets set public=false where id in ('partcast-photos','partcast-models','partcast-backups');

notify pgrst,'reload schema';
commit;
select 'PartCast schema, required email verification and access roles are ready. Configure Gmail and redeploy both services.' as result;
select enum_range(null::public.app_role) as available_roles;
select (select count(*) from public.products) as preserved_products,
       (select count(*) from public.inventory_transactions) as preserved_stock_movements,
       (select count(*) from public.customer_debts) as preserved_customer_balances;

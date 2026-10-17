-- Customer credit, atomic baskets, product identification and private photos.
begin;
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
commit;

begin;
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
commit;


begin;
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
commit;

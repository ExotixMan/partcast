begin;

create or replace function public.demand_import_snapshot()
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare n bigint; fingerprint text; actual_n bigint;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'Not authorized' using errcode='42501'; end if;
 select count(*),encode(sha256(convert_to(coalesce(string_agg(
  jsonb_build_array(id,product_id,occurred_on,quantity,source_reference)::text,',' order by id),''),'UTF8')),'hex')
 into n,fingerprint from demand_observations where source='imported_training_data';
 select count(*) into actual_n from demand_observations where source='actual_sale';
 return jsonb_build_object('row_count',n,'fingerprint',fingerprint,'actual_rows',actual_n);
end $$;

create or replace function public.queue_demand_forecast()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if current_setting('partcast.defer_demand_forecast',true)='on' and auth.role()='service_role' then return null; end if;
 if tg_op='DELETE' then
  if old.source in ('actual_sale','imported_training_data','simulated_demo') then perform request_forecast_refresh(); end if;
 elsif tg_op='INSERT' then
  if new.source in ('actual_sale','imported_training_data','simulated_demo') then perform request_forecast_refresh(); end if;
 elsif (new.product_id,new.occurred_on,new.quantity,new.source) is distinct from (old.product_id,old.occurred_on,old.quantity,old.source) then
  if old.source in ('actual_sale','imported_training_data','simulated_demo') or new.source in ('actual_sale','imported_training_data','simulated_demo') then perform request_forecast_refresh(); end if;
 end if;
 return null;
end $$;

create or replace function public.replace_imported_demand(
 p_request_id uuid,p_actor uuid,p_file_name text,p_file_sha256 text,p_sheet_name text,
 p_expected_fingerprint text,p_expires_at timestamptz,p_rows jsonb,
 p_rows_read integer,p_zero_rows integer,p_warnings jsonb
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare receipt import_batches%rowtype; snapshot jsonb; row_n integer; part_n integer;
 previous_defer text; inserted_n integer;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'Not authorized' using errcode='42501'; end if;
 if not exists(select 1 from profiles where id=p_actor and active and role::text in ('super_admin','owner','admin')) then
  raise exception 'Only an active store manager can import sales history.' using errcode='42501';
 end if;
 if p_request_id is null or p_file_sha256 is null or p_file_sha256!~'^[a-f0-9]{64}$' then
  raise exception 'Invalid import request.' using errcode='22023';
 end if;
 if not pg_try_advisory_xact_lock(hashtextextended('partcast.replace_imported_demand',0)) then
  raise exception 'IMPORT_BUSY' using errcode='55P03';
 end if;
 select * into receipt from import_batches where id=p_request_id;
 if found then
  if receipt.created_by is distinct from p_actor or receipt.file_sha256 is distinct from p_file_sha256
     or receipt.import_type<>'demand_training' or receipt.status<>'completed' then
   raise exception 'Import request does not match its saved receipt.' using errcode='22023';
  end if;
  return jsonb_build_object('batchId',receipt.id,'alreadyImported',true,'rowsImported',0,
   'previousRowsImported',receipt.rows_imported,'rowsRead',receipt.rows_read,'rowsSkipped',receipt.rows_skipped);
 end if;
 if p_expires_at is null or p_expires_at<=clock_timestamp() or p_expires_at>clock_timestamp()+interval '11 minutes' then
  raise exception 'IMPORT_PREVIEW_EXPIRED' using errcode='PT409';
 end if;
 if p_file_name is null or length(p_file_name) not between 1 and 255
    or p_sheet_name is null or length(p_sheet_name) not between 1 and 80
    or p_expected_fingerprint is null or p_expected_fingerprint!~'^[a-f0-9]{64}$'
    or p_rows is null or jsonb_typeof(p_rows)<>'array'
    or p_warnings is null or jsonb_typeof(p_warnings)<>'array' then
  raise exception 'Invalid replacement data.' using errcode='22023';
 end if;
 row_n:=jsonb_array_length(p_rows);
 if row_n not between 1 and 50000 or p_zero_rows is null or p_zero_rows<0
    or p_rows_read is null or p_rows_read<row_n+p_zero_rows or p_rows_read>200000 then
  raise exception 'Import needs 1 to 50,000 daily quantities and valid row counts.' using errcode='22023';
 end if;
 if exists(select 1 from jsonb_array_elements(p_rows) r where jsonb_typeof(r)<>'object'
  or coalesce(r->>'product_id','')!~'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  or coalesce(r->>'occurred_on','')!~'^\d{4}-\d{2}-\d{2}$'
  or coalesce(r->>'quantity','')!~'^\d+(\.\d{1,2})?$'
  or coalesce(r->>'part_number','')='' or length(r->>'part_number')>120) then
  raise exception 'Every quantity needs a valid part, date and numeric sold quantity.' using errcode='22023';
 end if;
 if exists(select 1 from jsonb_to_recordset(p_rows) r(product_id uuid,occurred_on date,quantity numeric)
  where quantity<=0 or quantity>999999999999.99 or occurred_on>(clock_timestamp() at time zone 'Asia/Manila')::date) then
  raise exception 'Use positive sold quantities and dates that are not in the future.' using errcode='22023';
 end if;
 if exists(select 1 from jsonb_to_recordset(p_rows) r(product_id uuid,occurred_on date)
  group by product_id,occurred_on having count(*)>1) then
  raise exception 'Daily quantities must be combined before replacement.' using errcode='22023';
 end if;
 perform 1 from products p where p.id in(select (r->>'product_id')::uuid from jsonb_array_elements(p_rows) r)
 order by p.id for share;
 if exists(select 1 from jsonb_to_recordset(p_rows) r(product_id uuid,part_number text)
  left join products p on p.id=r.product_id
  where p.id is null or not p.active or p.part_number is distinct from r.part_number) then
  raise exception 'A matched part changed or became inactive. Review the file again.' using errcode='22023';
 end if;
 lock table demand_observations in share row exclusive mode;
 snapshot:=demand_import_snapshot();
 if snapshot->>'fingerprint' is distinct from p_expected_fingerprint then
  raise exception 'IMPORT_HISTORY_CHANGED' using errcode='PT409';
 end if;
 previous_defer:=current_setting('partcast.defer_demand_forecast',true);
 perform set_config('partcast.defer_demand_forecast','on',true);
 delete from demand_observations where source='imported_training_data';
 insert into demand_observations(product_id,occurred_on,quantity,source,source_reference)
 select r.product_id,r.occurred_on,r.quantity,'imported_training_data',
  concat('training:',p_request_id,':',p_sheet_name,':',r.part_number,':',r.occurred_on)
 from jsonb_to_recordset(p_rows) r(product_id uuid,occurred_on date,quantity numeric,part_number text);
 get diagnostics inserted_n=row_count;
 if inserted_n<>row_n then raise exception 'The complete history was not saved.'; end if;
 select count(distinct r->>'product_id') into part_n from jsonb_array_elements(p_rows) r;
 insert into import_batches(id,file_name,file_sha256,import_type,status,rows_read,rows_imported,rows_skipped,warnings,created_by,completed_at)
 values(p_request_id,p_file_name,p_file_sha256,'demand_training','completed',p_rows_read,inserted_n,p_zero_rows,p_warnings,p_actor,clock_timestamp());
 perform set_config('partcast.defer_demand_forecast',coalesce(previous_defer,''),true);
 perform request_forecast_refresh();
 return jsonb_build_object('batchId',p_request_id,'alreadyImported',false,'rowsImported',inserted_n,
  'rowsRead',p_rows_read,'rowsSkipped',p_zero_rows,'matchedProducts',part_n);
end $$;

revoke all on function public.demand_import_snapshot(),public.replace_imported_demand(uuid,uuid,text,text,text,text,timestamptz,jsonb,integer,integer,jsonb) from public,anon,authenticated;
revoke all on function public.queue_demand_forecast() from public,anon,authenticated;
grant execute on function public.demand_import_snapshot(),public.replace_imported_demand(uuid,uuid,text,text,text,text,timestamptz,jsonb,integer,integer,jsonb) to service_role;
revoke insert,update,delete on public.demand_observations from service_role;
grant select on public.demand_observations to service_role;

notify pgrst,'reload schema';
commit;

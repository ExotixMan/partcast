begin;
-- Durable, coalesced XGBoost refreshes. A sale and its refresh request commit
-- together; browser permissions never grant access to the worker operations.
create table if not exists public.forecast_refresh_state (
 id integer primary key default 1 check (id=1),
 requested_version bigint not null default 1,
 processed_version bigint not null default 0,
 claimed_version bigint not null default 0,
 status text not null default 'queued' check(status in ('queued','training','ready','waiting_history','error')),
 horizon_days integer not null default 30 check(horizon_days between 7 and 90),
 pending_since timestamptz,
 requested_at timestamptz not null default now(),
 next_attempt_at timestamptz not null default now(),
 lock_token uuid,
 lease_until timestamptz,
 attempts integer not null default 0,
 last_checked_on date,
 completed_at timestamptz,
 last_run_id uuid references public.forecast_runs(id) on delete set null,
 reason_code text
);
insert into public.forecast_refresh_state(id,horizon_days)
select 1, case when value::text ~ '^[0-9]+$' then least(90,greatest(7,value::text::integer)) else 30 end
from public.system_settings where key='forecast_horizon_days'
on conflict(id) do nothing;
insert into public.forecast_refresh_state(id) values(1) on conflict do nothing;
alter table public.forecast_refresh_state enable row level security;
drop policy if exists forecast_refresh_read on public.forecast_refresh_state;
create policy forecast_refresh_read on public.forecast_refresh_state for select to authenticated
using(public.current_app_role()::text in ('super_admin','owner','admin','inventory_staff'));
revoke all on public.forecast_refresh_state from public,anon,authenticated;
grant select on public.forecast_refresh_state to authenticated;
grant all on public.forecast_refresh_state to service_role;

create or replace function public.request_forecast_refresh(p_horizon integer default null)
returns void language plpgsql security definer set search_path=public as $$
begin
 if p_horizon is not null and (p_horizon<7 or p_horizon>90) then raise exception 'Invalid forecast horizon'; end if;
 -- Keep the owner's saved setting and every worker on the same horizon. The
 -- settings trigger queues this request once; its nested call sees the new value.
 if p_horizon is not null and (select value from system_settings where key='forecast_horizon_days') is distinct from to_jsonb(p_horizon) then
  insert into system_settings(key,value) values('forecast_horizon_days',to_jsonb(p_horizon))
  on conflict(key) do update set value=excluded.value;
  return;
 end if;
 update forecast_refresh_state set
  requested_version=requested_version+1,
  horizon_days=coalesce(p_horizon,horizon_days),
  requested_at=clock_timestamp(),
  pending_since=coalesce(pending_since,clock_timestamp()),
  next_attempt_at=least(clock_timestamp()+interval '2 seconds',coalesce(pending_since,clock_timestamp())+interval '5 seconds'),
  status=case when lock_token is not null and lease_until>clock_timestamp() then 'training' else 'queued' end,
  reason_code=null
 where id=1;
end $$;

create or replace function public.queue_demand_forecast()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 if tg_op='DELETE' then
  if old.source in ('actual_sale','imported_training_data','simulated_demo') then perform request_forecast_refresh(); end if;
 elsif tg_op='INSERT' then
  if new.source in ('actual_sale','imported_training_data','simulated_demo') then perform request_forecast_refresh(); end if;
 elsif (new.product_id,new.occurred_on,new.quantity,new.source) is distinct from (old.product_id,old.occurred_on,old.quantity,old.source) then
  if old.source in ('actual_sale','imported_training_data','simulated_demo') or new.source in ('actual_sale','imported_training_data','simulated_demo') then perform request_forecast_refresh(); end if;
 end if;
 return null;
end $$;
drop trigger if exists demand_forecast_refresh on public.demand_observations;
create trigger demand_forecast_refresh after insert or update or delete on public.demand_observations
for each row execute function public.queue_demand_forecast();

create or replace function public.queue_forecast_horizon()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.key='forecast_horizon_days' and (tg_op='INSERT' or new.value is distinct from old.value) then
  if new.value::text ~ '^[0-9]+$' then perform request_forecast_refresh(least(90,greatest(7,new.value::text::integer))); end if;
 end if;
 return null;
end $$;
drop trigger if exists forecast_horizon_refresh on public.system_settings;
create trigger forecast_horizon_refresh after insert or update on public.system_settings
for each row execute function public.queue_forecast_horizon();

create or replace function public.claim_forecast_refresh()
returns setof public.forecast_refresh_state language plpgsql security definer set search_path=public as $$
declare s forecast_refresh_state%rowtype;
 today date := (clock_timestamp() at time zone 'Asia/Manila')::date;
begin
 select * into s from forecast_refresh_state where id=1 for update skip locked;
 if not found then return; end if;
 if s.lock_token is not null and s.lease_until>clock_timestamp() then return; end if;
 -- Refresh the planning horizon daily, including after a sleeping API wakes.
 if s.requested_version=s.processed_version and s.last_checked_on is distinct from today then
  update forecast_refresh_state set requested_version=requested_version+1,status='queued',next_attempt_at=clock_timestamp() where id=1 returning * into s;
 end if;
 if s.requested_version<=s.processed_version or s.next_attempt_at>clock_timestamp() then return; end if;
 if s.lock_token is not null then
  update forecast_runs set status='failed',error_message='Automatic forecast interrupted; retrying.',completed_at=clock_timestamp() where id=s.lock_token and status='running';
 end if;
 return query update forecast_refresh_state set
  lock_token=gen_random_uuid(),lease_until=clock_timestamp()+interval '10 minutes',
  claimed_version=requested_version,status='training',pending_since=null,
  last_checked_on=today,reason_code=null
 where id=1 returning *;
end $$;

create or replace function public.finish_forecast_refresh(p_token uuid,p_outcome text,p_result jsonb default '{}')
returns boolean language plpgsql security definer set search_path=public as $$
declare s forecast_refresh_state%rowtype;
begin
 select * into s from forecast_refresh_state where id=1 for update;
 if s.lock_token is distinct from p_token or s.lease_until<=clock_timestamp() then return false; end if;
 if p_outcome not in ('completed','waiting_history','error') then raise exception 'Invalid forecast outcome'; end if;
 if p_outcome='completed' then
  update forecast_runs set status='completed',model_version=p_result->>'model_version',metrics=p_result->'metrics',
   training_date_min=(p_result->>'training_date_min')::date,training_date_max=(p_result->>'training_date_max')::date,
   model_storage_path=p_result->>'model_storage_path',completed_at=clock_timestamp()
  where id=p_token and status='running';
  if not found then raise exception 'The automatic forecast run is missing'; end if;
 end if;
 update forecast_refresh_state set
  processed_version=case when p_outcome='error' then processed_version else s.claimed_version end,
  status=case when p_outcome='error' then 'error' when requested_version>s.claimed_version then 'queued' when p_outcome='completed' then 'ready' else 'waiting_history' end,
  lock_token=null,lease_until=null,
  attempts=case when p_outcome='error' then attempts+1 else 0 end,
  next_attempt_at=case when p_outcome='error' then clock_timestamp()+make_interval(secs=>least(300,5*power(2,least(attempts,6)))::double precision) else next_attempt_at end,
  completed_at=case when p_outcome='completed' then clock_timestamp() else completed_at end,
  last_run_id=case when p_outcome='completed' then p_token else last_run_id end,
  reason_code=case when p_outcome='error' then 'FORECAST_RETRY_PENDING' when p_outcome='waiting_history' then 'FORECAST_DATA_NOT_READY' else null end
 where id=1;
 return true;
end $$;
revoke all on function public.request_forecast_refresh(integer),public.claim_forecast_refresh(),public.finish_forecast_refresh(uuid,text,jsonb),public.queue_demand_forecast(),public.queue_forecast_horizon() from public,anon,authenticated;
grant execute on function public.request_forecast_refresh(integer),public.claim_forecast_refresh(),public.finish_forecast_refresh(uuid,text,jsonb) to service_role;

do $$ begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='forecast_refresh_state') then
  alter publication supabase_realtime add table public.forecast_refresh_state;
 end if;
end $$;

notify pgrst,'reload schema';
commit;

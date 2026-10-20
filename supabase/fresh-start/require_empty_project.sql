
do $partcast_empty_project$
begin
  if to_regclass('auth.users') is null or to_regclass('storage.buckets') is null then
    raise exception 'Open this file in a new Supabase project SQL Editor as postgres.';
  end if;
  if exists(select 1 from auth.users) then
    raise exception 'This project already has Auth accounts. No records were changed. Select a new empty Supabase project.';
  end if;
  if exists(
    select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind in ('r','p','f')
      and not exists(select 1 from pg_depend d where d.classid='pg_class'::regclass
                     and d.objid=c.oid and d.deptype='e')
  ) then
    raise exception 'This project already has application tables. No records were changed. Select a new empty Supabase project.';
  end if;
  if exists(select 1 from storage.buckets) then
    raise exception 'This project already has Storage buckets. No records were changed. Select a new empty Supabase project.';
  end if;
end $partcast_empty_project$;

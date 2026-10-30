-- Publish only tables used for live page invalidation. Existing SELECT/RLS
-- policies still control which authenticated users receive each change.
do $$
declare
  table_name text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  foreach table_name in array array[
    'products', 'inventory_transactions', 'demand_observations', 'legacy_sales',
    'forecast_runs', 'suppliers', 'product_suppliers', 'import_batches',
    'profiles', 'audit_logs', 'backup_logs', 'supplier_email_logs', 'system_settings'
  ] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = table_name
    ) then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
end $$;

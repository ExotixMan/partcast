-- Read-only installation check. Run AFTER Parts 1 and 2 in the new project.
-- This checks database configuration, not Gmail delivery or forecast accuracy.
begin read only;
do $partcast_verify_installation$
declare tab text;
begin
  foreach tab in array array['profiles','products','suppliers','product_suppliers',
    'inventory_transactions','demand_observations','legacy_sales','purchase_history',
    'import_batches','forecast_runs','demand_forecasts','supplier_email_logs',
    'backup_logs','audit_logs','system_settings','stock_batches','customer_debts',
    'debt_payments','stock_notifications','notification_reads','inventory_sync_receipts',
    'business_sync_receipts','job_leases','email_login_challenges','login_verifications',
    'integration_settings'] loop
    if not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
                  where n.nspname='public' and c.relname=tab and c.relrowsecurity) then
      raise exception 'Missing protected table: %. Run both installation parts successfully first.',tab;
    end if;
    if has_table_privilege('anon',format('public.%I',tab),'SELECT') then
      raise exception 'Anonymous access is enabled for %. Reapply Part 2 and review grants.',tab;
    end if;
  end loop;
  if (select count(*) from pg_enum where enumtypid='public.app_role'::regtype
        and enumlabel in ('super_admin','owner','cashier'))<>3 then
    raise exception 'Required staff roles are missing.';
  end if;
  if (select count(*) from storage.buckets where id in
        ('partcast-photos','partcast-models','partcast-backups') and not public)<>3 then
    raise exception 'The three private PartCast Storage buckets are not ready.';
  end if;
  if to_regprocedure('public.issue_email_challenge(uuid,uuid,text)') is null
     or to_regprocedure('public.verify_email_challenge(uuid,uuid,text)') is null
     or to_regprocedure('public.sync_store_operation(uuid,jsonb)') is null then
    raise exception 'Required login or stock-operation functions are missing.';
  end if;
  if has_function_privilege('authenticated','public.issue_email_challenge(uuid,uuid,text)','EXECUTE')
     or has_function_privilege('authenticated','public.verify_email_challenge(uuid,uuid,text)','EXECUTE') then
    raise exception 'Email-code functions must be restricted to the API service role.';
  end if;
end $partcast_verify_installation$;
select 'PASS: PartCast tables, roles, private buckets and login-code restrictions are installed.' as installation_check;
select (select count(*) from auth.users) as auth_accounts,
       (select count(*) from public.profiles) as staff_profiles,
       (select count(*) from public.products) as inventory_items,
       (select count(*) from public.demand_observations) as demand_observations,
       (select count(*) from public.legacy_sales) as legacy_sales,
       (select count(*) from public.customer_debts) as customer_debts;
commit;

alter table public.profiles enable row level security;
alter table public.suppliers enable row level security;
alter table public.products enable row level security;
alter table public.product_suppliers enable row level security;
alter table public.inventory_transactions enable row level security;
alter table public.demand_observations enable row level security;
alter table public.legacy_sales enable row level security;
alter table public.purchase_history enable row level security;
alter table public.import_batches enable row level security;
alter table public.forecast_runs enable row level security;
alter table public.demand_forecasts enable row level security;
alter table public.supplier_email_logs enable row level security;
alter table public.backup_logs enable row level security;
alter table public.audit_logs enable row level security;
alter table public.system_settings enable row level security;

create policy profiles_select on public.profiles for select to authenticated
using (id=auth.uid() or public.current_app_role() in ('owner','admin'));

create policy suppliers_select on public.suppliers for select to authenticated using (true);
create policy suppliers_write on public.suppliers for all to authenticated
using (public.current_app_role() in ('owner','admin'))
with check (public.current_app_role() in ('owner','admin'));

create policy products_select on public.products for select to authenticated using (true);
create policy products_insert on public.products for insert to authenticated
with check (public.current_app_role() in ('owner','admin','inventory_staff'));
create policy products_update on public.products for update to authenticated
using (public.current_app_role() in ('owner','admin','inventory_staff'))
with check (public.current_app_role() in ('owner','admin','inventory_staff'));
create policy products_delete on public.products for delete to authenticated
using (public.current_app_role() in ('owner','admin'));

create policy product_suppliers_select on public.product_suppliers for select to authenticated using (true);
create policy product_suppliers_write on public.product_suppliers for all to authenticated
using (public.current_app_role() in ('owner','admin'))
with check (public.current_app_role() in ('owner','admin'));

create policy transactions_select on public.inventory_transactions for select to authenticated using (true);
create policy transactions_insert on public.inventory_transactions for insert to authenticated
with check (public.current_app_role() in ('owner','admin','inventory_staff'));

create policy observations_select on public.demand_observations for select to authenticated using (true);
create policy observations_insert on public.demand_observations for insert to authenticated
with check (public.current_app_role() in ('owner','admin','inventory_staff'));

create policy legacy_sales_select on public.legacy_sales for select to authenticated using (true);
create policy purchase_history_select on public.purchase_history for select to authenticated using (true);
create policy import_batches_select on public.import_batches for select to authenticated using (true);
create policy import_batches_write on public.import_batches for all to authenticated
using (public.current_app_role() in ('owner','admin'))
with check (public.current_app_role() in ('owner','admin'));

create policy forecast_runs_select on public.forecast_runs for select to authenticated using (true);
create policy demand_forecasts_select on public.demand_forecasts for select to authenticated using (true);
create policy supplier_email_logs_select on public.supplier_email_logs for select to authenticated
using (public.current_app_role() in ('owner','admin'));
create policy backup_logs_select on public.backup_logs for select to authenticated
using (public.current_app_role() in ('owner','admin'));
create policy audit_logs_select on public.audit_logs for select to authenticated
using (public.current_app_role() in ('owner','admin'));
create policy settings_select on public.system_settings for select to authenticated
using (public.current_app_role() in ('owner','admin'));
create policy settings_write on public.system_settings for all to authenticated
using (public.current_app_role()='owner')
with check (public.current_app_role()='owner');

create policy backup_objects_read on storage.objects for select to authenticated
using (bucket_id='partcast-backups' and public.current_app_role() in ('owner','admin'));
create policy model_objects_read on storage.objects for select to authenticated
using (bucket_id='partcast-models' and public.current_app_role() in ('owner','admin'));

revoke update on public.profiles from authenticated;
revoke update, delete on public.inventory_transactions from authenticated;
revoke update, delete on public.demand_observations from authenticated;
revoke insert, update, delete on public.audit_logs from authenticated;
revoke insert, update, delete on public.forecast_runs from authenticated;
revoke insert, update, delete on public.demand_forecasts from authenticated;
revoke insert, update, delete on public.backup_logs from authenticated;
revoke insert, update, delete on public.supplier_email_logs from authenticated;


revoke execute on function public.apply_inventory_transaction(uuid, public.inventory_tx_type, numeric, numeric, numeric, text, uuid, text, numeric, text, timestamptz) from public, anon;
grant execute on function public.apply_inventory_transaction(uuid, public.inventory_tx_type, numeric, numeric, numeric, text, uuid, text, numeric, text, timestamptz) to authenticated, service_role;

-- PartCast upgrade: allow the cleaned XGBoost training-ready spreadsheet to be imported
-- Run this after 0001_schema.sql and 0002_rls.sql on an existing deployment.

alter table public.demand_observations
  drop constraint if exists demand_observations_source_check;

alter table public.demand_observations
  add constraint demand_observations_source_check
  check (source in ('actual_sale', 'legacy_transaction_proxy', 'imported_training_data'));

alter table public.import_batches
  drop constraint if exists import_batches_import_type_check;

alter table public.import_batches
  add constraint import_batches_import_type_check
  check (import_type in ('inventory', 'legacy_sales', 'demand_training'));

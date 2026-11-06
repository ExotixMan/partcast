-- Read-only: one result row bundles the records needed for forecast validation.
-- Export the result as CSV, rather than copying the shortened JSON preview.
select jsonb_build_object(
  'exported_at', now(),
  'as_of_date_manila', (now() at time zone 'Asia/Manila')::date,
  'observation_count', (select count(*) from public.demand_observations),
  'observations', coalesce((
    select jsonb_agg(to_jsonb(observation)) from (
      select id, product_id, occurred_on, quantity, source, source_reference
      from public.demand_observations
      order by occurred_on, product_id, id
    ) observation
  ), '[]'::jsonb),
  'products', coalesce((
    select jsonb_agg(to_jsonb(product)) from (
      select p.id, p.part_number, p.description, p.active, p.current_stock
      from public.products p
      where exists (select 1 from public.demand_observations d where d.product_id = p.id)
      order by p.id
    ) product
  ), '[]'::jsonb),
  'recent_runs', coalesce((
    select jsonb_agg(to_jsonb(run)) from (
      select id, model_version, status, started_at, completed_at, horizon_days,
             training_rows, product_count, metrics
      from public.forecast_runs
      order by started_at desc
      limit 5
    ) run
  ), '[]'::jsonb)
) as forecast_review_export;

-- Read-only demo verification; no credentials required.
select value as demo_marker from public.system_settings where key='partcast_demo_environment';
select source,count(*) as records,count(distinct product_id) as parts from public.demand_observations group by source;
select count(*) as generated_daily_rows,min(occurred_on) as first_day,max(occurred_on) as last_day from public.partcast_demo_daily;
select status,training_rows,product_count,metrics->>'data_mode' as data_mode,metrics->'horizon_validation'->'model' as planning_errors from public.forecast_runs order by started_at desc limit 5;
select count(*) as upcoming_estimates from public.demand_forecasts where forecast_date>(now() at time zone 'Asia/Manila')::date;

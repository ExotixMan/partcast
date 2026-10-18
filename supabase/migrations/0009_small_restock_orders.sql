-- The owner buys 1–2 units per part per purchase, rather than the full forecast.
-- Apply after 0008. Changes a view only; no sales, forecasts or stock are edited.
begin;
create or replace view public.reorder_recommendations with (security_invoker = true) as
with latest as (
  select id, horizon_days from public.latest_completed_forecast_run
), predicted as (
  select f.product_id, sum(f.predicted_quantity) as predicted_quantity
  from public.demand_forecasts f
  join latest l on l.id=f.run_id
  where f.forecast_date > current_date
    and f.forecast_date <= current_date + l.horizon_days
  group by f.product_id
), primary_supplier as (
  select distinct on (ps.product_id)
    ps.product_id, s.id supplier_id, s.name supplier_name, s.email supplier_email,
    ps.latest_unit_cost, ps.lead_time_days
  from public.product_suppliers ps
  join public.suppliers s on s.id=ps.supplier_id and s.active
  order by ps.product_id, ps.is_primary desc, ps.updated_at desc
), needs as (
  select p.*,
    coalesce(pr.predicted_quantity,0) as predicted_quantity,
    least(2,greatest(
      ceil(greatest(coalesce(pr.predicted_quantity,0) + p.safety_stock,p.minimum_stock) - p.current_stock),
      case when p.current_stock <= p.minimum_stock then 1 else 0 end
    ))::numeric as purchase_quantity
  from public.products p
  left join predicted pr on pr.product_id=p.id
  where p.active
)
select
  p.id product_id,
  p.part_number,
  p.description,
  p.brand,
  p.current_stock,
  p.minimum_stock,
  p.safety_stock,
  p.predicted_quantity,
  p.purchase_quantity recommended_quantity,
  ps.supplier_id,
  ps.supplier_name,
  ps.supplier_email,
  coalesce(ps.latest_unit_cost,p.unit_cost) estimated_unit_cost,
  p.purchase_quantity * coalesce(ps.latest_unit_cost,p.unit_cost) estimated_order_cost,
  case
    when p.current_stock = 0 then 'out_of_stock'
    when p.current_stock <= p.minimum_stock then 'low_stock'
    when p.purchase_quantity > 0 then 'forecast_reorder'
    else 'ok'
  end as status,
  p.unit,
  p.category,
  p.location
from needs p
left join primary_supplier ps on ps.product_id=p.id;
notify pgrst,'reload schema';
commit;

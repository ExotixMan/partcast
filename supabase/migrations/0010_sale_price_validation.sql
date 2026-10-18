-- Run on the existing PartCast project. Preserves all stock, sales and balances.
-- Catalog prices may stay unset while the owner checks them; new sales need a price.
begin;
create or replace function public.check_sale_price() returns trigger
 language plpgsql set search_path=public as $$
begin
 if new.tx_type='sale' then
  if new.unit_price is null or new.unit_price::text in ('NaN','Infinity','-Infinity') or new.unit_price<=0 then
   raise exception 'Enter a selling price greater than zero for every part' using errcode='22023';
  end if;
 end if;
 return new;
end $$;
revoke all on function public.check_sale_price() from public,anon,authenticated;
drop trigger if exists inventory_sale_price_check on public.inventory_transactions;
create trigger inventory_sale_price_check
 before insert or update of tx_type,unit_price on public.inventory_transactions
 for each row execute function public.check_sale_price();
notify pgrst,'reload schema';
commit;

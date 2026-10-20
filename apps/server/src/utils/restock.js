
export const neededRestock = query => query.or('recommended_quantity.gt.0,status.in.(low_stock,out_of_stock)');
export function normalizeRestock(row) {
 const low=['low_stock','out_of_stock'].includes(row.status);
 const requested=Number(row.recommended_quantity);


 const quantity=Math.min(2,Math.max(Number.isFinite(requested)?Math.ceil(requested):0,low?1:0,0));
 const cost=Number(row.estimated_unit_cost);
 return {...row,recommended_quantity:quantity,estimated_order_cost:quantity*(Number.isFinite(cost)&&cost>=0?cost:0)};
}

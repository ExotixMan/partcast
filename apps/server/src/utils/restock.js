// Include threshold alerts even when an older database view suggests zero units.
export const neededRestock = query => query.or('recommended_quantity.gt.0,status.in.(low_stock,out_of_stock)');
export function normalizeRestock(row) {
 const low=['low_stock','out_of_stock'].includes(row.status);
 const quantity=Math.max(Number(row.recommended_quantity)||0,low?1:0);
 return {...row,recommended_quantity:quantity,estimated_order_cost:quantity*(Number(row.estimated_unit_cost)||0)};
}

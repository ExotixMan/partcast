// Also applies the purchase limit to recommendations cached before this release.
export function suggestedQuantity(row) {
 const requested=Number(row.recommended_quantity);
 const low=['low_stock','out_of_stock'].includes(row.status);
 return Math.min(2,Math.max(Number.isFinite(requested)?Math.ceil(requested):0,low?1:0,0));
}
export function suggestedCost(row) {
 const quantity=suggestedQuantity(row),price=Number(row.estimated_unit_cost);
 if(row.estimated_unit_cost!=null&&Number.isFinite(price)&&price>=0)return quantity*price;
 const previousQuantity=Number(row.recommended_quantity),previousCost=Number(row.estimated_order_cost);
 return previousQuantity>0&&Number.isFinite(previousQuantity)&&Number.isFinite(previousCost)&&previousCost>=0
  ? quantity*previousCost/previousQuantity : 0;
}

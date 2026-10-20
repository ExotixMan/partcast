import {adminDb} from '../supabase.js';
import {fetchAll} from './helpers.js';
import {normalizeRestock} from './restock.js';



export async function supplierParts(supplierId,productIds) {
 const links=await fetchAll(()=>{
  let query=adminDb.from('product_suppliers')
   .select('product_id,latest_unit_cost,supplier:suppliers!inner(id,name,email)')
   .eq('supplier_id',supplierId).eq('supplier.active',true).order('product_id');
  if(productIds)query=query.in('product_id',productIds);
  return query;
 });
 const byProduct=new Map(links.map(link=>[link.product_id,link]));
 const ids=[...byProduct.keys()],rows=[];

 for(let offset=0;offset<ids.length;offset+=200){
  const page=await fetchAll(()=>adminDb.from('reorder_recommendations').select('*')
   .in('product_id',ids.slice(offset,offset+200)).order('product_id'));
  for(const row of page){
   const link=byProduct.get(row.product_id);
   if(!link?.supplier)continue;
   rows.push(normalizeRestock({...row,supplier_id:link.supplier.id,
    supplier_name:link.supplier.name,supplier_email:link.supplier.email,
    estimated_unit_cost:link.latest_unit_cost??row.estimated_unit_cost}));
  }
 }
 return rows.sort((a,b)=>String(a.description).localeCompare(String(b.description))||a.product_id.localeCompare(b.product_id));
}

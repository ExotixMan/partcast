import {adminDb} from '../supabase.js';
import {fetchAll} from './helpers.js';
import {reportDates,dateQuery,category} from './storeValidation.js';
const columns=keys=>keys.map(([header,key])=>({header,key}));
export async function storeReport(type,query){
 const dates=reportDates(query),categoryFilter=query.category&&query.category!=='all'?category.parse(query.category):null;
 const tx=async(salesOnly=false)=>fetchAll(()=>{
 let q=adminDb.from('inventory_transactions').select('id,batch_id,occurred_at,tx_type,quantity,unit_price,unit_cost,reference_no,customer_name,total_amount,notes,product:products!inner(part_number,description,category),supplier:suppliers(name)');
 if(salesOnly)q=q.eq('tx_type','sale');if(categoryFilter)q=q.eq('products.category',categoryFilter);
 return dateQuery(q,dates).order('occurred_at',{ascending:false});
 });
 const flat=rows=>rows.map(r=>({...r,part_number:r.product?.part_number,description:r.product?.description,category:r.product?.category,supplier_name:r.supplier?.name}));
 const txCols=columns([['Date (UTC)','occurred_at'],['Type','tx_type'],['Part number','part_number'],['Description','description'],['Category','category'],['Quantity','quantity'],['Price per unit','unit_price'],['Cost per unit','unit_cost'],['Reference','reference_no'],['Customer','customer_name'],['Supplier','supplier_name'],['Amount','total_amount'],['Notes','notes'],['Basket ID','batch_id']]);
 const scope={name:'Report details',rows:[{label:'From (Philippines)',value:dates.from||'All dates'},{label:'Through (Philippines)',value:dates.to||'All dates'},{label:'Category',value:categoryFilter||'All categories'},{label:'Generated UTC',value:new Date().toISOString()},{label:'Inventory quantities',value:'Current stock; date filters apply to movement and sales sheets.'}],columns:columns([['Detail','label'],['Value','value']])};
 if(type==='inventory'){
 const rows=await fetchAll(()=>{let q=adminDb.from('products').select('part_number,description,brand,category,barcode,current_stock,minimum_stock,safety_stock,unit,location,unit_cost,selling_price').eq('active',true);if(categoryFilter)q=q.eq('category',categoryFilter);return q.order('description');});
 return [scope,{name:'Current inventory',rows,columns:columns([['Part number','part_number'],['Description','description'],['Brand','brand'],['Category','category'],['Barcode','barcode'],['Current stock','current_stock'],['Minimum stock','minimum_stock'],['Reserve stock','safety_stock'],['Unit','unit'],['Location','location'],['Unit cost','unit_cost'],['Selling price','selling_price']])},{name:'Stock changes in period',rows:flat(await tx()),columns:txCols}];
 }
 if(type==='transactions')return [scope,{name:'Transactions',rows:flat(await tx()),columns:txCols}];
 if(type==='sales'){
 const rows=flat(await tx(true));let totalCents=0;const daily=new Map();
 for(const r of rows){const amount=Number(r.total_amount??Number(r.quantity)*Number(r.unit_price||0));const cents=Math.round(amount*100);totalCents+=cents;const day=new Date(r.occurred_at).toLocaleDateString('en-CA',{timeZone:'Asia/Manila'});const d=daily.get(day)||{date:day,quantity:0,amount:0,lines:0};d.quantity=Math.round((d.quantity+Number(r.quantity))*100)/100;d.amount+=cents;d.lines++;daily.set(day,d);}
 return [scope,{name:'Sales total',rows:[{lines:rows.length,amount:totalCents/100}],columns:columns([['Sale lines','lines'],['Total sales (PHP)','amount']])},{name:'Daily sales',rows:[...daily.values()].sort((a,b)=>a.date.localeCompare(b.date)).map(d=>({...d,amount:d.amount/100})),columns:columns([['Date (Philippines)','date'],['Sale lines','lines'],['Quantity sold','quantity'],['Total sales (PHP)','amount']])},{name:'Sale details',rows,columns:txCols}];
 }
 if(type==='debts'){
 const rows=await fetchAll(()=>dateQuery(adminDb.from('customer_balances').select('*'),dates).order('customer_name'));
 return [scope,{name:'Customer utang',rows,columns:columns([['Customer','customer_name'],['Phone','phone'],['Date (UTC)','occurred_at'],['Due date','due_date'],['Original utang','principal'],['Payments','paid_amount'],['Remaining balance','balance'],['Status','status'],['Reference','reference_no'],['Notes','notes']])}];
 }
 if(type==='reorder'){
 const {data,error}=await adminDb.from('reorder_recommendations').select('*').gt('recommended_quantity',0).order('recommended_quantity',{ascending:false});if(error)throw error;
 return [scope,{name:'Restock suggestions',rows:data,columns:columns([['Part number','part_number'],['Description','description'],['Current stock','current_stock'],['Expected demand','predicted_quantity'],['Suggested quantity','recommended_quantity'],['Supplier','supplier_name'],['Supplier email','supplier_email'],['Estimated cost','estimated_order_cost']])}];
 }
 throw Object.assign(new Error('Unknown report type.'),{status:404});
}

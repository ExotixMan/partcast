import {test} from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
Object.assign(process.env,{SUPABASE_URL:'http://127.0.0.1:9',SUPABASE_ANON_KEY:'test-only-public-key-12345',SUPABASE_SERVICE_ROLE_KEY:'test-only-service-key-12345',SETUP_SECRET:'test-only-setup-secret',CRON_SECRET:'test-only-cron-secret-long-enough',IP_HASH_SECRET:'test-only-hash-secret'});
const {adminDb}=await import('../src/supabase.js');
const {storeReport}=await import('../src/utils/storeReports.js');
const {buildReportWorkbook}=await import('../src/utils/excel.js');
test('date-range sales workbook preserves exact totals and current inventory is labeled clearly',async()=>{
 const original=adminDb.from,queries=[];
 const product={part_number:'=FORMULA()',description:'Test part',category:'parts'};
 const records=[{occurred_at:'2026-09-30T15:59:59Z',tx_type:'sale',quantity:5,total_amount:100,product},{occurred_at:'2026-09-30T16:00:00Z',tx_type:'sale',quantity:1,total_amount:0.1,product},{occurred_at:'2026-10-10T15:59:59Z',tx_type:'sale',quantity:2,total_amount:0.2,product},{occurred_at:'2026-10-10T16:00:00Z',tx_type:'sale',quantity:5,total_amount:200,product}];
 adminDb.from=table=>{let rows=table==='products'?[{...product,current_stock:20,active:true}]:[...records];const calls=[];
 const builder={select(){return this;},eq(k,v){calls.push(['eq',k,v]);rows=rows.filter(r=>(k==='product.category'?r.product.category:r[k])===v);return this;},gte(k,v){calls.push(['gte',k,v]);rows=rows.filter(r=>Date.parse(r[k])>=Date.parse(v));return this;},lt(k,v){calls.push(['lt',k,v]);rows=rows.filter(r=>Date.parse(r[k])<Date.parse(v));return this;},order(){return this;},range(a,b){queries.push({table,calls});return Promise.resolve({data:rows.slice(a,b+1)});}};return builder;};
 try{
 const sheets=await storeReport('sales',{from:'2026-10-01',to:'2026-10-10',category:'parts'});assert.equal(sheets[1].rows[0].amount,0.3);assert.equal(sheets[1].rows[0].lines,2);assert.equal(sheets[2].rows.length,2);assert.deepEqual(sheets[2].rows.map(r=>r.date),['2026-10-01','2026-10-10']);
 const buffer=await buildReportWorkbook({title:'Test sales',sheets}),book=new ExcelJS.Workbook();await book.xlsx.load(buffer);
 assert.equal(book.getWorksheet('Sales total').getRow(2).getCell(2).value,0.3);assert.equal(book.getWorksheet('Sale details').getRow(2).getCell(3).value,'=FORMULA()');assert.equal(book.getWorksheet('Sale details').getRow(2).getCell(3).type,ExcelJS.ValueType.String);
 const inventory=await storeReport('inventory',{from:'2026-10-01',to:'2026-10-10',category:'parts'});assert.equal(inventory[1].name,'Current inventory');assert.equal(inventory[1].rows[0].current_stock,20);assert.equal(inventory[2].rows.length,2);assert.ok(queries.some(q=>q.calls.some(c=>c[0]==='eq'&&c[1]==='product.category')));
 }finally{adminDb.from=original;}
});

test('restock exports filter category, retain all pages and match the small purchase policy',async()=>{
 const previous=adminDb.from,ranges=[],orders=[];
 const rows=Array.from({length:1001},(_,i)=>({product_id:`part-${String(i).padStart(4,'0')}`,description:`Part ${i}`,category:'parts',current_stock:i===0?0:1,status:i===0?'out_of_stock':'low_stock',recommended_quantity:i===0?0:11,predicted_quantity:11,estimated_unit_cost:100}));
 rows.push({product_id:'lube',category:'lubricants',status:'low_stock',recommended_quantity:1},{product_id:'healthy',category:'parts',status:'ok',recommended_quantity:0});
 adminDb.from=table=>{
  assert.equal(table,'reorder_recommendations');let selected=[...rows];
  return {select(){return this;},or(value){assert.equal(value,'recommended_quantity.gt.0,status.in.(low_stock,out_of_stock)');selected=selected.filter(r=>r.recommended_quantity>0||['low_stock','out_of_stock'].includes(r.status));return this;},eq(key,value){selected=selected.filter(r=>r[key]===value);return this;},order(key){orders.push(key);return this;},range(from,to){ranges.push([from,to]);return Promise.resolve({data:selected.slice(from,to+1),error:null});}};
 };
 try{
  const sheets=await storeReport('reorder',{category:'parts',from:'2026-10-01',to:'2026-10-10'}),exported=sheets[1].rows;
  assert.equal(exported.length,1001);assert.deepEqual(ranges,[[0,999],[1000,1999]]);assert.equal(exported[0].recommended_quantity,1);assert.equal(exported[0].estimated_order_cost,100);
  assert.equal(exported.at(-1).recommended_quantity,2);assert.equal(exported.at(-1).estimated_order_cost,200);assert.equal(exported.at(-1).predicted_quantity,11);assert(exported.every(row=>row.category==='parts'));
  assert(orders.includes('product_id'));assert.match(sheets[0].rows.find(row=>row.label==='Restock suggestions').value,/Current stock/);assert.equal(rows[0].recommended_quantity,0);assert.equal(rows[1].recommended_quantity,11);
 }finally{adminDb.from=previous;}
});

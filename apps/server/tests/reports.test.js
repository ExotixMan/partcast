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
 const builder={select(){return this;},eq(k,v){calls.push(['eq',k,v]);rows=rows.filter(r=>(k==='products.category'?r.product.category:r[k])===v);return this;},gte(k,v){calls.push(['gte',k,v]);rows=rows.filter(r=>Date.parse(r[k])>=Date.parse(v));return this;},lt(k,v){calls.push(['lt',k,v]);rows=rows.filter(r=>Date.parse(r[k])<Date.parse(v));return this;},order(){return this;},range(a,b){queries.push({table,calls});return Promise.resolve({data:rows.slice(a,b+1)});}};return builder;};
 try{
 const sheets=await storeReport('sales',{from:'2026-10-01',to:'2026-10-10',category:'parts'});assert.equal(sheets[1].rows[0].amount,0.3);assert.equal(sheets[1].rows[0].lines,2);assert.equal(sheets[2].rows.length,2);assert.deepEqual(sheets[2].rows.map(r=>r.date),['2026-10-01','2026-10-10']);
 const buffer=await buildReportWorkbook({title:'Test sales',sheets}),book=new ExcelJS.Workbook();await book.xlsx.load(buffer);
 assert.equal(book.getWorksheet('Sales total').getRow(2).getCell(2).value,0.3);assert.equal(book.getWorksheet('Sale details').getRow(2).getCell(3).value,'=FORMULA()');assert.equal(book.getWorksheet('Sale details').getRow(2).getCell(3).type,ExcelJS.ValueType.String);
 const inventory=await storeReport('inventory',{from:'2026-10-01',to:'2026-10-10',category:'parts'});assert.equal(inventory[1].name,'Current inventory');assert.equal(inventory[1].rows[0].current_stock,20);assert.equal(inventory[2].rows.length,2);assert.ok(queries.some(q=>q.calls.some(c=>c[0]==='eq'&&c[1]==='products.category')));
 }finally{adminDb.from=original;}
});

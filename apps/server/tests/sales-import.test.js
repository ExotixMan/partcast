import {test} from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
Object.assign(process.env,{SUPABASE_URL:'http://127.0.0.1:9',SUPABASE_ANON_KEY:'test-only-public-key-12345',SUPABASE_SERVICE_ROLE_KEY:'test-only-service-key-12345',SETUP_SECRET:'test-only-setup-secret',CRON_SECRET:'test-only-cron-secret-long-enough',IP_HASH_SECRET:'test-only-hash-secret',INTEGRATION_ENCRYPTION_KEY:'test-only-encryption-key-32-characters'});
const {adminDb}=await import('../src/supabase.js');
const {importSpreadsheetAuto}=await import('../src/services/importers.js');
const part='33333333-3333-4333-8333-333333333333';
const invoice=i=>({reference_no:`SI#${i}`,sale_date:'2026-01-05',amount:100,raw_items:'BP-001 Brake pad'});
async function workbook(count,{duplicate=false,cancelled=false,note=''}={}) {
 const book=new ExcelJS.Workbook(),sheet=book.addWorksheet('Sales');
 sheet.addRow(['Reference','Date','Customer','Amount','Items']);
 const row=i=>{const r=invoice(i);return [r.reference_no,r.sale_date,'',r.amount,r.raw_items];};
 for(let i=1;i<=count;i++)sheet.addRow(row(i));
 if(duplicate)sheet.addRow(row(1));
 if(cancelled)sheet.addRow(['CANCEL-1','2026-01-05','CANCELLED',100,'BP-001']);
 if(note)book.addWorksheet('Notes').addRow(['Note',note]);
 return Buffer.from(await book.xlsx.writeBuffer());
}
function database(existing=[]) {
 const state={records:structuredClone(existing),products:[{id:part,part_number:'BP-001'}],batches:[],writes:[],proxies:[],calls:0,failCall:0};
 adminDb.from=table=>{
  assert(['products','legacy_sales','import_batches','demand_observations'].includes(table));
  let action='read',payload;const filters=[];
  const result=()=>{
   if(table==='import_batches'){
    if(action==='insert'){const batch={...payload,id:`batch-${state.batches.length+1}`,status:'started'};state.batches.push(batch);return {data:batch,error:null};}
    if(action==='update'){for(const row of state.batches.filter(row=>filters.every(([k,v])=>row[k]===v)))Object.assign(row,payload);}
    return {data:state.batches.filter(row=>filters.every(([k,v])=>row[k]===v)),error:null};
   }
   if(table==='legacy_sales'&&action==='insert'){
    state.calls++;if(state.calls===state.failCall)return {data:null,error:new Error('Fixture network failure')};
    assert(Array.isArray(payload));assert(payload.length<=500);
    state.writes.push(payload.length);state.records.push(...structuredClone(payload));return {data:null,error:null};
   }
   if(table==='demand_observations'&&action==='insert'){state.proxies.push(...payload);return {data:null,error:null};}
   throw new Error('Unexpected query '+table+' '+action);
  };
  return {
   select(){return this;},eq(k,v){filters.push([k,v]);return this;},not(){return this;},limit(){return this;},
   range:async(from,to)=>({data:(table==='products'?state.products:state.records).slice(from,to+1),error:null}),
   insert(v){action='insert';payload=v;return this;},update(v){action='update';payload=v;return this;},
   single:async()=>result(),then(resolve,reject){try{return Promise.resolve(result()).then(resolve,reject);}catch(error){return Promise.reject(error).then(resolve,reject);}}
  };
 };
 return state;
}
test('large invoice imports batch writes, preserve conflicts and skip repeated invoices without creating demand',async()=>{
 const original=adminDb.from;
 try {
  const state=database([invoice(1),{...invoice(2),amount:99}]);
  const result=await importSpreadsheetAuto(await workbook(1203,{duplicate:true,cancelled:true}),'sales.xlsx','fixture-owner','legacy-sales');
  assert.equal(result.rowsRead,1205);assert.equal(result.rowsImported,1201);assert.equal(result.rowsSkipped,4);
  assert.deepEqual(state.writes,[500,500,201]);assert.equal(state.records.length,1203);assert.equal(state.proxies.length,0);
  assert.equal(state.records.find(r=>r.reference_no==='SI#2').amount,99);
  assert(result.warnings.some(w=>/different details/.test(w)));
  const before=JSON.stringify(state.records);
  const repeated=await importSpreadsheetAuto(await workbook(1203,{duplicate:true,cancelled:true,note:'Different file, same invoices'}),'copy.xlsx','fixture-owner','legacy-sales');
  assert.equal(repeated.rowsImported,0);assert.equal(JSON.stringify(state.records),before);assert.equal(state.proxies.length,0);
 }finally{adminDb.from=original;}
});
test('an interrupted invoice import can resume without inserting the saved first batch again',async()=>{
 const original=adminDb.from;
 try {
  const state=database();state.failCall=2;
  const bytes=await workbook(501);
  await assert.rejects(importSpreadsheetAuto(bytes,'sales.xlsx','fixture-owner','legacy-sales'),/Fixture network failure/);
  assert.equal(state.records.length,500);assert.equal(state.batches[0].status,'failed');
  state.failCall=0;
  const result=await importSpreadsheetAuto(bytes,'sales.xlsx','fixture-owner','legacy-sales');
  assert.equal(result.rowsImported,1);assert.equal(result.rowsSkipped,500);assert.equal(state.records.length,501);
  assert.equal(state.proxies.length,0);assert.equal(state.batches[1].status,'completed');
 }finally{adminDb.from=original;}
});
test('transaction-count proxies remain explicitly optional and separate from actual sold quantities',async()=>{
 const original=adminDb.from;
 try {
  const state=database();
  const result=await importSpreadsheetAuto(await workbook(1),'sales.xlsx','fixture-owner','legacy-sales',true);
  assert.equal(result.proxyObservations,1);assert.equal(state.proxies.length,1);
  assert.equal(state.proxies[0].source,'legacy_transaction_proxy');assert.equal(state.proxies[0].quantity,1);
 }finally{adminDb.from=original;}
});

test('invoice links require one complete identified code, excluding partial codes, model labels and multi-part bills',async()=>{
 const original=adminDb.from;
 try {
  const state=database();state.products.push({id:'oil-fixture',part_number:'OIL-001'},{id:'model-fixture',part_number:'VIOS'});
  const book=new ExcelJS.Workbook(),sheet=book.addWorksheet('Sales');
  sheet.addRow(['Reference','Date','Customer','Amount','Items']);
  for(const [i,items] of ['BP-001 Brake pad','BP-001 / OIL-001','BP-0012 Brake pad','Lug nut VIOS','A-BP-001','OIL-001 Engine oil','BP-001/OIL-001','BP-001/7','BP-001 /OIL-001'].entries())sheet.addRow([`SI#${i+1}`,'2026-01-05','',100,items]);
  await importSpreadsheetAuto(Buffer.from(await book.xlsx.writeBuffer()),'links.xlsx','fixture-owner','legacy-sales');
  assert.deepEqual(state.records.map(row=>row.matched_product_id),[part,null,null,null,null,'oil-fixture',null,null,null]);
  assert.equal(state.proxies.length,0);
 }finally{adminDb.from=original;}
});

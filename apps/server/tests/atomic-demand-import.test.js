import {test} from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import {demandImportDate,demandImportCents} from '../src/utils/demandImport.js';
Object.assign(process.env,{SUPABASE_URL:'http://127.0.0.1:9',SUPABASE_ANON_KEY:'test-only-public-key-12345',SUPABASE_SERVICE_ROLE_KEY:'test-only-service-key-12345',SETUP_SECRET:'test-only-setup-secret',CRON_SECRET:'test-only-cron-secret-long-enough',IP_HASH_SECRET:'test-only-hash-secret',INTEGRATION_ENCRYPTION_KEY:'test-only-encryption-key-32-characters'});
const {adminDb}=await import('../src/supabase.js');
const {importSpreadsheetAuto}=await import('../src/services/importers.js');
const owner='11111111-1111-4111-8111-111111111111',part='33333333-3333-4333-8333-333333333333';
const bytes=async rows=>{const book=new ExcelJS.Workbook();book.addWorksheet('Daily_B_Usable').addRows([['Date','Part Number','Demand Quantity'],...rows]);return Buffer.from(await book.xlsx.writeBuffer());};

test('strict import dates and quantities reject ambiguous dates, rollover dates, booleans and silent rounding',()=>{
 for(const value of ['2026-02-30','01/02/2026',true,'not a date'])assert.equal(demandImportDate(value),null);
 assert.equal(demandImportDate('2024-02-29'),'2024-02-29');assert.equal(demandImportDate(new Date('2020-01-01T00:00:00Z')),'2020-01-01');
 for(const value of [true,-1,'1.001','NaN','Infinity','0x10','',null,1e13])assert.equal(demandImportCents(value),null);
 assert.equal(demandImportCents('0.01'),1);assert.equal(demandImportCents('2.30'),230);assert.equal(demandImportCents(0),0);
});

test('forecast import validates all rows, binds the review and saves only through the atomic RPC',async t=>{
 const old={from:adminDb.from,rpc:adminDb.rpc};let products=[{id:part,part_number:'TEST-001',description:'Fixture part'}],rpcCalls=[],rpcFailure=null;
 adminDb.from=table=>{assert.equal(table,'products');return {select(){return this;},eq(){return this;},order(){return this;},range(){return this;},then(resolve,reject){return Promise.resolve({data:products,error:null}).then(resolve,reject);}};};
 adminDb.rpc=async(name,args)=>{rpcCalls.push({name,args});if(rpcFailure)return {error:rpcFailure};return {data:name==='demand_import_snapshot'?{row_count:37272,actual_rows:34,fingerprint:'a'.repeat(64)}:{batchId:args.p_request_id,rowsImported:args.p_rows.length,rowsRead:args.p_rows_read,rowsSkipped:args.p_zero_rows,matchedProducts:1,alreadyImported:false}};};
 const run=(file,options={},actor=owner)=>importSpreadsheetAuto(file,'history.xlsx',actor,'demand-training',false,options);
 try{
  await t.test('review does not change records, quantities are combined exactly and zero days are reported',async()=>{
   rpcCalls=[];const file=await bytes([['2020-01-01','TEST-001',2],['2020-01-01','TEST-001',3],['2020-01-02','TEST-001',0]]);
   const review=await run(file,{preview:true});assert.equal(review.rowsImported,1);assert.equal(review.rowsSkipped,1);assert.equal(review.existingImportedRows,37272);
   assert.deepEqual(rpcCalls.map(r=>r.name),['demand_import_snapshot']);
   const result=await run(file,{previewToken:review.previewToken});assert.equal(result.rowsImported,1);
   assert.equal(rpcCalls[1].name,'replace_imported_demand');assert.deepEqual(rpcCalls[1].args.p_rows,[{product_id:part,part_number:'TEST-001',occurred_on:'2020-01-01',quantity:'5.00'}]);
  });
  await t.test('one malformed or unmatched row rejects the entire replacement before the preview RPC',async()=>{
   for(const bad of [['2020-02-30','TEST-001',2],['2099-01-01','TEST-001',2],['2020-01-01','MISSING',2],['2020-01-01','TEST-001',1.001],['2020-01-01','TEST-001',true]]){
    rpcCalls=[];await assert.rejects(run(await bytes([['2020-01-01','TEST-001',1],bad]),{preview:true}),error=>error.code==='IMPORT_VALIDATION_FAILED'&&/Row 3/.test(error.message));assert.equal(rpcCalls.length,0);
   }
  });
  await t.test('ambiguous inventory codes and an all-zero file cannot replace history',async()=>{
   rpcCalls=[];products.push({id:'44444444-4444-4444-8444-444444444444',part_number:'test-001'});
   await assert.rejects(run(await bytes([['2020-01-01','TEST-001',1]]),{preview:true}),/more than one/);products.pop();
   await assert.rejects(run(await bytes([['2020-01-01','TEST-001',0]]),{preview:true}),/No positive/);assert.equal(rpcCalls.length,0);
  });
  await t.test('commit requires an untampered review for the same actor and exact file',async()=>{
   const file=await bytes([['2020-01-01','TEST-001',2]]),review=await run(file,{preview:true});rpcCalls=[];
   await assert.rejects(run(file),error=>error.code==='IMPORT_REVIEW_REQUIRED');
   await assert.rejects(run(file,{previewToken:review.previewToken+'x'}),error=>error.code==='IMPORT_REVIEW_REQUIRED');
   await assert.rejects(run(file,{previewToken:review.previewToken},part),error=>error.code==='IMPORT_REVIEW_REQUIRED');
   await assert.rejects(run(await bytes([['2020-01-01','TEST-001',3]]),{previewToken:review.previewToken}),error=>error.code==='IMPORT_REVIEW_REQUIRED');assert.equal(rpcCalls.length,0);
  });
  await t.test('missing migration fails closed and stale reviews expose a specific conflict',async()=>{
   const file=await bytes([['2020-01-01','TEST-001',2]]);
   rpcFailure={code:'PGRST202'};await assert.rejects(run(file,{preview:true}),error=>error.code==='IMPORT_SETUP_REQUIRED'&&error.status===503);
   rpcFailure=null;const review=await run(file,{preview:true});
   rpcFailure={code:'PT409',message:'IMPORT_HISTORY_CHANGED'};await assert.rejects(run(file,{previewToken:review.previewToken}),error=>error.code==='IMPORT_HISTORY_CHANGED'&&error.status===409);
   rpcFailure={code:'55P03'};await assert.rejects(run(file,{previewToken:review.previewToken}),error=>error.code==='IMPORT_BUSY');rpcFailure=null;
  });
  await t.test('retry after an unknown response reuses the same request ID',async()=>{
   const file=await bytes([['2020-01-01','TEST-001',2]]),review=await run(file,{preview:true});rpcCalls=[];
   rpcFailure={code:'NETWORK_ERROR'};await assert.rejects(run(file,{previewToken:review.previewToken}),error=>error.code==='IMPORT_UNCONFIRMED');
   rpcFailure=null;await run(file,{previewToken:review.previewToken});assert.equal(rpcCalls[0].args.p_request_id,rpcCalls[1].args.p_request_id);
  });
 }finally{adminDb.from=old.from;adminDb.rpc=old.rpc;}
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
Object.assign(process.env,{SUPABASE_URL:'http://127.0.0.1:9',SUPABASE_ANON_KEY:'test-only-public-key-12345',SUPABASE_SERVICE_ROLE_KEY:'test-only-service-key-12345',SETUP_SECRET:'test-only-setup-secret',CRON_SECRET:'test-only-cron-secret-long-enough',IP_HASH_SECRET:'test-only-hash-secret',INTEGRATION_ENCRYPTION_KEY:'test-only-encryption-key-32-characters'});
const {default:express}=await import('express');
const {adminDb}=await import('../src/supabase.js');
const {authenticate}=await import('../src/middleware/auth.js');
const {default:router}=await import('../src/routes/api.js');
const {errorHandler}=await import('../src/middleware/error.js');
const owner='11111111-1111-4111-8111-111111111111',session='77777777-7777-4777-8777-777777777777',part='33333333-3333-4333-8333-333333333333';
const token='e30.'+Buffer.from(JSON.stringify({session_id:session,amr:[{method:'password'}]})).toString('base64url')+'.fixture';

test('HTTP history review never writes and commits require verified manager access plus a bound review',async()=>{
 const old={from:adminDb.from,rpc:adminDb.rpc,auth:adminDb.auth.getUser};
 let role='owner',verified=true,rpcError=null;const calls=[],writes=[];
 adminDb.auth.getUser=async()=>({data:{user:{id:owner,email:'owner@example.test'}}});
 adminDb.from=table=>{
  assert(['profiles','login_verifications','products','audit_logs'].includes(table),'History must never be deleted or inserted through REST');
  return {select(){return this;},eq(){return this;},order(){return this;},range(){return this;},insert(value){assert.equal(table,'audit_logs');writes.push(value);return Promise.resolve({error:null});},
   single:async()=>({data:{id:owner,role,active:true},error:null}),maybeSingle:async()=>({data:verified?{expires_at:'2099-01-01T00:00:00Z'}:null,error:null}),
   then(resolve,reject){return Promise.resolve({data:[{id:part,part_number:'TEST-001',description:'Fixture part'}],error:null}).then(resolve,reject);}};
 };
 adminDb.rpc=async(name,args)=>{
  calls.push({name,args});if(rpcError)return {error:rpcError};
  return {data:name==='demand_import_snapshot'?{row_count:701,actual_rows:34,fingerprint:'a'.repeat(64)}:{batchId:args.p_request_id,rowsImported:args.p_rows.length,rowsRead:args.p_rows_read,rowsSkipped:args.p_zero_rows,alreadyImported:false},error:null};
 };
 const app=express();app.use(express.json());app.use('/api',authenticate,router);app.use(errorHandler);
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.on('listening',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 const upload=async(path,proof=null,authenticated=true)=>{
  const data=new FormData();data.append('file',new Blob(['Date,Part Number,Demand Quantity\n2020-01-01,TEST-001,2\n']),'history.csv');data.append('kind','demand-training');if(proof)data.append('previewToken',proof);
  return fetch(base+path,{method:'POST',headers:authenticated?{Authorization:'Bearer '+token}:{},body:data});
 };
 try{
  assert.equal((await upload('/api/imports/spreadsheet/preview',null,false)).status,401);
  role='cashier';assert.equal((await upload('/api/imports/spreadsheet/preview')).status,403);role='owner';
  verified=false;assert.equal((await upload('/api/imports/spreadsheet/preview')).status,428);verified=true;
  assert.equal(calls.length,0);assert.equal(writes.length,0);
  const response=await upload('/api/imports/spreadsheet/preview');assert.equal(response.status,200);const review=await response.json();
  assert.equal(review.requiresConfirmation,true);assert.deepEqual(calls.map(r=>r.name),['demand_import_snapshot']);assert.equal(writes.length,0);
  const rejected=await upload('/api/imports/spreadsheet');assert.equal(rejected.status,409);assert.equal((await rejected.json()).code,'IMPORT_REVIEW_REQUIRED');assert.equal(calls.length,1);
  const saved=await upload('/api/imports/spreadsheet',review.previewToken);assert.equal(saved.status,200);assert.equal((await saved.json()).rowsImported,1);assert.equal(calls.at(-1).name,'replace_imported_demand');assert.equal(writes.length,1);
  rpcError={code:'55P03'};const busy=await upload('/api/imports/demand-training',review.previewToken);assert.equal(busy.status,409);assert.equal((await busy.json()).code,'IMPORT_BUSY');assert.equal(writes.length,1);
 }finally{adminDb.from=old.from;adminDb.rpc=old.rpc;adminDb.auth.getUser=old.auth;await new Promise(resolve=>server.close(resolve));}
});

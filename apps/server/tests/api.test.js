import {test} from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';

// Test-only configuration. All database/auth calls exercised below are stubbed.
Object.assign(process.env,{SUPABASE_URL:'http://127.0.0.1:9',SUPABASE_ANON_KEY:'test-only-public-key-12345',SUPABASE_SERVICE_ROLE_KEY:'test-only-service-key-12345',SETUP_SECRET:'test-only-setup-secret',CRON_SECRET:'test-only-cron-secret-long-enough',IP_HASH_SECRET:'test-only-hash-secret'});
const {adminDb}=await import('../src/supabase.js');
const {authenticate}=await import('../src/middleware/auth.js');
const {default:router}=await import('../src/routes/api.js');
const {default:express}=await import('express');
const {errorHandler}=await import('../src/middleware/error.js');
const {detectSpreadsheetType}=await import('../src/services/importers.js');

test('HTTP authentication and profile response exclude bearer credentials',async()=>{
 const oldAuth=adminDb.auth.getUser,oldFrom=adminDb.from;
 let active=true;
 adminDb.auth.getUser=async token=>token==='valid-test-session'?{data:{user:{id:'11111111-1111-4111-8111-111111111111',email:'staff@example.test'}}}:{data:{user:null},error:new Error('Invalid session')};
 adminDb.from=()=>({select(){return this;},eq(){return this;},single:async()=>({data:{id:'11111111-1111-4111-8111-111111111111',active,role:'inventory_staff',full_name:'Staff'}})});
 const app=express();app.use(express.json());app.use('/api',authenticate,router);app.use(errorHandler);
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.on('listening',resolve));
 const url=`http://127.0.0.1:${server.address().port}`;
 try{
  assert.equal((await fetch(url+'/api/me')).status,401);
  assert.equal((await fetch(url+'/api/me',{headers:{Authorization:'Bearer invalid'}})).status,401);
  const headers={Authorization:'Bearer valid-test-session'};
  const response=await fetch(url+'/api/me',{headers});assert.equal(response.status,200);
  const profile=await response.json();assert.equal(profile.user.accessToken,undefined);assert.equal(profile.user.active,true);
  assert.equal((await fetch(url+'/api/imports',{headers})).status,403);
  active=false;assert.equal((await fetch(url+'/api/me',{headers})).status,403);
 }finally{adminDb.auth.getUser=oldAuth;adminDb.from=oldFrom;await new Promise(resolve=>server.close(resolve));}
});
test('spreadsheet detection is based on headers, preserving all three import types',async()=>{
 for(const [headers,expected] of [
  [['Part Number','Description','Quantity'],'inventory'],
  [['Ref #','Date','Customer Name','Amount','Items'],'legacy-sales'],
  [['Date','Part Number','Demand Quantity','Tier'],'demand-training']
 ]){
  const w=new ExcelJS.Workbook();w.addWorksheet('Any sheet name').addRow(headers);
  assert.equal(await detectSpreadsheetType(Buffer.from(await w.xlsx.writeBuffer()),'any-name.xlsx'),expected);
 }
});

test('HTTP basket and customer routes validate before RPC and pass the staff token',async()=>{
 const previous={auth:adminDb.auth.getUser,from:adminDb.from,fetch:globalThis.fetch};
 const requests=[];let active=true;
 adminDb.auth.getUser=async()=>({data:{user:{id:'11111111-1111-4111-8111-111111111111',email:'staff@example.test'}}});
 adminDb.from=table=>({select(){return this;},eq(){return this;},single:async()=>({data:{id:'11111111-1111-4111-8111-111111111111',active,role:'inventory_staff'}}),insert:async()=>({data:null,error:null})});
 globalThis.fetch=async(url,options)=>{
  if(String(url).startsWith('http://127.0.0.1:9/rest/v1/rpc/sync_store_operation')){requests.push({body:JSON.parse(options.body),authorization:new Headers(options.headers).get('authorization')});return new Response(JSON.stringify({balance:50}),{status:200,headers:{'content-type':'application/json'}});}
  return previous.fetch(url,options);
 };
 const app=express();app.use(express.json());app.use('/api',authenticate,router);app.use(errorHandler);
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.on('listening',resolve));
 const url=`http://127.0.0.1:${server.address().port}`,headers={Authorization:'Bearer staff-test-session','content-type':'application/json'};
 const post=(path,body)=>fetch(url+path,{method:'POST',headers,body:JSON.stringify(body)});
 const op='44444444-4444-4444-8444-444444444444',product='33333333-3333-4333-8333-333333333333';
 try{
  const batch={client_operation_id:op,tx_type:'sale',lines:[{product_id:product,quantity:1,unit_price:100}],is_credit:true,customer_name:'Sample Customer',paid_amount:50};
  for(const quantity of [true,0,0.001])assert.equal((await post('/api/inventory/batch',{...batch,lines:[{...batch.lines[0],quantity}]})).status,400);
  assert.equal((await post('/api/inventory/batch',{...batch,paid_amount:101})).status,400);
  assert.equal((await post('/api/debts/payment',{client_operation_id:op,debt_id:product,amount:0})).status,400);
  assert.equal(requests.length,0);
  assert.equal((await post('/api/inventory/batch',batch)).status,201);
  assert.equal(requests[0].body.p_operation_id,op);assert.equal(requests[0].body.p_payload.kind,'batch');assert.equal(requests[0].body.p_payload.client_operation_id,undefined);assert.equal(requests[0].authorization,'Bearer staff-test-session');
  assert.equal((await post('/api/debts',{client_operation_id:op,customer_name:'Sample Customer',principal:50,due_date:'2020-01-01'})).status,201);assert.equal(requests[1].body.p_payload.kind,'debt');
  assert.equal((await post('/api/debts/payment',{client_operation_id:op,debt_id:product,amount:25})).status,201);assert.equal(requests[2].body.p_payload.kind,'payment');
  active=false;assert.equal((await post('/api/inventory/batch',batch)).status,403);assert.equal(requests.length,3);
 }finally{globalThis.fetch=previous.fetch;adminDb.auth.getUser=previous.auth;adminDb.from=previous.from;await new Promise(resolve=>server.close(resolve));}
});

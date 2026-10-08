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

import {test} from 'node:test';
import assert from 'node:assert/strict';
Object.assign(process.env,{SUPABASE_URL:'http://127.0.0.1:9',SUPABASE_ANON_KEY:'test-only-public-key-12345',SUPABASE_SERVICE_ROLE_KEY:'test-only-service-key-12345',SETUP_SECRET:'test-only-setup-secret',CRON_SECRET:'test-only-cron-secret-long-enough',IP_HASH_SECRET:'test-only-hash-secret'});
const {adminDb}=await import('../src/supabase.js');

test('customer payment history returns every page and invalid debt IDs stop before reads',async()=>{
 const {default:express}=await import('express'),{default:router}=await import('../src/routes/store.js'),{errorHandler}=await import('../src/middleware/error.js');
 const previous=adminDb.from,ranges=[],orders=[],debtId='33333333-3333-4333-8333-333333333333';let reads=0;
 const rows=Array.from({length:1001},(_,i)=>({id:`payment-${i}`,debt_id:debtId,amount:1,paid_at:'2026-10-01T00:00:00Z'}));
 adminDb.from=table=>{
  reads++;assert.equal(table,'debt_payments');
  return {select(){return this;},eq(key,value){assert.equal(key,'debt_id');assert.equal(value,debtId);return this;},order(key){orders.push(key);return this;},range(from,to){ranges.push([from,to]);return Promise.resolve({data:rows.slice(from,to+1),error:null});}};
 };
 const app=express();app.use((req,res,next)=>{req.user={role:'owner'};next();});app.use('/api',router);app.use(errorHandler);
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.on('listening',resolve));
 try{
  const base=`http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(base+'/api/debts/invalid/payments')).status,400);assert.equal(reads,0);
  const response=await fetch(base+`/api/debts/${debtId}/payments`);assert.equal(response.status,200);const body=await response.json();assert.equal(body.data.length,1001);assert.equal(body.data.at(-1).id,'payment-1000');assert.deepEqual(ranges,[[0,999],[1000,1999]]);assert(orders.includes('id'));
 }finally{adminDb.from=previous;await new Promise(resolve=>server.close(resolve));}
});
